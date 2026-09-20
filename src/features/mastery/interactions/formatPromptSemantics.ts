/**
 * Turns `MasteryPromptSemantics` (structured data, never prose) into a
 * player-facing English prompt (Phase 4C1).
 *
 * This is the ONE place the atomic-recall prompt sentence is assembled. The
 * backend deliberately never sends rendered prompt text for an atomic-recall
 * question — see `mastery.knowledge.contract.PromptSemantics` docstring in the
 * backend worktree — so every word here is built from typed fields, never
 * echoed from a `prompt` string on the wire.
 */
import type { MasteryPromptSemantics } from "../contracts/promptSemantics";

export class MasteryUnknownPromptTemplateError extends Error {
  constructor(template: string) {
    super(`Mastery atomic recall: no phrasing for prompt template "${template}"`);
    this.name = "MasteryUnknownPromptTemplateError";
  }
}

/** Title-cases a snake_case/dot.case metric slug for display. */
function humanizeMetric(metric: string): string {
  return metric
    .split(/[_.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The metric slug's STAT NAME, with the `base_` qualifier removed.
 *
 * GR1 product readiness — the worst wording defect Champion Mastery had.
 * The canonical metric vocabulary names a champion's stat line `base_armor`,
 * `base_health`, `base_mana_regen` and so on, because those columns hold the
 * level-1 value from which every later one grows. A `champion_stat_at_level`
 * question asks for `base + growth × level multiplier`, and that number is
 * NOT the base stat: "At level 18, what is Aatrox's Base Armor?" has the
 * answer 120 while Aatrox's base armor is 38. The prompt asserted something
 * false about a correct number, on all 173 champions and 3,482 candidates.
 *
 * The fix is wording only, and deliberately so. The metric slug is the
 * canonical field name and the identity the fact, the candidate key, the
 * grader and the provenance all travel under; renaming it to fix a sentence
 * would break identity to fix presentation. So the slug is preserved
 * everywhere and only the DISPLAYED stat name drops the qualifier — which is
 * also what the server's own presentation contract already does, so the
 * prompt and the media-band chip above it now agree ("HEALTH REGEN" /
 * "Health Regen") instead of contradicting each other.
 *
 * Used for the base-stat template too, where `base ${humanizeMetric(...)}`
 * would otherwise render "base Base Armor".
 */
function statName(metric: string): string {
  return humanizeMetric(metric.replace(/^base[_.]/, ""));
}

/**
 * A cost question's resource, as the word a prompt uses.
 *
 * "At rank 3, what does Ahri Q cost?" is ambiguous between mana, energy and
 * health, and Lee Sin's energy costs read identically to Ahri's mana ones.
 * The backend now states the resource on the semantics (from the fact's own
 * unit) and refuses any cost candidate it cannot name, so an empty value here
 * means the contract was violated upstream rather than that the question is
 * resourceless — and the prompt degrades to the old ambiguous wording rather
 * than naming a resource nobody certified.
 */
function costNoun(ps: MasteryPromptSemantics): string {
  return ps.resource ? ` ${ps.resource}` : "";
}

/**
 * The scenario a state-aware prompt has to STATE, as an English clause.
 *
 * GR1 reusable state, Phase 3. "What is this ability's cooldown?" has one
 * answer intrinsically and a different one inside a build, so a prompt that
 * omitted the scenario would be unanswerable — and would look answerable,
 * which is worse. The pairs come from the backend's resolved state, already
 * rounded to each metric's declared precision, so nothing is computed here.
 *
 * `ability_haste` is spelled out because it is the one metric this phase
 * binds and "20 Ability Haste" is what the game calls it; anything else
 * degrades to its own slug rather than being dropped.
 */
const SCENARIO_NAMES: Record<string, string> = {
  ability_haste: "Ability Haste",
};

function scenarioClause(ps: MasteryPromptSemantics): string {
  const parts = ps.scenario.map(
    ([name, value]) => `${value} ${SCENARIO_NAMES[name] ?? name.replace(/_/g, " ")}`,
  );
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function abilityLabel(ps: MasteryPromptSemantics): string {
  const ref = `${ps.championDisplay} ${ps.subjectRef}`.trim();
  // The parenthetical exists to name the ability behind a slot letter
  // ("Ahri Q (Orb of Deception)"). A generated candidate whose `ability_name`
  // is only the slot letter again would render "Syndra Q (Q)", so the
  // redundant half is dropped rather than shown.
  if (!ps.abilityName || ps.abilityName === ps.subjectRef) return ref;
  return `${ref} (${ps.abilityName})`;
}

/**
 * Renders a prompt sentence for one of the atomic-recall shapes this slice
 * supports: ability cooldown recall, resource-cost recall, base-stat recall,
 * level-stat recall, and (Admin Generator Lab only) cooldown recall inside a
 * resolved setup state. Fails explicitly (never silently blanks) on a
 * template it does not recognise, so a future template cannot render as an
 * empty or misleading prompt.
 */
export function formatRecallPrompt(ps: MasteryPromptSemantics): string {
  switch (ps.template) {
    case "ability_cooldown_at_rank":
      return `At rank ${ps.context.abilityRank ?? "?"}, what is ${abilityLabel(ps)}'s cooldown, in seconds?`;
    case "ability_cooldown_flat":
      return `What is ${abilityLabel(ps)}'s cooldown, in seconds?`;
    case "ability_cost_at_rank":
      return `At rank ${ps.context.abilityRank ?? "?"}, how much${costNoun(ps)} does ${abilityLabel(ps)} cost?`;
    case "ability_cost_flat":
      return `How much${costNoun(ps)} does ${abilityLabel(ps)} cost?`;
    case "champion_base_stat":
      return `What is ${ps.championDisplay}'s base ${statName(ps.metric)}?`;
    case "champion_stat_at_level":
      return `At level ${ps.context.championLevel ?? "?"}, what is ${ps.championDisplay}'s ${statName(ps.metric)}?`;
    case "ability_cooldown_under_state": {
      // One template covers both shapes, exactly as `champion_stat_at_level`
      // covers a null level: a rank-invariant cooldown carries no rank,
      // because the backend collapsed it the same way the intrinsic flat
      // template is collapsed.
      const scenario = scenarioClause(ps);
      const rank = ps.context.abilityRank;
      const lead = rank === null ? `With ${scenario}` : `At rank ${rank} with ${scenario}`;
      return `${lead}, what is ${abilityLabel(ps)}'s cooldown, in seconds?`;
    }
    default: {
      // Exhaustiveness guard: PROMPT_TEMPLATES is a closed union, so an
      // unrecognised value can only reach here via a widened/future backend
      // value the contract reader's `oneOf` should have already rejected.
      const exhaustive: never = ps.template;
      throw new MasteryUnknownPromptTemplateError(exhaustive as unknown as string);
    }
  }
}
