/**
 * FUNNEL1B3.1 — the Railway analytics ingest contract.
 *
 * Pure TypeScript, no Deno and no Supabase imports, so the rules that decide
 * what may enter `analytics_events` can be unit tested under vitest rather
 * than only in production. `index.ts` is the transport around this.
 *
 *
 * WHY THIS FUNCTION EXISTS AT ALL
 *
 * B3 shipped assuming Railway could hold a `SUPABASE_SERVICE_ROLE_KEY` and
 * POST straight to PostgREST. That is wrong for Lovable Cloud — there is no
 * user-facing service-role credential to hand out — and it would have been the
 * wrong shape even if there were: a database-wide master credential sitting in
 * a second platform's environment, able to read and write every table, in
 * exchange for appending to one.
 *
 * So the privileged credential stays inside Lovable Cloud, where the edge
 * runtime injects it, and Railway holds one narrow shared secret that can do
 * exactly one thing: append an authoritative gameplay row.
 *
 *
 * THE CALLER IS NOT TRUSTED WITH THE ROW
 *
 * Railway sends FACTS — which milestone, about which entity, for whom. It does
 * not send a database row. Everything that determines authority is set here:
 *
 *   source_system   forced to 'railway'. The caller cannot choose it, so a
 *                   leaked ingest secret still cannot forge a 'web' row or
 *                   invent a new source system.
 *   route           always null. It is a browser concept; a backend event that
 *                   carried one would be lying about where it happened.
 *   verification_type  always null. Not Railway's to assert.
 *   event_version   pinned to the version this function understands.
 *
 * The alternative — accepting a full row and validating it field by field — is
 * the same work with a worse failure mode, because anything the validator
 * forgets becomes something the caller controls.
 */

/** Rejections are permanent contract failures unless marked otherwise. */
export type IngestRejection =
  | "method_not_allowed"
  | "unauthorized"
  | "invalid_json"
  | "not_an_object"
  | "unknown_event"
  | "invalid_entity_type"
  | "invalid_entity_id"
  | "invalid_user_id"
  | "unsupported_version"
  | "invalid_occurred_at"
  | "metadata_too_large"
  | "batch_too_large"
  | "empty_batch";

export type IngestRow = {
  event_name: string;
  event_version: number;
  occurred_at: string;
  source_system: "railway";
  source_entity_type: string;
  source_entity_id: string;
  user_id: string | null;
  is_guest: boolean | null;
  route: null;
  verification_type: null;
  metadata: Record<string, unknown> | null;
};

export type ValidationResult =
  | { ok: true; row: IngestRow }
  | { ok: false; code: IngestRejection; message: string };

/**
 * The approved vocabulary. Railway may emit these eight names and nothing else
 * — an unknown lower_snake_case string is rejected rather than stored, so the
 * warehouse's vocabulary cannot drift by accident from the other side of an
 * HTTP boundary.
 *
 * NAMING: these are the FROZEN contract's names (docs/FUNNEL1_HANDOFF.md
 * §14.4), which is why practice reads `practice_quiz_*` rather than the
 * `practice_*` the B3.1 brief lists. "Practice" alone is ambiguous in this
 * product — Practice Quiz, Practice Builder, DSA practice run — and the
 * frontend's MACRO_EVENTS already reserves the longer names for exactly this
 * emission. Accepting a second spelling here would create two names for one
 * fact, which is the drift FUNNEL1 exists to stop.
 */
export const ALLOWED_EVENTS = new Set([
  "practice_quiz_started",
  "practice_quiz_completed",
  "ranked_started",
  "ranked_completed",
  "dsa_started",
  "dsa_completed",
  "mastery_started",
  "mastery_completed",
]);

/**
 * Entity types, pinned to the four Railway owns. `ranked_participant` — not
 * `ranked_match` — is load-bearing: the unique index is
 * (source_system, event_name, source_entity_type, source_entity_id), so a
 * match-level key would silently collapse both duellists into one row.
 */
export const ALLOWED_ENTITY_TYPES = new Set([
  "quiz_session",
  "ranked_participant",
  "dsa_run",
  "mastery_session",
]);

export const SUPPORTED_EVENT_VERSIONS = new Set([1]);

export const MAX_ENTITY_ID_LENGTH = 128;
export const MAX_METADATA_BYTES = 4096;
export const MAX_BATCH = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The write-fallback sentinel Railway uses when no verified subject exists. */
const ANONYMOUS_SENTINEL = "anonymous";

/**
 * Is this a real Supabase account we may attribute a row to?
 *
 * Mirrors `analytics.contract.is_emittable_user_id` on the Railway side, and
 * deliberately duplicates it: the caller filtering is a courtesy, this is the
 * guarantee. A bot has no account, and `"anonymous"` is a sentinel rather than
 * a uid — writing either would invent a person.
 */
export function isAttributableUserId(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  if (value === ANONYMOUS_SENTINEL) return false;
  if (value.startsWith("bot::")) return false;
  return UUID_RE.test(value);
}

function reject(code: IngestRejection, message: string): ValidationResult {
  return { ok: false, code, message };
}

/**
 * Turn one untrusted payload into the row to insert, or say precisely why not.
 *
 * Every rejection here is PERMANENT: the same payload will fail identically
 * forever, so the caller must dead-letter it rather than retry. `index.ts`
 * maps these to 422 for that reason, and keeps 5xx for the transient ones.
 */
export function validateIngestEvent(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return reject("not_an_object", "each event must be a JSON object");
  }
  const raw = input as Record<string, unknown>;

  const eventName = raw.event_name;
  if (typeof eventName !== "string" || !ALLOWED_EVENTS.has(eventName)) {
    return reject(
      "unknown_event",
      `event_name must be one of the approved authoritative events, got ${JSON.stringify(eventName)}`,
    );
  }

  const entityType = raw.source_entity_type ?? raw.entity_type;
  if (typeof entityType !== "string" || !ALLOWED_ENTITY_TYPES.has(entityType)) {
    return reject(
      "invalid_entity_type",
      `source_entity_type must be one of ${[...ALLOWED_ENTITY_TYPES].join(", ")}`,
    );
  }

  const entityIdRaw = raw.source_entity_id ?? raw.entity_id;
  if (typeof entityIdRaw !== "string") {
    return reject("invalid_entity_id", "source_entity_id is required");
  }
  const entityId = entityIdRaw.trim();
  if (!entityId || entityId.length > MAX_ENTITY_ID_LENGTH) {
    return reject(
      "invalid_entity_id",
      `source_entity_id must be 1..${MAX_ENTITY_ID_LENGTH} characters`,
    );
  }

  const version = raw.event_version === undefined ? 1 : raw.event_version;
  if (typeof version !== "number" || !SUPPORTED_EVENT_VERSIONS.has(version)) {
    return reject("unsupported_version", `event_version ${version} is not supported`);
  }

  // Absent or unattributable is NULL, not a rejection: a DSA practice run by a
  // signed-out visitor is a real gameplay fact with no account behind it, and
  // dropping the event would lose the fact to protect a column.
  // A malformed-but-present id IS rejected, because that is a caller bug and
  // silently nulling it would hide it.
  let userId: string | null = null;
  const rawUser = raw.user_id;
  if (rawUser !== undefined && rawUser !== null && rawUser !== "") {
    if (typeof rawUser !== "string") {
      return reject("invalid_user_id", "user_id must be a string uuid");
    }
    if (rawUser === ANONYMOUS_SENTINEL || rawUser.startsWith("bot::")) {
      userId = null;               // known non-person; keep the event
    } else if (!UUID_RE.test(rawUser)) {
      return reject("invalid_user_id", "user_id must be uuid-shaped");
    } else {
      userId = rawUser;
    }
  }

  let isGuest: boolean | null = null;
  if (raw.is_guest !== undefined && raw.is_guest !== null) {
    if (typeof raw.is_guest !== "boolean") {
      return reject("not_an_object", "is_guest must be a boolean when present");
    }
    isGuest = raw.is_guest;
  }

  let occurredAt = new Date().toISOString();
  if (raw.occurred_at !== undefined && raw.occurred_at !== null) {
    if (typeof raw.occurred_at !== "string") {
      return reject("invalid_occurred_at", "occurred_at must be an ISO string");
    }
    const parsed = Date.parse(raw.occurred_at);
    if (Number.isNaN(parsed)) {
      return reject("invalid_occurred_at", "occurred_at is not a valid timestamp");
    }
    occurredAt = new Date(parsed).toISOString();
  }

  let metadata: Record<string, unknown> | null = null;
  if (raw.metadata !== undefined && raw.metadata !== null) {
    if (typeof raw.metadata !== "object" || Array.isArray(raw.metadata)) {
      return reject("metadata_too_large", "metadata must be a JSON object");
    }
    const encoded = JSON.stringify(raw.metadata);
    // Bounded well under the 8 KiB the table's CHECK allows, so a payload that
    // passes here can never be refused by the database for size.
    if (encoded.length > MAX_METADATA_BYTES) {
      return reject(
        "metadata_too_large",
        `metadata must be <= ${MAX_METADATA_BYTES} bytes, got ${encoded.length}`,
      );
    }
    metadata = raw.metadata as Record<string, unknown>;
  }

  return {
    ok: true,
    row: {
      event_name: eventName,
      event_version: version,
      occurred_at: occurredAt,
      // Server-set. The caller has no say, so a leaked secret cannot forge a
      // 'web' row or invent a source system.
      source_system: "railway",
      source_entity_type: entityType,
      source_entity_id: entityId,
      user_id: userId,
      is_guest: isGuest,
      // Browser concepts. A backend event carrying them would be lying.
      route: null,
      verification_type: null,
      metadata,
    },
  };
}

/** Validate a whole batch, failing on the first bad member. */
export function validateIngestBatch(
  input: unknown,
): { ok: true; rows: IngestRow[] } | { ok: false; code: IngestRejection; message: string } {
  const events = Array.isArray(input)
    ? input
    : (input as { events?: unknown })?.events;

  if (!Array.isArray(events)) {
    return reject("invalid_json", "body must be an array of events or {events: [...]}") as never;
  }
  if (events.length === 0) return reject("empty_batch", "no events supplied") as never;
  if (events.length > MAX_BATCH) {
    return reject("batch_too_large", `at most ${MAX_BATCH} events per request`) as never;
  }

  const rows: IngestRow[] = [];
  for (const candidate of events) {
    const result = validateIngestEvent(candidate);
    if (!result.ok) return result as never;
    rows.push(result.row);
  }
  return { ok: true, rows };
}

/**
 * Constant-time-ish secret comparison.
 *
 * `===` on secrets leaks length and prefix through timing. The exposure is
 * small over the public internet, but the fix is four lines and this is the
 * only thing standing between an anonymous caller and the gameplay ledger.
 */
export function secretMatches(provided: string | null, expected: string | null): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Pull the bearer token out of an Authorization header. */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
