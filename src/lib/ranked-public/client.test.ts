import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicRoundV2, queueStatusV1 } from "./fixtures";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-jwt" }),
}));

import * as api from "./client";
import { RankedApiError } from "./client";

interface Call { url: string; init: RequestInit }
let calls: Call[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
});
afterEach(() => vi.unstubAllGlobals());

function stub(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch);
}

describe("public Ranked client", () => {
  it("attaches only the Bearer JWT and never an admin key or token", async () => {
    stub(() => json(queueStatusV1("waiting")));
    await api.getQueueStatus();
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer test-jwt");
    expect(JSON.stringify(h).toLowerCase()).not.toContain("x-admin-key");
    expect(JSON.stringify(h).toLowerCase()).not.toContain("player-token");
  });

  it("join sends only class_id, never a user/match/opponent id", async () => {
    stub(() => json(queueStatusV1("waiting")));
    await api.joinQueue("tank");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({ class_id: "tank" });
    expect("user_id" in body).toBe(false);
    expect("match_id" in body).toBe(false);
  });

  it("submit sends the answer index alone — no ability, no correctness", async () => {
    stub(() => json({ status: "accepted" }));
    await api.submitRound("m1", 2, 1);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({ round_number: 2, answer: 1 });
    // R3: the ability never travels with the answer, so one click is the lock.
    expect("ability_id" in body).toBe(false);
    expect("is_correct" in body).toBe(false);
    expect(calls[0].url).toContain("/api/ranked/matches/m1/rounds/2/submission");
    // No credentials in the URL.
    expect(calls[0].url).not.toContain("jwt");
  });

  it("the round ability route carries only the ability id", async () => {
    stub(() => json({ status: "accepted" }));
    await api.setRoundAbility("m1", 2, "tank.fortify");
    expect(JSON.parse(calls[0].init.body as string))
      .toEqual({ ability_id: "tank.fortify" });
    expect(calls[0].url).toContain("/api/ranked/matches/m1/rounds/2/ability");
  });

  it("clearing the ability sends an explicit null", async () => {
    stub(() => json({ status: "accepted" }));
    await api.setRoundAbility("m1", 2, null);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ ability_id: null });
  });

  it("GET public round parses the v2 envelope", async () => {
    stub(() => json(publicRoundV2()));
    const view = await api.getPublicRound("m1");
    expect(view.matchId).toBe("m1");
    expect(view.players).toHaveLength(2);
  });

  it("maps a typed backend error code", async () => {
    stub(() => json({ detail: { code: "RANKED_QUEUE_NOT_ELIGIBLE", message: "not in alpha" } }, 403));
    await expect(api.joinQueue("tank")).rejects.toMatchObject({
      code: "RANKED_QUEUE_NOT_ELIGIBLE", status: 403,
    });
  });

  it("classifies a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch);
    await expect(api.getQueueStatus()).rejects.toMatchObject({ kind: "network" });
  });

  it("surfaces an abort as a typed aborted error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const e = new Error("aborted"); e.name = "AbortError"; throw e;
    }) as unknown as typeof fetch);
    const err = await api.getQueueStatus().catch((e) => e);
    expect(api.isAborted(err)).toBe(true);
  });

  it("cancel uses DELETE", async () => {
    stub(() => json(queueStatusV1("cancelled")));
    await api.cancelQueue();
    expect(calls[0].init.method).toBe("DELETE");
  });

  it("isFatal flags non-participant and 404", () => {
    expect(api.isFatal(new RankedApiError("backend", 403, "x", "RANKED_NOT_A_PARTICIPANT"))).toBe(true);
    expect(api.isFatal(new RankedApiError("backend", 404, "gone"))).toBe(true);
    expect(api.isFatal(new RankedApiError("network", 0, "x"))).toBe(false);
  });
});

describe("R1 — the role endpoints and the class-free join", () => {
  it("GET /role reads the caller's own role, with no body and no user id", async () => {
    stub(() => json({ role: "jungle", selected_at: null, updated_at: null }));
    await expect(api.getRankedRole()).resolves.toEqual({
      role: "jungle", selectedAt: null, updatedAt: null,
    });
    expect(calls[0].url).toContain("/api/ranked/role");
    expect(calls[0].init.method ?? "GET").toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("PUT /role sends ONLY the role", async () => {
    stub(() => json({ role: "support", selected_at: null, updated_at: null }));
    await api.setRankedRole("support");
    expect(calls[0].url).toContain("/api/ranked/role");
    expect(calls[0].init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ role: "support" });
  });

  it("joining with a null class sends NO class field at all", async () => {
    stub(() => json(queueStatusV1("waiting")));
    await api.joinQueue(null);
    // Nothing about the player's identity travels — and nothing derived from
    // a role. The backend reads the role off the account itself.
    expect(JSON.parse(String(calls[0].init.body))).toEqual({});
  });

  it("surfaces RANKED_ROLE_REQUIRED as a typed, recognised code", async () => {
    stub(() => json({ detail: {
      code: "RANKED_ROLE_REQUIRED", message: "choose a Ranked role before queueing",
    } }, 409));
    await expect(api.joinQueue(null)).rejects.toMatchObject({
      code: "RANKED_ROLE_REQUIRED", status: 409,
    });
  });
});

/**
 * The ADMIN bot-testing request. It is an option on the ORDINARY join, not a
 * second endpoint: the retired `POST /api/ranked/bot-matches` was open to
 * every verified account, and one creation path with server-side
 * authorization replaces it.
 */
describe("match_with_bot", () => {
  it("is omitted entirely from an ordinary join", async () => {
    stub(() => json(queueStatusV1("waiting")));
    await api.joinQueue(null);
    expect("match_with_bot" in JSON.parse(String(calls[0].init.body))).toBe(false);
    await api.joinQueue(null, undefined, {});
    expect("match_with_bot" in JSON.parse(String(calls[1].init.body))).toBe(false);
    await api.joinQueue(null, undefined, { matchWithBot: false });
    expect("match_with_bot" in JSON.parse(String(calls[2].init.body))).toBe(false);
  });

  it("travels on the same queue POST when asked for", async () => {
    stub(() => json(queueStatusV1("waiting")));
    await api.joinQueue(null, undefined, { matchWithBot: true });
    expect(calls[0].url).toContain("/api/ranked/queue");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ match_with_bot: true });
  });

  it("reads the immediate match out of an ordinary matched queue status", async () => {
    // No bot-specific transport: the backend answers the join as an entry
    // that is ALREADY matched, which is a state the controller already has.
    stub(() => json(queueStatusV1("matched", "rkb_abc")));
    const status = await api.joinQueue(null, undefined, { matchWithBot: true });
    expect(status.status).toBe("matched");
    expect(status.matchId).toBe("rkb_abc");
  });

  it("surfaces a refused bot request as a typed code", async () => {
    stub(() => json({ detail: {
      code: "RANKED_BOT_NOT_AUTHORIZED",
      message: "matching with a bot is an admin-only testing path",
    } }, 403));
    await expect(api.joinQueue(null, undefined, { matchWithBot: true }))
      .rejects.toMatchObject({ code: "RANKED_BOT_NOT_AUTHORIZED", status: 403 });
  });
});

// ── the wire shape a Mastery answer travels in ────────────────────────────
//
// WHY THIS EXISTS. `mastery_slice.v1` answers were rejected in production with
// a bare "Request failed". The module was right, the renderer was right and the
// grader was right; the ROUTE SCHEMA had only ever learned `item_id`/`card_id`
// and is `extra="forbid"`, so `{"selected": …}` was a 422 before the service
// was reached. Nothing on either side pinned the body this call actually puts
// on the wire, which is the one place the two contracts have to agree.

describe("segment challenge submission", () => {
  // The ack is a flat object, not a versioned envelope.
  const ack = { status: "accepted", segment_number: 1, challenge_index: 0,
    next_challenge_index: 1, segment_resolved: false };

  it("posts a Mastery answer as `selected`, at the indexed challenge path", async () => {
    stub(() => json(ack));
    await api.submitSegmentChallenge("m1", 2, 0, { selected: "9" });
    expect(calls[0].url).toMatch(
      /\/api\/ranked\/matches\/m1\/segments\/2\/challenges\/0$/);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ selected: "9" });
  });

  it("keeps a boolean and a number a boolean and a number", async () => {
    // The server discriminates on the JSON type: a `true` sent as `"true"`, or
    // a `3` sent as `"3"`, changes which rule validates the answer and so
    // whether it grades as correct.
    stub(() => json(ack));
    await api.submitSegmentChallenge("m1", 1, 0, { selected: true });
    await api.submitSegmentChallenge("m1", 1, 1, { selected: 3 });
    expect(JSON.parse(calls[0].init.body as string).selected).toBe(true);
    expect(JSON.parse(calls[1].init.body as string).selected).toBe(3);
  });

  it("never sends a second choice spelling alongside it", async () => {
    stub(() => json(ack));
    await api.submitSegmentChallenge("m1", 1, 0, { selected: "9" });
    const body = JSON.parse(calls[0].init.body as string);
    // The server refuses a body naming two choices; the union makes sending
    // one impossible, and this is what says so.
    expect("item_id" in body).toBe(false);
    expect("card_id" in body).toBe(false);
  });

  it("still spells the item-cost and card choices the way it always did", async () => {
    stub(() => json(ack));
    await api.submitSegmentChallenge("m1", 1, 0, { cardId: "c2:left" });
    await api.submitSegmentChallenge("m1", 1, 1, { itemId: "Doran's Ring" });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ card_id: "c2:left" });
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ item_id: "Doran's Ring" });
  });

  it("carries no correctness, timing or index in the body", async () => {
    stub(() => json(ack));
    await api.submitSegmentChallenge("m1", 1, 4, { selected: "9" });
    const body = JSON.parse(calls[0].init.body as string);
    // The index is in the PATH and must equal the server's expected one.
    expect(Object.keys(body)).toEqual(["selected"]);
    expect(calls[0].url).toMatch(/\/challenges\/4$/);
  });
});
