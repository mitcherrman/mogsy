/**
 * Daily Challenge test fixtures (DC1 Phase 5).
 *
 * Built as RAW backend payloads and pushed through the real parsers, so a
 * fixture that drifts from the contract fails at the boundary exactly as a
 * real response would. A hand-written `DcRun` object would type-check forever
 * while describing something the server can no longer send.
 */

import { readAnswer, readRun, readToday } from "@/lib/daily-challenge/contracts";
import type { DcAnswerAck, DcRun, DcToday } from "@/lib/daily-challenge/contracts";

export const RUN_ID = "dcr_test0000000000000001";
export const DATE = "2026-08-20";

type Raw = Record<string, unknown>;

export function rawOption(index: number, label: string, eliminated = false): Raw {
  return { index, eliminated, label, media: null, side: null, entity_id: null };
}

export interface CardSpec {
  sequence: number;
  kind?: "quiz" | "meta_reflex";
  optionCount?: number;
  eliminated?: number[];
  scoreLocked?: boolean;
  scoreOutcome?: "correct" | "wrong_answer" | "timeout" | null;
  activated?: boolean;
  timerEndsAt?: string | null;
  resolved?: boolean;
  correctIndex?: number;
  firstAttemptCorrect?: boolean;
  attemptCount?: number;
  awardedScore?: number;
  points?: number;
  prompt?: string;
}

export function rawCard(spec: CardSpec): Raw {
  const kind = spec.kind ?? "quiz";
  const count = spec.optionCount ?? 4;
  const eliminated = spec.eliminated ?? [];
  const base: Raw = {
    sequence: spec.sequence,
    kind,
    tier: kind === "meta_reflex" ? "reflex" : "medium",
    prompt: spec.prompt ?? `Card ${spec.sequence} prompt?`,
    category: kind === "meta_reflex" ? null : "cooldowns",
    media: null,
    options: Array.from({ length: count }, (_, i) =>
      rawOption(i, `Option ${String.fromCharCode(65 + i)}`, eliminated.includes(i))),
    eliminated,
    points: spec.points ?? 100,
    score_locked: spec.scoreLocked ?? false,
    score_outcome: spec.scoreOutcome ?? null,
    awarded_score: spec.awardedScore ?? 0,
    attempt_count: spec.attemptCount ?? 0,
    activated: spec.activated ?? false,
    requires_activation: kind === "meta_reflex",
    timer: spec.timerEndsAt
      ? { ends_at: spec.timerEndsAt, remaining_ms: 6000, server_now: `${DATE}T12:00:00.000000+00:00` }
      : null,
    resolved: spec.resolved ?? false,
    resolved_at: spec.resolved ? `${DATE}T12:05:00.000000+00:00` : null,
  };
  if (!spec.resolved) return base;
  return {
    ...base,
    correct_index: spec.correctIndex ?? 0,
    explanation: `Because card ${spec.sequence} says so.`,
    first_attempt_correct: spec.firstAttemptCorrect ?? true,
    attempts: [],
    reveal: null,
  };
}

export interface RunSpec {
  cards: CardSpec[];
  cardCount?: number;
  currentSequence?: number | null;
  status?: "active" | "completed";
  score?: number;
  maxScore?: number;
  resolvedCount?: number;
  firstAttemptCorrect?: number;
  firstAttemptMiss?: number;
  reflexCorrect?: number;
  reflexTotal?: number;
  timeouts?: number;
  perfectReflexBlocks?: number;
  accuracyBp?: number | null;
  result?: Raw | null;
  serverNow?: string;
}

export function rawRun(spec: RunSpec): Raw {
  const cards = spec.cards.map(rawCard);
  const resolved = spec.resolvedCount ?? spec.cards.filter((c) => c.resolved).length;
  const cardCount = spec.cardCount ?? Math.max(spec.cards.length, 12);
  const firstCorrect = spec.firstAttemptCorrect
    ?? spec.cards.filter((c) => c.resolved && (c.firstAttemptCorrect ?? true)).length;
  const miss = spec.firstAttemptMiss
    ?? spec.cards.filter((c) => c.scoreLocked && !(c.firstAttemptCorrect ?? true)).length;
  const settled = firstCorrect + miss;
  return {
    run_id: RUN_ID,
    official: true,
    status: spec.status ?? "active",
    challenge_date: DATE,
    challenge_version: 1,
    rules_version: 1,
    started_at: `${DATE}T12:00:00.000000+00:00`,
    completed_at: spec.status === "completed" ? `${DATE}T12:30:00.000000+00:00` : null,
    card_count: cardCount,
    current_sequence: spec.currentSequence === undefined
      ? (spec.cards.find((c) => !c.resolved)?.sequence ?? null)
      : spec.currentSequence,
    resolved_count: resolved,
    score: spec.score ?? 0,
    max_score: spec.maxScore ?? 1250,
    first_attempt_correct_count: firstCorrect,
    server_now: spec.serverNow ?? `${DATE}T12:00:00.000000+00:00`,
    summary: {
      card_count: cardCount,
      standard_card_count: cardCount - (spec.reflexTotal ?? 5),
      standard_first_attempt_correct: Math.max(0, firstCorrect - (spec.reflexCorrect ?? 0)),
      reflex_card_count: spec.reflexTotal ?? 5,
      reflex_first_attempt_correct: spec.reflexCorrect ?? 0,
      timeout_count: spec.timeouts ?? 0,
      reflex_block_count: 1,
      perfect_reflex_blocks: spec.perfectReflexBlocks ?? 0,
      first_attempt_correct_count: firstCorrect,
      first_attempt_miss_count: miss,
      resolved_count: resolved,
      first_attempt_accuracy_bp: spec.accuracyBp === undefined
        ? (settled ? Math.round((firstCorrect * 10_000) / settled) : null)
        : spec.accuracyBp,
    },
    result: spec.result ?? null,
    cards,
  };
}

export function rawResult(overrides: Raw = {}): Raw {
  return {
    score_percent_bp: 9_200,
    score_percent: 92,
    grade: "A",
    reward_rules_version: 1,
    awarded_at: `${DATE}T12:30:00.000000+00:00`,
    rewards: {
      xp_from_answers: 150,
      completion_bonus_xp: 50,
      total_xp: 200,
      streak_before: 2,
      streak_after: 3,
      rewards_awarded: true,
      claimed_at: null,
      rewards_claimed: false,
      ...(overrides.rewards as Raw ?? {}),
    },
    ...overrides,
  };
}

export function rawToday(
  { run = null, cardCount = 12, theme = "Cooldowns and haste" }:
  { run?: Raw | null; cardCount?: number; theme?: string | null } = {},
): Raw {
  return {
    challenge: {
      challenge_date: DATE,
      challenge_version: 1,
      rules_version: 1,
      plan_version: 1,
      theme,
      card_count: cardCount,
      max_score: 1250,
      content_fingerprint: "fingerprint",
      // 7 standard, then a five-card Meta Reflex block — the shape the plan
      // actually produces. Positions matter to the timeline's bracket.
      structure: Array.from({ length: cardCount }, (_, i) => ({
        sequence: i + 1,
        kind: i >= 6 && i <= 10 ? "meta_reflex" : "quiz",
        tier: i >= 6 && i <= 10 ? "reflex" : "medium",
        points: 100,
      })),
    },
    run,
    server_now: `${DATE}T12:00:00.000000+00:00`,
  };
}

export function rawTodayRun(overrides: Raw = {}): Raw {
  return {
    run_id: RUN_ID,
    status: "active",
    resumable: true,
    started_at: `${DATE}T12:00:00.000000+00:00`,
    completed_at: null,
    current_sequence: 1,
    resolved_count: 0,
    card_count: 12,
    score: 0,
    max_score: 1250,
    ...overrides,
  };
}

export function rawAnswer(event: Raw, run: Raw): Raw {
  return {
    run,
    event: {
      phase: "scored",
      correct: true,
      resolved: true,
      score_locked_now: true,
      score_delta: 100,
      eliminated_index: null,
      ...event,
    },
  };
}

// ── parsed helpers ─────────────────────────────────────────────────────────

export const parseRun = (raw: Raw): DcRun => readRun(raw);
export const parseToday = (raw: Raw): DcToday => readToday(raw);
export const parseAnswer = (raw: Raw): DcAnswerAck => readAnswer(raw);

/** A pristine run parked on card 1. */
export function freshRun(): DcRun {
  return parseRun(rawRun({ cards: [{ sequence: 1 }] }));
}
