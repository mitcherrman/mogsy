/**
 * ROG1-D1 — the Dynasty client against REAL ROG1-C1 backend responses
 * (`./fixtures`, captured from `routes/dynasty_run.py` at b2f41603, PR #36).
 */
import { describe, expect, it, vi } from "vitest";
import { DynastyContractError, readDynastySnapshot, type DynastySnapshot } from "./contracts";
import { DynastyApiError, httpDynastyTransport, readErrorBody } from "./client";
import { DYNASTY_SCENARIOS, createFixtureTransport } from "./fixtureTransport";
import { groupTeamComponents, matchView, rollWindow } from "./model";
import errors from "./fixtures/errors.json";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

const allResponses = Object.values(DYNASTY_SCENARIOS).flatMap((run) => run.steps.map((s) => s.response));
const completed = Object.values(DYNASTY_SCENARIOS).map((run) => readDynastySnapshot(run.steps[run.steps.length - 1].response));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe("contract: recorded backend responses", () => {
  it("parses every recorded snapshot, in every phase", () => {
    const phases = new Set(allResponses.map((r) => readDynastySnapshot(r).phase));
    expect([...phases].sort()).toEqual(["completed", "draft", "lineup", "relic"]);
  });

  it("never receives a seed", () => {
    for (const r of allResponses) expect(JSON.stringify(r)).not.toMatch(/"seed"|wds_/);
  });

  it("covers the three outcomes the page must explain", () => {
    expect(completed.map((s) => `${s.match!.outcome} ${s.match!.points.user}-${s.match!.points.opponent}`).sort())
      .toEqual(["lost 3-4", "won 4-3", "won 7-0"]);
    expect(completed.some((s) => s.match!.result.lanes.some((l) => l.history.length > 1))).toBe(true);
  });

  it("refuses snapshots it cannot render safely", () => {
    const base = DYNASTY_SCENARIOS.full.steps[0].response as Record<string, unknown>;
    const bad: [string, (s: Record<string, unknown>) => void][] = [
      ["schema", (s) => { s.schema_version = 2; }],
      ["seq", (s) => { delete s.seq; }],
      ["phase", (s) => { s.phase = "tournament"; }],
      ["action", (s) => { s.allowed_actions = ["grant_modifier"]; }],
      ["early match", (s) => { s.match = { outcome: "won" }; }],
      ["empty offer", (s) => { (s.draft as Record<string, unknown>).offer = []; }],
    ];
    for (const [name, mutate] of bad) {
      const s = clone(base);
      mutate(s);
      expect(() => readDynastySnapshot(s), name).toThrow(DynastyContractError);
    }
    const flipped = clone(completed[0]) as unknown as Record<string, unknown>;
    ((flipped.match as Record<string, unknown>).result as Record<string, unknown>).team_a = "ai-1";
    expect(() => readDynastySnapshot(flipped)).toThrow(/side a/);
  });
});

describe("model: explanations agree with the backend's own decisions", () => {
  it("every recorded roll's window reproduces the backend winner (lanes, re-rolls, team battle)", () => {
    let checked = 0;
    for (const s of completed) {
      for (const lane of s.match!.result.lanes) {
        for (const h of lane.history) {
          expect(rollWindow(h).userWon).toBe(h.winner === "a");
          checked += 1;
        }
        expect(rollWindow(lane.history[lane.history.length - 1]).userWon).toBe(lane.winner === "a");
      }
      const t = s.match!.result.team_battle;
      expect(rollWindow(t).userWon).toBe(t.winner === "a");
    }
    expect(checked).toBeGreaterThanOrEqual(16);
  });

  it("the backend's points equal 1 per lane won plus 2 for the team battle", () => {
    for (const s of completed) {
      const v = matchView(s.match!);
      const you = v.lanes.filter((l) => l.youWon).length + (v.team.youWon ? 2 : 0);
      expect(v.points.you).toBe(you);
      expect(v.points.you + v.points.them).toBe(7);
      expect(v.outcome === "won").toBe(v.points.you >= 4);
      expect(v.lanes.map((l) => l.role)).toEqual(["top", "jng", "mid", "bot", "sup"]);
    }
  });

  it("strength components sum to the backend's power totals", () => {
    for (const s of completed) {
      const v = matchView(s.match!);
      for (const lane of v.lanes) {
        expect(lane.you.components.reduce((a, c) => a + c.value, 0)).toBeCloseTo(lane.you.power, 6);
        expect(lane.them.components.reduce((a, c) => a + c.value, 0)).toBeCloseTo(lane.them.power, 6);
      }
      const groups = groupTeamComponents(v.team.you.components);
      expect(groups.reduce((a, g) => a + g.total, 0)).toBeCloseTo(v.team.you.power, 6);
    }
  });
});

describe("HTTP transport", () => {
  function fakeFetch(status: number, body: unknown) {
    return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  }

  it("sends the exact ROG1-C1 request shapes with owner headers", async () => {
    const snap = DYNASTY_SCENARIOS.full.steps[0].response;
    const f = fakeFetch(200, snap);
    const t = httpDynastyTransport(f as unknown as typeof fetch);
    await t.start("wd-start-abcdef12");
    await t.read("wdr_d41e93a43c1bd45d15046b18");
    await t.act("wdr_d41e93a43c1bd45d15046b18", {
      expected_seq: 0, action_id: "wd-draft_pick-1234", kind: "draft_pick", payload: { player_id: "syn-top-09" },
    });
    const [start, read, act] = f.mock.calls;
    expect(start[0]).toBe("http://backend.test/api/admin/dynasty/runs");
    expect(start[1]!.method).toBe("POST");
    expect(JSON.parse(start[1]!.body as string)).toEqual({ start_key: "wd-start-abcdef12" });
    expect((start[1]!.headers as Record<string, string>).Authorization).toBe("Bearer owner-session");
    expect(read[0]).toBe("http://backend.test/api/admin/dynasty/runs/wdr_d41e93a43c1bd45d15046b18");
    expect(read[1]!.method).toBe("GET");
    expect(act[0]).toBe("http://backend.test/api/admin/dynasty/runs/wdr_d41e93a43c1bd45d15046b18/actions");
    expect(JSON.parse(act[1]!.body as string)).toEqual({
      expected_seq: 0, action_id: "wd-draft_pick-1234", kind: "draft_pick", payload: { player_id: "syn-top-09" },
    });
  });

  it.each([
    ["stale_seq", 409, "STALE_SEQ"],
    ["action_id_reused", 409, "ACTION_ID_REUSED"],
    ["not_offered", 422, "NOT_OFFERED"],
    ["champion_taken", 422, "CHAMPION_TAKEN"],
    ["disabled", 404, "DYNASTY_DISABLED"],
    ["not_found", 404, "DYNASTY_RUN_NOT_FOUND"],
    ["bad_body", 422, "BAD_REQUEST"],
  ] as const)("maps the recorded %s error", async (name, status, code) => {
    const rec = (errors as Record<string, { status: number; body: unknown }>)[name];
    expect(rec.status).toBe(status);
    const t = httpDynastyTransport(fakeFetch(rec.status, rec.body) as unknown as typeof fetch);
    const err = await t.read("wdr_x").catch((e) => e);
    expect(err).toBeInstanceOf(DynastyApiError);
    expect(err).toMatchObject({ kind: "backend", status, code });
  });

  it("separates an unreachable backend from an unreadable answer", async () => {
    const down = httpDynastyTransport(vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch);
    await expect(down.read("wdr_x")).rejects.toMatchObject({ kind: "network", code: null });
    const odd = httpDynastyTransport(fakeFetch(200, { hello: "world" }) as unknown as typeof fetch);
    await expect(odd.read("wdr_x")).rejects.toMatchObject({ kind: "invalid_response" });
    expect(readErrorBody(502, null)).toEqual({ code: null, message: "Backend returned 502." });
  });
});

describe("recorded-path fixture transport", () => {
  async function started() {
    const t = createFixtureTransport();
    const s = await t.start("wd-start-test0001");
    return { t, s };
  }
  const pick = (s: DynastySnapshot, id: string, actionId = "wd-test-0001") =>
    ({ expected_seq: s.seq, action_id: actionId, kind: "draft_pick" as const, payload: { player_id: id } });

  it("applies only the recorded choice and behaves like the backend otherwise", async () => {
    const { t, s } = await started();
    await expect(t.act(s.run_id, pick(s, "syn-top-08"))).rejects.toMatchObject({ code: "FIXTURE_OFF_PATH" });
    await expect(t.act(s.run_id, { ...pick(s, "syn-top-09"), expected_seq: 3 })).rejects.toMatchObject({ status: 409, code: "STALE_SEQ" });
    const next = await t.act(s.run_id, pick(s, "syn-top-09"));
    expect(next.seq).toBe(1);
    const dup = await t.act(s.run_id, pick(s, "syn-top-09"));
    expect(dup).toMatchObject({ seq: 1, duplicate: true });
    await expect(t.act(s.run_id, { ...pick(next, "syn-jng-07"), action_id: "wd-test-0001" }))
      .rejects.toMatchObject({ code: "ACTION_ID_REUSED" });
    await expect(t.act(s.run_id, { ...pick(next, "x"), kind: "play_match", payload: {}, action_id: "wd-test-0002" }))
      .rejects.toMatchObject({ code: "WRONG_PHASE" });
  });
});
