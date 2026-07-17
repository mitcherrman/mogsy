/** Deterministic fixtures matching the E1.4 backend projections. */

import {
  DsaHistory,
  DsaResolution,
  DsaResults,
  DsaRun,
  DsaToday,
} from "./dailyScoreAttackTypes";

export const todayFixture: DsaToday = {
  schema_version: "daily_score_attack.today.v1",
  enabled: true,
  challenge_date: "2026-07-17",
  challenge_version: 1,
  rules_version: 1,
  question_count: 30,
  run_duration_seconds: 90,
  seconds_until_reset: 43_200,
  official_run: null,
  auth_required_for_official: true,
  practice_available: true,
  legacy_completed_today: false,
  daily_streak: 0,
};

export function activeRunFixture(overrides: Partial<DsaRun> = {}): DsaRun {
  return {
    schema_version: "daily_score_attack.run.v1",
    run_id: "run-1",
    official: true,
    status: "active",
    challenge_date: "2026-07-17",
    challenge_version: 1,
    rules_version: 1,
    started_at: "2026-07-17T12:00:00.000000+00:00",
    expires_at: "2026-07-17T12:01:30.000000+00:00",
    remaining_ms: 90_000,
    total_score: 0,
    combo: 0,
    correct_count: 0,
    incorrect_count: 0,
    presented_count: 1,
    answered_count: 0,
    highest_combo: 0,
    integrity_status: "ok",
    sequence: 1,
    question: {
      sequence: 1,
      question_id: 101,
      question_text: "Which item grants Ability Power?",
      choices: ["Rabadon's Deathcap", "Infinity Edge", "Warmog's Armor", "Trinity Force"],
      difficulty_label: "easy",
      category: "Items",
      image_path: null,
    },
    ...overrides,
  };
}

export function terminalRunFixture(overrides: Partial<DsaRun> = {}): DsaRun {
  return {
    schema_version: "daily_score_attack.run.v1",
    run_id: "run-1",
    official: true,
    status: "expired",
    challenge_date: "2026-07-17",
    challenge_version: 1,
    rules_version: 1,
    started_at: "2026-07-17T12:00:00.000000+00:00",
    expires_at: "2026-07-17T12:01:30.000000+00:00",
    remaining_ms: 0,
    total_score: 200,
    combo: 0,
    correct_count: 1,
    incorrect_count: 0,
    presented_count: 2,
    answered_count: 1,
    highest_combo: 1,
    integrity_status: "ok",
    completion_reason: "timer_expired",
    participated: true,
    bonus_xp_awarded: true,
    streak_awarded: true,
    ...overrides,
  };
}

export function resolutionFixture(overrides: Partial<DsaResolution> = {}): DsaResolution {
  return {
    schema_version: "daily_score_attack.answer_resolution.v1",
    run_id: "run-1",
    sequence: 1,
    is_correct: true,
    selected_index: 0,
    correct_index: 0,
    explanation: "Deathcap is the flagship AP item.",
    base_score: 100,
    speed_bonus: 100,
    multiplier: { num: 1, den: 1 },
    combo_before: 0,
    combo_after: 1,
    awarded_score: 200,
    already_resolved: false,
    conflicting_retry: false,
    run: activeRunFixture({
      sequence: 2,
      total_score: 200,
      combo: 1,
      correct_count: 1,
      answered_count: 1,
      presented_count: 2,
      highest_combo: 1,
      question: {
        sequence: 2,
        question_id: 102,
        question_text: "Which item grants Attack Damage?",
        choices: ["Rod of Ages", "Infinity Edge", "Sunfire Aegis", "Rylai's"],
        difficulty_label: "medium",
        category: "Items",
        image_path: null,
      },
    }),
    ...overrides,
  };
}

export function resultsFixture(overrides: Partial<DsaResults> = {}): DsaResults {
  return {
    ...terminalRunFixture(),
    schema_version: "daily_score_attack.results.v1",
    breakdown: [
      {
        sequence: 1,
        question_text: "Which item grants Ability Power?",
        choices: ["Rabadon's Deathcap", "Infinity Edge", "Warmog's Armor", "Trinity Force"],
        category: "Items",
        difficulty_label: "easy",
        resolution_reason: "answered",
        selected_index: 0,
        correct_index: 0,
        explanation: "Deathcap is the flagship AP item.",
        is_correct: true,
        base_score: 100,
        speed_bonus: 100,
        combo_after: 1,
        awarded_score: 200,
      },
      {
        sequence: 2,
        question_text: "Which item grants Attack Damage?",
        choices: ["Rod of Ages", "Infinity Edge", "Sunfire Aegis", "Rylai's"],
        category: "Items",
        difficulty_label: "medium",
        resolution_reason: "run_expired",
        selected_index: null,
        correct_index: 1,
        explanation: null,
        is_correct: false,
        base_score: 125,
        speed_bonus: 0,
        combo_after: 0,
        awarded_score: 0,
      },
    ],
    ...overrides,
  } as DsaResults;
}

export const historyFixture: DsaHistory = {
  schema_version: "daily_score_attack.history.v1",
  entries: [
    {
      challenge_date: "2026-07-17",
      score: 200,
      correct_count: 1,
      answered_count: 1,
      highest_combo: 1,
      completion_reason: "timer_expired",
    },
  ],
  personal_best: { challenge_date: "2026-07-17", score: 200 },
  daily_streak: 1,
};
