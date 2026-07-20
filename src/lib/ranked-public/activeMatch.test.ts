/**
 * Reconnect discovery: getActiveMatch recovers the caller's own active match
 * (including a bot match, which is never in the queue) after a full page reload.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveMatch } from "./client";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("getActiveMatch", () => {
  it("recovers an active bot match by account", async () => {
    const fetchMock = mockFetch(200, {
      schema_version: "ranked_duel.active_match.v1",
      active_match: { match_id: "rkb_abc", is_bot_match: true },
    });
    vi.stubGlobal("fetch", fetchMock);
    const found = await getActiveMatch();
    expect(found).toEqual({ matchId: "rkb_abc", isBotMatch: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/ranked/active-match");
  });

  it("recovers an active human match (is_bot_match false)", async () => {
    vi.stubGlobal("fetch", mockFetch(200, {
      active_match: { match_id: "m1", is_bot_match: false },
    }));
    expect(await getActiveMatch()).toEqual({ matchId: "m1", isBotMatch: false });
  });

  it("returns null when there is no active match", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { active_match: null }));
    expect(await getActiveMatch()).toBeNull();
  });

  it("returns null for a malformed active_match payload", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { active_match: { is_bot_match: true } }));
    expect(await getActiveMatch()).toBeNull();
  });
});
