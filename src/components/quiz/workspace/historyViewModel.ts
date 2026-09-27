/**
 * HUB6.3D — typed view models over one History stage, for the timeline, the
 * selected row's quick facts, and (HUB6.3E) the hover/focus analytics and
 * chart ↔ icon cross-highlighting.
 *
 * Everything here READS the parsed DTO. Two things are counted from the
 * record's own question list, and only as the owner's tier rule asks:
 *
 *   * a question's result is the History DTO's `outcome` (correct / incorrect
 *     / timeout) — never the review payload, which cannot say "timeout";
 *   * the CURRENT attempt's longest streak and Survival strikes used are
 *     Free facts (owner tier correction), but HUB6.3B places them inside
 *     Premium analytics. When the server's value is present it is used;
 *     otherwise they are counted with the server's own definition —
 *     consecutive `correct` outcomes in (round, challenge) order within the
 *     stage; a strike is each `incorrect`/`timeout` up to the frozen limit.
 *     A test holds the two equal on every Analytics Lab stage.
 *
 * Nothing else is derived: previous comparisons, records, series, category
 * history and exact-question history are the server's (Premium) or absent.
 */
import type {
  HistoryQuestion,
  HistoryStage,
  PublicCategory,
  QuestionPriorHistory,
  ReviewSource,
  ReplayedBy,
} from "@/lib/history/contracts";

export type QuestionResult = "correct" | "incorrect" | "timeout";

/** One question occurrence — the grain every chart will address. */
export interface QuestionOccurrenceVM {
  /** Stable occurrence id: the DTO's `question_result_id` (else a local
   *  `round:challenge` key for a record that predates it). */
  occurrenceId: string;
  roundNumber: number;
  challengeIndex: number;
  unit: string | null;
  publicCategory: PublicCategory | null;
  /** The authoritative outcome; null for an unknown value. */
  outcome: QuestionResult | null;
  /** This question's public category, within THIS stage. */
  stageCategory: { correct: number; questionsPlayed: number } | null;
  /** Premium: this exact question's earlier staged-Daily history. */
  priorHistory: QuestionPriorHistory | null;
  /** Survival: which strike this question produced, if any — HUB6.3C's Free
   *  per-question marker, else the Premium duplicate. */
  strikeIndex: number | null;
  /** Premium (Review): the source miss this replay re-asked. */
  reviewSource: ReviewSource["source"] | null;
  /** Premium (source stages): the Review replay of this miss. */
  replayedBy: ReplayedBy | null;
}

/** A round — one timeline position: a Splash question, a Meta Reflex block,
 *  a Journey, a replay. */
export interface RoundVM {
  roundNumber: number;
  /** 1-based position in the stage. */
  position: number;
  unit: string | null;
  occurrences: QuestionOccurrenceVM[];
  correct: number;
  incorrect: number;
  timeout: number;
  /** A single question's own result; for a module, `mixed` unless every
   *  child agrees. Never rounded in the reader's favour. */
  verdict: QuestionResult | "mixed" | null;
}

export interface StageViewModel {
  rounds: RoundVM[];
  byOccurrence: ReadonlyMap<string, QuestionOccurrenceVM>;
  /** Occurrence ids per public category key (Free: from the record). */
  categoryMembers: ReadonlyMap<string, string[]>;
}

const RESULTS: readonly string[] = ["correct", "incorrect", "timeout"];
const resultOf = (q: HistoryQuestion): QuestionResult | null =>
  RESULTS.includes(q.outcome) ? (q.outcome as QuestionResult) : null;

export const occurrenceIdOf = (q: HistoryQuestion): string =>
  q.questionResultId ?? `${q.roundNumber ?? "?"}:${q.challengeIndex ?? "?"}`;

/** The stage's own ordered question list, grouped by round. */
function roundsOf(stage: HistoryStage): Array<{ roundNumber: number; questions: HistoryQuestion[] }> {
  if (stage.rounds) return stage.rounds;
  // A record without ordinals: one position per question, in review order.
  return stage.questions.map((q, i) => ({ roundNumber: i + 1, questions: [q] }));
}

export function buildStageViewModel(stage: HistoryStage): StageViewModel {
  const facts = stage.analytics?.personalFacts;
  const history = new Map((facts?.questionHistory ?? []).map((h) => [h.questionResultId, h]));
  const strikes = new Map((facts?.strikes ?? []).map((s) => [s.questionResultId, s.strikeIndex]));
  const sources = new Map((facts?.reviewSources ?? []).map((s) => [s.questionResultId, s.source]));
  const replayed = new Map((facts?.replayedBy ?? []).map((r) => [r.questionResultId, r]));

  // Category tallies within this stage, from the record itself (Free: the
  // public category and the outcome are both Free facts).
  const tally = new Map<string, { correct: number; questionsPlayed: number; ids: string[] }>();
  for (const q of stage.questions) {
    if (!q.publicCategory) continue;
    const t = tally.get(q.publicCategory.key) ?? { correct: 0, questionsPlayed: 0, ids: [] };
    const r = resultOf(q);
    if (r) {
      t.questionsPlayed += 1;
      if (r === "correct") t.correct += 1;
    }
    t.ids.push(occurrenceIdOf(q));
    tally.set(q.publicCategory.key, t);
  }

  const byOccurrence = new Map<string, QuestionOccurrenceVM>();
  const rounds = roundsOf(stage).map((round, i): RoundVM => {
    const occurrences = round.questions.map((q): QuestionOccurrenceVM => {
      const occurrenceId = occurrenceIdOf(q);
      const t = q.publicCategory ? tally.get(q.publicCategory.key) : undefined;
      const vm: QuestionOccurrenceVM = {
        occurrenceId,
        roundNumber: q.roundNumber ?? round.roundNumber,
        challengeIndex: q.challengeIndex ?? 0,
        unit: q.unit,
        publicCategory: q.publicCategory,
        outcome: resultOf(q),
        stageCategory: t ? { correct: t.correct, questionsPlayed: t.questionsPlayed } : null,
        priorHistory: history.get(occurrenceId) ?? null,
        strikeIndex: q.strikeIndex ?? strikes.get(occurrenceId) ?? null,
        reviewSource: sources.get(occurrenceId) ?? null,
        replayedBy: replayed.get(occurrenceId) ?? null,
      };
      byOccurrence.set(occurrenceId, vm);
      return vm;
    });
    const count = (r: QuestionResult) => occurrences.filter((o) => o.outcome === r).length;
    const correct = count("correct");
    const incorrect = count("incorrect");
    const timeout = count("timeout");
    const known = correct + incorrect + timeout;
    const verdict: RoundVM["verdict"] = known === 0 ? null
      : occurrences.length === 1 ? occurrences[0].outcome
        : correct === known ? "correct"
          : incorrect === known ? "incorrect"
            : timeout === known ? "timeout" : "mixed";
    return {
      roundNumber: round.roundNumber, position: i + 1,
      unit: occurrences.find((o) => o.unit)?.unit ?? null,
      occurrences, correct, incorrect, timeout, verdict,
    };
  });
  return {
    rounds,
    byOccurrence,
    categoryMembers: new Map([...tally.entries()].map(([k, t]) => [k, t.ids])),
  };
}

// ─────────────────────────────────────────────────────────── current facts (Free)

export interface StageCurrentFacts {
  correct: number;
  questionsPlayed: number;
  accuracy: number | null;
  incorrect: number;
  timeout: number;
  /** The current attempt's longest run of consecutive correct answers. */
  longestStreak: number | null;
  /** Standard only. */
  score: number | null;
  /** Survival only: depth = questions played before the end. */
  depth: number | null;
  strikesUsed: number | null;
  maxStrikes: number | null;
  /** Raw terminal (`time_bank_exhausted`, `strikes_exhausted`, …). */
  completionReason: string | null;
}

function ordered(stage: HistoryStage): HistoryQuestion[] {
  return roundsOf(stage).flatMap((r) => r.questions);
}

/** Consecutive `correct` outcomes in occurrence order; `incorrect` and
 *  `timeout` reset. Null when the stage has no ordinals to order by. */
export function longestStreakOf(stage: HistoryStage): number | null {
  if (!stage.rounds && stage.questions.some((q) => q.roundNumber === null)) return null;
  let best = 0;
  let run = 0;
  for (const q of ordered(stage)) {
    if (q.outcome === "correct") best = Math.max(best, ++run);
    else run = 0;
  }
  return best;
}

/** The current attempt's factual summary, Free. The server's values are
 *  used where present; the rest are the record's own counts. */
export function stageCurrentFacts(stage: HistoryStage): StageCurrentFacts {
  const current = stage.analytics?.personalFacts.current ?? null;
  const b = stage.basic;
  const survival = stage.kind === "survival";
  const maxStrikes = b.maxStrikes ?? current?.maxStrikes ?? stage.ruleset.maxStrikes;
  const misses = b.questionsPlayed - b.correct;
  return {
    correct: b.correct,
    questionsPlayed: b.questionsPlayed,
    accuracy: b.accuracy,
    incorrect: b.incorrect,
    timeout: b.timeout,
    // HUB6.3C Free basic facts first, then HUB6.3B's Premium `current`, then
    // the record's own count by the server's rule (older payloads).
    longestStreak: b.longestStreak ?? current?.longestStreak ?? longestStreakOf(stage),
    score: stage.kind === "standard" ? b.score : null,
    depth: survival ? b.depth ?? current?.depth ?? b.questionsPlayed : null,
    strikesUsed: survival
      ? b.strikesUsed ?? current?.strikesUsed ?? (maxStrikes !== null ? Math.min(misses, maxStrikes) : null)
      : null,
    maxStrikes: survival ? maxStrikes : null,
    completionReason: current?.completionReason ?? b.completionReason ?? null,
  };
}
