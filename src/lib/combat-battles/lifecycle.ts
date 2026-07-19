// Combat Sim Battles — presentation helpers (status, copy, formatting).
//
// Pure, presentation-only. The SERVER is authoritative for `status`; nothing
// here decides a lifecycle transition, winner, or score. Countdown targets are
// derived from server timestamps for display and boundary refetch only.

import type {
  PublicBattleStatus, BattleStatus, WinnerSide, PredictionOutcome, Side,
} from "./types";

export const STATUS_LABELS: Record<BattleStatus, string> = {
  draft: "Draft",
  validated: "Validated",
  scheduled: "Upcoming",
  open: "Open",
  locked: "Prediction locked",
  revealed: "Result revealed",
  void: "Void",
};

export const STATUS_ORDER: PublicBattleStatus[] = [
  "open", "scheduled", "locked", "revealed", "void",
];

export function statusBadgeVariant(
  status: BattleStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "open":
      return "default";
    case "revealed":
      return "secondary";
    case "void":
      return "destructive";
    default:
      return "outline";
  }
}

/** The single countdown target relevant to the current status, if any. */
export function nextBoundary(
  status: PublicBattleStatus,
  times: { open_at: string | null; lock_at: string | null; reveal_at: string | null },
): { label: string; at: string } | null {
  switch (status) {
    case "scheduled":
      return times.open_at ? { label: "Predictions open in", at: times.open_at } : null;
    case "open":
      return times.lock_at ? { label: "Predictions lock in", at: times.lock_at } : null;
    case "locked":
      return times.reveal_at ? { label: "Result reveals in", at: times.reveal_at } : null;
    default:
      return null;
  }
}

/** Honest, non-turn-based description of what the simulation measures. */
export const FORMAT_EXPLANATION =
  "Each champion runs a predefined combo independently against the other " +
  "champion's real defenses. This is a deterministic damage comparison — not a " +
  "simultaneous live duel, and the champions are not taking turns.";

/**
 * Map a backend decision_reason code to exact, non-subjective user-facing copy.
 * `left`/`right` are substituted with champion names for readability.
 */
export function decisionReasonCopy(
  reason: string,
  leftName: string,
  rightName: string,
): string {
  const map: Record<string, string> = {
    only_left_reached_lethal: `Only ${leftName} reached lethal damage.`,
    only_right_reached_lethal: `Only ${rightName} reached lethal damage.`,
    both_lethal_left_fewer_actions: `Both reached lethal; ${leftName} required fewer actions.`,
    both_lethal_right_fewer_actions: `Both reached lethal; ${rightName} required fewer actions.`,
    both_lethal_equal_actions: "Both reached lethal in the same number of actions — a draw.",
    both_lethal_action_count_unavailable: "Both reached lethal; action counts were equal — a draw.",
    neither_lethal_left_more_pct: `Neither reached lethal; ${leftName} removed a greater percentage of health.`,
    neither_lethal_right_more_pct: `Neither reached lethal; ${rightName} removed a greater percentage of health.`,
    neither_lethal_equal_pct_within_tolerance: "Neither reached lethal and the health removed was equal within tolerance — a draw.",
  };
  return map[reason] ?? "The deterministic comparison resolved this result.";
}

export function winnerLabel(winner: WinnerSide, leftName: string, rightName: string): string {
  if (winner === "draw") return "Draw";
  return winner === "left" ? leftName : rightName;
}

export const OUTCOME_LABELS: Record<PredictionOutcome, string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  push: "Push",
  void: "Void",
};

export function outcomeCopy(outcome: PredictionOutcome, scoreAwarded: number): string {
  switch (outcome) {
    case "correct":
      return `You backed the winning side. +${scoreAwarded} Arena Score.`;
    case "incorrect":
      return "Your prediction didn't match the result. No Arena Score gained or lost.";
    case "push":
      return "The battle resolved as a draw — a push. No Arena Score was gained or lost.";
    case "void":
      return "This event was voided. No Arena Score was awarded.";
  }
}

export function sideName(
  side: Side,
  leftName: string | null | undefined,
  rightName: string | null | undefined,
): string {
  return side === "left" ? leftName ?? "Left" : rightName ?? "Right";
}

// --- number/time formatting (display only) -------------------------------- //
export function fmtHp(n: number): string {
  return Math.round(n).toLocaleString();
}
export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
