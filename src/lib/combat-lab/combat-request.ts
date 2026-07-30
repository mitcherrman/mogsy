/**
 * Combat Lab interactive-sandbox request contract.
 *
 * These helpers own the exact on-wire shape of `/api/combat-lab/basic-attack`
 * and `/api/combat-lab/active`. They live here, outside the page component, so
 * the payload contract can be certified directly instead of inferred by
 * driving the UI.
 *
 * NOTHING HERE COMPUTES COMBAT. The backend stays the sole authority for
 * damage, readiness, cooldowns and item behavior; these functions only decide
 * which already-known client facts (loadout, live state, clock) are put on the
 * wire.
 */

import type {
  CombatLabActiveRequest,
  CombatLabBasicAttackRequest,
} from "./api";

/**
 * Canonical empty combat state shape. Reset replaces the live state object
 * with a FRESH copy of this so no stale `states.*` keys (TARGET_REMAINING_HP,
 * TARGET_DAMAGE_REDUCTION_PERCENT, *_EXPIRES_AT, ITEM_JAKSHO_STACKS, etc.)
 * can survive into the next backend request.
 */
export const makeEmptyCombatState = () => ({
  states: {} as Record<string, unknown>,
  timed_effects: [] as unknown[],
  permanent_stacks: {} as Record<string, unknown>,
});

/**
 * Strict request-state builder. The ONLY source allowed for payload.state is
 * the live `currentState` React variable. We extract just the three canonical
 * keys so stray top-level fields (TARGET_DAMAGE_REDUCTION_PERCENT,
 * *_EXPIRES_AT, ITEM_JAKSHO_STACKS, etc.) from a previous response, runtime
 * snapshot, defense preview, localStorage hydration, or derived HP source
 * cannot leak into the next backend call. Anything missing or non-object is
 * normalized to an empty canonical shape.
 *
 * These three keys are exactly what the backend's `CombatState.snapshot()`
 * returns, so round-tripping a response through here is lossless. That is what
 * lets backend-owned mechanic state — including Spellblade readiness, which the
 * engine writes as `states.ITEM_SHEET_SPELLBLADE_READY` /
 * `ITEM_SHEET_SPELLBLADE_ITEM` / `ITEM_SHEET_SPELLBLADE_MULTIPLIER` plus a
 * `COOLDOWN_<ITEM>_SPELLBLADE` entry — survive from an `/active` response into
 * the next `/basic-attack` request untouched.
 */
export const buildRequestState = (currentState: unknown) => {
  const empty = makeEmptyCombatState();
  if (!currentState || typeof currentState !== "object") return empty;
  const s = currentState as Record<string, unknown>;
  const states =
    s.states && typeof s.states === "object" && !Array.isArray(s.states)
      ? (s.states as Record<string, unknown>)
      : empty.states;
  const timed_effects = Array.isArray(s.timed_effects)
    ? (s.timed_effects as unknown[])
    : empty.timed_effects;
  const permanent_stacks =
    s.permanent_stacks &&
    typeof s.permanent_stacks === "object" &&
    !Array.isArray(s.permanent_stacks)
      ? (s.permanent_stacks as Record<string, unknown>)
      : empty.permanent_stacks;
  return { states, timed_effects, permanent_stacks };
};

/**
 * The interactive sandbox's authoritative combat clock, read from backend
 * state only.
 *
 * Precedence matches what the Combat Time header already displays: a
 * backend-provided `state.current_time`, else `state.states.CURRENT_TIME`,
 * else 0.
 *
 * WHY IT CAN STILL BE 0, AND WHY THAT IS NOT A SUBSTITUTE CLOCK
 * ------------------------------------------------------------
 * The sandbox has no simulation clock of its own. It advances one action per
 * HTTP request, and the backend's `CombatState.snapshot()` returns only
 * `{ states, timed_effects, permanent_stacks }` — it does not echo a time. So
 * neither key above is populated today and this returns 0, which is exactly
 * the value `/basic-attack` has always hard-coded. This function is therefore
 * behavior-preserving right now; it is deliberately NOT a wall clock and NOT a
 * client-incremented timer, because inventing either would make the frontend
 * an authority on cooldown timing.
 *
 * The consequence of a 0 clock is real and is reported rather than papered
 * over: the engine arms Spellblade only when
 * `current_time >= COOLDOWN_<ITEM>_SPELLBLADE`, and arming writes that key as
 * `current_time + cooldown_seconds`. With a pinned 0 clock the first
 * qualifying cast arms and later casts cannot re-arm until Reset clears state.
 * Fixing that requires an authoritative clock to exist — a backend-echoed time
 * or an explicit sandbox time control — at which point this single function is
 * the only place the frontend needs to change.
 */
export const getAuthoritativeCombatTime = (currentState: unknown): number => {
  if (!currentState || typeof currentState !== "object") return 0;
  const s = currentState as Record<string, unknown>;
  if (typeof s.current_time === "number" && Number.isFinite(s.current_time)) {
    return s.current_time;
  }
  const states = s.states;
  if (states && typeof states === "object" && !Array.isArray(states)) {
    const nested = (states as Record<string, unknown>).CURRENT_TIME;
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  }
  return 0;
};

/** Normalize a loadout selection into the inventory the backend expects. */
export const buildItemNames = (items: readonly string[] | undefined | null): string[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter((name) => name.length > 0);
};

export type BasicAttackRequestInput = {
  championName: string;
  itemNames: readonly string[] | undefined | null;
  runeNames: readonly string[] | undefined | null;
  attackerStats: Record<string, number>;
  targetStats: Record<string, number>;
  /** Live combat state; funneled through buildRequestState. */
  currentState: unknown;
  /** Trailing fields (target entity, ability ranks) spread last, as before. */
  extraFields?: Array<Record<string, unknown> | undefined>;
};

export type ActiveRequestInput = {
  championName: string;
  /**
   * The attacker's currently equipped items. Required by the backend so a
   * qualifying ability cast can arm a Spellblade item; an empty inventory
   * simply has nothing to arm.
   */
  itemNames: readonly string[] | undefined | null;
  attackerStats: Record<string, number>;
  targetStats: Record<string, number>;
  currentState: unknown;
  activeName: string;
  targetScope: string;
  piercingArrowChargeBonusPercent?: number;
  extraFields?: Array<Record<string, unknown> | undefined>;
};

const mergeExtraFields = (
  extraFields: Array<Record<string, unknown> | undefined> | undefined
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const group of extraFields || []) {
    if (group && typeof group === "object") Object.assign(out, group);
  }
  return out;
};

/** Build the exact `/api/combat-lab/basic-attack` payload. */
export function buildBasicAttackRequest(
  input: BasicAttackRequestInput
): CombatLabBasicAttackRequest {
  return {
    champion_name: input.championName,
    item_names: buildItemNames(input.itemNames),
    rune_names: buildItemNames(input.runeNames),
    attacker_stats: input.attackerStats,
    target_stats: input.targetStats,
    state: buildRequestState(input.currentState),
    current_time: getAuthoritativeCombatTime(input.currentState),
    ...mergeExtraFields(input.extraFields),
  } as CombatLabBasicAttackRequest;
}

/**
 * Build the exact `/api/combat-lab/active` payload.
 *
 * `item_names` and `current_time` are the two additive fields the live route
 * needs for Spellblade arming. They are placed before the trailing spreads so
 * an explicit per-action override keeps working exactly as it did.
 */
export function buildActiveRequest(
  input: ActiveRequestInput
): CombatLabActiveRequest {
  return {
    champion_name: input.championName,
    item_names: buildItemNames(input.itemNames),
    attacker_stats: input.attackerStats,
    target_stats: input.targetStats,
    state: buildRequestState(input.currentState),
    current_time: getAuthoritativeCombatTime(input.currentState),
    active_name: input.activeName,
    target_scope: input.targetScope || "PRIMARY",
    piercing_arrow_charge_bonus_percent:
      input.piercingArrowChargeBonusPercent ?? 0,
    ...mergeExtraFields(input.extraFields),
  } as CombatLabActiveRequest;
}
