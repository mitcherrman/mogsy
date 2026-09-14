import { describe, expect, it } from "vitest";
import { buildRankedResults, buildRankedTimeline } from "./rankedResultsModel";
import type { CombatantView, RoundHistoryEntry } from "@/lib/ranked-core/viewTypes";
import type { MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";

const combatant = (playerId: string, name: string): CombatantView => ({
  playerId, name, side: playerId === "userA" ? "player" : "opponent",
  classId: "duelist", hp: 0, maxHp: null, xp: 120, level: 3,
  currentLevelThreshold: 100, nextLevelThreshold: 200, score: 24,
  answered: false, abilityChosen: false,
} as unknown as CombatantView);

const round = (
  roundNumber: number, category: string, isCorrect: boolean | null,
): ReviewRound => ({
  roundNumber, kind: "quiz", moduleId: "quiz.v1", category,
  canonicalQuestionRef: null, revealed: true,
  iconHint: { kind: "category", key: category, icon: null },
  topic: null, question: { prompt: `Prompt ${roundNumber}` } as ReviewRound["question"],
  challenges: null, masteryChallenges: null,
  viewerSubmission: {
    answerIndex: 0, isCorrect, correctCount: null, answeredCount: null,
    challengeCount: null,
  },
} as unknown as ReviewRound);

const review = (rounds: ReviewRound[]): MatchReviewView => ({
  schemaVersion: "v1", serverTime: "", matchId: "m1",
  finalRoundNumber: rounds.length, roundCount: rounds.length, rounds,
});

const settled = (
  roundNumber: number, pointsAwarded: number | null,
): RoundHistoryEntry => ({
  roundNumber, outcome: "correct", pointsAwarded,
  dealt: 0, taken: 0, absorbed: 0, hpBefore: 0, hpAfter: 0, timeExpired: false,
});

const base = {
  player: combatant("userA", "You"),
  opponent: combatant("userB", "Rival"),
  result: "victory" as const,
  finalScores: { userA: 24, userB: 19 },
  modulesPlayed: 10,
  subheading: null,
  isBotMatch: false,
  ratingDelta: 18,
  ratingAfter: 1218,
  progressionEnabled: true,
  review: null,
  roundHistory: [] as RoundHistoryEntry[],
  discoveries: null,
  opponentLabel: "Rival",
};

describe("the module timeline merges two sources and invents nothing", () => {
  it("takes the verdict from the review and the award from the settlement log", () => {
    const entries = buildRankedTimeline(
      review([round(1, "runes", true), round(2, "items", false)]),
      [settled(1, 3), settled(2, 0)],
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ index: 1, outcome: "correct", points: 3 });
    expect(entries[1]).toMatchObject({ index: 2, outcome: "incorrect", points: 0 });
  });

  it("renders NO points — never a zero — for a module this client never saw settle", () => {
    // The case a reconnecting player produces. A zero would be the claim that
    // the module awarded nothing, which is a different statement.
    const entries = buildRankedTimeline(
      review([round(1, "runes", true), round(2, "items", true)]),
      [settled(2, 4)],
    );
    expect(entries[0].points).toBeNull();
    expect(entries[1].points).toBe(4);
  });

  it("is empty, not fabricated, when the review read failed", () => {
    expect(buildRankedTimeline(null, [settled(1, 3)])).toEqual([]);
  });

  it("carries the prompt but never an answer", () => {
    const entries = buildRankedTimeline(review([round(1, "runes", false)]), []);
    expect(entries[0].detail).toBe("Prompt 1");
    expect(JSON.stringify(entries[0])).not.toMatch(/correctAnswer|answerIndex/);
  });
});

describe("the Ranked result model", () => {
  it("states an applied rating movement, and derives NO tier from it", () => {
    const model = buildRankedResults(base);
    const rating = model.progress?.find((p) => p.key === "rating");
    expect(rating?.value).toBe("+18 · 1218");
    expect(model.standing).toBe("rated");
    const text = JSON.stringify(model);
    expect(text).not.toMatch(/bronze|silver|gold|diamond|challenger/i);
  });

  it("says Unrated for a bot match, and shows no rating chip", () => {
    const model = buildRankedResults({ ...base, isBotMatch: true, ratingDelta: null });
    expect(model.standing).toBe("unrated");
    expect(model.progress?.find((p) => p.key === "rating")).toBeUndefined();
    expect(model.progress?.find((p) => p.key === "unrated")?.value).toBe("Unrated");
  });

  it("offers no standing at all when the rating simply has not been applied", () => {
    const model = buildRankedResults({ ...base, ratingDelta: null, ratingAfter: null });
    expect(model.standing).toBeNull();
    expect(model.progress?.some((p) => p.key === "rating" || p.key === "unrated"))
      .toBe(false);
  });

  it("reports modules won and the two subjects, from the review", () => {
    const model = buildRankedResults({
      ...base,
      review: review([
        round(1, "runes", true), round(2, "runes", true),
        round(3, "items", false), round(4, "items", false),
      ]),
      roundHistory: [settled(1, 3), settled(2, 3), settled(3, 0), settled(4, 0)],
    });
    expect(model.snapshot?.find((s) => s.key === "modules-won")?.value).toBe("2 / 4");
    expect(model.snapshot?.find((s) => s.key === "accuracy")?.value).toBe("50%");
    expect(model.snapshot?.find((s) => s.key === "strongest")?.value).toBe("Runes");
    expect(model.snapshot?.find((s) => s.key === "weakest")?.value).toBe("Items");
    expect(model.timeline?.unitLabel).toBe("Modules");
    expect(model.timeline?.entries).toHaveLength(4);
  });

  it("agrees with Mogzy's report about the weakest subject, ties included", () => {
    // The defect this locks: two subjects both at 0-for-something is a TIE on
    // accuracy, and the tile and the sentence broke it differently — the tile
    // named the first subject played, the sentence named the one that took
    // more questions off the player. One fold, one answer.
    const model = buildRankedResults({
      ...base,
      review: review([
        round(1, "runes", false), round(2, "runes", false),
        round(3, "items", false), round(4, "items", false), round(5, "items", false),
        round(6, "spells", true), round(7, "spells", true),
      ]),
      roundHistory: [],
    });
    const tile = model.snapshot?.find((s) => s.key === "weakest")?.value;
    expect(tile).toBe("Items");
    expect(model.report?.some((l) => l.includes(`${tile} cost you the most`)))
      .toBe(true);
    const strongest = model.snapshot?.find((s) => s.key === "strongest")?.value;
    expect(model.report?.[0]).toContain(`${strongest} was your strongest area`);
  });

  it("falls back to the result row's module COUNT when the review is missing", () => {
    const model = buildRankedResults(base);
    expect(model.timeline).toBeNull();
    expect(model.snapshot?.find((s) => s.key === "modules-played")?.value).toBe("10");
  });

  it("puts both duelists in the compact identity, emphasising the backend's winner", () => {
    const model = buildRankedResults(base);
    expect(model.contestants?.you.emphasis).toBe(true);
    expect(model.contestants?.opponent?.emphasis).toBe(false);
    expect(model.contestants?.opponent?.name).toBe("Rival");
    const lost = buildRankedResults({ ...base, result: "defeat" });
    expect(lost.contestants?.you.emphasis).toBe(false);
    expect(lost.contestants?.opponent?.emphasis).toBe(true);
  });

  it("shows no level row on a match with no progression layer", () => {
    const model = buildRankedResults({ ...base, progressionEnabled: false });
    expect(model.progress?.some((p) => p.key === "level")).toBe(false);
    expect(model.contestants?.you.level).toBeNull();
  });

  it("makes no speed claim — there is no timing to make one from", () => {
    const model = buildRankedResults({
      ...base,
      review: review([round(1, "runes", true), round(2, "items", false)]),
      roundHistory: [settled(1, 3), settled(2, 0)],
    });
    expect(JSON.stringify(model)).not.toMatch(/seconds|speed|faster|response time/i);
  });
});
