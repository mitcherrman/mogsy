/**
 * COM1-1 / P0-2 — the outcome vocabulary.
 *
 * `classify` is the single place a database failure becomes a user-facing
 * sentence, so it is tested against the errors this schema actually raises:
 * the SQLSTATEs Postgres uses and the message vocabulary
 * `enforce_friendship_rules` (migration 20260730140000) raises by hand.
 */
import { describe, expect, it } from "vitest";
import {
  attempt,
  classify,
  failure,
  messageFor,
  SEND_REQUEST_MESSAGES,
  success,
} from "./social-result";

describe("classify", () => {
  it("treats no error as success", () => {
    expect(classify(null)).toBe("ok");
    expect(classify(undefined)).toBe("ok");
  });

  it("maps a unique violation to already-done", () => {
    // A second A->B request, or the reverse-direction partial unique index.
    expect(classify({ code: "23505", message: "duplicate key value" })).toBe("already");
  });

  it("recognises the block refusal the friendship trigger raises", () => {
    expect(classify({
      code: "23514",
      message: "friend request refused: a block exists between these profiles",
    })).toBe("refused");
  });

  it("recognises both friendship rate limits", () => {
    expect(classify({
      code: "23514", message: "friend request rate limit exceeded (max 10 per hour)",
    })).toBe("rate_limited");
    expect(classify({
      code: "23514", message: "too many open friend requests (max 20 outstanding)",
    })).toBe("rate_limited");
  });

  it("recognises an illegal transition as a stale view", () => {
    expect(classify({
      code: "23514", message: "illegal friendship transition: accepted -> accepted",
    })).toBe("stale");
  });

  it("maps an RLS refusal to forbidden", () => {
    expect(classify({ code: "42501", message: "new row violates row-level security policy" }))
      .toBe("forbidden");
  });

  it("maps a missing row to stale", () => {
    expect(classify({ code: "PGRST116", message: "0 rows" })).toBe("stale");
    expect(classify({ code: "23503", message: "foreign key violation" })).toBe("stale");
  });

  it("maps anything unrecognised to unavailable rather than guessing", () => {
    expect(classify({ code: "XX000", message: "internal error: tuple concurrently updated" }))
      .toBe("unavailable");
    expect(classify({})).toBe("unavailable");
  });

  it("still recognises our own trigger text when the SQLSTATE is absent", () => {
    expect(classify({ message: "friend request rate limit exceeded" })).toBe("rate_limited");
  });
});

describe("messages", () => {
  it("never returns a raw Postgres string", () => {
    const raw = 'duplicate key value violates unique constraint "friendships_unique_live_pair"';
    const result = failure(classify({ code: "23505", message: raw }));
    expect(result.error ?? "").not.toContain("friendships_unique_live_pair");
    expect(result.error ?? "").not.toContain("duplicate key");
  });

  it("does not disclose that the other party blocked the caller", () => {
    const message = messageFor("refused", SEND_REQUEST_MESSAGES);
    expect(message).toBe("That friend request could not be sent.");
    expect(message.toLowerCase()).not.toContain("block");
  });

  it("gives every failing code a finished sentence", () => {
    for (const code of ["refused", "rate_limited", "stale", "forbidden", "unavailable"] as const) {
      const result = failure(code);
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error!.endsWith(".")).toBe(true);
    }
  });
});

describe("attempt", () => {
  it("reports success only when the database returned no error", async () => {
    expect(await attempt(async () => ({ error: null }))).toEqual(success());
  });

  it("does NOT report success when the write was refused", async () => {
    const result = await attempt(
      async () => ({ code: "23514", message: "a block exists between these profiles" } as never)
        && ({ error: { code: "23514", message: "friend request refused: a block exists between these profiles" } }),
      SEND_REQUEST_MESSAGES,
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("refused");
    expect(result.error).toBe("That friend request could not be sent.");
  });

  it("treats an idempotent repeat as success, and asks for a refetch", async () => {
    const result = await attempt(async () => ({ error: { code: "23505", message: "dup" } }));
    expect(result.ok).toBe(true);
    expect(result.code).toBe("already");
    expect(result.refetch).toBe(true);
  });

  it("survives a thrown transport failure", async () => {
    const result = await attempt(async () => { throw new TypeError("Failed to fetch"); });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("unavailable");
    expect(result.error).toBe("Something went wrong. Try again.");
  });

  it("accepts a PostgREST builder, which is a thenable rather than a Promise", async () => {
    const thenable = {
      then: (resolve: (v: { error: unknown }) => void) => resolve({ error: null }),
    };
    expect(await attempt(() => thenable as never)).toEqual(success());
  });
});
