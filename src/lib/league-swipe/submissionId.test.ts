import { describe, expect, it } from "vitest";
import { newSubmissionId } from "./submissionId";

/**
 * The value lands in a Postgres `uuid` column. "Random enough" is not the bar —
 * anything that is not a parseable UUID makes the RPC raise and the vote fail
 * outright, which is worse than the inert protection this replaces.
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newSubmissionId", () => {
  it("mints a valid RFC-4122 v4 UUID", () => {
    for (let i = 0; i < 50; i += 1) expect(newSubmissionId()).toMatch(UUID_V4);
  });

  it("mints a distinct id every call", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newSubmissionId()));
    expect(ids.size).toBe(500);
  });

  it("still mints VALID UUIDs without crypto.randomUUID", () => {
    // Non-secure contexts expose getRandomValues but not randomUUID. The
    // fallback must stay UUID-shaped there — see the note in submissionId.ts on
    // why this differs from combat-lab's printable-ASCII idempotency key.
    const original = globalThis.crypto?.randomUUID;
    try {
      if (globalThis.crypto) {
        (globalThis.crypto as { randomUUID?: unknown }).randomUUID = undefined;
      }
      const ids = new Set(Array.from({ length: 200 }, () => newSubmissionId()));
      expect(ids.size).toBe(200);
      for (const id of ids) expect(id).toMatch(UUID_V4);
    } finally {
      if (globalThis.crypto && original) globalThis.crypto.randomUUID = original;
    }
  });

  it("still mints valid UUIDs with no Web Crypto at all", () => {
    const original = globalThis.crypto;
    try {
      Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
      const ids = new Set(Array.from({ length: 200 }, () => newSubmissionId()));
      expect(ids.size).toBe(200);
      for (const id of ids) expect(id).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
