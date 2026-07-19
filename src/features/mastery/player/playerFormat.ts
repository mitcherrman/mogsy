/**
 * Player-safe display formatting (J1).
 *
 * Pure helpers that turn backend-authoritative, engine-internal values into
 * plain-language, player-facing text. They NEVER compute correctness or canonical
 * values — they only relabel/round already-revealed data. Engine internals
 * (snapshot/artifact digests, raw function-call expressions, internal stat slugs,
 * A/B target codes, "authored/question-proposed" taxonomy) must never reach the
 * player UI; these helpers are the single place that translation happens.
 */

/** Human labels for internal stat/unit slugs. Unknown slugs are title-cased. */
const UNIT_LABELS: Record<string, string> = {
  ability_haste: "Ability Haste",
  ap: "AP",
  ability_power: "AP",
  magic_resist: "Magic Resist",
  magic_resistance: "Magic Resist",
  mr: "Magic Resist",
  armor: "Armor",
  attack_damage: "AD",
  ad: "AD",
  health: "HP",
  hp: "HP",
  mana: "Mana",
  gold: "Gold",
  seconds: "seconds",
  damage: "damage",
};

export function humanizeUnit(unit: string | null | undefined): string {
  if (!unit) return "";
  const key = unit.toLowerCase();
  if (UNIT_LABELS[key]) return UNIT_LABELS[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Capitalize a resource name for display ("mana" -> "Mana"). */
export function humanizeResource(resource: string | null | undefined): string {
  if (!resource) return "";
  return resource.charAt(0).toUpperCase() + resource.slice(1);
}

/**
 * Round a backend number for display: integers stay integers; non-integers round
 * to at most two decimals with trailing zeros stripped. Never shows long
 * floating-point tails (e.g. 0.769230… -> 0.77).
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/**
 * Map an internal A/B target code to a champion's display name. Falls back to the
 * raw code only if names are unavailable (should not happen in the player UI).
 */
export function championForTarget(
  target: string,
  championA: string,
  championB: string,
): string {
  const t = (target || "").trim().toUpperCase();
  if (t === "A") return championA;
  if (t === "B") return championB;
  return target;
}

/** Title-case a champion id/name for display ("ahri" -> "Ahri"). */
export function championName(id: string | null | undefined): string {
  if (!id) return "";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * A single clear player patch label. The backend patch string can read like
 * "Mixed verified snapshot — League 26.13 context"; players should see only
 * "Patch 26.13". If no version is present, fall back to a neutral scenario label
 * rather than exposing the internal snapshot wording.
 */
export function patchLabel(patchDisplay: string | null | undefined): string {
  const m = /(\d+\.\d+(?:\.\d+)?)/.exec(patchDisplay ?? "");
  if (m) {
    const parts = m[1].split(".");
    return `Patch ${parts[0]}.${parts[1]}`;
  }
  return "Fixed scenario";
}

/** Plain-language concept name for a question family (for the completion review). */
const FAMILY_LABELS: Record<string, string> = {
  cooldown_comparison: "Cooldown comparison",
  cooldown_with_haste: "Ability Haste cooldowns",
  raw_single_type_damage: "Ability damage",
  post_mitigation_single_type_damage: "Post-mitigation damage",
  health_remaining: "Damage & lethality",
};

export function humanizeFamily(family: string | null | undefined): string {
  if (!family) return "";
  const key = family.toLowerCase();
  if (FAMILY_LABELS[key]) return FAMILY_LABELS[key];
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "+20 Ability Haste" from an active-effect view (no internal slug, no dupes). */
export function effectLabel(effect: {
  label: string;
  magnitude: number | null;
  unit: string | null;
}): string {
  const unit = humanizeUnit(effect.unit);
  if (effect.magnitude !== null) {
    const sign = effect.magnitude >= 0 ? "+" : "";
    return `${sign}${formatNumber(effect.magnitude)}${unit ? ` ${unit}` : ""}`.trim();
  }
  // No magnitude: fall back to the backend label, stripped of any "(slug)" tail.
  return effect.label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
