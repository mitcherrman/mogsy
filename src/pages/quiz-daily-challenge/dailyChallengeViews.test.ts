/**
 * DC1 Phase 5 — the projections, without a DOM.
 *
 * These are the rules the arena renders FROM, so they are worth pinning apart
 * from any component: which surface a card is in, what a beat means, what the
 * challenge column measures, and how a finite plan of unknown length becomes a
 * strip.
 */

import { describe, expect, it } from "vitest";
import { readRun } from "@/lib/daily-challenge/contracts";
import {
  BEAT_COPY,
  canAnswer,
  cardPhase,
  projectBeat,
  projectChallenge,
  projectOptionMedia,
  projectPlayer,
  projectQuestion,
  projectTimeline,
  projectTimer,
  timeoutBeat,
} from "./dailyChallengeViews";
import type { DcStructureEntry } from "@/lib/daily-challenge/contracts";
import { DATE, rawCard, rawRun, rawToday, parseRun } from "./testFixtures";

const card = (spec: Parameters<typeof rawCard>[0]) => readRun(
  rawRun({ cards: [spec] })).cards[0];

describe("card phase", () => {
  it("a standard card with a scored attempt left is open", () => {
    expect(cardPhase(card({ sequence: 1 }))).toBe("open");
    expect(canAnswer("open")).toBe(true);
  });

  it("a reflex card the player has reached but not started is READY", () => {
    const reflex = card({ sequence: 1, kind: "meta_reflex", optionCount: 2 });
    expect(cardPhase(reflex)).toBe("reflex_ready");
    // The whole point: no answer may be sent before the window is opened.
    expect(canAnswer("reflex_ready")).toBe(false);
  });

  it("a reflex card with a live server window is timed", () => {
    const reflex = card({
      sequence: 1, kind: "meta_reflex", optionCount: 2,
      activated: true, timerEndsAt: `${DATE}T12:00:06.000000+00:00`,
    });
    expect(cardPhase(reflex)).toBe("reflex_timed");
    expect(canAnswer("reflex_timed")).toBe(true);
  });

  it("a score-locked but unsolved card is in the learning phase", () => {
    const missed = card({ sequence: 1, scoreLocked: true, scoreOutcome: "wrong_answer",
      eliminated: [2] });
    expect(cardPhase(missed)).toBe("learning");
    // Still answerable — that IS retry-until-correct.
    expect(canAnswer("learning")).toBe(true);
  });

  it("a timed-out reflex card is learning, not finished", () => {
    const lapsed = card({ sequence: 1, kind: "meta_reflex", optionCount: 2,
      activated: true, scoreLocked: true, scoreOutcome: "timeout" });
    expect(cardPhase(lapsed)).toBe("learning");
    // And the window is gone: no timer survives the lock.
    expect(lapsed.timer).toBeNull();
  });

  it("a resolved card is resolved", () => {
    expect(cardPhase(card({ sequence: 1, resolved: true }))).toBe("resolved");
    expect(canAnswer("resolved")).toBe(false);
  });
});

describe("question projection", () => {
  it("option ids are the BACKEND index, including for eliminated options", () => {
    const q = projectQuestion(card({ sequence: 1, eliminated: [1] }));
    expect(q.options.map((o) => o.id)).toEqual(["0", "1", "2", "3"]);
    expect(q.options.map((o) => o.index)).toEqual([0, 1, 2, 3]);
  });

  it("a recognition side with no label projects an empty string, not undefined", () => {
    const raw = rawRun({ cards: [{ sequence: 1, kind: "meta_reflex", optionCount: 2 }] });
    const cards = raw.cards as Record<string, unknown>[];
    (cards[0].options as Record<string, unknown>[]).forEach((o) => { o.label = null; });
    const q = projectQuestion(readRun(raw).cards[0]);
    expect(q.options.every((o) => o.label === "")).toBe(true);
  });

  it("reports no option media when the card has none", () => {
    expect(projectOptionMedia(card({ sequence: 1 }))).toBeNull();
  });
});

describe("timer projection", () => {
  const base = Date.parse(`${DATE}T12:00:00.000Z`);
  const timed = card({
    sequence: 1, kind: "meta_reflex", optionCount: 2,
    activated: true, timerEndsAt: `${DATE}T12:00:06.000000+00:00`,
  });

  it("counts down against the server deadline", () => {
    const t = projectTimer(timed, 6000, base + 2000, 0);
    expect(t?.remainingSeconds).toBe(4);
    expect(t?.durationSeconds).toBe(6);
    expect(t?.paused).toBe(false);
  });

  it("goes urgent under two seconds and never below zero", () => {
    expect(projectTimer(timed, 6000, base + 4500, 0)?.urgent).toBe(true);
    expect(projectTimer(timed, 6000, base + 99_000, 0)?.remainingSeconds).toBe(0);
  });

  it("corrects for a device clock that disagrees with the server", () => {
    // Device is 10s BEHIND the server, so the same wall instant is later.
    const t = projectTimer(timed, 6000, base + 2000, 10_000);
    expect(t?.remainingSeconds).toBe(0);
  });

  it("is null when no window is open", () => {
    expect(projectTimer(card({ sequence: 1 }), null, base, 0)).toBeNull();
    expect(projectTimer(null, null, base, 0)).toBeNull();
  });
});

describe("beats", () => {
  const standard = card({ sequence: 3 });

  it("a first correct answer is a SCORED beat carrying the delta", () => {
    const beat = projectBeat(
      { phase: "scored", correct: true, resolved: true, scoreLockedNow: true,
        scoreDelta: 125, eliminatedIndex: null }, standard);
    expect(beat.kind).toBe("first_correct");
    expect(beat.scored).toBe(true);
    expect(beat.scoreDelta).toBe(125);
    expect(beat.sequence).toBe(3);
  });

  it("a first miss is scored-phase but takes no ground", () => {
    const beat = projectBeat(
      { phase: "scored", correct: false, resolved: false, scoreLockedNow: true,
        scoreDelta: 0, eliminatedIndex: 2 }, standard);
    expect(beat.kind).toBe("first_miss");
    expect(beat.scored).toBe(false);
    expect(beat.scoreDelta).toBe(0);
  });

  it("a retry miss is a QUIETER beat than the first one", () => {
    const beat = projectBeat(
      { phase: "learning", correct: false, resolved: false, scoreLockedNow: false,
        scoreDelta: 0, eliminatedIndex: 1 }, standard);
    expect(beat.kind).toBe("learning_miss");
    // Different beat for the same wrong answer, because it cost nothing.
    expect(beat.kind).not.toBe("first_miss");
  });

  it("an eventual solve is LEARNED, never presented as scored", () => {
    const beat = projectBeat(
      { phase: "learning", correct: true, resolved: true, scoreLockedNow: false,
        scoreDelta: 0, eliminatedIndex: null }, standard);
    expect(beat.kind).toBe("learned");
    expect(beat.scored).toBe(false);
    expect(BEAT_COPY.learned.title).toBe("Learned");
  });

  it("no beat copy blames the player", () => {
    const words = Object.values(BEAT_COPY)
      .map((c) => `${c.title} ${c.detail}`.toLowerCase()).join(" ");
    for (const shaming of ["wrong", "fail", "incorrect", "lost"]) {
      expect(words).not.toContain(shaming);
    }
  });

  it("a lapsed window produces a beat from CARD STATE, not an answer", () => {
    const lapsed = card({ sequence: 7, kind: "meta_reflex", optionCount: 2,
      activated: true, scoreLocked: true, scoreOutcome: "timeout" });
    const beat = timeoutBeat(lapsed);
    expect(beat?.kind).toBe("reflex_timeout");
    expect(beat?.scored).toBe(false);
    expect(beat?.reflex).toBe(true);
  });

  it("a resolved card no longer announces its timeout", () => {
    const solved = card({ sequence: 7, kind: "meta_reflex", optionCount: 2,
      scoreOutcome: "timeout", resolved: true, firstAttemptCorrect: false });
    expect(timeoutBeat(solved)).toBeNull();
  });
});

describe("the challenge column", () => {
  it("measures cards and score SEPARATELY", () => {
    const run = parseRun(rawRun({
      cards: [{ sequence: 1, resolved: true }, { sequence: 2 }],
      cardCount: 12, resolvedCount: 1, score: 100, maxScore: 1250,
    }));
    const view = projectChallenge(run, "Cooldowns");
    expect(view.resolved).toBe(1);
    expect(view.total).toBe(12);
    expect(view.remaining).toBe(11);
    // Score is 100/1250 = 800bp; cards are 1/12. Two different truths.
    expect(view.progressBp).toBe(800);
    expect(view.theme).toBe("Cooldowns");
  });

  it("cannot exceed a full meter even if score outruns the frozen maximum", () => {
    const run = parseRun(rawRun({ cards: [{ sequence: 1 }], score: 1400, maxScore: 1250 }));
    expect(projectChallenge(run, null).progressBp).toBe(10_000);
  });

  it("a full score meter does NOT mean the run is over", () => {
    const run = parseRun(rawRun({
      cards: [{ sequence: 5 }], cardCount: 12, resolvedCount: 4,
      score: 1250, maxScore: 1250, status: "active",
    }));
    const view = projectChallenge(run, null);
    expect(view.progressBp).toBe(10_000);
    expect(view.complete).toBe(false);
    expect(view.remaining).toBe(8);
  });
});

describe("the player column", () => {
  it("distinguishes first-try from learned in the record", () => {
    const run = parseRun(rawRun({
      cards: [
        { sequence: 1, resolved: true, firstAttemptCorrect: true },
        { sequence: 2, resolved: true, firstAttemptCorrect: false,
          scoreOutcome: "wrong_answer" },
        { sequence: 3, resolved: true, firstAttemptCorrect: false, scoreOutcome: "timeout" },
        { sequence: 4 },
      ],
      resolvedCount: 3, timeouts: 1,
    }));
    expect(projectPlayer(run).record).toEqual(["correct", "learned", "timeout"]);
  });

  it("accuracy is null until a card settles", () => {
    const run = parseRun(rawRun({ cards: [{ sequence: 1 }], accuracyBp: null }));
    expect(projectPlayer(run).accuracyBp).toBeNull();
  });
});

describe("the run strip", () => {
  const structure = (rawToday().challenge as Record<string, unknown>)
    .structure as DcStructureEntry[];

  const runOf = (cardCount: number, current: number) => parseRun(rawRun({
    cards: [{ sequence: current }], cardCount, currentSequence: current,
  }));

  it.each([11, 12, 15])("draws one node per card for a %i-card day", (cardCount) => {
    const nodes = projectTimeline(runOf(cardCount, 1), structure, 1);
    expect(nodes).toHaveLength(cardCount);
    expect(nodes.map((n) => n.sequence)).toEqual(
      Array.from({ length: cardCount }, (_, i) => i + 1));
  });

  it("marks the current card active and everything past it as future", () => {
    const nodes = projectTimeline(runOf(12, 4), structure, 1);
    expect(nodes[3].state).toBe("active");
    expect(nodes[4].state).toBe("future");
    expect(nodes[11].state).toBe("future");
  });

  it("gives first-try, learned and timed-out cards DIFFERENT marks", () => {
    const run = parseRun(rawRun({
      cards: [
        { sequence: 1, resolved: true, firstAttemptCorrect: true },
        { sequence: 2, resolved: true, firstAttemptCorrect: false,
          scoreOutcome: "wrong_answer" },
        { sequence: 3, resolved: true, firstAttemptCorrect: false, scoreOutcome: "timeout" },
        { sequence: 4 },
      ],
      cardCount: 12, currentSequence: 4, resolvedCount: 3,
    }));
    const nodes = projectTimeline(run, structure, 1);
    expect(nodes.slice(0, 4).map((n) => n.state))
      .toEqual(["correct", "learned", "timeout", "active"]);
  });

  it("brackets the Meta Reflex block as one object", () => {
    const nodes = projectTimeline(runOf(12, 1), structure, 1);
    const reflex = nodes.filter((n) => n.kind === "meta_reflex");
    expect(reflex.map((n) => n.sequence)).toEqual([7, 8, 9, 10, 11]);
    expect(reflex[0].blockStart).toBe(true);
    expect(reflex[0].blockEnd).toBe(false);
    expect(reflex[4].blockEnd).toBe(true);
  });

  it("drops the kinds rather than guessing when the plan version disagrees", () => {
    // A run resumed across a regeneration plays an OLDER version whose shape
    // today's structure does not describe.
    const nodes = projectTimeline(runOf(12, 1), structure, 2);
    expect(nodes).toHaveLength(12);
    expect(nodes.every((n) => n.kind === null)).toBe(true);
  });

  it("never carries a prompt, option or category for an unreached card", () => {
    const nodes = projectTimeline(runOf(12, 1), structure, 1);
    const keys = new Set(nodes.flatMap((n) => Object.keys(n)));
    expect(keys).toEqual(new Set(["sequence", "state", "kind", "blockStart", "blockEnd"]));
  });
});
