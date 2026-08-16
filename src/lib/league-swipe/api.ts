import { supabase } from "@/integrations/supabase/client";
import { resolveFactualCategory } from "@/lib/league-swipe/factualCategories";

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

/**
 * Item Cost Duel entities, from the SHARED factual-duel provider.
 *
 * NOT `/api/meta/items`. That endpoint is Combat Lab's restricted
 * simulatable-item vocabulary (125 rows), never a cost feed — and it reads the
 * unmaintained `items.cost` column, which disagrees with the canonical
 * `item_sheet_metadata` sheet on 24 items. For Axiom Arc vs Chempunk
 * Chainsword the two stores pick OPPOSITE winners, so standalone and Ranked
 * were teaching contradictory answers for the same pair.
 *
 * `/api/meta-reflex/factual/pool/item-cost-duel` serves the same canonical pool
 * Ranked's module is handed (`ranked_item_catalog.load_duel_item_pool`), so the
 * two modes cannot diverge again.
 */
export async function fetchItems(): Promise<ItemMeta[]> {
  const data = await getJson<{ entities?: FactualEntity[] }>(
    "/api/meta-reflex/factual/pool/item-cost-duel",
  );
  return (data.entities ?? [])
    .filter((e) => typeof e.value === "number" && e.value > 0)
    .map((e) => ({ item_name: e.id, item_type: null, cost: e.value }));
}

/** One entity from the shared factual-duel pool. */
export type FactualEntity = {
  id: string;
  label: string;
  value: number;
  asset_path: string | null;
};

/** Server-side verdict for one factual answer. Never accepts a client claim. */
export type FactualVerdict = {
  category_id: string;
  correct_id: string | null;
  verified_correct: boolean | null;
  verdict_source: string;
  reason: string | null;
};

/**
 * Ask the backend to judge a factual answer from canonical data.
 *
 * Deliberately sends only WHICH entity was picked — there is no parameter
 * through which the browser could assert whether it was right. Returns null on
 * transport failure; callers must treat that as "unjudged", never as wrong.
 */
export async function verifyFactualChoice(
  categoryId: string,
  selected: string,
  other: string,
): Promise<FactualVerdict | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/meta-reflex/factual/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: categoryId, selected, other }),
    });
    if (!res.ok) return null;
    return (await res.json()) as FactualVerdict;
  } catch {
    return null;
  }
}

/** One answer to be judged. Carries no correctness claim, by construction. */
export type FactualVerifyItem = { category_id: string; selected: string; other: string };

/** Matches the backend's MAX_BATCH; callers chunk rather than get a 422. */
export const FACTUAL_VERIFY_BATCH_LIMIT = 200;

/**
 * Judge many stored answers in one round trip — the read half of derive-on-read.
 *
 * WHY READERS DERIVE INSTEAD OF READING A STORED VERDICT
 * `league_swipe_results.verified_correct` is NULL for every row and stays that
 * way. Writing it would need a privileged Supabase writer (service-role key or
 * a definer function that accepts `verified_correct` from its caller), and the
 * trust audit established that neither would actually create a server verdict:
 * the backend authenticates AS THE CALLER, so a function trusting its caller is
 * a function trusting the browser. Rather than build a boundary that only looks
 * like one, correctness is derived at read time from canonical data.
 *
 * Returns verdicts positionally aligned with `items`. On transport failure every
 * entry comes back unjudged — never wrong.
 */
export async function verifyFactualBatch(
  items: FactualVerifyItem[],
): Promise<Array<FactualVerdict | null>> {
  if (items.length === 0) return [];
  const out: Array<FactualVerdict | null> = [];
  for (let i = 0; i < items.length; i += FACTUAL_VERIFY_BATCH_LIMIT) {
    const chunk = items.slice(i, i + FACTUAL_VERIFY_BATCH_LIMIT);
    try {
      const res = await fetch(`${API_BASE_URL}/api/meta-reflex/factual/verify-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chunk }),
      });
      if (!res.ok) {
        out.push(...chunk.map(() => null));
        continue;
      }
      const body = (await res.json()) as { verdicts?: FactualVerdict[] };
      const verdicts = body.verdicts ?? [];
      // Length mismatch would silently misalign verdicts with rows — a player
      // would see someone else's answer marked against their question.
      if (verdicts.length !== chunk.length) {
        out.push(...chunk.map(() => null));
        continue;
      }
      out.push(...verdicts);
    } catch {
      out.push(...chunk.map(() => null));
    }
  }
  return out;
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
  /**
   * True when the RPC recognised this `clientSubmissionId` and returned the
   * FIRST submission's outcome instead of writing a second row. Reading a field
   * the v2 RPC already returns — nothing new is asked of the server.
   *
   * The counts alongside it are still the real ones for the pair, so the reveal
   * needs no special case; this is here so a retry path can tell "the write
   * landed just now" from "the write had already landed".
   */
  duplicate?: boolean;
};

// ---------------------------------------------------------------------------
// Stats portal (read-only)
// ---------------------------------------------------------------------------

// The league_swipe_* tables/RPCs postdate the generated Database types.
const sb = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type SwipeMatchupStat = {
  game: string;
  gameTitle?: string;
  entityA: string;
  entityB: string;
  votesA: number;
  votesB: number;
  total: number;
};

/**
 * Shape returned by `get_league_swipe_stats`.
 *
 * DEAD FIELDS — do not read: `totals.correct`, `totals.incorrect`,
 * `totals.accuracy`, `perGame[].accuracy`, and `mostMissed`. All five are
 * computed in SQL from `league_swipe_results.is_correct`, which the v2 vote RPC
 * writes NULL unconditionally (it was a browser claim the database trusted).
 * They are not "empty until there is data" — they are structurally empty
 * forever. Use `fetchFactualCommunityAccuracy()` instead, which derives the same
 * numbers from public vote aggregates judged by the canonical backend verifier.
 *
 * They are kept in the type because the RPC still returns them; retiring them
 * needs a Supabase migration, which is a separate, manually-applied change.
 */
export type SwipeGlobalStats = {
  totals: {
    swipes: number;
    opinionVotes: number;
    knowledgeAnswers: number;
    /** @deprecated always 0 — see the note on SwipeGlobalStats. */
    correct: number;
    /** @deprecated always 0 — see the note on SwipeGlobalStats. */
    incorrect: number;
    /** @deprecated always null — see the note on SwipeGlobalStats. */
    accuracy: number | null;
    avgResponseMs: number | null;
    uniqueMatchups: number;
  };
  perGame: Array<{
    slug: string; title: string; mode: SwipeGameMode; swipes: number;
    /** @deprecated always null — see the note on SwipeGlobalStats. */
    accuracy: number | null;
  }>;
  /** @deprecated always empty — see the note on SwipeGlobalStats. */
  mostMissed: Array<{ game: string; entityA: string; entityB: string; correct: string | null; missCount: number }>;
  mostVoted: SwipeMatchupStat[];
  closest: SwipeMatchupStat[];
  blowouts: SwipeMatchupStat[];
};

export async function fetchSwipeStats(): Promise<SwipeGlobalStats> {
  const { data, error } = await sb.rpc("get_league_swipe_stats");
  if (error) throw new Error(error.message);
  return data as SwipeGlobalStats;
}

export type SwipeEntityRating = {
  entity_id: string;
  rating: number;
  vote_count: number;
  win_count: number;
};

/** Top-rated entities for one opinion game, by game slug. */
export async function fetchTopRatings(gameSlug: string, limit = 10): Promise<SwipeEntityRating[]> {
  const { data: games, error: gameErr } = await sb
    .from("league_swipe_games")
    .select("id")
    .eq("slug", gameSlug)
    .limit(1);
  if (gameErr || !games?.length) return [];
  const { data, error } = await sb
    .from("league_swipe_entity_ratings")
    .select("entity_id, rating, vote_count, win_count")
    .eq("game_id", games[0].id)
    .order("rating", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as SwipeEntityRating[];
}

/**
 * One of the current user's past factual answers, judged at READ time.
 *
 * Note what this type does NOT expose: `is_correct` (the v1 column, which the
 * v2 RPC now always writes NULL because it was a browser claim the database
 * trusted verbatim) and `correct_entity` as stored (also a browser claim). They
 * are absent so no renderer can reach for them by accident; `correctEntity`
 * here is the canonical answer from the server verifier, not the stored one.
 */
export type SwipeOwnResult = {
  selectedEntity: string;
  otherEntity: string;
  variant: string | null;
  responseTimeMs: number | null;
  createdAt: string;
  gameSlug: string;
  gameTitle: string;
  /**
   * Server-derived correctness. `null` means UNJUDGED — the entity left the
   * canonical pool, the values converged, the variant has no evaluator, or the
   * backend was unreachable. It must never be rendered as "wrong".
   */
  verifiedCorrect: boolean | null;
  /** The canonical answer, when one could be established. */
  correctEntity: string | null;
};

type SwipeGameRow = { id: string; slug: string; title: string; mode: SwipeGameMode };

/** Game id → slug/title/mode. Public table; one read serves every derivation. */
async function fetchGameRows(): Promise<SwipeGameRow[]> {
  const { data, error } = await sb
    .from("league_swipe_games")
    .select("id, slug, title, mode");
  if (error) return [];
  return (data ?? []) as SwipeGameRow[];
}

/**
 * The current user's recent factual answers, with correctness DERIVED.
 *
 * The previous implementation filtered `.not("is_correct", "is", null)`. Since
 * the v2 RPC writes that column NULL unconditionally, the filter matched zero
 * rows forever: the panel showed "play a knowledge duel to see your history"
 * even to a player who had just finished ten of them. Correctness now comes
 * from the canonical verifier instead of from a column that no longer fills.
 *
 * RLS restricts the read to the caller's own rows, so this needs no privileged
 * access — which is the point: derive-on-read works with the trust boundary
 * exactly as it stands.
 */
export async function fetchMyRecentResults(limit = 10): Promise<SwipeOwnResult[]> {
  const games = await fetchGameRows();
  const byId = new Map(games.map((g) => [g.id, g]));
  const knowledgeIds = games.filter((g) => g.mode === "knowledge").map((g) => g.id);
  if (knowledgeIds.length === 0) return [];

  const { data, error } = await sb
    .from("league_swipe_results")
    .select("selected_entity, other_entity, variant, response_time_ms, created_at, game_id")
    .in("game_id", knowledgeIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];

  const rows = (data ?? []) as Array<{
    selected_entity: string;
    other_entity: string;
    variant: string | null;
    response_time_ms: number | null;
    created_at: string;
    game_id: string;
  }>;
  if (rows.length === 0) return [];

  // Resolve each row to an evaluator. Rows with none stay unjudged rather than
  // being dropped — the play happened and belongs in the history.
  const categories = rows.map((r) =>
    resolveFactualCategory(byId.get(r.game_id)?.slug ?? "", r.variant),
  );
  const verifiable = rows
    .map((r, i) => ({ r, i, category: categories[i] }))
    .filter((x): x is { r: typeof rows[number]; i: number; category: string } => x.category !== null);

  const verdicts = await verifyFactualBatch(
    verifiable.map(({ r, category }) => ({
      category_id: category,
      selected: r.selected_entity,
      other: r.other_entity,
    })),
  );
  const byRow = new Map<number, FactualVerdict | null>();
  verifiable.forEach(({ i }, k) => byRow.set(i, verdicts[k] ?? null));

  return rows.map((r, i) => {
    const v = byRow.get(i) ?? null;
    const game = byId.get(r.game_id);
    return {
      selectedEntity: r.selected_entity,
      otherEntity: r.other_entity,
      variant: r.variant,
      responseTimeMs: r.response_time_ms,
      createdAt: r.created_at,
      gameSlug: game?.slug ?? "",
      gameTitle: game?.title ?? "",
      verifiedCorrect: v?.verified_correct ?? null,
      correctEntity: v?.correct_id ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Community factual accuracy (derived, not stored)
// ---------------------------------------------------------------------------

/**
 * How many distinct factual matchups one accuracy pass will JUDGE, chosen by
 * total votes so the cap drops only the long tail almost nobody has played.
 */
export const COMMUNITY_ACCURACY_PAIR_LIMIT = 400;

/**
 * How many matchup rows are READ before that choice is made.
 *
 * Two stages because PostgREST cannot order by `votes_a + votes_b` (there is no
 * such column), so the ranking that matters has to happen client-side. The rows
 * are tiny; reading a wide slice and sorting locally is cheaper than adding a
 * generated column to a production table for a stats page.
 *
 * Above this many distinct factual pairs the read itself is a partial view and
 * `truncated` is set. Callers must surface that rather than presenting the
 * number as a total.
 */
export const COMMUNITY_ACCURACY_READ_LIMIT = 2000;

export type SwipeFactualAccuracy = {
  /** Attempts on judged pairs. Not the same as total knowledge answers. */
  attempts: number;
  correct: number;
  /** Percentage, or null when nothing could be judged. */
  accuracy: number | null;
  judgedPairs: number;
  /** Pairs read but not judgeable (no evaluator, retired entity, tie). */
  unjudgedPairs: number;
  truncated: boolean;
  perGame: Record<string, number>;
  mostMissed: Array<{
    game: string;
    entityA: string;
    entityB: string;
    correct: string;
    missCount: number;
  }>;
};

/**
 * Community accuracy on factual duels, derived from public aggregates.
 *
 * WHY THIS DOES NOT READ `league_swipe_results`
 * It does not need to. For a factual game the RPC adds exactly one vote per
 * attempt to the chosen side of `league_swipe_matchups`, so votes on the
 * canonically-correct side ARE the correct-answer count. Combining that public,
 * already-aggregated table with the canonical verifier reproduces the accuracy
 * the old `get_league_swipe_stats` SQL used to compute from `r.is_correct` —
 * which the v2 RPC leaves NULL forever, making every one of those fields dead.
 *
 * Nothing here needs elevated privilege: `league_swipe_games` and
 * `league_swipe_matchups` are both SELECT-granted to anon.
 */
export async function fetchFactualCommunityAccuracy(): Promise<SwipeFactualAccuracy> {
  const empty: SwipeFactualAccuracy = {
    attempts: 0, correct: 0, accuracy: null, judgedPairs: 0,
    unjudgedPairs: 0, truncated: false, perGame: {}, mostMissed: [],
  };

  const games = await fetchGameRows();
  const knowledge = games.filter((g) => g.mode === "knowledge");
  if (knowledge.length === 0) return empty;
  const byId = new Map(knowledge.map((g) => [g.id, g]));

  const { data, error } = await sb
    .from("league_swipe_matchups")
    .select("game_id, entity_a, entity_b, variant, votes_a, votes_b")
    .in("game_id", knowledge.map((g) => g.id))
    .limit(COMMUNITY_ACCURACY_READ_LIMIT);
  if (error) return empty;

  const all = (data ?? []) as Array<{
    game_id: string; entity_a: string; entity_b: string;
    variant: string | null; votes_a: number; votes_b: number;
  }>;
  // Rank by total votes here, not in the query — see COMMUNITY_ACCURACY_READ_LIMIT.
  const ranked = [...all].sort(
    (a, b) => (b.votes_a + b.votes_b) - (a.votes_a + a.votes_b),
  );
  const truncated =
    all.length >= COMMUNITY_ACCURACY_READ_LIMIT || ranked.length > COMMUNITY_ACCURACY_PAIR_LIMIT;
  const pairs = ranked.slice(0, COMMUNITY_ACCURACY_PAIR_LIMIT);
  if (pairs.length === 0) return empty;

  const resolved = pairs
    .map((p) => ({ p, category: resolveFactualCategory(byId.get(p.game_id)?.slug ?? "", p.variant) }))
    .filter((x): x is { p: typeof pairs[number]; category: string } => x.category !== null);

  const verdicts = await verifyFactualBatch(
    resolved.map(({ p, category }) => ({
      category_id: category, selected: p.entity_a, other: p.entity_b,
    })),
  );

  let attempts = 0;
  let correct = 0;
  let judgedPairs = 0;
  const perGameTotals = new Map<string, { attempts: number; correct: number }>();
  const missed: SwipeFactualAccuracy["mostMissed"] = [];

  resolved.forEach(({ p }, i) => {
    const v = verdicts[i];
    if (!v || v.correct_id == null) return;      // unjudged — excluded, not scored 0
    const total = (p.votes_a ?? 0) + (p.votes_b ?? 0);
    if (total <= 0) return;
    const correctVotes = v.correct_id === p.entity_a ? (p.votes_a ?? 0) : (p.votes_b ?? 0);
    judgedPairs += 1;
    attempts += total;
    correct += correctVotes;

    const slug = byId.get(p.game_id)?.slug ?? "";
    const acc = perGameTotals.get(slug) ?? { attempts: 0, correct: 0 };
    acc.attempts += total;
    acc.correct += correctVotes;
    perGameTotals.set(slug, acc);

    const misses = total - correctVotes;
    if (misses > 0) {
      missed.push({
        game: slug, entityA: p.entity_a, entityB: p.entity_b,
        correct: v.correct_id, missCount: misses,
      });
    }
  });

  const perGame: Record<string, number> = {};
  for (const [slug, t] of perGameTotals) {
    if (t.attempts > 0) perGame[slug] = Math.round((t.correct / t.attempts) * 1000) / 10;
  }

  return {
    attempts,
    correct,
    accuracy: attempts > 0 ? Math.round((correct / attempts) * 1000) / 10 : null,
    judgedPairs,
    unjudgedPairs: pairs.length - judgedPairs,
    truncated,
    perGame,
    mostMissed: missed.sort((a, b) => b.missCount - a.missCount).slice(0, 5),
  };
}

export async function recordSwipeResult(params: {
  gameSlug: string;
  selected: string;
  other: string;
  correct?: string;
  selectedValue?: number;
  otherValue?: number;
  responseTimeMs?: number;
  context?: Record<string, unknown>;
  /**
   * Identity of the LOGICAL submission — see lib/league-swipe/submissionId.
   *
   * Callers must mint this once per attempt and pass the SAME value on every
   * retry of that attempt. It is an explicit parameter rather than something
   * minted in here precisely so a retry cannot accidentally get a fresh one:
   * a function that mints its own id makes every call a new attempt by
   * construction, which is the bug this parameter exists to prevent.
   */
  clientSubmissionId?: string;
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
    // Omitting this let PostgREST apply the SQL default NULL, which made the
    // RPC's idempotency short-circuit and its partial unique index both inert.
    p_client_submission_id: params.clientSubmissionId ?? null,
  });
  if (error) {
    console.error("record_league_swipe_result failed:", error);
    return null;
  }
  return (data ?? null) as SwipeRevealAggregates | null;
}
