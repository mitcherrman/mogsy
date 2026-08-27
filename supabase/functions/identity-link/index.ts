// ---------------------------------------------------------------------------
// identity-link — Mogzy Account Connections (Discord + Riot RSO).
//
// This function is the ONLY writer of verified identity rows in
// public.user_identity_links. Nothing here ever touches the caller's Supabase
// session: linking is an ownership proof attached to the existing Mogzy
// account, not an alternative login. Provider client secrets and OAuth tokens
// never leave this function — the Riot/Discord tokens are used once for the
// identity lookup and then discarded (v1 needs no ongoing provider access).
//
// Actions (POST, requires a permanent Mogzy session):
//   { action: "providers" }              → availability (fail closed, no auth)
//   { action: "list" }                   → caller's own links
//   { action: "start", provider, origin, returnTo } → authorize URL
//   { action: "disconnect", provider }   → removes the caller's link row
//
// OAuth return (GET ?code&state) → verifies signed state, exchanges the code
// server-side, upserts the link, then 302s back to the app's /settings.
//
// verify_jwt is false because the provider redirect carries no JWT; every
// action other than "providers" verifies the bearer token explicitly.
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Provider = "discord" | "riot";

const PROVIDERS: Provider[] = ["discord", "riot"];
const isProvider = (v: unknown): v is Provider =>
  typeof v === "string" && (PROVIDERS as string[]).includes(v);

// --- provider configuration (fail closed when secrets are absent) ----------

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function providerConfig(provider: Provider): ProviderConfig | null {
  const prefix = provider === "discord" ? "DISCORD" : "RIOT_RSO";
  const clientId = Deno.env.get(`${prefix}_CLIENT_ID`) ?? "";
  const clientSecret = Deno.env.get(`${prefix}_CLIENT_SECRET`) ?? "";
  const redirectUri = Deno.env.get(`${prefix}_REDIRECT_URI`) ?? "";
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

// Discord: identity only. No email, guilds, connections, DM or bot scopes.
const DISCORD_SCOPE = "identify";
// Riot Sign On requires these two per Riot's RSO documentation.
const RIOT_SCOPE = "openid offline_access";
const RIOT_AUTH_BASE = Deno.env.get("RIOT_RSO_AUTH_BASE") ?? "https://auth.riotgames.com";
const RIOT_ACCOUNT_BASE =
  Deno.env.get("RIOT_RSO_ACCOUNT_BASE") ?? "https://americas.api.riotgames.com";

// --- safe return origin/path ----------------------------------------------

const DEFAULT_ORIGINS = [
  "http://localhost:8080",
  "https://mogzy.lovable.app",
  "https://mogsy.net",
  "https://www.mogsy.net",
  "https://mogsy.app",
  "https://www.mogsy.app",
  "https://mogzy.lol",
  "https://www.mogzy.lol",
];

function allowedOrigin(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const extra = (Deno.env.get("IDENTITY_LINK_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if ([...DEFAULT_ORIGINS, ...extra].includes(raw)) return raw;
  try {
    const url = new URL(raw);
    // Lovable preview/publish subdomains are same-project surfaces.
    if (url.protocol === "https:" && url.hostname.endsWith(".lovable.app")) return url.origin;
  } catch {
    return null;
  }
  return null;
}

/** Same-origin absolute path only — no protocol-relative or backslash tricks. */
function safePath(raw: unknown, fallback = "/settings"): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  if (raw[0] !== "/") return fallback;
  if (raw[1] === "/" || raw[1] === "\\") return fallback;
  for (let i = 0; i < raw.length; i += 1) if (raw.charCodeAt(i) <= 0x20) return fallback;
  return raw;
}

// --- signed state (CSRF) ---------------------------------------------------

interface StatePayload {
  u: string; // Mogzy auth user id
  p: Provider;
  o: string; // return origin
  r: string; // return path
  n: string; // nonce
  e: number; // expiry (epoch ms)
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function stateSecret(): string {
  return (
    Deno.env.get("IDENTITY_LINK_STATE_SECRET") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    ""
  );
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(stateSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
  );
  return b64url(sig);
}

async function signState(payload: StatePayload): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(body)}`;
}

async function verifyState(state: string | null): Promise<StatePayload | null> {
  if (!state || !state.includes(".")) return null;
  const [body, sig] = state.split(".", 2);
  const expected = await hmac(body);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i += 1) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromB64url(body))) as StatePayload;
    if (!parsed?.u || !isProvider(parsed.p) || !parsed.e || Date.now() > parsed.e) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- clients ---------------------------------------------------------------

const adminClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

/** Resolves the caller, refusing anonymous guests (linking needs a real account). */
async function requirePermanentUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: json({ error: "Unauthorized" }, 401) };
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data } = await userClient.auth.getUser();
  const user = data?.user;
  if (!user) return { error: json({ error: "Unauthorized" }, 401) };
  if (user.is_anonymous === true) {
    return { error: json({ error: "account_required" }, 403) };
  }
  return { user };
}

// --- provider exchanges ----------------------------------------------------

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

  const meRes = await fetch(`${RIOT_ACCOUNT_BASE}/riot/account/v1/accounts/me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) throw new Error("lookup_failed");
  const me = (await meRes.json()) as { puuid?: string; gameName?: string; tagLine?: string };
  if (!me.puuid) throw new Error("lookup_failed");
  // v1 stores durable identifiers only; the access/refresh tokens are dropped
  // here with the function scope.
  return {
    providerUserId: me.puuid,
    username: me.gameName ?? null,
    displayName: null,
    tagLine: me.tagLine ?? null,
    avatarUrl: null,
  };
}

// --- handler ---------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // OAuth provider return.
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("state"))) {
    const state = await verifyState(url.searchParams.get("state"));
    if (!state) {
      // No trustworthy return target: nothing to redirect to.
      return json({ error: "invalid_state" }, 400);
    }
    const back = (status: string) =>
      Response.redirect(
        `${state.o}${state.r}${state.r.includes("?") ? "&" : "?"}connect=${state.p}&status=${status}`,
        302,
      );

    const providerError = url.searchParams.get("error");
    if (providerError) return back("denied");

    const code = url.searchParams.get("code");
    const cfg = providerConfig(state.p);
    if (!code || !cfg) return back("unavailable");

    let identity: VerifiedIdentity;
    try {
      identity =
        state.p === "discord"
          ? await exchangeDiscord(code, cfg)
          : await exchangeRiot(code, cfg);
    } catch (e) {
      console.error("[identity-link] exchange failed", state.p, String(e));
      return back("error");
    }

    const admin = adminClient();
    // Uniqueness: the external account may already belong to another Mogzy user.
    const { data: existing } = await admin
      .from("user_identity_links")
      .select("user_id")
      .eq("provider", state.p)
      .eq("provider_user_id", identity.providerUserId)
      .maybeSingle();
    if (existing && existing.user_id !== state.u) return back("already_linked");

    const { error } = await admin.from("user_identity_links").upsert(
      {
        user_id: state.u,
        provider: state.p,
        provider_user_id: identity.providerUserId,
        username: identity.username,
        display_name: identity.displayName,
        tag_line: identity.tagLine,
        avatar_url: identity.avatarUrl,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (error) {
      console.error("[identity-link] upsert failed", error.message);
      return back(error.code === "23505" ? "already_linked" : "error");
    }
    return back("success");
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  const action = String(body.action ?? "");

  // Availability is public and fails closed: no configuration → not available.
  if (action === "providers") {
    return json({
      providers: {
        discord: { available: providerConfig("discord") !== null },
        riot: { available: providerConfig("riot") !== null },
      },
    });
  }

  const auth = await requirePermanentUser(req);
  if ("error" in auth) return auth.error!;
  const userId = auth.user!.id;

  if (action === "list") {
    const { data, error } = await adminClient()
      .from("user_identity_links")
      .select(
        "id, provider, provider_user_id, username, display_name, tag_line, avatar_url, verified_at, contact_consent, public_on_profile",
      )
      .eq("user_id", userId);
    if (error) return json({ error: "load_failed" }, 500);
    return json({ links: data ?? [] });
  }

  if (action === "start") {
    const provider = body.provider;
    if (!isProvider(provider)) return json({ error: "invalid_provider" }, 400);
    const cfg = providerConfig(provider);
    if (!cfg) return json({ error: "provider_unavailable" }, 409);
    const origin = allowedOrigin(body.origin);
    if (!origin) return json({ error: "invalid_origin" }, 400);
    if (!stateSecret()) return json({ error: "provider_unavailable" }, 409);

    const state = await signState({
      u: userId,
      p: provider,
      o: origin,
      r: safePath(body.returnTo),
      n: crypto.randomUUID(),
      e: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: provider === "discord" ? DISCORD_SCOPE : RIOT_SCOPE,
      state,
    });
    if (provider === "discord") params.set("prompt", "consent");
    const authorizeUrl =
      provider === "discord"
        ? `https://discord.com/oauth2/authorize?${params.toString()}`
        : `${RIOT_AUTH_BASE}/authorize?${params.toString()}`;
    return json({ authorizeUrl });
  }

  if (action === "disconnect") {
    const provider = body.provider;
    if (!isProvider(provider)) return json({ error: "invalid_provider" }, 400);
    // Hard delete: disconnecting removes the external identity data rather
    // than silently retaining it.
    const { error } = await adminClient()
      .from("user_identity_links")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);
    if (error) return json({ error: "disconnect_failed" }, 500);
    return json({ success: true });
  }

  return json({ error: "unknown_action" }, 400);
});
