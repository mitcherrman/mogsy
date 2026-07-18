// ---------------------------------------------------------------------------
// Pure, React-free adapters: existing adapted Ranked models -> neutral view
// contracts. Rename/associate/annotate ONLY — no damage, correctness, XP,
// threshold, charge, or timer-pressure calculation. Identity is always the
// stable backend player id, never array position.
// ---------------------------------------------------------------------------

import type { AdaptedPublicRound } from "@/pages/dev/ranked-duel-prototype/transport-adapter/adaptPublicRound";
import type { AdaptedPrivatePlayer } from "@/pages/dev/ranked-duel-prototype/transport-adapter/adaptPrivatePlayer";
import type { PublicQuestion } from "@/pages/dev/ranked-duel-prototype/staff-duel/rankedDuelTypes";
import {
  abilityDescription,
  abilityName,
} from "@/pages/dev/ranked-duel-prototype/staff-duel/abilityDisplay";
import {
  AbilityView,
  AnswerOptionView,
  CombatantView,
  QuestionView,
} from "../viewTypes";

export class RankedViewAdapterError extends Error {
  constructor(message: string) {
    super(`Ranked view adapter: ${message}`);
    this.name = "RankedViewAdapterError";
  }
}

/** Controller-supplied display identity for one combatant. */
export interface CombatantIdentity {
  name: string;
  tag?: string;
}

export interface CombatantViewOptions {
  /** Which backend player id is "the player" (viewer perspective). */
  viewerPlayerId: string;
  /** Display identities keyed by backend player id; id shown when absent. */
  identities?: Record<string, CombatantIdentity>;
  /**
   * Known max HP keyed by backend player id (e.g. starting_hp from match
   * creation). Missing/undefined => maxHp null: EXPLICITLY unknown. This
   * adapter never infers, observes, or invents a maximum.
   */
  maxHpByPlayerId?: Record<string, number>;
  /**
   * Backend-derived level thresholds keyed by backend player id, supplied by
   * the controller ({ current, next } XP bounds; next null at max level).
   * Absent => both null (unknown).
   */
  levelBoundsByPlayerId?: Record<
    string,
    { current: number | null; next: number | null }
  >;
}

export interface CombatantViews {
  player: CombatantView;
  opponent: CombatantView;
}

/**
 * Project the shared public round into viewer-perspective combatant views.
 * Carries only public, pre-reveal-safe fields (the input projection itself
 * contains no hidden information, so none can appear here).
 */
export function combatantViewsFromPublicRound(
  round: AdaptedPublicRound,
  options: CombatantViewOptions,
): CombatantViews {
  const slots = [round.players.p1, round.players.p2];
  const viewer = slots.find((p) => p.playerId === options.viewerPlayerId);
  if (!viewer) {
    throw new RankedViewAdapterError(
      `viewer player id "${options.viewerPlayerId}" is not in this match`,
    );
  }
  const other = slots.find((p) => p.playerId !== options.viewerPlayerId);
  if (!other) {
    throw new RankedViewAdapterError("match is missing an opponent player");
  }

  const toView = (
    p: typeof viewer,
    side: CombatantView["side"],
  ): CombatantView => {
    const identity = options.identities?.[p.playerId];
    const bounds = options.levelBoundsByPlayerId?.[p.playerId];
    return {
      playerId: p.playerId,
      name: identity?.name ?? p.playerId,
      tag: identity?.tag,
      side,
      classId: p.classId,
      hp: p.hp,
      maxHp: options.maxHpByPlayerId?.[p.playerId] ?? null,
      xp: p.totalXp,
      level: p.level,
      nextLevelThreshold: bounds?.next ?? null,
      currentLevelThreshold: bounds?.current ?? null,
      hasSubmitted: p.hasSubmitted,
      abilityWindow: p.abilitySelectionPhase,
      hasAbilitySelected: p.hasAbilitySelected,
    };
  };

  return {
    player: toView(viewer, "player"),
    opponent: toView(other, "opponent"),
  };
}

export interface AbilityViewOptions {
  /** Ability id currently armed in the viewer's OWN submission draft. */
  selectedAbilityId?: string | null;
  /** Override display labels (defaults to the shared ability dictionary). */
  labelFor?: (abilityId: string) => { name: string; description: string };
}

const defaultLabelFor = (abilityId: string) => ({
  name: abilityName(abilityId),
  description: abilityDescription(abilityId),
});

/**
 * Project the viewer's OWN private projection into ability views. States are
 * pass-through: unlocked/locked from the projection, exhausted = backend
 * reports zero charges, locked = the selection window is locked. No charge
 * math and no legality rules — the backend rejects illegal submissions.
 */
export function abilityViewsFromPrivatePlayer(
  priv: AdaptedPrivatePlayer,
  options: AbilityViewOptions = {},
): AbilityView[] {
  const labelFor = options.labelFor ?? defaultLabelFor;
  const windowLocked = priv.selectionPhase === "locked";
  const armedId =
    options.selectedAbilityId !== undefined
      ? options.selectedAbilityId
      : priv.selectedAbilityId;

  const toView = (id: string, unlocked: boolean): AbilityView => {
    const charges = priv.remainingCharges[id] ?? null;
    const exhausted = unlocked && charges === 0;
    let unavailableReason: string | undefined;
    if (!unlocked) unavailableReason = "Locked — unlocks with level progression.";
    else if (exhausted) unavailableReason = "No charges remaining this match.";
    else if (windowLocked) unavailableReason = "Submission locked for this round.";
    const { name, description } = labelFor(id);
    return {
      id,
      name,
      description,
      unlocked,
      remainingCharges: charges,
      selected: armedId === id,
      locked: windowLocked,
      exhausted,
      unavailableReason,
    };
  };

  return [
    ...priv.unlockedAbilityIds.map((id) => toView(id, true)),
    ...priv.lockedAbilityIds.map((id) => toView(id, false)),
  ];
}

/** Stable option id for a backend answer index. */
export const answerOptionId = (index: number): string => String(index);

/**
 * Project the public question (prompt + options only — the backend never
 * sends correctness pre-reveal, so this view cannot contain it).
 */
export function questionViewFromPublicQuestion(
  question: PublicQuestion,
): QuestionView {
  const options: AnswerOptionView[] = question.options.map((label, index) => ({
    id: answerOptionId(index),
    index,
    label,
  }));
  return {
    questionId: question.questionId,
    prompt: question.prompt,
    options,
    category: question.category,
  };
}
