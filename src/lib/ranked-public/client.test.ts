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
