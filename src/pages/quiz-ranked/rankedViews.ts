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
import type { ScenarioSource, SurfaceReveal } from "@/lib/question-surface/contract";
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
  const identities: Record<string, { name: string; tag?: string; roleId?: string | null }> = {};
  const maxHpByPlayerId: Record<string, number> = {};
  for (const p of pub.players) {
    // Phase 11: the ROLE ID travels alongside the label so the arena can pick
    // the role crest without re-parsing the label back into an id. Null for a
    // pre-R1 match — the panel then falls back to the legacy class identity,
    // which is the only case where `classId` reaches presentation at all.
    identities[p.playerId] = {
      name: p.playerId === viewerUserId ? "You" : "Opponent",
      tag: rankedRoleLabel(p.role) ?? p.classId,
      roleId: p.role,
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

// ---------------------------------------------------------------------------
// QUIZ1 Phase 11 — recent-damage history for the duelist columns.
// ---------------------------------------------------------------------------

/**
 * One glance-able line under a duelist's HP bar: what happened to THAT
 * player's health in one settled round.
 *
 * Every field is read straight off the authoritative settlement. Nothing is
 * derived arithmetically — in particular `amount` is the backend's
 * `finalDamageReceived`, never `hpBefore - hpAfter`, because the two can
 * legitimately differ (a floor, a heal, a clamp) and the settlement is the
 * authority on which one is the damage.
 */
export interface DamageHistoryEntry {
  /** Stable key: a round is settled once, so the round number identifies it. */
  roundNumber: number;
  /** `hit` = HP was lost. `blocked` = a shield ate the whole instance. */
  kind: "hit" | "blocked";
  /** HP lost (`hit`) or absorbed (`blocked`). Always > 0. */
  amount: number;
  /** Authoritative HP after this round, for the accessible description. */
  hpAfter: number;
}

/**
 * The last few HP changes for one player, oldest first.
 *
 * DELIBERATELY OMITS rounds where nothing happened. A round in which both
 * players answered correctly costs nobody health, and a row saying so would be
 * three-quarters of a typical trail — the strip is meant to explain the HP bar
 * at a glance, and a wall of "0" explains nothing. A fully shielded instance is
 * the one zero-damage event that IS kept, because "you were hit and it was
 * absorbed" is a different fact from "you were not hit".
 */
export function projectDamageHistory(
  log: ResolvedRoundView[], playerId: string,
): DamageHistoryEntry[] {
  const out: DamageHistoryEntry[] = [];
  for (const settlement of log) {
    const player = Object.values(settlement.players)
      .find((p) => p.playerId === playerId);
    if (!player) continue;
    if (player.finalDamageReceived > 0) {
      out.push({
        roundNumber: settlement.roundNumber, kind: "hit",
        amount: player.finalDamageReceived, hpAfter: player.hpAfter,
      });
    } else if (player.shieldAbsorbed > 0) {
      out.push({
        roundNumber: settlement.roundNumber, kind: "blocked",
        amount: player.shieldAbsorbed, hpAfter: player.hpAfter,
      });
    }
  }
  return out;
}

/**
 * The outcome each player reached in the settlement currently being revealed,
 * keyed by player id — or an empty map when no reveal is in progress.
 *
 * Gated on `revealHold` so the duelist columns resolve DURING the reveal beat
 * and return to their neutral Thinking/Locked state for the next question,
 * rather than carrying a stale verdict into it.
 */
export function projectRevealOutcomes(
  settlement: ResolvedRoundView | null, revealing: boolean,
): Record<string, ResolvedCombatantView["outcome"]> {
  if (!settlement || !revealing) return {};
  const out: Record<string, ResolvedCombatantView["outcome"]> = {};
  for (const player of Object.values(settlement.players)) {
    out[player.playerId] = player.outcome;
  }
  return out;
}

/** Damage each player DEALT in the settlement being revealed, by player id. */
export function projectRevealDamage(
  settlement: ResolvedRoundView | null, revealing: boolean,
): Record<string, number> {
  if (!settlement || !revealing) return {};
  const out: Record<string, number> = {};
  for (const player of Object.values(settlement.players)) {
    out[player.playerId] = player.finalDamageDealt;
  }
  return out;
}

/**
 * The reveal handed to a normal question's answer tablets, or null.
 *
 * THE DISCLOSURE GATE, and the reason it is a pure function rather than three
 * conditions inline in a component: each of the three closes a different way a
 * live question could be answered for the player, and they must be readable
 * and testable together.
 *
 *  1. a settlement exists AND carries a `correctOptionIndex`. The backend
 *     builds a resolved projection only from a settled row, and reports null
 *     for a segment round and for a pre-Phase-11 backend.
 *  2. the settlement's round is the round the SURFACE is showing. During the
 *     reveal beat the surface deliberately lags the live round; without this,
 *     the round that just settled would resolve the tablets of the round that
 *     just opened — which is the actual leak this shape prevents.
 *  3. the index resolves to an option of THAT question's projection, so the
 *     index→id lookup cannot cross a round boundary either.
 */
export function projectSurfaceReveal(
  settlement: ResolvedRoundView | null,
  surfaceRoundNumber: number | null,
  question: QuestionView | null,
): SurfaceReveal | null {
  if (!settlement || settlement.correctOptionIndex === null) return null;
  if (surfaceRoundNumber === null) return null;
  if (settlement.roundNumber !== surfaceRoundNumber) return null;
  const correct = question?.options.find(
    (o) => o.index === settlement.correctOptionIndex);
  if (!correct) return null;
  return { revealed: true, correctOptionId: correct.id };
}

// ---------------------------------------------------------------------------
// AI1 Phase 2 — mascot reactions for a settled round.
// ---------------------------------------------------------------------------

/** One mascot reaction: what to play, and the id that makes it retriggerable. */
export interface MascotReaction {
  action: "attack" | "hit";
  /** The settled round this reaction belongs to. A round settles exactly once,
   *  so the round number is a stable, monotonic event id — which is precisely
   *  what `RoleMascot`'s edge-triggered playback needs. */
  actionId: number;
}

/**
 * The mascot reaction for each player in the settlement being revealed.
 *
 * Read straight off the authoritative settlement — the SAME row the HP bar,
 * the damage trail and the verdict already read. Nothing is timed, sampled or
 * invented here, and there is no simulated or test-only trigger anywhere: if
 * the backend did not settle a round, no mascot moves.
 *
 * Gated on `revealing` (the reveal hold) so the two mascots react on the same
 * beat the verdicts resolve, and go quiet again for the next question rather
 * than carrying a stale reaction into it.
 *
 * ONE ACTION PER MASCOT, and `hit` wins. A round can leave a player both
 * dealing and receiving damage; the mascot has one body and can only do one
 * thing, so taking damage — the fact that actually moved this player's HP bar
 * — is the one that reads. In the ordinary round only one side is damaged, so
 * the attacker lunges and the defender recoils as two halves of one event.
 *
 * A player who neither dealt nor received damage gets no reaction at all; a
 * round where nobody was hurt should not animate.
 */
export function projectMascotReactions(
  settlement: ResolvedRoundView | null, revealing: boolean,
): Record<string, MascotReaction> {
  if (!settlement || !revealing) return {};
  const out: Record<string, MascotReaction> = {};
  for (const player of Object.values(settlement.players)) {
    const took = player.finalDamageReceived > 0 || player.shieldAbsorbed > 0;
    const dealt = player.finalDamageDealt > 0;
    if (!took && !dealt) continue;
    out[player.playerId] = {
      action: took ? "hit" : "attack",
      actionId: settlement.roundNumber,
    };
  }
  return out;
}
