/**
 * COM1-2 — the discovery and block client layer.
 *
 * The RPCs enforce the real rules; these tests cover the seam between the
 * server's answer and what the rest of the app is handed:
 *
 *   - a row is NARROWED, so a column the RPC gains later cannot reach the UI
 *     just by existing (and `user_id` cannot reach it at all),
 *   - an unrecognised relationship string does NOT become "none", which would
 *     render an "Add Friend" button for a state nobody understands,
 *   - the `{ok, code}` envelope becomes a `SocialResult`, so a refused write
 *     can never be reported as a success,
 *   - a query below the minimum is not sent at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import {
  MIN_SEARCH_LENGTH,
  blockProfile,
  fetchBlockedProfiles,
  fetchRelationshipState,
  isSearchable,
  normalizeQuery,
  searchPlayers,
  unblockProfile,
} from "./discovery";

/** A complete row as `search_league_profiles` returns it, plus a decoy. */
function serverRow(over: Record<string, unknown> = {}) {
  return {
    id: "p-ashe",
    display_name: "Ashe",
    avatar_url: "https://cdn/a.png",
    profile_frame: "gold",
    is_pro: true,
    is_bot: false,
    is_anonymous: false,
    created_at: "2026-01-01T00:00:00Z",
    is_disabled: false,
    relationship: "none",
    friendship_id: null,
    match_rank: 0,
    // Not in the RPC's contract. Present here to prove the narrowing drops
    // anything unnamed — including the identifier this whole phase withholds.
    user_id: "auth-uid-that-must-not-escape",
    admin_notes: "SECRET",
    ...over,
  };
}

beforeEach(() => rpc.mockReset());
afterEach(() => vi.clearAllMocks());

describe("query normalisation matches the AUTH3 comparison form", () => {
  it("collapses whitespace, trims and lower-cases", () => {
    expect(normalizeQuery("  As   HE  ")).toBe("as he");
  });

  it("treats a whitespace-only query as no query", () => {
    expect(normalizeQuery("   ")).toBe("");
    expect(isSearchable("   ")).toBe(false);
  });

  it("requires the same minimum the RPC enforces", () => {
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable("ab")).toBe(true);
    expect(MIN_SEARCH_LENGTH).toBe(2);
  });
});

describe("searchPlayers", () => {
  it("does not call the server for a query below the minimum", async () => {
    const outcome = await searchPlayers("a");
    expect(rpc).not.toHaveBeenCalled();
    // `searched: false` is what lets the UI say "keep typing" rather than
    // "no players found", which would be a lie about an unasked question.
    expect(outcome).toEqual({ results: [], searched: false });
  });

  it("sends the RAW query, so the server does the normalising", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await searchPlayers("  AsHe ", 5);
    expect(rpc).toHaveBeenCalledWith("search_league_profiles", {
      _query: "  AsHe ",
      _limit: 5,
    });
  });

  it("narrows every row and drops user_id", async () => {
    rpc.mockResolvedValue({ data: [serverRow()], error: null });
    const { results } = await searchPlayers("ashe");
    expect(results).toHaveLength(1);
    const row = results[0];
    expect(row.displayName).toBe("Ashe");
    expect(row.isPro).toBe(true);
    expect(row.relationship).toBe("none");
    expect(Object.keys(row).sort()).toEqual([
      "avatarUrl",
      "createdAt",
      "displayName",
      "friendshipId",
      "id",
      "isAnonymous",
      "isBot",
      "isPro",
      "matchRank",
      "profileFrame",
      "relationship",
    ]);
    expect(JSON.stringify(row)).not.toContain("auth-uid-that-must-not-escape");
    expect(JSON.stringify(row)).not.toContain("SECRET");
  });

  it("carries the friendship id so an incoming request can be accepted in place", async () => {
    rpc.mockResolvedValue({
      data: [serverRow({ relationship: "incoming", friendship_id: "f-1" })],
      error: null,
    });
    const { results } = await searchPlayers("ashe");
    expect(results[0].relationship).toBe("incoming");
    expect(results[0].friendshipId).toBe("f-1");
  });

  it("degrades an unknown relationship to `unavailable`, never to `none`", async () => {
    // `none` renders "Add Friend". A state this build does not understand must
    // offer nothing, not the most permissive thing.
    rpc.mockResolvedValue({ data: [serverRow({ relationship: "quantum" })], error: null });
    const { results } = await searchPlayers("ashe");
    expect(results[0].relationship).toBe("unavailable");
  });

  it("reports a transport failure without leaking server text", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42P01", message: 'relation "profiles" does not exist' },
    });
    const outcome = await searchPlayers("ashe");
    expect(outcome.results).toEqual([]);
    expect(outcome.searched).toBe(true);
    expect(outcome.error).toBe("Search is unavailable right now.");
    expect(outcome.error).not.toContain("relation");
  });

  it("survives a non-array payload", async () => {
    rpc.mockResolvedValue({ data: { nope: true }, error: null });
    expect((await searchPlayers("ashe")).results).toEqual([]);
  });
});

describe("fetchRelationshipState", () => {
  it("fails CLOSED on a transport error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await fetchRelationshipState("p-1")).toEqual({
      relationship: "unavailable",
      friendshipId: null,
      canRequest: false,
    });
  });

  it("does not call the server without a target", async () => {
    expect(await fetchRelationshipState(undefined)).toEqual({
      relationship: "unavailable",
      friendshipId: null,
      canRequest: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reads the envelope the RPC returns", async () => {
    rpc.mockResolvedValue({
      data: { relationship: "outgoing", friendship_id: "f-9", can_request: false },
      error: null,
    });
    expect(await fetchRelationshipState("p-1")).toEqual({
      relationship: "outgoing",
      friendshipId: "f-9",
      canRequest: false,
    });
  });
});

describe("fetchBlockedProfiles", () => {
  it("returns the caller's blocks, narrowed", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: "p-x",
          display_name: "Nuisance",
          avatar_url: null,
          blocked_at: "2026-08-01T00:00:00Z",
          user_id: "auth-leak",
        },
      ],
      error: null,
    });
    const rows = await fetchBlockedProfiles();
    expect(rows).toEqual([
      { id: "p-x", displayName: "Nuisance", avatarUrl: null, blockedAt: "2026-08-01T00:00:00Z" },
    ]);
    expect(JSON.stringify(rows)).not.toContain("auth-leak");
  });

  it("renders nothing rather than throwing when the read fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    expect(await fetchBlockedProfiles()).toEqual([]);
  });
});

describe("blockProfile / unblockProfile envelopes", () => {
  it("calls one RPC — the block and the unfriend are not two round trips", async () => {
    rpc.mockResolvedValue({ data: { ok: true, code: "blocked", friendships_removed: 1 }, error: null });
    const result = await blockProfile("p-2");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("block_profile", { _target_profile_id: "p-2" });
    expect(result).toEqual({ ok: true, code: "ok" });
  });

  it("treats an existing block as success, flagged for refetch", async () => {
    rpc.mockResolvedValue({ data: { ok: true, code: "already" }, error: null });
    expect(await blockProfile("p-2")).toEqual({ ok: true, code: "already", refetch: true });
  });

  it("NEVER reports success when the RPC refused", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "stale" }, error: null });
    const result = await blockProfile("p-gone");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("stale");
    expect(result.error).toBeTruthy();
  });

  it("NEVER reports success when the transport failed", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "network" } });
    const result = await blockProfile("p-2");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Something went wrong. Try again.");
  });

  it("refuses a malformed envelope rather than assuming it worked", async () => {
    rpc.mockResolvedValue({ data: "yes", error: null });
    expect((await blockProfile("p-2")).ok).toBe(false);
  });

  it("unblocking someone not blocked is a success, not an error", async () => {
    rpc.mockResolvedValue({ data: { ok: true, code: "already" }, error: null });
    const result = await unblockProfile("p-2");
    expect(result.ok).toBe(true);
    expect(result.refetch).toBe(true);
  });

  it("unblock is a single call that names no friendship", async () => {
    rpc.mockResolvedValue({ data: { ok: true, code: "unblocked" }, error: null });
    await unblockProfile("p-2");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("unblock_profile", { _target_profile_id: "p-2" });
  });
});
