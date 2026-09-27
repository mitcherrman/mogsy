/**
 * HUB6.3D — the HUB6.3B additions to History schema v1, typed and parsed.
 *
 * HUB6.3B (`d4a43826`, `history-daily-v2`) added personal-history facts to the
 * same schema-v1 page, every one of them OPTIONAL on the wire:
 *
 *   Free (facts about this run):
 *     run/stage `basic`: questions_played, incorrect, timeout (+ stage
 *       completion_reason); `stage.modules[]`; per question `unit`,
 *       `public_category`, `module_id`, `module_version`
 *   Premium (inside `analytics`):
 *     `item.analytics.personal` = { previous_daily, core }
 *     `stage.analytics`: current, outcomes, categories, question_history,
 *       replayed_by, personal, strikes (Survival), review_sources (Review),
 *       selection (Weak Areas)
 *
 * PARSING POLICY
 * ──────────────
 * An older payload (HUB2.3, and Timmy's golden) carries none of this, and
 * must render exactly as before — so nothing here is required. A malformed
 * HUB6.3B block is dropped (null / empty) rather than failing the record or
 * the legacy analytics beside it: the record is the product, analytics are
 * an addition to it. Names are translated to the frontend's (camelCase) and
 * no value is derived here: every number is the server's.
 */
import type { Sufficiency } from "@/lib/history/contracts";

// ───────────────────────────────────────────────────────────── types

export interface PublicCategory {
  /** Stable RG2 key (`itemization`, `meta-reflex`, `general`, …). */
  key: string;
  /** The server's display label ("Itemization", "Question"). */
  label: string;
}

/** The frozen unit a round was built as (`splash | meta_reflex | journey |
 *  review_replay | slice`), or null when no frozen source says. */
export type QuestionUnit = string;

export interface HistoryModule {
  roundNumber: number;
  unit: QuestionUnit | null;
  moduleId: string | null;
  moduleVersion: number | null;
  questionsPlayed: number;
  correct: number;
  questionResultIds: string[];
}

export interface StreakSpan {
  length: number;
  startQuestionResultId: string | null;
  endQuestionResultId: string | null;
}

/** This stage's own current facts (HUB6.3B `stage.analytics.current`). */
export interface StageCurrent {
  correct: number;
  incorrect: number;
  timeout: number;
  questionsPlayed: number;
  accuracy: number | null;
  longestStreak: number | null;
  longestStreakSpan: StreakSpan | null;
  completionReason: string | null;
  score: number | null;
  depth: number | null;
  strikesUsed: number | null;
  maxStrikes: number | null;
}

export interface OutcomeMembers {
  count: number;
  questionResultIds: string[];
}

export interface OutcomeMembership {
  correct: OutcomeMembers;
  incorrect: OutcomeMembers;
  timeout: OutcomeMembers;
}

export interface StageCategory {
  publicCategory: PublicCategory;
  correct: number;
  incorrect: number;
  timeout: number;
  questionsPlayed: number;
  accuracy: number | null;
  questionResultIds: string[];
  idsByOutcome: { correct: string[]; incorrect: string[]; timeout: string[] };
}

export interface QuestionPriorHistory {
  questionResultId: string;
  priorExposures: number;
  priorCorrect: number;
  lastPrior: { runId: string; completedAt: string; outcome: string } | null;
}

export interface ReplayedBy {
  questionResultId: string;
  reviewQuestionResultId: string;
  reviewOutcome: string | null;
}

export interface SurvivalStrike {
  strikeIndex: number;
  questionResultId: string;
  outcome: string;
}

export interface ReviewSource {
  /** The Review replay's own question result. */
  questionResultId: string;
  allocationOrdinal: number;
  /** The replay's outcome. */
  outcome: string | null;
  source: {
    questionResultId: string;
    runId: string;
    stageId: string;
    stageKind: string;
    stageOrder: number;
    outcome: string | null;
  };
}

export interface WeakAreasSelection {
  policyVersion: string | null;
  evidenceCutoff: string | null;
  slots: Array<{
    slotIndex: number;
    roundNumber: number | null;
    slotPublicCategory: PublicCategory | null;
    questionResultIds: string[];
  }>;
}

/** A snapshot of one attempt (current, previous or a series point). Fields a
 *  kind does not carry stay undefined. */
export interface PersonalSnapshot {
  runId: string;
  planDate: string;
  completedAt: string;
  score?: number | null;
  correct?: number | null;
  questionsPlayed?: number | null;
  accuracy?: number | null;
  longestStreak?: number | null;
  timeout?: number | null;
  completionReason?: string | null;
  depth?: number | null;
  strikesUsed?: number | null;
  /** Series points only. */
  isCurrent?: boolean;
  /** Previous-Daily snapshots only. */
  stageCount?: number;
  stageKinds?: string[];
  /** Core current only: every core kind tied for the Daily's longest streak. */
  longestStreakStages?: string[];
}

export type RecordStatus = "first_attempt" | "new_record" | "tied_record" | "below_record";

export interface PersonalRecord {
  metric: string;
  current: number | null;
  priorBest: number | null;
  historicalBest: number | null;
  /** Null when the current value itself is missing. */
  status: RecordStatus | null;
  priorBestRunId: string | null;
  priorBestCompletedAt: string | null;
  priorAttempts: number;
}

export interface PersonalHistory {
  attempts: number;
  totalCorrect: number;
  totalQuestionsPlayed: number;
  /** Pooled Σcorrect / Σplayed over prior compatible attempts. */
  historicalAccuracy: number | null;
  averageCorrect: number | null;
  averageQuestionsPlayed: number | null;
  averageLongestStreak: number | null;
  /** Stage-native averages (`average_score`, `average_timeout`,
   *  `average_depth`, `average_strikes_used`), keyed without the prefix. */
  averages: Record<string, number | null>;
  sufficiency: Sufficiency | null;
}

export interface CategoryHistory {
  publicCategory: PublicCategory;
  correct: number;
  questionsPlayed: number;
  accuracy: number | null;
  priorAttempts: number;
  stagesWithCategory: number;
}

/** A personal comparison block (Core Daily or a core stage). */
export interface PersonalComparison {
  eligible: boolean;
  reasonCode: string | null;
  metricPolicyVersion: string | null;
  current: PersonalSnapshot | null;
  previous: PersonalSnapshot | null;
  /** current − previous per numeric field (accuracy a raw fraction). */
  delta: Record<string, number> | null;
  previousSufficiency: Sufficiency | null;
  history: PersonalHistory | null;
  records: PersonalRecord[];
  /** ≤ 20 compatible attempts, oldest first, ending with the current one. */
  series: PersonalSnapshot[];
  /** Stage blocks only. */
  categoryHistory: CategoryHistory[];
  /** Core only: the core kinds it spans. */
  kinds: string[];
}

export interface PreviousDaily {
  current: PersonalSnapshot | null;
  previous: PersonalSnapshot | null;
  delta: Record<string, number> | null;
  sameStageKinds: boolean | null;
  sufficiency: Sufficiency | null;
}

export interface RunPersonal {
  metricPolicyVersion: string | null;
  previousDaily: PreviousDaily | null;
  core: PersonalComparison | null;
}

/** Everything HUB6.3B adds to one stage's analytics. */
export interface StagePersonalFacts {
  current: StageCurrent | null;
  outcomes: OutcomeMembership | null;
  categories: StageCategory[];
  questionHistory: QuestionPriorHistory[];
  replayedBy: ReplayedBy[];
  personal: PersonalComparison | null;
  /** Survival only; null when absent or when the server could not attribute. */
  strikes: SurvivalStrike[] | null;
  reviewSources: ReviewSource[];
  selection: WeakAreasSelection | null;
}

// ───────────────────────────────────────────────────────────── helpers

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const id = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(id).filter((x): x is string => x !== null) : []);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Read a block; a malformed block is dropped rather than propagated. */
export function lenient<T>(reader: (v: unknown) => T, fallback: T): (v: unknown) => T {
  return (v) => {
    if (v === null || v === undefined) return fallback;
    try {
      return reader(v);
    } catch {
      return fallback;
    }
  };
}

function need<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`HUB6.3B block missing ${what}`);
  return value;
}

export function readSufficiencyLoose(v: unknown): Sufficiency | null {
  if (!isRec(v)) return null;
  const status = str(v.status);
  if (status !== "sufficient" && status !== "insufficient" && status !== "incompatible") return null;
  return { status, observed: int(v.observed) ?? 0, required: int(v.required) ?? 0, reasonCode: str(v.reason_code) };
}

export function readPublicCategory(v: unknown): PublicCategory | null {
  if (!isRec(v)) return null;
  const key = str(v.key);
  const label = str(v.label);
  return key && label ? { key, label } : null;
}

// ───────────────────────────────────────────────────────────── Free

export const readModules = lenient((v: unknown): HistoryModule[] | null => {
  if (!Array.isArray(v)) return null;
  return v.map((raw) => {
    if (!isRec(raw)) throw new Error("module");
    return {
      roundNumber: need(int(raw.round_number), "module.round_number"),
      unit: str(raw.unit),
      moduleId: str(raw.module_id),
      moduleVersion: int(raw.module_version),
      questionsPlayed: int(raw.questions_played) ?? 0,
      correct: int(raw.correct) ?? 0,
      questionResultIds: ids(raw.question_result_ids),
    };
  });
}, null);

// ───────────────────────────────────────────────────────────── Premium

function readSnapshot(v: unknown): PersonalSnapshot | null {
  if (!isRec(v)) return null;
  const runId = id(v.run_id);
  if (!runId) return null;
  const out: PersonalSnapshot = { runId, planDate: str(v.plan_date) ?? "", completedAt: str(v.completed_at) ?? "" };
  const numeric: Array<[keyof PersonalSnapshot, string]> = [
    ["score", "score"], ["correct", "correct"], ["questionsPlayed", "questions_played"], ["accuracy", "accuracy"],
    ["longestStreak", "longest_streak"], ["timeout", "timeout"], ["depth", "depth"], ["strikesUsed", "strikes_used"],
  ];
  for (const [to, from] of numeric) if (from in v) (out as unknown as Rec)[to] = num(v[from]);
  if ("completion_reason" in v) out.completionReason = str(v.completion_reason);
  if (typeof v.is_current === "boolean") out.isCurrent = v.is_current;
  if ("stage_count" in v) out.stageCount = int(v.stage_count) ?? undefined;
  if (Array.isArray(v.stage_kinds)) out.stageKinds = v.stage_kinds.map(str).filter((x): x is string => !!x);
  if (Array.isArray(v.longest_streak_stages)) {
    out.longestStreakStages = v.longest_streak_stages.map(str).filter((x): x is string => !!x);
  }
  return out;
}

function readDelta(v: unknown): Record<string, number> | null {
  if (!isRec(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(v)) {
    const n = num(x);
    if (n !== null) out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = n;
  }
  return out;
}

const RECORD_STATUSES: readonly string[] = ["first_attempt", "new_record", "tied_record", "below_record"];

function readRecord(v: unknown): PersonalRecord | null {
  if (!isRec(v)) return null;
  const metric = str(v.metric);
  if (!metric) return null;
  const status = str(v.status);
  return {
    metric,
    current: num(v.current),
    priorBest: num(v.prior_best),
    historicalBest: num(v.historical_best),
    status: status && RECORD_STATUSES.includes(status) ? (status as RecordStatus) : null,
    priorBestRunId: id(v.prior_best_run_id),
    priorBestCompletedAt: str(v.prior_best_completed_at),
    priorAttempts: int(v.prior_attempts) ?? 0,
  };
}

function readHistory(v: unknown): PersonalHistory | null {
  if (!isRec(v)) return null;
  const averages: Record<string, number | null> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith("average_") && !["average_correct", "average_questions_played", "average_longest_streak"].includes(k)) {
      averages[k.slice("average_".length).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = num(x);
    }
  }
  return {
    attempts: int(v.attempts) ?? 0,
    totalCorrect: int(v.total_correct) ?? 0,
    totalQuestionsPlayed: int(v.total_questions_played) ?? 0,
    historicalAccuracy: num(v.historical_accuracy),
    averageCorrect: num(v.average_correct),
    averageQuestionsPlayed: num(v.average_questions_played),
    averageLongestStreak: num(v.average_longest_streak),
    averages,
    sufficiency: readSufficiencyLoose(v.sufficiency),
  };
}

export const readPersonalComparison = lenient((v: unknown): PersonalComparison | null => {
  if (!isRec(v)) return null;
  return {
    eligible: v.eligible === true,
    reasonCode: str(v.reason_code),
    metricPolicyVersion: str(v.metric_policy_version),
    current: readSnapshot(v.current),
    previous: readSnapshot(v.previous),
    delta: readDelta(v.delta),
    previousSufficiency: readSufficiencyLoose(v.previous_sufficiency),
    history: readHistory(v.history),
    records: arr(v.records).map(readRecord).filter((x): x is PersonalRecord => x !== null),
    series: arr(v.series).map(readSnapshot).filter((x): x is PersonalSnapshot => x !== null),
    categoryHistory: arr(v.category_history).flatMap((raw) => {
      if (!isRec(raw)) return [];
      const pc = readPublicCategory(raw.public_category);
      return pc ? [{
        publicCategory: pc,
        correct: int(raw.correct) ?? 0,
        questionsPlayed: int(raw.questions_played) ?? 0,
        accuracy: num(raw.accuracy),
        priorAttempts: int(raw.prior_attempts) ?? 0,
        stagesWithCategory: int(raw.stages_with_category) ?? 0,
      }] : [];
    }),
    kinds: arr(v.kinds).map(str).filter((x): x is string => !!x),
  };
}, null);

export const readRunPersonal = lenient((v: unknown): RunPersonal | null => {
  if (!isRec(v)) return null;
  const pd = isRec(v.previous_daily) ? v.previous_daily : null;
  return {
    metricPolicyVersion: str(v.metric_policy_version),
    previousDaily: pd ? {
      current: readSnapshot(pd.current),
      previous: readSnapshot(pd.previous),
      delta: readDelta(pd.delta),
      sameStageKinds: typeof pd.same_stage_kinds === "boolean" ? pd.same_stage_kinds : null,
      sufficiency: readSufficiencyLoose(pd.sufficiency),
    } : null,
    core: readPersonalComparison(v.core),
  };
}, null);

function readStageCurrent(v: unknown): StageCurrent | null {
  if (!isRec(v)) return null;
  const span = isRec(v.longest_streak_span) ? v.longest_streak_span : null;
  return {
    correct: int(v.correct) ?? 0,
    incorrect: int(v.incorrect) ?? 0,
    timeout: int(v.timeout) ?? 0,
    questionsPlayed: int(v.questions_played) ?? 0,
    accuracy: num(v.accuracy),
    longestStreak: int(v.longest_streak),
    longestStreakSpan: span ? {
      length: int(span.length) ?? 0,
      startQuestionResultId: id(span.start_question_result_id),
      endQuestionResultId: id(span.end_question_result_id),
    } : null,
    completionReason: str(v.completion_reason),
    score: num(v.score),
    depth: int(v.depth),
    strikesUsed: int(v.strikes_used),
    maxStrikes: int(v.max_strikes),
  };
}

function readOutcomes(v: unknown): OutcomeMembership | null {
  if (!isRec(v)) return null;
  const one = (x: unknown): OutcomeMembers =>
    isRec(x) ? { count: int(x.count) ?? 0, questionResultIds: ids(x.question_result_ids) } : { count: 0, questionResultIds: [] };
  return { correct: one(v.correct), incorrect: one(v.incorrect), timeout: one(v.timeout) };
}

/** Everything HUB6.3B adds inside `stage.analytics`. Missing → empty. */
export function readStagePersonalFacts(v: unknown): StagePersonalFacts {
  const r: Rec = isRec(v) ? v : {};
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    current: safe(() => readStageCurrent(r.current), null),
    outcomes: safe(() => readOutcomes(r.outcomes), null),
    categories: safe(() => arr(r.categories).flatMap((raw) => {
      if (!isRec(raw)) return [];
      const pc = readPublicCategory(raw.public_category);
      if (!pc) return [];
      const by = isRec(raw.question_result_ids_by_outcome) ? raw.question_result_ids_by_outcome : {};
      return [{
        publicCategory: pc,
        correct: int(raw.correct) ?? 0,
        incorrect: int(raw.incorrect) ?? 0,
        timeout: int(raw.timeout) ?? 0,
        questionsPlayed: int(raw.questions_played) ?? 0,
        accuracy: num(raw.accuracy),
        questionResultIds: ids(raw.question_result_ids),
        idsByOutcome: { correct: ids(by.correct), incorrect: ids(by.incorrect), timeout: ids(by.timeout) },
      }];
    }), []),
    questionHistory: safe(() => arr(r.question_history).flatMap((raw) => {
      if (!isRec(raw)) return [];
      const qid = id(raw.question_result_id);
      if (!qid) return [];
      const last = isRec(raw.last_prior) ? raw.last_prior : null;
      return [{
        questionResultId: qid,
        priorExposures: int(raw.prior_exposures) ?? 0,
        priorCorrect: int(raw.prior_correct) ?? 0,
        lastPrior: last ? { runId: id(last.run_id) ?? "", completedAt: str(last.completed_at) ?? "", outcome: str(last.outcome) ?? "" } : null,
      }];
    }), []),
    replayedBy: safe(() => arr(r.replayed_by).flatMap((raw) => {
      if (!isRec(raw)) return [];
      const q = id(raw.question_result_id);
      const rq = id(raw.review_question_result_id);
      return q && rq ? [{ questionResultId: q, reviewQuestionResultId: rq, reviewOutcome: str(raw.review_outcome) }] : [];
    }), []),
    personal: readPersonalComparison(r.personal),
    strikes: safe(() => (Array.isArray(r.strikes)
      ? r.strikes.flatMap((raw) => {
        if (!isRec(raw)) return [];
        const q = id(raw.question_result_id);
        const k = int(raw.strike_index);
        return q && k !== null ? [{ strikeIndex: k, questionResultId: q, outcome: str(raw.outcome) ?? "" }] : [];
      })
      : null), null),
    reviewSources: safe(() => arr(r.review_sources).flatMap((raw) => {
      if (!isRec(raw) || !isRec(raw.review_source)) return [];
      const s = raw.review_source;
      const q = id(raw.question_result_id);
      const sq = id(s.question_result_id);
      if (!q || !sq) return [];
      return [{
        questionResultId: q,
        allocationOrdinal: int(raw.allocation_ordinal) ?? 0,
        outcome: str(raw.outcome),
        source: {
          questionResultId: sq,
          runId: id(s.run_id) ?? "",
          stageId: id(s.stage_id) ?? "",
          stageKind: str(s.stage_kind) ?? "",
          stageOrder: int(s.stage_order) ?? 0,
          outcome: str(s.outcome),
        },
      }];
    }), []),
    selection: safe(() => {
      if (!isRec(r.selection)) return null;
      const sel = r.selection;
      return {
        policyVersion: str(sel.policy_version),
        evidenceCutoff: str(sel.evidence_cutoff),
        slots: arr(sel.slots).flatMap((raw) => (isRec(raw) ? [{
          slotIndex: int(raw.slot_index) ?? 0,
          roundNumber: int(raw.round_number),
          slotPublicCategory: readPublicCategory(raw.slot_public_category),
          questionResultIds: ids(raw.question_result_ids),
        }] : [])),
      };
    }, null),
  };
}
