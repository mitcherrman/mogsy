/**
 * UX-4 — contract test of the live E2 transport against REAL e2 responses
 * (`fixtures/e2-live-capture.json`, captured from a local backend running E2
 * b022b21a with `scripts/dynasty/capture_ux4_e2_live.py`). If the e2 schema or
 * the mapping drifts, these fail first.
 */
import { describe, expect, it, vi } from "vitest";
import capture from "./fixtures/e2-live-capture.json";
import { TransportError, type SeriesEnvelope } from "./contracts";
import { E2_SERIES_SCHEMA, E2ContractError, readE2Snapshot, type E2SeriesSnapshot } from "./e2contracts";
import { LIVE_LINEUPS, ROLES, emptyLocal, lineupChampions, mapE2ToEnvelope } from "./e2mapper";
import { memoryStore } from "./fixtureServer";
import { LIVE_STORE_KEY, LiveSeriesTransport } from "./liveTransport";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

type Sample = { state: string; request: { expected_seq: number; action_id: string; kind: string; payload: Record<string, unknown> } | null; response: E2SeriesSnapshot };
const SAMPLES = (capture as unknown as { samples: Sample[] }).samples;
const S = Object.fromEntries(SAMPLES.map((s) => [s.state, s])) as Record<string, Sample>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const BASE = "http://backend.test/api/admin/dynasty/v2";

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

describe("captured e2 responses", () => {
  it("are real E2 series snapshots covering every UX state", () => {
    expect(Object.keys(S)).toEqual(expect.arrayContaining([
      "series_created", "game_started", "game_in_progress", "objective_offered", "objective_question_1",
      "objective_answer_feedback", "objective_answer_2", "objective_settled", "between_games", "series_completed",
    ]));
    for (const s of SAMPLES) {
      const snap = readE2Snapshot(s.response);
      expect(snap.schema).toBe(E2_SERIES_SCHEMA);
      expect(JSON.stringify(snap)).not.toMatch(/"seed"\s*:/);
      if (snap.current_game) expect(snap.current_game.schema).toBe("dynasty.combat_v2.events.snapshot.e1");
    }
    // live bank content, not the samples fixture
    const q = S.objective_question_1.response.current_game!.objective!.encounter!.questions[0];
    expect(q.prompt).not.toMatch(/SAMPLE FIXTURE/);
    expect(q.options).toHaveLength(4);
  });

  it("rejects drifted responses instead of rendering them", () => {
    expect(() => readE2Snapshot({ ...clone(S.series_created.response), schema: "dynasty.combat_v2.series.snapshot.e3" })).toThrow(E2ContractError);
    expect(() => readE2Snapshot({ ...clone(S.game_started.response), current_game: null })).toThrow(/without current_game/);
    expect(() => readE2Snapshot({ ...clone(S.series_completed.response), result: null })).toThrow(/without result/);
  });

  it("never carries a correct answer before it is answered", () => {
    for (const st of ["objective_offered", "objective_question_1", "objective_answer_feedback", "objective_answer_2"]) {
      const o = S[st].response.current_game!.objective!;
      for (const q of o.encounter?.questions ?? []) {
        if (q.state !== "answered") expect(q.feedback).toBeUndefined();
        if (q.state === "locked") { expect(q.prompt).toBeUndefined(); expect(q.options).toBeUndefined(); }
      }
      const env = mapE2ToEnvelope(S[st].response, emptyLocal());
      for (const q of env.objective?.questions ?? []) if (q.state === "pending") { expect(q.prompt).toBeNull(); expect(q.options).toBeNull(); }
    }
  });
});

describe("e2 -> SeriesEnvelope mapper", () => {
  it("maps the created series to prep, then drafting once a plan is chosen (client-side)", () => {
    const snap = S.series_created.response;
    const env = mapE2ToEnvelope(snap, emptyLocal());
    expect(env.series).toMatchObject({ authority: "e2_series", series_id: snap.series_id, rev: snap.seq, status: "prep", current_game: 1, wins: 0, losses: 0, plan: null });
    expect(env.series.legal_lineups.map((l) => l.lineup_id)).toEqual(LIVE_LINEUPS.map((l) => l.lineup_id));
    const balanced = env.series.legal_lineups.find((l) => l.lineup_id === "balanced")!;
    expect(balanced.champions.map((c) => c.key)).toEqual(ROLES.map((r) => lineupChampions("balanced")![r]));
    expect(balanced.champions[0]).toMatchObject({ name: "SYN Duelist", class: "fighter" });
    expect(balanced.player_ratings).toEqual(snap.teams.you.players[0].phase_ratings);
    expect(env.series.opponent.lineup.champions.map((c) => c.key)).toEqual(ROLES.map((r) => snap.lineup!.opponent[r]));
    expect(env.series.policy.policy_id).toBe("narrow_early_mid_combo");
    expect(env.game).toBeNull();
    expect(mapE2ToEnvelope(snap, { ...emptyLocal(), plan: "balanced" }).series.status).toBe("drafting");
  });

  it("maps a game in progress to in_game with the E1 snapshot as served", () => {
    const local = { ...emptyLocal(), plan: "balanced", pool: S.series_created.response.lineup!.champion_pool };
    const raw = S.game_in_progress.response;
    const env = mapE2ToEnvelope(raw, local);
    expect(env.series).toMatchObject({ status: "in_game", current_game: 1, current_lineup: "balanced" });
    const { game_index: _gi, ...rest } = raw.current_game!;
    expect(env.game).toEqual({ ...rest, objective: null });
    expect(env.objective).toBeNull();
  });

  it("maps the offered Baron to the E1 prompt shape (stakes before opening)", () => {
    const raw = S.objective_offered.response;
    const env = mapE2ToEnvelope(raw, emptyLocal());
    expect(env.game!.phase).toBe("awaiting_objective");
    expect(env.game!.objective).toMatchObject({ state: "awaiting_answer", encounter_id: raw.current_game!.objective!.encounter_id, encounter_kind: "baron_three_question", questions: null });
    expect(env.game!.objective!.outcomes.map((o) => o.correct_count).sort()).toEqual([0, 1, 2, 3]);
    expect(env.objective).toBeNull();
  });

  it("maps the hosted questions: current has content, locked has none, answered shows your pick", () => {
    const first = mapE2ToEnvelope(S.objective_question_1.response, emptyLocal()).objective!;
    expect(first).toMatchObject({ authority: "e2_objective", state: "in_progress", question_index: 0, graded: null });
    expect(first.questions.map((q) => q.state)).toEqual(["answering", "pending", "pending"]);
    expect(first.questions[0].options).toHaveLength(4);

    const raw = S.objective_answer_feedback.response;
    const fb = raw.current_game!.objective!.encounter!.questions[0].feedback!;
    const second = mapE2ToEnvelope(raw, emptyLocal()).objective!;
    expect(second.question_index).toBe(1);
    expect(second.questions[0]).toMatchObject({ state: fb.correct ? "revealed_correct" : "revealed_incorrect", chosen: 0 });
    expect(second.questions.map((q) => q.state).slice(1)).toEqual(["answering", "pending"]);
  });

  it("holds the settled Baron at 'graded' until acknowledged, then shows the server's outcome", () => {
    // What the transport caches: the encounter as last seen in progress (Q1, Q2 answered; Q3 current),
    // plus the option it sent for Q3. The settling response itself no longer carries the encounter.
    const before = S.objective_answer_2.response.current_game!.objective!;
    const q3 = before.encounter!.questions[2];
    expect(q3.state).toBe("current");
    const sentQ3 = S.objective_settled.request!.payload.option_id as string;
    const local = { ...emptyLocal(), encounters: { [before.encounter_id]: { objective: before, sent: { [q3.question_id]: sentQ3 } } } };
    const settled = S.objective_settled.response;
    expect(settled.current_game!.objective).toBeNull();
    expect(settled.current_game!.beats.at(-1)!.beat).toBe("objective_result");
    const grade = settled.games[0].objectives[0];
    expect(grade.state).toBe("settled");

    const held = mapE2ToEnvelope(settled, local);
    expect(held.objective).toMatchObject({ authority: "e2_objective", state: "graded", question_index: 3, graded: { correct_count: grade.correct_count, category: grade.category } });
    // per-question marks: Q1/Q2 from the server's feedback, Q3 = the server's count minus those
    const marks = held.objective!.questions.map((q) => q.state === "revealed_correct");
    expect(marks.filter(Boolean)).toHaveLength(grade.correct_count!);
    expect(held.objective!.questions[2].chosen).toBe(q3.options!.findIndex((o) => o.option_id === sentQ3));
    expect(held.game!.phase).toBe("awaiting_objective");
    expect(held.game!.next.can_advance).toBe(false);
    expect(held.game!.beats.at(-1)!.beat).not.toBe("objective_result");
    expect(held.game!.events.some((e) => e.resolution === "objective")).toBe(false);
    expect(held.game!.objective!.encounter_id).toBe(before.encounter_id);

    const shown = mapE2ToEnvelope(settled, { ...local, acked: [before.encounter_id] });
    expect(shown.objective!.state).toBe("settled");
    const { game_index: _gi, ...rest } = settled.current_game!;
    expect(shown.game).toEqual({ ...rest, objective: null });
    expect(shown.game!.events.find((e) => e.resolution === "objective")!.outcome.correct_count).toBe(grade.correct_count);

    // Without a cache (another device) nothing is held: the server's outcome shows directly.
    const nocache = mapE2ToEnvelope(settled, emptyLocal());
    expect(nocache.objective).toBeNull();
    expect(nocache.game!.beats.at(-1)!.beat).toBe("objective_result");
  });

  it("maps a settled game into the series tally with the consumed effects", () => {
    const raw = S.between_games.response;
    const env = mapE2ToEnvelope(raw, { ...emptyLocal(), plan: "balanced" });
    expect(env.series.status).toBe("between_games");
    expect(env.series.current_game).toBe(2);
    const g1 = raw.games[0];
    expect(env.series.games).toHaveLength(1);
    expect(env.series.games[0]).toMatchObject({ index: 1, lineup_id: "balanced", winner: g1.winner, how: g1.how, points: g1.stages.map((s) => s.you_points) });
    expect(env.series.games[0].objective).toEqual({ correct_count: g1.objectives[0].correct_count, category: g1.objectives[0].category });
    expect(env.series.games[0].pending_consequences).toHaveLength(raw.between_games.consumed.filter((c) => c.game === 1).length);
    expect(env.game!.phase).toBe("settled"); // the just-settled game stays on stage for the result screen
    expect(mapE2ToEnvelope(raw, { ...emptyLocal(), plan: "balanced", decisions: { 1: "keep_plan" } }).series.status).toBe("drafting");
  });

  it("maps the completed series", () => {
    const raw = S.series_completed.response;
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
      { body: S.series_created.response },
      { body: S.game_started.response },
      { body: S.objective_offered.response },
      { body: S.objective_question_1.response },
      { body: S.objective_answer_feedback.response },
      { body: S.objective_answer_2.response },
      { body: S.objective_settled.response },
      { body: S.objective_settled.response },
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
    expect(calls[0]).toMatchObject({ url: `${BASE}/series`, method: "POST", body: { start_key: "create-0001-abcd", qualification_policy: "narrow_early_mid_combo", user_preset: "balanced", opponent_preset: "balanced2" } });
    expect(calls[0].headers.Authorization).toBe("Bearer owner-session");
    const sid = S.series_created.response.series_id;
    const acts = calls.filter((c) => c.url === `${BASE}/series/${sid}/actions`);
    expect(acts.map((c) => (c.body as { kind: string }).kind)).toEqual(["lock_lineup", "advance", "open_objective", "answer_objective", "answer_objective", "answer_objective"]);
    expect(acts[0].body).toEqual({ expected_seq: 0, action_id: "lock-00000001", kind: "lock_lineup", payload: { game: 1, champions: lineupChampions("balanced") } });
    expect(acts[1].body).toMatchObject({ expected_seq: S.game_started.response.seq, action_id: "adv-00000001", payload: { game: 1, machine_seq: S.game_started.response.current_game!.seq, steps: 1 } });
    expect(acts[2].body).toMatchObject({ kind: "open_objective", payload: { game: 1, encounter_id: enc } });
    const q1 = S.objective_question_1.response.current_game!.objective!.encounter!.questions[0];
    expect(acts[3].body).toMatchObject({ payload: { game: 1, encounter_id: enc, question_id: q1.question_id, option_id: q1.options![0].option_id } });
    const q2 = S.objective_answer_feedback.response.current_game!.objective!.encounter!.questions[1];
    expect(acts[4].body).toMatchObject({ payload: { question_id: q2.question_id, option_id: q2.options![2].option_id } });
    const q3 = S.objective_answer_2.response.current_game!.objective!.encounter!.questions[2];
    expect(acts[5].body).toMatchObject({ payload: { question_id: q3.question_id, option_id: q3.options![1].option_id } });
    for (const a of acts) expect(Object.keys((a.body as { payload: object }).payload)).not.toEqual(expect.arrayContaining(["correct_count"]));
    expect(JSON.stringify(acts.map((a) => a.body))).not.toMatch(/correct|category|winner|score/);
    // settleObjective is a read; choosePlan never reached the server
    expect(calls.at(-1)).toMatchObject({ url: `${BASE}/series/${sid}`, method: "GET" });
    expect(calls).toHaveLength(8);
    expect(out[1].series.status).toBe("drafting");
  });

  it("caches the encounter so the settling response can be shown graded, then acknowledged", async () => {
    const { out, store, enc } = await walk();
    const graded = out.at(-2)!;
    expect(graded.objective).toMatchObject({ state: "graded", question_index: 3 });
    expect(graded.objective!.questions[2].chosen).toBe(1);
    expect(graded.game!.next.can_advance).toBe(false);
    const settledEnv = out.at(-1)!;
    expect(settledEnv.objective).toMatchObject({ authority: "e2_objective", state: "settled" });
    expect(settledEnv.game!.beats.at(-1)!.beat).toBe("objective_result");
    const saved = JSON.parse(store.get(LIVE_STORE_KEY)!);
    expect(saved.local.acked).toEqual([enc]);
    expect(saved.local.plan).toBe("balanced");
    expect(Object.keys(saved.local.encounters)).toEqual([enc]);
    expect(JSON.stringify(saved)).not.toMatch(/Bearer|owner-session/);
  });

  it("resumes by the stored series id and forgets a series the server no longer has", async () => {
    const store = memoryStore();
    store.set(LIVE_STORE_KEY, JSON.stringify({ v: 1, seriesId: "wds2_gone", local: emptyLocal() }));
    const { f, calls } = scripted([{ status: 404, body: { detail: { code: "DYNASTY_SERIES_NOT_FOUND", message: "nope" } } }]);
    expect(await new LiveSeriesTransport({ store, fetchImpl: f }).resume()).toBeNull();
    expect(calls[0]).toMatchObject({ url: `${BASE}/series/wds2_gone`, method: "GET" });
    expect(store.get(LIVE_STORE_KEY)).toBeNull();
    expect(await new LiveSeriesTransport({ store: memoryStore(), fetchImpl: f }).resume()).toBeNull();
  });

  it("turns STALE_SEQ into STALE_REVISION carrying the server's fresh state", async () => {
    const store = memoryStore();
    const { f } = scripted([
      { body: S.game_started.response },
      { status: 409, body: { detail: { code: "STALE_SEQ", message: "expected_seq 1 != 2" } } },
      { body: S.game_in_progress.response },
    ]);
    store.set(LIVE_STORE_KEY, JSON.stringify({ v: 1, seriesId: S.game_started.response.series_id, local: { ...emptyLocal(), plan: "balanced" } }));
    const t = new LiveSeriesTransport({ store, fetchImpl: f });
    const env = (await t.resume())!;
    const err = await t.advance({ rev: env.series.rev, requestId: "adv-stale-0001" }, env.game!.seq).catch((e) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect(err.code).toBe("STALE_REVISION");
    expect(err.fresh.series.rev).toBe(S.game_in_progress.response.seq);
  });

  it("maps a lost response to NETWORK and a retry resends the identical body", async () => {
    const store = memoryStore();
    const dup = { ...clone(S.game_in_progress.response), applied: false, duplicate: true };
    const { f, calls } = scripted([{ body: S.game_started.response }, { body: null, throws: true }, { body: dup }]);
    store.set(LIVE_STORE_KEY, JSON.stringify({ v: 1, seriesId: S.game_started.response.series_id, local: { ...emptyLocal(), plan: "balanced" } }));
    const t = new LiveSeriesTransport({ store, fetchImpl: f });
    const env = (await t.resume())!;
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
      const { f } = scripted([{ status, body: { detail: code ? { code, message: "x" } : "Unauthorized" } }, { body: S.series_created.response }]);
      const err = await new LiveSeriesTransport({ store: memoryStore(), fetchImpl: f }).create({ requestId: `create-${status}-0001` }).catch((e) => e);
      expect(err, `${status} ${code}`).toBeInstanceOf(TransportError);
      expect(err.code).toBe(want);
    }
  });

  it("keeps plan and backstage choices client-side, with the same rules as the double", async () => {
    const store = memoryStore();
    const { f, calls } = scripted([{ body: S.between_games.response }]);
    store.set(LIVE_STORE_KEY, JSON.stringify({ v: 1, seriesId: S.between_games.response.series_id, local: { ...emptyLocal(), plan: "balanced" } }));
    const t = new LiveSeriesTransport({ store, fetchImpl: f });
    const env = (await t.resume())!;
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
