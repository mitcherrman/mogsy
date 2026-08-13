/**
 * SIM2 Phase 4D — the recovery record's storage contract.
 *
 * Every test here asks one of two questions:
 *   - does a usable record survive intact?
 *   - does an UNUSABLE one fail safe — discarded, never crashing, never
 *     offered, never leaked across accounts?
 *
 * The page-level suite proves the second half of the guarantee (that a
 * discarded record cannot become a POST). This file proves the storage layer
 * classifies correctly in the first place.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REAL_CATALOG, REAL_REQUESTS } from "./__fixtures__";
import { indexCatalog } from "./catalog";
import type { TeamSimulationRequest } from "./contract";
import { createDraft, draftReducer } from "./draft";
import { buildSimulationRequest } from "./request";
import {
  buildRecord,
  championsOf,
  clearScope,
  clearScopeIfKey,
  expiresAt,
  fingerprintRequest,
  FALLBACK_RETENTION_SECONDS,
  isTeamSimulationRequestShape,
  isValidIdempotencyKey,
  localRetentionSeconds,
  markState,
  MAX_RECORD_BYTES,
  readRecord,
  RECOVERY_SCHEMA_VERSION,
  RETENTION_SAFETY_MARGIN_SECONDS,
  scopeForAccount,
  storageKeyFor,
  teamShapeOf,
  UNIDENTIFIED_SCOPE,
  writeRecord,
  type TeamSimRecoveryRecord,
} from "./recovery";

const SCOPE_A = scopeForAccount("account-a");
const SCOPE_B = scopeForAccount("account-b");
const KEY = "3f2a1c9e-0000-4000-8000-000000000001";
const NOW = 1_770_000_000_000;

/**
 * The request the UI actually persists — produced by the real builder from the
 * real catalog, not hand-written.
 *
 * This matters for what follows. `REAL_REQUESTS` holds Phase 4B's captured
 * curl bodies, which exercise the endpoint's LOOSER accepted shape (no
 * `contract_version`, no `runes`/`ability_ranks`/`crit_mode`, targeting as a
 * bare string). `buildSimulationRequest` never emits that shape, so validating
 * a stored record against it would be validating against a body this browser
 * could not have written.
 */
const INDEX = indexCatalog(REAL_CATALOG);
const REQUEST: TeamSimulationRequest = buildSimulationRequest(
  [
    { type: "setTeamSize" as const, team: "A" as const, size: 2 as const },
    { type: "setTeamSize" as const, team: "B" as const, size: 2 as const },
  ].reduce(draftReducer, createDraft(INDEX)),
  INDEX
).request;

function record(overrides: Partial<TeamSimRecoveryRecord> = {}): TeamSimRecoveryRecord {
  return {
    ...buildRecord({
      scope: SCOPE_A,
      idempotencyKey: KEY,
      request: REQUEST,
      submittedAt: NOW,
      catalogDigest: "sha256:abc",
      creditCost: 3,
      retentionSeconds: 86_400,
    }),
    ...overrides,
  };
}

/** Write raw text into a scope's slot, bypassing every validation. */
function poison(scope: string, raw: string) {
  sessionStorage.setItem(storageKeyFor(scope), raw);
}

/**
 * Replace `window.sessionStorage` wholesale for one test.
 *
 * Spying on `Storage.prototype` does NOT work here: jsdom's storage object
 * does not route its methods through the prototype, so a prototype spy is
 * silently ignored and a "storage failed" test would pass while exercising a
 * perfectly healthy storage. Swapping the object is the only way to make the
 * hostile environments this module claims to survive actually happen.
 */
const originalStorage = Object.getOwnPropertyDescriptor(window, "sessionStorage");
function installStorage(impl: Partial<Storage>) {
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    get: () => impl as Storage,
  });
}
function restoreStorage() {
  if (originalStorage) Object.defineProperty(window, "sessionStorage", originalStorage);
}

beforeEach(() => {
  restoreStorage();
  sessionStorage.clear();
});
afterEach(() => {
  restoreStorage();
  vi.restoreAllMocks();
});

// =========================================================================
// Round trip
// =========================================================================

describe("round trip", () => {
  it("stores and restores a record unchanged", () => {
    const written = record();
    expect(writeRecord(written)).toEqual({ ok: true });

    const read = readRecord(SCOPE_A, NOW + 1_000);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    // The BYTES matter, not just the shape: a recovery replays only when the
    // server sees the same validated request it stored.
    expect(read.record.request).toEqual(REQUEST);
    expect(read.record.idempotency_key).toBe(KEY);
    expect(read.record.schema_version).toBe(RECOVERY_SCHEMA_VERSION);
  });

  it("reports no record for an untouched scope", () => {
    expect(readRecord(SCOPE_A, NOW)).toEqual({ status: "none" });
  });

  it("derives the team shape and champions from the stored body", () => {
    const written = record();
    expect(teamShapeOf(written)).toBe("2v2");
    const champions = championsOf(written);
    expect(champions.a).toHaveLength(2);
    expect(champions.b).toHaveLength(2);
  });

  it("stores no token, email or draft", () => {
    writeRecord(record());
    const raw = sessionStorage.getItem(storageKeyFor(SCOPE_A)) ?? "";
    expect(raw).not.toMatch(/token|bearer|@|password|draft/i);
    // The account scope is an opaque id, and it is the only identity present.
    expect(JSON.parse(raw).user_scope).toBe(SCOPE_A);
  });
});

// =========================================================================
// Identity scoping
// =========================================================================

describe("identity scoping", () => {
  it("namespaces a known account away from the unidentified sentinel", () => {
    expect(scopeForAccount("abc")).toBe("u:abc");
    expect(scopeForAccount(null)).toBe(UNIDENTIFIED_SCOPE);
    expect(scopeForAccount("   ")).toBe(UNIDENTIFIED_SCOPE);
    // A crafted id must not be able to land in the sentinel's namespace.
    expect(scopeForAccount(UNIDENTIFIED_SCOPE)).not.toBe(UNIDENTIFIED_SCOPE);
  });

  it("does not surface one account's record to another", () => {
    writeRecord(record());
    expect(readRecord(SCOPE_A, NOW).status).toBe("ok");
    expect(readRecord(SCOPE_B, NOW)).toEqual({ status: "none" });
  });

  it("discards a record whose stored scope disagrees with its slot", () => {
    // Only reachable by hand-editing storage — which is exactly why the scope
    // is checked in the value as well as in the key.
    poison(SCOPE_B, JSON.stringify(record()));
    expect(readRecord(SCOPE_B, NOW)).toEqual({
      status: "discarded",
      reason: "scope_mismatch",
    });
    expect(sessionStorage.getItem(storageKeyFor(SCOPE_B))).toBeNull();
  });
});

// =========================================================================
// Corruption
// =========================================================================

describe("corrupt storage fails safe", () => {
  const cases: Array<[string, string, string]> = [
    ["malformed JSON", "{not json", "malformed"],
    ["a non-object", JSON.stringify("nope"), "malformed"],
    [
      "a wrong schema version",
      JSON.stringify({ ...record(), schema_version: 99 }),
      "schema_version",
    ],
    [
      "a missing key",
      JSON.stringify({ ...record(), idempotency_key: "" }),
      "invalid_key",
    ],
    [
      "a key outside the published charset",
      JSON.stringify({ ...record(), idempotency_key: "has space" }),
      "invalid_key",
    ],
    [
      "an over-long key",
      JSON.stringify({ ...record(), idempotency_key: "k".repeat(129) }),
      "invalid_key",
    ],
    [
      "a request that is not a request",
      JSON.stringify({ ...record(), request: { hello: "world" } }),
      "invalid_request",
    ],
    [
      "a request carrying a field the endpoint forbids",
      JSON.stringify(
        (() => {
          const bad = structuredClone(record());
          (bad.request.team_a.combatants[0] as Record<string, unknown>).nope = 1;
          bad.request_fingerprint = fingerprintRequest(bad.request);
          return bad;
        })()
      ),
      "invalid_request",
    ],
    [
      "a body that no longer matches its fingerprint",
      JSON.stringify(
        (() => {
          const tampered = structuredClone(record());
          // Still a structurally valid request, so the check that catches it
          // can only be the fingerprint.
          tampered.request.team_a.combatants[0].champion = "Tampered";
          return tampered;
        })()
      ),
      "fingerprint_mismatch",
    ],
    [
      "a missing submitted_at",
      JSON.stringify({ ...record(), submitted_at: "yesterday" }),
      "malformed",
    ],
    ["an unknown state", JSON.stringify({ ...record(), state: "weird" }), "malformed"],
    [
      "a nonsense retention",
      JSON.stringify({ ...record(), retention_seconds: 0 }),
      "malformed",
    ],
    [
      "a record stamped in the future",
      JSON.stringify({ ...record(), submitted_at: NOW + 600_000 }),
      "malformed",
    ],
  ];

  for (const [label, raw, reason] of cases) {
    it(`discards ${label} without throwing`, () => {
      poison(SCOPE_A, raw);
      expect(() => readRecord(SCOPE_A, NOW)).not.toThrow();
      poison(SCOPE_A, raw);
      expect(readRecord(SCOPE_A, NOW)).toEqual({ status: "discarded", reason });
      // Quarantined: an unusable slot would otherwise fail identically on
      // every future page load.
      expect(sessionStorage.getItem(storageKeyFor(SCOPE_A))).toBeNull();
    });
  }

  it("discards an oversized blob without parsing it", () => {
    poison(SCOPE_A, "x".repeat(MAX_RECORD_BYTES + 1));
    expect(readRecord(SCOPE_A, NOW)).toEqual({
      status: "discarded",
      reason: "too_large",
    });
  });

  it("survives a sessionStorage read that throws", () => {
    installStorage({
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });
    expect(readRecord(SCOPE_A, NOW)).toEqual({
      status: "discarded",
      reason: "unreadable",
    });
  });

  it("survives sessionStorage being unreachable entirely", () => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    expect(readRecord(SCOPE_A, NOW)).toEqual({ status: "none" });
    expect(writeRecord(record())).toEqual({ ok: false, reason: "unavailable" });
    expect(() => clearScope(SCOPE_A)).not.toThrow();
  });
});

// =========================================================================
// Write failures
// =========================================================================

describe("write failures are reported, never swallowed", () => {
  it("reports a quota rejection", () => {
    installStorage({
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });
    expect(writeRecord(record())).toEqual({ ok: false, reason: "quota" });
  });

  it("reports a storage that accepts the write and drops the value", () => {
    // Private modes have historically done exactly this. A write nobody can
    // read back is not a write, and a caller that believed it would send a
    // paid request it could never recover.
    installStorage({ getItem: () => null, setItem: () => {} });
    expect(writeRecord(record())).toEqual({ ok: false, reason: "quota" });
  });

  it("refuses an oversized record before touching storage", () => {
    const setItem = vi.fn();
    installStorage({ getItem: () => null, setItem });
    const huge = record({
      catalog_digest: "d".repeat(MAX_RECORD_BYTES + 10),
    });
    expect(writeRecord(huge)).toEqual({ ok: false, reason: "too_large" });
    expect(setItem).not.toHaveBeenCalled();
  });
});

// =========================================================================
// Expiry
// =========================================================================

describe("expiry tracks the server's published retention", () => {
  it("expires strictly before the server would", () => {
    expect(localRetentionSeconds(86_400)).toBe(86_400 - RETENTION_SAFETY_MARGIN_SECONDS);
  });

  it("falls back to the documented backend constant for an unusable value", () => {
    expect(localRetentionSeconds(undefined)).toBe(
      FALLBACK_RETENTION_SECONDS - RETENTION_SAFETY_MARGIN_SECONDS
    );
    expect(localRetentionSeconds(-5)).toBe(
      FALLBACK_RETENTION_SECONDS - RETENTION_SAFETY_MARGIN_SECONDS
    );
    expect(buildRecord({
      scope: SCOPE_A,
      idempotencyKey: KEY,
      request: REQUEST,
      submittedAt: NOW,
      catalogDigest: "d",
      creditCost: null,
      retentionSeconds: "nonsense",
    }).retention_seconds).toBe(FALLBACK_RETENTION_SECONDS);
  });

  it("clamps a nonsense catalog value instead of trusting it", () => {
    expect(localRetentionSeconds(999_999_999)).toBeLessThanOrEqual(7 * 86_400);
    expect(localRetentionSeconds(1)).toBeGreaterThanOrEqual(60);
  });

  it("restores a record inside the window", () => {
    writeRecord(record());
    const justInside = expiresAt(record()) - 1;
    expect(readRecord(SCOPE_A, justInside).status).toBe("ok");
  });

  it("discards and removes a record at the boundary", () => {
    writeRecord(record());
    const at = expiresAt(record());
    expect(readRecord(SCOPE_A, at)).toEqual({ status: "discarded", reason: "expired" });
    expect(sessionStorage.getItem(storageKeyFor(SCOPE_A))).toBeNull();
  });
});

// =========================================================================
// Targeted clearing
// =========================================================================

describe("clearing", () => {
  it("clears only when the slot still holds that key", () => {
    writeRecord(record());
    clearScopeIfKey(SCOPE_A, "some-other-key");
    expect(readRecord(SCOPE_A, NOW).status).toBe("ok");

    clearScopeIfKey(SCOPE_A, KEY);
    expect(readRecord(SCOPE_A, NOW)).toEqual({ status: "none" });
  });

  it("never throws when storage refuses removal", () => {
    writeRecord(record());
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => clearScope(SCOPE_A)).not.toThrow();
  });

  it("re-stamps state without moving the key, body or submitted_at", () => {
    const original = record();
    writeRecord(original);
    markState(original, "recovery_available");

    const read = readRecord(SCOPE_A, NOW);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.record.state).toBe("recovery_available");
    expect(read.record.idempotency_key).toBe(original.idempotency_key);
    expect(read.record.submitted_at).toBe(original.submitted_at);
    expect(read.record.request).toEqual(original.request);
  });
});

// =========================================================================
// Primitives
// =========================================================================

describe("primitives", () => {
  it("accepts the published key charset and nothing else", () => {
    expect(isValidIdempotencyKey(KEY)).toBe(true);
    expect(isValidIdempotencyKey("~".repeat(128))).toBe(true);
    expect(isValidIdempotencyKey("")).toBe(false);
    expect(isValidIdempotencyKey("a b")).toBe(false);
    expect(isValidIdempotencyKey("café")).toBe(false);
    expect(isValidIdempotencyKey(42)).toBe(false);
  });

  it("fingerprints deterministically and notices a single-field change", () => {
    expect(fingerprintRequest(REQUEST)).toBe(fingerprintRequest(REQUEST));
    const changed = structuredClone(REQUEST);
    changed.team_a.combatants[0].level += 1;
    expect(fingerprintRequest(changed)).not.toBe(fingerprintRequest(REQUEST));
  });

  it("accepts every shape this UI can build", () => {
    for (const a of [1, 2] as const) {
      for (const b of [1, 2] as const) {
        const draft = [
          { type: "setTeamSize" as const, team: "A" as const, size: a },
          { type: "setTeamSize" as const, team: "B" as const, size: b },
        ].reduce(draftReducer, createDraft(INDEX));
        const built = buildSimulationRequest(draft, INDEX).request;
        expect(isTeamSimulationRequestShape(built), `${a}v${b}`).toBe(true);
      }
    }
  });

  it("rejects the endpoint's looser hand-written shape", () => {
    // Deliberate, and it is the safe direction. The captured Phase 4B bodies
    // are legal on the wire but this browser cannot produce them, so a slot
    // containing one was not written by this UI. Discarding it costs a
    // recovery that never existed; accepting it would mean offering to re-send
    // a body of unknown provenance under a stored key.
    for (const [shape, request] of Object.entries(REAL_REQUESTS)) {
      expect(isTeamSimulationRequestShape(request), shape).toBe(false);
    }
  });

  it("rejects a request missing a contract field, or carrying an extra one", () => {
    const missing = structuredClone(REQUEST) as Record<string, unknown>;
    delete missing.limits;
    expect(isTeamSimulationRequestShape(missing)).toBe(false);

    const extra = { ...structuredClone(REQUEST), surprise: true };
    expect(isTeamSimulationRequestShape(extra)).toBe(false);
  });

  it("rejects an empty team", () => {
    const empty = structuredClone(REQUEST);
    empty.team_b.combatants = [];
    expect(isTeamSimulationRequestShape(empty)).toBe(false);
  });
});
