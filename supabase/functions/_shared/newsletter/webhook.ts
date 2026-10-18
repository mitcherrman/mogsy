// EMAIL1 — Resend (Svix) webhook signature verification and event mapping.
//
// Svix scheme: signed content is `${svix-id}.${svix-timestamp}.${rawBody}`,
// HMAC-SHA256 with the base64 key that follows the `whsec_` prefix; the header
// carries one or more space-separated `v1,<base64 signature>` entries.
// A 5-minute timestamp tolerance stops replay of a captured request.

import { timingSafeEqual } from "./tokens.ts";

export const WEBHOOK_TOLERANCE_SECONDS = 300;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export async function verifySvixSignature(
  secret: string,
  rawBody: string,
  h: SvixHeaders,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;
  let keyBytes: Uint8Array;
  try {
    keyBytes = b64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = bytesToB64(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h.id}.${h.timestamp}.${rawBody}`)),
  );
  return h.signature
    .split(" ")
    .map((p) => p.trim())
    .filter((p) => p.startsWith("v1,"))
    .some((p) => timingSafeEqual(p.slice(3), expected));
}

export type SuppressionReason = "hard_bounce" | "complaint";

export interface SuppressionEvent {
  eventId: string;
  email: string;
  reason: SuppressionReason;
}

/**
 * Map a provider event to a suppression, or null when it is not one.
 * Only PERMANENT failure suppresses: a transient/soft bounce is the provider's
 * to retry, and suppressing on it would silently unsubscribe people whose
 * mailbox was merely full.
 */
export function suppressionFromEvent(eventId: string | null, payload: unknown): SuppressionEvent | null {
  if (!eventId || typeof payload !== "object" || payload === null) return null;
  const p = payload as { type?: unknown; data?: { to?: unknown; bounce?: { type?: unknown } } };
  const to = Array.isArray(p.data?.to) ? p.data?.to[0] : p.data?.to;
  if (typeof to !== "string" || !to.includes("@")) return null;
  const email = to.replace(/^.*<(.+)>$/, "$1").trim().toLowerCase();
  if (p.type === "email.complained") return { eventId, email, reason: "complaint" };
  if (p.type === "email.bounced") {
    const kind = String(p.data?.bounce?.type ?? "").toLowerCase();
    if (kind === "permanent") return { eventId, email, reason: "hard_bounce" };
  }
  return null;
}
