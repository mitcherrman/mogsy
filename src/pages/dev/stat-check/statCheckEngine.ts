import { attackSpeedAtLevel, statAtLevel, type ChampionBaseStats } from "@/lib/league-docs/api";
import {
  ITEM_IDS,
  addInventoryItem,
  emptyItemInventory,
  expectedItemChoices,
  inventoryCount,
  isItemCompatible,
  itemBonusFor,
  removeInventoryItem,
  totalInventoryCount,
  type ItemId,
  type ItemInventory,
} from "./items";

export type Side = "player" | "bot";
export type StatDirection = "higher" | "lower";
export type GamePhase = "item-choice" | "selecting" | "locked" | "revealing" | "resolved" | "match-over";
export type MatchOutcome = "player" | "bot" | "draw" | null;

export type StatCheckCard = {
  id: string;
  name: string;
  stats: {
    hp: number;
    hpPerLevel: number;
    ad: number;
    adPerLevel: number;
    armor: number;
    armorPerLevel: number;
    magicResist: number;
    moveSpeed: number;
    attackRange: number;
    attackSpeed: number;
    attackSpeedPerLevel: number;
  };
};

export type StatCategoryId =
  | "highest-hp-1"
  | "lowest-hp-1"
  | "highest-hp-18"
  | "lowest-hp-18"
  | "highest-ad-1"
  | "lowest-ad-1"
  | "highest-ad-18"
  | "lowest-ad-18"
  | "highest-armor-1"
  | "lowest-armor-1"
  | "highest-armor-18"
  | "lowest-armor-18"
  | "lowest-mr-1"
  | "highest-move-speed"
  | "lowest-move-speed"
  | "highest-attack-range"
  | "lowest-attack-range"
  | "lowest-attack-speed-1";

export type StatFamily =
  | "health"
  | "attack-damage"
  | "armor"
  | "magic-resist"
  | "move-speed"
  | "attack-range"
  | "attack-speed";

export const STAT_FAMILY_LABELS: Record<StatFamily, string> = {
  health: "Health",
  "attack-damage": "Attack Damage",
  armor: "Armor",
  "magic-resist": "Magic Resist",
  "move-speed": "Move Speed",
  "attack-range": "Attack Range",
  "attack-speed": "Attack Speed",
};

export type StatCategory = {
  id: StatCategoryId;
  label: string;
  shortLabel: string;
  /** Broad stat family; boards never repeat a family and the future clue reveals only this. */
  family: StatFamily;
  /** Retired categories stay defined for compatibility but are never generated. */
  active: boolean;
  /**
   * Champion level the contest is evaluated at, or null for unscaled stats
   * (move speed, attack range). Exact category identity is stat family +
   * direction + level; future curated levels (6/11/16/20) become new entries
   * with their own level value without changing this contract.
   */
  level: number | null;
  direction: StatDirection;
  decisiveThreshold: number;
  explanation: string;
  getValue: (card: StatCheckCard) => number;
  formatValue: (value: number) => string;
};

export type SlotAssignments = Record<StatCategoryId, string | null>;

export type CategoryResult = {
  category: StatCategory;
  playerCard: StatCheckCard;
  botCard: StatCheckCard;
  /** Champion-only values before any item bonus. */
  playerNaturalValue: number;
  botNaturalValue: number;
  /** Item consumed on this lane this round, if any. */
  playerItem: ItemId | null;
  botItem: ItemId | null;
  /** Flat item bonus applied to this lane's contest (0 when no item). */
  playerBonus: number;
  botBonus: number;
  /** FINAL contest values (natural + bonus); winner/margin/decisive use these. */
  playerValue: number;
  botValue: number;
  winner: Side | "tie";
  margin: number;
  decisive: boolean;
};

export type RoundDamage = {
  player: number;
  bot: number;
  boardWinner: Side | "tie";
  playerCategoryWins: number;
  botCategoryWins: number;
  playerBoardDamage: number;
  botBoardDamage: number;
  playerDecisiveDamage: number;
  botDecisiveDamage: number;
};

export type RoundResolution = {
  round: number;
  categories: StatCategory[];
  playerAssignments: Record<StatCategoryId, StatCheckCard>;
  botAssignments: Record<StatCategoryId, StatCheckCard>;
  results: CategoryResult[];
  damage: RoundDamage;
  playerHpBefore: number;
  botHpBefore: number;
  playerHpAfter: number;
  botHpAfter: number;
  outcome: MatchOutcome;
  /** Broad family of the public next-round clue visible while selecting. */
  clueFamily: StatFamily | null;
  /**
   * Whether the player's strongest clue-family card (by the same public
   * scoring the bot uses) stayed in hand this round. Null when the clue
   * carried no usable information for this hand. Describes visible state
   * only — it does not claim intent.
   */
  playerRetainedBestClueCard: boolean | null;
};

/** A pending, not-yet-consumed item attachment to one placed champion. */
export type EquippedItem = {
  categoryId: StatCategoryId;
  itemId: ItemId;
};

export type MatchState = {
  seed: string;
  phase: GamePhase;
  round: number;
  /** Item system master switch; false preserves exact pre-item behavior. */
  itemsEnabled: boolean;
  playerInventory: ItemInventory;
  botInventory: ItemInventory;
  /** Completed simultaneous item-choice phases (both sides pick one item each). */
  itemChoicesCompleted: number;
  /** Player's pending equip for the current selecting round; consumed at resolve. */
  equippedItem: EquippedItem | null;
  playerHp: number;
  botHp: number;
  drawPile: StatCheckCard[];
  playerHand: StatCheckCard[];
  botHand: StatCheckCard[];
  playerDiscard: StatCheckCard[];
  botDiscard: StatCheckCard[];
  currentCategories: StatCategory[];
  nextCategories: StatCategory[];
  assignments: SlotAssignments;
  lastResolution: RoundResolution | null;
  /** Every resolved round in order, for the post-match playtest summary. */
  roundHistory: RoundResolution[];
  outcome: MatchOutcome;
  endReason: string | null;
};

// Real-roster calibrated (500-match diagnostic, July 2026): ~15-round median,
// HP endings decide matches well before shared-pool exhaustion.
const STARTING_HP = 20;
const HAND_SIZE = 6;
const BOARD_DAMAGE = 2;
const SWEEP_BONUS_DAMAGE = 1;
const DECISIVE_DAMAGE = 1;
const ROUND_SLOTS = 3;

export const STAT_CHECK_RULES = {
  startingHp: STARTING_HP,
  handSize: HAND_SIZE,
  boardDamage: BOARD_DAMAGE,
  sweepBonusDamage: SWEEP_BONUS_DAMAGE,
  decisiveDamage: DECISIVE_DAMAGE,
  roundSlots: ROUND_SLOTS,
} as const;

const number = (value: number) => Number(value.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const whole = (value: number) => Math.round(value).toLocaleString();

// Decisive thresholds are initial calibrated values from the 500-match
// real-roster diagnostic (172 champions, July 2026) — see diagnostics/
// thresholdCandidateTable. Versioned constants, not runtime calibration.
// Lowest-direction and L18-armor variants carry their own calibration: both
// sides dump weak cards into Lowest lanes (widening margins) and armor growth
// compresses relative level-18 spreads, so mirrored thresholds misfire there.
export const STAT_CATEGORIES: StatCategory[] = [
  {
    id: "highest-hp-1",
    label: "Highest level-1 health",
    shortLabel: "L1 HP",
    family: "health",
    active: true,
    level: 1,
    direction: "higher",
    decisiveThreshold: 0.05,
    explanation: "Level-1 health clusters tightly, so a 5% gap (30+ HP) is already a real stat check.",
    getValue: (card) => card.stats.hp,
    formatValue: whole,
  },
  {
    id: "lowest-hp-1",
    label: "Lowest level-1 health",
    shortLabel: "Low L1 HP",
    family: "health",
    active: true,
    level: 1,
    direction: "lower",
    decisiveThreshold: 0.075,
    explanation: "Both sides shed their squishiest card here, so only a 7.5%+ gap is a real mismatch.",
    getValue: (card) => card.stats.hp,
    formatValue: whole,
  },
  {
    id: "highest-hp-18",
    label: "Highest level-18 health",
    shortLabel: "L18 HP",
    family: "health",
    active: true,
    level: 18,
    direction: "higher",
    decisiveThreshold: 0.075,
    explanation: "Growth spreads level-18 health, so 7.5% marks a clearly tankier champion.",
    getValue: (card) => statAtLevel(card.stats.hp, card.stats.hpPerLevel, 18),
    formatValue: whole,
  },
  {
    id: "lowest-hp-18",
    label: "Lowest level-18 health",
    shortLabel: "Low L18 HP",
    family: "health",
    active: true,
    level: 18,
    direction: "lower",
    decisiveThreshold: 0.1,
    explanation: "Worst-card dumping widens low-HP gaps at 18, so decisive needs a 10%+ margin.",
    getValue: (card) => statAtLevel(card.stats.hp, card.stats.hpPerLevel, 18),
    formatValue: whole,
  },
  {
    id: "highest-ad-1",
    label: "Highest level-1 attack damage",
    shortLabel: "L1 AD",
    family: "attack-damage",
    active: true,
    level: 1,
    direction: "higher",
    decisiveThreshold: 0.1,
    explanation: "Base attack damage spreads moderately; a 10% edge is a clear early-game win.",
    getValue: (card) => card.stats.ad,
    formatValue: number,
  },
  {
    id: "lowest-ad-1",
    label: "Lowest level-1 attack damage",
    shortLabel: "Low L1 AD",
    family: "attack-damage",
    active: true,
    level: 1,
    direction: "lower",
    decisiveThreshold: 0.125,
    explanation: "Worst-card dumping widens low-AD gaps, so decisive needs a 12.5%+ margin.",
    getValue: (card) => card.stats.ad,
    formatValue: number,
  },
  {
    id: "highest-ad-18",
    label: "Highest level-18 attack damage",
    shortLabel: "L18 AD",
    family: "attack-damage",
    active: true,
    level: 18,
    direction: "higher",
    decisiveThreshold: 0.15,
    explanation: "Growth makes level-18 AD gaps common, so only a 15%+ edge counts as decisive.",
    getValue: (card) => statAtLevel(card.stats.ad, card.stats.adPerLevel, 18),
    formatValue: number,
  },
  {
    id: "lowest-ad-18",
    label: "Lowest level-18 attack damage",
    shortLabel: "Low L18 AD",
    family: "attack-damage",
    active: true,
    level: 18,
    direction: "lower",
    decisiveThreshold: 0.15,
    explanation: "Growth makes level-18 AD gaps common, so only a 15%+ gap counts as decisive.",
    getValue: (card) => statAtLevel(card.stats.ad, card.stats.adPerLevel, 18),
    formatValue: number,
  },
  {
    id: "highest-armor-1",
    label: "Highest level-1 armor",
    shortLabel: "L1 Armor",
    family: "armor",
    active: true,
    level: 1,
    direction: "higher",
    decisiveThreshold: 0.25,
    explanation: "Base armor varies widely, so only a 25%+ higher-armor gap is a decisive mismatch.",
    getValue: (card) => card.stats.armor,
    formatValue: number,
  },
  {
    id: "lowest-armor-1",
    label: "Lowest level-1 armor",
    shortLabel: "Low armor",
    family: "armor",
    active: true,
    level: 1,
    direction: "lower",
    decisiveThreshold: 0.25,
    explanation: "Base armor varies widely, so only a 25%+ lower-armor gap is a decisive mismatch.",
    getValue: (card) => card.stats.armor,
    formatValue: number,
  },
  {
    id: "highest-armor-18",
    label: "Highest level-18 armor",
    shortLabel: "L18 Armor",
    family: "armor",
    active: true,
    level: 18,
    direction: "higher",
    decisiveThreshold: 0.1,
    explanation: "Armor growth compresses relative level-18 spreads, so 10% already marks a clear tank.",
    getValue: (card) => statAtLevel(card.stats.armor, card.stats.armorPerLevel, 18),
    formatValue: number,
  },
  {
    id: "lowest-armor-18",
    label: "Lowest level-18 armor",
    shortLabel: "Low L18 Armor",
    family: "armor",
    active: true,
    level: 18,
    direction: "lower",
    decisiveThreshold: 0.15,
    explanation: "Compressed level-18 armor spreads make 15%+ the clearly softer target.",
    getValue: (card) => statAtLevel(card.stats.armor, card.stats.armorPerLevel, 18),
    formatValue: number,
  },
  {
    id: "lowest-mr-1",
    label: "Lowest base magic resistance",
    shortLabel: "Low MR",
    family: "magic-resist",
    // Retired: MR values cluster so tightly that ~62% of appearances tied and
    // none were decisive in simulation. Kept for compatibility, never generated.
    active: false,
    level: 1,
    direction: "lower",
    decisiveThreshold: 0.15,
    explanation: "Magic-resist values cluster tightly, so this only fires on clearer gaps.",
    getValue: (card) => card.stats.magicResist,
    formatValue: number,
  },
  {
    id: "highest-move-speed",
    label: "Highest movement speed",
    shortLabel: "Move speed",
    family: "move-speed",
    active: true,
    level: null,
    direction: "higher",
    decisiveThreshold: 0.05,
    explanation: "Movement speed has a small range, making 5% a notable prototype edge.",
    getValue: (card) => card.stats.moveSpeed,
    formatValue: whole,
  },
  {
    id: "lowest-move-speed",
    label: "Lowest movement speed",
    shortLabel: "Low speed",
    family: "move-speed",
    active: true,
    level: null,
    direction: "lower",
    decisiveThreshold: 0.05,
    explanation: "Movement speed has a small range, making a 5% deficit a notable prototype edge.",
    getValue: (card) => card.stats.moveSpeed,
    formatValue: whole,
  },
  {
    id: "highest-attack-range",
    label: "Highest attack range",
    shortLabel: "Range",
    family: "attack-range",
    active: true,
    level: null,
    direction: "higher",
    decisiveThreshold: 0.2,
    explanation: "Range has large class breaks, so 20% avoids constant bonus damage.",
    getValue: (card) => card.stats.attackRange,
    formatValue: whole,
  },
  {
    id: "lowest-attack-range",
    label: "Lowest attack range",
    shortLabel: "Low range",
    family: "attack-range",
    active: true,
    level: null,
    direction: "lower",
    decisiveThreshold: 0.2,
    explanation: "Range has large class breaks, so 20% avoids constant bonus damage.",
    getValue: (card) => card.stats.attackRange,
    formatValue: whole,
  },
  {
    id: "lowest-attack-speed-1",
    label: "Lowest level-1 attack speed",
    shortLabel: "Low AS",
    family: "attack-speed",
    // Retired: ~62% tie rate and near-zero decisive rate in simulation made
    // this lane a coin flip. Kept for compatibility, never generated.
    active: false,
    level: 1,
    direction: "lower",
    decisiveThreshold: 0.12,
    explanation: "Lower attack speed is intentionally weird; this helps test save-or-spend choices.",
    getValue: (card) => attackSpeedAtLevel(card.stats.attackSpeed, card.stats.attackSpeedPerLevel, 1),
    formatValue: (value) => value.toFixed(3),
  },
];

export const emptyAssignments = (categories: StatCategory[]): SlotAssignments =>
  categories.reduce((acc, category) => {
    acc[category.id] = null;
    return acc;
  }, {} as SlotAssignments);

export function buildCardFromBaseStats(row: ChampionBaseStats): StatCheckCard | null {
  const required = [
    row.hp,
    row.hp_per_level,
    row.ad,
    row.ad_per_level,
    row.armor,
    row.armor_per_level,
    row.magic_resist,
    row.move_speed,
    row.attack_range,
    row.attack_speed,
    row.attack_speed_per_level,
  ];
  if (!row.champion_name || required.some((value) => !Number.isFinite(value))) return null;
  return {
    id: row.champion_name,
    name: row.champion_name,
    stats: {
      hp: row.hp,
      hpPerLevel: row.hp_per_level,
      ad: row.ad,
      adPerLevel: row.ad_per_level,
      armor: row.armor,
      armorPerLevel: row.armor_per_level,
      magicResist: row.magic_resist,
      moveSpeed: row.move_speed,
      attackRange: row.attack_range,
      attackSpeed: row.attack_speed,
      attackSpeedPerLevel: row.attack_speed_per_level,
    },
  };
}

export function buildCardsFromBaseStats(rows: ChampionBaseStats[] | undefined): StatCheckCard[] {
  return (rows ?? [])
    .map(buildCardFromBaseStats)
    .filter((card): card is StatCheckCard => Boolean(card))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeterministic<T>(items: T[], seed: string): T[] {
  const out = items.slice();
  const random = createSeededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const ACTIVE_STAT_CATEGORIES: StatCategory[] = STAT_CATEGORIES.filter((category) => category.active);

/**
 * Deterministic seeded board generation. Two structural rules:
 * - within one board, all three exact categories are unique AND no broad stat
 *   family repeats (family diversity, preserved from the original design);
 * - no exact category (stat + direction + level identity, i.e. the id) from
 *   the immediately preceding round may appear anywhere on this board.
 *   Different direction or level of the same stat stays legal.
 * The previous-board exclusion subsumes the old whole-board repeat patch.
 */
export function generateCategoryBoard(seed: string, round: number, previous?: StatCategory[]): StatCategory[] {
  const excludedIds = new Set((previous ?? []).map((category) => category.id));
  const eligible = ACTIVE_STAT_CATEGORIES.filter((category) => !excludedIds.has(category.id));
  const eligibleFamilies = new Set(eligible.map((category) => category.family));
  if (eligibleFamilies.size < ROUND_SLOTS) {
    throw new Error("Stat Check needs at least three eligible stat families to build a board.");
  }
  const random = createSeededRandom(`${seed}:categories:${round}`);
  const pool = eligible.slice();
  const board: StatCategory[] = [];
  const usedFamilies = new Set<StatFamily>();
  // Bounded: every iteration removes one candidate from the pool.
  while (board.length < ROUND_SLOTS && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    const candidate = pool.splice(index, 1)[0];
    if (usedFamilies.has(candidate.family)) continue;
    board.push(candidate);
    usedFamilies.add(candidate.family);
  }
  return board;
}

export function compareCategory(
  category: StatCategory,
  playerCard: StatCheckCard,
  botCard: StatCheckCard,
  playerItem: ItemId | null = null,
  botItem: ItemId | null = null,
): CategoryResult {
  const playerNaturalValue = category.getValue(playerCard);
  const botNaturalValue = category.getValue(botCard);
  // Family-based bonus lookup; a positive bonus applies identically in Lowest
  // lanes (where it worsens the contest) — direction never gates the effect.
  const playerBonus = itemBonusFor(playerItem, category.family);
  const botBonus = itemBonusFor(botItem, category.family);
  const playerValue = playerNaturalValue + playerBonus;
  const botValue = botNaturalValue + botBonus;
  const winner = (() => {
    if (playerValue === botValue) return "tie";
    if (category.direction === "higher") return playerValue > botValue ? "player" : "bot";
    return playerValue < botValue ? "player" : "bot";
  })();
  const margin =
    winner === "tie"
      ? 0
      : relativeMarginForCategory(
        category,
        winner === "player" ? playerValue : botValue,
        winner === "player" ? botValue : playerValue,
      );
  return {
    category,
    playerCard,
    botCard,
    playerNaturalValue,
    botNaturalValue,
    playerItem,
    botItem,
    playerBonus,
    botBonus,
    playerValue,
    botValue,
    winner,
    margin,
    decisive: winner !== "tie" && margin >= category.decisiveThreshold,
  };
}

export function relativeMarginForCategory(category: Pick<StatCategory, "direction">, winningValue: number, losingValue: number): number {
  return category.direction === "higher"
    ? relativeMargin(winningValue, losingValue)
    : relativeMargin(losingValue, winningValue);
}

/**
 * Relative stat margin using the first argument as denominator. Higher-wins
 * categories pass the winning value; lower-wins categories pass the losing
 * value so a 20 vs 25 lower-wins result is (25 - 20) / 25 = 20%.
 */
export function relativeMargin(denominatorValue: number, comparedValue: number): number {
  const diff = Math.abs(denominatorValue - comparedValue);
  if (diff === 0) return 0;
  const denominator = Math.abs(denominatorValue);
  if (denominator === 0) return 1;
  return diff / denominator;
}

export function calculateRoundDamage(results: CategoryResult[]): RoundDamage {
  const playerCategoryWins = results.filter((result) => result.winner === "player").length;
  const botCategoryWins = results.filter((result) => result.winner === "bot").length;
  const boardWinner: Side | "tie" =
    playerCategoryWins > botCategoryWins ? "player" : botCategoryWins > playerCategoryWins ? "bot" : "tie";
  const playerBoardDamage =
    boardWinner === "player" ? BOARD_DAMAGE + (playerCategoryWins === ROUND_SLOTS ? SWEEP_BONUS_DAMAGE : 0) : 0;
  const botBoardDamage =
    boardWinner === "bot" ? BOARD_DAMAGE + (botCategoryWins === ROUND_SLOTS ? SWEEP_BONUS_DAMAGE : 0) : 0;
  const playerDecisiveDamage =
    results.filter((result) => result.winner === "player" && result.decisive).length * DECISIVE_DAMAGE;
  const botDecisiveDamage = results.filter((result) => result.winner === "bot" && result.decisive).length * DECISIVE_DAMAGE;
  return {
    player: playerBoardDamage + playerDecisiveDamage,
    bot: botBoardDamage + botDecisiveDamage,
    boardWinner,
    playerCategoryWins,
    botCategoryWins,
    playerBoardDamage,
    botBoardDamage,
    playerDecisiveDamage,
    botDecisiveDamage,
  };
}

export const BOT_STRATEGY = {
  /**
   * Maximum normalized current-board value (each lane spans 0..1 within the
   * hand) the bot may sacrifice to preserve its best clue-family card.
   */
  maxPreservationSacrifice: 0.35,
  /**
   * Best-versus-worst relative hand spread at which a clue family counts as
   * fully informative. Tighter spreads (e.g. clustered move speed) scale the
   * sacrifice budget toward zero so weak clues never cost the current board.
   */
  clueSpreadReference: 0.15,
  /**
   * Slight discount on lower-direction clue variants when valuing which card
   * to preserve. With Highest AND Lowest variants active in every family, a
   * hand's top-stat and bottom-stat cards would tie on raw clue value; the
   * bot prefers protecting the high extreme (rarer in a shared pool and the
   * only direction item bonuses can help) and breaks such ties toward it.
   */
  lowerDirectionClueWeight: 0.9,
} as const;

export type BotAssignmentAnalysis = {
  assignments: Record<StatCategoryId, StatCheckCard>;
  /** Normalized current-board value of the chosen assignment (0..lanes). */
  currentScore: number;
  /** Best achievable normalized current-board value with this hand. */
  bestCurrentScore: number;
  /** 0..1 informativeness of the clue family for this hand (0 = no clue). */
  clueInformativeness: number;
  /** Hand card with the highest clue-family score, if a usable clue exists. */
  bestClueCardId: string | null;
  /** True when the best clue-family card was kept out of the current board. */
  preservedBestClueCard: boolean;
};

/** Normalized 0..1 (direction-aware) per-card scores for one category within a hand. */
function laneScoreTable(hand: StatCheckCard[], category: StatCategory): Map<string, number> {
  const values = hand.map((card) => category.getValue(card));
  const best = category.direction === "higher" ? Math.max(...values) : Math.min(...values);
  const worst = category.direction === "higher" ? Math.min(...values) : Math.max(...values);
  const span = Math.abs(best - worst);
  const table = new Map<string, number>();
  hand.forEach((card, index) => {
    table.set(card.id, span === 0 ? 0.5 : Math.abs(values[index] - worst) / span);
  });
  return table;
}

/**
 * Deterministic bot selection. Without a clue this is the original greedy
 * raw-value maximizer. With the public next-round family clue, the bot keeps
 * its best clue-family card when doing so costs at most a bounded, clue-
 * informativeness-scaled amount of normalized current-board value.
 */
export function selectBotAssignments(
  hand: StatCheckCard[],
  categories: StatCategory[],
  clueFamily?: StatFamily,
): Record<StatCategoryId, StatCheckCard> {
  return analyzeBotAssignments(hand, categories, clueFamily).assignments;
}

/**
 * Public clue-family scoring shared by the bot and the playtest summary.
 * Each family variant (e.g. level-1 vs level-18 health) is weighted by its
 * own hand spread so a variant with clustered values cannot dominate the
 * clue score or unlock a sacrifice budget it does not deserve.
 */
function clueScoring(hand: StatCheckCard[], clueFamily?: StatFamily) {
  const clueCategories = clueFamily
    ? ACTIVE_STAT_CATEGORIES.filter((category) => category.family === clueFamily)
    : [];
  const clueVariants = clueCategories.map((category) => {
    const table = laneScoreTable(hand, category);
    const values = hand.map((card) => category.getValue(card));
    const best = category.direction === "higher" ? Math.max(...values) : Math.min(...values);
    const worst = category.direction === "higher" ? Math.min(...values) : Math.max(...values);
    const spread = relativeMarginForCategory(category, best, worst);
    const directionWeight = category.direction === "higher" ? 1 : BOT_STRATEGY.lowerDirectionClueWeight;
    return { table, weight: Math.min(1, spread / BOT_STRATEGY.clueSpreadReference) * directionWeight };
  });
  const clueInformativeness = clueVariants.reduce((max, variant) => Math.max(max, variant.weight), 0);
  const clueScoreOf = (card: StatCheckCard) =>
    clueVariants.reduce((score, variant) => Math.max(score, (variant.table.get(card.id) ?? 0) * variant.weight), 0);
  const bestClueCard =
    clueCategories.length > 0
      ? hand.reduce((best, card) => (clueScoreOf(card) > clueScoreOf(best) ? card : best), hand[0])
      : null;
  return { hasClue: clueCategories.length > 0, clueInformativeness, clueScoreOf, bestClueCard };
}

/**
 * The hand's strongest card for a clued family under the public scoring, or
 * null when the clue carries no usable information for this hand.
 */
export function strongestClueCardId(hand: StatCheckCard[], clueFamily: StatFamily | null | undefined): string | null {
  if (!clueFamily || hand.length === 0) return null;
  const scoring = clueScoring(hand, clueFamily);
  if (!scoring.hasClue || scoring.clueInformativeness === 0) return null;
  return scoring.bestClueCard?.id ?? null;
}

export function analyzeBotAssignments(
  hand: StatCheckCard[],
  categories: StatCategory[],
  clueFamily?: StatFamily,
): BotAssignmentAnalysis {
  if (hand.length < categories.length) throw new Error("Bot needs at least three cards.");

  const laneTables = categories.map((category) => laneScoreTable(hand, category));
  const scoring = clueScoring(hand, clueFamily);
  const { hasClue, clueInformativeness, clueScoreOf, bestClueCard } = scoring;

  type Candidate = { cards: StatCheckCard[]; rawScore: number[]; currentNorm: number; preservation: number };
  const candidates: Candidate[] = [];
  for (const a of hand) {
    for (const b of hand) {
      if (b.id === a.id) continue;
      for (const c of hand) {
        if (c.id === a.id || c.id === b.id) continue;
        const cards = [a, b, c];
        const normalized = categories.map((category, index) => {
          const value = category.getValue(cards[index]);
          return category.direction === "higher" ? value : -value;
        });
        const total = normalized.reduce((sum, value) => sum + value, 0);
        const tieBreak = cards.map((card) => -hand.findIndex((item) => item.id === card.id));
        const currentNorm = cards.reduce((sum, card, index) => sum + (laneTables[index].get(card.id) ?? 0), 0);
        const remaining = hand.filter((card) => !cards.some((played) => played.id === card.id));
        const preservation = remaining.reduce((score, card) => Math.max(score, clueScoreOf(card)), 0);
        candidates.push({ cards, rawScore: [total, ...normalized, ...tieBreak], currentNorm, preservation });
      }
    }
  }

  const bestCurrentScore = candidates.reduce((max, candidate) => Math.max(max, candidate.currentNorm), 0);

  let chosen: Candidate | null = null;
  if (!hasClue) {
    // Original greedy path: raw direction-signed value maximization.
    for (const candidate of candidates) {
      if (!chosen || lexicographic(candidate.rawScore, chosen.rawScore) > 0) chosen = candidate;
    }
  } else {
    const budget = BOT_STRATEGY.maxPreservationSacrifice * clueInformativeness;
    const eligible = candidates.filter((candidate) => candidate.currentNorm >= bestCurrentScore - budget - 1e-9);
    for (const candidate of eligible) {
      if (
        !chosen ||
        candidate.preservation > chosen.preservation + 1e-9 ||
        (Math.abs(candidate.preservation - chosen.preservation) <= 1e-9 &&
          (candidate.currentNorm > chosen.currentNorm + 1e-9 ||
            (Math.abs(candidate.currentNorm - chosen.currentNorm) <= 1e-9 &&
              lexicographic(candidate.rawScore, chosen.rawScore) > 0)))
      ) {
        chosen = candidate;
      }
    }
  }

  const assignments = categories.reduce((acc, category, index) => {
    acc[category.id] = chosen!.cards[index];
    return acc;
  }, {} as Record<StatCategoryId, StatCheckCard>);

  return {
    assignments,
    currentScore: chosen!.currentNorm,
    bestCurrentScore,
    clueInformativeness: hasClue ? clueInformativeness : 0,
    bestClueCardId: bestClueCard?.id ?? null,
    preservedBestClueCard: Boolean(bestClueCard && !chosen!.cards.some((card) => card.id === bestClueCard.id)),
  };
}

function lexicographic(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function drawUpTo(hand: StatCheckCard[], deck: StatCheckCard[], size = HAND_SIZE) {
  const nextHand = hand.slice();
  const nextDeck = deck.slice();
  while (nextHand.length < size && nextDeck.length > 0) {
    nextHand.push(nextDeck.shift()!);
  }
  return { hand: nextHand, deck: nextDeck };
}

export type CreateMatchOptions = {
  /**
   * Enable the item system: the match opens in the pre-Round-1 item-choice
   * phase and item cadence/equipment rules apply. Default false so every
   * pre-item consumer and test keeps its exact historical behavior.
   */
  items?: boolean;
};

export function createMatch(deck: StatCheckCard[], seed = "stat-check-v1", options: CreateMatchOptions = {}): MatchState {
  const itemsEnabled = options.items ?? false;
  const eligibleDeck = uniqueCardsById(deck);
  if (eligibleDeck.length < HAND_SIZE * 2 + ROUND_SLOTS * 2) {
    throw new Error("Stat Check needs at least 18 supported champion cards.");
  }
  const shuffled = shuffleDeterministic(eligibleDeck, seed);
  const playerDraw = drawUpTo([], shuffled, HAND_SIZE);
  const botDraw = drawUpTo([], playerDraw.deck, HAND_SIZE);
  const currentCategories = generateCategoryBoard(seed, 1);
  const nextCategories = generateCategoryBoard(seed, 2, currentCategories);
  return {
    seed,
    // Round 1 categories exist internally for determinism; with items enabled
    // the UI must keep them hidden until the opening item choice completes.
    phase: itemsEnabled ? "item-choice" : "selecting",
    round: 1,
    itemsEnabled,
    playerInventory: emptyItemInventory(),
    botInventory: emptyItemInventory(),
    itemChoicesCompleted: 0,
    equippedItem: null,
    playerHp: STARTING_HP,
    botHp: STARTING_HP,
    drawPile: botDraw.deck,
    playerHand: playerDraw.hand,
    botHand: botDraw.hand,
    playerDiscard: [],
    botDiscard: [],
    currentCategories,
    nextCategories,
    assignments: emptyAssignments(currentCategories),
    lastResolution: null,
    roundHistory: [],
    outcome: null,
    endReason: null,
  };
}

export function assignCard(state: MatchState, categoryId: StatCategoryId, cardId: string | null): MatchState {
  if (state.phase !== "selecting") return state;
  if (cardId !== null && !state.playerHand.some((card) => card.id === cardId)) return state;
  const assignments = { ...state.assignments };
  for (const key of Object.keys(assignments) as StatCategoryId[]) {
    if (assignments[key] === cardId) assignments[key] = null;
  }
  assignments[categoryId] = cardId;
  // A pending item may only ride on a lane that still holds a champion; card
  // removal or a lane move that empties the equipped lane releases the item
  // back to inventory-pending status (it was never consumed).
  const equippedItem =
    state.equippedItem && assignments[state.equippedItem.categoryId] ? state.equippedItem : null;
  return { ...state, assignments, equippedItem };
}

/** True when this state owes the players an item-choice phase. */
export function itemChoiceDue(state: MatchState): boolean {
  return state.itemsEnabled && state.itemChoicesCompleted < expectedItemChoices(state.roundHistory.length);
}

export const BOT_ITEM_STRATEGY = {
  /**
   * Deterministic acquisition rotation: the bot values the flexible snack
   * first, then cycles the specialist components. Indexed by completed item
   * choices, so duplicates accumulate naturally on long matches.
   */
  acquisitionCycle: ["mogzy-snack", "ruby-crystal", "long-sword", "cloth-armor"] as ItemId[],
  /**
   * Minimum fraction of a lane's decisive threshold the item's relative value
   * gain must buy before the bot spends it; below this the bot holds the item.
   */
  minDecisiveFraction: 0.5,
} as const;

/** Deterministic bot item acquisition for the given completed-choice index. */
export function selectBotItemAcquisition(choiceIndex: number): ItemId {
  const cycle = BOT_ITEM_STRATEGY.acquisitionCycle;
  return cycle[((choiceIndex % cycle.length) + cycle.length) % cycle.length];
}

/**
 * Complete one simultaneous item-choice phase: the player takes `itemId`, the
 * bot takes its deterministic rotation pick (never exposed via any pre-reveal
 * surface). Returns to "selecting" before Round 1 and to "resolved" after a
 * cadence round, so the normal next-round transition can proceed.
 */
export function chooseItem(state: MatchState, itemId: ItemId): MatchState {
  if (state.phase !== "item-choice" || !itemChoiceDue(state)) return state;
  const botPick = selectBotItemAcquisition(state.itemChoicesCompleted);
  return {
    ...state,
    phase: state.lastResolution ? "resolved" : "selecting",
    playerInventory: addInventoryItem(state.playerInventory, itemId),
    botInventory: addInventoryItem(state.botInventory, botPick),
    itemChoicesCompleted: state.itemChoicesCompleted + 1,
  };
}

/**
 * Enter the post-round item-choice phase. Legal only from "resolved" on a
 * cadence round; the resolved presentation (results, damage, categories, next
 * -round hint) stays in state untouched so it remains visible throughout.
 */
export function beginItemChoice(state: MatchState): MatchState {
  if (state.phase !== "resolved" || !itemChoiceDue(state)) return state;
  return { ...state, phase: "item-choice" };
}

/**
 * Attach an owned item to the player's placed champion in one lane. At most
 * one equip per round; re-equipping replaces the single pending assignment.
 * Blocks: unknown lane, empty lane, unowned item, incompatible stat family
 * (which covers move-speed/attack-range until an item supports them).
 * Direction is never checked: a harmful bonus in a Lowest lane is legal.
 */
export function equipItem(state: MatchState, categoryId: StatCategoryId, itemId: ItemId): MatchState {
  if (!state.itemsEnabled || state.phase !== "selecting") return state;
  if (inventoryCount(state.playerInventory, itemId) <= 0) return state;
  const category = state.currentCategories.find((entry) => entry.id === categoryId);
  if (!category) return state;
  if (!state.assignments[categoryId]) return state;
  if (!isItemCompatible(itemId, category.family)) return state;
  return { ...state, equippedItem: { categoryId, itemId } };
}

/** Remove the pending equip without consuming the item. */
export function unequipItem(state: MatchState): MatchState {
  if (!state.equippedItem) return state;
  return { ...state, equippedItem: null };
}

export type BotItemPlay = EquippedItem | null;

/**
 * Deterministic bot item use for one round, decided at resolution time so no
 * pre-reveal state ever holds the bot's choice. The bot only sees its own
 * assignments and inventory (never the player's hidden equip). Policy: spend
 * the owned item whose relative value gain buys the largest fraction of a
 * lane's decisive margin, hold everything when no gain reaches the minimum
 * fraction, and never boost a Lowest lane (a positive bonus only hurts there).
 * Ties break by lane order then by the fixed ITEM_IDS order.
 */
export function selectBotItemPlay(
  botAssignments: Record<StatCategoryId, StatCheckCard>,
  categories: StatCategory[],
  inventory: ItemInventory,
): BotItemPlay {
  let best: { play: EquippedItem; score: number } | null = null;
  for (const category of categories) {
    if (category.direction !== "higher") continue;
    const assigned = botAssignments[category.id];
    if (!assigned) continue;
    const natural = category.getValue(assigned);
    for (const itemId of ITEM_IDS) {
      if (inventoryCount(inventory, itemId) <= 0) continue;
      const bonus = itemBonusFor(itemId, category.family);
      if (bonus <= 0) continue;
      const relativeGain = natural > 0 ? bonus / natural : 1;
      const score = relativeGain / category.decisiveThreshold;
      if (score < BOT_ITEM_STRATEGY.minDecisiveFraction) continue;
      if (!best || score > best.score + 1e-9) {
        best = { play: { categoryId: category.id, itemId }, score };
      }
    }
  }
  return best?.play ?? null;
}

export function isReadyToLock(state: MatchState): boolean {
  return state.currentCategories.every((category) => Boolean(state.assignments[category.id]));
}

export function resolveCurrentRound(state: MatchState, options: { botUsesClue?: boolean } = {}): MatchState {
  if (state.phase !== "selecting" || !isReadyToLock(state)) return state;
  // The bot only ever sees the same public clue the player sees: the broad
  // family of nextCategories[0]. Exact future categories and draw order stay hidden.
  const botClueFamily = options.botUsesClue === false ? undefined : state.nextCategories[0]?.family;
  const playerAssignments = state.currentCategories.reduce((acc, category) => {
    const card = state.playerHand.find((item) => item.id === state.assignments[category.id]);
    if (!card) throw new Error(`Missing player card for ${category.id}`);
    acc[category.id] = card;
    return acc;
  }, {} as Record<StatCategoryId, StatCheckCard>);
  const botAssignments = selectBotAssignments(state.botHand, state.currentCategories, botClueFamily);
  // Item plays: the player's pending equip and the bot's resolution-time
  // decision. Both are consumed atomically inside this single transition; the
  // phase guard above makes repeated resolve calls no-ops, so an item can
  // never be consumed twice for one round.
  const playerPlay = state.itemsEnabled ? state.equippedItem : null;
  const botPlay = state.itemsEnabled
    ? selectBotItemPlay(botAssignments, state.currentCategories, state.botInventory)
    : null;
  const results = state.currentCategories.map((category) =>
    compareCategory(
      category,
      playerAssignments[category.id],
      botAssignments[category.id],
      playerPlay?.categoryId === category.id ? playerPlay.itemId : null,
      botPlay?.categoryId === category.id ? botPlay.itemId : null,
    ),
  );
  const damage = calculateRoundDamage(results);
  const playerHpAfter = Math.max(0, state.playerHp - damage.bot);
  const botHpAfter = Math.max(0, state.botHp - damage.player);
  const outcome = matchOutcome(playerHpAfter, botHpAfter);
  const clueFamily = state.nextCategories[0]?.family ?? null;
  const strongestClueId = strongestClueCardId(state.playerHand, clueFamily);
  const playedPlayerIds = new Set(Object.values(playerAssignments).map((card) => card.id));
  const resolution: RoundResolution = {
    round: state.round,
    categories: state.currentCategories,
    playerAssignments,
    botAssignments,
    results,
    damage,
    playerHpBefore: state.playerHp,
    botHpBefore: state.botHp,
    playerHpAfter,
    botHpAfter,
    outcome,
    clueFamily,
    playerRetainedBestClueCard: strongestClueId ? !playedPlayerIds.has(strongestClueId) : null,
  };
  return {
    ...state,
    phase: outcome ? "match-over" : "resolved",
    playerHp: playerHpAfter,
    botHp: botHpAfter,
    playerInventory: playerPlay
      ? removeInventoryItem(state.playerInventory, playerPlay.itemId)
      : state.playerInventory,
    botInventory: botPlay ? removeInventoryItem(state.botInventory, botPlay.itemId) : state.botInventory,
    equippedItem: null,
    lastResolution: resolution,
    roundHistory: [...state.roundHistory, resolution],
    outcome,
    endReason: outcome ? (outcome === "draw" ? "Simultaneous knockout." : "HP reached zero.") : null,
  };
}

export function startNextRound(state: MatchState): MatchState {
  if (state.phase !== "resolved" || !state.lastResolution) return state;
  // A due item-choice phase must complete before the next round can begin.
  if (itemChoiceDue(state)) return state;
  const playerPlayed = new Set(Object.values(state.assignments).filter(Boolean));
  const botPlayed = new Set(Object.values(state.lastResolution.botAssignments).map((card) => card.id));
  const playerHandRemaining = state.playerHand.filter((card) => !playerPlayed.has(card.id));
  const botHandRemaining = state.botHand.filter((card) => !botPlayed.has(card.id));
  const playerDraw = drawUpTo(playerHandRemaining, state.drawPile);
  const botDraw = drawUpTo(botHandRemaining, playerDraw.deck);
  const playerDiscard = [
    ...state.playerDiscard,
    ...state.currentCategories.map((category) => state.lastResolution!.playerAssignments[category.id]),
  ];
  const botDiscard = [
    ...state.botDiscard,
    ...state.currentCategories.map((category) => state.lastResolution!.botAssignments[category.id]),
  ];

  if (playerDraw.hand.length < ROUND_SLOTS || botDraw.hand.length < ROUND_SLOTS) {
    const outcome = state.playerHp > state.botHp ? "player" : state.botHp > state.playerHp ? "bot" : "draw";
    return {
      ...state,
      phase: "match-over",
      playerHand: playerDraw.hand,
      botHand: botDraw.hand,
      drawPile: botDraw.deck,
      playerDiscard,
      botDiscard,
      assignments: emptyAssignments(state.currentCategories),
      outcome,
      endReason: "Deck exhausted before either side could field three cards.",
    };
  }

  const currentCategories = state.nextCategories;
  const nextCategories = generateCategoryBoard(state.seed, state.round + 2, currentCategories);
  return {
    ...state,
    phase: "selecting",
    round: state.round + 1,
    playerHand: playerDraw.hand,
    botHand: botDraw.hand,
    drawPile: botDraw.deck,
    playerDiscard,
    botDiscard,
    currentCategories,
    nextCategories,
    assignments: emptyAssignments(currentCategories),
    lastResolution: null,
  };
}

function matchOutcome(playerHp: number, botHp: number): MatchOutcome {
  if (playerHp <= 0 && botHp <= 0) return "draw";
  if (playerHp <= 0) return "bot";
  if (botHp <= 0) return "player";
  return null;
}

export function autoAssignBestPlayerHand(state: MatchState): MatchState {
  let next = state;
  const botLike = selectBotAssignments(state.playerHand, state.currentCategories);
  for (const category of state.currentCategories) {
    next = assignCard(next, category.id, botLike[category.id].id);
  }
  return next;
}

export type MatchInvariantIssue = {
  code: string;
  message: string;
};

export function validateMatchInvariants(state: MatchState, originalDeck?: StatCheckCard[]): MatchInvariantIssue[] {
  const issues: MatchInvariantIssue[] = [];
  const expectedIds = originalDeck ? new Set(uniqueCardsById(originalDeck).map((card) => card.id)) : null;
  const locations = [
    { name: "drawPile", cards: state.drawPile },
    { name: "playerHand", cards: state.playerHand },
    { name: "botHand", cards: state.botHand },
    { name: "playerDiscard", cards: state.playerDiscard },
    { name: "botDiscard", cards: state.botDiscard },
  ];

  for (const location of locations) {
    const seen = new Set<string>();
    for (const card of location.cards) {
      if (seen.has(card.id)) {
        issues.push({ code: "duplicate-in-location", message: `${card.id} appears more than once in ${location.name}.` });
      }
      seen.add(card.id);
    }
  }

  const activeLocations = locations.slice(0, 3);
  const allActiveIds = new Map<string, string>();
  for (const location of activeLocations) {
    for (const card of location.cards) {
      const previous = allActiveIds.get(card.id);
      if (previous) {
        issues.push({ code: "duplicate-active-card", message: `${card.id} appears in both ${previous} and ${location.name}.` });
      } else {
        allActiveIds.set(card.id, location.name);
      }
    }
  }

  const discardedIds = new Map<string, string>();
  for (const location of locations.slice(3)) {
    for (const card of location.cards) {
      const previous = discardedIds.get(card.id);
      if (previous) {
        issues.push({ code: "duplicate-discarded-card", message: `${card.id} appears in both ${previous} and ${location.name}.` });
      } else {
        discardedIds.set(card.id, location.name);
      }
      const active = allActiveIds.get(card.id);
      if (active) {
        issues.push({ code: "discarded-card-active", message: `${card.id} appears in ${location.name} and active ${active}.` });
      }
    }
  }

  const assignedIds = Object.values(state.assignments).filter((id): id is string => Boolean(id));
  for (const id of assignedIds) {
    if (!discardedIds.has(id) && !state.playerHand.some((card) => card.id === id)) {
      issues.push({ code: "missing-player-assignment", message: `${id} is assigned but is not owned by the player.` });
    }
  }
  if (new Set(assignedIds).size !== assignedIds.length) {
    issues.push({ code: "duplicate-player-assignment", message: "A player card is assigned to more than one lane." });
  }
  if (state.lastResolution) {
    const botAssignedIds = Object.values(state.lastResolution.botAssignments).map((card) => card.id);
    if (new Set(botAssignedIds).size !== botAssignedIds.length) {
      issues.push({ code: "duplicate-bot-assignment", message: "A bot card is assigned to more than one lane." });
    }
    for (const id of botAssignedIds) {
      if (!discardedIds.has(id) && !state.botHand.some((card) => card.id === id)) {
        issues.push({ code: "missing-bot-assignment", message: `${id} is assigned but is not owned by the bot.` });
      }
    }
  }

  if (expectedIds) {
    const locatedIds = new Set<string>();
    for (const location of locations) {
      for (const card of location.cards) {
        locatedIds.add(card.id);
        if (!expectedIds.has(card.id)) {
          issues.push({ code: "unknown-card", message: `${card.id} is not in the original eligible roster.` });
        }
      }
    }
    for (const id of expectedIds) {
      if (!locatedIds.has(id)) {
        issues.push({ code: "missing-card", message: `${id} is missing from all deck, hand, and discard locations.` });
      }
    }
    if (locatedIds.size !== expectedIds.size) {
      issues.push({ code: "roster-size-mismatch", message: "Located champion identity count does not match the original eligible roster." });
    }
  }

  // Board-structure invariants: unique exact categories and unique families
  // within the round, and no exact category carried over from the round that
  // just completed (identity = stat + direction + level, i.e. the id).
  if (new Set(state.currentCategories.map((category) => category.id)).size !== state.currentCategories.length) {
    issues.push({ code: "duplicate-board-category", message: "The current board repeats an exact category." });
  }
  if (new Set(state.currentCategories.map((category) => category.family)).size !== state.currentCategories.length) {
    issues.push({ code: "duplicate-board-family", message: "The current board repeats a stat family." });
  }
  const previousRound = state.roundHistory[state.roundHistory.length - 1];
  if (previousRound && previousRound.round === state.round - 1) {
    for (const category of state.currentCategories) {
      if (previousRound.categories.some((prev) => prev.id === category.id)) {
        issues.push({
          code: "consecutive-category-repeat",
          message: `${category.id} appeared in round ${previousRound.round} and again in round ${state.round}.`,
        });
      }
    }
  }

  if (state.itemsEnabled) {
    for (const itemId of ITEM_IDS) {
      if (inventoryCount(state.playerInventory, itemId) < 0 || inventoryCount(state.botInventory, itemId) < 0) {
        issues.push({ code: "negative-item-count", message: `${itemId} has a negative inventory count.` });
      }
    }
    // Ledger: every acquisition is either still held or consumed in exactly
    // one recorded round. Guards against duplicate acquisition/consumption.
    const consumed = (side: Side) =>
      state.roundHistory.reduce(
        (sum, round) =>
          sum + round.results.filter((result) => (side === "player" ? result.playerItem : result.botItem)).length,
        0,
      );
    const playerLedger = totalInventoryCount(state.playerInventory) + consumed("player");
    const botLedger = totalInventoryCount(state.botInventory) + consumed("bot");
    if (playerLedger !== state.itemChoicesCompleted) {
      issues.push({
        code: "item-ledger-mismatch",
        message: `Player holds+consumed ${playerLedger} items but completed ${state.itemChoicesCompleted} acquisitions.`,
      });
    }
    if (botLedger !== state.itemChoicesCompleted) {
      issues.push({
        code: "item-ledger-mismatch",
        message: `Bot holds+consumed ${botLedger} items but completed ${state.itemChoicesCompleted} acquisitions.`,
      });
    }
    for (const round of state.roundHistory) {
      if (round.results.filter((result) => result.playerItem).length > 1) {
        issues.push({ code: "multiple-player-items", message: `Round ${round.round} consumed more than one player item.` });
      }
      if (round.results.filter((result) => result.botItem).length > 1) {
        issues.push({ code: "multiple-bot-items", message: `Round ${round.round} consumed more than one bot item.` });
      }
    }
    if (state.equippedItem) {
      const { categoryId, itemId } = state.equippedItem;
      if (inventoryCount(state.playerInventory, itemId) <= 0) {
        issues.push({ code: "equip-not-owned", message: `${itemId} is equipped but not in the player inventory.` });
      }
      if (!state.assignments[categoryId]) {
        issues.push({ code: "equip-empty-lane", message: `${itemId} is equipped to empty lane ${categoryId}.` });
      }
      const category = state.currentCategories.find((entry) => entry.id === categoryId);
      if (!category || !isItemCompatible(itemId, category.family)) {
        issues.push({ code: "equip-incompatible", message: `${itemId} is equipped to incompatible lane ${categoryId}.` });
      }
    }
  }

  return issues;
}

function uniqueCardsById(deck: StatCheckCard[]): StatCheckCard[] {
  const seen = new Set<string>();
  return deck.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}
