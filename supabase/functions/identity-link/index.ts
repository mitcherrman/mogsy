// ---------------------------------------------------------------------------
// identity-link — Mogzy Account Connections (Discord + Riot RSO).
//
// Linking proves OWNERSHIP of an external account and attaches it to the
// existing Mogzy account. It is never an alternative login: nothing in this
// file mints, refreshes, swaps or reads a Supabase session beyond verifying
// the caller's bearer token. The Mogzy account stays primary.
//
// THE CEREMONY IS THREE-LEGGED, AND THAT IS THE POINT
//
//   start    (POST, authenticated)  → records an attempt, returns authorize URL
//   callback (GET,  unauthenticated) → proves ownership, parks a PENDING identity
//   redeem   (POST, authenticated)  → commits the link
//
// The middle leg is unauthenticated because Discord and Riot redirect a
// browser to us and will not carry a Mogzy JWT. The previous implementation
// therefore wrote the verified identity there, trusting only the user id baked
// into the signed OAuth state. That was exploitable: an attacker could mint a
// state for their OWN account, hand the authorize URL to a victim, and the
// victim's Discord approval would bind the VICTIM's Discord identity to the
// ATTACKER's Mogzy account — permanently, since (provider, provider_user_id)
// is unique.
//
// So the callback now writes only a short-lived, single-use PENDING row and
// hands back an opaque ticket. The link is committed by `redeem`, which
// requires a live permanent Mogzy session whose user id matches the pending
// row. A signed state alone can no longer create or update an identity.
//
// TOKEN HANDLING (v1)
// Provider access and refresh tokens are used once, in this function, for the
// identity lookup and then discarded with the request scope. They are never
// returned to the browser, never written to any table, and never logged. Riot's
// documented RSO authorization request includes `offline_access`; we follow
// Riot's documented flow, and simply do not retain what it returns.
//
// verify_jwt is false for this function (see supabase/config.toml) because the
// provider redirect carries no JWT. Every action that needs an account
// authenticates the bearer token explicitly, right here.
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  allowedOrigin,
  buildAuthorizeUrl,
  buildReturnUrl,
  corsHeadersFor,
  generateTicket,
  hashTicket,
  isProvider,
  providerAvailableFrom,
  providerConfigFrom,
  resolveAllowedOrigins,
  safeReturnPath,
  signState,
  verifyState,
  type EnvLookup,
  type Provider,
  type ProviderConfig,
} from "./security.ts";

const ATTEMPT_TTL_MS = 10 * 60 * 1000; // OAuth round trip, including consent.
const PENDING_TTL_MS = 5 * 60 * 1000; // Redirect back to /settings and redeem.

// --- configuration (fail closed) -------------------------------------------

const env: EnvLookup = (key) => Deno.env.get(key);

function providerConfig(provider: Provider): ProviderConfig | null {
  return providerConfigFrom(env, provider);
}

/**
 * REQUIRED. There is deliberately no fallback to SUPABASE_SERVICE_ROLE_KEY:
 * the service-role key is the highest-value credential in the project and must
 * not double as an HMAC signing key. Without this secret, linking fails closed.
 */
function stateSecret(): string {
  return Deno.env.get("IDENTITY_LINK_STATE_SECRET") ?? "";
}

function allowedOrigins(): string[] {
  return resolveAllowedOrigins(Deno.env.get("IDENTITY_LINK_ALLOWED_ORIGINS"));
}

/** A provider is offered only when it can actually complete a link. */
function providerAvailable(provider: Provider): boolean {
  return providerAvailableFrom(env, provider);
}

const RIOT_AUTH_BASE = Deno.env.get("RIOT_RSO_AUTH_BASE") ?? "https://auth.riotgames.com";
const RIOT_ACCOUNT_BASE =
  Deno.env.get("RIOT_RSO_ACCOUNT_BASE") ?? "https://americas.api.riotgames.com";

// --- clients ---------------------------------------------------------------

const adminClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** RLS-scoped client for ordinary reads and deletes the caller owns. */
const callerClient = (authHeader: string) =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

// --- provider identity lookups ---------------------------------------------

interface VerifiedIdentity {
  providerUserId: string;
  username: string | null;
  displayName: string | null;
  tagLine: string | null;
  avatarUrl: string | null;
}

async function exchangeDiscord(code: string, cfg: ProviderConfig): Promise<VerifiedIdentity> {
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error("exchange_failed");
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("exchange_failed");

  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) throw new Error("lookup_failed");
  const me = (await meRes.json()) as {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  if (!me.id) throw new Error("lookup_failed");
  return {
    providerUserId: me.id,
    username: me.username ?? null,
    displayName: me.global_name ?? null,
    tagLine: null,
    avatarUrl: me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
      : null,
  };
}

async function exchangeRiot(code: string, cfg: ProviderConfig): Promise<VerifiedIdentity> {
  const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  const tokenRes = await fetch(`${RIOT_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error("exchange_failed");
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("exchange_failed");

  // RSO-authenticated account identity. A Riot ID typed by a user, or looked
  // up through a public endpoint, proves nothing and is never accepted here.
  const meRes = await fetch(`${RIOT_ACCOUNT_BASE}/riot/account/v1/accounts/me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) throw new Error("lookup_failed");
  const me = (await meRes.json()) as { puuid?: string; gameName?: string; tagLine?: string };
  if (!me.puuid) throw new Error("lookup_failed");
  return {
    providerUserId: me.puuid,
    username: me.gameName ?? null,
    displayName: null,
    tagLine: me.tagLine ?? null,
    avatarUrl: null,
  };
}

// --- request helpers -------------------------------------------------------

const jsonWith = (cors: Record<string, string>) =>
  (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

/** Resolves the caller, refusing anonymous guests: linking needs a real account. */
async function requirePermanentUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "unauthorized" as const };
  const { data } = await callerClient(authHeader).auth.getUser();
  const user = data?.user;
  if (!user) return { error: "unauthorized" as const };
  if (user.is_anonymous === true) return { error: "account_required" as const };
  return { user, authHeader };
}

// --- handler ---------------------------------------------------------------

async function handle(req: Request): Promise<Response> {
  const origins = allowedOrigins();
  const cors = corsHeadersFor(req.headers.get("Origin"), origins);
  const json = jsonWith(cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const url = new URL(req.url);

  // -------------------------------------------------------------------------
  // LEG 2 — provider OAuth return. Unauthenticated by necessity.
  // Proves ownership, parks a pending identity, commits NOTHING.
  // -------------------------------------------------------------------------
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("state"))) {
    const secret = stateSecret();
    const state = await verifyState(secret, url.searchParams.get("state"));
    // A bad signature or a stale state means there is no trustworthy place to
    // send the browser, so this is the one path that cannot redirect.
    if (!state) return json({ error: "invalid_state" }, 400);

    // Single-use consume. A replayed state matches zero rows here, which is
    // what makes replay impossible rather than merely unlikely.
    const admin = adminClient();
    const { data: attemptRows, error: attemptError } = await admin.rpc(
      "identity_link_consume_attempt",
      { p_attempt_id: state.a, p_provider: state.p },
    );
    if (attemptError) {
      console.error("[identity-link] attempt consume failed");
      return json({ error: "invalid_state" }, 400);
    }
    const attempt = Array.isArray(attemptRows) ? attemptRows[0] : null;
    if (!attempt) return json({ error: "invalid_state" }, 400);

    // Revalidate the return target against CURRENT configuration, so a state
    // minted before an allowlist change cannot carry a no-longer-trusted
    // origin through the round trip.
    const origin = allowedOrigin(attempt.out_return_origin, origins);
    if (!origin) return json({ error: "origin_not_allowed" }, 400);
    const path = safeReturnPath(attempt.out_return_path);
    const userId = attempt.out_user_id as string;

    const back = (status: string, extra: Record<string, string> = {}) =>
      Response.redirect(
        buildReturnUrl(origin, path, { connect: state.p, status, ...extra }),
        302,
      );

    if (url.searchParams.get("error")) return back("denied");

    const code = url.searchParams.get("code");
    const cfg = providerConfig(state.p);
    if (!code || !cfg) return back("unavailable");

    let identity: VerifiedIdentity;
    try {
      identity =
        state.p === "discord"
          ? await exchangeDiscord(code, cfg)
          : await exchangeRiot(code, cfg);
    } catch {
      // Never log the code, the tokens, or the provider's response body.
      console.error("[identity-link] provider exchange failed", state.p);
      return back("error");
    }

    // Park the proven identity. The ticket is returned to the browser; only
    // its hash is stored.
    const ticket = generateTicket();
    const { error: pendingError } = await admin.from("identity_link_pending").insert({
      ticket_hash: await hashTicket(ticket),
      user_id: userId,
      provider: state.p,
      provider_user_id: identity.providerUserId,
      username: identity.username,
      display_name: identity.displayName,
      tag_line: identity.tagLine,
      avatar_url: identity.avatarUrl,
      expires_at: new Date(Date.now() + PENDING_TTL_MS).toISOString(),
    });
    if (pendingError) {
      console.error("[identity-link] pending write failed");
      return back("error");
    }

    return back("pending", { ticket });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  const action = String(body.action ?? "");

  // Availability is public and fails closed.
  if (action === "providers") {
    return json({
      providers: {
        discord: { available: providerAvailable("discord") },
        riot: { available: providerAvailable("riot") },
      },
    });
  }

  const auth = await requirePermanentUser(req);
  if ("error" in auth) {
    return auth.error === "account_required"
      ? json({ error: "account_required" }, 403)
      : json({ error: "Unauthorized" }, 401);
  }
  const userId = auth.user!.id;
  const authHeader = auth.authHeader!;

  // -------------------------------------------------------------------------
  // LEG 1 — start.
  // -------------------------------------------------------------------------
  if (action === "start") {
    const provider = body.provider;
    if (!isProvider(provider)) return json({ error: "invalid_provider" }, 400);
    const cfg = providerConfig(provider);
    const secret = stateSecret();
    if (!cfg || !secret) return json({ error: "provider_unavailable" }, 409);

    const origin = allowedOrigin(body.origin, origins);
    if (!origin) return json({ error: "invalid_origin" }, 400);
    const path = safeReturnPath(body.returnTo);

    const expiresAt = Date.now() + ATTEMPT_TTL_MS;
    const { data: attempt, error } = await adminClient()
      .from("identity_link_attempts")
      .insert({
        user_id: userId,
        provider,
        return_origin: origin,
        return_path: path,
        expires_at: new Date(expiresAt).toISOString(),
      })
      .select("id")
      .single();
    if (error || !attempt) {
      console.error("[identity-link] attempt create failed");
      return json({ error: "start_failed" }, 500);
    }

    const state = await signState(secret, { a: attempt.id, p: provider, e: expiresAt });
    return json({
      authorizeUrl: buildAuthorizeUrl(provider, cfg.clientId, cfg.redirectUri, state, {
        discordAuthorize: "https://discord.com/oauth2/authorize",
        riotAuthorize: `${RIOT_AUTH_BASE}/authorize`,
      }),
    });
  }

  // -------------------------------------------------------------------------
  // LEG 3 — redeem. The authenticated commit.
  // -------------------------------------------------------------------------
  if (action === "redeem") {
    const ticket = body.ticket;
    if (typeof ticket !== "string" || !ticket) return json({ error: "invalid_ticket" }, 400);

    // The database consumes the ticket and commits the link in one statement,
    // with the authenticated user id in the consuming WHERE clause. A ticket
    // presented by anyone else matches nothing — and is not burnt, so a hostile
    // redeem cannot deny the rightful owner their link.
    const { data: status, error } = await adminClient().rpc("identity_link_redeem", {
      p_ticket_hash: await hashTicket(ticket),
      p_user_id: userId,
    });
    if (error) {
      console.error("[identity-link] redeem failed");
      return json({ error: "redeem_failed" }, 500);
    }
    if (status === "success") return json({ success: true });
    if (status === "already_linked") return json({ error: "already_linked" }, 409);
    return json({ error: "invalid_ticket" }, 400);
  }

  // -------------------------------------------------------------------------
  // Ordinary owner-scoped operations run under RLS, not service_role.
  // -------------------------------------------------------------------------
  if (action === "list") {
    const { data, error } = await callerClient(authHeader)
      .from("user_identity_links")
      .select(
        "id, provider, provider_user_id, username, display_name, tag_line, avatar_url, verified_at, contact_consent, public_on_profile",
      )
      .eq("user_id", userId);
    if (error) return json({ error: "load_failed" }, 500);
    return json({ links: data ?? [] });
  }

  if (action === "disconnect") {
    const provider = body.provider;
    if (!isProvider(provider)) return json({ error: "invalid_provider" }, 400);
    // Hard delete: disconnecting removes the external identity rather than
    // silently retaining it. RLS confines this to the caller's own row.
    const { error } = await callerClient(authHeader)
      .from("user_identity_links")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);
    if (error) return json({ error: "disconnect_failed" }, 500);
    return json({ success: true });
  }

  return json({ error: "unknown_action" }, 400);
}

// Top-level boundary: an unexpected throw must never surface a stack trace,
// an internal message, or anything derived from a provider response.
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch {
    console.error("[identity-link] unhandled error");
    return new Response(JSON.stringify({ error: "server_error" }), {
      status: 500,
      headers: {
        ...corsHeadersFor(req.headers.get("Origin"), allowedOrigins()),
        "Content-Type": "application/json",
      },
    });
  }
});
