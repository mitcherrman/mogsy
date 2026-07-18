/**
 * Pure projection: public Ranked v2 contract shapes -> canonical ranked-core
 * view contracts consumed by the shared arena. No combat value is computed;
 * this only maps and annotates. Mirrors the staff-duel projection but for the
 * JWT-authenticated public v2 payloads.
 */

import {
  abilityViewsFromPrivatePlayer,
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
  AbilityView,
  InteractionPermissions,
  QuestionView,
  SubmissionPhase,
  TimerView,
} from "@/lib/ranked-core/viewTypes";
import type { PresenceView, PrivatePlayerView, PublicRoundView } from "@/lib/ranked-public/contracts";

/** Combatant views (viewer perspective) with authoritative frozen max HP. */
export function projectCombatants(pub: PublicRoundView, viewerUserId: string): CombatantViews {
  const identities: Record<string, { name: string; tag?: string }> = {};
  const maxHpByPlayerId: Record<string, number> = {};
  for (const p of pub.players) {
    identities[p.playerId] = {
      name: p.playerId === viewerUserId ? "You" : "Opponent",
      tag: p.classId,
    };
    if (p.maxHp !== null) maxHpByPlayerId[p.playerId] = p.maxHp;
  }
  return combatantViewsFromPlayers(pub.players, {
    viewerPlayerId: viewerUserId, identities, maxHpByPlayerId,
  });
}

/** Skew-corrected shared-timer display. Never authoritative — local zero only
 * changes presentation and prompts the next poll. */
export function projectTimer(pub: PublicRoundView, skewMs: number, nowMs: number): TimerView | null {
  const active = pub.activeRound;
  if (!active) return null;
  const remaining = remainingSeconds(active.activeDeadline, skewMs, nowMs);
  return {
    durationSeconds: active.durationSeconds,
    remainingSeconds: remaining,
    paused: false,
    urgent: remaining > 0 && remaining <= 5,
    modifierNotices: active.pressureApplied ? ["-5s first-answer pressure applied"] : undefined,
  };
}

/** Snapshot clock skew: server-clock offset relative to the local clock at
 * receipt (server-time − local-now). Used by timerMath to anchor the display
 * to the backend clock while still ticking down locally. */
export function snapshotSkewMs(serverTime: string, nowMs: number): number {
  const server = Date.parse(serverTime);
  return Number.isNaN(server) ? 0 : server - nowMs;
}

export function projectAbilities(priv: PrivatePlayerView, selectedAbilityId: string | null): AbilityView[] {
  return abilityViewsFromPrivatePlayer(priv.ownAbilities, { selectedAbilityId });
}

export function projectQuestion(pub: PublicRoundView): QuestionView | null {
  return pub.question ? questionViewFromPublicQuestion(pub.question) : null;
}

export function projectPermissions(phase: SubmissionPhase, inputOpen: boolean,
                                   submitting: boolean): InteractionPermissions {
  const base = permissionsForSubmissionPhase(phase, inputOpen);
  if (!submitting) return base;
  return restrictPermissions(base, {
    canSelectAnswer: false, canChangeAnswer: false, canSelectAbility: false,
    canReviewSubmission: false, canConfirmSubmission: false,
    disabledReasons: { submitting: "Submitting…" },
  });
}

/** Neutral opponent-connection copy for the arena chrome. */
export function opponentPresenceLabel(presence: PresenceView | null): string | null {
  if (!presence) return null;
  switch (presence.opponentConnectionState) {
    case "connected": return "Opponent connected";
    case "disconnected_grace": return "Opponent temporarily disconnected — reconnect grace active";
    case "disconnected": return "Opponent disconnected";
    case "forfeited": return "Opponent forfeited";
    case "abandoned": return "Opponent left";
    default: return null;
  }
}
