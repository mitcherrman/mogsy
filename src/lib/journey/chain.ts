/**
 * JP3 — THE JOURNEY MICRO-CHAIN: which step of the chain this is, and what
 * each REACHED step established.
 *
 *   Formula ✓ → Raw damage ✓ → Armor ● → ○
 *
 * WHERE THE LABELS COME FROM. Each reached child's served `asks` (its family
 * and metric, the same keys the question sentence is phrased from), said as a
 * short noun by a CLOSED vocabulary below — a formatter over served keys, like
 * `JOURNEY_STAT_META`, never a description of any one Journey. Nothing here
 * names a champion, an ability or a recipe.
 *
 * FUTURE STEPS ARE UNLABELLED, BY CONTRACT. The server publishes only the
 * REACHED prefix of a Journey's children (`journey.children`) plus the count:
 * what a later step asks is deliberately not on the wire before it opens. So
 * a future node is a bare ○. Labelling it would need a backend contract
 * change; inventing its label would leak or guess curriculum.
 *
 * `done` means the step's reveal has ESTABLISHED its fact — never that it was
 * answered correctly (a wrong answer or a timeout establishes it the same way).
 */
import type { JourneyAsks, JourneyChildContext } from "./adapter";
import { JOURNEY_STAT_META, isJourneyStatKey } from "./stats";

export type JourneyChainState = "done" | "current" | "future";

export interface JourneyChainNode {
  index: number;
  /** A short noun for a reached step; null for a future (unpublished) step or an unknown kind. */
  label: string | null;
  state: JourneyChainState;
}

const SLOT = /^[QWER]$/;

/** The closed vocabulary: a reached step's served ask → a short noun, or null. */
export function chainNoun(asks: Pick<JourneyAsks, "family" | "metric" | "subjectRef">): string | null {
  const { family, metric } = asks;
  const slot = SLOT.test(asks.subjectRef) ? asks.subjectRef : null;
  if (family === "ability_damage_formula" || metric === "ability_damage_formula") return "Formula";
  if (/_damage_before_(armor|magic_resist|mitigation)$/.test(metric) || family === "combat_ability_raw_damage") return "Raw damage";
  if (/_damage_after_(armor|magic_resist|mitigation)$/.test(metric)) return "Final damage";
  if (family === "champion_stat_level" || metric.startsWith("base_")) {
    const stat = metric.replace(/^base_/, "");
    return isJourneyStatKey(stat) ? JOURNEY_STAT_META[stat].short : null;
  }
  if (metric === "ability_cooldown") {
    if (family.endsWith("_compare")) return slot ? `${slot} compare` : "Compare";
    if (family === "combat_cooldown") return slot ? `${slot} haste CD` : "Haste CD";
    return slot ? `${slot} cooldown` : "Cooldown";
  }
  return null;
}

/**
 * The chain for the step on screen. `settled` = the current step's reveal is
 * showing (its fact is now established), so it reads as done.
 */
export function journeyChain(
  reached: readonly Pick<JourneyChildContext, "index" | "asks">[],
  count: number,
  currentIndex: number,
  settled: boolean,
): JourneyChainNode[] {
  const byIndex = new Map(reached.map((c) => [c.index, c] as const));
  return Array.from({ length: Math.max(count, 0) }, (_, index) => {
    const child = byIndex.get(index);
    const state: JourneyChainState = index < currentIndex || (index === currentIndex && settled)
      ? "done" : index === currentIndex ? "current" : "future";
    return { index, label: child && state !== "future" ? chainNoun(child.asks) : null, state };
  });
}
