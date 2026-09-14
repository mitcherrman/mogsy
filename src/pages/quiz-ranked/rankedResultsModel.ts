/**
 * RANKED → the shared result model.
 *
 * The whole of Ranked's opinion about its own end screen, in one pure
 * function. Nothing here fetches, and nothing here decides a winner: the
 * outcome, the final scores and the per-module verdicts are all read from
 * authorities the controller already holds, and this only chooses how to say
 * them.
 *
 * THE TWO SOURCES, AND WHY IT TAKES BOTH
 * ──────────────────────────────────────
 * * The **match review** (`MatchReviewView`) is the authority on WHAT each
 *   module was and how it went. It is complete for every round of the match
 *   whatever this client saw, which is exactly what a player who reconnected
 *   needs.
 * * The **settlement log** (`RoundHistoryEntry[]`) is the only source of what
 *   a module AWARDED. The review endpoint carries no points, so the award is
 *   merged in by round number from the log this client accumulated.
 *
 * A round present in the review and absent from the log therefore renders its
 * verdict with NO points chip. Not a zero — a zero is the claim that the
 * module awarded nothing, and "this client never saw that settlement" is a
 * different statement. Closing that gap properly is a backend change (points
 * on the review payload) and is deliberately not faked here.
 *
 * WHAT IT REFUSES TO PUT ON SCREEN
 * ────────────────────────────────
 * * **A tier movement.** The client holds no rating→tier thresholds — the
 *   backend owns them — so the rating DELTA and the rating AFTER are shown and
 *   no tier is derived from either.
 * * **A speed figure.** Nothing in the result, the review or the settlement
 *   log carries per-answer timing.
 * * **XP gained this match.** Only per-round XP exists, in the same
 *   client-accumulated log that can legitimately have gaps, so a sum of it
 *   would under-report for exactly the player who reconnected. The level and
 *   XP the account reached are shown instead, which are authoritative.
 */
import { categoryLabel, type CategoryKey } from "@/lib/quiz/publicCategory";
import { prettyCategory, questionOutcome } from "@/components/quiz/workspace/questionIcons";
import {
  buildMatchReport, bucketTimeline, strongestBucket, weakestBucket,
} from "@/components/game-results/matchReport";
import type {
  GameResultsModel, ResultProgressItem, ResultStat, ResultTimelineEntry,
} from "@/components/game-results/model";
import type { CombatantView, RoundHistoryEntry } from "@/lib/ranked-core/viewTypes";
import type {
  MatchDiscoveriesView, MatchReviewView, ReviewRound,
} from "@/lib/ranked-public/contracts";

/**
 * What this module was ABOUT, as a subject a player would recognise.
 *
 * A subject, deliberately, and never the entity the question happened to name:
 * the report groups by this string, and "Ahri" and "Zed" are not two areas of
 * knowledge to be strong or weak in — "Champion Abilities" is.
 */
export function moduleSubject(round: ReviewRound): string {
  if (round.kind === "meta_reflex") return "Meta Reflex";
  if (round.kind === "mastery_slice") return "Mastery";
  if (round.topic?.category) return categoryLabel(round.topic.category as CategoryKey);
  if (round.category) return prettyCategory(round.category);
  return "Question";
}

export interface RankedResultsInput {
  player: CombatantView;
  opponent: CombatantView;
  /** The backend's word, already decided by the controller. */
  result: "victory" | "defeat" | "draw";
  finalScores: Record<string, number> | null;
  modulesPlayed: number | null;
  /** Why the match ended, when it was not ordinary combat. */
  subheading?: string | null;
  isBotMatch: boolean;
  /** The viewer's applied movement, or null for unrated/pending/unknown. */
  ratingDelta: number | null;
  ratingAfter: number | null;
  progressionEnabled: boolean;
  /** One read of the review endpoint, or null (loading, refused, failed). */
  review: MatchReviewView | null;
  /** This client's own settlement log for the viewer. */
  roundHistory: readonly RoundHistoryEntry[];
  discoveries: MatchDiscoveriesView | null;
  opponentLabel: string;
}

export function buildRankedTimeline(
  review: MatchReviewView | null,
  roundHistory: readonly RoundHistoryEntry[],
): ResultTimelineEntry[] {
  if (!review) return [];
  const points = new Map<number, number>();
  for (const entry of roundHistory) {
    if (typeof entry.pointsAwarded === "number") {
      points.set(entry.roundNumber, entry.pointsAwarded);
    }
  }
  return review.rounds.map((round, i) => ({
    index: round.roundNumber ?? i + 1,
    label: moduleSubject(round),
    outcome: questionOutcome(round),
    points: points.get(round.roundNumber) ?? null,
    // Answer-safe: the prompt only. The answer lives in the Record, where it
    // is legitimately the player's to read, and the shared bank means it must
    // not be printed beside a question that can be asked again.
    detail: round.question?.prompt ?? null,
    detailHint: round.category ? prettyCategory(round.category) : null,
  }));
}

export function buildRankedResults(input: RankedResultsInput): GameResultsModel {
  const {
    player, opponent, result, finalScores, modulesPlayed, subheading, isBotMatch,
    ratingDelta, ratingAfter, progressionEnabled, review, roundHistory,
    discoveries, opponentLabel,
  } = input;

  const you = finalScores?.[player.playerId] ?? null;
  const them = finalScores?.[opponent.playerId] ?? null;
  const timeline = buildRankedTimeline(review, roundHistory);

  const snapshot: ResultStat[] = [];
  if (timeline.length > 0) {
    const won = timeline.filter((e) => e.outcome === "correct").length;
    snapshot.push({
      key: "modules-won",
      label: "Modules won",
      value: `${won} / ${timeline.length}`,
      tone: won * 2 >= timeline.length ? "good" : "bad",
    });
    snapshot.push({
      key: "accuracy",
      label: "Accuracy",
      value: `${Math.round((won / timeline.length) * 100)}%`,
    });
    // Strongest / weakest come from the SAME fold the report uses, so the two
    // sections can never disagree about which subject went best.
    const buckets = bucketTimeline(timeline);
    const best = strongestBucket(buckets);
    const worst = weakestBucket(buckets);
    if (best && worst && best.label !== worst.label) {
      snapshot.push({
        key: "strongest", label: "Strongest", value: best.label,
        hint: `${best.correct}/${best.total}`, tone: "good",
      });
      snapshot.push({
        key: "weakest", label: "Needs work", value: worst.label,
        hint: `${worst.correct}/${worst.total}`, tone: "bad",
      });
    }
  } else if (modulesPlayed !== null) {
    // No review: the module COUNT is still a fact the result row stated.
    snapshot.push({
      key: "modules-played", label: "Modules", value: String(modulesPlayed),
      hint: "complete",
    });
  }

  const progress: ResultProgressItem[] = [];
  if (isBotMatch) {
    // The one thing a bot match says differently. Never a "+0 Rating" chip —
    // that looks like a result, and the ladder did not move.
    progress.push({
      key: "unrated", label: "Rating", value: "Unrated", icon: "unrated",
      hint: "Bot matches do not move the ladder.",
    });
  } else if (ratingDelta !== null) {
    progress.push({
      key: "rating",
      label: "Ranked rating",
      value: `${ratingDelta > 0 ? "+" : ""}${ratingDelta}${
        ratingAfter !== null ? ` · ${ratingAfter}` : ""}`,
      delta: ratingDelta,
      icon: "rating",
    });
  }
  if (progressionEnabled) {
    progress.push({
      key: "level",
      label: "Level",
      value: `Lv ${player.level} · ${player.xp.toLocaleString()} XP`,
      icon: "xp",
    });
  }
  if (discoveries && discoveries.newCount > 0) {
    progress.push({
      key: "discoveries",
      label: "New questions discovered",
      value: `+${discoveries.newCount}`,
      delta: discoveries.newCount,
      icon: "collection",
      hint: `${discoveries.collectionTotal} in your collection`,
    });
  }

  return {
    state: result,
    mode: "Ranked Duel",
    standing: isBotMatch ? "unrated" : ratingDelta !== null ? "rated" : null,
    subheading: subheading ?? null,
    score: finalScores ? { you: you ?? 0, opponent: them } : null,
    contestants: {
      you: {
        name: player.name, score: you, roleId: player.roleId,
        tag: player.tag, level: progressionEnabled ? player.level : null,
        emphasis: result === "victory" || result === "draw",
      },
      opponent: {
        name: opponentLabel, score: them, roleId: opponent.roleId,
        tag: opponent.tag, level: progressionEnabled ? opponent.level : null,
        emphasis: result === "defeat" || result === "draw",
      },
    },
    snapshot,
    progress,
    report: buildMatchReport({
      entries: timeline,
      // Ranked's settlement log knows which rounds ended on the clock, and it
      // is the only source for it — a round the log is missing is simply not
      // counted rather than assumed to have been answered in time.
      timeoutCount: roundHistory.length > 0
        ? roundHistory.filter((r) => r.timeExpired).length : null,
      discoveredCount: discoveries?.newCount ?? null,
    }),
    timeline: timeline.length > 0 ? { unitLabel: "Modules", entries: timeline } : null,
  };
}
