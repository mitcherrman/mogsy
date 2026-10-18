// EMAIL1 — token primitives (WebCrypto only: runs in Deno, Node 20+ and vitest).
//
// Two kinds of token, deliberately different:
//
//  * CONFIRMATION token — random, single use, expires. Only its SHA-256 is
//    stored, so a database read cannot be replayed into a confirmation.
//  * UNSUBSCRIBE token — stateless and HMAC-signed over the subscription id.
//    It is embedded in every campaign (including the RFC 8058 one-click
//    header) so it must outlive any expiry and need no per-recipient storage.
//    Unsubscribing is the one action it can authorise, which is why it may be
//    long-lived: the worst a leaked token can do is stop someone's email.

const enc = new TextEncoder();

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of u) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}

/** 256 bits of CSPRNG output, base64url. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function hmacBase64Url(secret: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(message));
  return toBase64Url(sig);
}

/** Length-independent comparison of two equal-purpose strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const MIN_SECRET_LENGTH = 32;

/** A secret shorter than this is a misconfiguration, not a weak default. */
export function assertSecret(secret: string | undefined | null): string {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error("newsletter_secret_not_configured");
  }
  return secret;
}

// --- unsubscribe tokens ----------------------------------------------------

export async function makeUnsubscribeToken(subscriptionId: string, secret: string): Promise<string> {
  assertSecret(secret);
  if (!isUuid(subscriptionId)) throw new Error("invalid_subscription_id");
  const id = subscriptionId.toLowerCase();
  return `u1.${id}.${await hmacBase64Url(secret, `unsub:v1:${id}`)}`;
}

/** Returns the subscription id a valid token authorises, else null. */
export async function verifyUnsubscribeToken(token: unknown, secret: string): Promise<string | null> {
  assertSecret(secret);
  if (typeof token !== "string" || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "u1" || !isUuid(parts[1])) return null;
  const id = parts[1].toLowerCase();
  const expected = await hmacBase64Url(secret, `unsub:v1:${id}`);
  return timingSafeEqual(parts[2], expected) ? id : null;
}

/** Pseudonymise an IP for the consent audit: enough to correlate, useless alone. */
export async function hashIp(ip: string | null | undefined, secret: string): Promise<string | null> {
  const v = (ip ?? "").trim();
  if (!v) return null;
  return (await hmacBase64Url(secret, `ip:v1:${v}`)).slice(0, 32);
}

// --- confirmation tokens ---------------------------------------------------

export const CONFIRMATION_TTL_HOURS = 72;

export interface NewConfirmationToken {
  /** Goes in the email link. Never stored. */
  token: string;
  /** What the database stores. */
  tokenHash: string;
}

export async function newConfirmationToken(): Promise<NewConfirmationToken> {
  const token = randomToken(32);
  return { token, tokenHash: await sha256Hex(token) };
}

export function looksLikeConfirmationToken(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
}
