/**
 * FUNNEL1B3.1 — `railway-analytics-ingest`
 *
 * The ONE door through which Railway's authoritative gameplay milestones enter
 * `public.analytics_events`. Transport only; every rule about what may enter
 * lives in ./contract.ts, which is unit tested.
 *
 *     Railway gameplay tx → SQLite outbox → POST here → analytics_events
 *
 *
 * WHAT THIS REPLACES, AND WHY
 *
 * B3 had Railway holding `SUPABASE_SERVICE_ROLE_KEY` and writing to PostgREST
 * directly. Lovable Cloud exposes no such credential to hand out — and handing
 * one out would have been wrong anyway: a database-wide master key, living in a
 * second platform's environment, able to read and write every table, in
 * exchange for appending to one.
 *
 * Now the privileged credential never leaves Lovable Cloud. The edge runtime
 * injects it here; Railway holds only `RAILWAY_ANALYTICS_INGEST_SECRET`, whose
 * entire capability is "append an authoritative gameplay row". A leak is a
 * bounded incident — rotate one secret, and the blast radius was append-only
 * rows in one table with a server-forced `source_system`.
 *
 *
 * AUTHORIZATION
 *
 * A dedicated shared secret, NOT the anon key and NOT a user JWT. The anon key
 * is public by construction, so authorizing server-authoritative events with it
 * would mean any browser could forge gameplay. `verify_jwt = false` in
 * config.toml because the caller is a server with no Supabase session; this
 * function does its own authentication, in one place, before anything else.
 *
 *
 * STATUS CODES ARE A CONTRACT WITH THE OUTBOX
 *
 * Railway's drainer decides retry-vs-dead-letter from the status alone, so
 * these are load-bearing:
 *
 *   200  stored (or already present — duplicates are success, see below)
 *   401  bad/missing secret          → retryable, logged loudly as config
 *   405  not POST                    → permanent
 *   422  contract violation          → PERMANENT; dead-letter, never retry
 *   500  our bug                     → retryable
 *   503  database unavailable        → retryable
 *
 * The 422/5xx split is the whole point: a malformed event must stop being
 * retried and become visible, while an outage must keep being retried.
 *
 *
 * DUPLICATES ARE SUCCESS
 *
 * `uq_analytics_events_authoritative_entity` is the final authority on
 * idempotency and is deliberately untouched here. A unique violation (23505)
 * means the row is present, which is exactly what the caller wanted, so it
 * returns 200 and the outbox marks the event delivered. That is what makes the
 * at-least-once outbox exactly-once in storage.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  bearerMatchesDigest,
  bearerToken,
  looksLikeDigest,
  validateIngestBatch,
} from "./contract.ts";

/**
 * B3.1a — the expected SHA-256 of Railway's bearer token, lowercase hex.
 *
 * NOT a secret, so it may be committed here: a digest cannot be replayed, and
 * recovering the token from it means brute-forcing a 256-bit random value.
 * Pinning it in source is what removes the need for a Lovable Cloud secret
 * entirely — Railway becomes the only place a raw credential exists.
 *
 * Leave empty to configure via the RAILWAY_ANALYTICS_INGEST_SECRET_SHA256
 * environment variable instead; the env var wins when both are present, so a
 * rotation can be done without a code deploy.
 *
 * Generate with:
 *     openssl rand -base64 32                      # the Railway token
 *     printf %s "<token>" | openssl dgst -sha256   # this value
 *
 * The digest's publishability depends entirely on the token being
 * cryptographically random and full length. A human-chosen token is
 * recoverable from its digest by dictionary search.
 */
const PINNED_SECRET_SHA256 = "38c2f2ec005f3a319350b0ce9ef7a2c54c72e52710519130e368e72d03b25577";

const PG_UNIQUE_VIOLATION = "23505";

/**
 * No CORS allowance beyond a preflight refusal shape: this endpoint is
 * server-to-server and no browser has any business calling it. Omitting
 * `Access-Control-Allow-Origin` means a page that tries cannot read the reply.
 */
const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, code: "method_not_allowed" });
  }

  const expectedDigest =
    (Deno.env.get("RAILWAY_ANALYTICS_INGEST_SECRET_SHA256") || PINNED_SECRET_SHA256)
      .trim()
      .toLowerCase() || null;

  if (!looksLikeDigest(expectedDigest)) {
    // Absent or malformed configuration. A 500, not a 401, because the caller
    // did nothing wrong and this is retryable the moment it is fixed — and
    // Railway's drainer keeps 5xx retryable, so the backlog survives.
    //
    // Fails CLOSED: a typo in the digest rejects every request. The opposite —
    // a malformed digest accepting everything — is the one outcome that would
    // be unrecoverable.
    console.error(
      "railway-analytics-ingest: RAILWAY_ANALYTICS_INGEST_SECRET_SHA256 is " +
        "missing or is not 64 lowercase hex characters; refusing every " +
        "request until it is configured",
    );
    return json(500, { ok: false, code: "ingest_not_configured" });
  }

  const presented = bearerToken(req.headers.get("Authorization"));
  if (!(await bearerMatchesDigest(presented, expectedDigest))) {
    // Neither the token nor its digest is logged. Echoing a near-miss token
    // would put a credential in the log; echoing the digest would hand an
    // attacker the offline target for free.
    console.error("railway-analytics-ingest: rejected a request with a bad or missing bearer token");
    return json(401, { ok: false, code: "unauthorized" });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(422, { ok: false, code: "invalid_json" });
  }

  const validated = validateIngestBatch(payload);
  if (!validated.ok) {
    // Permanent by construction: the same bytes fail identically forever.
    // 422 tells the outbox to stop retrying and surface it.
    console.error(
      `railway-analytics-ingest: rejected batch — ${validated.code}: ${validated.message}`,
    );
    return json(422, {
      ok: false,
      code: validated.code,
      message: validated.message,
      permanent: true,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("railway-analytics-ingest: edge runtime is missing its Supabase credentials");
    return json(500, { ok: false, code: "server_misconfigured" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Inserted one at a time, mirroring the outbox drainer: a batch containing a
  // single conflicting row would otherwise be rejected whole, and one already-
  // delivered event must not be able to block every event beside it.
  let stored = 0;
  let duplicates = 0;
  for (const row of validated.rows) {
    const { error } = await supabase.from("analytics_events").insert(row);
    if (!error) {
      stored += 1;
      continue;
    }
    if (error.code === PG_UNIQUE_VIOLATION) {
      // The idempotency contract working, not a failure.
      duplicates += 1;
      continue;
    }
    console.error(
      `railway-analytics-ingest: insert failed for ${row.event_name} ` +
        `${row.source_entity_type}/${row.source_entity_id} — ${error.code}: ${error.message}`,
    );
    // Could be transient (pooler, restart). Retryable, so the outbox keeps it.
    return json(503, {
      ok: false,
      code: "insert_failed",
      detail: error.code ?? "unknown",
      stored,
      duplicates,
    });
  }

  return json(200, { ok: true, stored, duplicates });
});
