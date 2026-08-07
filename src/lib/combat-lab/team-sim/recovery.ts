/**
 * Durable browser recovery for an unresolved PAID team simulation (Phase 4D).
 *
 * Phase 4C made one logical request survive edits and failures — but only in
 * React memory. A reload, a crashed tab or an accidental close destroyed the
 * idempotency key, and with it the only safe way to ask the backend what
 * happened to a request it may already have executed and charged. The backend
 * still holds the ledger; the browser simply lost its half of the handshake.
 *
 * This module is that half, written down. It stores the MINIMUM needed to
 * repeat the exact same handshake later:
 *
 *     the key, the bytes it was minted with, and who it belongs to.
 *
 * Rules it exists to enforce:
 *
 *  - Nothing here sends anything. It is storage and validation only; every
 *    POST still comes from an explicit click, in `hooks.ts`.
 *  - `sessionStorage`, not `localStorage`. Recovery must survive a reload of
 *    the same tab, which is the failure this phase addresses. It must NOT
 *    outlive the browsing session: the backend's own record expires
 *    (`billing.idempotency_retention_seconds`), and a scenario body sitting in
 *    durable storage for weeks buys nothing and exposes more.
 *  - Scoped to the authenticated account, in the storage KEY and again inside
 *    the record. One user's unresolved request is never visible to — and can
 *    never be sent by — another. No token, no email, no display name is
 *    stored; only the account's stable opaque id.
 *  - Every read fails SAFE. Malformed JSON, a wrong schema version, a mangled
 *    key, a body that is no longer a valid request, a fingerprint mismatch, an
 *    expired record, an oversized blob or a storage exception all resolve to
 *    "no recovery available" plus a quarantine sweep — never to a crash, and
 *    never, under any circumstance, to an automatic request.
 *  - Every write reports failure honestly, because the caller MUST fail closed
 *    on it: a paid request that cannot be written down is a paid request that
 *    cannot be recovered.
 */
import type { TeamSimulationRequest } from "./contract";

/** Bumped only when the stored shape changes incompatibly. */
export const RECOVERY_SCHEMA_VERSION = 1;

/**
 * `…v1:<scope>`. The version lives in the namespace as well as the record, so
 * a future v2 cannot even read a v1 slot by accident.
 */
export const RECOVERY_STORAGE_PREFIX = "mogzy.team-sim.recovery.v1";

/**
 * Scope for a session with no resolvable account id. It is a NAMESPACE, not a
 * shared bucket for "everyone": a signed-in account always uses `u:<id>`, so a
 * record written here can never be surfaced to, or sent by, an identified
 * user. Reaching it at all means the request would be unauthenticated, which
 * the backend rejects with 401 before any charge.
 */
export const UNIDENTIFIED_SCOPE = "unidentified";

/**
 * A comfortable ceiling for one scenario, and far below the endpoint's 512 KiB
 * body limit. A valid 2v2 serializes to a few KB; anything approaching this is
 * corruption or an attempt to fill the quota, and neither is worth storing.
 */
export const MAX_RECORD_BYTES = 256 * 1024;

/**
 * Backend `services/team_simulation_idempotency.py::RETENTION_SECONDS`. Only
 * used when the catalog's `billing.idempotency_retention_seconds` is absent or
 * unusable — the published value is always preferred, so this constant cannot
 * drift silently. (`catalog.ts` does not currently REQUIRE the field, which is
 * why the fallback exists at all.)
 */
export const FALLBACK_RETENTION_SECONDS = 86_400;

/**
 * Local records expire slightly EARLY. Offering a recovery in the last moments
 * of the server's window would produce a request that is honestly billable by
 * the time it lands — the one outcome this whole feature exists to prevent.
 */
export const RETENTION_SAFETY_MARGIN_SECONDS = 300;

const MIN_RETENTION_SECONDS = 60;
const MAX_RETENTION_SECONDS = 7 * 86_400;

/** The published key charset: printable ASCII, 1–128 bytes. */
const KEY_PATTERN = /^[\x21-\x7e]{1,128}$/;

/**
 * What is written down for ONE unresolved logical request.
 *
 * Deliberately not here: the draft (a recovery must never be rebuilt from the
 * current editor), the response body (the server replays it), any auth token,
 * and any identifier beyond the account's opaque id.
 */
export type TeamSimRecoveryRecord = {
  schema_version: typeof RECOVERY_SCHEMA_VERSION;
  /** Account namespace this record belongs to. Re-checked on read. */
  user_scope: string;
  idempotency_key: string;
  /** The EXACT request the key was minted with. Never re-derived. */
  request: TeamSimulationRequest;
  /** Local integrity digest over the stored request. Not server security. */
  request_fingerprint: string;
  /** Epoch ms of the explicit click that created the request. */
  submitted_at: number;
  /**
   * `unresolved`         — written before the POST; the tab still owns it.
   * `recovery_available` — the server's answer left it unresolved, or a later
   *                        page load adopted it. Both are recoverable; the
   *                        distinction is only for honest UI copy.
   */
  state: "unresolved" | "recovery_available";
  /** Catalog digest the request was configured against, for drift reporting. */
  catalog_digest: string;
  /** Quoted cost at submit time. Not re-derivable without the catalog. */
  credit_cost: number | null;
  /** Server retention as published when the record was written. */
  retention_seconds: number;
};

export type RecoveryWriteFailure =
  | "unavailable"
  | "too_large"
  | "quota"
  | "serialize";

export type RecoveryWriteResult =
  | { ok: true }
  | { ok: false; reason: RecoveryWriteFailure };

export type RecoveryDiscardReason =
  | "malformed"
  | "schema_version"
  | "scope_mismatch"
  | "invalid_key"
  | "invalid_request"
  | "fingerprint_mismatch"
  | "expired"
  | "too_large"
  | "unreadable";

export type RecoveryReadResult =
  | { status: "none" }
  | { status: "ok"; record: TeamSimRecoveryRecord }
  | { status: "discarded"; reason: RecoveryDiscardReason };

/* ─────────────────────────── storage access ─────────────────────────── */

/**
 * `sessionStorage` is not merely "missing" in some environments — touching the
 * property throws (SSR, and Safari with site data blocked). Every access goes
 * through here so a hostile environment degrades to "no recovery" instead of
 * an exception on a render path.
 */
function store(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** `u:<account id>` for a known account, the sentinel namespace otherwise. */
export function scopeForAccount(accountId: string | null | undefined): string {
  const id = typeof accountId === "string" ? accountId.trim() : "";
  // Prefixed so a crafted account id can never impersonate the sentinel.
  return id ? `u:${id}` : UNIDENTIFIED_SCOPE;
}

export function storageKeyFor(scope: string): string {
  return `${RECOVERY_STORAGE_PREFIX}:${scope}`;
}

/* ───────────────────────────── integrity ────────────────────────────── */

/**
 * FNV-1a over the exact serialized request.
 *
 * Deliberately not Web Crypto: `crypto.subtle.digest` is async, and the
 * restore path has to decide "is this record usable?" synchronously, before
 * the first paint that could offer a recovery button. This digest is a local
 * corruption and body/key-mismatch check — the server does its own
 * canonicalization and its own matching, and no security decision anywhere
 * depends on this value.
 */
export function fingerprintRequest(request: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(request) ?? "";
  } catch {
    serialized = "";
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${serialized.length.toString(36)}-${hash.toString(16).padStart(8, "0")}`;
}

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

/* ──────────────────────── request shape validation ──────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((e) => typeof e === "string");

const REQUEST_KEYS = [
  "contract_version",
  "scenario_id",
  "team_a",
  "team_b",
  "action_plans",
  "targeting",
  "limits",
] as const;

const COMBATANT_KEYS = new Set([
  "runtime_id",
  "champion",
  "level",
  "items",
  "runes",
  "ability_ranks",
  "crit_mode",
  "starting_hp",
]);

function isCombatant(value: unknown): boolean {
  if (!isObj(value)) return false;
  // The endpoint runs `extra="forbid"`. A stored body carrying a key the
  // contract does not define would be rejected on the wire, so it is treated
  // as corruption here rather than being offered as a recoverable request.
  for (const key of Object.keys(value)) if (!COMBATANT_KEYS.has(key)) return false;
  if (typeof value.runtime_id !== "string" || !value.runtime_id) return false;
  if (typeof value.champion !== "string" || !value.champion) return false;
  if (!isNum(value.level)) return false;
  if (!isStrArray(value.items) || !isStrArray(value.runes)) return false;
  if (!isObj(value.ability_ranks)) return false;
  if (!Object.values(value.ability_ranks).every(isNum)) return false;
  if (typeof value.crit_mode !== "string") return false;
  if ("starting_hp" in value && !isNum(value.starting_hp)) return false;
  return true;
}

function isTeam(value: unknown): boolean {
  if (!isObj(value)) return false;
  if (typeof value.team_id !== "string" || !value.team_id) return false;
  if (!Array.isArray(value.combatants) || value.combatants.length === 0) return false;
  return value.combatants.every(isCombatant);
}

/**
 * Structural validation of a stored body against the wire contract.
 *
 * Not a re-implementation of `validateDraft`: that answers "may this scenario
 * be built?" from the catalog, which a restored record has no business
 * consulting — the catalog may have moved on, and a request already sent is
 * not re-negotiable. This answers the only question that matters on restore:
 * "is this still a well-formed team-simulation request?" A body that fails it
 * cannot be resent, so the record is discarded instead of offered.
 */
export function isTeamSimulationRequestShape(
  value: unknown
): value is TeamSimulationRequest {
  if (!isObj(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== REQUEST_KEYS.length) return false;
  for (const key of REQUEST_KEYS) if (!keys.includes(key)) return false;

  if (typeof value.contract_version !== "string" || !value.contract_version) return false;
  if (typeof value.scenario_id !== "string" || !value.scenario_id) return false;
  if (!isTeam(value.team_a) || !isTeam(value.team_b)) return false;
  if (!isObj(value.action_plans) || !isObj(value.targeting)) return false;

  const limits = value.limits;
  if (!isObj(limits)) return false;
  if (!isNum(limits.max_duration)) return false;
  if (!isNum(limits.max_events)) return false;
  if (!isNum(limits.max_trace_events)) return false;

  return true;
}

/* ───────────────────────────── retention ────────────────────────────── */

/**
 * How long a LOCAL record may be offered, from the server's published
 * retention. Clamped against a nonsense catalog value and shortened by the
 * safety margin, so the browser always forgets before the server does.
 */
export function localRetentionSeconds(publishedSeconds: unknown): number {
  const published = isNum(publishedSeconds) && publishedSeconds > 0
    ? publishedSeconds
    : FALLBACK_RETENTION_SECONDS;
  const clamped = Math.min(
    Math.max(published, MIN_RETENTION_SECONDS),
    MAX_RETENTION_SECONDS
  );
  return Math.max(MIN_RETENTION_SECONDS, clamped - RETENTION_SAFETY_MARGIN_SECONDS);
}

/** Epoch ms after which the record must no longer be offered. */
export function expiresAt(record: TeamSimRecoveryRecord): number {
  return record.submitted_at + localRetentionSeconds(record.retention_seconds) * 1000;
}

/* ────────────────────────── read / write / clear ────────────────────── */

export type NewRecoveryRecord = {
  scope: string;
  idempotencyKey: string;
  request: TeamSimulationRequest;
  submittedAt: number;
  catalogDigest: string;
  creditCost: number | null;
  /** `billing.idempotency_retention_seconds` from the loaded catalog. */
  retentionSeconds: unknown;
};

export function buildRecord(input: NewRecoveryRecord): TeamSimRecoveryRecord {
  return {
    schema_version: RECOVERY_SCHEMA_VERSION,
    user_scope: input.scope,
    idempotency_key: input.idempotencyKey,
    request: input.request,
    request_fingerprint: fingerprintRequest(input.request),
    submitted_at: input.submittedAt,
    state: "unresolved",
    catalog_digest: input.catalogDigest,
    credit_cost: input.creditCost,
    // The server's published figure is stored verbatim; the safety margin and
    // the clamp are applied at read time by `expiresAt`, so a record written
    // under one policy is still read under the current one.
    retention_seconds:
      isNum(input.retentionSeconds) && input.retentionSeconds > 0
        ? input.retentionSeconds
        : FALLBACK_RETENTION_SECONDS,
  };
}

/**
 * Persist one record. The caller MUST honour a `false` result by not sending
 * the request: an unrecoverable paid POST is exactly the failure this phase
 * exists to remove, and silently continuing would reintroduce it while
 * appearing to have fixed it.
 */
export function writeRecord(record: TeamSimRecoveryRecord): RecoveryWriteResult {
  const s = store();
  if (!s) return { ok: false, reason: "unavailable" };

  let serialized: string;
  try {
    serialized = JSON.stringify(record);
  } catch {
    return { ok: false, reason: "serialize" };
  }
  if (serialized.length > MAX_RECORD_BYTES) return { ok: false, reason: "too_large" };

  try {
    s.setItem(storageKeyFor(record.user_scope), serialized);
  } catch {
    // QuotaExceededError, or a storage that accepts the property access and
    // then refuses the write (private modes have historically done both).
    return { ok: false, reason: "quota" };
  }

  // Written, but is it READABLE? A storage that silently drops the value would
  // otherwise let a paid request through believing it was recoverable.
  try {
    if (s.getItem(storageKeyFor(record.user_scope)) !== serialized) {
      return { ok: false, reason: "quota" };
    }
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

/**
 * Read the record for ONE scope, validating everything before offering it.
 *
 * Anything unusable is removed on the spot: a slot that fails validation will
 * fail it again on every page load, and leaving it there would keep a
 * permanent "recovery unavailable" state alive for no benefit.
 */
export function readRecord(scope: string, now: number): RecoveryReadResult {
  const s = store();
  if (!s) return { status: "none" };

  let raw: string | null;
  try {
    raw = s.getItem(storageKeyFor(scope));
  } catch {
    return { status: "discarded", reason: "unreadable" };
  }
  if (raw === null) return { status: "none" };

  const discard = (reason: RecoveryDiscardReason): RecoveryReadResult => {
    clearScope(scope);
    return { status: "discarded", reason };
  };

  if (raw.length > MAX_RECORD_BYTES) return discard("too_large");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return discard("malformed");
  }
  if (!isObj(parsed)) return discard("malformed");
  if (parsed.schema_version !== RECOVERY_SCHEMA_VERSION) return discard("schema_version");
  // The scope is in the key AND in the value. They can only disagree if the
  // slot was hand-edited or written by another build; either way this record
  // is not provably the current account's, so it is never offered.
  if (parsed.user_scope !== scope) return discard("scope_mismatch");
  if (!isValidIdempotencyKey(parsed.idempotency_key)) return discard("invalid_key");
  if (!isTeamSimulationRequestShape(parsed.request)) return discard("invalid_request");
  if (parsed.request_fingerprint !== fingerprintRequest(parsed.request)) {
    return discard("fingerprint_mismatch");
  }
  if (!isNum(parsed.submitted_at)) return discard("malformed");
  if (parsed.state !== "unresolved" && parsed.state !== "recovery_available") {
    return discard("malformed");
  }
  if (!isNum(parsed.retention_seconds) || parsed.retention_seconds <= 0) {
    return discard("malformed");
  }
  if (typeof parsed.catalog_digest !== "string") return discard("malformed");
  if (parsed.credit_cost !== null && !isNum(parsed.credit_cost)) return discard("malformed");

  const record = parsed as TeamSimRecoveryRecord;
  // A record from the future (a clock that moved backwards) is not offered
  // either — its expiry cannot be reasoned about.
  if (record.submitted_at > now + 60_000) return discard("malformed");
  if (now >= expiresAt(record)) return discard("expired");

  return { status: "ok", record };
}

/** Drop the record for a scope. Never throws. */
export function clearScope(scope: string): void {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(storageKeyFor(scope));
  } catch {
    /* a storage that refuses removal cannot be repaired from here */
  }
}

/**
 * Drop the record for a scope only when it still holds THIS key.
 *
 * The identity-scoped variant of "clear after the result is installed": by the
 * time a response lands, the account may have changed or a newer record may
 * own the slot, and clearing blindly would delete an unresolved request that
 * belongs to someone else.
 */
export function clearScopeIfKey(scope: string, idempotencyKey: string): void {
  const s = store();
  if (!s) return;
  try {
    const raw = s.getItem(storageKeyFor(scope));
    if (raw === null) return;
    const parsed = JSON.parse(raw) as { idempotency_key?: unknown };
    if (parsed?.idempotency_key !== idempotencyKey) return;
  } catch {
    // Unparseable: it is not this key's record in any usable sense, and
    // readRecord will quarantine it on the next load.
    return;
  }
  clearScope(scope);
}

/** Re-stamp `state` without touching the key, the body or `submitted_at`. */
export function markState(
  record: TeamSimRecoveryRecord,
  state: TeamSimRecoveryRecord["state"]
): void {
  if (record.state === state) return;
  writeRecord({ ...record, state });
}

/** Team shape, derived from the stored body — never stored separately. */
export function teamShapeOf(record: TeamSimRecoveryRecord): string {
  return `${record.request.team_a.combatants.length}v${record.request.team_b.combatants.length}`;
}

/** Champion names, for a summary that never shows the raw payload or key. */
export function championsOf(record: TeamSimRecoveryRecord): {
  a: string[];
  b: string[];
} {
  return {
    a: record.request.team_a.combatants.map((c) => c.champion),
    b: record.request.team_b.combatants.map((c) => c.champion),
  };
}
