/**
 * RG2 — the ONE user-facing question taxonomy, on the client side.
 *
 * The backend decides WHICH subject a question is (`quiz/public_category.py`);
 * this file decides what that subject LOOKS LIKE. That split is the whole
 * design: classification needs the family contract, the pool specs and the
 * seeding scripts, none of which exist in TypeScript, while art needs the
 * lobby's approved tiles and the asset-host rule, which do not exist in
 * Python. So the wire carries a stable key and each side owns the half it can
 * actually be right about.
 *
 * WHAT THIS REPLACES
 * ──────────────────
 * A private `CATEGORY_TO_STRIP` map inside `workspace/questionIcons.ts`, which
 * reconciled three vocabularies (generator slugs, human labels, tile ids) in
 * one component's file, applied to one surface, and could not be checked
 * against the family contract that defines the bank. `questionIcons.ts` now
 * delegates here, so the match record, the arena timeline and any later
 * surface print the same picture for the same subject by construction rather
 * than by two maps agreeing.
 *
 * ART REUSE, IN ORDER
 * ───────────────────
 * The six lobby tiles are used exactly as they are — same ids, same files, one
 * resolver (`resolveCategoryIconUrl`). The four categories the RG2 audit added
 * have no tile: two take real League art already on the asset host, and two
 * are DRAWN marks. A drawn mark is the honest answer for a subject with no
 * single entity to photograph — "Scenarios" is not a picture of anything, and
 * borrowing an item icon for it would say something false, which is the
 * mistake the Meta Reflex mark was introduced to undo.
 */
import {
  QUIZ_CATEGORY_ICONS,
  resolveCategoryIconUrl,
} from "@/components/quiz/QuizCategoryStrip";

/** Keys of the shared contract. These MUST match `quiz/public_category.py`. */
export const PUBLIC_CATEGORY_KEYS = [
  "objectives",
  "wave-management",
  "summoner-spells",
  "itemization",
  "abilities",
  "vision",
  "champion-stats",
  "runes",
  "scenarios",
  "fundamentals",
] as const;

export type PublicCategoryKey = (typeof PUBLIC_CATEGORY_KEYS)[number];

/** Not a category — a module. Its own node treatment, its own mark. */
export const META_REFLEX_CATEGORY = "meta-reflex";
/** The honest fallback: a subject the taxonomy has not classified. */
export const GENERAL_CATEGORY = "general";

export type CategoryKey =
  | PublicCategoryKey
  | typeof META_REFLEX_CATEGORY
  | typeof GENERAL_CATEGORY;

/** A drawn mark used INSTEAD of art, for a subject with no single entity. */
export type CategoryGlyph =
  | "meta-reflex"
  | "scenario"
  | "champion-stat"
  | "fundamental"
  | "unknown";

export interface CategoryArt {
  label: string;
  /** Backend- or app-relative art path, or undefined when a glyph is used. */
  iconPath?: string;
  glyph?: CategoryGlyph;
}

/** The lobby tiles, by id, so their art is READ rather than restated. */
const LOBBY_TILE = new Map(QUIZ_CATEGORY_ICONS.map((c) => [c.id, c]));

function lobby(id: string, fallbackLabel: string): CategoryArt {
  const tile = LOBBY_TILE.get(id);
  return { label: tile?.full ?? fallbackLabel, iconPath: tile?.iconPath };
}

/**
 * Art for every category key.
 *
 * The six lobby entries deliberately carry no path of their own — they read
 * the strip's, so a tile swapped on the hub changes every timeline with it and
 * the two cannot drift into disagreeing about what Objectives looks like.
 */
export const CATEGORY_ART: Record<CategoryKey, CategoryArt> = {
  objectives: lobby("objectives", "Objectives"),
  "wave-management": lobby("wave-management", "Wave Management"),
  "summoner-spells": lobby("summoner-spells", "Summoner Spells"),
  itemization: lobby("itemization", "Itemization"),
  abilities: lobby("abilities", "Abilities & Cooldowns"),
  vision: lobby("vision", "Vision"),
  // Real art, already on the asset host and already served for rune questions.
  // Conqueror is the most legible keystone at 32px and reads as "rune" rather
  // than as one specific choice, which a tree crest would not.
  runes: { label: "Runes", iconPath: "assets/runes/Conqueror.png" },
  // DRAWN. A champion-stats question is about a champion's own numbers, and
  // the node almost always shows that CHAMPION's portrait (see
  // `resolveSubjectIcon`). This mark is only the fallback for the questions
  // whose champion is the answer and therefore cannot be shown.
  "champion-stats": { label: "Champion Stats", glyph: "champion-stat" },
  // DRAWN. Not a picture of anything: a scenario is a situation.
  scenarios: { label: "Scenarios", glyph: "scenario" },
  // DRAWN. The rules of the game rather than an entity in it.
  fundamentals: { label: "Fundamentals", glyph: "fundamental" },
  "meta-reflex": { label: "Meta Reflex", glyph: "meta-reflex" },
  general: { label: "Question", glyph: "unknown" },
};

const KNOWN = new Set<string>([
  ...PUBLIC_CATEGORY_KEYS,
  META_REFLEX_CATEGORY,
  GENERAL_CATEGORY,
]);

/**
 * Read a category key off the wire.
 *
 * A key this build does not know resolves to `general` rather than throwing:
 * the taxonomy is expected to grow, a client is expected to lag a deploy, and
 * a neutral mark is a correct rendering of "a subject this build has no art
 * for". It is never a reason to fail a live match's timeline.
 */
export function asCategoryKey(raw: unknown): CategoryKey {
  return typeof raw === "string" && KNOWN.has(raw)
    ? (raw as CategoryKey)
    : GENERAL_CATEGORY;
}

export function categoryArt(key: CategoryKey): CategoryArt {
  return CATEGORY_ART[key] ?? CATEGORY_ART.general;
}

export function categoryLabel(key: CategoryKey): string {
  return categoryArt(key).label;
}

/** Resolved through the strip's own host rule — see `resolveCategoryIconUrl`. */
export function categoryIconUrl(key: CategoryKey): string | undefined {
  const path = categoryArt(key).iconPath;
  return path ? resolveCategoryIconUrl(path) : undefined;
}

// ─────────────────────────────────────────────────────── difficulty tiers

/**
 * The public difficulty vocabulary. FOUR tiers, not three.
 *
 * `scenario` is Ranked's peak and is not a synonym for `hard`: the format
 * schedules them as two different beats (segment 6 is a hard peak that segment
 * 7 resets; segment 10 is the scenario peak that segment 12 resets), and
 * collapsing them would erase the shape of a match. It is spelt `tier` on the
 * wire because `difficulty` is the raw stored source column, which no payload
 * is allowed to carry.
 */
export const DIFFICULTY_TIERS = ["easy", "medium", "hard", "scenario"] as const;
export type DifficultyTier = (typeof DIFFICULTY_TIERS)[number];

/** `null` for anything that is not a known tier — including a missing value. */
export function asDifficultyTier(raw: unknown): DifficultyTier | null {
  return typeof raw === "string" && (DIFFICULTY_TIERS as readonly string[]).includes(raw)
    ? (raw as DifficultyTier)
    : null;
}


// ───────────────────────────────────── the deploy-skew bridge (transitional)

/**
 * A RAW stored category string -> a public key.
 *
 * THIS IS A BRIDGE, NOT THE TAXONOMY. Classification belongs to
 * `quiz/public_category.py`, which is the only place that can see the family
 * contract, the pool specs and the seeding scripts, and every payload from an
 * RG2 backend carries its answer as a `topic.category` key. This table exists
 * for exactly one situation: a client that has deployed ahead of the backend,
 * reading a match record whose rounds carry the old raw `category` string and
 * no topic at all. Without it a player's whole history would go neutral for
 * however long the two deploys are apart.
 *
 * It is deliberately SMALLER than the Python map — only the twenty category
 * names that hold live rows — because it is not trying to be complete. It is
 * trying to keep yesterday's records legible until the backend catches up, and
 * an unrecognised string resolving to `general` is the correct outcome for
 * everything else.
 *
 * DELETE IT once no reachable payload can omit `topic`.
 */
const LEGACY_CATEGORY_STRINGS: Record<string, PublicCategoryKey> = {
  champion_ability_cooldowns: "abilities",
  champion_ability_recognition: "abilities",
  champion_ability_identity: "abilities",
  ability_identity: "abilities",
  post_mitigation_damage: "scenarios",
  item_costs: "itemization",
  item_exact_stats: "itemization",
  item_stat_diversity: "itemization",
  item_stats: "itemization",
  item_recognition: "itemization",
  item_builds_into: "itemization",
  item_build_paths: "itemization",
  item_components: "itemization",
  item_recipe: "itemization",
  item_comparison: "itemization",
  purchase_history_total: "itemization",
  flat_inventory_stat_total: "itemization",
  champion_attack_types: "champion-stats",
  champion_base_stats: "champion-stats",
  champion_resources: "champion-stats",
  champion_identity: "champion-stats",
  runes: "runes",
  rune_recognition: "runes",
  rune_identity: "runes",
  summoner_spells: "summoner-spells",
  summoner_spell_cooldowns: "summoner-spells",
  summoner_spell_recognition: "summoner-spells",
  summoner_spell_identity: "summoner-spells",
  objective_timers: "objectives",
  objectives: "objectives",
  jungle_camps: "objectives",
  minion_waves: "wave-management",
  wave_management: "wave-management",
  vision: "vision",
  game_fundamentals: "fundamentals",
  fundamentals: "fundamentals",
  // The public keys themselves, so a string that is already one round-trips.
  // (`runes`, `vision` and `objectives` are already above — a public key and a
  // stored category name happen to coincide for those three.)
  itemization: "itemization",
  abilities: "abilities",
  scenarios: "scenarios",
};

/** Lowercased and punctuation-flattened: `Item Costs` and `item_costs` collide. */
export function normalizeCategoryString(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Best-effort key for a payload that predates `topic`. `general` when the
 * string is one this bridge does not carry — never a guessed neighbour.
 */
export function legacyCategoryKey(raw: string | null | undefined): CategoryKey {
  if (!raw) return GENERAL_CATEGORY;
  const key = normalizeCategoryString(raw);
  return LEGACY_CATEGORY_STRINGS[key]
    ?? LEGACY_CATEGORY_STRINGS[key.endsWith("s") ? key.slice(0, -1) : `${key}s`]
    ?? GENERAL_CATEGORY;
}
