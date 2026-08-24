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
import { conciseEvidence } from "@/lib/question-feedback/evidence";
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

/**
 * One row of a duelist's recent-round ledger: what happened to THAT player in
 * one settled round.
 *
 * Every field is read straight off the authoritative settlement. Nothing is
 * derived arithmetically — in particular `taken` is the backend's
 * `finalDamageReceived`, never `hpBefore - hpAfter`, because the two can
 * legitimately differ (a floor, a heal, a clamp) and the settlement is the
 * authority on which one is the damage.
 */
export interface RoundHistoryEntry {
  /** Stable key: a round is settled once, so the round number identifies it. */
  roundNumber: number;
  /** This player's verdict in that round. */
  outcome: ResolvedCombatantView["outcome"];
  /** Damage this player DEALT. 0 = none. */
  dealt: number;
  /** Damage this player TOOK. 0 = none. */
  taken: number;
  /** Damage a shield absorbed for this player. 0 = none. */
  absorbed: number;
  /** Authoritative HP either side of the round, for the accessible description. */
  hpBefore: number;
  hpAfter: number;
  /** The round ended on the clock rather than on both answers. */
  timeExpired: boolean;
}

/**
 * The last few settled rounds for one player, oldest first.
 *
 * ONE ROW PER SETTLED ROUND, including rounds in which nobody lost health.
 * The predecessor of this projection deliberately dropped those, because it
 * fed a strip of damage chips under the HP bar and a wall of "0" explains
 * nothing about an HP bar. This is a ledger of ROUNDS, and two things changed
 * with it:
 *
 *  * the news in a no-damage round is the OUTCOME ("both correct"), which the
 *    chip strip could not show and this can; and
 *  * the two columns are read across as a pair. If one side omitted round 4
 *    and the other did not, the two ledgers would describe different rows at
 *    the same height — which is precisely the mirroring the arena is for.
 *
 * A player absent from a settlement is skipped, not defaulted.
 */
export function projectRoundHistory(
  log: ResolvedRoundView[], playerId: string,
): RoundHistoryEntry[] {
  const out: RoundHistoryEntry[] = [];
  for (const settlement of log) {
    const player = Object.values(settlement.players)
      .find((p) => p.playerId === playerId);
    if (!player) continue;
    out.push({
      roundNumber: settlement.roundNumber,
      outcome: player.outcome,
      dealt: player.finalDamageDealt,
      taken: player.finalDamageReceived,
      absorbed: player.shieldAbsorbed,
      hpBefore: player.hpBefore,
      hpAfter: player.hpAfter,
      timeExpired: settlement.endReason === "deadline_expired",
    });
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
  /**
   * RG3 — the viewer's own settled side, so the reveal can state the VERDICT
   * as well as the answer. Optional: omitting it reproduces the pre-RG3 shape
   * exactly, which is what every existing caller and test relies on.
   */
  viewer?: ResolvedCombatantView | null,
): SurfaceReveal | null {
  if (!settlement || settlement.correctOptionIndex === null) return null;
  if (surfaceRoundNumber === null) return null;
  if (settlement.roundNumber !== surfaceRoundNumber) return null;
  const correct = question?.options.find(
    (o) => o.index === settlement.correctOptionIndex);
  if (!correct) return null;
  return {
    revealed: true,
    correctOptionId: correct.id,
    isCorrect: viewer ? viewer.outcome === "correct" : null,
    // Rides the SAME three gates as the correct option above. There is no
    // separate condition under which evidence may appear, which is what stops
    // the two from ever disagreeing about whether this round is disclosed.
    evidence: conciseEvidence(settlement.questionExplanation),
  };
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
