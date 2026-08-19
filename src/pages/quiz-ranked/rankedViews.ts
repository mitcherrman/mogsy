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
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import { quizModule } from "@/lib/ranked-core/modules/quizModule";
import type { ScenarioSource } from "@/lib/question-surface/contract";
import {
  permissionsForSubmissionPhase,
  restrictPermissions,
} from "@/lib/ranked-core/permissions";
import { remainingSeconds } from "@/lib/ranked-core/timerMath";
import {
  AbilityView,
  InteractionPermissions,
  NO_INTERACTIONS,
  QuestionView,
  SubmissionPhase,
  TimerView,
} from "@/lib/ranked-core/viewTypes";
import { rankedRoleLabel } from "@/lib/ranked-public/roles";
import type { PresenceView, PrivatePlayerView, PublicRoundView } from "@/lib/ranked-public/contracts";

/**
 * Combatant views (viewer perspective) with authoritative frozen max HP.
 *
 * R1: the identity TAG names the player's League role when the match froze
 * one, and falls back to the legacy class for every pre-R1 match. The tag is
 * read straight off the projection — never derived from the class, and never
 * the other way round. The decorative class crest beside it is unchanged and
 * stays a legacy asset until the LC1 art follow-up replaces it; it is
 * `aria-hidden` and the tag text is what carries identity.
 */
export function projectCombatants(pub: PublicRoundView, viewerUserId: string): CombatantViews {
  const identities: Record<string, { name: string; tag?: string }> = {};
  const maxHpByPlayerId: Record<string, number> = {};
  for (const p of pub.players) {
    identities[p.playerId] = {
      name: p.playerId === viewerUserId ? "You" : "Opponent",
      tag: rankedRoleLabel(p.role) ?? p.classId,
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

/**
 * Question projection for a quiz segment.
 *
 * Delegates to `quiz.v1` so there is exactly ONE implementation behind both
 * this legacy export and the module registry. Retained as a named export
 * because existing callers and tests import it; the behaviour is unchanged.
 */
export function projectQuestion(pub: PublicRoundView): QuestionView | null {
  return quizModule.projectQuestion(pub);
}

/** Optional rich-visual source for InteractiveScenarioSurface; null → text
 * fallback. Question-safe (pre-reveal); the surface handles spoiler gating. */
export function projectScenarioSource(pub: PublicRoundView): ScenarioSource | null {
  return pub.question ? scenarioSourceFromPublicQuestion(pub.question) : null;
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

/**
 * R3: the ability tray's own gating, deliberately NOT the answer's.
 *
 * The answer locks on one click; the ability stays editable for as long as the
 * ROUND is open — including the whole stretch where the player has already
 * answered and is waiting for the opponent. The authority for "still open" is
 * the backend's own selection phase (`own_selection.phase`), which the engine
 * flips to `locked` at the instant the round closes. Nothing here infers it
 * from local submission state, so the tray can never stay live past the freeze.
 */
export function projectAbilityPermissions(
  priv: PrivatePlayerView | null, roundLive: boolean, busy: boolean,
): InteractionPermissions {
  const open = roundLive && priv?.ownSelection.phase === "open";
  if (!open) {
    return restrictPermissions(NO_INTERACTIONS, {
      disabledReasons: {
        ability: roundLive ? "Ability locked for this round." : undefined,
      },
    });
  }
  const base: InteractionPermissions = {
    ...NO_INTERACTIONS, canSelectAbility: true,
  };
  if (!busy) return base;
  return restrictPermissions(base, {
    canSelectAbility: false,
    disabledReasons: { ability: "Saving…" },
  });
}

/**
 * Whether the ability tray should render at all.
 *
 * This is a question about the player's ROSTER, not about whether the window
 * happens to be open right now. Hidden when there is genuinely nothing to show:
 * no private state, a module that owns its own submission, no unlocked ability,
 * or every unlocked ability spent for the match. A tray whose only live control
 * is "No Ability" is not worth a row — No Ability is already the default.
 *
 * `locked` is deliberately NOT consulted (RA1 1.5). It flips to true at every
 * round close, and keying visibility off it unmounted the tray on every round
 * boundary and for the whole of a level-2 choice — tearing ~140px out of the
 * middle of the HUD and sliding the status panel up under the player's cursor.
 * A locked round now renders the tray in its own disabled state instead, which
 * AbilityTray already supports (see `permissions.disabledReasons.ability`).
 */
export function abilityTrayIsUseful(abilities: AbilityView[],
                                    selectedAbilityId: string | null): boolean {
  if (selectedAbilityId !== null) return true;  // must remain clearable
  return abilities.some((a) => a.unlocked && !a.exhausted);
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
