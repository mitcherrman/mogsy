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
  ResolvedCombatantView,
  ResolvedRoundView,
  NO_INTERACTIONS,
  QuestionView,
  SubmissionPhase,
  TimerView,
} from "@/lib/ranked-core/viewTypes";
import { rankedRoleLabel } from "@/lib/ranked-public/roles";
import type { PresenceView, PrivatePlayerView, PublicRoundView } from "@/lib/ranked-public/contracts";

/**
 * Does this MATCH speak roles?
 *
 * A match-level question, answered once and applied to both combatants — see
 * `CombatantView.identityMode` for why the per-participant answer is the wrong
 * one. Two independent signals, either of which settles it:
 *
 *  * any participant carries a League role — a match cannot have frozen a role
 *    for one seat and be a pre-R1 match; and
 *  * the match's own frozen config reports no progression layer, which is the
 *    R1 signal (`level_thresholds=(0,)` → `max_level == 1`). This catches the
 *    R1 match where NEITHER seat has a role, which a role sniff alone would
 *    misread as pre-R1 and dress in combat classes.
 *
 * `progressionEnabled` is parsed compatibility-safe (absent/null ⇒ `true`), so
 * a backend that predates R1 answers "legacy" here, and a flag-off match —
 * which the backend gives pre-R1 semantics exactly, legacy thresholds and both
 * roles NULL — also answers "legacy". Neither changes shape.
 *
 * Nothing here maps a class to a role or a role to a class in either
 * direction; it only chooses which vocabulary the match is allowed to use.
 */
function matchIdentityMode(pub: PublicRoundView): "role" | "legacy_class" {
  if (pub.players.some((p) => p.role !== null)) return "role";
  return pub.progressionEnabled ? "legacy_class" : "role";
}

/**
 * Combatant views (viewer perspective) with authoritative frozen max HP.
 *
 * R1: the identity TAG names the player's League role, and nothing else. It is
 * read straight off the projection — never derived from the class, and never
 * the other way round.
 *
 * THE `TANK` DEFECT, and why the fallback is gone. This used to read
 * `rankedRoleLabel(p.role) ?? p.classId`, which is correct for a pre-R1 match
 * (whose only identity IS the class) and wrong for every current one. A bot
 * legitimately carries `role: null` — the backend refuses to invent one, and
 * refuses to derive one from a class — so the fallback fired on the bot and
 * printed its combat class in the role slot, uppercased, as `TANK`. Tank is
 * not a League role.
 *
 * The class now reaches presentation only through `identityMode`, i.e. only on
 * a match that has no roles at all. On a role match a role-less participant
 * gets no tag from here and the panel supplies the NEUTRAL role label instead.
 */
export function projectCombatants(pub: PublicRoundView, viewerUserId: string): CombatantViews {
  const identities: Record<string, { name: string; tag?: string; roleId?: string | null }> = {};
  const maxHpByPlayerId: Record<string, number> = {};
  const identityMode = matchIdentityMode(pub);
  for (const p of pub.players) {
    // Phase 11: the ROLE ID travels alongside the label so the arena can pick
    // the role crest without re-parsing the label back into an id.
    identities[p.playerId] = {
      name: p.playerId === viewerUserId ? "You" : "Opponent",
      // Undefined, never a class, when this participant has no role. On a
      // role match the panel fills the slot with the neutral role label; on a
      // legacy match the class is the identity and is used verbatim.
      tag: identityMode === "role"
        ? (rankedRoleLabel(p.role) ?? undefined)
        : p.classId,
      roleId: p.role,
    };
    if (p.maxHp !== null) maxHpByPlayerId[p.playerId] = p.maxHp;
  }
  return combatantViewsFromPlayers(pub.players, {
    viewerPlayerId: viewerUserId, identities, maxHpByPlayerId, identityMode,
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

// ---------------------------------------------------------------------------
// Recent-round combat history for the duelist columns.
// ---------------------------------------------------------------------------






// ---------------------------------------------------------------------------
// AI1 Phase 2 — mascot reactions for a settled round.
// ---------------------------------------------------------------------------

// THE SETTLED-ROUND PROJECTIONS — MOVED (ARENA1 Step 5).
//
// `projectRoundHistory`, `projectRevealOutcomes`, `projectRevealDamage`,
// `projectSurfaceReveal` and `projectMascotReactions` now live in
// `@/lib/ranked-core/settlementViews`, beside the contracts they produce.
//
// They were always mode-neutral — pure functions over an authoritative
// settlement, computing no combat value and knowing no mode — and Step 4 had
// the Tutorial importing them from HERE, out of Ranked's page. A third mode
// doing the same would have made this page a shared library that no guard
// describes. Nothing about the functions changed; only where they live.
//
// Re-exported so every historical import site resolves unchanged. NEW code
// imports from `lib/ranked-core`, and `sharedLayer.boundary.test` forbids a
// mode outside this page from coming here for them.
export {
  projectMascotReactions, projectRevealDamage, projectRevealOutcomes,
  projectRoundHistory, projectSurfaceReveal,
} from "@/lib/ranked-core/settlementViews";
export type { MascotReaction, RoundHistoryEntry } from "@/lib/ranked-core/viewTypes";
