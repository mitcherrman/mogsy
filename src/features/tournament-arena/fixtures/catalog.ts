/**
 * The Host Portal's catalog: what `GET /api/arena/catalog` (PROPOSED) would
 * serve. Only the game types the audit marked ELIGIBLE for two humans on the
 * Ranked engine (§2.4): Role Challenge and Champion Card Duel are listed as
 * "later" so the picker is honest about them.
 */
import { MODE_ACCENT } from "@/lib/public-modes/gallery";

export interface ArenaGameType {
  id: string;
  title: string;
  blurb: string;
  accent: string;
  /** What one "module" is in this game. */
  unit: string;
  defaultModules: number;
  modulesRange: [number, number];
  defaultSeconds: number;
  rulesets: readonly ("standard" | "time_trial" | "survival")[];
  availability: "eligible" | "later";
  note?: string;
}

export const GAME_TYPES: readonly ArenaGameType[] = [
  { id: "ranked_quiz", title: "Ranked Quiz", blurb: "Ten knowledge modules, points for correct answers and a bonus for speed. The Ranked ladder format.", accent: "#e3c66f", unit: "questions", defaultModules: 10, modulesRange: [5, 15], defaultSeconds: 20, rulesets: ["standard", "time_trial", "survival"], availability: "eligible" },
  { id: "match_grid", title: "Match Grid", blurb: "Pair every tile on the board. A clean board scores; a wrong pair costs time.", accent: MODE_ACCENT.match_grid, unit: "boards", defaultModules: 3, modulesRange: [1, 5], defaultSeconds: 60, rulesets: ["standard"], availability: "eligible" },
  { id: "reconstruct", title: "Reconstruct", blurb: "Rebuild an item from its components before the clock runs out.", accent: MODE_ACCENT.reconstruct, unit: "builds", defaultModules: 4, modulesRange: [2, 8], defaultSeconds: 45, rulesets: ["standard"], availability: "eligible" },
  { id: "order_forge", title: "Order Forge", blurb: "Put abilities, items and events in their true order.", accent: MODE_ACCENT.order_forge, unit: "sequences", defaultModules: 4, modulesRange: [2, 8], defaultSeconds: 40, rulesets: ["standard"], availability: "eligible" },
  { id: "chronoscope", title: "Chronoscope", blurb: "Scrub to the patch where a number changed. Closest wins the round.", accent: MODE_ACCENT.chronoscope, unit: "scrubs", defaultModules: 5, modulesRange: [3, 10], defaultSeconds: 30, rulesets: ["standard"], availability: "eligible" },
  { id: "roster_lock", title: "Roster Lock", blurb: "Lock the five who played. Pro play memory under pressure.", accent: MODE_ACCENT.roster_lock, unit: "rosters", defaultModules: 3, modulesRange: [1, 6], defaultSeconds: 45, rulesets: ["standard"], availability: "eligible" },
  { id: "journey", title: "Journey", blurb: "A seeded run where every player sees identical content: the fairest format across a bracket.", accent: "#9ad6c2", unit: "stages", defaultModules: 6, modulesRange: [3, 10], defaultSeconds: 25, rulesets: ["standard"], availability: "eligible" },
  { id: "role_challenge", title: "Role Challenge", blurb: "A role-specific gauntlet.", accent: "#c6a8e8", unit: "questions", defaultModules: 8, modulesRange: [8, 8], defaultSeconds: 20, rulesets: ["standard"], availability: "later", note: "Compose cost; deferred past v1" },
  { id: "champion_card_duel", title: "Champion Card Duel", blurb: "Stat-card rooms on a separate engine.", accent: "#f07a8e", unit: "rounds", defaultModules: 5, modulesRange: [5, 5], defaultSeconds: 15, rulesets: ["standard"], availability: "later", note: "Different engine; an adapter comes later" },
];

export const TOPICS: readonly { id: string; label: string }[] = [
  { id: "champions", label: "Champions" },
  { id: "items", label: "Items" },
  { id: "abilities", label: "Abilities" },
  { id: "patches", label: "Patch notes" },
  { id: "pro_play", label: "Pro play" },
  { id: "worlds", label: "Worlds" },
  { id: "lore", label: "Lore" },
  { id: "runes", label: "Runes" },
];

export function gameTypeById(id: string): ArenaGameType {
  return GAME_TYPES.find((g) => g.id === id) ?? GAME_TYPES[0];
}
