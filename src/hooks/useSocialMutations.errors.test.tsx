/**
 * COM1-1 / P0-2 — a refused social write must never read as a success.
 *
 * These are the exact production failures the audit found silently swallowed:
 *
 *  - a friend request to someone who has blocked the caller. `useFriendStatus`
 *    cannot see that block (RLS on `user_blocks` shows a caller only their own
 *    rows), so the button offers "Add Friend", `enforce_friendship_rules`
 *    refuses the insert, and the old code dropped the error on the floor.
 *  - `blockUser` and `reportUser`, which returned `undefined` on every path and
 *    could not throw, so their callers toasted success unconditionally.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  /** Error returned by the next write to this table, keyed by table name. */
  writeErrors: {} as Record<string, unknown>,
  writes: [] as string[],
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "auth-me" } }) }));

vi.mock("@/lib/league-profiles", () => ({ fetchLeagueProfiles: async () => [] }));

vi.mock("@/integrations/supabase/client", () => {
  const writeResult = (table: string) => {
    mocks.writes.push(table);
    return { error: mocks.writeErrors[table] ?? null };
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "me" }, error: null }),
                maybeSingle: async () => ({ data: { id: "me" }, error: null }),
              }),
            }),
          };
        }
        const chain: Record<string, unknown> = {
          // Reads
          select: () => ({
            eq: Object.assign(
              async () => ({ data: [], error: null }),
              { eq: async () => ({ data: [], error: null }) },
            ),
            or: async () => ({ data: [], error: null }),
          }),
          // Writes — each resolves with the table's configured error.
          insert: async () => writeResult(table),
          update: () => ({ eq: async () => writeResult(table) }),
          delete: () => ({
            eq: Object.assign(
              async () => writeResult(table),
              { eq: async () => writeResult(table) },
            ),
            in: async () => writeResult(table),
          }),
        };
        return chain;
      },
    },
  };
});

import { useFriends } from "./useFriends";
import { useBlocks, useReportUser } from "./useBlocks";

const BLOCK_REFUSAL = {
  code: "23514",
  message: "friend request refused: a block exists between these profiles",
};

beforeEach(() => {
  mocks.writeErrors = {};
  mocks.writes = [];
});
afterEach(cleanup);

describe("friend request against a block", () => {
  it("reports failure instead of pretending success", async () => {
    mocks.writeErrors.friendships = BLOCK_REFUSAL;
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    const outcome = await result.current.sendRequest("them");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("refused");
    expect(outcome.error).toBe("That friend request could not be sent.");
  });

  it("does not disclose the block, or any Postgres text", async () => {
    mocks.writeErrors.friendships = BLOCK_REFUSAL;
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    const outcome = await result.current.sendRequest("them");
    expect(outcome.error!.toLowerCase()).not.toContain("block");
    expect(outcome.error).not.toContain("23514");
    expect(outcome.error).not.toContain("profiles");
  });

  it("still reports success when the insert lands", async () => {
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));
    expect((await result.current.sendRequest("them")).ok).toBe(true);
  });

  it("reports a rate limit as its own outcome", async () => {
    mocks.writeErrors.friendships = {
      code: "23514", message: "friend request rate limit exceeded (max 10 per hour)",
    };
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    const outcome = await result.current.sendRequest("them");
    expect(outcome.code).toBe("rate_limited");
    expect(outcome.ok).toBe(false);
  });
});

describe("accept / decline / remove", () => {
  it("reports a refused accept", async () => {
    mocks.writeErrors.friendships = {
      code: "23514", message: "illegal friendship transition: accepted -> accepted",
    };
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    const outcome = await result.current.acceptRequest("f1");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("stale");
    expect(outcome.refetch).toBe(true);
  });

  it("treats a delete that matched nothing as done, not as an error", async () => {
    const { result } = renderHook(() => useFriends());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));
    expect((await result.current.removeFriend("gone")).ok).toBe(true);
  });
});

describe("block", () => {
  it("does not report success when the block itself was refused", async () => {
    mocks.writeErrors.user_blocks = { code: "42501", message: "row-level security" };
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    const outcome = await result.current.blockUser("them");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("forbidden");
  });

  it("reports success when the block lands", async () => {
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));
    expect((await result.current.blockUser("them")).ok).toBe(true);
  });

  it("blocks BEFORE unfriending, so a partial failure still protects the user", async () => {
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));
    mocks.writes = [];
    await result.current.blockUser("them");
    expect(mocks.writes[0]).toBe("user_blocks");
  });

  it("treats blocking twice as already done", async () => {
    mocks.writeErrors.user_blocks = { code: "23505", message: "duplicate key" };
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    const outcome = await result.current.blockUser("them");
    expect(outcome.ok).toBe(true);
    expect(outcome.code).toBe("already");
  });
});

describe("report", () => {
  it("does not report success when the insert was refused", async () => {
    mocks.writeErrors.user_reports = { code: "42501", message: "row-level security" };
    const { result } = renderHook(() => useReportUser());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    const outcome = await result.current.reportUser("them", "spam");
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeTruthy();
  });

  it("reports success when the insert lands", async () => {
    const { result } = renderHook(() => useReportUser());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));
    expect((await result.current.reportUser("them", "spam")).ok).toBe(true);
  });
});
