/**
 * COM1-2 — blocking as a first-class relationship, at the hook boundary.
 *
 * The database owns the semantics (see
 * `src/test/security/com1CommunityReachability.test.ts` for the migration
 * contract, and the migration itself for the pair lock). What THIS suite pins
 * is the thing a client can still get wrong:
 *
 *   - block is ONE call. The old path was three round trips with no
 *     transaction, so "blocked but still a friend" was reachable. If a future
 *     edit reintroduces a second statement here, this fails.
 *   - unblock touches blocks and nothing else. No friendship is recreated.
 *   - a refused mutation never produces a success result.
 *   - `useFriendStatus` reads the canonical relationship RPC rather than
 *     re-deriving the answer from two tables it cannot fully see.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const server = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: server.rpc, from: server.from },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "auth-1" }, loading: false }),
}));

import { useBlocks } from "./useBlocks";
import { useFriendStatus } from "./useFriends";

/** A minimal PostgREST double: `profiles` resolves the caller, blocks list. */
function mockTables(blocks: { blocked_profile_id: string }[] = []) {
  server.from.mockImplementation((table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: chain,
      or: chain,
      in: chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: { id: "me" }, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        resolve(table === "user_blocks" ? { data: blocks, error: null } : { data: [], error: null }),
    });
    return b;
  });
}

beforeEach(() => {
  server.rpc.mockReset();
  server.from.mockReset();
  mockTables();
});
afterEach(() => vi.clearAllMocks());

describe("blockUser", () => {
  it("is ONE call — the block and the unfriend are not two client statements", async () => {
    server.rpc.mockResolvedValue({
      data: { ok: true, code: "blocked", friendships_removed: 1 },
      error: null,
    });
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    server.rpc.mockClear();
    const outcome = await result.current.blockUser("p-them");

    expect(outcome.ok).toBe(true);
    const writes = server.rpc.mock.calls.map(([fn]) => fn);
    expect(writes).toEqual(["block_profile"]);
    // And no PostgREST write went out alongside it.
    expect(server.rpc).toHaveBeenCalledWith("block_profile", { _target_profile_id: "p-them" });
  });

  it("removes an accepted friendship and a pending request alike — the RPC reports how many", async () => {
    // The client does not choose which rows go: the DELETE inside the RPC is
    // direction- and status-agnostic, so a pending request cannot survive as
    // something the other party could still accept.
    server.rpc.mockResolvedValue({
      data: { ok: true, code: "blocked", friendships_removed: 1 },
      error: null,
    });
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect((await result.current.blockUser("p-friend")).ok).toBe(true);
    expect((await result.current.blockUser("p-requester")).ok).toBe(true);
    const targets = server.rpc.mock.calls
      .filter(([fn]) => fn === "block_profile")
      .map(([, args]) => (args as { _target_profile_id: string })._target_profile_id);
    expect(targets).toEqual(["p-friend", "p-requester"]);
  });

  it("blocking twice is a success, not an error", async () => {
    server.rpc.mockResolvedValue({ data: { ok: true, code: "already" }, error: null });
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const outcome = await result.current.blockUser("p-them");
    expect(outcome.ok).toBe(true);
    expect(outcome.refetch).toBe(true);
  });

  it("a REFUSED block never reports success", async () => {
    server.rpc.mockResolvedValue({ data: { ok: false, code: "stale" }, error: null });
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const outcome = await result.current.blockUser("p-gone");
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("That profile is no longer available.");
  });

  it("re-reads the block list after the mutation", async () => {
    server.rpc.mockResolvedValue({ data: { ok: true, code: "blocked" }, error: null });
    mockTables([{ blocked_profile_id: "p-them" }]);
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.blockUser("p-them");
    await waitFor(() => expect(result.current.isBlocked("p-them")).toBe(true));
  });
});

describe("unblockUser", () => {
  it("removes the block and recreates NOTHING", async () => {
    server.rpc.mockResolvedValue({ data: { ok: true, code: "unblocked" }, error: null });
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    server.rpc.mockClear();
    const outcome = await result.current.unblockUser("p-them");

    expect(outcome.ok).toBe(true);
    // One call, and it is the unblock. A friendship insert here would silently
    // resurrect a relationship someone chose to end.
    expect(server.rpc.mock.calls.map(([fn]) => fn)).toEqual(["unblock_profile"]);
  });

  it("unblocking someone who is not blocked is idempotent", async () => {
    server.rpc.mockResolvedValue({ data: { ok: true, code: "already" }, error: null });
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect((await result.current.unblockUser("p-them")).ok).toBe(true);
  });

  it("a failed unblock never reports success", async () => {
    server.rpc.mockResolvedValue({ data: null, error: { message: "network" } });
    const { result } = renderHook(() => useBlocks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect((await result.current.unblockUser("p-them")).ok).toBe(false);
  });
});

describe("useFriendStatus reads the canonical relationship", () => {
  it("asks the RPC rather than re-deriving from friendships + user_blocks", async () => {
    server.rpc.mockResolvedValue({
      data: { relationship: "friends", friendship_id: "f-1", can_request: false },
      error: null,
    });
    const { result } = renderHook(() => useFriendStatus("p-them"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(server.rpc).toHaveBeenCalledWith("get_relationship_state", {
      _target_profile_id: "p-them",
    });
    expect(result.current.status).toBe("friends");
    expect(result.current.friendshipId).toBe("f-1");
  });

  it("maps every relationship onto the legacy FriendStatus union", async () => {
    const cases: Array<[string, string]> = [
      ["none", "none"],
      ["outgoing", "pending_sent"],
      ["incoming", "pending_received"],
      ["friends", "friends"],
      ["blocked", "blocked"],
      // Neither has a FriendStatus word; both offer no action.
      ["self", "none"],
      ["unavailable", "none"],
    ];
    for (const [relationship, expected] of cases) {
      server.rpc.mockResolvedValue({
        data: { relationship, friendship_id: null, can_request: relationship === "none" },
        error: null,
      });
      const { result, unmount } = renderHook(() => useFriendStatus("p-them"));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.status, relationship).toBe(expected);
      unmount();
    }
  });

  it("fails closed to `none` — never to a state that offers an action it cannot complete", async () => {
    server.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useFriendStatus("p-them"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("none");
    expect(result.current.friendshipId).toBeNull();
  });
});
