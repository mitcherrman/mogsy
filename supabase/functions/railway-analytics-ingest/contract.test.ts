/**
 * FUNNEL1B3.1 — what may enter analytics_events through the Railway ingest.
 *
 * The function's authority rules, tested as rules. `index.ts` is transport
 * around this file, so everything that decides whether a row is written — the
 * vocabulary, the entity model, the identity filter, the server-forced fields
 * — is covered here without a Deno runtime or a network.
 */

import { describe, it, expect } from "vitest";

import {
  ALLOWED_ENTITY_TYPES,
  ALLOWED_EVENTS,
  MAX_ENTITY_ID_LENGTH,
  MAX_METADATA_BYTES,
  bearerToken,
  isAttributableUserId,
  secretMatches,
  validateIngestBatch,
  validateIngestEvent,
} from "./contract";

const USER = "11111111-1111-4111-8111-111111111111";

const good = (overrides: Record<string, unknown> = {}) => ({
  event_name: "practice_quiz_started",
  source_entity_type: "quiz_session",
  source_entity_id: "1234",
  user_id: USER,
  is_guest: false,
  occurred_at: "2026-09-20T12:00:00.000Z",
  metadata: { mode: "standard" },
  ...overrides,
});

function ok(input: unknown) {
  const result = validateIngestEvent(input);
  if (!result.ok) throw new Error(`expected accept, got ${result.code}: ${result.message}`);
  return result.row;
}

function rejected(input: unknown) {
  const result = validateIngestEvent(input);
  if (result.ok) throw new Error("expected a rejection");
  return result;
}

// ---------------------------------------------------------------- vocabulary

describe("the approved vocabulary", () => {
  it("accepts each of the eight authoritative events and nothing else", () => {
    expect([...ALLOWED_EVENTS].sort()).toEqual([
      "dsa_completed",
      "dsa_started",
      "mastery_completed",
      "mastery_started",
      "practice_quiz_completed",
      "practice_quiz_started",
      "ranked_completed",
      "ranked_started",
    ]);
  });

  it.each([...ALLOWED_EVENTS])("accepts %s", (name) => {
    expect(ok(good({ event_name: name })).event_name).toBe(name);
  });

  it("rejects a browser event outright", () => {
    // The whole point of the split: Railway may not write acquisition events,
    // and the browser may not write gameplay ones.
    expect(rejected(good({ event_name: "landing_viewed" })).code).toBe("unknown_event");
    expect(rejected(good({ event_name: "signup_completed" })).code).toBe("unknown_event");
  });

  it("rejects an unknown but well-formed snake_case name", () => {
    // Arbitrary lower_snake_case is what the database's CHECK allows. This
    // function is narrower on purpose, so the vocabulary cannot drift from the
    // far side of an HTTP boundary.
    expect(rejected(good({ event_name: "ranked_abandoned" })).code).toBe("unknown_event");
  });

  it("rejects the brief's shorter practice spelling, which is not the frozen name", () => {
    // `practice_started` would be a second name for a fact that already has
    // one. See the note in contract.ts.
    expect(rejected(good({ event_name: "practice_started" })).code).toBe("unknown_event");
  });
});

// ------------------------------------------------------------ server-forced

describe("fields the caller does not get to choose", () => {
  it("forces source_system to railway even when the caller says otherwise", () => {
    const row = ok(good({ source_system: "web" } as Record<string, unknown>));
    // A leaked ingest secret still cannot forge a browser-origin row.
    expect(row.source_system).toBe("railway");
  });

  it("never lets a backend event claim a route", () => {
    const row = ok(good({ route: "/quiz" } as Record<string, unknown>));
    expect(row.route).toBeNull();
  });

  it("never lets a backend event claim a verification type", () => {
    const row = ok(good({ verification_type: "email" } as Record<string, unknown>));
    expect(row.verification_type).toBeNull();
  });

  it("builds the row rather than passing the caller's through", () => {
    const row = ok(good({ id: "attacker-chosen", received_at: "1999-01-01" } as Record<string, unknown>));
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("received_at");
  });
});

// ---------------------------------------------------------------- entities

describe("the entity model", () => {
  it("accepts exactly the four Railway owns", () => {
    expect([...ALLOWED_ENTITY_TYPES].sort()).toEqual([
      "dsa_run", "mastery_session", "quiz_session", "ranked_participant",
    ]);
  });

  it("accepts ranked_participant — the per-player key", () => {
    const row = ok(good({
      event_name: "ranked_completed",
      source_entity_type: "ranked_participant",
      source_entity_id: `match-1:${USER}`,
    }));
    expect(row.source_entity_id).toBe(`match-1:${USER}`);
  });

  it("rejects ranked_match, which would collapse both duellists into one row", () => {
    expect(rejected(good({
      event_name: "ranked_completed",
      source_entity_type: "ranked_match",
      source_entity_id: "match-1",
    })).code).toBe("invalid_entity_type");
  });

  it("requires an entity id", () => {
    expect(rejected(good({ source_entity_id: undefined })).code).toBe("invalid_entity_id");
    expect(rejected(good({ source_entity_id: "   " })).code).toBe("invalid_entity_id");
  });

  it("bounds the entity id", () => {
    expect(rejected(good({
      source_entity_id: "x".repeat(MAX_ENTITY_ID_LENGTH + 1),
    })).code).toBe("invalid_entity_id");
  });
});

// ---------------------------------------------------------------- identity

describe("identity", () => {
  it("keeps a real uuid", () => {
    expect(ok(good()).user_id).toBe(USER);
  });

  it("rejects a malformed user id rather than silently nulling it", () => {
    // A caller bug should be visible, not quietly turned into an unattributed
    // row that looks like a legitimate signed-out play.
    expect(rejected(good({ user_id: "not-a-uuid" })).code).toBe("invalid_user_id");
    expect(rejected(good({ user_id: 12345 })).code).toBe("invalid_user_id");
  });

  it("keeps the event but drops the attribution for known non-persons", () => {
    // A signed-out DSA practice run is a real gameplay fact; losing it to
    // protect one column would be the wrong trade.
    expect(ok(good({ user_id: "anonymous" })).user_id).toBeNull();
    expect(ok(good({ user_id: "bot::seed-1" })).user_id).toBeNull();
    expect(ok(good({ user_id: null })).user_id).toBeNull();
    expect(ok(good({ user_id: undefined })).user_id).toBeNull();
  });

  it("agrees with the Railway-side predicate", () => {
    expect(isAttributableUserId(USER)).toBe(true);
    expect(isAttributableUserId("anonymous")).toBe(false);
    expect(isAttributableUserId("bot::x")).toBe(false);
    expect(isAttributableUserId("")).toBe(false);
    expect(isAttributableUserId(null)).toBe(false);
  });

  it("carries the guest snapshot when supplied", () => {
    expect(ok(good({ is_guest: true })).is_guest).toBe(true);
    expect(ok(good({ is_guest: undefined })).is_guest).toBeNull();
  });
});

// ----------------------------------------------------------------- payload

describe("payload bounds", () => {
  it("defaults the version and rejects an unsupported one", () => {
    expect(ok(good({ event_version: undefined })).event_version).toBe(1);
    expect(rejected(good({ event_version: 2 })).code).toBe("unsupported_version");
  });

  it("normalises occurred_at and rejects nonsense", () => {
    expect(ok(good({ occurred_at: "2026-09-20T12:00:00Z" })).occurred_at)
      .toBe("2026-09-20T12:00:00.000Z");
    expect(rejected(good({ occurred_at: "yesterday" })).code).toBe("invalid_occurred_at");
  });

  it("defaults occurred_at rather than rejecting when it is absent", () => {
    expect(typeof ok(good({ occurred_at: undefined })).occurred_at).toBe("string");
  });

  it("bounds metadata below the table's own CHECK", () => {
    // Anything this accepts must be insertable, so the cap is deliberately
    // under the 8 KiB the column allows.
    expect(MAX_METADATA_BYTES).toBeLessThan(8192);
    expect(rejected(good({
      metadata: { blob: "x".repeat(MAX_METADATA_BYTES) },
    })).code).toBe("metadata_too_large");
  });

  it("rejects a non-object body", () => {
    expect(rejected("nope").code).toBe("not_an_object");
    expect(rejected(null).code).toBe("not_an_object");
    expect(rejected([1, 2]).code).toBe("not_an_object");
  });
});

// ------------------------------------------------------------------ batches

describe("batches", () => {
  it("accepts a bare array and the {events} envelope alike", () => {
    const a = validateIngestBatch([good()]);
    const b = validateIngestBatch({ events: [good()] });
    expect(a.ok && b.ok).toBe(true);
  });

  it("fails the whole batch on one bad member, naming the reason", () => {
    const result = validateIngestBatch([good(), good({ event_name: "nope" })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("unknown_event");
  });

  it("refuses an empty batch and an oversized one", () => {
    expect(validateIngestBatch([]).ok).toBe(false);
    expect(validateIngestBatch(Array.from({ length: 51 }, () => good())).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- the secret

describe("the shared secret", () => {
  it("accepts the exact secret and nothing near it", () => {
    expect(secretMatches("s3cret", "s3cret")).toBe(true);
    expect(secretMatches("s3crey", "s3cret")).toBe(false);
    expect(secretMatches("s3cre", "s3cret")).toBe(false);
    expect(secretMatches("s3cret ", "s3cret")).toBe(false);
  });

  it("refuses when either side is missing", () => {
    // A function deployed without its secret must not accept everything.
    expect(secretMatches(null, "s3cret")).toBe(false);
    expect(secretMatches("s3cret", null)).toBe(false);
    expect(secretMatches("", "")).toBe(false);
  });

  it("parses a bearer header and ignores anything else", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
