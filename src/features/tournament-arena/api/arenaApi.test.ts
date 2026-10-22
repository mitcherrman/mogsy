import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({ getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }) }));

import {
  ArenaApiError, arenaErrorCopy, createArenaEvent, getArenaEvent, isTerminalArenaError, playArenaNode,
  resolveArenaJoinCode, adminOverrideArenaNode, newArenaActionId,
} from "./arenaApi";
import { serverEvent } from "./serverFixtures";

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function respond(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

beforeEach(() => { calls = []; });
afterEach(() => { vi.restoreAllMocks(); });

describe("arenaApi — reads", () => {
  it("validates the projection and sends the account bearer, never minting", async () => {
    respond(200, serverEvent());
    const r = await getArenaEvent("aev_x", 3);
    expect(r.unchanged).toBe(false);
    expect(calls[0].url).toMatch(/\/api\/arena\/events\/aev_x\?since_revision=3$/);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("reports an unchanged revision without a projection", async () => {
    respond(200, { unchanged: true, revision: 4, server_now: "x" });
    expect(await getArenaEvent("aev_x", 4)).toEqual({ unchanged: true, revision: 4 });
  });

  it("refuses a body that is not arena_event.v1 (never a partial render)", async () => {
    respond(200, { ...serverEvent(), user_id: "leak" });
    await expect(getArenaEvent("aev_x")).rejects.toMatchObject({ code: "ARENA_BAD_RESPONSE" });
  });

  it("maps the backend's typed error to code + copy", async () => {
    respond(404, { detail: { code: "ARENA_DISABLED", message: "Not found." } });
    const err = await resolveArenaJoinCode("ABCD2345").catch((e) => e);
    expect(err).toBeInstanceOf(ArenaApiError);
    expect(err.code).toBe("ARENA_DISABLED");
    expect(isTerminalArenaError(err)).toBe(true);
    expect(arenaErrorCopy(err)).toMatch(/not open/i);
  });

  it("treats a network failure as retryable, with finished copy", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("offline"); }) as typeof fetch;
    const err = await getArenaEvent("aev_x").catch((e) => e);
    expect(err.code).toBe("NETWORK");
    expect(isTerminalArenaError(err)).toBe(false);
    expect(arenaErrorCopy(err)).toMatch(/could not be reached/i);
  });
});

describe("arenaApi — mutations", () => {
  it("play: a first press answers waiting, with no match id", async () => {
    respond(200, { match_id: null, created: false, waiting_for_opponent: true, event: serverEvent({}, { ready_profile_ids: ["prof-a"] }) });
    const out = await playArenaNode("aev_x", "r1n1", "press-1234");
    expect(out).toMatchObject({ match_id: null, waiting_for_opponent: true, created: false });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ action_id: "press-1234" });
  });

  it("create: strips the echoed game_type from rules and sends a capacity only for tournaments", async () => {
    respond(200, serverEvent({ viewer_can_manage: true, join_code: "ABCD2345" }));
    await createArenaEvent({
      kind: "duel", title: "t", game_type: "ranked_quiz",
      rules: { game_type: "ranked_quiz", modules: 3, ruleset: "standard" }, best_of: 1, max_entrants: 8,
      visibility: "private", organizer_plays: true,
    }, "create-1234");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.rules).toEqual({ modules: 3, ruleset: "standard" });
    expect(body.max_entrants).toBeUndefined();
    expect(body.action_id).toBe("create-1234");
    expect(calls[0].init.method).toBe("POST");
  });

  it("owner override goes to the admin route", async () => {
    respond(200, serverEvent({ viewer_can_manage: true }));
    await adminOverrideArenaNode("aev_x", "r1n1", "prof-b", "dispute", "ovr-12345678");
    expect(calls[0].url).toMatch(/\/api\/arena\/admin\/events\/aev_x\/nodes\/r1n1\/override$/);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ winner_profile_id: "prof-b", note: "dispute" });
  });

  it("an organizer refusal reads as administrator-only copy", async () => {
    respond(403, { detail: { code: "ARENA_ORGANIZER_REQUIRED", message: "x" } });
    const err = await createArenaEvent({ kind: "duel", title: "t", game_type: "ranked_quiz", rules: {}, best_of: 1, visibility: "private", organizer_plays: true }).catch((e) => e);
    expect(arenaErrorCopy(err)).toBe("Only a Mogzy administrator can do this.");
  });

  it("mints action ids the backend schema accepts", () => {
    for (let i = 0; i < 20; i++) expect(newArenaActionId("lock")).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });
});
