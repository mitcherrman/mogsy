/**
 * Shared, acronym-aware label formatter for Mastery question families.
 *
 * Backend question-family values are snake_case enum strings (e.g.
 * `casts_before_oom`). A naive title-case renders "Casts Before Oom", which
 * mangles the acronym. This formatter maps the known families to curated labels
 * and falls back to an acronym-aware humanizer so acronyms (OOM, AP, MR, HP…)
 * keep their casing wherever a family is surfaced (reviewer lists, inspectors).
 */

const FAMILY_LABELS: Readonly<Record<string, string>> = {
  cooldown_comparison: "Cooldown comparison",
  cooldown_with_haste: "Cooldown with haste",
  raw_single_type_damage: "Raw damage",
  post_mitigation_single_type_damage: "Post-mitigation damage",
  health_remaining: "Health remaining",
  ability_cost: "Ability cost",
  base_stat: "Base stat",
  casts_before_oom: "Casts before OOM",
  legal_recall_purchase: "Legal recall purchase",
  gold_remaining_after_purchase: "Gold remaining after purchase",
  item_stat_gain: "Item stat gain",
};

const ACRONYMS: Readonly<Record<string, string>> = {
  oom: "OOM",
  ap: "AP",
  ad: "AD",
  mr: "MR",
  hp: "HP",
  cdr: "CDR",
  ah: "AH",
};

/**
 * Format a snake_case question-family value into a friendly, acronym-aware
 * label. Unknown families are humanized token-by-token, preserving acronyms.
 */
export function formatQuestionFamily(family: string | null | undefined): string {
  if (!family) return "";
  const known = FAMILY_LABELS[family];
  if (known) return known;
  return family
    .split("_")
    .filter((w) => w.length > 0)
    .map((word, i) => {
      const acronym = ACRONYMS[word.toLowerCase()];
      if (acronym) return acronym;
      if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      return word.toLowerCase();
    })
    .join(" ");
}
