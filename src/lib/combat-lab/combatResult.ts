/**
 * User-facing model of "what just happened" for the Combat Lab's result panel.
 *
 * The engine's events are internal records: a basic attack arrives as
 * `{ type: "damage_packet", state: "BASIC_ATTACK_DAMAGE", … }`, a heal as
 * `{ type: "heal", damage_type: "healing", metadata: { final_heal } }`. Those
 * tokens are implementation names and used to leak into the panel, where
 * `damage_packet` read as the name of the action. This module keeps them out of
 * the production UI and turns the same response data into terms a player uses:
 * an amount, what kind of amount it is, and who it landed on.
 *
 * Everything returned here is read from the response. Nothing is estimated: an
 * action that reports no damage summarizes as "no damage", not as a guess.
 */
import type { TimelineEvent } from "@/lib/combat-lab/api";

/** Engine type/state tokens that must never be shown as an action name. */
const INTERNAL_TOKEN = /^[a-z0-9]+(?:_[a-z0-9]+)+$|^[A-Z0-9]+(?:_[A-Z0-9]+)+$/;

const KNOWN_INTERNAL_TOKENS = new Set([
  "damage_packet",
  "item_damage",
  "champion_damage",
  "champion_ability",
  "champion_passive",
  "rune_damage",
  "summoner_damage",
  "dot_damage",
  "execute_damage",
  "item_heal",
  "item_shield",
  "rune_heal",
  "rune_shield",
  "summoner_heal",
  "heal",
  "shield",
  "event",
]);

/**
 * True when a value must not be shown to a normal user as an action name:
 * engine vocabulary (snake_case / SCREAMING_CASE tokens, the known type names),
 * blanks, and anything that is not a string at all.
 */
export function isInternalEngineToken(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const v = value.trim();
  if (!v) return true;
  if (KNOWN_INTERNAL_TOKENS.has(v.toLowerCase())) return true;
  return INTERNAL_TOKEN.test(v);
}

/**
 * A display name for an event, or null when every candidate field on it is
 * engine vocabulary. Callers fall back to the action label they already hold —
 * the page always knows which action it cast, so there is never a need to show
 * a raw token.
 */
export function userFacingEventName(event: TimelineEvent | null | undefined): string | null {
  if (!event) return null;
  for (const key of ["event", "name", "source"] as const) {
    const raw = event[key];
    if (typeof raw === "string" && raw.trim() && !isInternalEngineToken(raw)) {
      return raw.trim();
    }
  }
  return null;
}

/**
 * Plain words for the engine's record names, used only when an event carries no
 * readable source of its own. Keeps the last-resort label honest without
 * inventing detail the record does not have.
 */
const TYPE_WORDS: Record<string, string> = {
  damage_packet: "Damage",
  item_damage: "Item damage",
  rune_damage: "Rune damage",
  summoner_damage: "Summoner damage",
  champion_damage: "Ability damage",
  champion_ability: "Ability",
  champion_passive: "Passive",
  dot_damage: "Damage over time",
  execute_damage: "Execute damage",
  heal: "Healing",
  item_heal: "Item healing",
  rune_heal: "Rune healing",
  summoner_heal: "Summoner healing",
  shield: "Shield",
  item_shield: "Item shield",
  rune_shield: "Rune shield",
};

/**
 * What to call an event in production UI.
 *
 * Prefers whatever readable name the event already carries (`event`, `name`,
 * then `source` — "Basic Attack", "Aatrox Q1", an item name), and only if all of
 * those are engine vocabulary falls back to a plain word for its record type. A
 * raw token such as `damage_packet` is never returned.
 */
export function getEventDisplayLabel(event: TimelineEvent | null | undefined): string {
  const readable = userFacingEventName(event);
  if (readable) return readable;
  const type = typeof event?.type === "string" ? event.type.trim().toLowerCase() : "";
  if (type) {
    if (TYPE_WORDS[type]) return TYPE_WORDS[type];
    return type
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return "Event";
}

export type CombatResultTone =
  | "physical"
  | "magic"
  | "true"
  | "mixed"
  | "healing"
  | "shield"
  | "none";

export type CombatResultSummary = {
  tone: CombatResultTone;
  /** Headline figure, or null when the action produced no numeric outcome. */
  amount: number | null;
  /** Word that follows the figure: "PHYSICAL DAMAGE", "HEALING", "NO DAMAGE". */
  headline: string;
  damage: number;
  byType: { physical: number; magic: number; true: number; other: number };
  healing: number;
  shielded: number;
};

function classify(damageType: unknown): "physical" | "magic" | "true" | "healing" | "other" {
  const t = String(damageType ?? "").toLowerCase();
  if (!t) return "other";
  if (t.includes("phys")) return "physical";
  if (t.includes("mag")) return "magic";
  if (t.includes("true")) return "true";
  if (t.includes("heal")) return "healing";
  return "other";
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metadataOf(event: TimelineEvent): Record<string, unknown> {
  const meta = (event as Record<string, unknown>).metadata;
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

/** Healing an event reports, from its own metadata only. */
function healOf(event: TimelineEvent): number {
  const isHeal =
    classify(event.damage_type) === "healing" ||
    String(event.type ?? "").toLowerCase().includes("heal");
  if (!isHeal) return 0;
  const meta = metadataOf(event);
  const value = meta.final_heal ?? meta.heal ?? meta.heal_amount ?? meta.healing;
  return Math.max(0, numeric(value));
}

/** Shield an event reports, from its own metadata only. */
function shieldOf(event: TimelineEvent): number {
  const isShield = String(event.type ?? "").toLowerCase().includes("shield");
  if (!isShield) return 0;
  const meta = metadataOf(event);
  const value = meta.shield ?? meta.shield_amount ?? meta.shield_absorbed;
  return Math.max(0, numeric(value));
}

export type CombatResultInput = {
  /** Total mitigated damage the action dealt, as already tallied by the page. */
  final_damage?: number;
  damage_type?: string | null;
  /** Damage the defender's shield absorbed, as already tallied by the page. */
  shield_absorbed?: number;
  events?: TimelineEvent[];
};

/**
 * Fold one action's response into the panel's display model.
 *
 * Per-type damage is read from the events when they carry types, and falls back
 * to the action's own total when they do not, so a response that only reports a
 * total still shows the right figure with a generic "DAMAGE" word.
 */
export function summarizeCombatResult(input: CombatResultInput): CombatResultSummary {
  const events = Array.isArray(input.events) ? input.events : [];
  const byType = { physical: 0, magic: 0, true: 0, other: 0 };
  let typedDamage = 0;
  let healing = 0;
  let shielded = 0;

  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const dmg = Math.max(0, numeric(event.final_damage ?? event.damage));
    if (dmg > 0) {
      const kind = classify(event.damage_type);
      const bucket = kind === "healing" ? "other" : kind;
      byType[bucket] += dmg;
      typedDamage += dmg;
    }
    healing += healOf(event);
    shielded += shieldOf(event);
  }

  const total = Math.max(0, numeric(input.final_damage));
  const damage = typedDamage > 0 ? typedDamage : total;
  if (typedDamage === 0 && total > 0) {
    const kind = classify(input.damage_type);
    byType[kind === "healing" ? "other" : kind] += total;
  }
  shielded = Math.max(shielded, Math.max(0, numeric(input.shield_absorbed)));

  if (damage > 0) {
    const present = (["physical", "magic", "true"] as const).filter((k) => byType[k] > 0);
    if (present.length === 1 && byType.other === 0) {
      const only = present[0];
      return {
        tone: only,
        amount: damage,
        headline: `${only === "true" ? "TRUE" : only.toUpperCase()} DAMAGE`,
        damage,
        byType,
        healing,
        shielded,
      };
    }
    // Several types at once, or a total the response never typed — either way
    // naming one type would be a claim the data does not support.
    return {
      tone: "mixed",
      amount: damage,
      headline: present.length > 1 ? "MIXED DAMAGE" : "DAMAGE",
      damage,
      byType,
      healing,
      shielded,
    };
  }

  if (healing > 0) {
    return { tone: "healing", amount: healing, headline: "HEALING", damage: 0, byType, healing, shielded };
  }
  if (shielded > 0) {
    return { tone: "shield", amount: shielded, headline: "SHIELDED", damage: 0, byType, healing, shielded };
  }
  return { tone: "none", amount: 0, headline: "NO DAMAGE", damage: 0, byType, healing, shielded };
}
