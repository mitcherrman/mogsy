// ---------------------------------------------------------------------------
// identity-link — pure security primitives.
//
// Deliberately free of Deno globals, remote imports and network access, so the
// rules that matter (origin allowlisting, return-path safety, OAuth state
// integrity, ticket generation, provider scopes) are unit-testable from the
// repo's own vitest suite. index.ts is the I/O shell around this file.
// ---------------------------------------------------------------------------

export type Provider = "discord" | "riot";

export const PROVIDERS: readonly Provider[] = ["discord", "riot"] as const;

export function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);
}

// --- provider scopes -------------------------------------------------------

/**
 * Discord: identity only. Proving ownership of a Discord account needs the
 * account's id and nothing else. No email, guilds, connections, DM or bot
 * scopes — Mogzy never asks for them.
 */
export const DISCORD_SCOPE = "identify";

/**
 * Riot Sign On. Riot's League RSO documentation specifies this pair, and we
 * follow Riot's documented flow rather than trimming it: `offline_access` is
 * part of the specified authorization request even though v1 deliberately
 * discards the refresh token it yields. Requesting a token is not retaining
 * one — see the token-handling note in index.ts.
 */
export const RIOT_SCOPE = "openid offline_access";

export function scopeFor(provider: Provider): string {
  return provider === "discord" ? DISCORD_SCOPE : RIOT_SCOPE;
}

// --- provider configuration (fail closed) ----------------------------------

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Env accessor, so this stays free of Deno globals and remains testable. */
export type EnvLookup = (key: string) => string | undefined;

export function envPrefix(provider: Provider): "DISCORD" | "RIOT_RSO" {
  return provider === "discord" ? "DISCORD" : "RIOT_RSO";
}

/**
 * Returns null unless the provider is fully configured. A partially configured
 * provider is treated as absent rather than half-enabled.
 */
export function providerConfigFrom(env: EnvLookup, provider: Provider): ProviderConfig | null {
  const prefix = envPrefix(provider);
  const clientId = env(`${prefix}_CLIENT_ID`) ?? "";
  const clientSecret = env(`${prefix}_CLIENT_SECRET`) ?? "";
  const redirectUri = env(`${prefix}_REDIRECT_URI`) ?? "";
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/**
 * A provider is offered to the UI only when a link could actually complete:
 * credentials present AND the dedicated state secret present. Riot therefore
 * reports unavailable until Mogzy holds real RSO credentials, which is the
 * required behaviour — there is no fallback that fakes Riot verification.
 */
export function providerAvailableFrom(env: EnvLookup, provider: Provider): boolean {
  return providerConfigFrom(env, provider) !== null && (env("IDENTITY_LINK_STATE_SECRET") ?? "") !== "";
}

// --- allowed return origins ------------------------------------------------

/**
 * EXACT origins only. There is no suffix, wildcard or hostname matching here,
 * and there must never be: the previous implementation trusted any origin
 * whose hostname ended in ".lovable.app", and every one of those subdomains is
 * registrable by any member of the public.
 *
 * `https://mogzy.lovable.app` appears as a single exact host — Mogzy's own
 * preview deployment — not as a pattern. Deleting it, or the localhost dev
 * origin, is a configuration-only change requiring no code edit.
 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "https://mogsy.net",
  "https://www.mogsy.net",
  "https://mogsy.app",
  "https://www.mogsy.app",
  "https://mogzy.lol",
  "https://www.mogzy.lol",
  "https://mogzy.lovable.app",
  "http://localhost:8080",
] as const;

/** Merges the built-in origins with an explicit comma-separated config value. */
export function resolveAllowedOrigins(configured: string | null | undefined): string[] {
  const extra = (configured ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

/**
 * Returns `raw` only when it is character-for-character one of the allowed
 * origins. Anything else — a subdomain, a lookalike host, a trailing slash, a
 * different scheme or port — is rejected.
 */
export function allowedOrigin(raw: unknown, allowed: readonly string[]): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  return allowed.includes(raw) ? raw : null;
}

// --- safe return path ------------------------------------------------------

/**
 * Mirrors the semantics of src/lib/auth/safe-return.ts, which is Mogzy's
 * established rule for post-auth redirects. Same-origin absolute paths only:
 * this rejects absolute URLs, protocol-relative "//host", the backslash
 * variant "/\host" that some browsers normalise to "//", and any control
 * character or whitespace used to smuggle a second target.
 *
 * Kept as a separate copy rather than an import because Supabase edge
 * functions bundle only their own directory and _shared; the behaviour is
 * pinned to the frontend's by returnPathParity tests.
 */
export const DEFAULT_RETURN_PATH = "/settings";

const MAX_UNSAFE_CHAR_CODE = 0x20;

function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) <= MAX_UNSAFE_CHAR_CODE) return true;
  }
  return false;
}

export function safeReturnPath(raw: unknown, fallback: string = DEFAULT_RETURN_PATH): string {
  if (typeof raw !== "string" || raw.length === 0) return fallback;
  if (raw[0] !== "/") return fallback;
  if (raw[1] === "/" || raw[1] === "\\") return fallback;
  if (hasUnsafeChars(raw)) return fallback;
  return raw;
}

// --- return URL construction ----------------------------------------------

/**
 * Builds the post-callback redirect with URL semantics rather than string
 * concatenation. The previous implementation appended "?a=b" or "&a=b" by
 * hand, which put the status parameters INSIDE the fragment whenever the
 * return path carried one ("/settings#tab" became "/settings#tab?connect=..."),
 * so the app never saw them.
 *
 * Any existing query is preserved and the new parameters are added to it; any
 * existing fragment is preserved and stays at the end where it belongs.
 *
 * Throws if the result would leave the approved origin — a last assertion that
 * this function cannot emit an off-origin redirect even if handed a bad path.
 */
export function buildReturnUrl(
  origin: string,
  path: string,
  params: Record<string, string>,
): string {
  const url = new URL(path, origin);
  if (url.origin !== new URL(origin).origin) {
    throw new Error("return_url_origin_mismatch");
  }
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

// --- OAuth state -----------------------------------------------------------

/**
 * The state is a signed POINTER, not a credential.
 *
 * It carries the id of a server-side identity_link_attempts row, the provider,
 * and an expiry — and nothing else. The Mogzy user id, the return origin and
 * the return path all live in the database row, where they can be consumed
 * exactly once and revalidated against current configuration.
 *
 * This is the structural difference from the previous design, where the state
 * carried the user id and the callback wrote a verified identity on the
 * strength of that alone.
 */
export interface StatePayload {
  /** identity_link_attempts.id */
  a: string;
  p: Provider;
  /** expiry, epoch ms */
  e: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return b64url(sig);
}

export async function signState(secret: string, payload: StatePayload): Promise<string> {
  if (!secret) throw new Error("state_secret_required");
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

/** Constant-time string comparison over equal-length signatures. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyState(
  secret: string,
  state: string | null | undefined,
  now: number = Date.now(),
): Promise<StatePayload | null> {
  if (!secret) return null;
  if (typeof state !== "string" || !state.includes(".")) return null;
  const idx = state.indexOf(".");
  const body = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  if (!body || !sig) return null;

  let expected: string;
  try {
    expected = await hmac(secret, body);
  } catch {
    return null;
  }
  if (!timingSafeEqual(sig, expected)) return null;

  try {
    const parsed = JSON.parse(decoder.decode(fromB64url(body))) as StatePayload;
    if (!parsed || typeof parsed.a !== "string" || !parsed.a) return null;
    if (!isProvider(parsed.p)) return null;
    if (typeof parsed.e !== "number" || now > parsed.e) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- redemption ticket -----------------------------------------------------

/**
 * The ticket travels back to the browser in a URL, so it lands in history and
 * potentially in a Referer. Only its SHA-256 is stored, exactly as a password
 * reset token would be: reading identity_link_pending yields nothing that can
 * be redeemed.
 */
export const TICKET_BYTES = 32;

export function generateTicket(): string {
  const bytes = new Uint8Array(TICKET_BYTES);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export async function hashTicket(ticket: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(ticket)),
  );
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- authorization URL -----------------------------------------------------

export interface ProviderEndpoints {
  discordAuthorize: string;
  riotAuthorize: string;
}

export const DEFAULT_ENDPOINTS: ProviderEndpoints = {
  discordAuthorize: "https://discord.com/oauth2/authorize",
  riotAuthorize: "https://auth.riotgames.com/authorize",
};

export function buildAuthorizeUrl(
  provider: Provider,
  clientId: string,
  redirectUri: string,
  state: string,
  endpoints: ProviderEndpoints = DEFAULT_ENDPOINTS,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopeFor(provider),
    state,
  });
  const base = provider === "discord" ? endpoints.discordAuthorize : endpoints.riotAuthorize;
  return `${base}?${params.toString()}`;
}

// --- CORS ------------------------------------------------------------------

/**
 * Exact-origin CORS for the authenticated browser actions. The wildcard the
 * previous version returned is gone, and the preflight now advertises the
 * methods it accepts — without which a JSON POST preflight can be rejected.
 *
 * The provider's GET callback is a top-level browser navigation, not a
 * cross-origin fetch, so it needs no CORS headers at all.
 */
export function corsHeadersFor(
  requestOrigin: string | null | undefined,
  allowed: readonly string[],
): Record<string, string> {
  const base: Record<string, string> = { Vary: "Origin" };
  const origin = allowedOrigin(requestOrigin, allowed);
  if (!origin) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}
