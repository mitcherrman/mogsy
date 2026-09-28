/**
 * JP2 — ONE WORDING FOR THE AD CATEGORIES A FORMULA CAN SCALE WITH.
 *
 * A damage formula can scale with base AD, bonus AD or TOTAL AD, and those are
 * different numbers. Where a formula names them side by side — a formula
 * recognition question offers "+70% bonus AD" beside "+70% AD" on purpose —
 * a bare "AD" reads as a typo of the other option rather than as the total.
 * So the player-facing wording always says which AD it means:
 *
 *   attack_damage        → "total AD"
 *   bonus_attack_damage  → "bonus AD"
 *   base_attack_damage   → "base AD"
 *
 * PRESENTATION ONLY. Nothing here changes what is submitted, graded or stored:
 * an option keeps its served string as its value, and only the label drawn on
 * its tablet goes through `explicitAdText`. The backend's formula option grammar
 * (`mastery/choices/formula_choices.render_formula`: `+N% <label>` terms,
 * labels `AD` / `bonus AD` / `AP`) is the one input it rewrites, and only the
 * bare `AD` term — every other character is left as served.
 */

const STAT_LABEL: Readonly<Record<string, string>> = {
  attack_damage: "total AD",
  bonus_attack_damage: "bonus AD",
  base_attack_damage: "base AD",
  ability_power: "AP",
};

/** A served ratio stat key → its player-facing name; the served label otherwise. */
export function ratioStatLabel(stat: string, servedLabel: string): string {
  return STAT_LABEL[stat] ?? servedLabel;
}

/** A served formula TEXT with every bare `+N% AD` term said as total AD. */
export function explicitAdText(text: string): string {
  return text.replace(/(\+\d+(?:\.\d+)?% )AD\b/g, "$1total AD");
}
