/**
 * UX-4/UX-5 — contract test of the live E2 transport against REAL e2 responses
 * (`fixtures/e2-live-capture.json`, captured from a local backend running E2
 * revision 2 (bb5bc111) with `scripts/dynasty/capture_ux4_e2_live.py`). If the
 * e2 schema or the mapping drifts, these fail first.
 */
import { describe, expect, it, vi } from "vitest";
import capture from "./fixtures/e2-live-capture.json";
import { TransportError, type SeriesEnvelope } from "./contracts";
import { E2_SERIES_LIST_SCHEMA, E2_SERIES_SCHEMA, E2ContractError, readE2SeriesList, readE2Snapshot, type E2SeriesList, type E2SeriesSnapshot } from "./e2contracts";
import { LIVE_LINEUPS, ROLES, emptyLocal, lineupChampions, mapE2ToEnvelope } from "./e2mapper";
import { memoryStore } from "./fixtureServer";
import { LIVE_STORE_KEY, LiveSeriesTransport } from "./liveTransport";
import { isChoices } from "./transport";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

type Req = { expected_seq: number; action_id: string; kind: string; payload: Record<string, unknown> };
type Sample = { state: string; status?: number; request: Req | Record<string, unknown> | null; response: unknown };
const SAMPLES = (capture as unknown as { samples: Sample[] }).samples;
const S = Object.fromEntries(SAMPLES.map((s) => [s.state, s])) as Record<string, Sample>;
/** a captured series snapshot */
const snapOf = (state: string) => S[state].response as E2SeriesSnapshot;
/** a captured discovery listing */
const listOf = (state: string) => S[state].response as E2SeriesList;
const reqOf = (state: string) => S[state].request as Req;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const BASE = "http://backend.test/api/admin/dynasty/v2";
const NONE = listOf("discovery_none");

/** A scripted backend: answers each request with the next queued response (or error). */
function scripted(queue: { status?: number; body: unknown; throws?: boolean }[]) {
  const calls: { url: string; method: string; body: unknown; headers: Record<string, string> }[] = [];
  const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null, headers: (init?.headers ?? {}) as Record<string, string> });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected request ${String(url)}`);
    if (next.throws) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
  return { f: f as unknown as typeof fetch, calls };
}

const hinted = (seriesId: string, local = emptyLocal()) => {
  const store = memoryStore();
  store.set(LIVE_STORE_KEY, JSON.stringify({ v: 1, seriesId, local }));
  return store;
};

describe("captured e2 responses", () => {
  it("are real E2 rev-2 series snapshots and listings covering every UX state", () => {
    expect(Object.keys(S)).toEqual(expect.arrayContaining([
      "discovery_none", "discovery_single", "discovery_multiple", "create_refused",
      "series_created", "game_started", "game_in_progress", "objective_offered", "objective_question_1",
      "objective_answer_feedback", "objective_answer_2", "objective_settled", "objective_settled_retry", "between_games", "series_completed",
    ]));
    for (const s of SAMPLES) {
      if (s.state.startsWith("discovery_")) { expect(readE2SeriesList(s.response).schema).toBe(E2_SERIES_LIST_SCHEMA); continue; }
      if (s.state === "create_refused") continue;
      const snap = readE2Snapshot(s.response);
      expect(snap.schema).toBe(E2_SERIES_SCHEMA);
      expect(snap.schema_revision).toBe(2);
      expect(JSON.stringify(snap)).not.toMatch(/"seed"\s*:/);
      if (snap.current_game) expect(snap.current_game.schema).toBe("dynasty.combat_v2.events.snapshot.e1");
    }
    // live bank content, not the samples fixture
    const q = snapOf("objective_question_1").current_game!.objective!.encounter!.questions[0];
    expect(q.prompt).not.toMatch(/SAMPLE FIXTURE/);
    expect(q.options).toHaveLength(4);
  });

  it("rejects drifted responses instead of rendering them", () => {
    expect(() => readE2Snapshot({ ...clone(snapOf("series_created")), schema: "dynasty.combat_v2.series.snapshot.e3" })).toThrow(E2ContractError);
    expect(() => readE2Snapshot({ ...clone(snapOf("game_started")), current_game: null })).toThrow(/without current_game/);
    expect(() => readE2Snapshot({ ...clone(snapOf("series_completed")), result: null })).toThrow(/without result/);
    const noResults = clone(snapOf("objective_settled"));
    delete noResults.current_game!.objective_results;
    expect(() => readE2Snapshot(noResults)).toThrow(/objective_results/);
    expect(() => readE2SeriesList({ ...clone(listOf("discovery_multiple")), resume: { reason: "single", series_id: listOf("discovery_multiple").series[0].series_id } })).toThrow(/resume.reason/);
    expect(() => readE2SeriesList({ ...clone(listOf("discovery_single")), resume: { reason: "single", series_id: "wds2_other" } })).toThrow(/single row/);
    expect(() => readE2SeriesList({ ...clone(NONE), schema: "dynasty.combat_v2.series.list.e3" })).toThrow(E2ContractError);
  });

  it("still accepts rev-1 snapshots (no schema_revision, no objective_results)", () => {
    const rev1 = clone(snapOf("objective_settled"));
    delete rev1.schema_revision;
    delete rev1.current_game!.objective_results;
    const env = mapE2ToEnvelope(readE2Snapshot(rev1), emptyLocal());
    expect(env.objective).toBeNull(); // nothing to hold: the outcome shows directly, as served
    expect(env.game!.beats.at(-1)!.beat).toBe("objective_result");
  });

  it("never carries a correct answer before it is answered", () => {
    for (const st of ["objective_offered", "objective_question_1", "objective_answer_feedback", "objective_answer_2"]) {
      const g = snapOf(st).current_game!;
      expect(g.objective_results).toEqual([]);
      for (const q of g.objective!.encounter?.questions ?? []) {
        if (q.state !== "answered") expect(q.feedback).toBeUndefined();
        if (q.state === "locked") { expect(q.prompt).toBeUndefined(); expect(q.options).toBeUndefined(); }
      }
      const env = mapE2ToEnvelope(snapOf(st), emptyLocal());
      for (const q of env.objective?.questions ?? []) if (q.state === "pending") { expect(q.prompt).toBeNull(); expect(q.options).toBeNull(); }
    }
  });
});

describe("e2 -> SeriesEnvelope mapper", () => {
  it("maps the created series to prep, then drafting once a plan is chosen (client-side)", () => {
    const snap = snapOf("series_created");
    const env = mapE2ToEnvelope(snap, emptyLocal());
    expect(env.series).toMatchObject({ authority: "e2_series", series_id: snap.series_id, rev: snap.seq, status: "prep", current_game: 1, wins: 0, losses: 0, plan: null });
    expect(env.series.legal_lineups.map((l) => l.lineup_id)).toEqual(LIVE_LINEUPS.map((l) => l.lineup_id));
    const balanced = env.series.legal_lineups.find((l) => l.lineup_id === "balanced")!;
    expect(balanced.champions.map((c) => c.key)).toEqual(ROLES.map((r) => lineupChampions("balanced")![r]));
    expect(balanced.champions[0]).toMatchObject({ name: "SYN Duelist", class: "fighter" });
    expect(balanced.player_ratings).toEqual(snap.teams.you.players[0].phase_ratings);
    expect(env.series.opponent.lineup.champions.map((c) => c.key)).toEqual(ROLES.map((r) => snap.lineup!.opponent[r]));
    expect(env.series.policy.policy_id).toBe((capture as unknown as { policy: string }).policy);
    expect(env.game).toBeNull();
    expect(mapE2ToEnvelope(snap, { ...emptyLocal(), plan: "balanced" }).series.status).toBe("drafting");
  });

  it("maps a game in progress to in_game with the E1 snapshot as served", () => {
    const local = { ...emptyLocal(), plan: "balanced", pool: snapOf("series_created").lineup!.champion_pool };
    const raw = snapOf("game_in_progress");
    const env = mapE2ToEnvelope(raw, local);
    expect(env.series).toMatchObject({ status: "in_game", current_game: 1, current_lineup: "balanced" });
    const { game_index: _gi, ...rest } = raw.current_game!;
    expect(env.game).toEqual({ ...rest, objective: null });
    expect(env.objective).toBeNull();
  });

  it("maps the offered Baron to the E1 prompt shape (stakes before opening)", () => {
    const raw = snapOf("objective_offered");
    const env = mapE2ToEnvelope(raw, emptyLocal());
    expect(env.game!.phase).toBe("awaiting_objective");
    expect(env.game!.objective).toMatchObject({ state: "awaiting_answer", encounter_id: raw.current_game!.objective!.encounter_id, encounter_kind: "baron_three_question", questions: null });
    expect(env.game!.objective!.outcomes.map((o) => o.correct_count).sort()).toEqual([0, 1, 2, 3]);
    expect(env.objective).toBeNull();
  });

  it("maps the hosted questions: current has content, locked has none, answered shows your pick", () => {
    const first = mapE2ToEnvelope(snapOf("objective_question_1"), emptyLocal()).objective!;
    expect(first).toMatchObject({ authority: "e2_objective", state: "in_progress", question_index: 0, graded: null });
    expect(first.questions.map((q) => q.state)).toEqual(["answering", "pending", "pending"]);
    expect(first.questions[0].options).toHaveLength(4);

    const raw = snapOf("objective_answer_feedback");
    const fb = raw.current_game!.objective!.encounter!.questions[0].feedback!;
    const second = mapE2ToEnvelope(raw, emptyLocal()).objective!;
    expect(second.question_index).toBe(1);
    expect(second.questions[0]).toMatchObject({ state: fb.correct ? "revealed_correct" : "revealed_incorrect", chosen: 0 });
    expect(second.questions.map((q) => q.state).slice(1)).toEqual(["answering", "pending"]);
  });

  it("reads all three answers' feedback from objective_results: graded on the result beat, settled once opened", () => {
    const settled = snapOf("objective_settled");
    const g = settled.current_game!;
    expect(g.objective).toBeNull();
    const r = g.objective_results!.at(-1)!;
    expect(r).toMatchObject({ state: "settled", answered: 3, retention: "current_game", result_beat_seq: g.beats.at(-1)!.seq });
    expect(g.beats.at(-1)!.beat).toBe("objective_result");
    expect(g.events.some((e) => e.instance_id === r.event_instance_id && e.resolution === "objective")).toBe(true);
    // the series-life history agrees with the sealed result
    const hist = settled.games.find((x) => x.game === g.game_index)!.objectives.find((o) => o.encounter_id === r.encounter_id)!;
    expect(hist).toMatchObject({ state: "settled", correct_count: r.grade.correct_count, category: r.grade.category });

    const held = mapE2ToEnvelope(settled, emptyLocal());
    expect(held.objective).toMatchObject({ authority: "e2_objective", encounter_id: r.encounter_id, state: "graded", question_index: 3, result_event_id: r.event_instance_id, graded: { correct_count: r.grade.correct_count, category: r.grade.category } });
    held.objective!.questions.forEach((q, i) => {
      const fb = r.questions[i].feedback!;
      expect(q.state).toBe(fb.correct ? "revealed_correct" : "revealed_incorrect");
      expect(q.chosen).toBe(r.questions[i].options!.findIndex((o) => o.option_id === fb.your_option_id));
      expect(q.prompt).toBe(r.questions[i].prompt);
    });
    // the game is shown exactly as served: no beat or event is held back
    const { game_index: _gi, ...rest } = g;
    expect(held.game).toEqual({ ...rest, objective: null });
    expect(held.game!.next.can_advance).toBe(true);

    expect(mapE2ToEnvelope(settled, { ...emptyLocal(), acked: [r.encounter_id] }).objective!.state).toBe("settled");
  });

  it("takes question 3's mark from the server, never from the count", () => {
    // Flip Q3 in a copy: a count-minus-marks derivation would disagree with this feedback.
    const s = clone(snapOf("objective_settled"));
    const r = s.current_game!.objective_results!.at(-1)!;
    const q3 = r.questions[2];
    q3.feedback = { ...q3.feedback!, correct: !q3.feedback!.correct };
    const env = mapE2ToEnvelope(s, emptyLocal());
    expect(env.objective!.questions[2].state).toBe(q3.feedback.correct ? "revealed_correct" : "revealed_incorrect");
    expect(env.objective!.graded!.correct_count).toBe(r.grade.correct_count);
  });

  it("shows the result as settled once the game moved past its beat", () => {
    const s = clone(snapOf("objective_settled"));
    const top = s.current_game!.beats.at(-1)!;
    s.current_game!.beats.push({ ...top, seq: top.seq + 1, beat: "stage_open", ref: null });
    expect(mapE2ToEnvelope(s, emptyLocal()).objective!.state).toBe("settled");
  });

  it("maps a settled game into the series tally with the consumed effects", () => {
    const raw = snapOf("between_games");
    const env = mapE2ToEnvelope(raw, { ...emptyLocal(), plan: "balanced" });
    expect(env.series.status).toBe("between_games");
    expect(env.series.current_game).toBe(2);
    const g1 = raw.games[0];
    expect(env.series.games).toHaveLength(1);
    expect(env.series.games[0]).toMatchObject({ index: 1, lineup_id: "balanced", winner: g1.winner, how: g1.how, points: g1.stages.map((s) => s.you_points) });
    const obj = g1.objectives.find((o) => o.state === "settled");
    expect(env.series.games[0].objective).toEqual(obj ? { correct_count: obj.correct_count, category: obj.category } : null);
    expect(env.series.games[0].pending_consequences).toHaveLength(raw.between_games.consumed.filter((c) => c.game === 1).length);
    expect(env.game!.phase).toBe("settled"); // the just-settled game stays on stage for the result screen
    expect(mapE2ToEnvelope(raw, { ...emptyLocal(), plan: "balanced", decisions: { 1: "keep_plan" } }).series.status).toBe("drafting");
  });

  it("maps the completed series", () => {
    const raw = snapOf("series_completed");
    const env = mapE2ToEnvelope(raw, emptyLocal());
    expect(env.series).toMatchObject({ status: "complete", current_game: null, wins: raw.score.you, losses: raw.score.opponent, winner: raw.result!.winner });
    expect(env.series.games.map((g) => g.winner)).toEqual(raw.result!.games.map((g) => g.winner));
    expect(Math.max(env.series.wins, env.series.losses)).toBe(3);
  });
});

describe("LiveSeriesTransport", () => {
  /** Drive the captured run through the transport; returns the requests it sent. */
  async function walk() {
    const { f, calls } = scripted([
      { body: snapOf("series_created") },
      { body: snapOf("game_started") },
      { body: snapOf("objective_offered") },
      { body: snapOf("objective_question_1") },
      { body: snapOf("objective_answer_feedback") },
      { body: snapOf("objective_answer_2") },
      { body: snapOf("objective_settled") },
    ]);
    const store = memoryStore();
    const t = new LiveSeriesTransport({ store, fetchImpl: f });
    const out: SeriesEnvelope[] = [];
    out.push(await t.create({ requestId: "create-0001-abcd" }));
    out.push(await t.choosePlan({ rev: 0, requestId: "plan-00000001" }, "balanced"));
    out.push(await t.lockLineup({ rev: 0, requestId: "lock-00000001" }, "balanced"));
    const g = out.at(-1)!.game!;
    out.push(await t.advance({ rev: out.at(-1)!.series.rev, requestId: "adv-00000001" }, g.seq));
    const enc = out.at(-1)!.game!.objective!.encounter_id;
    out.push(await t.openObjective({ rev: out.at(-1)!.series.rev, requestId: "open-00000001" }, enc));
    out.push(await t.answerQuestion({ rev: out.at(-1)!.series.rev, requestId: "ans-00000001" }, enc, 0, 0));
    out.push(await t.answerQuestion({ rev: out.at(-1)!.series.rev, requestId: "ans-00000002" }, enc, 1, 2));
    out.push(await t.answerQuestion({ rev: out.at(-1)!.series.rev, requestId: "ans-00000003" }, enc, 2, 1));
    out.push(await t.settleObjective({ rev: out.at(-1)!.series.rev, requestId: "settle-0000001" }, enc));
    return { t, store, calls, out, enc };
  }

  it("sends the exact E2 request shapes: rev/requestId -> expected_seq/action_id, ids only", async () => {
    const { calls, out, enc } = await walk();
    expect(calls[0]).toMatchObject({ url: `${BASE}/series`, method: "POST", body: { start_key: "create-0001-abcd", qualification_policy: "narrow_early_mid_combo", user_preset: "balanced", opponent_preset: "balanced2", when_unfinished_exists: "refuse" } });
    expect(calls[0].headers.Authorization).toBe("Bearer owner-session");
    const sid = snapOf("series_created").series_id;
    const acts = calls.filter((c) => c.url === `${BASE}/series/${sid}/actions`);
    expect(acts.map((c) => (c.body as { kind: string }).kind)).toEqual(["lock_lineup", "advance", "open_objective", "answer_objective", "answer_objective", "answer_objective"]);
    expect(acts[0].body).toEqual({ expected_seq: 0, action_id: "lock-00000001", kind: "lock_lineup", payload: { game: 1, champions: lineupChampions("balanced") } });
    expect(acts[1].body).toMatchObject({ expected_seq: snapOf("game_started").seq, action_id: "adv-00000001", payload: { game: 1, machine_seq: snapOf("game_started").current_game!.seq, steps: 1 } });
    // the Baron game, as the server reported it (the capture's first Baron may be after game 1)
    const bg = snapOf("objective_offered").current_game!.game_index;
    expect(acts[2].body).toMatchObject({ kind: "open_objective", payload: { game: bg, encounter_id: enc } });
    const q1 = snapOf("objective_question_1").current_game!.objective!.encounter!.questions[0];
    expect(acts[3].body).toMatchObject({ payload: { game: bg, encounter_id: enc, question_id: q1.question_id, option_id: q1.options![0].option_id } });
    const q2 = snapOf("objective_answer_feedback").current_game!.objective!.encounter!.questions[1];
    expect(acts[4].body).toMatchObject({ payload: { question_id: q2.question_id, option_id: q2.options![2].option_id } });
    const q3 = snapOf("objective_answer_2").current_game!.objective!.encounter!.questions[2];
    expect(acts[5].body).toMatchObject({ payload: { question_id: q3.question_id, option_id: q3.options![1].option_id } });
    expect(JSON.stringify(acts.map((a) => a.body))).not.toMatch(/correct|category|winner|score/);
    // settleObjective and choosePlan never reach the server
    expect(calls).toHaveLength(7);
    expect(calls.at(-1)).toMatchObject({ method: "POST", body: { kind: "answer_objective" } });
    expect(out[1].series.status).toBe("drafting");
  });

  it("shows the third answer graded with the server's own Q3 feedback, then opens the outcome locally", async () => {
    const { out, store, enc } = await walk();
    const r = snapOf("objective_settled").current_game!.objective_results!.at(-1)!;
    const graded = out.at(-2)!;
    expect(graded.objective).toMatchObject({ state: "graded", question_index: 3, graded: { correct_count: r.grade.correct_count } });
    expect(graded.objective!.questions[2].state).toBe(r.questions[2].feedback!.correct ? "revealed_correct" : "revealed_incorrect");
    const settledEnv = out.at(-1)!;
    expect(settledEnv.series.rev).toBe(graded.series.rev); // presentation only: nothing moved on the server
    expect(settledEnv.objective).toMatchObject({ authority: "e2_objective", state: "settled", result_event_id: r.event_instance_id });
    expect(settledEnv.game).toEqual(graded.game);
    const saved = JSON.parse(store.get(LIVE_STORE_KEY)!);
    expect(saved.local).toEqual({ plan: "balanced", decisions: {}, acked: [enc], pool: snapOf("series_created").lineup!.champion_pool });
    expect(JSON.stringify(saved)).not.toMatch(/Bearer|owner-session/);
  });

  it("refuses to settle an encounter the server has not graded", async () => {
    const { f } = scripted([{ body: snapOf("objective_answer_2") }]);
    const t = new LiveSeriesTransport({ store: hinted(snapOf("objective_answer_2").series_id), fetchImpl: f });
    const env = await t.resumeSeries(snapOf("objective_answer_2").series_id);
    await expect(t.settleObjective({ rev: env.series.rev, requestId: "settle-early-01" }, env.objective!.encounter_id)).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });

  it("retries a lost third answer with the identical body; the duplicate carries the same sealed result", async () => {
    const before = snapOf("objective_answer_2");
    const { f, calls } = scripted([{ body: before }, { body: null, throws: true }, { body: snapOf("objective_settled_retry") }]);
    const t = new LiveSeriesTransport({ store: hinted(before.series_id), fetchImpl: f });
    const env = await t.resumeSeries(before.series_id);
    const enc = env.objective!.encounter_id;
    const req = reqOf("objective_settled");
    const option = before.current_game!.objective!.encounter!.questions[2].options!.findIndex((o) => o.option_id === req.payload.option_id);
    const m = { rev: env.series.rev, requestId: req.action_id };
    await expect(t.answerQuestion(m, enc, 2, option)).rejects.toMatchObject({ code: "NETWORK" });
    const again = await t.answerQuestion(m, enc, 2, option);
    expect(calls[2].body).toEqual(calls[1].body);
    expect(calls[2].body).toEqual(req); // exactly what the server saw first
    expect(snapOf("objective_settled_retry")).toMatchObject({ duplicate: true, applied: false, seq: snapOf("objective_settled").seq });
    expect(again.objective).toEqual(mapE2ToEnvelope(snapOf("objective_settled"), emptyLocal()).objective);
  });

  describe("resume through discovery", () => {
    it("single -> resumes that series (no hint needed)", async () => {
      const single = listOf("discovery_single");
      const sid = single.resume.series_id!;
      const snap = { ...clone(snapOf("series_created")), series_id: sid };
      const { f, calls } = scripted([{ body: single }, { body: snap }]);
      const store = memoryStore();
      const r = await new LiveSeriesTransport({ store, fetchImpl: f }).resume();
      expect(isChoices(r)).toBe(false);
      expect((r as SeriesEnvelope).series.series_id).toBe(sid);
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${BASE}/series`, `GET ${BASE}/series/${sid}`]);
      expect(JSON.parse(store.get(LIVE_STORE_KEY)!).seriesId).toBe(sid); // the hint follows the server
    });

    it("single -> keeps the hint's client state only when it is the same series", async () => {
      const single = listOf("discovery_single");
      const sid = single.resume.series_id!;
      const snap = { ...clone(snapOf("series_created")), series_id: sid };
      const same = scripted([{ body: single }, { body: snap }]);
      const kept = (await new LiveSeriesTransport({ store: hinted(sid, { ...emptyLocal(), plan: "early" }), fetchImpl: same.f }).resume()) as SeriesEnvelope;
      expect(kept.series).toMatchObject({ plan: "early", status: "drafting" });
      const other = scripted([{ body: single }, { body: snap }]);
      const fresh = (await new LiveSeriesTransport({ store: hinted("wds2_elsewhere", { ...emptyLocal(), plan: "early" }), fetchImpl: other.f }).resume()) as SeriesEnvelope;
      expect(fresh.series).toMatchObject({ plan: null, status: "prep" });
    });

    it("multiple -> the owner chooses; nothing is fetched or picked silently", async () => {
      const multi = listOf("discovery_multiple");
      const { f, calls } = scripted([{ body: multi }]);
      const hint = multi.series[1].series_id;
      const r = await new LiveSeriesTransport({ store: hinted(hint), fetchImpl: f }).resume();
      expect(isChoices(r)).toBe(true);
      const choices = (r as { choices: { series_id: string; hinted: boolean; rev: number }[] }).choices;
      expect(choices.map((c) => c.series_id)).toEqual(multi.series.map((x) => x.series_id)); // server order (updated_at desc)
      expect(choices.map((c) => c.hinted)).toEqual(multi.series.map((x) => x.series_id === hint));
      expect(choices[0].rev).toBe(multi.series[0].seq);
      expect(calls).toHaveLength(1);
    });

    it("none -> nothing to resume; a hinted completed series still shows, a missing or stale hint is dropped", async () => {
      const none = scripted([{ body: NONE }]);
      expect(await new LiveSeriesTransport({ store: memoryStore(), fetchImpl: none.f }).resume()).toBeNull();

      const done = snapOf("series_completed");
      const completed = scripted([{ body: NONE }, { body: done }]);
      const env = (await new LiveSeriesTransport({ store: hinted(done.series_id), fetchImpl: completed.f }).resume()) as SeriesEnvelope;
      expect(env.series.status).toBe("complete");

      const gone = hinted("wds2_gone");
      const missing = scripted([{ body: NONE }, { status: 404, body: { detail: { code: "DYNASTY_SERIES_NOT_FOUND", message: "nope" } } }]);
      expect(await new LiveSeriesTransport({ store: gone, fetchImpl: missing.f }).resume()).toBeNull();
      expect(missing.calls[1]).toMatchObject({ url: `${BASE}/series/wds2_gone`, method: "GET" });
      expect(gone.get(LIVE_STORE_KEY)).toBeNull();
    });

    it("an automatic create refused with UNFINISHED_SERIES_EXISTS turns into the choices", async () => {
      const refused = S.create_refused;
      expect(refused.status).toBe(409);
      const { f, calls } = scripted([{ status: 409, body: refused.response }]);
      const err = await new LiveSeriesTransport({ store: memoryStore(), fetchImpl: f }).create({ requestId: "create-auto-0001" }).catch((e) => e);
      expect(err).toBeInstanceOf(TransportError);
      expect(err.code).toBe("UNFINISHED_SERIES");
      const unfinished = (refused.response as { detail: { unfinished: E2SeriesList } }).detail.unfinished;
      expect(err.choices.map((c: { series_id: string }) => c.series_id)).toEqual(unfinished.series.map((x) => x.series_id));
      expect(err.fresh).toBeUndefined();
      expect(calls[0].body).toMatchObject({ when_unfinished_exists: "refuse" });
    });

    it("an explicit New series sends create (there is no abandon route)", async () => {
      const { f, calls } = scripted([{ body: snapOf("series_created") }]);
      await new LiveSeriesTransport({ store: memoryStore(), fetchImpl: f }).create({ requestId: "create-new-00001" }, "create");
      expect(calls[0].body).toEqual({ start_key: "create-new-00001", qualification_policy: "narrow_early_mid_combo", user_preset: "balanced", opponent_preset: "balanced2", when_unfinished_exists: "create" });
    });

    it("drops UX-4's encounter cache from an old hint", async () => {
      const sid = snapOf("series_created").series_id;
      const store = memoryStore();
      store.set(LIVE_STORE_KEY, JSON.stringify({ v: 1, seriesId: sid, local: { ...emptyLocal(), plan: "balanced", encounters: { e1: { objective: {}, sent: {} } } } }));
      const { f } = scripted([{ body: snapOf("series_created") }]);
      await new LiveSeriesTransport({ store, fetchImpl: f }).resumeSeries(sid);
      expect(JSON.parse(store.get(LIVE_STORE_KEY)!).local).not.toHaveProperty("encounters");
    });
  });

  it("turns STALE_SEQ into STALE_REVISION carrying the server's fresh state", async () => {
    const sid = snapOf("game_started").series_id;
    const { f } = scripted([
      { body: snapOf("game_started") },
      { status: 409, body: { detail: { code: "STALE_SEQ", message: "expected_seq 1 != 2" } } },
      { body: snapOf("game_in_progress") },
    ]);
    const t = new LiveSeriesTransport({ store: hinted(sid, { ...emptyLocal(), plan: "balanced" }), fetchImpl: f });
    const env = await t.resumeSeries(sid);
    const err = await t.advance({ rev: env.series.rev, requestId: "adv-stale-0001" }, env.game!.seq).catch((e) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect(err.code).toBe("STALE_REVISION");
    expect(err.fresh.series.rev).toBe(snapOf("game_in_progress").seq);
  });

  it("maps a lost response to NETWORK and a retry resends the identical body", async () => {
    const sid = snapOf("game_started").series_id;
    const dup = { ...clone(snapOf("game_in_progress")), applied: false, duplicate: true };
    const { f, calls } = scripted([{ body: snapOf("game_started") }, { body: null, throws: true }, { body: dup }]);
    const t = new LiveSeriesTransport({ store: hinted(sid, { ...emptyLocal(), plan: "balanced" }), fetchImpl: f });
    const env = await t.resumeSeries(sid);
    const m = { rev: env.series.rev, requestId: "adv-retry-0001" };
    await expect(t.advance(m, env.game!.seq)).rejects.toMatchObject({ code: "NETWORK" });
    const again = await t.advance(m, env.game!.seq);
    expect(calls[2].body).toEqual(calls[1].body);
    expect(again.series.rev).toBe(dup.seq);
  });

  it("maps auth, kill switch and content errors to their codes", async () => {
    const cases: [number, string | null, string][] = [
      [403, "OWNER_USER_REQUIRED", "AUTH"], [401, null, "AUTH"], [404, "DYNASTY_DISABLED", "DISABLED"],
      [422, "BAD_LINEUP", "ILLEGAL_LINEUP"], [503, "OBJECTIVE_CONTENT_UNAVAILABLE", "SERVER"], [500, "DYNASTY_SERIES_INTEGRITY", "SERVER"],
    ];
    for (const [status, code, want] of cases) {
      const { f } = scripted([{ status, body: { detail: code ? { code, message: "x" } : "Unauthorized" } }, { body: snapOf("series_created") }]);
      const err = await new LiveSeriesTransport({ store: memoryStore(), fetchImpl: f }).create({ requestId: `create-${status}-0001` }).catch((e) => e);
      expect(err, `${status} ${code}`).toBeInstanceOf(TransportError);
      expect(err.code).toBe(want);
    }
    const { f } = scripted([{ status: 404, body: { detail: { code: "DYNASTY_DISABLED", message: "off" } } }]);
    await expect(new LiveSeriesTransport({ store: memoryStore(), fetchImpl: f }).resume()).rejects.toMatchObject({ code: "DISABLED" });
  });

  it("keeps plan and backstage choices client-side, with the same rules as the double", async () => {
    const sid = snapOf("between_games").series_id;
    const { f, calls } = scripted([{ body: snapOf("between_games") }]);
    const t = new LiveSeriesTransport({ store: hinted(sid, { ...emptyLocal(), plan: "balanced" }), fetchImpl: f });
    const env = await t.resumeSeries(sid);
    const rev = env.series.rev;
    await expect(t.decide({ rev, requestId: "dec-00000001" }, "recovery_rest", "balanced")).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(t.decide({ rev, requestId: "dec-00000002" }, "keep_plan", "early")).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(t.decide({ rev: rev - 1, requestId: "dec-00000003" }, "keep_plan", "balanced")).rejects.toMatchObject({ code: "STALE_REVISION" });
    const next = await t.decide({ rev, requestId: "dec-00000004" }, "switch_plan", "scaling");
    expect(next.series).toMatchObject({ status: "drafting", plan: "scaling" });
    expect(next.series.games[0].decision).toBe("switch_plan");
    expect(calls).toHaveLength(1); // only the resume read
  });
});
