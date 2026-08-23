/**
 * Daily Challenge v2 transport contracts (DC1 Phase 5).
 *
 * Written from the backend's OpenAPI document at DC1 Phase 4 (`1e3146e`), not
 * from the legacy `/api/quiz/daily-challenge` types, which describe a different
 * product: one attempt per question per day, no retry, no Meta Reflex block.
 * Nothing here is shared with those.
 *
 * WHY EVERY PAYLOAD IS PARSED RATHER THAN CAST
 * ────────────────────────────────────────────
 * `tsconfig.app.json` sets `strict: false`, so a discriminated union does NOT
 * narrow at the call site — `card.resolved === true` will not give you
 * `correct_index`, and worse, reading `correct_index` off an unresolved card
 * type-checks fine and is `undefined` at runtime. A cast would therefore be a
 * decoration. These readers do the narrowing at the boundary instead, and the
 * card reader returns a tagged object whose two shapes are separate TYPES that
 * a caller must switch on.
 *
 * THE DISCLOSURE RULE, RESTATED ON THE CLIENT
 * ───────────────────────────────────────────
 * An unresolved card has no answer field at all — the backend's response model
 * is `extra="forbid"` and its unresolved variant declares none. So
 * `DcUnresolvedCard` has no `correctIndex` and no `explanation`, and there is
 * no optional field to accidentally read. A component that wants the answer
 * must hold a `DcResolvedCard`, which only a resolved card produces.
 */

export type DcCardKind = "quiz" | "meta_reflex";
export type DcRunStatus = "active" | "completed";
export type DcScoreOutcome = "correct" | "wrong_answer" | "timeout";
export type DcAttemptPhase = "scored" | "learning";
export type DcGrade = "S" | "A" | "B" | "C" | "D";

export class DcParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DcParseError";
  }
}

// ── primitives ─────────────────────────────────────────────────────────────

function obj(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DcParseError(`${where}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function str(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== "string") throw new DcParseError(`${where}.${key}: expected a string`);
  return value;
}

function optStr(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

function num(source: Record<string, unknown>, key: string, where: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DcParseError(`${where}.${key}: expected a number`);
  }
  return value;
}

function optNum(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(source: Record<string, unknown>, key: string, where: string): boolean {
  const value = source[key];
  if (typeof value !== "boolean") throw new DcParseError(`${where}.${key}: expected a boolean`);
  return value;
}

function list(source: Record<string, unknown>, key: string, where: string): unknown[] {
  const value = source[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new DcParseError(`${where}.${key}: expected an array`);
  return value;
}

function oneOf<T extends string>(
  value: unknown, allowed: readonly T[], where: string,
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new DcParseError(`${where}: expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

// ── cards ──────────────────────────────────────────────────────────────────

export interface DcOption {
  index: number;
  eliminated: boolean;
  /** A Meta Reflex recognition side carries NO label: the art is the question. */
  label: string | null;
  /** Asset PATH, never a structure. */
  media: string | null;
  side: string | null;
  entityId: string | null;
}

export interface DcTimer {
  endsAt: string;
  remainingMs: number;
  /** The server's clock at the moment it answered — the skew reference. */
  serverNow: string;
}

export interface DcAttempt {
  attemptIndex: number;
  phase: DcAttemptPhase;
  selectedIndex: number;
  isCorrect: boolean;
}

interface DcCardBase {
  sequence: number;
  kind: DcCardKind;
  tier: string;
  prompt: string;
  category: string | null;
  media: Record<string, unknown> | null;
  options: DcOption[];
  eliminated: number[];
  points: number;
  scoreLocked: boolean;
  scoreOutcome: DcScoreOutcome | null;
  awardedScore: number;
  attemptCount: number;
  activated: boolean;
  requiresActivation: boolean;
  timer: DcTimer | null;
}

export interface DcUnresolvedCard extends DcCardBase {
  resolved: false;
}

export interface DcResolvedCard extends DcCardBase {
  resolved: true;
  resolvedAt: string | null;
  correctIndex: number;
  explanation: string | null;
  firstAttemptCorrect: boolean;
  attempts: DcAttempt[];
  reveal: Record<string, unknown> | null;
}

export type DcCard = DcUnresolvedCard | DcResolvedCard;

function readOption(raw: unknown, where: string): DcOption {
  const o = obj(raw, where);
  return {
    index: num(o, "index", where),
    eliminated: bool(o, "eliminated", where),
    label: optStr(o, "label"),
    media: optStr(o, "media"),
    side: optStr(o, "side"),
    entityId: optStr(o, "entity_id"),
  };
}

function readTimer(raw: unknown): DcTimer | null {
  if (raw === null || raw === undefined) return null;
  const t = obj(raw, "timer");
  return {
    endsAt: str(t, "ends_at", "timer"),
    remainingMs: num(t, "remaining_ms", "timer"),
    serverNow: str(t, "server_now", "timer"),
  };
}

function readCard(raw: unknown, where: string): DcCard {
  const c = obj(raw, where);
  const base: DcCardBase = {
    sequence: num(c, "sequence", where),
    kind: oneOf(c.kind, ["quiz", "meta_reflex"] as const, `${where}.kind`),
    tier: str(c, "tier", where),
    prompt: str(c, "prompt", where),
    category: optStr(c, "category"),
    media: c.media && typeof c.media === "object" && !Array.isArray(c.media)
      ? (c.media as Record<string, unknown>) : null,
    options: list(c, "options", where).map((o, i) => readOption(o, `${where}.options[${i}]`)),
    eliminated: list(c, "eliminated", where).filter((v): v is number => typeof v === "number"),
    points: num(c, "points", where),
    scoreLocked: bool(c, "score_locked", where),
    scoreOutcome: c.score_outcome === null || c.score_outcome === undefined
      ? null
      : oneOf(c.score_outcome, ["correct", "wrong_answer", "timeout"] as const,
        `${where}.score_outcome`),
    awardedScore: num(c, "awarded_score", where),
    attemptCount: num(c, "attempt_count", where),
    activated: bool(c, "activated", where),
    requiresActivation: bool(c, "requires_activation", where),
    timer: readTimer(c.timer),
  };
  if (c.resolved !== true) return { ...base, resolved: false };
  return {
    ...base,
    resolved: true,
    resolvedAt: optStr(c, "resolved_at"),
    correctIndex: num(c, "correct_index", where),
    explanation: optStr(c, "explanation"),
    firstAttemptCorrect: bool(c, "first_attempt_correct", where),
    attempts: list(c, "attempts", where).map((a, i) => {
      const at = obj(a, `${where}.attempts[${i}]`);
      return {
        attemptIndex: num(at, "attempt_index", where),
        phase: oneOf(at.phase, ["scored", "learning"] as const, `${where}.attempts[${i}].phase`),
        selectedIndex: num(at, "selected_index", where),
        isCorrect: bool(at, "is_correct", where),
      };
    }),
    reveal: c.reveal && typeof c.reveal === "object" && !Array.isArray(c.reveal)
      ? (c.reveal as Record<string, unknown>) : null,
  };
}

// ── run ────────────────────────────────────────────────────────────────────

export interface DcSummary {
  cardCount: number;
  standardCardCount: number;
  standardFirstAttemptCorrect: number;
  reflexCardCount: number;
  reflexFirstAttemptCorrect: number;
  timeoutCount: number;
  reflexBlockCount: number;
  perfectReflexBlocks: number;
  firstAttemptCorrectCount: number;
  firstAttemptMissCount: number;
  resolvedCount: number;
  /** Basis points over SETTLED cards; null before the first card settles. */
  firstAttemptAccuracyBp: number | null;
}

export interface DcRewards {
  xpFromAnswers: number;
  completionBonusXp: number;
  totalXp: number;
  streakBefore: number;
  streakAfter: number;
  rewardsAwarded: boolean;
  claimedAt: string | null;
  rewardsClaimed: boolean;
}

export interface DcResult {
  /** The AUTHORITY. `scorePercent` beside it is for rendering only. */
  scorePercentBp: number;
  scorePercent: number;
  grade: DcGrade | null;
  rewardRulesVersion: number | null;
  awardedAt: string | null;
  rewards: DcRewards;
}

export interface DcRun {
  runId: string;
  official: boolean;
  status: DcRunStatus;
  challengeDate: string;
  challengeVersion: number;
  rulesVersion: number;
  startedAt: string;
  completedAt: string | null;
  cardCount: number;
  currentSequence: number | null;
  resolvedCount: number;
  score: number;
  maxScore: number;
  firstAttemptCorrectCount: number;
  serverNow: string;
  summary: DcSummary;
  /** Present only once the run is completed AND paid. Never a block of zeroes. */
  result: DcResult | null;
  /** Resolved cards plus the current one. Unreached cards are NOT shipped. */
  cards: DcCard[];
}

function readSummary(raw: unknown): DcSummary {
  const s = obj(raw, "summary");
  return {
    cardCount: num(s, "card_count", "summary"),
    standardCardCount: num(s, "standard_card_count", "summary"),
    standardFirstAttemptCorrect: num(s, "standard_first_attempt_correct", "summary"),
    reflexCardCount: num(s, "reflex_card_count", "summary"),
    reflexFirstAttemptCorrect: num(s, "reflex_first_attempt_correct", "summary"),
    timeoutCount: num(s, "timeout_count", "summary"),
    reflexBlockCount: num(s, "reflex_block_count", "summary"),
    perfectReflexBlocks: num(s, "perfect_reflex_blocks", "summary"),
    firstAttemptCorrectCount: num(s, "first_attempt_correct_count", "summary"),
    firstAttemptMissCount: num(s, "first_attempt_miss_count", "summary"),
    resolvedCount: num(s, "resolved_count", "summary"),
    firstAttemptAccuracyBp: optNum(s, "first_attempt_accuracy_bp"),
  };
}

function readResult(raw: unknown): DcResult | null {
  if (raw === null || raw === undefined) return null;
  const r = obj(raw, "result");
  const w = obj(r.rewards, "result.rewards");
  const grade = optStr(r, "grade");
  return {
    scorePercentBp: num(r, "score_percent_bp", "result"),
    scorePercent: num(r, "score_percent", "result"),
    grade: grade === null ? null
      : oneOf(grade, ["S", "A", "B", "C", "D"] as const, "result.grade"),
    rewardRulesVersion: optNum(r, "reward_rules_version"),
    awardedAt: optStr(r, "awarded_at"),
    rewards: {
      xpFromAnswers: num(w, "xp_from_answers", "result.rewards"),
      completionBonusXp: num(w, "completion_bonus_xp", "result.rewards"),
      totalXp: num(w, "total_xp", "result.rewards"),
      streakBefore: num(w, "streak_before", "result.rewards"),
      streakAfter: num(w, "streak_after", "result.rewards"),
      rewardsAwarded: bool(w, "rewards_awarded", "result.rewards"),
      claimedAt: optStr(w, "claimed_at"),
      rewardsClaimed: w.rewards_claimed === true,
    },
  };
}

export function readRun(raw: unknown): DcRun {
  const r = obj(raw, "run");
  return {
    runId: str(r, "run_id", "run"),
    official: bool(r, "official", "run"),
    status: oneOf(r.status, ["active", "completed"] as const, "run.status"),
    challengeDate: str(r, "challenge_date", "run"),
    challengeVersion: num(r, "challenge_version", "run"),
    rulesVersion: num(r, "rules_version", "run"),
    startedAt: str(r, "started_at", "run"),
    completedAt: optStr(r, "completed_at"),
    cardCount: num(r, "card_count", "run"),
    currentSequence: optNum(r, "current_sequence"),
    resolvedCount: num(r, "resolved_count", "run"),
    score: num(r, "score", "run"),
    maxScore: num(r, "max_score", "run"),
    firstAttemptCorrectCount: num(r, "first_attempt_correct_count", "run"),
    serverNow: str(r, "server_now", "run"),
    summary: readSummary(r.summary),
    result: readResult(r.result),
    cards: list(r, "cards", "run").map((c, i) => readCard(c, `run.cards[${i}]`)),
  };
}

// ── answer ─────────────────────────────────────────────────────────────────

export interface DcAnswerEvent {
  phase: DcAttemptPhase;
  correct: boolean;
  resolved: boolean;
  /** Whether THIS submission closed the scored phase. */
  scoreLockedNow: boolean;
  /** Run-total delta, bonus included. Zero for every retry, forever. */
  scoreDelta: number;
  eliminatedIndex: number | null;
}

export interface DcAnswerAck {
  run: DcRun;
  event: DcAnswerEvent;
}

export function readAnswer(raw: unknown): DcAnswerAck {
  const a = obj(raw, "answer");
  const e = obj(a.event, "answer.event");
  return {
    run: readRun(a.run),
    event: {
      phase: oneOf(e.phase, ["scored", "learning"] as const, "answer.event.phase"),
      correct: bool(e, "correct", "answer.event"),
      resolved: bool(e, "resolved", "answer.event"),
      scoreLockedNow: bool(e, "score_locked_now", "answer.event"),
      scoreDelta: num(e, "score_delta", "answer.event"),
      eliminatedIndex: optNum(e, "eliminated_index"),
    },
  };
}

// ── today ──────────────────────────────────────────────────────────────────

export interface DcStructureEntry {
  sequence: number;
  kind: DcCardKind;
  tier: string;
  points: number;
}

export interface DcChallenge {
  challengeDate: string;
  challengeVersion: number;
  rulesVersion: number;
  planVersion: number;
  theme: string | null;
  cardCount: number;
  maxScore: number;
  contentFingerprint: string;
  /** Kind/tier/price per position. Never a prompt, option, or answer. */
  structure: DcStructureEntry[];
}

export interface DcRunHandle {
  runId: string;
  status: DcRunStatus;
  resumable: boolean;
  startedAt: string;
  completedAt: string | null;
  currentSequence: number | null;
  resolvedCount: number;
  cardCount: number;
  score: number;
  maxScore: number;
}

export interface DcToday {
  challenge: DcChallenge;
  /** The caller's own run for today, or null if they have not started. */
  run: DcRunHandle | null;
  serverNow: string;
}

export function readToday(raw: unknown): DcToday {
  const t = obj(raw, "today");
  const c = obj(t.challenge, "today.challenge");
  const handleRaw = t.run;
  let run: DcRunHandle | null = null;
  if (handleRaw !== null && handleRaw !== undefined) {
    const h = obj(handleRaw, "today.run");
    run = {
      runId: str(h, "run_id", "today.run"),
      status: oneOf(h.status, ["active", "completed"] as const, "today.run.status"),
      resumable: bool(h, "resumable", "today.run"),
      startedAt: str(h, "started_at", "today.run"),
      completedAt: optStr(h, "completed_at"),
      currentSequence: optNum(h, "current_sequence"),
      resolvedCount: num(h, "resolved_count", "today.run"),
      cardCount: num(h, "card_count", "today.run"),
      score: num(h, "score", "today.run"),
      maxScore: num(h, "max_score", "today.run"),
    };
  }
  return {
    challenge: {
      challengeDate: str(c, "challenge_date", "today.challenge"),
      challengeVersion: num(c, "challenge_version", "today.challenge"),
      rulesVersion: num(c, "rules_version", "today.challenge"),
      planVersion: num(c, "plan_version", "today.challenge"),
      theme: optStr(c, "theme"),
      cardCount: num(c, "card_count", "today.challenge"),
      maxScore: num(c, "max_score", "today.challenge"),
      contentFingerprint: str(c, "content_fingerprint", "today.challenge"),
      structure: list(c, "structure", "today.challenge").map((s, i) => {
        const e = obj(s, `today.challenge.structure[${i}]`);
        return {
          sequence: num(e, "sequence", "structure"),
          kind: oneOf(e.kind, ["quiz", "meta_reflex"] as const, "structure.kind"),
          tier: str(e, "tier", "structure"),
          points: num(e, "points", "structure"),
        };
      }),
    },
    run,
    serverNow: str(t, "server_now", "today"),
  };
}

// ── history ────────────────────────────────────────────────────────────────

export interface DcHistoryEntry {
  runId: string;
  challengeDate: string;
  challengeVersion: number;
  status: DcRunStatus;
  completedAt: string | null;
  score: number;
  maxScore: number;
  cardCount: number;
  resolvedCount: number;
  firstAttemptCorrectCount: number;
  /** null for a run that is not finished — never zero, which renders as a real result. */
  scorePercent: number | null;
  grade: DcGrade | null;
  dailyStreak: number | null;
  totalXp: number | null;
}

export interface DcHistory {
  serverNow: string;
  entries: DcHistoryEntry[];
}

export function readHistory(raw: unknown): DcHistory {
  const h = obj(raw, "history");
  return {
    serverNow: str(h, "server_now", "history"),
    entries: list(h, "entries", "history").map((e, i) => {
      const where = `history.entries[${i}]`;
      const entry = obj(e, where);
      const grade = optStr(entry, "grade");
      return {
        runId: str(entry, "run_id", where),
        challengeDate: str(entry, "challenge_date", where),
        challengeVersion: num(entry, "challenge_version", where),
        status: oneOf(entry.status, ["active", "completed"] as const, `${where}.status`),
        completedAt: optStr(entry, "completed_at"),
        score: num(entry, "score", where),
        maxScore: num(entry, "max_score", where),
        cardCount: num(entry, "card_count", where),
        resolvedCount: num(entry, "resolved_count", where),
        firstAttemptCorrectCount: num(entry, "first_attempt_correct_count", where),
        scorePercent: optNum(entry, "score_percent"),
        grade: grade === null ? null
          : oneOf(grade, ["S", "A", "B", "C", "D"] as const, `${where}.grade`),
        dailyStreak: optNum(entry, "daily_streak"),
        totalXp: optNum(entry, "total_xp"),
      };
    }),
  };
}

// ── card helpers ───────────────────────────────────────────────────────────

/**
 * The card the player may act on, or null.
 *
 * `strict: false` means a `card.resolved === true` check does not narrow, so
 * every consumer would otherwise have to trust itself not to read an answer
 * field off an unresolved card. Narrowing once, here, is what makes that
 * impossible rather than merely discouraged.
 */
export function currentCard(run: DcRun): DcUnresolvedCard | DcResolvedCard | null {
  if (run.currentSequence === null) return null;
  return run.cards.find((c) => c.sequence === run.currentSequence) ?? null;
}

export function resolvedCards(run: DcRun): DcResolvedCard[] {
  return run.cards.filter((c): c is DcResolvedCard => c.resolved === true);
}

/** The most recently resolved card, for the reveal beat. */
export function lastResolvedCard(run: DcRun): DcResolvedCard | null {
  const resolved = resolvedCards(run);
  return resolved.length ? resolved[resolved.length - 1] : null;
}
