/**
 * Client submission identity for one Meta Reflex attempt.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The v2 vote RPC (`supabase/migrations/20260813120300_meta_reflex_vote_rpc_v2.sql`)
 * already short-circuits a retried submit on `p_client_submission_id`, backed by
 * a partial unique index on `league_swipe_results.client_submission_id`. The
 * browser never sent the parameter, so PostgREST applied the SQL default NULL,
 * the short-circuit's `is not null` guard never fired, and the partial index
 * (`where client_submission_id is not null`) constrained nothing. Both halves of
 * the protection were inert. This module mints the value that turns them on.
 *
 * WHY NOT REUSE `newIdempotencyKey` FROM combat-lab/team-sim
 * The shapes are not interchangeable. That key crosses the wire as an
 * `Idempotency-Key` HTTP header the backend validates as printable ASCII, so its
 * no-crypto fallback (`ts-<base36>-…`) is fine there. Here the value lands in a
 * Postgres column typed `uuid`. A non-UUID string does not degrade to
 * "unprotected" — it raises `invalid input syntax for type uuid` and the whole
 * vote fails, which is strictly worse than the inert-but-working status quo.
 * So this minter is UUID-shaped on every path, including the fallback.
 */

const HEX = "0123456789abcdef";

/** 16 random bytes, from the CSPRNG when there is one. */
function randomBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  const webcrypto = globalThis.crypto;
  if (typeof webcrypto?.getRandomValues === "function") {
    webcrypto.getRandomValues(bytes);
    return bytes;
  }
  // Last resort only. Collision risk is irrelevant to correctness here: a
  // collision would drop ONE duplicate vote, whereas an invalid UUID would
  // reject EVERY vote.
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * A fresh RFC-4122 v4 UUID identifying one logical submission.
 *
 * `crypto.randomUUID` wherever it exists (every browser this app targets, and
 * jsdom on Node 20+). The manual path covers non-secure contexts, where
 * `randomUUID` is undefined but `getRandomValues` is not.
 */
export function newSubmissionId(): string {
  const native = globalThis.crypto?.randomUUID?.();
  if (native) return native;

  const b = randomBytes();
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  let out = "";
  for (let i = 0; i < 16; i += 1) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += "-";
    out += HEX[b[i] >> 4] + HEX[b[i] & 0x0f];
  }
  return out;
}
