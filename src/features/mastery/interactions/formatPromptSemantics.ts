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
 * Renders a prompt sentence for one of the four atomic-recall shapes this
 * slice supports: ability cooldown recall, resource-cost recall, base-stat
 * recall, level-stat recall. Fails explicitly (never silently blanks) on a
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
      return `At rank ${ps.context.abilityRank ?? "?"}, what does ${abilityLabel(ps)} cost?`;
    case "ability_cost_flat":
      return `What does ${abilityLabel(ps)} cost?`;
    case "champion_base_stat":
      return `What is ${ps.championDisplay}'s base ${humanizeMetric(ps.metric)}?`;
    case "champion_stat_at_level":
      return `At level ${ps.context.championLevel ?? "?"}, what is ${ps.championDisplay}'s ${humanizeMetric(ps.metric)}?`;
    default: {
      // Exhaustiveness guard: PROMPT_TEMPLATES is a closed union, so an
      // unrecognised value can only reach here via a widened/future backend
      // value the contract reader's `oneOf` should have already rejected.
      const exhaustive: never = ps.template;
      throw new MasteryUnknownPromptTemplateError(exhaustive as unknown as string);
    }
  }
}
