/**
 * HUB4 — the player History read model, `GET /api/history/v1`, schema 1.
 *
 * The backend (HUB2, `history/daily.py`) is the authority for every figure in
 * this file: basic facts, compatibility, sufficiency, analytics and the
 * capability state that says which of them this caller may see. The frontend
 * parses and displays. It never recomputes a metric, never infers an
 * entitlement, never joins against Daily persistence and never infers a stage
 * count — the stages it renders are exactly the stages on the wire.
 *
 * STRICT WHERE THE RECORD IS, TOLERANT WHERE THE ANALYSIS IS
 * ─────────────────────────────────────────────────────────
 * A Daily record's identity, stages and question outcomes are the Free record
 * and are parsed strictly: a malformed one is a contract violation, not a row.
 * The Premium `analytics` blocks are optional interpretation layered on top,
 * so an unreadable one is dropped and its capability reported as
 * `temporarily_unavailable` — the basic record survives, and an analysis the
 * client could not read is never shown as a paywall or as a zero.
 *
 * OPAQUE BY CONTRACT
 * ──────────────────
 * Run/stage/question ids, compatibility keys, canonical refs, exact keys and
 * generator/source versions are carried for identity only. Nothing here turns
 * them into copy.
 */

import {
  readModules,
  readPublicCategory,
  readRunPersonal,
  readStagePersonalFacts,
  type HistoryModule,
  type PublicCategory,
  type QuestionUnit,
  type RunPersonal,
  type StagePersonalFacts,
  type StreakSpan,
} from "@/lib/history/personal";
import {
  readRunPopulation,
  readSubjectBlock,
  type PopulationSubjectBlock,
  type RunPopulation,
} from "@/lib/history/population";

export type * from "@/lib/history/personal";
export type * from "@/lib/history/population";

export const HISTORY_SCHEMA_VERSION = 1;

export class HistoryContractError extends Error {
  constructor(message: string) {
    super(`History contract: ${message}`);
    this.name = "HistoryContractError";
  }
}

// ---------------------------------------------------------------- types

/** HUB2's five capability states. Each is rendered differently; see
 *  `HISTORY_ANALYTICS_SPEC.md` §8. */
export type CapabilityState =
  | "available"
  | "upgrade_required"
  | "insufficient_evidence"
  | "temporarily_unavailable"
  | "not_applicable";

export const CAPABILITY_STATES: readonly CapabilityState[] = [
  "available",
  "upgrade_required",
  "insufficient_evidence",
  "temporarily_unavailable",
  "not_applicable",
];

export interface AnalyticsCapability {
  state: CapabilityState;
  reasonCode: string | null;
}

export interface Sufficiency {
  status: "sufficient" | "insufficient" | "incompatible";
  observed: number;
  required: number;
  reasonCode: string | null;
}

/** One server metric. `value` is null whenever the evidence is insufficient;
 *  it is never a zero standing in for "not enough data". */
export interface Metric<T> {
  value: T | null;
  sufficiency: Sufficiency;
}

export interface PersonalBest {
  score: number;
  isCurrent: boolean;
  tied: boolean;
  /** Opaque — identity only. */
  earliestRunId: string;
  earliestCompletedAt: string;
}

export interface Trajectory {
  direction: "up" | "down" | "stable";
  slopePerRun: number;
  fittedChangePp: number;
  /** Run accuracies (0–1), oldest first, as the server fitted them. */
  values: number[];
}

export interface ReviewRecovery {
  correct: number;
  attempted: number;
  rate: number | null;
}

export interface CategoryPerformance {
  category: string;
  correct: number;
  answered: number;
  /** Null unless the group met the server's evidence floor. */
  accuracy: number | null;
  sufficiency: Sufficiency;
}

/** Family or concept performance across the compatible stage cohort. */
export interface LearningGroupPerformance {
  identity: string;
  correct: number;
  answered: number;
  runCount: number;
  accuracy: number | null;
  sufficiency: Sufficiency;
}

export type LearningSignalType =
  | "first_in_available_history"
  | "previous_exposure"
  | "repeated_miss"
  | "recurring_weakness"
  | "recovered_weakness";

export interface LearningSignal {
  /** The server's signal name, carried verbatim. Unknown names are kept so a
   *  newer backend is not rejected, and simply not presented. */
  type: string;
  questionResultId: string | null;
  previous: { completedAt: string; outcome: string } | null;
  sufficiency: Sufficiency;
}

export interface DailyAnalytics {
  policyVersion: string | null;
  historicalAverage: Metric<number>;
  previousRunDeltaPp: Metric<number>;
  personalBest: Metric<PersonalBest>;
  trajectory: Metric<Trajectory>;
  categoryPerformance: CategoryPerformance[];
  learningSignals: LearningSignal[];
  reviewRecoveryRate: Metric<ReviewRecovery>;
  /** HUB6.3B personal history (previous Daily, Core Daily); null on an
   *  older payload or an unreadable block. */
  personal: RunPersonal | null;
}

export interface StageAnalytics {
  kind: string;
  /** Earlier compatible stages the comparison is drawn against. */
  historicalSamples: number;
  categoryPerformance: CategoryPerformance[];
  familyPerformance: LearningGroupPerformance[];
  conceptPerformance: LearningGroupPerformance[];
  comparisonSufficiency: Sufficiency;
  /** Survival only; null when the frozen ruleset has no strike limit. */
  strikesUsed: number | null;
  /** Weak Areas only: the frozen question families the stage drew on. */
  selectedThemes: string[];
  /**
   * HUB6.1 — ruleset facts HUB2 already projects and HUB4 did not read. Each
   * is null where the server did not send it (another stage kind, or an
   * older projection):
   *   `settledQuestions`      Time Trial — questions terminally settled under
   *                           the active answer bank (the throughput figure);
   *   `terminal`              Time Trial / Survival — the raw terminal code;
   *   `depth`                 Survival — questions played before termination;
   *   `attemptedAllocations`  Review — frozen allocations actually attempted.
   */
  settledQuestions: number | null;
  terminal: string | null;
  depth: number | null;
  attemptedAllocations: number | null;
  /** HUB6.3B: current facts, memberships, exact-question history, personal
   *  comparison, strikes, Review sources, Weak Areas selection. Every part is
   *  empty/null on an older payload. */
  personalFacts: StagePersonalFacts;
}

export interface StageBasic {
  score: number;
  correct: number;
  answered: number;
  /** Null at zero answered — never 0%. */
  accuracy: number | null;
  /** Stable raw terminal code (`completed`, `time_bank_exhausted`, …). */
  endedBy: string | null;
  /** HUB6.3B: correct + incorrect + timeout occurrences. Older payloads:
   *  `answered` (the same count). */
  questionsPlayed: number;
  /** HUB6.3B, or counted from this stage's own question outcomes. */
  incorrect: number;
  timeout: number;
  /** HUB6.3B raw child terminal (`segments_complete`, …); null before. */
  completionReason: string | null;
  /**
   * HUB6.3C Free current-attempt facts (owner tier rule). Null on an older
   * payload, where `stageCurrentFacts` counts them by the server's rule.
   */
  longestStreak: number | null;
  longestStreakSpan: StreakSpan | null;
  /** Survival only. */
  depth: number | null;
  strikesUsed: number | null;
  maxStrikes: number | null;
}

export interface HistoryQuestion {
  /** Opaque. */
  questionResultId: string | null;
  /** Opaque, namespaced. Never parsed. */
  canonicalRef: string | null;
  outcome: string;
  /** 1-based position within the stage, in the stage's persisted order. */
  reviewPosition: number;
  /**
   * HUB2.1 — the occurrence. `roundNumber` is the one-based Ranked
   * round/module occurrence of the stage's child match; `challengeIndex` is the
   * zero-based question position inside that round. The pair, not the
   * canonical ref, identifies an occurrence: a ref may repeat. Null only for
   * a record that predates the projection.
   */
  roundNumber: number | null;
  challengeIndex: number | null;
  category: string | null;
  family: string | null;
  concept: string | null;
  subjectLabel: string | null;
  /** HUB6.3B: the frozen unit (`splash`, `meta_reflex`, `journey`, …). */
  unit: QuestionUnit | null;
  /** HUB6.3B: RG2's public category — the only grouping label shown. */
  publicCategory: PublicCategory | null;
  moduleId: string | null;
  moduleVersion: number | null;
  /**
   * HUB6.3C Free Survival strike markers (canonical): whether this question
   * produced a strike, and which (1..max). Null on non-Survival questions,
   * on older payloads, and when the server could not attribute strikes —
   * never guessed here.
   */
  isStrike: boolean | null;
  strikeIndex: number | null;
}

/** One Ranked round/module occurrence of a stage and the questions it settled,
 *  in `challengeIndex` order. */
export interface HistoryRound {
  roundNumber: number;
  questions: HistoryQuestion[];
}

export interface HistoryStage {
  /** Opaque. */
  stageId: string;
  order: number;
  kind: string;
  ruleset: {
    id: string | null;
    version: string | null;
    timeBankMs: number | null;
    maxStrikes: number | null;
  };
  /** The child match whose frozen review holds this stage's question
   *  content. The only link between History and the review endpoint. */
  reviewMatchId: string | null;
  basic: StageBasic;
  /** Every question occurrence, ordered `roundNumber`, then `challengeIndex`. */
  questions: HistoryQuestion[];
  /**
   * The occurrences grouped by round, ascending. Null when any question lacks
   * its round ordinal, in which case the stage's round structure is unknown
   * and nothing is inferred from its question count.
   */
  rounds: HistoryRound[] | null;
  /** HUB6.3B per-round modules (unit, C/played, member ids); null before. */
  modules: HistoryModule[] | null;
  /** HUB6.3B stage status (`completed` / `skipped`) and skip reason. */
  status: string | null;
  skipReason: string | null;
  capability: AnalyticsCapability;
  analytics: StageAnalytics | null;
  /** HUB6.3C Premium population (Standard / Time Trial / Survival); null
   *  for Free, other kinds, and older payloads. */
  population: PopulationSubjectBlock | null;
}

/**
 * DV2-B2 — the MAIN Daily (plan v5+): Standard settled, its score frozen by
 * the server. The only primary Daily score authority for such a record.
 */
export interface DailyMain {
  completedAt: string;
  dailyScore: number;
}

/**
 * DV2-B2 — the run's real lifecycle. `active` means the main Daily is done
 * and optional activities are still open; it never means "incomplete Daily".
 */
export interface DailyParent {
  status: "active" | "completed";
  completedAt: string | null;
}

export interface DailyHistoryRecord {
  recordType: "daily";
  /** Opaque. */
  runId: string;
  planDate: string;
  /** The effective completion time: for a v5+ record, the main Daily's. */
  completedAt: string;
  status: string;
  /** The planned parent stage count. While a v5+ parent is active it may
   *  exceed `stages.length`: only settled stages are sent. */
  stageCount: number;
  /** DV2-B2: null for a v1–v4 record AND for a payload from a backend that
   *  predates B2 (field absent). Never synthesised. */
  main: DailyMain | null;
  /** DV2-B2: null when the field is absent (older backend) — which means
   *  "unknown, legacy completed", never "active". */
  parent: DailyParent | null;
  /** The aggregate of the stages sent. For a record with `main`, NOT the
   *  primary score: it grows as optional stages settle. */
  basic: {
    score: number;
    correct: number;
    answered: number;
    accuracy: number | null;
    /** HUB6.3B, or the stages' own counts on an older payload. */
    questionsPlayed: number;
    incorrect: number;
    timeout: number;
  };
  /** Exactly the persisted stages, in persisted order. */
  stages: HistoryStage[];
  capability: AnalyticsCapability;
  analytics: DailyAnalytics | null;
  /** HUB6.3C Premium population (Core Daily + strongest mode); null for
   *  Free and older payloads. Optional: personal analytics never need it. */
  population: RunPopulation | null;
}

/** Discriminated so Ranked/Practice variants can join without pretending to
 *  share Daily's fields. V1 of the endpoint serves Daily records only. */
export type HistoryRecord = DailyHistoryRecord;

export interface HistoryPage {
  schemaVersion: number;
  asOf: string;
  items: HistoryRecord[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------- helpers

type Rec = Record<string, unknown>;
const fail = (m: string): never => {
  throw new HistoryContractError(m);
};
const rec = (v: unknown, l: string): Rec =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : fail(`${l} must be an object`);
const arr = (v: unknown, l: string): unknown[] => (Array.isArray(v) ? v : fail(`${l} must be an array`));
const str = (v: unknown, l: string): string => (typeof v === "string" ? v : fail(`${l} must be a string`));
const nstr = (v: unknown, l: string): string | null => (v === null || v === undefined ? null : str(v, l));
const num = (v: unknown, l: string): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fail(`${l} must be a number`);
const nnum = (v: unknown, l: string): number | null => (v === null || v === undefined ? null : num(v, l));
const int = (v: unknown, l: string): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : fail(`${l} must be a non-negative integer`);
const posInt = (v: unknown, l: string): number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : fail(`${l} must be a positive integer`);
const bool = (v: unknown, l: string): boolean => (typeof v === "boolean" ? v : fail(`${l} must be a boolean`));
/** An opaque identity that may arrive as a string or a number. */
const nid = (v: unknown, l: string): string | null =>
  v === null || v === undefined ? null : typeof v === "number" ? String(v) : str(v, l);

function readCapability(v: unknown, l: string): AnalyticsCapability {
  const r = rec(v, l);
  const state = str(r.state, `${l}.state`);
  if (!(CAPABILITY_STATES as readonly string[]).includes(state)) {
    fail(`${l}.state is unknown: ${state}`);
  }
  return { state: state as CapabilityState, reasonCode: nstr(r.reason_code, `${l}.reason_code`) };
}

function readSufficiency(v: unknown, l: string): Sufficiency {
  const r = rec(v, l);
  const status = str(r.status, `${l}.status`);
  if (status !== "sufficient" && status !== "insufficient" && status !== "incompatible") {
    fail(`${l}.status is unknown: ${status}`);
  }
  return {
    status: status as Sufficiency["status"],
    observed: int(r.observed, `${l}.observed`),
    required: int(r.required, `${l}.required`),
    reasonCode: nstr(r.reason_code, `${l}.reason_code`),
  };
}

function readMetric<T>(v: unknown, l: string, value: (raw: unknown, l: string) => T): Metric<T> {
  const r = rec(v, l);
  return {
    value: r.value === null || r.value === undefined ? null : value(r.value, `${l}.value`),
    sufficiency: readSufficiency(r.sufficiency, `${l}.sufficiency`),
  };
}

function readCategory(v: unknown, l: string): CategoryPerformance {
  const r = rec(v, l);
  return {
    category: str(r.category, `${l}.category`),
    correct: int(r.correct, `${l}.correct`),
    answered: int(r.answered, `${l}.answered`),
    accuracy: nnum(r.accuracy, `${l}.accuracy`),
    sufficiency: readSufficiency(r.sufficiency, `${l}.sufficiency`),
  };
}

function readLearningGroup(v: unknown, l: string, field: "family" | "concept"): LearningGroupPerformance {
  const r = rec(v, l);
  return {
    identity: str(r[field], `${l}.${field}`),
    correct: int(r.correct, `${l}.correct`),
    answered: int(r.answered, `${l}.answered`),
    runCount: int(r.run_count, `${l}.run_count`),
    accuracy: nnum(r.accuracy, `${l}.accuracy`),
    sufficiency: readSufficiency(r.sufficiency, `${l}.sufficiency`),
  };
}

const list = <T>(v: unknown, l: string, each: (raw: unknown, l: string) => T): T[] =>
  v === null || v === undefined ? [] : arr(v, l).map((item, i) => each(item, `${l}[${i}]`));

export function readDailyAnalytics(v: unknown, l = "analytics"): DailyAnalytics {
  const r = rec(v, l);
  return {
    policyVersion: nstr(r.policy_version, `${l}.policy_version`),
    historicalAverage: readMetric(r.historical_average, `${l}.historical_average`, num),
    previousRunDeltaPp: readMetric(r.previous_run_delta_pp, `${l}.previous_run_delta_pp`, num),
    personalBest: readMetric(r.personal_best, `${l}.personal_best`, (raw, pl) => {
      const b = rec(raw, pl);
      return {
        score: num(b.score, `${pl}.score`),
        isCurrent: bool(b.is_current, `${pl}.is_current`),
        tied: bool(b.tied, `${pl}.tied`),
        earliestRunId: str(b.earliest_run_id, `${pl}.earliest_run_id`),
        earliestCompletedAt: str(b.earliest_completed_at, `${pl}.earliest_completed_at`),
      };
    }),
    trajectory: readMetric(r.trajectory, `${l}.trajectory`, (raw, tl) => {
      const t = rec(raw, tl);
      const direction = str(t.direction, `${tl}.direction`);
      if (direction !== "up" && direction !== "down" && direction !== "stable") {
        fail(`${tl}.direction is unknown: ${direction}`);
      }
      return {
        direction: direction as Trajectory["direction"],
        slopePerRun: num(t.slope_per_run, `${tl}.slope_per_run`),
        fittedChangePp: num(t.fitted_change_pp, `${tl}.fitted_change_pp`),
        values: arr(t.values, `${tl}.values`).map((x, i) => num(x, `${tl}.values[${i}]`)),
      };
    }),
    categoryPerformance: list(r.category_performance, `${l}.category_performance`, readCategory),
    learningSignals: list(r.learning_signals, `${l}.learning_signals`, (raw, sl) => {
      const s = rec(raw, sl);
      const previous =
        s.previous === null || s.previous === undefined
          ? null
          : (() => {
              const p = rec(s.previous, `${sl}.previous`);
              return {
                completedAt: str(p.completed_at, `${sl}.previous.completed_at`),
                outcome: str(p.outcome, `${sl}.previous.outcome`),
              };
            })();
      return {
        type: str(s.type, `${sl}.type`),
        questionResultId: nid(s.question_result_id, `${sl}.question_result_id`),
        previous,
        sufficiency: readSufficiency(s.sufficiency, `${sl}.sufficiency`),
      };
    }),
    reviewRecoveryRate: readMetric(r.review_recovery_rate, `${l}.review_recovery_rate`, (raw, rl) => {
      const x = rec(raw, rl);
      return {
        correct: int(x.correct, `${rl}.correct`),
        attempted: int(x.attempted, `${rl}.attempted`),
        rate: nnum(x.rate, `${rl}.rate`),
      };
    }),
    personal: readRunPersonal(r.personal),
  };
}

export function readStageAnalytics(v: unknown, l = "analytics"): StageAnalytics {
  const r = rec(v, l);
  return {
    kind: str(r.kind, `${l}.kind`),
    historicalSamples: int(r.historical_samples, `${l}.historical_samples`),
    categoryPerformance: list(r.category_performance, `${l}.category_performance`, readCategory),
    familyPerformance: list(r.family_performance, `${l}.family_performance`, (x, fl) =>
      readLearningGroup(x, fl, "family")),
    conceptPerformance: list(r.concept_performance, `${l}.concept_performance`, (x, cl) =>
      readLearningGroup(x, cl, "concept")),
    comparisonSufficiency: readSufficiency(r.comparison_sufficiency, `${l}.comparison_sufficiency`),
    strikesUsed: nnum(r.strikes_used, `${l}.strikes_used`),
    selectedThemes: list(r.selected_themes, `${l}.selected_themes`, str),
    settledQuestions: r.settled_questions === null || r.settled_questions === undefined
      ? null : int(r.settled_questions, `${l}.settled_questions`),
    terminal: nstr(r.terminal, `${l}.terminal`),
    depth: r.depth === null || r.depth === undefined ? null : int(r.depth, `${l}.depth`),
    attemptedAllocations: r.attempted_allocations === null || r.attempted_allocations === undefined
      ? null : int(r.attempted_allocations, `${l}.attempted_allocations`),
    personalFacts: readStagePersonalFacts(r),
  };
}

/**
 * Read an optional analytics block without letting it take the record down.
 * An unreadable block becomes "no analysis, temporarily unavailable" — the
 * same state the server uses for its own projection failures.
 */
function readOptionalAnalytics<T>(
  raw: unknown,
  capability: AnalyticsCapability,
  l: string,
  reader: (v: unknown, l: string) => T,
): { analytics: T | null; capability: AnalyticsCapability } {
  if (raw === null || raw === undefined) return { analytics: null, capability };
  try {
    return { analytics: reader(raw, l), capability };
  } catch {
    return {
      analytics: null,
      capability: { state: "temporarily_unavailable", reasonCode: "analytics_unreadable" },
    };
  }
}

function readQuestion(v: unknown, l: string): HistoryQuestion {
  const r = rec(v, l);
  const subject = r.subject === null || r.subject === undefined ? null : rec(r.subject, `${l}.subject`);
  return {
    questionResultId: nid(r.question_result_id, `${l}.question_result_id`),
    canonicalRef: nstr(r.canonical_ref, `${l}.canonical_ref`),
    outcome: str(r.outcome, `${l}.outcome`),
    reviewPosition: int(r.review_position, `${l}.review_position`),
    roundNumber: r.round_number === null || r.round_number === undefined
      ? null : posInt(r.round_number, `${l}.round_number`),
    challengeIndex: r.challenge_index === null || r.challenge_index === undefined
      ? null : int(r.challenge_index, `${l}.challenge_index`),
    category: nstr(r.category, `${l}.category`),
    family: nstr(r.family, `${l}.family`),
    concept: nstr(r.concept, `${l}.concept`),
    subjectLabel: subject ? nstr(subject.label, `${l}.subject.label`) : null,
    // HUB6.3B, optional: an older payload has none of these.
    unit: typeof r.unit === "string" ? r.unit : null,
    publicCategory: readPublicCategory(r.public_category),
    moduleId: typeof r.module_id === "string" ? r.module_id : null,
    moduleVersion: typeof r.module_version === "number" && Number.isInteger(r.module_version) ? r.module_version : null,
    // HUB6.3C, optional (Survival only).
    isStrike: typeof r.is_strike === "boolean" ? r.is_strike : null,
    strikeIndex: typeof r.strike_index === "number" && Number.isInteger(r.strike_index) && r.strike_index >= 1
      ? r.strike_index : null,
  };
}

/**
 * Order and group a stage's question occurrences by HUB2.1's ordinals:
 * `round_number` ascending, then `challenge_index` ascending. Nothing is
 * de-duplicated — two occurrences of one canonical ref are two questions —
 * and no grouping is guessed from family, type or count. A duplicate
 * (round, challenge) pair is a contract violation.
 */
function occurrences(
  questions: HistoryQuestion[],
  l: string,
): { questions: HistoryQuestion[]; rounds: HistoryRound[] | null } {
  if (questions.some((q) => q.roundNumber === null || q.challengeIndex === null)) {
    return { questions, rounds: null };
  }
  const ordered = questions
    .slice()
    .sort((a, b) => a.roundNumber! - b.roundNumber! || a.challengeIndex! - b.challengeIndex!);
  const rounds: HistoryRound[] = [];
  for (const q of ordered) {
    const last = rounds[rounds.length - 1];
    if (last && last.roundNumber === q.roundNumber) {
      if (last.questions[last.questions.length - 1].challengeIndex === q.challengeIndex) {
        fail(`${l}.questions repeat round ${q.roundNumber} challenge ${q.challengeIndex}`);
      }
      last.questions.push(q);
    } else {
      rounds.push({ roundNumber: q.roundNumber!, questions: [q] });
    }
  }
  return { questions: ordered, rounds };
}

function readStage(v: unknown, l: string): HistoryStage {
  const r = rec(v, l);
  const ruleset = rec(r.ruleset, `${l}.ruleset`);
  const config =
    ruleset.config === null || ruleset.config === undefined ? {} : rec(ruleset.config, `${l}.ruleset.config`);
  const basic = rec(r.basic, `${l}.basic`);
  const review = r.review_identity === null || r.review_identity === undefined
    ? null
    : rec(r.review_identity, `${l}.review_identity`);
  const { analytics, capability } = readOptionalAnalytics(
    r.analytics,
    readCapability(r.analytics_capability, `${l}.analytics_capability`),
    `${l}.analytics`,
    readStageAnalytics,
  );
  const questionList = occurrences(
    arr(r.questions, `${l}.questions`).map((q, i) => readQuestion(q, `${l}.questions[${i}]`)), l);
  const countOf = (outcome: string) => questionList.questions.filter((q) => q.outcome === outcome).length;
  const optCount = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : fallback;
  const answered = int(basic.answered, `${l}.basic.answered`);
  return {
    stageId: str(r.stage_id, `${l}.stage_id`),
    order: int(r.order, `${l}.order`),
    kind: str(r.kind, `${l}.kind`),
    ruleset: {
      id: nstr(ruleset.id, `${l}.ruleset.id`),
      version: nid(ruleset.version, `${l}.ruleset.version`),
      timeBankMs: nnum(config.time_bank_ms, `${l}.ruleset.config.time_bank_ms`),
      maxStrikes: nnum(config.max_strikes, `${l}.ruleset.config.max_strikes`),
    },
    reviewMatchId: review ? nstr(review.match_id, `${l}.review_identity.match_id`) : null,
    basic: {
      score: num(basic.score, `${l}.basic.score`),
      correct: int(basic.correct, `${l}.basic.correct`),
      answered,
      accuracy: nnum(basic.accuracy, `${l}.basic.accuracy`),
      endedBy: nstr(basic.ended_by, `${l}.basic.ended_by`),
      // HUB6.3B; an older payload's own question outcomes give the same
      // counts (questions played = answered = its question rows).
      questionsPlayed: optCount(basic.questions_played, answered),
      incorrect: optCount(basic.incorrect, countOf("incorrect")),
      timeout: optCount(basic.timeout, countOf("timeout")),
      completionReason: typeof basic.completion_reason === "string" ? basic.completion_reason : null,
      // HUB6.3C Free facts, optional.
      longestStreak: optInt(basic.longest_streak),
      longestStreakSpan: readSpan(basic.longest_streak_span),
      depth: optInt(basic.depth),
      strikesUsed: optInt(basic.strikes_used),
      maxStrikes: optInt(basic.max_strikes),
    },
    ...questionList,
    modules: readModules(r.modules),
    status: typeof r.status === "string" ? r.status : null,
    skipReason: typeof r.skip_reason === "string" ? r.skip_reason : null,
    capability,
    analytics,
    population: readSubjectBlock(r.population),
  };
}

const optInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

function readSpan(v: unknown): StreakSpan | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Rec;
  const length = optInt(r.length);
  if (length === null) return null;
  const id = (x: unknown) => (typeof x === "string" ? x : typeof x === "number" ? String(x) : null);
  return { length, startQuestionResultId: id(r.start_question_result_id), endQuestionResultId: id(r.end_question_result_id) };
}

/**
 * DV2-B2 `main`. Absent or null (older backend, v1–v4) is null. Present, it
 * is a pair — a text timestamp and an integer score — or the record is a
 * contract violation: half a pair is never completed with a guess.
 */
function readMain(v: unknown, l: string): DailyMain | null {
  if (v === null || v === undefined) return null;
  const r = rec(v, l);
  const score = r.daily_score;
  if (typeof score !== "number" || !Number.isInteger(score)) fail(`${l}.daily_score must be an integer`);
  return { completedAt: str(r.completed_at, `${l}.completed_at`), dailyScore: score as number };
}

/** DV2-B2 `parent`. Absent or null is null (older backend). */
function readParent(v: unknown, l: string): DailyParent | null {
  if (v === null || v === undefined) return null;
  const r = rec(v, l);
  const status = str(r.status, `${l}.status`);
  if (status !== "active" && status !== "completed") fail(`${l}.status is unknown: ${status}`);
  const completedAt = nstr(r.completed_at, `${l}.completed_at`);
  if (status === "completed" && completedAt === null) fail(`${l}.completed_at is required when completed`);
  if (status === "active" && completedAt !== null) fail(`${l}.completed_at must be null while active`);
  return { status: status as DailyParent["status"], completedAt };
}

function readDailyRecord(r: Rec, l: string): DailyHistoryRecord {
  const main = readMain(r.main, `${l}.main`);
  const parent = readParent(r.parent, `${l}.parent`);
  // History admits an active parent only once its main Daily froze (B2).
  if (parent?.status === "active" && main === null) fail(`${l}.parent is active without a main Daily`);
  const basic = rec(r.basic, `${l}.basic`);
  const stages = arr(r.stages, `${l}.stages`).map((s, i) => readStage(s, `${l}.stages[${i}]`));
  // Persisted order is the stage's own `order`. The server already sends them
  // that way; sorting is a guard, never a reordering of the product's intent.
  stages.sort((a, b) => a.order - b.order);
  const { analytics, capability } = readOptionalAnalytics(
    r.analytics,
    readCapability(r.analytics_capability, `${l}.analytics_capability`),
    `${l}.analytics`,
    readDailyAnalytics,
  );
  return {
    recordType: "daily",
    runId: str(r.run_id, `${l}.run_id`),
    planDate: str(r.plan_date, `${l}.plan_date`),
    completedAt: str(r.completed_at, `${l}.completed_at`),
    status: str(r.status, `${l}.status`),
    stageCount: int(r.stage_count, `${l}.stage_count`),
    main,
    parent,
    basic: {
      score: num(basic.score, `${l}.basic.score`),
      correct: int(basic.correct, `${l}.basic.correct`),
      answered: int(basic.answered, `${l}.basic.answered`),
      accuracy: nnum(basic.accuracy, `${l}.basic.accuracy`),
      questionsPlayed: typeof basic.questions_played === "number" ? basic.questions_played
        : int(basic.answered, `${l}.basic.answered`),
      incorrect: typeof basic.incorrect === "number" ? basic.incorrect
        : stages.reduce((a, s) => a + s.basic.incorrect, 0),
      timeout: typeof basic.timeout === "number" ? basic.timeout
        : stages.reduce((a, s) => a + s.basic.timeout, 0),
    },
    stages,
    capability,
    analytics,
    population: readRunPopulation(r.population),
  };
}

/**
 * Parse one page of `GET /api/history/v1`.
 *
 * The schema version is checked before anything else: a page from a future
 * wire format is refused whole rather than half-read.
 */
export function readHistoryPage(body: unknown): HistoryPage {
  const b = rec(body, "history");
  const schemaVersion = num(b.schema_version, "schema_version");
  if (schemaVersion !== HISTORY_SCHEMA_VERSION) {
    fail(`unsupported schema_version ${schemaVersion} (expected ${HISTORY_SCHEMA_VERSION})`);
  }
  const items: HistoryRecord[] = [];
  arr(b.items, "items").forEach((raw, i) => {
    const r = rec(raw, `items[${i}]`);
    const type = str(r.record_type, `items[${i}].record_type`);
    // A record type this client does not know is skipped, not fatal: the
    // spec lets Ranked/Practice join this endpoint later as new variants.
    if (type === "daily") items.push(readDailyRecord(r, `items[${i}]`));
  });
  return {
    schemaVersion,
    asOf: str(b.as_of, "as_of"),
    items,
    nextCursor: nstr(b.next_cursor, "next_cursor"),
  };
}
