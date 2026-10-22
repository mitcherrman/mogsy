/**
 * UX-6 — contract test of the live transport on an E3A management series,
 * against REAL responses (`fixtures/e3a-live-capture.json`, captured from a
 * local backend running E3A bc928207 with `scripts/dynasty/capture_ux6_e3a_live.py`).
 * If the E3A schema, the request shapes or the mapping drift, these fail first.
 */
import { describe, expect, it, vi } from "vitest";
import capture from "./fixtures/e3a-live-capture.json";
import e2capture from "./fixtures/e2-live-capture.json";
import { TransportError } from "./contracts";
import { E2ContractError, isManaged, readE2SeriesList, readE2Snapshot, type E2SeriesSnapshot } from "./e2contracts";
import { emptyLocal, mapE2ToEnvelope } from "./e2mapper";
import { MANAGEMENT_RULES_E3A, isManagementComponent, readE3aManagement, type E3aActivity } from "./e3acontracts";
import { memoryStore } from "./fixtureServer";
import { LIVE_STORE_KEY, LiveSeriesTransport } from "./liveTransport";
import { influenceRows } from "@/pages/dev/dynasty-v2/bo5/managementView";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

type Req = { expected_seq: number; action_id: string; kind: string; payload: Record<string, unknown> };
type Sample = { state: string; status?: number; request: Req | Record<string, unknown> | null; response: unknown };
const SAMPLES = (capture as unknown as { samples: Sample[]; plan: E3aActivity[] }).samples;
const PLAN = (capture as unknown as { plan: E3aActivity[] }).plan;
const S = Object.fromEntries(SAMPLES.map((s) => [s.state, s])) as Record<string, Sample>;
const snapOf = (state: string) => JSON.parse(JSON.stringify(S[state].response)) as E2SeriesSnapshot;
const reqOf = (state: string) => S[state].request as Req;
const BASE = "http://backend.test/api/admin/dynasty/v2";
const REFUSALS = ["prep_over_budget", "prep_again", "stale_action", "lineup_before_tactic", "tactic_wrong_game", "fresh_rest_refused"];

/** A scripted backend: answers each request with the next queued response. */
function scripted(queue: { status?: number; body?: unknown; throws?: boolean }[]) {
  const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
  const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected request ${String(url)}`);
    if (next.throws) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
  return { f: f as unknown as typeof fetch, calls };
}

/** A transport that has already read `state` (the hinted series). */
async function at(state: string, queue: { status?: number; body?: unknown; throws?: boolean }[] = []) {
  const snap = snapOf(state);
  const store = memoryStore();
  store.set(LIVE_STORE_KEY, JSON.stringify({ v: 1, seriesId: snap.series_id, local: emptyLocal() }));
  const back = scripted([{ body: snap }, ...queue]);
  const t = new LiveSeriesTransport({ store, fetchImpl: back.f, managementScenario: "congested_schedule" });
  const env = await t.resumeSeries(snap.series_id);
  back.calls.length = 0;
  return { t, env, calls: back.calls, snap };
}

describe("captured E3A responses", () => {
  it("are real revision-3 management snapshots covering every UX-6 state, and e2 captures stay revision 2", () => {
    expect(Object.keys(S)).toEqual(expect.arrayContaining([
      "discovery_none", "created", "prep_committed", "prep_duplicate", "lineup_locked", "game_published",
      "objective_question_1", "objective_settled", "tactics", "tactic_chosen", "tactic_duplicate", "game_2_started", "series_completed",
      "fresh_preparation", "discovery_single", ...REFUSALS,
    ]));
    for (const s of SAMPLES) {
      if (s.state.startsWith("discovery_")) { readE2SeriesList(s.response); continue; }
      if (REFUSALS.includes(s.state)) { expect(s.status).toBeGreaterThanOrEqual(409); continue; }
      const snap = readE2Snapshot(s.response);
      expect(snap.schema_revision).toBe(3);
      expect(isManaged(snap)).toBe(true);
      expect(readE3aManagement(snap.management).rules.version).toBe(MANAGEMENT_RULES_E3A);
      expect(snap.pins.management_rules_version).toBe(MANAGEMENT_RULES_E3A);
      expect(JSON.stringify(snap)).not.toMatch(/"seed"\s*:/);
    }
    for (const s of (e2capture as unknown as { samples: Sample[] }).samples) {
      if (s.state.startsWith("discovery_") || s.state === "create_refused") continue;
      const snap = readE2Snapshot(s.response);
      expect(isManaged(snap)).toBe(false);
      expect(snap.management).toBeUndefined();
    }
  });

  it("refuses drifted E3A responses instead of rendering them", () => {
    const noMgmt = snapOf("created"); delete noMgmt.management;
    expect(() => readE2Snapshot(noMgmt)).toThrow(/rev 3 without management/);
    const rev2 = snapOf("created"); rev2.schema_revision = 2;
    expect(() => readE2Snapshot(rev2)).toThrow(/management on a pre-rev-3/);
    const badSchema = snapOf("tactics"); (badSchema.management as { schema: string }).schema = "dynasty.combat_v2.management.snapshot.e3b";
    expect(() => readE2Snapshot(badSchema)).toThrow(E2ContractError);
    const noOptions = snapOf("tactics"); delete noOptions.management!.decisions.tactics;
    expect(() => readE2Snapshot(noOptions)).toThrow(/tactics without options/);
    const noPreview = snapOf("prep_committed"); delete noPreview.lineup!.preview;
    expect(() => readE2Snapshot(noPreview)).toThrow(/players_by_role\/suggested_players\/preview/);
    const e2tactics = JSON.parse(JSON.stringify((e2capture as unknown as { samples: Sample[] }).samples.find((x) => x.state === "between_games")!.response));
    e2tactics.phase = "tactics";
    expect(() => readE2Snapshot(e2tactics)).toThrow(/without management/);
  });
});

describe("E3A mapping: status comes from the server phase alone", () => {
  it("maps preparation → prep, lineup → drafting, game → in_game, tactics → between games, completed → complete", () => {
    // client-side plan/decisions (e2 stand-ins) must not change an E3A status
    const local = { ...emptyLocal(), plan: "early", decisions: { 1: "keep_plan" as const } };
    const env = (state: string) => mapE2ToEnvelope(snapOf(state), local);
    expect(env("created").series.status).toBe("prep");
    expect(env("created").series.current_game).toBe(1);
    expect(env("created").management!.phase).toBe("preparation");
    expect(env("created").management!.block.decisions.preparation.options!.map((o) => o.activity)).toEqual(["rest", "scrim", "vod_review", "champion_practice"]);
    expect(env("prep_committed").series.status).toBe("drafting");
    expect(env("prep_committed").management!.lineup!.preview.you.players).toHaveLength(5);
    expect(env("lineup_locked").series.status).toBe("in_game");
    expect(env("tactics").series.status).toBe("between_games");
    expect(env("tactics").series.current_game).toBe(2);
    expect(env("tactics").management!.block.decisions.tactics!.after_game).toBe(1);
    expect(env("tactic_chosen").series.status).toBe("drafting");
    expect(env("series_completed").series.status).toBe("complete");
    expect(env("series_completed").management!.players_by_game[1].you.jng).toBe("t_user-res-jng");
    expect(env("series_completed").management!.block.carry_over.carry_out.permanent.practiced_proficiency[0]).toMatchObject({ player_id: "t_user-mid", champion: "syn_c1_artillery" });
  });

  it("passes the management block through verbatim and leaves e2 envelopes without one", () => {
    const snap = snapOf("game_published");
    expect(mapE2ToEnvelope(snap, emptyLocal()).management!.block).toEqual(snap.management);
    const e2 = (e2capture as unknown as { samples: Sample[] }).samples.find((x) => x.state === "game_started")!.response as E2SeriesSnapshot;
    expect(mapE2ToEnvelope(e2, emptyLocal()).management).toBeNull();
  });

  it("explains every management contest component with the server's own value", () => {
    const snap = snapOf("game_published");
    const env = mapE2ToEnvelope(snap, emptyLocal());
    const tally = snap.current_game!.stages[0];
    const rows = influenceRows(tally, env.management!);
    const comps = tally.contests.flatMap((c) => [...(c.you_components ?? []), ...(c.opponent_components ?? [])]);
    const mgmt = comps.filter(isManagementComponent);
    for (const c of mgmt) expect(c.evidence_type).toBe("management_state");
    // every e3a component is listed exactly once, with its value unchanged
    expect(rows.filter((r) => r.title !== "Cohesion" && r.title !== "Champion proficiency").map((r) => r.value).sort()).toEqual(mgmt.map((c) => c.value).sort());
    // the practiced pick (mid, artillery 0.60) and the reserve's cohesion cost are visible
    expect(rows.find((r) => r.side === "you" && r.role === "mid" && r.title === "Champion proficiency")!.fact).toMatch(/0\.60, practiced \(prep\.d3\.champion_practice\)/);
    const co = env.management!.block.combat_inputs!.you.cohesion;
    expect(co.substitutes).toBe(1);
    expect(rows.find((r) => r.side === "you" && r.title === "Cohesion")!.value).toBe(tally.contests.find((c) => c.kind === "team")!.you_components!.find((c) => c.source === "team:cohesion")!.value);
    // the server's own invariant the UI relies on: net management power = the sum of that player's e3a components
    for (const p of env.management!.block.combat_inputs!.you.players) {
      const lane = tally.contests.find((c) => c.role === p.role)!;
      const sum = (lane.you_components ?? []).filter(isManagementComponent).reduce((a, c) => a + c.value, 0);
      expect(sum).toBeCloseTo(p.net_management_power.early, 6);
    }
  });
});

describe("E3A requests: ids and choices only, through the e2 retry rules", () => {
  it("creates an E3A series with both management fields, and an e2 series without them", async () => {
    const a = scripted([{ body: snapOf("created") }]);
    await new LiveSeriesTransport({ store: memoryStore(), fetchImpl: a.f, managementScenario: "congested_schedule", qualificationPolicy: "broad_mid_win" }).create({ requestId: "ux6-create-0001" });
    expect(a.calls[0].body).toEqual({ start_key: "ux6-create-0001", qualification_policy: "broad_mid_win", user_preset: "balanced", opponent_preset: "balanced2", when_unfinished_exists: "refuse", management_rules: MANAGEMENT_RULES_E3A, entry_scenario: "congested_schedule" });
    const e2 = (e2capture as unknown as { samples: Sample[] }).samples.find((x) => x.state === "series_created")!.response;
    const b = scripted([{ body: e2 }]);
    await new LiveSeriesTransport({ store: memoryStore(), fetchImpl: b.f }).create({ requestId: "ux6-create-0002" });
    expect(Object.keys(b.calls[0].body!).sort()).toEqual(["opponent_preset", "qualification_policy", "start_key", "user_preset", "when_unfinished_exists"]);
  });

  it("sends the whole preparation plan as one commit_preparation, and an identical retry", async () => {
    const { t, calls } = await at("created", [{ throws: true }, { body: snapOf("prep_duplicate") }]);
    const m = { rev: 0, requestId: "ux6-prep-0001" };
    await expect(t.commitPreparation(m, PLAN)).rejects.toMatchObject({ code: "NETWORK" });
    const out = await t.commitPreparation(m, PLAN); // Retry: the same rev and requestId
    expect(calls).toHaveLength(2);
    expect(calls[0].body).toEqual(calls[1].body);
    expect(calls[0]).toMatchObject({ method: "POST", url: `${BASE}/series/${snapOf("created").series_id}/actions`, body: { expected_seq: 0, action_id: "ux6-prep-0001", kind: "commit_preparation", payload: { activities: PLAN } } });
    expect(calls[0].body!.payload).toEqual(reqOf("prep_committed").payload);
    expect(out.series.status).toBe("drafting"); // the duplicate response is the current snapshot, applied once
    expect(snapOf("prep_duplicate").duplicate).toBe(true);
  });

  it("turns server refusals into readable errors with the fresh state, and a stale seq into STALE_REVISION", async () => {
    for (const [state, at0, code] of [["prep_over_budget", "created", "NOT_ALLOWED"], ["prep_again", "prep_committed", "NOT_ALLOWED"], ["tactic_wrong_game", "tactics", "NOT_ALLOWED"], ["lineup_before_tactic", "tactics", "NOT_ALLOWED"], ["stale_action", "lineup_locked", "STALE_REVISION"]] as const) {
      const fresh = snapOf(at0);
      const { t } = await at(at0, [{ status: S[state].status, body: S[state].response }, { body: fresh }]);
      const r = reqOf(state);
      const p = r.payload as Record<string, never>;
      const call = r.kind === "commit_preparation" ? t.commitPreparation({ rev: r.expected_seq, requestId: r.action_id }, p.activities)
        : r.kind === "choose_tactic" ? t.chooseTactic({ rev: r.expected_seq, requestId: r.action_id }, p.game, p.choice)
        : r.kind === "advance" ? t.advance({ rev: r.expected_seq, requestId: r.action_id }, p.machine_seq)
        : t.lockSquad({ rev: r.expected_seq, requestId: r.action_id }, p.champions, p.players);
      const err = await call.then(() => null, (e: unknown) => e as TransportError);
      expect(err, state).toBeInstanceOf(TransportError);
      expect(err!.code, state).toBe(code);
      expect(err!.message, state).toContain((S[state].response as { detail: { message: string } }).detail.message);
      expect(err!.fresh?.series.rev, state).toBe(fresh.seq);
    }
  });

  it("locks champions and squad players together; the e2 stand-ins are refused on an E3A series", async () => {
    const { t, calls } = await at("prep_committed", [{ body: snapOf("lineup_locked") }]);
    await expect(t.lockLineup({ rev: 1, requestId: "ux6-lock-0000" }, "balanced")).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(t.choosePlan({ rev: 1, requestId: "ux6-plan-0000" }, "balanced")).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    expect(calls).toHaveLength(0); // refused locally, nothing sent
    const r = reqOf("lineup_locked");
    const p = r.payload as { champions: never; players: never };
    const out = await t.lockSquad({ rev: 1, requestId: "ux6-lock-0001" }, p.champions, p.players);
    expect(calls[0].body).toEqual({ expected_seq: 1, action_id: "ux6-lock-0001", kind: "lock_lineup", payload: r.payload });
    expect((calls[0].body!.payload as { players: Record<string, string> }).players.jng).toBe("t_user-res-jng");
    expect(out.series.status).toBe("in_game");
  });

  it("sends the tactic for the game just settled, and its identical retry is a duplicate", async () => {
    const { t, calls } = await at("tactics", [{ body: snapOf("tactic_chosen") }, { body: snapOf("tactic_duplicate") }]);
    const after = snapOf("tactics").management!.decisions.tactics!.after_game;
    const m = { rev: snapOf("tactics").seq, requestId: "ux6-tactic-0001" };
    await t.chooseTactic(m, after, "quick_review");
    const out = await t.chooseTactic(m, after, "quick_review");
    expect(calls[0].body).toEqual({ expected_seq: m.rev, action_id: m.requestId, kind: "choose_tactic", payload: { game: after, choice: "quick_review" } });
    expect(calls[1].body).toEqual(calls[0].body);
    expect(out.management!.block.decisions.tactics_taken).toEqual([{ after_game: 1, choice: "quick_review" }]);
    await expect(t.decide({ rev: out.series.rev, requestId: "x-decide-1" }, "keep_plan", "balanced")).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });

  it("never sends a score, an outcome, a correctness flag or a management number", () => {
    const bodies = SAMPLES.map((s) => s.request).filter(Boolean).map((r) => JSON.stringify(r));
    for (const b of bodies) expect(b).not.toMatch(/"(correct|correct_count|category|winner|score|fatigue|cohesion|proficiency|power|eligible)"\s*:/);
  });

  it("lists E3A series in discovery with their management pins", async () => {
    const list = S.discovery_single.response;
    const back = scripted([{ body: list }, { body: snapOf("fresh_preparation") }]);
    const t = new LiveSeriesTransport({ store: memoryStore(), fetchImpl: back.f });
    const env = await t.resume();
    expect(env && "series" in env ? env.management!.block.entry_scenario.key : null).toBe("fresh");
    expect(readE2SeriesList(list).series[0]).toMatchObject({ management_rules: MANAGEMENT_RULES_E3A, entry_scenario: "fresh" });
  });
});
