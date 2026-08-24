/**
 * DC1 Phase 5 / ARENA1 Step 5 — the projections, without a DOM.
 *
 * These are the rules the arena renders FROM, so they are worth pinning apart
 * from any component: which surface a card is in, what a beat means, what the
 * challenge column measures, and how a finite plan of unknown length becomes a
 * strip.
 *
 * Step 5 replaced three of them. The question and option-media projections
 * became ONE projection into `PublicRoundView` — the shape the production
 * arena reads — and the bespoke timeline projection became two small inputs to
 * the canonical `projectRoundTimeline`. The rules they encoded did not change;
 * where they are applied did, and the assertions follow them there.
 */

import { describe, expect, it } from "vitest";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import { quizModule } from "@/lib/ranked-core/modules/quizModule";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import { readRun } from "@/lib/daily-challenge/contracts";
import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import { projectRoundTimeline } from "@/lib/ranked-core/roundTimeline";
import {
  BEAT_COPY,
  canAnswer,
  cardPhase,
  cardResultKind,
  dailyOutcomes,
  dailySegmentKinds,
  feedbackForCard,
  projectBeat,
  projectChallenge,
  projectPlayer,
  projectTimer,
  publicRoundFromCard,
  roundHistoryFromRun,
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

describe("the card, as a public round", () => {
  const questionOf = (c: Parameters<typeof card>[0]) =>
    questionViewFromPublicQuestion(publicRoundFromCard(card(c), null)!.question!);

  it("resolves the CANONICAL quiz renderer, never one of its own", () => {
    const round = publicRoundFromCard(card({ sequence: 1 }), null);
    expect(rendererForSegment(round.segment)).toBe(quizModule);
  });

  it("option ids are the BACKEND index, including for eliminated options", () => {
    const q = questionOf({ sequence: 1, eliminated: [1] });
    expect(q.options.map((o) => o.id)).toEqual(["0", "1", "2", "3"]);
    expect(q.options.map((o) => o.index)).toEqual([0, 1, 2, 3]);
    // And the struck one is named by the SAME id the grid will match on.
    // The struck set rides RG3's feedback model now, which is the one
    // channel the shared surface reads elimination, verdict and disclosure
    // from — see `feedbackForCard`.
    expect(feedbackForCard(card({ sequence: 1, eliminated: [1] })).eliminatedOptionIds)
      .toEqual(["1"]);
  });

  it("a recognition side with no label projects an empty string, not undefined", () => {
    const raw = rawRun({ cards: [{ sequence: 1, kind: "meta_reflex", optionCount: 2 }] });
    const cards = raw.cards as Record<string, unknown>[];
    (cards[0].options as Record<string, unknown>[]).forEach((o) => { o.label = null; });
    const q = questionViewFromPublicQuestion(
      publicRoundFromCard(readRun(raw).cards[0], null)!.question!);
    expect(q.options.every((o) => o.label === "")).toBe(true);
  });

  it("reports no option media when the card has none", () => {
    expect(publicRoundFromCard(card({ sequence: 1 }), null).question!.optionMedia).toBeNull();
  });

  /**
   * THE ART, WHICH THE PREVIOUS PROJECTION THREW AWAY.
   *
   * `projectQuestion` set `media: null` on every option and never looked at the
   * card's own `media` blob at all, so the mode rendered plain text for its
   * whole life while carrying everything it needed to render League art.
   */
  it("carries each option's frozen art through to the canonical option media", () => {
    const raw = rawRun({ cards: [{ sequence: 1, optionCount: 2 }] });
    const cards = raw.cards as Record<string, unknown>[];
    const opts = cards[0].options as Record<string, unknown>[];
    opts[0].media = "assets/items/3157.png";
    opts[0].entity_id = "3157";
    opts[1].media = "assets/items/3089.png";
    opts[1].entity_id = "3089";
    const q = questionViewFromPublicQuestion(
      publicRoundFromCard(readRun(raw).cards[0], null)!.question!);
    expect(q.options.map((o) => o.media?.icon))
      .toEqual(["assets/items/3157.png", "assets/items/3089.png"]);
    expect(q.options.map((o) => o.media?.id)).toEqual(["3157", "3089"]);
  });

  /**
   * The backend stores a quiz card's `media` as the question's own PRESENTATION
   * metadata (`media=record.presentation`), which is the same Quiz/Broadcast
   * blob Ranked transports — so passing it through is what gives the Daily the
   * premium scenario band instead of a text fallback.
   */
  it("hands the card's presentation metadata to the canonical scenario adapter", () => {
    const raw = rawRun({ cards: [{ sequence: 1 }] });
    const cards = raw.cards as Record<string, unknown>[];
    cards[0].media = { subject_type: "champion", champion: "Ahri" };
    const round = publicRoundFromCard(readRun(raw).cards[0], null);
    expect(round.question!.presentation).toEqual({ subject_type: "champion", champion: "Ahri" });
    expect(scenarioSourceFromPublicQuestion(round.question!)).toMatchObject({
      metadata: { subject_type: "champion", champion: "Ahri" },
    });
  });

  it("declares no opponent, no ability layer and no active PvP round", () => {
    const round = publicRoundFromCard(card({ sequence: 1 }), null);
    expect(round.players).toEqual([]);
    expect(round.activeRound).toBeNull();
    expect(round.progressionEnabled).toBe(false);
    expect(round.segmentState).toBeNull();
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
  /**
   * The record moved OUT of a bespoke row of marks and INTO the canonical
   * duelist ledger — the same `RoundHistoryEntry` rows Ranked's column renders.
   * What it has to distinguish is unchanged, and it is the mode's whole shape:
   * under retry-until-correct every card ends solved, so "done" says nothing.
   */
  it("distinguishes first-try from learned in the ledger", () => {
    const run = parseRun(rawRun({
      cards: [
        { sequence: 1, resolved: true, firstAttemptCorrect: true, awardedScore: 100 },
        { sequence: 2, resolved: true, firstAttemptCorrect: false,
          scoreOutcome: "wrong_answer", awardedScore: 0 },
        { sequence: 3, resolved: true, firstAttemptCorrect: false,
          scoreOutcome: "timeout", awardedScore: 0 },
        { sequence: 4 },
      ],
      currentSequence: 4, resolvedCount: 3, score: 100,
    }));
    const rows = roundHistoryFromRun(run);
    expect(rows.map((r) => r.outcome)).toEqual(["correct", "incorrect", "timed_out"]);
    // Only a first-attempt correct card awarded anything, and the running
    // total is the SCORE the meter above the ledger is showing.
    expect(rows.map((r) => r.dealt)).toEqual([100, 0, 0]);
    expect(rows.map((r) => r.hpAfter)).toEqual([100, 100, 100]);
    // A solo run has nothing that damages the player. Nothing is invented to
    // fill a combat field.
    expect(rows.every((r) => r.taken === 0 && r.absorbed === 0)).toBe(true);
  });

  it("numbers each ledger row by its CARD, not by an array position", () => {
    const run = parseRun(rawRun({
      cards: [{ sequence: 6, resolved: true }, { sequence: 7 }],
      currentSequence: 7, resolvedCount: 6,
    }));
    expect(roundHistoryFromRun(run).map((r) => r.roundNumber)).toEqual([6]);
  });

  it("accuracy is null until a card settles", () => {
    const fresh = parseRun(rawRun({ cards: [{ sequence: 1 }], accuracyBp: null }));
    expect(projectPlayer(fresh).accuracyBp).toBeNull();
  });
});

describe("the run strip — the canonical timeline, with a finite plan", () => {
  const structure = (rawToday().challenge as Record<string, unknown>)
    .structure as DcStructureEntry[];

  const runOf = (cardCount: number, current: number) => parseRun(rawRun({
    cards: [{ sequence: current }], cardCount, currentSequence: current,
  }));

  /** Exactly what `dailyArenaView` passes, so these test the real inputs. */
  const stripOf = (run: ReturnType<typeof parseRun>, structureVersion = 1) =>
    projectRoundTimeline({
      roundNumber: run.currentSequence,
      completedRounds: run.resolvedCount,
      segmentRoundNumber: null,
      matchOver: run.status === "completed",
      settlements: [],
      viewerSlot: "p1",
      totalRounds: run.cardCount,
      observedKinds: dailySegmentKinds(structure, structureVersion, run.challengeVersion),
      outcomes: dailyOutcomes(run),
    });

  it.each([11, 12, 15])("draws one node per card for a %i-card day", (cardCount) => {
    const strip = stripOf(runOf(cardCount, 1));
    expect(strip.nodes).toHaveLength(cardCount);
    expect(strip.visibleNodes).toBe(cardCount);
    expect(strip.nodes.map((n) => n.roundNumber)).toEqual(
      Array.from({ length: cardCount }, (_, i) => i + 1));
    // A finite plan is entirely on screen — no off-edge buffer, because there
    // is no edge for a node to travel over.
    expect(strip.nodes.every((n) => n.visible)).toBe(true);
  });

  it("sketches NOTHING past the last card of the plan", () => {
    // Ranked's window would run to `windowStart + 9`, which on a 12-card day
    // played near the end would claim cards 13, 14 and 15 exist.
    const strip = stripOf(runOf(12, 11));
    expect(Math.max(...strip.nodes.map((n) => n.roundNumber))).toBe(12);
  });

  it("marks the current card current and everything past it upcoming", () => {
    const strip = stripOf(runOf(12, 4));
    expect(strip.nodes[3].state).toBe("current");
    expect(strip.currentIndex).toBe(3);
    expect(strip.nodes[4].state).toBe("upcoming");
    expect(strip.nodes[11].state).toBe("upcoming");
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
    expect(stripOf(run).nodes.slice(0, 4).map((n) => n.outcome))
      .toEqual(["correct", "incorrect", "timed-out", null]);
  });

  it("never reads a learned card as a win", () => {
    const learned = readRun(rawRun({
      cards: [{ sequence: 1, resolved: true, firstAttemptCorrect: false,
        scoreOutcome: "wrong_answer" }],
    })).cards[0];
    expect(learned.resolved && cardResultKind(learned)).toBe("incorrect");
  });

  it("marks the Meta Reflex block from the SERVER's frozen plan", () => {
    const strip = stripOf(runOf(12, 1));
    expect(strip.nodes.filter((n) => n.segmentKind === "meta-reflex")
      .map((n) => n.roundNumber)).toEqual([7, 8, 9, 10, 11]);
    expect(strip.nodes[0].segmentKind).toBe("standard");
  });

  it("drops the kinds rather than guessing when the plan version disagrees", () => {
    // A run resumed across a regeneration plays an OLDER version whose shape
    // today's structure does not describe.
    const strip = stripOf(runOf(12, 1), 2);
    expect(strip.nodes).toHaveLength(12);
    expect(strip.nodes.every((n) => n.segmentKind === null)).toBe(true);
  });

  it("never carries a prompt, option or category for an unreached card", () => {
    const strip = stripOf(runOf(12, 1));
    const future = strip.nodes.filter((n) => n.state === "upcoming");
    expect(future.length).toBeGreaterThan(0);
    for (const node of future) {
      expect(node.outcome).toBeNull();
      expect(node.tag).toBeNull();
      // RG2 gave the node a `topic` — the round's published SUBJECT — which is
      // exactly the class of thing this test exists to keep off an unreached
      // card. Null is the only value a card the player has not seen may carry.
      expect(node.topic).toBeNull();
      expect(Object.keys(node).sort()).toEqual(
        ["index", "outcome", "roundNumber", "segmentKind", "state", "tag",
          "topic", "visible"]);
    }
  });
});
