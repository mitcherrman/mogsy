/**
 * JOURNEY-UI1 — THE CLOSED STAT VOCABULARY a Journey board may show.
 *
 * The board carries PREMISE INPUTS only: the numbers a question is asked FROM.
 * Everything in this list is something a stated premise names — a champion's
 * attack damage, a target's armor, the haste an item grants. Deliberately NOT
 * in it, and therefore impossible to publish to the board under any name:
 *
 *   * cooldowns (base, effective, after haste) — cooldown families ask these;
 *   * damage (raw, post-mitigation) — Combat asks this;
 *   * effective / post-penetration resistances — Combat derives these;
 *   * any "result", "total damage", "time to kill" or similar output.
 *
 * A closed list is the safety property, not a convenience: the reader rejects
 * an unknown key outright, so a backend that tried to put a derived answer on
 * the board would fail to parse instead of rendering it. A stat that IS a
 * possible answer on some child (health or armor at a level) is still here —
 * those are withheld per child by the server (see `contract.ts`).
 *
 * Labels and units are owned HERE rather than sent as text, so the wire cannot
 * smuggle prose into a stat chip. The board never computes a stat; it formats
 * the server's number.
 */
export const JOURNEY_STAT_KEYS = [
  "health",
  "attack_damage",
  "bonus_attack_damage",
  "ability_power",
  "ability_haste",
  "armor",
  "magic_resist",
  "lethality",
  "armor_penetration_percent",
  "magic_penetration",
  "magic_penetration_percent",
] as const;

export type JourneyStatKey = (typeof JOURNEY_STAT_KEYS)[number];

export interface JourneyStatMeta {
  /** Chip label — short, as League writes it. */
  short: string;
  /** Detail-sheet label. */
  long: string;
  /** `percent` values are printed with a `%` suffix; nothing is converted. */
  unit: "flat" | "percent";
}

export const JOURNEY_STAT_META: Record<JourneyStatKey, JourneyStatMeta> = {
  health: { short: "HP", long: "Health", unit: "flat" },
  attack_damage: { short: "AD", long: "Attack damage", unit: "flat" },
  bonus_attack_damage: { short: "Bonus AD", long: "Bonus attack damage", unit: "flat" },
  ability_power: { short: "AP", long: "Ability power", unit: "flat" },
  ability_haste: { short: "AH", long: "Ability haste", unit: "flat" },
  armor: { short: "Armor", long: "Armor", unit: "flat" },
  magic_resist: { short: "MR", long: "Magic resist", unit: "flat" },
  lethality: { short: "Lethality", long: "Lethality", unit: "flat" },
  armor_penetration_percent: { short: "Armor pen", long: "Armor penetration", unit: "percent" },
  magic_penetration: { short: "Magic pen", long: "Magic penetration (flat)", unit: "flat" },
  magic_penetration_percent: { short: "Magic pen", long: "Magic penetration", unit: "percent" },
};

export function isJourneyStatKey(v: unknown): v is JourneyStatKey {
  return typeof v === "string" && (JOURNEY_STAT_KEYS as readonly string[]).includes(v);
}

/**
 * The server's number, printed with EVERY digit it has: canonical premises
 * carry them (an armor of 44.195, an attack damage of 70.1625 — J3 states the
 * latter with four decimals), and the board must not disagree with the
 * premise by rounding it. `toPrecision(12)` only strips binary float noise;
 * trailing zeros are dropped. Formatting only — never arithmetic.
 */
export function formatStatValue(value: number, key: JourneyStatKey): string {
  const text = Number.isInteger(value)
    ? String(value)
    : String(Number(value.toPrecision(12)));
  return JOURNEY_STAT_META[key].unit === "percent" ? `${text}%` : text;
}

/** A server DELTA, signed ("+20", "-5", "+10%"). Formatting only. */
export function formatStatGain(delta: number, key: JourneyStatKey): string {
  const text = formatStatValue(Math.abs(delta), key);
  return `${delta < 0 ? "-" : "+"}${text}`;
}
