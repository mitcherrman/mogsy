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
  /**
   * COM1-2. Blocking moved from three PostgREST statements to one SECURITY
   * DEFINER RPC (`block_profile`), so the double needs an RPC surface. The
   * envelope returned for each function name, and the calls it recorded.
   */
  rpcResults: {} as Record<string, { data: unknown; error: unknown }>,
  rpcCalls: [] as string[],
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
      rpc: async (fn: string) => {
        mocks.rpcCalls.push(fn);
        return mocks.rpcResults[fn] ?? { data: { ok: true, code: "ok" }, error: null };
      },
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
  mocks.rpcResults = {};
  mocks.rpcCalls = [];
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
  /**
   * COM1-2 REPLACED THE MECHANISM THIS SECTION ORIGINALLY TESTED.
   *
   * COM1-1 could only make the block path HONEST — it was three unsynchronised
   * PostgREST statements (insert the block, read the friendships, delete them)
   * and the ordering assertion below used to read "blocks BEFORE unfriending,
   * so a partial failure still protects the user". That was the best available
   * mitigation for a gap that could not be closed client-side, and the hook
   * said so in a comment.
   *
   * There is no partial failure to protect against any more: `block_profile`
   * does both writes in one transaction under a pair-scoped advisory lock. So
   * the ordering test is replaced by a stronger one — that there is only ONE
   * write at all. The outcome assertions are unchanged in intent.
   */
  it("does not report success when the block was refused", async () => {
    mocks.rpcResults.block_profile = { data: { ok: false, code: "forbidden" }, error: null };
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    const outcome = await result.current.blockUser("them");
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("forbidden");
  });

  it("does not report success when the call itself failed", async () => {
    mocks.rpcResults.block_profile = { data: null, error: { message: "network" } };
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));
    expect((await result.current.blockUser("them")).ok).toBe(false);
  });

  it("reports success when the block lands", async () => {
    mocks.rpcResults.block_profile = {
      data: { ok: true, code: "blocked", friendships_removed: 1 },
      error: null,
    };
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));
    expect((await result.current.blockUser("them")).ok).toBe(true);
  });

  it("is ONE write — the block and the unfriend cannot come apart", async () => {
    mocks.rpcResults.block_profile = { data: { ok: true, code: "blocked" }, error: null };
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    mocks.writes = [];
    mocks.rpcCalls = [];
    await result.current.blockUser("them");

    expect(mocks.rpcCalls).toEqual(["block_profile"]);
    // No direct table write accompanies it. A `user_blocks` insert or a
    // `friendships` delete here would be the old non-atomic path returning.
    expect(mocks.writes).toEqual([]);
  });

  it("treats blocking twice as already done", async () => {
    mocks.rpcResults.block_profile = { data: { ok: true, code: "already" }, error: null };
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    const outcome = await result.current.blockUser("them");
    expect(outcome.ok).toBe(true);
    expect(outcome.code).toBe("already");
  });

  it("unblock restores eligibility without recreating a friendship", async () => {
    mocks.rpcResults.unblock_profile = { data: { ok: true, code: "unblocked" }, error: null };
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.myProfileId).toBe("me"));

    mocks.writes = [];
    mocks.rpcCalls = [];
    expect((await result.current.unblockUser("them")).ok).toBe(true);
    expect(mocks.rpcCalls).toEqual(["unblock_profile"]);
    expect(mocks.writes).toEqual([]);
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
