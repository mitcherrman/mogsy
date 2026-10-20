/**
 * UX-3 — the contract double behaves like the authority the UI expects:
 * one transition per advance, rev + request-id discipline, no duplicate
 * grading, resume from persistence, and a BO5 that ends at three wins.
 */
import { describe, expect, it } from "vitest";
import { TransportError, type SeriesEnvelope } from "./contracts";
import { BO5_FIXTURE, FixtureSeriesServer, STORE_KEY, __placeholderAnswerForTests, memoryStore, type Bo5Fixture } from "./fixtureServer";
import { newRequestId } from "./transport";

const rid = () => newRequestId("t");
const m = (e: SeriesEnvelope) => ({ rev: e.series.rev, requestId: rid() });

async function toPause(srv: FixtureSeriesServer, e: SeriesEnvelope): Promise<SeriesEnvelope> {
  while (e.game && e.game.next.can_advance) e = await srv.advance(m(e), e.game.seq);
  return e;
}
/** Answer the pending Baron with `want` correct answers, using the double's private key (tests only). */
async function answerBaron(srv: FixtureSeriesServer, e: SeriesEnvelope, want: number): Promise<SeriesEnvelope> {
  const enc = e.game!.objective!.encounter_id;
  e = await srv.openObjective(m(e), enc);
  for (let i = 0; i < 3; i++) {
    const q = e.objective!.questions[i];
    const key = __placeholderAnswerForTests(q.prompt!);
    e = await srv.answerQuestion(m(e), enc, i, i < want ? key : (key + 1) % q.options!.length);
  }
  expect(e.objective!.graded!.correct_count).toBe(want);
  return srv.settleObjective(m(e), enc);
}
async function playGame(srv: FixtureSeriesServer, e: SeriesEnvelope, lineup: string, baron = 3): Promise<SeriesEnvelope> {
  e = await srv.lockLineup(m(e), lineup);
  e = await toPause(srv, e);
  if (e.game!.phase === "awaiting_objective") { e = await answerBaron(srv, e, baron); e = await toPause(srv, e); }
  expect(e.game!.phase).toBe("settled");
  return e;
}

const nextPlan = (srv: FixtureSeriesServer, e: SeriesEnvelope, lineup: string) => srv.decide(m(e), lineup === e.series.plan ? "keep_plan" : "switch_plan", lineup);
/** Games 1–3 of the recorded series (W, L, L), leaving the draft for game 4 open. */
async function firstThree(srv: FixtureSeriesServer): Promise<SeriesEnvelope> {
  let e = await srv.create({ requestId: rid() });
  e = await srv.choosePlan(m(e), "balanced");
  e = await playGame(srv, e, "balanced"); e = await nextPlan(srv, e, "early");
  e = await playGame(srv, e, "early"); e = await nextPlan(srv, e, "early");
  e = await playGame(srv, e, "early"); e = await nextPlan(srv, e, "balanced");
  expect(e.series.games.map((g) => g.winner)).toEqual(["you", "opponent", "opponent"]);
  return e;
}

describe("FixtureSeriesServer", () => {
  it("plays a full five-game BO5 to first-to-three with real recorded consequences", async () => {
    const srv = new FixtureSeriesServer();
    let e = await srv.create({ requestId: rid() });
    expect(e.series.status).toBe("prep");
    e = await srv.choosePlan(m(e), "balanced");
    const plan = ["balanced", "early", "early", "balanced", "balanced"];
    for (let g = 0; g < 5; g++) {
      e = await playGame(srv, e, plan[g]);
      const last = e.series.games[e.series.games.length - 1];
      // The series records exactly what the E1 settlement says.
      expect(last.winner).toBe(e.game!.settlement!.winner);
      expect(last.how).toBe(e.game!.settlement!.how);
      expect(last.points).toEqual(e.game!.stages.map((t) => t.you_points));
      if (e.series.status === "complete") break;
      expect(e.series.status).toBe("between_games");
      e = await srv.decide(m(e), plan[g + 1] === e.series.plan ? "keep_plan" : "switch_plan", plan[g + 1]);
    }
    expect(e.series.status).toBe("complete");
    expect(e.series.games.map((g) => g.winner)).toEqual(["you", "opponent", "opponent", "you", "you"]);
    expect([e.series.wins, e.series.losses]).toEqual([3, 2]);
    expect(e.series.winner).toBe("you");
    expect(e.series.games.filter((g) => g.objective).map((g) => g.objective!.correct_count)).toEqual([3, 3]);
    expect(e.series.games[4].how).toBe("objective_closeout");
    expect(srv.gradedAnswers).toBe(6);
    await expect(srv.lockLineup(m(e), "balanced")).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });

  it("follows the recorded E1 branch for every possible Baron count", async () => {
    const seen: Record<number, string> = {};
    for (const want of [0, 1, 2, 3]) {
      const srv = new FixtureSeriesServer();
      let e = await firstThree(srv);
      e = await playGame(srv, e, "balanced", want);
      const obj = e.game!.events.find((x) => x.resolution === "objective")!;
      expect(obj.outcome.correct_count).toBe(want);
      seen[want] = `${obj.outcome.category}|${e.game!.settlement!.how}`;
    }
    expect(seen[3]).toBe("baron_ace_closeout|objective_closeout");
    expect(seen[2].startsWith("baron_with_trades|late_decides")).toBe(true);
    expect(seen[1].startsWith("baron_heavy_losses|late_decides")).toBe(true);
    expect(seen[0].startsWith("enemy_baron_team_wiped|late_decides")).toBe(true);
  });

  it("rejects stale revisions with the fresh state, and illegal lineups", async () => {
    const srv = new FixtureSeriesServer();
    let e = await srv.create({ requestId: rid() });
    const old = e;
    e = await srv.choosePlan(m(e), "early");
    const err = await srv.lockLineup(m(old), "early").catch((x) => x as TransportError);
    expect(err).toBeInstanceOf(TransportError);
    expect((err as TransportError).code).toBe("STALE_REVISION");
    expect((err as TransportError).fresh!.series.rev).toBe(e.series.rev);
    await expect(srv.lockLineup(m(e), "five_mids")).rejects.toMatchObject({ code: "ILLEGAL_LINEUP" });
    e = await srv.lockLineup(m(e), "early");
    await expect(srv.advance(m(e), e.game!.seq + 1)).rejects.toMatchObject({ code: "STALE_REVISION" });
  });

  it("never applies a replayed request twice (response lost after apply)", async () => {
    const srv = new FixtureSeriesServer();
    let e = await srv.create({ requestId: rid() });
    e = await srv.choosePlan(m(e), "early");
    e = await srv.lockLineup(m(e), "early");
    const req = m(e);
    srv.inject({ method: "advance", when: "after" });
    await expect(srv.advance(req, e.game!.seq)).rejects.toMatchObject({ code: "NETWORK" });
    const replay = await srv.advance(req, e.game!.seq); // same rev + requestId
    expect(replay.game!.seq).toBe(e.game!.seq + 1);
    const again = await srv.advance(req, e.game!.seq);
    expect(again.game!.seq).toBe(e.game!.seq + 1);
    await expect(srv.choosePlan(req, "early")).rejects.toMatchObject({ code: "NOT_ALLOWED" }); // id reused for another action
  });

  it("grades each question once: duplicate and out-of-order answers are refused", async () => {
    const srv = new FixtureSeriesServer();
    let e = await firstThree(srv);
    e = await srv.lockLineup(m(e), "balanced");
    e = await toPause(srv, e);
    const enc = e.game!.objective!.encounter_id;
    await expect(srv.answerQuestion(m(e), enc, 0, 0)).rejects.toMatchObject({ code: "ENCOUNTER_MISMATCH" }); // not opened
    await expect(srv.openObjective(m(e), "not-the-encounter")).rejects.toMatchObject({ code: "ENCOUNTER_MISMATCH" });
    e = await srv.openObjective(m(e), enc);
    const reopened = await srv.openObjective(m(e), enc); // idempotent: same child, same questions
    expect(reopened.objective!.questions.map((q) => q.prompt)).toEqual(e.objective!.questions.map((q) => q.prompt));
    e = reopened;
    await expect(srv.answerQuestion(m(e), enc, 1, 0)).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    e = await srv.answerQuestion(m(e), enc, 0, 0);
    await expect(srv.answerQuestion(m(e), enc, 0, 1)).rejects.toMatchObject({ code: "ALREADY_ANSWERED" });
    await expect(srv.settleObjective(m(e), enc)).rejects.toMatchObject({ code: "NOT_ALLOWED" }); // not graded yet
    expect(srv.gradedAnswers).toBe(1);
    // Public view never carries the key.
    expect(JSON.stringify(e)).not.toMatch(/"correct"\s*:/);
  });

  it("resumes mid-encounter after a refresh (new instance, same store)", async () => {
    const store = memoryStore();
    let srv = new FixtureSeriesServer({ store });
    let e = await firstThree(srv);
    e = await srv.lockLineup(m(e), "balanced");
    e = await toPause(srv, e);
    const enc = e.game!.objective!.encounter_id;
    e = await srv.openObjective(m(e), enc);
    e = await srv.answerQuestion(m(e), enc, 0, __placeholderAnswerForTests(e.objective!.questions[0].prompt!));
    srv = new FixtureSeriesServer({ store }); // "refresh"
    const r = (await srv.resume())!;
    expect(r.series.rev).toBe(e.series.rev);
    expect(r.game!.seq).toBe(e.game!.seq);
    expect(r.objective!.question_index).toBe(1);
    expect(r.objective!.questions[0].state).toBe("revealed_correct");
    expect(r.objective!.questions[1].state).toBe("answering");
    expect(store.get(STORE_KEY)).not.toMatch(/"correct"\s*:/);
  });

  it("refuses a recovery decision that needs E3, and unsupported objective kinds", async () => {
    const srv = new FixtureSeriesServer();
    let e = await srv.create({ requestId: rid() });
    e = await srv.choosePlan(m(e), "early");
    e = await playGame(srv, e, "early");
    await expect(srv.decide(m(e), "recovery_rest", "early")).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(srv.decide(m(e), "keep_plan", "scaling")).rejects.toMatchObject({ code: "NOT_ALLOWED" });

    // A future objective kind with no host: the double refuses to open it; nothing is graded.
    const fx = JSON.parse(JSON.stringify(BO5_FIXTURE)) as Bo5Fixture;
    const p = fx.games[3].options.balanced;
    const pre = p.frames[p.frames.length - 1] as { $delta?: Record<string, unknown> };
    const obj = (pre.$delta?.objective ?? null) as Record<string, unknown> | null;
    expect(obj).not.toBeNull();
    obj!.encounter_kind = "elder_three_question";
    const s2 = new FixtureSeriesServer({ fixture: fx });
    let x = await firstThree(s2);
    x = await s2.lockLineup(m(x), "balanced");
    x = await toPause(s2, x);
    await expect(s2.openObjective(m(x), x.game!.objective!.encounter_id)).rejects.toMatchObject({ code: "UNSUPPORTED_OBJECTIVE" });
    expect(s2.gradedAnswers).toBe(0);
  });
});
