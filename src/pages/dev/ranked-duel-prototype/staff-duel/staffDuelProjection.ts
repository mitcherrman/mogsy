// ---------------------------------------------------------------------------
// Pure projection: staff-duel session state -> neutral ranked-core view
// contracts. This is the staff CONTROLLER layer — it maps and annotates, but
// computes no combat value. The backend remains authoritative for every
// number that reaches these views.
// ---------------------------------------------------------------------------

import {
  combatantViewsFromPlayers,
  CombatantViews,
  questionViewFromPublicQuestion,
} from "@/lib/ranked-core/adapters/adaptToViews";
import {
  permissionsForSubmissionPhase,
  restrictPermissions,
} from "@/lib/ranked-core/permissions";
import { remainingSeconds } from "@/lib/ranked-core/timerMath";
import {
  InteractionPermissions,
  QuestionView,
  SubmissionPhase,
  TimerView,
} from "@/lib/ranked-core/viewTypes";
import { PublicQuestion, PublicRoundView } from "./rankedDuelTypes";

/**
 * Combatant views for the staff arena.
 *
 * KNOWN LIMITATION (explicit, staff-only): the backend public projection
 * carries no max-HP field, and the join-by-token flow has no access to the
 * creation payload's starting_hp, so maxHp here is the session's observed
 * high-water mark. This is a staff display pragmatic, NOT the canonical
 * mechanism — a public client must source trusted starting HP (or a future
 * backend max_hp field). We never fabricate a value beyond what was observed.
 */
export function projectStaffCombatants(
  publicRound: PublicRoundView,
  viewerPlayerId: string,
  observedMaxHp: Record<string, number>,
): CombatantViews {
  const identities: Record<string, { name: string; tag?: string }> = {};
  for (const p of publicRound.players) {
    identities[p.playerId] = {
      name: p.playerId,
      tag: p.playerId === viewerPlayerId ? `${p.classId} · you` : p.classId,
    };
  }
  const maxHpByPlayerId: Record<string, number> = {};
  for (const p of publicRound.players) {
    const observed = observedMaxHp[p.playerId];
    if (observed !== undefined) maxHpByPlayerId[p.playerId] = Math.max(observed, p.hp);
  }
  return combatantViewsFromPlayers(publicRound.players, {
    viewerPlayerId,
    identities,
    maxHpByPlayerId,
  });
}

/** Display countdown from the backend's shared deadline. Never resolves. */
export function projectStaffTimer(
  activeRound: PublicRoundView["activeRound"],
  nowMs: number,
): TimerView | null {
  if (!activeRound || !activeRound.activeDeadline) return null;
  // No server remaining_ms exists on this projection, so skew is 0 and the
  // backend deadline is trusted directly (it is authoritative regardless).
  const remaining = remainingSeconds(activeRound.activeDeadline, 0, nowMs);
  return {
    durationSeconds: activeRound.durationSeconds,
    remainingSeconds: remaining,
    paused: false, // live play never pauses
    urgent: remaining > 0 && remaining <= 5,
    modifierNotices: activeRound.pressureApplied
      ? ["-5s first-answer pressure applied"]
      : undefined,
  };
}

export interface StaffPermissionInputs {
  /** Local UI phase; "locked" once the backend confirms the submission. */
  phase: SubmissionPhase;
  /** Round active + private projection current + not yet submitted. */
  inputOpen: boolean;
  /** A command request is in flight — everything pauses until it settles. */
  submitting: boolean;
}

export function projectStaffPermissions({
  phase,
  inputOpen,
  submitting,
}: StaffPermissionInputs): InteractionPermissions {
  const base = permissionsForSubmissionPhase(phase, inputOpen);
  if (!submitting) return base;
  return restrictPermissions(base, {
    canSelectAnswer: false,
    canChangeAnswer: false,
    canSelectAbility: false,
    canReviewSubmission: false,
    canConfirmSubmission: false,
    disabledReasons: { submitting: "Submitting…" },
  });
}

export function projectStaffQuestion(question: PublicQuestion): QuestionView {
  return questionViewFromPublicQuestion(question);
}

/**
 * Labels that appear more than once in a question. The canonical AnswerGrid
 * resolves clicks by label internally, so duplicates would be ambiguous —
 * the arena surfaces a staff warning instead of silently mis-mapping. The
 * exercised staff bank has unique options per question.
 */
export function duplicateOptionLabels(question: QuestionView): string[] {
  const seen = new Map<string, number>();
  for (const option of question.options) {
    seen.set(option.label, (seen.get(option.label) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([label]) => label);
}
