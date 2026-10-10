/**
 * PPQ2-B — the projection, against every frozen production payload.
 *
 * Each fixture is played through the same two states the live run passes
 * through: the question on the stage before grading, and the same question
 * with the server's grade. The pre-answer half proves the information
 * boundary; the post-answer half proves every revealed fact is the server's.
 */
import { describe, expect, it } from "vitest";
import PRO_PLAY_SAMPLES, { type ProPlaySample } from "../__fixtures__/proPlaySamples";
import type { ProPlayAnswerResult, ProPlayQuestion, ProPlaySessionState } from "../api";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { INITIAL_PRO_PLAY_ARENA_STATE } from "./state";
import {
  PRO_PLAY_REPORT_IDENTITY,
  projectProPlayArena,
  projectRunPips,
} from "./projectProPlayArena";
import { composeProPlayArenaView } from "./composeArenaView";
import type { ProPlayArenaState } from "./types";

const SAMPLES = Object.entries(PRO_PLAY_SAMPLES) as [string, ProPlaySample][];

const sessionFor = (q: ProPlayQuestion, answered: number, score: number, complete = false): ProPlaySessionState => ({
  session_id: "sess-1",
  total: q.total,
  answered,
  score,
  complete,
});

/** The question on the stage, ungraded: answered = number - 1. */
function preAnswer(q: ProPlayQuestion, extra: Partial<ProPlayArenaState> = {}): ProPlayArenaState {
  return {
    ...INITIAL_PRO_PLAY_ARENA_STATE,
    session: sessionFor(q, q.number - 1, 0),
    question: q,
    ...extra,
  };
}

/** The same question with the server's grade received. */
function postAnswer(q: ProPlayQuestion, r: ProPlayAnswerResult, score = r.is_correct ? 1 : 0): ProPlayArenaState {
  return {
    ...INITIAL_PRO_PLAY_ARENA_STATE,
    session: sessionFor(q, q.number, score, q.number === q.total),
    question: q,
    result: r,
    selected: r.selected_answer,
    outcomes: { [q.number]: r.is_correct ? "correct" : "incorrect" },
  };
}

/** Every [path, value] in a plain data tree (functions skipped). */
function walk(node: unknown, path = "$", out: [string, unknown][] = []): [string, unknown][] {
  out.push([path, node]);
  if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, out);
  }
  return out;
}

describe("the fixture corpus", () => {
  it("covers every relationship, both question forms and every scope kind", () => {
    const rels = new Set(SAMPLES.map(([, s]) => (s.question.context as { relationship: { id: string } }).relationship.id));
    expect([...rels].sort()).toEqual(
      ["champion_player", "champion_team", "player_champion", "scope_champion", "team_champion"],
    );
    const counts = new Set(SAMPLES.map(([, s]) => s.question.choices.length));
    expect(counts.has(2)).toBe(true);
    expect([...counts].some((n) => n >= 3)).toBe(true);
    // Both verdicts are represented, so both reveal branches run on real data.
    expect(SAMPLES.some(([, s]) => s.result.is_correct)).toBe(true);
    expect(SAMPLES.some(([, s]) => !s.result.is_correct)).toBe(true);
  });
});

describe.each(SAMPLES)("fixture %s", (_name, { question: q, result: r }) => {
  describe("before grading", () => {
    const view = projectProPlayArena(preAnswer(q));

    it("keeps question identity and the server's option order", () => {
      expect(view.phase).toBe("question");
      const surface = view.surface!;
      expect(surface.kind).toBe("question");
      expect(surface.question.questionId).toBe(q.question_id);
      expect(surface.question.prompt).toBe(q.question_text);
      expect(surface.question.category).toBe(q.topic);
      expect(surface.question.options.map((o) => o.label)).toEqual(q.choices);
      expect(surface.question.options.map((o) => o.id)).toEqual(q.choices.map((_, i) => String(i)));
      expect(surface.question.options.map((o) => o.index)).toEqual(q.choices.map((_, i) => i));
      expect(surface.reportRef).toEqual({ sessionId: "sess-1", questionNumber: q.number });
      expect(view.header.title).toBe(`Question ${q.number} / ${q.total}`);
    });

    it("is answer-safe: no reveal, no grade, no evidence, no canonical answer", () => {
      expect(view.surface!.reveal).toBeNull();
      expect(view.reveal).toBeNull();
      expect(view.next).toBeNull();
      expect(view.terminal).toBeNull();
      expect(view.reportable!.canonicalAnswer).toBeNull();
      // No key anywhere in the projection that could carry a grade is set.
      for (const [path, value] of walk(view)) {
        if (/(correct|evidence|explanation|reveal|canonical)[^.[]*$/i.test(path)) {
          expect(value ?? null, path).toBeNull();
        }
      }
      // Nothing from the result payload reached the pre-answer projection.
      const json = JSON.stringify(view);
      expect(json).not.toContain(r.explanation);
      // No statistic: evidence rows are keyed by `display`/`win_rate`/... and
      // none of those keys exists before the grade.
      expect(json).not.toMatch(/"(display|win_rate|games|wins|picks|bans|presence|champion_share)":/);
    });

    it("opens exactly the answer input and nothing else", () => {
      expect(view.surface!.permissions).toEqual({ ...NO_INTERACTIONS, canSelectAnswer: true });
      expect(view.surface!.inputOpen).toBe(true);
      expect(view.surface!.selectedOptionId).toBeNull();
    });

    it("aligns one identity per option, all or none, from the pre-answer context", () => {
      const dossier = view.dossier!;
      expect(dossier).not.toBeNull();
      expect(dossier.relationship.label.length).toBeGreaterThan(0);
      expect(dossier.optionSubjects!.map((s) => s.label)).toEqual(q.choices);
      const ctx = q.context as { scope_tags: unknown[]; editorial_tags: { id: string }[] };
      expect(dossier.scopeTags).toEqual(ctx.scope_tags);
      expect(dossier.recent).toBe(ctx.editorial_tags.some((t) => t.id === "recent_esports"));
    });

    it("locks the input while the answer is in flight", () => {
      const busy = projectProPlayArena(preAnswer(q, { busy: "answering", selected: q.choices[0] }));
      expect(busy.surface!.permissions).toEqual(NO_INTERACTIONS);
      expect(busy.surface!.inputOpen).toBe(false);
      expect(busy.surface!.selectedOptionId).toBe("0");
      expect(busy.surface!.reveal).toBeNull();
    });
  });

  describe("after grading", () => {
    const view = projectProPlayArena(postAnswer(q, r));
    const correctId = String(q.choices.indexOf(r.correct_answer));
    const selectedId = String(q.choices.indexOf(r.selected_answer));

    it("reveals exactly the server's grade, on the server's option", () => {
      expect(view.phase).toBe("revealed");
      expect(view.surface!.reveal).toEqual({
        revealed: true,
        isCorrect: r.is_correct,
        correctOptionId: correctId,
        explanation: null,
      });
      expect(view.surface!.selectedOptionId).toBe(selectedId);
      expect(view.surface!.inputOpen).toBe(false);
      expect(view.surface!.permissions).toEqual(NO_INTERACTIONS);
      // Positions never move at the reveal.
      expect(view.surface!.question.options.map((o) => o.label)).toEqual(q.choices);
    });

    it("carries the server's explanation and evidence verbatim for the reveal", () => {
      expect(view.reveal).toMatchObject({
        isCorrect: r.is_correct,
        selectedAnswer: r.selected_answer,
        correctAnswer: r.correct_answer,
        correctOptionId: correctId,
        explanation: r.explanation,
      });
      expect(view.reveal!.evidence!.subjects).toEqual((r.evidence as { subjects: unknown[] }).subjects);
      expect(view.reportable!.canonicalAnswer).toBe(r.correct_answer);
      expect(view.next).toEqual({
        label: q.number === q.total ? "See results" : "Next",
        enabled: true,
      });
    });

    it("records the verdict on the run, at the question's position", () => {
      const pip = view.run!.pips.find((p) => p.number === q.number)!;
      expect(pip.state).toBe(r.is_correct ? "correct" : "incorrect");
      const node = view.timeline!.nodes.find((n) => n.roundNumber === q.number)!;
      expect(node.state).toBe("resolved");
      expect(node.outcome).toBe(r.is_correct ? "correct" : "incorrect");
    });
  });
});

describe("server-owned scoring", () => {
  const { question: q, result: r } = PRO_PLAY_SAMPLES.champion_team as ProPlaySample;

  it("trusts is_correct even when it disagrees with a label comparison", () => {
    // A deliberately inconsistent payload: the server says correct although
    // the labels differ. The projection must report the server's verdict.
    const odd: ProPlayAnswerResult = { ...r, is_correct: true, selected_answer: "Fnatic", correct_answer: "Splyce" };
    const view = projectProPlayArena(postAnswer(q, odd, 7));
    expect(view.surface!.reveal!.isCorrect).toBe(true);
    expect(view.reveal!.isCorrect).toBe(true);
    expect(view.run!.score).toBe(7);
  });

  it("copies score, answered and total from the session verbatim", () => {
    const state: ProPlayArenaState = {
      ...postAnswer(q, r),
      session: { session_id: "sess-1", total: 10, answered: 2, score: 9, complete: false },
    };
    const run = projectProPlayArena(state).run!;
    expect(run).toMatchObject({ total: 10, answered: 2, score: 9 });
  });

  it("has a null correct option rather than a guess when the label is unknown", () => {
    const view = projectProPlayArena(postAnswer(q, { ...r, correct_answer: "Nobody" }));
    expect(view.surface!.reveal!.correctOptionId).toBeNull();
  });
});

describe("run history uses only observed results", () => {
  const { question: q } = PRO_PLAY_SAMPLES.team_champion as ProPlaySample; // number 8

  it("marks answered-but-unseen positions unobserved, never a verdict", () => {
    const state: ProPlayArenaState = {
      ...preAnswer(q),
      session: { session_id: "sess-1", total: 10, answered: 7, score: 4, complete: false },
      outcomes: { 1: "correct", 2: "incorrect", 5: "correct" },
    };
    const pips = projectRunPips(state).map((p) => p.state);
    expect(pips).toEqual([
      "correct", "incorrect", "unobserved", "unobserved", "correct", "unobserved", "unobserved",
      "current", "upcoming", "upcoming",
    ]);
    const timeline = projectProPlayArena(state).timeline!;
    expect(timeline.visibleNodes).toBe(10);
    expect(timeline.nodes.map((n) => n.outcome)).toEqual([
      "correct", "incorrect", null, null, "correct", null, null, null, null, null,
    ]);
    expect(timeline.currentRoundNumber).toBe(8);
  });
});

describe("terminal completion", () => {
  const { question: q, result: r } = PRO_PLAY_SAMPLES.nuguri_clear as ProPlaySample;

  it("summarises with the server's score and total once the last reveal is dismissed", () => {
    const state: ProPlayArenaState = {
      ...INITIAL_PRO_PLAY_ARENA_STATE,
      session: { session_id: "sess-1", total: 10, answered: 10, score: 6, complete: true },
      question: null,
      outcomes: { 1: "correct", 10: "incorrect" },
    };
    const view = projectProPlayArena(state);
    expect(view.phase).toBe("complete");
    expect(view.surface).toBeNull();
    expect(view.terminal).toMatchObject({ score: 6, total: 10, answered: 10, sessionId: "sess-1" });
    expect(view.terminal!.pips.map((p) => p.state)).toEqual([
      "correct", ...Array(8).fill("unobserved"), "incorrect",
    ]);
    expect(view.timeline!.currentRoundNumber).toBeNull();
    expect(view.timeline!.nodes.every((n) => n.state === "resolved")).toBe(true);
    expect(view.header.title).toBe("Quiz complete");
  });

  it("keeps the last reveal (no terminal) until it is dismissed", () => {
    const last = { ...q, number: 10, index: 9 };
    const view = projectProPlayArena(postAnswer(last, r));
    expect(view.terminal).toBeNull();
    expect(view.next!.label).toBe("See results");
  });
});

describe("errors", () => {
  const { question: q } = PRO_PLAY_SAMPLES.recent as ProPlaySample;

  it("keeps the locked question on stage with the error line and the recovery", () => {
    const request = { sessionId: "sess-1", questionId: q.question_id, selectedAnswer: q.choices[1] };
    const view = projectProPlayArena(preAnswer(q, {
      selected: q.choices[1],
      error: { message: "Pro Play is unavailable right now.", code: "PP_NETWORK", status: 0 },
      recovery: { kind: "answer", request },
    }));
    expect(view.phase).toBe("question");
    expect(view.surface!.permissions).toEqual(NO_INTERACTIONS);
    expect(view.surface!.selectedOptionId).toBe("1");
    expect(view.surface!.reveal).toBeNull();
    expect(view.status).toEqual({ text: "Pro Play is unavailable right now.", isError: true });
    expect(view.error).toMatchObject({ action: "answer", enabled: true });
  });

  it("is error-only when nothing is on stage", () => {
    const view = projectProPlayArena({
      ...INITIAL_PRO_PLAY_ARENA_STATE,
      error: { message: "x", code: "PP_ERROR", status: 503 },
      recovery: { kind: "restart" },
    });
    expect(view.phase).toBe("error");
    expect(view.surface).toBeNull();
    expect(view.error!.action).toBe("restart");
  });

  it("is loading with no state", () => {
    expect(projectProPlayArena(INITIAL_PRO_PLAY_ARENA_STATE).phase).toBe("loading");
    expect(projectProPlayArena({ ...INITIAL_PRO_PLAY_ARENA_STATE, busy: "starting" }).header.title)
      .toBe("Preparing questions…");
  });
});

describe("zero fake Ranked semantics", () => {
  const RANKED = /\b(opponent|opponents|hp|elo|mmr|rating|damage|victory|defeat|duel|duelist|matchmaking|winner|rematch|forfeit)\b/i;

  it.each(SAMPLES)("%s: no Ranked key or value anywhere in either projection", (_n, { question: q, result: r }) => {
    for (const view of [projectProPlayArena(preAnswer(q)), projectProPlayArena(postAnswer(q, r))]) {
      for (const [path, value] of walk(view)) {
        const key = path.split(/[.[]/).pop() ?? "";
        expect(key, path).not.toMatch(RANKED);
        // Strings the projection authored (not server payload passthrough).
        if (typeof value === "string" && !path.includes("dossier") && !path.includes(".reveal.")
          && !path.includes("reportable") && !path.includes(".question.")) {
          expect(value, path).not.toMatch(RANKED);
        }
      }
    }
  });

  it("composes an arena view with every Ranked member empty", () => {
    const { question: q } = PRO_PLAY_SAMPLES.scope_champion as ProPlaySample;
    const noop = () => {};
    const view = composeProPlayArenaView(projectProPlayArena(preAnswer(q)), {
      left: { kind: "panel", node: null },
      right: { kind: "panel", node: null },
      hudAction: "NEXT",
      onSelectOption: noop,
    })!;
    expect(view.roundBeat).toBeNull();
    expect(view.segmentBeat).toBeNull();
    expect(view.cardBeat).toBeNull();
    expect(view.abilityHud).toBeNull();
    expect(view.revealHold).toBe(false);
    expect(view.progressionEnabled).toBe(false);
    expect(view.header.timer).toBeNull();
    expect(view.report).toBe(PRO_PLAY_REPORT_IDENTITY);
    expect(view.left.kind).toBe("panel");
    expect(view.right.kind).toBe("panel");
    // The Next slot is withheld until a grade exists.
    expect(view.hudAction).toBeNull();
    expect(view.surface.onSelectOption).toBe(noop);
    expect(view.resultFeedback).toBeUndefined();
  });

  it("composes nothing when no question is on stage", () => {
    expect(composeProPlayArenaView(projectProPlayArena(INITIAL_PRO_PLAY_ARENA_STATE), {
      left: { kind: "panel", node: null }, right: { kind: "panel", node: null },
      hudAction: null, onSelectOption: () => {},
    })).toBeNull();
  });
});
