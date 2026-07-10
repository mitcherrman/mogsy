import { supabase } from "@/integrations/supabase/client";

// Same convention as useChampionAssets: public meta endpoints on the Combat API.
const API_BASE_URL = (
  (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "https://web-production-83e53.up.railway.app"
).replace(/\/+$/, "");

export type SwipeGameMode = "opinion" | "knowledge";

export type SwipeGameConfig = {
  slug: string;
  title: string;
  prompt: string;
  mode: SwipeGameMode;
  entityType: "champion" | "item";
  description: string;
  /** Champion used for card art on hub tiles. */
  artChampion: string;
};

export const LEAGUE_SWIPE_GAMES: SwipeGameConfig[] = [
  {
    slug: "favorite-champion",
    title: "Favorite Champion",
    prompt: "Which champion do you like more?",
    mode: "opinion",
    entityType: "champion",
    description: "Choose your favorites and shape the community ranking.",
    artChampion: "Ahri",
  },
  {
    slug: "most-annoying-champion",
    title: "Most Annoying Champion",
    prompt: "Who is more annoying to play against?",
    mode: "opinion",
    entityType: "champion",
    description: "Vote on League's most tilting champions.",
    artChampion: "Teemo",
  },
  {
    slug: "higher-base-stat",
    title: "Stat Duel",
    prompt: "Which champion has the higher base stat?",
    mode: "knowledge",
    entityType: "champion",
    description: "Guess which champion has the higher stat.",
    artChampion: "Darius",
  },
  {
    slug: "item-cost-duel",
    title: "Item Cost Duel",
    prompt: "Which item costs more gold?",
    mode: "knowledge",
    entityType: "item",
    description: "Learn item costs through quick comparisons.",
    artChampion: "Ezreal",
  },
];

export function getSwipeGame(slug?: string): SwipeGameConfig | undefined {
  return LEAGUE_SWIPE_GAMES.find((g) => g.slug === slug);
}

// ---------------------------------------------------------------------------
// Backend data (champion base stats + item costs)
// ---------------------------------------------------------------------------

export type ChampionStats = {
  champion_name: string;
  hp: number;
  hp_per_level: number;
  ad: number;
  ad_per_level: number;
  armor: number;
  armor_per_level: number;
  magic_resist: number;
  magic_resist_per_level: number;
  move_speed: number;
  attack_range: number;
  attack_speed: number;
};

export type ItemMeta = {
  item_name: string;
  item_type: string | null;
  cost: number | null;
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed: ${path} (${res.status})`);
  return (await res.json()) as T;
}

export async function fetchChampionNames(): Promise<string[]> {
  const data = await getJson<{ champions?: string[] }>("/api/meta/champions");
  return data.champions ?? [];
}

export async function fetchChampionStats(): Promise<ChampionStats[]> {
  const data = await getJson<{ champion_stats?: ChampionStats[] }>("/api/meta/champion-stats");
  return data.champion_stats ?? [];
}

export async function fetchItems(): Promise<ItemMeta[]> {
  const data = await getJson<{ items?: ItemMeta[] }>("/api/meta/items");
  return (data.items ?? []).filter((i) => typeof i.cost === "number" && i.cost > 0);
}

// ---------------------------------------------------------------------------
// Matchup generation
// ---------------------------------------------------------------------------

/** Stats interesting enough to quiz on, with human labels. */
export const STAT_KEYS: Array<{ key: keyof ChampionStats; label: string; unit?: string }> = [
  { key: "hp", label: "Base HP" },
  { key: "ad", label: "Base Attack Damage" },
  { key: "armor", label: "Base Armor" },
  { key: "magic_resist", label: "Base Magic Resist" },
  { key: "move_speed", label: "Move Speed" },
  { key: "attack_range", label: "Attack Range" },
];

function pickTwo<T>(pool: T[]): [T, T] {
  const i = Math.floor(Math.random() * pool.length);
  let j = Math.floor(Math.random() * (pool.length - 1));
  if (j >= i) j += 1;
  return [pool[i], pool[j]];
}

export type SwipeMatchup = {
  /** Full prompt shown above the cards (stat duels include the stat name). */
  prompt: string;
  left: { id: string; label: string; sublabel?: string; value?: number };
  right: { id: string; label: string; sublabel?: string; value?: number };
  correctId?: string;
  /** Stored in the result row for factual context. */
  context?: Record<string, unknown>;
  explanation?: string;
  valueUnit?: string;
};

export function makeOpinionMatchup(game: SwipeGameConfig, champions: string[]): SwipeMatchup {
  const [a, b] = pickTwo(champions);
  return {
    prompt: game.prompt,
    left: { id: a, label: a },
    right: { id: b, label: b },
  };
}

export function makeStatMatchup(game: SwipeGameConfig, stats: ChampionStats[]): SwipeMatchup {
  // Retry until the two champions differ on the chosen stat.
  for (let attempt = 0; attempt < 25; attempt++) {
    const stat = STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)];
    const [a, b] = pickTwo(stats);
    const va = Number(a[stat.key]);
    const vb = Number(b[stat.key]);
    if (!Number.isFinite(va) || !Number.isFinite(vb) || va === vb) continue;
    const winner = va > vb ? a : b;
    return {
      prompt: `Which champion has the higher ${stat.label.toLowerCase()}?`,
      left: { id: a.champion_name, label: a.champion_name, value: va },
      right: { id: b.champion_name, label: b.champion_name, value: vb },
      correctId: winner.champion_name,
      context: { stat: stat.key, statLabel: stat.label },
      explanation: `${winner.champion_name} has ${Math.max(va, vb)} ${stat.label.toLowerCase()} vs ${Math.min(va, vb)}.`,
    };
  }
  // Extremely unlikely fallback: just compare HP of two champions.
  const [a, b] = pickTwo(stats);
  return makeStatMatchup(game, a.hp === b.hp ? stats : [a, b]);
}

export function makeItemCostMatchup(game: SwipeGameConfig, items: ItemMeta[]): SwipeMatchup {
  for (let attempt = 0; attempt < 25; attempt++) {
    const [a, b] = pickTwo(items);
    if (a.cost === b.cost) continue;
    const winner = (a.cost ?? 0) > (b.cost ?? 0) ? a : b;
    const loser = winner === a ? b : a;
    return {
      prompt: game.prompt,
      left: { id: a.item_name, label: a.item_name, sublabel: a.item_type ?? undefined, value: a.cost ?? 0 },
      right: { id: b.item_name, label: b.item_name, sublabel: b.item_type ?? undefined, value: b.cost ?? 0 },
      correctId: winner.item_name,
      context: { stat: "cost" },
      explanation: `${winner.item_name} costs ${winner.cost}g vs ${loser.item_name} at ${loser.cost}g.`,
      valueUnit: "g",
    };
  }
  const [a, b] = pickTwo(items);
  return makeItemCostMatchup(game, a.cost === b.cost ? items : [a, b]);
}

// ---------------------------------------------------------------------------
// Result recording
// ---------------------------------------------------------------------------

export type SwipeRevealAggregates = {
  matchupId: string;
  entityA: string;
  entityB: string;
  votesA: number;
  votesB: number;
  totalVotes: number;
  isCorrect: boolean | null;
  ratingChange: number | null;
  selectedRating: number | null;
  otherRating: number | null;
};

export async function recordSwipeResult(params: {
  gameSlug: string;
  selected: string;
  other: string;
  correct?: string;
  selectedValue?: number;
  otherValue?: number;
  responseTimeMs?: number;
  context?: Record<string, unknown>;
}): Promise<SwipeRevealAggregates | null> {
  // Tables/RPC are newer than the generated Database types — cast around them.
  const { data, error } = await (supabase.rpc as CallableFunction)("record_league_swipe_result", {
    p_game_slug: params.gameSlug,
    p_selected: params.selected,
    p_other: params.other,
    p_correct_entity: params.correct ?? null,
    p_selected_value: params.selectedValue ?? null,
    p_other_value: params.otherValue ?? null,
    p_response_time_ms: params.responseTimeMs ?? null,
    p_context: params.context ?? null,
  });
  if (error) {
    console.error("record_league_swipe_result failed:", error);
    return null;
  }
  return (data ?? null) as SwipeRevealAggregates | null;
}
