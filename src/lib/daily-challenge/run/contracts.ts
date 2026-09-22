/**
 * DCMOD-E — THE DAILY RUN CONTRACT, as the frontend expects it from DCMOD-B.
 *
 * The Daily Challenge is a PARENT RUN of sequential stages. Each playable stage
 * is a canonical Bot Ranked CHILD MATCH; the parent never serves a question.
 * This file is the narrow frontend view of that parent, plus the reader that
 * turns B's snake_case wire snapshot into it.
 *
 * WRITTEN AGAINST A CONTRACT, NOT AGAINST B's CODE. B is being built
 * concurrently. The base shape below matches B's `snapshot()` (schema 1); the
 * fields marked "B+" are what this presentation additionally needs and are
 * read tolerantly — absent reads as null, and the screen omits what it does
 * not know rather than inventing it. `DCMOD_E_HANDOFF.md` lists them.
 *
 * INVARIANTS THE READER ENFORCES (a snapshot that breaks one is refused):
 *   * stages are in `stage_index` order, contiguous from 0;
 *   * there is exactly one Review stage and it is the LAST stage;
 *   * an active run names a current stage that exists; a completed one names none.
 */

export type DailyStageKind =
  | "standard" | "time_trial" | "survival" | "weak_areas" | "review";

/** The reusable gameplay rulesets (DCMOD-A). Special stages carry one too. */
export type DailyRulesetId = "standard" | "time_trial" | "survival";

export type DailyStageStatus =
  | "pending" | "launching" | "in_progress" | "completed" | "skipped";

export type DailyRunStatus = "active" | "completed";

/** `perfect` = Review had nothing to review, so it was skipped. */
export type DailyRunOutcome = "reviewed" | "perfect";

export interface DailyRuleset {
  id: DailyRulesetId;
  /** Time Trial's whole active-answer bank. */
  timeBankMs: number | null;
  /** Survival's mistake allowance. */
  maxStrikes: number | null;
}

/** What the stage is ABOUT (DCMOD-C): "Champion Mastery" / "Ahri". */
export interface DailyStageContent {
  title: string;
  focus: string | null;
}

/**
 * B+ — the Time Trial bank, AS THE SERVER LAST COMPUTED IT.
 *
 * `remainingMs` is authoritative at `asOf` (server time). `draining` says
 * whether, at `asOf`, the player had an answerable question — the only time
 * the bank spends. The client never decrements it on its own authority; see
 * `projectTimeBank`.
 */
export interface DailyTimeBank {
  totalMs: number;
  remainingMs: number;
  asOf: string;
  draining: boolean;
  /**
   * The active question's own server instants (DCMOD integration). A reading
   * taken during a lead-in says `draining: false`; these let the projection
   * start the drain exactly when the question became answerable instead of
   * freezing until some later re-read. Null when unknown.
   */
  answerableAt: string | null;
  deadline: string | null;
  answered: boolean;
}

/** B+ — Survival's mistakes. A count, never health. */
export interface DailyStrikes {
  used: number;
  max: number;
}

/** B+ — the ACTIVE stage's live ruleset state. Null when there is none. */
export interface DailyStageLive {
  timeBank: DailyTimeBank | null;
  strikes: DailyStrikes | null;
}

/** Why a stage ended: the content ran out, or the ruleset ended it. */
export type DailyStageEnd = "completed" | "time_bank_exhausted" | "strikes_exhausted";

/** B+ — a finished stage's summary. Numbers the server settled, never recomputed. */
export interface DailyStageResult {
  correct: number;
  answered: number;
  score: number | null;
  endedBy: DailyStageEnd;
  /** Mistakes carried into Review from this stage. */
  misses: number;
}

export interface DailyStage {
  index: number;
  id: string;
  kind: DailyStageKind;
  ruleset: DailyRuleset | null;
  content: DailyStageContent | null;
  status: DailyStageStatus;
  childMatchId: string | null;
  live: DailyStageLive | null;
  result: DailyStageResult | null;
}

export interface DailyRun {
  runId: string;
  planDate: string;
  status: DailyRunStatus;
  outcome: DailyRunOutcome | null;
  currentStageIndex: number | null;
  /** B+ — server clock at projection, for skew. Null → no skew correction. */
  serverNow: string | null;
  stages: DailyStage[];
  reviewItemCount: number;
}

// ── derived views (never stored) ────────────────────────────────────────────

export function currentStage(run: DailyRun): DailyStage | null {
  if (run.status !== "active" || run.currentStageIndex === null) return null;
  return run.stages[run.currentStageIndex] ?? null;
}

/** The child match the player should be in right now, or null. */
export function activeChildMatchId(run: DailyRun): string | null {
  const stage = currentStage(run);
  return stage && stage.status === "in_progress" ? stage.childMatchId : null;
}

export function completedStages(run: DailyRun): DailyStage[] {
  return run.stages.filter((s) => s.status === "completed" || s.status === "skipped");
}

export function isPerfect(run: DailyRun): boolean {
  return run.status === "completed" && run.outcome === "perfect";
}

export function reviewStage(run: DailyRun): DailyStage {
  return run.stages[run.stages.length - 1];
}

// ── the reader ──────────────────────────────────────────────────────────────

export class DailyRunParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyRunParseError";
  }
}

type Rec = Record<string, unknown>;
const fail = (m: string): never => { throw new DailyRunParseError(`daily run: ${m}`); };
const rec = (v: unknown, l: string): Rec =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Rec : fail(`${l} must be an object`));
const str = (v: unknown, l: string): string => (typeof v === "string" ? v : fail(`${l} must be a string`));
const optStr = (v: unknown, l: string): string | null =>
  (v === null || v === undefined ? null : str(v, l));
const int = (v: unknown, l: string): number =>
  (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : fail(`${l} must be a non-negative integer`));
const optInt = (v: unknown, l: string): number | null =>
  (v === null || v === undefined ? null : int(v, l));
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], l: string): T =>
  (allowed.includes(v as T) ? v as T : fail(`${l} must be one of ${allowed.join("|")}`));

const KINDS = ["standard", "time_trial", "survival", "weak_areas", "review"] as const;
const RULESETS = ["standard", "time_trial", "survival"] as const;
const STATUSES = ["pending", "launching", "in_progress", "completed", "skipped"] as const;
const ENDS = ["completed", "time_bank_exhausted", "strikes_exhausted"] as const;

function readRuleset(raw: Rec, l: string): DailyRuleset | null {
  // B+ carries the frozen spec as `ruleset`; B's base shape has only the id.
  if (raw.ruleset !== null && raw.ruleset !== undefined) {
    const r = rec(raw.ruleset, `${l}.ruleset`);
    return {
      id: oneOf(r.ruleset_id, RULESETS, `${l}.ruleset.ruleset_id`),
      timeBankMs: optInt(r.time_bank_ms, `${l}.ruleset.time_bank_ms`),
      maxStrikes: optInt(r.max_strikes, `${l}.ruleset.max_strikes`),
    };
  }
  if (raw.ruleset_id === null || raw.ruleset_id === undefined) return null;
  return { id: oneOf(raw.ruleset_id, RULESETS, `${l}.ruleset_id`), timeBankMs: null, maxStrikes: null };
}

function readLive(v: unknown, l: string): DailyStageLive | null {
  if (v === null || v === undefined) return null;
  const r = rec(v, l);
  let timeBank: DailyTimeBank | null = null;
  if (r.time_bank !== null && r.time_bank !== undefined) {
    const b = rec(r.time_bank, `${l}.time_bank`);
    timeBank = {
      totalMs: int(b.total_ms, `${l}.time_bank.total_ms`),
      remainingMs: int(b.remaining_ms, `${l}.time_bank.remaining_ms`),
      asOf: str(b.as_of, `${l}.time_bank.as_of`),
      draining: b.draining === true,
      answerableAt: optStr(b.answerable_at, `${l}.time_bank.answerable_at`),
      deadline: optStr(b.deadline, `${l}.time_bank.deadline`),
      answered: b.answered === true,
    };
  }
  let strikes: DailyStrikes | null = null;
  if (r.strikes !== null && r.strikes !== undefined) {
    const s = rec(r.strikes, `${l}.strikes`);
    strikes = { used: int(s.used, `${l}.strikes.used`), max: int(s.max, `${l}.strikes.max`) };
  }
  return { timeBank, strikes };
}

function readResult(v: unknown, l: string): DailyStageResult | null {
  if (v === null || v === undefined) return null;
  const r = rec(v, l);
  return {
    correct: int(r.correct, `${l}.correct`),
    answered: int(r.answered, `${l}.answered`),
    score: r.score === null || r.score === undefined
      ? null : (typeof r.score === "number" ? r.score : fail(`${l}.score must be a number`)),
    endedBy: r.ended_by === undefined ? "completed" : oneOf(r.ended_by, ENDS, `${l}.ended_by`),
    misses: r.misses === undefined ? 0 : int(r.misses, `${l}.misses`),
  };
}

function readStage(v: unknown, i: number): DailyStage {
  const l = `stages[${i}]`;
  const r = rec(v, l);
  const content = r.content === null || r.content === undefined ? null : (() => {
    const c = rec(r.content, `${l}.content`);
    return { title: str(c.title, `${l}.content.title`), focus: optStr(c.focus, `${l}.content.focus`) };
  })();
  return {
    index: int(r.stage_index, `${l}.stage_index`),
    id: str(r.stage_id, `${l}.stage_id`),
    kind: oneOf(r.kind, KINDS, `${l}.kind`),
    ruleset: readRuleset(r, l),
    content,
    status: oneOf(r.status, STATUSES, `${l}.status`),
    childMatchId: optStr(r.child_match_id, `${l}.child_match_id`),
    live: readLive(r.live, `${l}.live`),
    result: readResult(r.result, `${l}.result`),
  };
}

/** B's snapshot → `DailyRun`. Throws `DailyRunParseError` on a broken invariant. */
export function readDailyRun(json: unknown): DailyRun {
  const r = rec(json, "run");
  if (r.schema_version !== 1) fail("unsupported schema_version");
  const stagesRaw = Array.isArray(r.stages) ? r.stages : fail("stages must be an array");
  const stages = stagesRaw.map(readStage).sort((a, b) => a.index - b.index);
  if (stages.length === 0) fail("a run has at least one stage");
  stages.forEach((s, i) => { if (s.index !== i) fail("stage indexes must be contiguous from 0"); });
  const reviews = stages.filter((s) => s.kind === "review");
  if (reviews.length !== 1 || stages[stages.length - 1].kind !== "review") {
    fail("Review must be the one and final stage");
  }
  const status = oneOf(r.status, ["active", "completed"] as const, "status");
  const currentStageIndex = optInt(r.current_stage_index, "current_stage_index");
  if (status === "active" && (currentStageIndex === null || currentStageIndex >= stages.length)) {
    fail("an active run names a current stage that exists");
  }
  const outcome = r.outcome === null || r.outcome === undefined
    ? null : oneOf(r.outcome, ["reviewed", "perfect"] as const, "outcome");
  return {
    runId: str(r.run_id, "run_id"),
    planDate: str(r.plan_date, "plan_date"),
    status,
    outcome,
    currentStageIndex: status === "active" ? currentStageIndex : null,
    serverNow: optStr(r.server_now, "server_now"),
    stages,
    reviewItemCount: Array.isArray(r.review_items) ? r.review_items.length : 0,
  };
}

/** `GET /today` → `{ run: snapshot | null }`. */
export function readDailyToday(json: unknown): DailyRun | null {
  const r = rec(json, "today");
  return r.run === null || r.run === undefined ? null : readDailyRun(r.run);
}
