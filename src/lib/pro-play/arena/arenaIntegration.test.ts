/**
 * PPQ2-B integration — the projection against PPQ2-A's AUTHORITATIVE Arena
 * contract (no mirror types remain).
 *
 *  - Type level: the composed view is an `ArenaViewModel` and its surface is
 *    the union's question member. `tsc` fails this file if either drifts.
 *  - Reporting: the snapshot the Arena itself publishes for a question
 *    surface (`questionSurfaceReportSnapshot`) is the same snapshot the page
 *    path (`projection.reportable`) carries, field for field, before and after
 *    the grade. Either path can be the ONE publisher; never both.
 *  - Reveal: the answered question stays on the stage until `advance`, even
 *    though the next question and the advanced session counters have arrived.
 */
import { describe, expect, it } from "vitest";
import PRO_PLAY_SAMPLES, { type ProPlaySample } from "../__fixtures__/proPlaySamples";
import type { ProPlayAnswerResult, ProPlayQuestion } from "../api";
import type {
  ArenaQuestionSurface,
  ArenaSurfaceView,
  ArenaViewModel,
  QuestionReportRef,
} from "@/lib/ranked-core/arenaView";
import { questionSurfaceReportSnapshot } from "@/lib/ranked-core/reportSnapshot";
import { INITIAL_PRO_PLAY_ARENA_STATE, proPlayArenaReducer } from "./state";
import { projectProPlayArena } from "./projectProPlayArena";
import { composeProPlayArenaView } from "./composeArenaView";
import type { ProPlayArenaQuestionSurface, ProPlayArenaReportRef, ProPlayArenaState } from "./types";

type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
// The aliases ARE the authoritative types.
const surfaceIsArena: Eq<ProPlayArenaQuestionSurface, ArenaQuestionSurface> = true;
const refIsArena: Eq<ProPlayArenaReportRef, QuestionReportRef> = true;

const SAMPLES = Object.entries(PRO_PLAY_SAMPLES) as [string, ProPlaySample][];
const SLOTS = {
  left: { kind: "panel" as const, node: null },
  right: { kind: "panel" as const, node: null },
  hudAction: null,
  onSelectOption: () => {},
};

const pre = (q: ProPlayQuestion): ProPlayArenaState => ({
  ...INITIAL_PRO_PLAY_ARENA_STATE,
  session: { session_id: "sess-1", total: q.total, answered: q.number - 1, score: 0, complete: false },
  question: q,
});
const post = (q: ProPlayQuestion, r: ProPlayAnswerResult): ProPlayArenaState => ({
  ...pre(q),
  session: { session_id: "sess-1", total: q.total, answered: q.number, score: 1, complete: false },
  result: r,
  selected: r.selected_answer,
});

/** The Arena's own snapshot of a composed Pro Play view. */
function arenaSnapshot(view: ArenaViewModel) {
  const surface: ArenaSurfaceView = view.surface;
  if (surface.kind !== "question") throw new Error("expected the question member");
  return questionSurfaceReportSnapshot({
    identity: view.report!,
    question: surface.question,
    selectedOptionId: surface.selectedOptionId,
    reveal: surface.reveal,
    reportRef: surface.reportRef ?? null,
  });
}
/** undefined and null both mean "not stated" in a snapshot. */
const norm = (o: object) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? null]));

describe("PPQ2-A authoritative contract", () => {
  it("uses the Arena's own question surface and report ref types", () => {
    expect(surfaceIsArena && refIsArena).toBe(true);
  });

  it.each(SAMPLES)("%s composes an ArenaViewModel on the question member", (_n, { question: q }) => {
    const view: ArenaViewModel = composeProPlayArenaView(projectProPlayArena(pre(q)), SLOTS)!;
    expect(view.surface.kind).toBe("question");
  });
});

describe("one report snapshot, two equivalent sources", () => {
  it.each(SAMPLES)("%s: Arena snapshot === page snapshot, before and after the grade", (_n, { question: q, result: r }) => {
    for (const state of [pre(q), post(q, r)]) {
      const projection = projectProPlayArena(state);
      const fromArena = arenaSnapshot(composeProPlayArenaView(projection, SLOTS)!);
      expect(norm(fromArena)).toEqual(norm(projection.reportable!));
    }
    expect(arenaSnapshot(composeProPlayArenaView(projectProPlayArena(pre(q)), SLOTS)!).canonicalAnswer)
      .toBeUndefined();
    expect(arenaSnapshot(composeProPlayArenaView(projectProPlayArena(post(q, r)), SLOTS)!).canonicalAnswer)
      .toBe(r.correct_answer);
  });

  it("the projection layer publishes nothing itself", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join, resolve } = await import("node:path");
    const dir = resolve(process.cwd(), "src", "lib", "pro-play", "arena");
    for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x) && !/\.test\./.test(x))) {
      expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/usePublishReportableQuestion\s*\(/);
    }
  });
});

describe("the reveal stays on the answered question until Next", () => {
  it.each(SAMPLES)("%s", (_n, { question: q, result: r }) => {
    const next: ProPlayQuestion = { ...q, number: q.number + 1, index: q.index + 1, question_id: `${q.question_id}-next` };
    const request = { sessionId: "sess-1", questionId: q.question_id, selectedAnswer: r.selected_answer };
    let s = proPlayArenaReducer(pre(q), { type: "answerSent", request });
    s = proPlayArenaReducer(s, {
      type: "answerSettled", request,
      outcome: { kind: "answered", turn: {
        session: { session_id: "sess-1", total: q.total, answered: q.number, score: 1, complete: false },
        question: next, result: r,
      } },
    });
    const revealed = composeProPlayArenaView(projectProPlayArena(s), SLOTS)!;
    // Stage: still the ANSWERED question, with its reveal and its selection.
    expect(revealed.surface.question.questionId).toBe(q.question_id);
    expect(revealed.surface.reveal?.revealed).toBe(true);
    expect(revealed.header.title).toBe(`Question ${q.number} / ${q.total}`);
    expect(revealed.surface.reportRef).toEqual({ sessionId: "sess-1", questionNumber: q.number });
    // Server truth already advanced: the strip shows the graded node resolved.
    const node = revealed.timeline!.nodes.find((n) => n.roundNumber === q.number)!;
    expect(node.state).toBe("resolved");

    const advanced = composeProPlayArenaView(projectProPlayArena(proPlayArenaReducer(s, { type: "advance" })), SLOTS)!;
    expect(advanced.surface.question.questionId).toBe(next.question_id);
    expect(advanced.surface.reveal).toBeNull();
    expect(advanced.hudAction).toBeNull();
  });
});
