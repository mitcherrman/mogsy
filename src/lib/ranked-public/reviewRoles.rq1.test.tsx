/**
 * RQ1 — post-match review shows FROZEN question roles on question/module
 * content only: the results-screen module timeline detail and the workspace
 * review card. Never on match-level result content.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GameResultsShell } from "@/components/game-results/GameResultsShell";
import { ResultTimeline } from "@/components/game-results/ResultTimeline";
import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import { buildRankedResults, buildRankedTimeline } from "@/pages/quiz-ranked/rankedResultsModel";
import type { CombatantView } from "@/lib/ranked-core/viewTypes";
import type { MatchReviewView, ReviewRound } from "./contracts";
import type { RankedRole } from "./roles";
import { masteryChallengeRolesDiffer, reviewRoundRoles } from "./reviewRoles";

afterEach(cleanup);

function quizRound(n: number, roles?: RankedRole[], category = "Champion Ability Cooldowns"): ReviewRound {
  return {
    roundNumber: n, kind: "quiz", moduleId: "quiz", category, canonicalQuestionRef: null,
    revealed: true, iconHint: { kind: "category", key: category, icon: null },
    topic: { category: "abilities", tier: null, iconHint: null, ...(roles ? { roles } : {}) },
    question: { prompt: `Top lane jungle question ${n}?`, options: ["1", "2"],
      correctOptionIndex: 0, explanation: null },
    challenges: null, masteryChallenges: null,
    viewerSubmission: { answerIndex: 0, isCorrect: true, correctCount: null,
      answeredCount: null, challengeCount: null },
  };
}

function challenge(i: number, roles?: RankedRole[]) {
  return {
    challengeIndex: i, prompt: `Mastery question #${i}`, interactionKind: "atomic_recall",
    questionFamily: "ability_cooldown", answerType: "single_choice" as const,
    answerOptions: ["9", "12"], promptSemantics: null, comparisonSemantics: null,
    correctAnswer: "12" as string | null, explanation: null, viewerAnswer: "12" as string | null,
    isCorrect: true as boolean | null, ...(roles ? { roles } : {}),
  };
}

function masteryRound(n: number, challengeRoles: (RankedRole[] | undefined)[],
                      union?: RankedRole[]): ReviewRound {
  return {
    roundNumber: n, kind: "mastery_slice", moduleId: "mastery_slice", category: null,
    canonicalQuestionRef: null, revealed: true, iconHint: { kind: "generic", key: null, icon: null },
    topic: { category: "general", tier: null, iconHint: null, ...(union ? { roles: union } : {}) },
    question: null, challenges: null,
    masteryChallenges: challengeRoles.map((r, i) => challenge(i, r)),
    viewerSubmission: { answerIndex: null, isCorrect: null, correctCount: 2,
      answeredCount: 2, challengeCount: challengeRoles.length },
  };
}

function metaReflexRound(n: number): ReviewRound {
  return {
    roundNumber: n, kind: "meta_reflex", moduleId: "item_cost_duel", category: null,
    canonicalQuestionRef: null, revealed: true, iconHint: { kind: "meta_reflex", key: null, icon: null },
    topic: { category: "meta-reflex", tier: null, iconHint: null },
    question: null, challenges: [], masteryChallenges: null,
    viewerSubmission: { answerIndex: null, isCorrect: null, correctCount: 3,
      answeredCount: 5, challengeCount: 5 },
  };
}

const review = (rounds: ReviewRound[]): MatchReviewView => ({
  schemaVersion: "ranked_duel.match_review.v1", serverTime: "2026-09-17T00:00:00Z",
  matchId: "m", finalRoundNumber: rounds.length, roundCount: rounds.length, rounds,
});

const emblems = (root: HTMLElement) =>
  within(root).queryAllByTestId("role-emblem").map((e) => e.getAttribute("data-role"));

// ── what a reviewed round may show ────────────────────────────────────────────

describe("reviewRoundRoles (frozen review data only)", () => {
  it("a quiz round shows exactly its frozen topic roles, 1 to 5, in order", () => {
    expect(reviewRoundRoles(quizRound(1, ["adc"]))).toEqual(["adc"]);
    expect(reviewRoundRoles(quizRound(1, ["jungle", "mid"]))).toEqual(["jungle", "mid"]);
    expect(reviewRoundRoles(quizRound(1, ["top", "jungle", "mid", "support"])))
      .toEqual(["top", "jungle", "mid", "support"]);
    expect(reviewRoundRoles(quizRound(1, ["top", "jungle", "mid", "adc", "support"])))
      .toHaveLength(5);
  });

  it("global and old rounds show nothing", () => {
    expect(reviewRoundRoles(quizRound(1))).toBeUndefined();
    expect(reviewRoundRoles({ ...quizRound(1), topic: null })).toBeUndefined();
  });

  it("a Mastery Slice module shows a set only when every challenge shares it", () => {
    expect(reviewRoundRoles(masteryRound(2, [["adc", "support"], ["adc", "support"]],
      ["adc", "support"]))).toEqual(["adc", "support"]);
    // Differing sets: no arbitrary pick and no union on the module row.
    const mixed = masteryRound(2, [["adc"], ["jungle", "mid"]], ["jungle", "mid", "adc"]);
    expect(reviewRoundRoles(mixed)).toBeUndefined();
    expect(masteryChallengeRolesDiffer(mixed)).toBe(true);
  });

  it("with no challenge detail, a Mastery module falls back to the frozen segment union", () => {
    expect(reviewRoundRoles({ ...masteryRound(2, [], ["top", "jungle"]), masteryChallenges: null }))
      .toEqual(["top", "jungle"]);
  });

  it("Meta Reflex freezes no roles and shows none", () => {
    expect(reviewRoundRoles(metaReflexRound(4))).toBeUndefined();
  });
});

// ── the results screen ───────────────────────────────────────────────────────

const PLAYER = { playerId: "a", name: "You", roleId: "jungle", tag: "Jungle", level: 1, xp: 0 } as unknown as CombatantView;
const OPPONENT = { playerId: "b", name: "Bot", roleId: "support", tag: "Support", level: 1, xp: 0 } as unknown as CombatantView;

function results(rounds: ReviewRound[]) {
  return buildRankedResults({
    player: PLAYER, opponent: OPPONENT, result: "victory", finalScores: { a: 9, b: 4 },
    modulesPlayed: rounds.length, isBotMatch: true, ratingDelta: null, ratingAfter: null,
    progressionEnabled: false, review: review(rounds), roundHistory: [], discoveries: null,
    opponentLabel: "Bot",
  });
}

describe("results screen", () => {
  const rounds = [
    quizRound(1, ["top", "jungle", "mid", "adc", "support"]), quizRound(2),
    masteryRound(3, [["adc"], ["jungle", "mid"]], ["jungle", "mid", "adc"]), metaReflexRound(4),
  ];

  it("timeline entries carry roles only where the round honestly has them", () => {
    expect(buildRankedTimeline(review(rounds), []).map((e) => e.roles)).toEqual([
      ["top", "jungle", "mid", "adc", "support"], undefined, undefined, undefined]);
  });

  it("the module detail header draws them left of the subject; others draw none", () => {
    const model = results(rounds);
    render(<GameResultsShell model={model} />);
    // Closed timeline: no question-role emblem anywhere on the result screen,
    // including the hero, scoreline and the contestants (player roles).
    expect(screen.queryAllByTestId("role-emblem")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("timeline-mark-1"));
    const detail = screen.getByTestId("timeline-detail");
    expect(emblems(detail)).toEqual(["top", "jungle", "mid", "adc", "support"]);
    const header = detail.firstElementChild as HTMLElement;
    const cluster = within(header).getByTestId("question-role-emblems");
    // Immediately left of the module's subject label.
    expect((cluster.nextElementSibling as HTMLElement).className).toContain("truncate");
    expect(cluster.nextElementSibling?.textContent).toBe(model.timeline!.entries[0].label);
    expect(screen.getAllByTestId("role-emblem")).toHaveLength(5);   // only in the detail
    for (const n of [2, 3, 4]) {
      fireEvent.click(screen.getByTestId(`timeline-mark-${n}`));
      expect(emblems(screen.getByTestId("timeline-detail"))).toEqual([]);
    }
  });

  it("the label still truncates beside five emblems (no overflow growth)", () => {
    render(<ResultTimeline unitLabel="Modules" entries={[{ index: 1, label: "A very long module subject name indeed",
      outcome: "correct", roles: ["top", "jungle", "mid", "adc", "support"] }]} />);
    fireEvent.click(screen.getByTestId("timeline-mark-1"));
    const header = screen.getByTestId("timeline-detail").firstElementChild as HTMLElement;
    expect(header.className).toContain("flex");
    const label = within(header).getByText(/A very long module/);
    expect(label.className).toContain("truncate");
    expect(label.className).toContain("min-w-0");
  });

  it("a shared non-Ranked consumer with no roles renders exactly as before", () => {
    render(<ResultTimeline unitLabel="Questions"
      entries={[{ index: 1, label: "Item Costs", outcome: "incorrect", detail: "p" }]} />);
    fireEvent.click(screen.getByTestId("timeline-mark-1"));
    expect(screen.queryByTestId("question-role-emblems")).toBeNull();
  });
});

// ── workspace review card ────────────────────────────────────────────────────

describe("workspace review card", () => {
  it("a reviewed question shows its frozen roles in the heading line", () => {
    render(<QuestionReviewCard round={quizRound(1, ["adc", "support"])} position={1} total={3} />);
    expect(emblems(screen.getByTestId("review-question-roles"))).toEqual(["adc", "support"]);
  });

  it("old / global rounds render no role marker", () => {
    render(<QuestionReviewCard round={quizRound(1)} position={1} total={3} />);
    expect(screen.queryByTestId("review-question-roles")).toBeNull();
    expect(screen.queryAllByTestId("role-emblem")).toHaveLength(0);
  });

  it("a Mastery Slice whose challenges agree shows one set in the heading", () => {
    render(<QuestionReviewCard round={masteryRound(2, [["top", "jungle"], ["top", "jungle"]])}
      position={2} total={3} />);
    expect(emblems(screen.getByTestId("review-question-roles"))).toEqual(["top", "jungle"]);
    expect(screen.queryByTestId("review-mastery-roles-0")).toBeNull();
  });

  it("differing challenges show exact per-challenge roles and no module set", () => {
    render(<QuestionReviewCard round={masteryRound(2, [["adc"], ["jungle", "mid"], undefined])}
      position={2} total={3} />);
    expect(screen.queryByTestId("review-question-roles")).toBeNull();
    expect(emblems(screen.getByTestId("review-mastery-roles-0"))).toEqual(["adc"]);
    expect(emblems(screen.getByTestId("review-mastery-roles-1"))).toEqual(["jungle", "mid"]);
    expect(screen.queryByTestId("review-mastery-roles-2")).toBeNull();
  });

  it("Meta Reflex renders unchanged, with no role marker", () => {
    render(<QuestionReviewCard round={metaReflexRound(4)} position={4} total={4} />);
    expect(screen.queryAllByTestId("role-emblem")).toHaveLength(0);
  });
});

// ── authority guards ─────────────────────────────────────────────────────────

describe("authority guards", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/ranked-public/reviewRoles.ts"), "utf8");
  it("review roles never consult the current authority, a player role, prompt or category", () => {
    expect(src).not.toMatch(/champion_roles|championRoles|primaryRole|roleId/);
    expect(src).not.toMatch(/\.prompt\b|\.category\b|iconHint/);
  });
});
