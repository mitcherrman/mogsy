/**
 * Daily three acts — one summoner spell's cooldown, carried across the three
 * linked questions of a Summoner Spell Mastery set.
 *
 * The backend serves each set child as an ordinary quiz round, and each one's
 * frozen explanation carries the curriculum's own calculation as
 * `cooldown_working` (`summoner_cooldown_working.v1`). The explanation is
 * emitted ONLY in the round's resolved projection, so everything here is read
 * from settled rounds:
 *
 * - the stages before the one on screen, from the ledger of settled rounds
 *   (which a resume backfills, so a reload rebuilds the bar);
 * - the stage on screen, ONLY once the shell's reveal gate says it is
 *   revealed (`SurfaceReveal.revealed`). Before that its value is the literal
 *   withheld `?`.
 *
 * Pure: no division, no derived cooldown. The bar's fill is the SERVED
 * multiplier (the share of the base cooldown that remains), and the only
 * arithmetic is a subtraction for the "shorter" label, as the Journey's own
 * cooldown reasoning does.
 */

export const COOLDOWN_WORKING_CONTRACT = "summoner_cooldown_working.v1";

/** The category the backend gives a Summoner Spell Mastery step (SSM slices). */
export const SUMMONER_SLICE_CATEGORY = "summoners";

export interface HasteSourceStep {
  name: string;
  kind: "rune" | "item";
  summonerSpellHaste: number;
}

export interface SummonerCooldownWorking {
  spell: string;
  baseCooldown: number;
  summonerSpellHaste: number;
  sources: HasteSourceStep[];
  /** Served: the share of the base cooldown that remains. */
  cooldownMultiplier: number;
  effectiveCooldown: number;
  unit: string;
  /** The option string the round displayed as correct ("254.2s"). */
  answer: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Read a round's served working, or null for anything else (fail closed). */
export function readSummonerCooldownWorking(
  explanation: Record<string, unknown> | null | undefined,
): SummonerCooldownWorking | null {
  const w = isRecord(explanation) ? explanation.cooldown_working : null;
  if (!isRecord(w) || w.contract !== COOLDOWN_WORKING_CONTRACT) return null;
  if (typeof w.spell !== "string" || !w.spell || typeof w.answer !== "string"
      || !isNum(w.base_cooldown) || !isNum(w.summoner_spell_haste)
      || !isNum(w.cooldown_multiplier) || !isNum(w.effective_cooldown)
      || !Array.isArray(w.sources)) return null;
  const sources: HasteSourceStep[] = [];
  for (const s of w.sources) {
    if (!isRecord(s) || typeof s.name !== "string" || !isNum(s.summoner_spell_haste)
        || (s.kind !== "rune" && s.kind !== "item")) return null;
    sources.push({ name: s.name, kind: s.kind, summonerSpellHaste: s.summoner_spell_haste });
  }
  return {
    spell: w.spell, baseCooldown: w.base_cooldown, summonerSpellHaste: w.summoner_spell_haste,
    sources, cooldownMultiplier: w.cooldown_multiplier, effectiveCooldown: w.effective_cooldown,
    unit: typeof w.unit === "string" ? w.unit : "seconds", answer: w.answer,
  };
}

/** What changed from the previous stage to this one, in the sources held. */
export type CooldownChange =
  | { kind: "add"; source: HasteSourceStep }
  /** One boot swapped for its upgrade: replaced, never stacked. */
  | { kind: "upgrade"; from: string; to: HasteSourceStep };

export interface CooldownStage {
  /** 1-based position in the set. */
  stage: number;
  /** Null until this stage is settled and revealed. */
  working: SummonerCooldownWorking | null;
  change: CooldownChange | null;
}

export interface CooldownContinuity {
  /** Null while nothing in the set is settled yet (stage 1, pre-reveal). */
  spell: string | null;
  /** The stage on screen (1..3). */
  current: number;
  stages: CooldownStage[];
}

function changeBetween(before: HasteSourceStep[], after: HasteSourceStep[]): CooldownChange | null {
  const had = new Set(before.map((s) => s.name));
  const has = new Set(after.map((s) => s.name));
  const added = after.filter((s) => !had.has(s.name));
  const removed = before.filter((s) => !has.has(s.name));
  if (added.length === 1 && removed.length === 0) return { kind: "add", source: added[0] };
  if (added.length === 1 && removed.length === 1) {
    return { kind: "upgrade", from: removed[0].name, to: added[0] };
  }
  return null;
}

/**
 * The bar's model for the round on screen, or null when it is not a step of a
 * Summoner Spell Mastery set.
 *
 * `setRounds` are the round numbers of the round's set (in order). A round is
 * a set step when every earlier stage settled with a working for ONE spell, or
 * — for the opening stage, whose only settled fact would be its own answer —
 * when the backend gave it the slice category.
 */
export function projectCooldownContinuity(input: {
  setRounds: readonly number[] | null;
  roundNumber: number | null;
  category: string | null | undefined;
  /** Each SETTLED round's frozen explanation, by round number. */
  explanations: ReadonlyMap<number, Record<string, unknown> | null>;
  /** The shell's reveal gate for the round on screen. */
  currentRevealed: boolean;
}): CooldownContinuity | null {
  const { setRounds, roundNumber } = input;
  if (!setRounds || roundNumber === null) return null;
  const index = setRounds.indexOf(roundNumber);
  if (index < 0) return null;
  const prior: SummonerCooldownWorking[] = [];
  for (const rn of setRounds.slice(0, index)) {
    const w = readSummonerCooldownWorking(input.explanations.get(rn) ?? null);
    if (!w || (prior.length && w.spell !== prior[0].spell)) return null;
    prior.push(w);
  }
  if (index === 0 && input.category !== SUMMONER_SLICE_CATEGORY) return null;
  let current: SummonerCooldownWorking | null = null;
  if (input.currentRevealed) {
    const w = readSummonerCooldownWorking(input.explanations.get(roundNumber) ?? null);
    if (w && (!prior.length || w.spell === prior[0].spell)) current = w;
  }
  const known = [...prior, ...(current ? [current] : [])];
  const stages: CooldownStage[] = setRounds.map((_rn, k) => {
    const working = known[k] ?? null;
    const before = k > 0 ? known[k - 1] : null;
    return {
      stage: k + 1, working,
      change: working && before ? changeBetween(before.sources, working.sources) : null,
    };
  });
  return { spell: known[0]?.spell ?? null, current: index + 1, stages };
}
