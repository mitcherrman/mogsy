/**
 * HUB5 — TEST-ONLY builder: raw Daily facts → HUB1-shaped persistence rows
 * and frozen child-match reviews.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * ────────────────────────────────
 * Timmy has no backend, so something has to turn "Timmy played these
 * questions and got these right" into the records a real run leaves behind.
 * This module does that and nothing more. Its output is the four tables the
 * HUB2.1 projection reads (`daily_runs`, `daily_run_stages`,
 * `ranked_segment_child_results`, `daily_run_review_items`) plus the
 * `MatchReviewView` each child match freezes.
 *
 * It computes NO analytics. Averages, deltas, trends, personal bests, learning
 * signals, Review recovery and every capability state come from HUB2.1's own
 * route, run offline over these rows by `scripts/hub5-generate-timmy-history.py`
 * and frozen as `timmyHistory.golden.json`. The preview serves that golden
 * through the production parser. So there is one analytics implementation —
 * the backend's — and this file cannot drift from it.
 *
 * The only figures derived here are the ones a record states about itself
 * (a stage's C/A is its questions' outcomes); the tests compare them with
 * what HUB2 projected from the same rows.
 *
 * FACTS ARE AUTHORED ONCE
 * ───────────────────────
 * A fact author states what happened — which question was asked at which
 * (round, challenge), and whether it was answered correctly — and never a
 * total. A Review item states only its source miss and how the replay went;
 * the Review stage's questions are derived from those allocations, in
 * ordinal order, exactly as HUB1 links them. Anything that would let two
 * copies of one fact disagree is rejected (`FixtureFactError`).
 *
 * HUB6.3D — PRODUCTION SHAPE (opt-in, `DailyAccountFacts.production`)
 * ───────────────────────────────────────────────────────────────────
 * HUB6.3B's projection reads more of what the production writers persist: the
 * serving module of every child result, each round's frozen recipe tag
 * (`ranked_rounds.segment_config_json.analytics_tag`), the stage's status and
 * context, and the frozen recipe `format` + raw `completion_reason`. An
 * account marked `production` also emits those (the Analytics Lab), shaped
 * as production writes them:
 *
 *   Standard   `daily_standard_v1`: Splash ×4, Meta Reflex, Splash ×3, Meta
 *              Reflex, a five-child Journey (children after pool exhaustion
 *              have no row)
 *   Time Trial `daily_time_trial_v1`: Splash only; a question may time out on
 *              its own clock, and the bank's cut-off question is a timeout
 *   Survival   `daily_survival_v1`: Splash, with a three-child Journey at
 *              slot 6; a timeout is a miss and a strike
 *
 * Every other account (Timmy, First Daily, Newcomer, Full-length) emits
 * exactly the rows it always did, so their HUB2.3 goldens stay byte-identical.
 *
 * Imported only by the Timmy preview's tests and the row-export script —
 * never by a production module (asserted in `hub5Isolation.test.ts`).
 */
import type { DailyStageKind as WireDailyStageKind } from "@/lib/daily-challenge/run/contracts";

/** These fixtures model the PRODUCTION backend's recorded Dailies, which have no Order Forge yet (DV2-P0). */
type DailyStageKind = Exclude<WireDailyStageKind, "order_forge">;
import type { MatchReviewView, ReviewRound } from "@/lib/ranked-public/contracts";
import { FIXTURE_ANCHOR, fixtureDate } from "./fixtureClock";
import { identityOf, masteryContentOf, quizContentOf, reflexContentOf, refNamespace } from "./questionIdentity";

export class FixtureFactError extends Error {
  constructor(message: string) {
    super(`Timmy Daily fact: ${message}`);
    this.name = "FixtureFactError";
  }
}
const reject = (m: string): never => {
  throw new FixtureFactError(m);
};

// ─────────────────────────────────────────────────────────────── the facts

export type Outcome = "correct" | "incorrect" | "timeout";

/** One question asked at one (round, challenge) of a stage's child match. */
export interface OccurrenceFact {
  round: number;
  challenge: number;
  ref: string;
  /** Which generated instance of a `mastery:` concept was asked. */
  variant?: number;
  outcome: Outcome;
}

export interface RulesetFact {
  id: string;
  version: number;
  timeBankMs: number | null;
  maxStrikes: number | null;
}

export interface StageFact {
  kind: DailyStageKind;
  /** Null: a record frozen before the ruleset was persisted (legacy). */
  ruleset: RulesetFact | null;
  contentSetId: string | null;
  /** The frozen settlement score. Module-grain, never derived from C/A. */
  score: number;
  endedBy: "completed" | "time_bank_exhausted" | "strikes_exhausted";
  /** Authored for every stage except Review, whose questions are derived
   *  from the run's allocations. Any order: display order is the ordinals'. */
  occurrences?: OccurrenceFact[];
}

/** One frozen Review allocation (ordinal = its index + 1). */
export interface ReviewAllocationFact {
  source: { stage: number; round: number; challenge: number };
  /** How the replay went; null when the allocation was never served. */
  outcome: Outcome | null;
}

export interface RunFact {
  number: number;
  completedAt: string;
  planVersion: number;
  stages: StageFact[];
  review: ReviewAllocationFact[];
}

export interface DailyAccountFacts {
  userId: string;
  /** Prefix for every opaque id this account's rows carry. */
  idPrefix: string;
  runs: RunFact[];
  /** HUB6.3D — emit the production-writer columns and tables HUB6.3B reads,
   *  and accept production timing (per-question timeouts, Journey rounds). */
  production?: boolean;
}

// ─────────────────────────────────────────────────────────────── the rows

export interface DailyRunRowFact {
  run_id: string; user_id: string; policy: string; plan_date: string;
  plan_version: number; status: string; stage_count: number; completed_at: string;
}
export interface DailyStageRowFact {
  run_id: string; stage_index: number; stage_kind: string; ruleset_id: string;
  content_set_id: string | null; child_match_id: string; result_json: string;
  /** Production accounts only. */
  status?: string; context_json?: string;
}
/** Production accounts only: a round's frozen segment config (its tag). */
export interface RankedRoundRowFact {
  match_id: string; round_number: number; segment_config_json: string;
}
export interface ChildResultRowFact {
  match_id: string; user_id: string; question_result_id: string;
  round_number: number; challenge_index: number; outcome: Outcome;
  canonical_question_ref: string; exact_question_key: string | null;
  family: string; concept: string; category: string;
  subject_kind: string | null; subject_key: string | null; subject_label: string | null;
  generator_version: string | null; source_version: string; source_artifact_id: string | null;
  /** Production accounts only: the serving module. */
  module_id?: string; module_version?: number;
}
export interface ReviewItemRowFact {
  run_id: string; ordinal: number; question_ref: string; source_stage_index: number;
  source_match_id: string; family: string; source_question_result_id: string;
  review_match_id: string | null; review_question_result_id: string | null;
  review_outcome: Outcome | null;
}

export interface PersistenceRows {
  daily_runs: DailyRunRowFact[];
  daily_run_stages: DailyStageRowFact[];
  ranked_segment_child_results: ChildResultRowFact[];
  daily_run_review_items: ReviewItemRowFact[];
  /** Production accounts only. */
  ranked_rounds?: RankedRoundRowFact[];
}

/** One played occurrence, as the other fixture surfaces need it. */
export interface BuiltOccurrence {
  runId: string;
  completedAt: string;
  stageIndex: number;
  stageKind: DailyStageKind;
  matchId: string;
  questionResultId: string;
  round: number;
  challenge: number;
  ref: string;
  variant: number | null;
  outcome: Outcome;
}

export interface BuiltDailyAccount {
  rows: PersistenceRows;
  /** Frozen review per child match id — the stage timelines' source. */
  reviews: Record<string, MatchReviewView>;
  /** Every occurrence, runs oldest first, each stage in display order. */
  occurrences: BuiltOccurrence[];
}

// ─────────────────────────────────────────────────────────────── building

const PRE_REVIEW: readonly DailyStageKind[] = ["standard", "time_trial", "survival", "weak_areas"];
/** `daily_challenge/recipe.py::META_REFLEX_CARDS`. */
const META_REFLEX_CARDS = 5;
/** The production Journey: five children in Standard, three in Survival;
 *  children after the pooled clock runs out have no row. */
const JOURNEY_MAX_CHILDREN = 5;

/** The frozen recipe format each production stage kind is built from. */
const PRODUCTION_FORMAT: Record<DailyStageKind, string> = {
  standard: "daily_standard_v1",
  time_trial: "daily_time_trial_v1",
  survival: "daily_survival_v1",
  weak_areas: "content_weak_areas",
  review: "daily_review",
};

/** The raw child terminal the Daily service freezes as `completion_reason`. */
const COMPLETION_REASON: Record<StageFact["endedBy"], string> = {
  completed: "segments_complete",
  time_bank_exhausted: "time_bank_exhausted",
  strikes_exhausted: "strikes_exhausted",
};

/** The serving module a production child result names, by ref namespace. */
function productionModule(ref: string): { module_id: string; module_version: number } {
  switch (refNamespace(ref)) {
    case "reflex":
      return { module_id: "item_cost_duel", module_version: 5 };
    case "mastery":
      return { module_id: "mastery_slice", module_version: 2 };
    default:
      return { module_id: "quiz", module_version: 2 };
  }
}

/** A production round's frozen recipe tag (`SegmentSpec.analytics_tag`). */
function productionTag(kind: DailyStageKind, round: number, firstRef: string, slot: number): string {
  if (kind === "review") return `daily_review:${round}`;
  const family = identityOf(firstRef).family;
  if (kind === "weak_areas") return `weak_areas:${family}:${slot}`;
  const fmt = PRODUCTION_FORMAT[kind];
  switch (refNamespace(firstRef)) {
    case "reflex":
      return `${fmt}:${round}:meta_reflex`;
    case "mastery":
      return `${fmt}:${round}:journey_slice`;
    default:
      return `${fmt}:${round}:${family}`;
  }
}
const pad = (n: number) => String(n).padStart(2, "0");
const isMiss = (o: Outcome) => o !== "correct";

function byOrdinals(a: { round: number; challenge: number }, b: { round: number; challenge: number }) {
  return a.round - b.round || a.challenge - b.challenge;
}

/** The staged Daily plan's shape (`daily_challenge/run/plan.py`): the four
 *  pre-Review modes shuffled once per day, Weak Areas' slot closed up when
 *  the run is not eligible, Review always last. */
function checkComposition(run: RunFact) {
  const kinds = run.stages.map((s) => s.kind);
  const last = kinds[kinds.length - 1];
  if (last !== "review") reject(`run ${run.number}: Review must be the last stage`);
  const pre = kinds.slice(0, -1);
  if (new Set(pre).size !== pre.length || pre.some((k) => !PRE_REVIEW.includes(k))) {
    reject(`run ${run.number}: pre-Review stages must be distinct modes`);
  }
  const eligible = pre.includes("weak_areas");
  const expected = eligible ? 4 : 3;
  if (pre.length !== expected) reject(`run ${run.number}: ${kinds.length} stages is not a Daily shape`);
}

/** Round/challenge structure a Ranked child match can actually have. */
function checkOccurrences(run: RunFact, index: number, stage: StageFact, occ: OccurrenceFact[], production = false) {
  const where = `run ${run.number} stage ${index} (${stage.kind})`;
  const seen = new Set<string>();
  for (const o of occ) {
    const key = `${o.round}:${o.challenge}`;
    if (seen.has(key)) reject(`${where}: two questions at round ${o.round} challenge ${o.challenge}`);
    seen.add(key);
    if (!Number.isInteger(o.round) || o.round < 1) reject(`${where}: round_number is one-based`);
    if (!Number.isInteger(o.challenge) || o.challenge < 0) reject(`${where}: challenge_index is zero-based`);
    identityOf(o.ref); // an unknown ref is a typo, not a new identity
    if (refNamespace(o.ref) === "mastery") masteryContentOf(o.ref, o.variant ?? 0);
    else if (o.variant !== undefined) reject(`${where}: only a mastery concept has generated variants`);
  }
  const ordered = occ.slice().sort(byOrdinals);
  const rounds = new Map<number, OccurrenceFact[]>();
  for (const o of ordered) rounds.set(o.round, [...(rounds.get(o.round) ?? []), o]);
  const numbers = [...rounds.keys()];
  numbers.forEach((n, i) => n !== i + 1 && reject(`${where}: rounds must be numbered 1..n without gaps`));
  for (const [n, qs] of rounds) {
    qs.forEach((q, i) => q.challenge !== i && reject(`${where}: round ${n} challenges must be 0..k without gaps`));
    const slice = qs.every((q) => refNamespace(q.ref) === "mastery")
      && (!production || qs.length <= JOURNEY_MAX_CHILDREN);
    // HUB6.2 — a Meta Reflex block: the recipe's five item-cost cards.
    const reflex = qs.length === META_REFLEX_CARDS && qs.every((q) => refNamespace(q.ref) === "reflex");
    const single = qs.length === 1 && refNamespace(qs[0].ref) !== "mastery" && refNamespace(qs[0].ref) !== "reflex";
    if (!slice && !single && !reflex) {
      reject(`${where}: round ${n} must be one single-answer question, one Mastery slice or one ${META_REFLEX_CARDS}-card Meta Reflex block`);
    }
  }
  // Ruleset terminal paths, as the child match settles them.
  const misses = ordered.filter((o) => isMiss(o.outcome)).length;
  const timeouts = ordered.filter((o) => o.outcome === "timeout");
  const lastOutcome = ordered[ordered.length - 1]?.outcome;
  if (production) {
    // Production clocks: every Splash question, Meta Reflex card and Journey
    // child has its own deadline, so a timeout can happen in any performance
    // stage; the bank's cut-off question is always the LAST Time Trial row.
    if (stage.kind === "time_trial" && stage.endedBy === "time_bank_exhausted" && lastOutcome !== "timeout") {
      reject(`${where}: an exhausted bank ends on its timed-out cut-off question`);
    }
    if (stage.kind === "review" && timeouts.length) reject(`${where}: Review replays are not timed out here`);
  } else if (stage.kind === "time_trial") {
    if (stage.endedBy === "time_bank_exhausted") {
      if (lastOutcome !== "timeout" || timeouts.length !== 1) {
        reject(`${where}: an exhausted bank ends on exactly one timed-out question`);
      }
    } else if (timeouts.length) reject(`${where}: a completed Time Trial has no timed-out question`);
  } else if (timeouts.length) {
    reject(`${where}: only a Time Trial bank times a question out`);
  }
  if (stage.kind === "survival") {
    const limit = stage.ruleset?.maxStrikes ?? 3;
    if (stage.endedBy === "strikes_exhausted") {
      if (misses !== limit || !isMiss(lastOutcome!)) {
        reject(`${where}: Survival ends on its ${limit}th miss, not ${misses}`);
      }
    } else if (misses >= limit) reject(`${where}: ${misses} misses would have ended Survival`);
  }
  if (stage.kind !== "time_trial" && stage.endedBy === "time_bank_exhausted") reject(`${where}: no time bank`);
  if (stage.kind !== "survival" && stage.endedBy === "strikes_exhausted") reject(`${where}: no strike limit`);
}

function reviewRound(roundNumber: number, qs: Array<{ ref: string; variant: number | null; outcome: Outcome }>): ReviewRound {
  if (refNamespace(qs[0].ref) === "reflex") {
    // A Meta Reflex block: one recognition card per challenge, answered by a
    // side. A miss picked the other side; a time-out picked nothing.
    const challenges = qs.map((q, challengeIndex) => {
      const c = reflexContentOf(q.ref);
      const other = c.correctSide === "left" ? "right" : "left";
      const viewerSide = q.outcome === "correct" ? c.correctSide : q.outcome === "incorrect" ? other : null;
      return {
        challengeIndex, prompt: c.prompt, kind: "magnitude", entityKind: "item",
        left: c.left, right: c.right, correctSide: c.correctSide, viewerSide,
        isCorrect: viewerSide === null ? null : viewerSide === c.correctSide,
      };
    });
    return {
      roundNumber, kind: "meta_reflex", moduleId: "item_cost_duel", category: "Item Costs",
      canonicalQuestionRef: null, revealed: true,
      iconHint: { kind: "meta_reflex", key: null, icon: null }, topic: null,
      question: null, challenges, masteryChallenges: null,
      viewerSubmission: {
        answerIndex: null, isCorrect: null,
        correctCount: challenges.filter((c) => c.isCorrect === true).length,
        answeredCount: challenges.filter((c) => c.viewerSide !== null).length,
        challengeCount: challenges.length,
      },
    };
  }
  if (refNamespace(qs[0].ref) !== "mastery") {
    const q = qs[0];
    const content = quizContentOf(q.ref);
    // The chosen answer is the only thing a played round records; a miss is
    // the first wrong option and a time-out picked nothing.
    const answer = q.outcome === "correct" ? content.correctIndex
      : q.outcome === "incorrect" ? (content.correctIndex + 1) % content.options.length
        : null;
    return {
      roundNumber, kind: "quiz", moduleId: "quiz", category: identityOf(q.ref).category,
      canonicalQuestionRef: q.ref, revealed: true, iconHint: content.iconHint, topic: content.topic,
      question: {
        prompt: content.prompt, options: content.options,
        correctOptionIndex: content.correctIndex, explanation: content.explanation,
      },
      challenges: null, masteryChallenges: null,
      viewerSubmission: {
        answerIndex: answer, isCorrect: answer === null ? null : answer === content.correctIndex,
        correctCount: null, answeredCount: null, challengeCount: null,
      },
    };
  }
  const challenges = qs.map((q, challengeIndex) => {
    const c = masteryContentOf(q.ref, q.variant ?? 0);
    const wrong = c.options.find((o) => o !== c.correctAnswer)!;
    const viewerAnswer = q.outcome === "correct" ? c.correctAnswer : q.outcome === "incorrect" ? wrong : null;
    return {
      challengeIndex, prompt: c.prompt, interactionKind: "legacy_combat", questionFamily: c.questionFamily,
      answerType: "single_choice" as const, answerOptions: c.options,
      promptSemantics: null, comparisonSemantics: null,
      correctAnswer: c.correctAnswer, explanation: c.explanation,
      viewerAnswer, isCorrect: viewerAnswer === null ? null : viewerAnswer === c.correctAnswer,
    };
  });
  return {
    roundNumber, kind: "mastery_slice", moduleId: "mastery_slice", category: null,
    canonicalQuestionRef: null, revealed: true,
    iconHint: { kind: "generic", key: null, icon: null }, topic: null,
    question: null, challenges: null, masteryChallenges: challenges,
    viewerSubmission: {
      answerIndex: null, isCorrect: null,
      correctCount: challenges.filter((c) => c.isCorrect === true).length,
      answeredCount: challenges.filter((c) => c.viewerAnswer !== null).length,
      challengeCount: challenges.length,
    },
  };
}

export function buildDailyAccount(account: DailyAccountFacts): BuiltDailyAccount {
  const rows: PersistenceRows = {
    daily_runs: [], daily_run_stages: [], ranked_segment_child_results: [], daily_run_review_items: [],
  };
  const reviews: Record<string, MatchReviewView> = {};
  const occurrences: BuiltOccurrence[] = [];
  const P = account.idPrefix;
  const production = account.production === true;
  if (production) rows.ranked_rounds = [];

  let previous: RunFact | null = null;
  for (const run of account.runs) {
    if (previous && (run.number <= previous.number || run.completedAt <= previous.completedAt)) {
      reject(`run ${run.number} must follow run ${previous.number} in time and number`);
    }
    if (run.completedAt > FIXTURE_ANCHOR) reject(`run ${run.number} completes after the fixture anchor`);
    checkComposition(run);
    previous = run;

    const runId = `${P}-run-${pad(run.number)}`;
    const matchId = (i: number) => `${P}-daily-${pad(run.number)}-s${i}`;
    const resultId = (i: number, r: number, c: number) => `${P}-qr-${pad(run.number)}-${i}-${r}-${c}`;
    rows.daily_runs.push({
      run_id: runId, user_id: account.userId, policy: "official",
      plan_date: fixtureDate(run.completedAt), plan_version: run.planVersion,
      status: "completed", stage_count: run.stages.length, completed_at: run.completedAt,
    });

    // Resolve the Review stage's questions from its allocations first: they
    // are derived, never authored.
    const reviewIndex = run.stages.length - 1;
    const allocations = run.review.map((a, i) => {
      const src = run.stages[a.source.stage];
      if (!src || a.source.stage >= reviewIndex) reject(`run ${run.number}: Review item ${i + 1} has no earlier source stage`);
      const miss = src.occurrences?.find((o) => o.round === a.source.round && o.challenge === a.source.challenge);
      if (!miss) reject(`run ${run.number}: Review item ${i + 1} points at no question`);
      // Only a WRONG answer is a miss the ledger records. A timed-out
      // question is not allocated here — an unallocated miss is simply not
      // part of Review, never a Review failure.
      if (miss!.outcome !== "incorrect") reject(`run ${run.number}: Review item ${i + 1} replays a question that was not missed`);
      return { ...a, ordinal: i + 1, miss: miss! };
    });
    const keys = allocations.map((a) => `${a.source.stage}:${a.source.round}:${a.source.challenge}`);
    if (new Set(keys).size !== keys.length) reject(`run ${run.number}: one miss allocated to Review twice`);
    const firstUnserved = allocations.findIndex((a) => a.outcome === null);
    if (firstUnserved !== -1 && allocations.slice(firstUnserved).some((a) => a.outcome !== null)) {
      reject(`run ${run.number}: Review serves allocations in ordinal order, so unserved ones trail`);
    }
    const served = allocations.filter((a) => a.outcome !== null);
    if (served.some((a) => a.outcome === "timeout")) reject(`run ${run.number}: Review has no time bank`);
    const reviewOccurrences: OccurrenceFact[] = served.map((a, k) => ({
      round: k + 1, challenge: 0, ref: a.miss.ref, variant: a.miss.variant, outcome: a.outcome!,
    }));

    run.stages.forEach((stage, index) => {
      const authored = stage.kind === "review" ? null : stage.occurrences;
      if (stage.kind === "review" && stage.occurrences) reject(`run ${run.number}: Review questions are derived from its allocations`);
      if (stage.kind !== "review" && !authored) reject(`run ${run.number} stage ${index}: no questions authored`);
      const occ = authored ?? reviewOccurrences;
      checkOccurrences(run, index, stage, occ, production);
      if (stage.kind === "weak_areas") {
        // Weak Areas draws only on evidence frozen before the run: every
        // selection must have been missed in an earlier completed run.
        for (const o of occ) {
          const earlierMiss = occurrences.some((x) => x.runId !== runId && x.ref === o.ref && isMiss(x.outcome));
          if (!earlierMiss) reject(`run ${run.number}: Weak Areas selected ${o.ref} with no earlier miss`);
        }
      }

      const mid = matchId(index);
      const ruleset = stage.ruleset;
      const result: Record<string, unknown> = {
        score: stage.score, ended_by: stage.endedBy, format: { id: "daily", version: 3 },
      };
      if (ruleset) {
        result.ruleset = {
          ruleset_id: ruleset.id, version: ruleset.version,
          time_bank_ms: ruleset.timeBankMs, max_strikes: ruleset.maxStrikes,
        };
      }
      if (production) {
        // What the production Daily service freezes: the raw terminal and the
        // recipe format the child was built from.
        result.completion_reason = COMPLETION_REASON[stage.endedBy];
        result.format = { id: PRODUCTION_FORMAT[stage.kind], version: 1 };
      }
      const stageRow: DailyStageRowFact = {
        run_id: runId, stage_index: index, stage_kind: stage.kind,
        ruleset_id: ruleset?.id ?? (stage.kind === "weak_areas" || stage.kind === "review" ? "standard" : stage.kind),
        content_set_id: stage.contentSetId, child_match_id: mid, result_json: JSON.stringify(result),
      };
      if (production) {
        stageRow.status = "completed";
        stageRow.context_json = JSON.stringify(stage.kind === "weak_areas"
          ? {
            // Evidence frozen at launch: misses before the start of this
            // run's plan day, under the Weak Areas selection policy.
            evidence_cutoff: `${fixtureDate(run.completedAt)}T00:00:00+00:00`,
            weak_areas_policy_version: "weak-areas-v2",
          }
          : {});
      }
      rows.daily_run_stages.push(stageRow);
      if (production) {
        const firstOfRound = new Map<number, OccurrenceFact>();
        for (const o of occ.slice().sort(byOrdinals)) if (!firstOfRound.has(o.round)) firstOfRound.set(o.round, o);
        [...firstOfRound.entries()].forEach(([round, o], slot) => {
          rows.ranked_rounds!.push({
            match_id: mid, round_number: round,
            segment_config_json: JSON.stringify({ analytics_tag: productionTag(stage.kind, round, o.ref, slot + 1) }),
          });
        });
      }

      // Child results in the AUTHORED order — deliberately not display
      // order where a fact lists them out of order; HUB2 orders by ordinals.
      for (const o of occ) {
        const id = identityOf(o.ref);
        rows.ranked_segment_child_results.push({
          match_id: mid, user_id: account.userId, question_result_id: resultId(index, o.round, o.challenge),
          round_number: o.round, challenge_index: o.challenge, outcome: o.outcome,
          canonical_question_ref: id.canonicalRef, exact_question_key: id.exactKey,
          family: id.family, concept: id.concept, category: id.category,
          subject_kind: id.subject.kind, subject_key: id.subject.key, subject_label: id.subject.label,
          generator_version: id.generatorVersion, source_version: id.sourceVersion,
          source_artifact_id: id.sourceArtifactId,
          ...(production ? productionModule(o.ref) : {}),
        });
      }

      const ordered = occ.slice().sort(byOrdinals);
      const byRound = new Map<number, OccurrenceFact[]>();
      for (const o of ordered) byRound.set(o.round, [...(byRound.get(o.round) ?? []), o]);
      const rounds = [...byRound.entries()].map(([n, qs]) =>
        reviewRound(n, qs.map((q) => ({ ref: q.ref, variant: q.variant ?? null, outcome: q.outcome }))));
      reviews[mid] = {
        schemaVersion: "ranked_duel.match_review.v1", serverTime: FIXTURE_ANCHOR, matchId: mid,
        finalRoundNumber: rounds.length, roundCount: rounds.length, rounds,
      };
      for (const o of ordered) {
        occurrences.push({
          runId, completedAt: run.completedAt, stageIndex: index, stageKind: stage.kind, matchId: mid,
          questionResultId: resultId(index, o.round, o.challenge), round: o.round, challenge: o.challenge,
          ref: o.ref, variant: o.variant ?? null, outcome: o.outcome,
        });
      }
    });

    // HUB1's linkage: allocations in ordinal order, zipped with the Review
    // child's results in (round, challenge) order; unserved ones stay null.
    const reviewMatch = matchId(reviewIndex);
    for (const a of allocations) {
      const servedAt = served.indexOf(a);
      const src = a.source;
      rows.daily_run_review_items.push({
        run_id: runId, ordinal: a.ordinal, question_ref: a.miss.ref, source_stage_index: src.stage,
        source_match_id: matchId(src.stage), family: identityOf(a.miss.ref).family,
        source_question_result_id: resultId(src.stage, src.round, src.challenge),
        review_match_id: servedAt === -1 ? null : reviewMatch,
        review_question_result_id: servedAt === -1 ? null : resultId(reviewIndex, servedAt + 1, 0),
        review_outcome: servedAt === -1 ? null : a.outcome,
      });
    }
  }
  return { rows, reviews, occurrences };
}

/**
 * The rows as ONE canonical JSON string: keys sorted, no whitespace. The
 * export script writes exactly this, the generator hashes exactly these
 * bytes, and the tests recompute it — so a golden generated from other facts
 * than the ones in this repository cannot pass.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
