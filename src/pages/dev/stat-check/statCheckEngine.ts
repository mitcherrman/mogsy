import { attackSpeedAtLevel, statAtLevel, type ChampionBaseStats } from "@/lib/league-docs/api";

export type Side = "player" | "bot";
export type StatDirection = "higher" | "lower";
export type GamePhase = "selecting" | "locked" | "revealing" | "resolved" | "match-over";
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
    magicResist: number;
    moveSpeed: number;
    attackRange: number;
    attackSpeed: number;
    attackSpeedPerLevel: number;
  };
};

export type StatCategoryId =
  | "highest-hp-1"
  | "highest-hp-18"
  | "highest-ad-18"
  | "lowest-armor-1"
  | "lowest-mr-1"
  | "highest-move-speed"
  | "highest-attack-range"
  | "lowest-attack-speed-1";

export type StatCategory = {
  id: StatCategoryId;
  label: string;
  shortLabel: string;
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
};

export type MatchState = {
  seed: string;
  phase: GamePhase;
  round: number;
  playerHp: number;
  botHp: number;
  playerDeck: StatCheckCard[];
  botDeck: StatCheckCard[];
  playerHand: StatCheckCard[];
  botHand: StatCheckCard[];
  playerDiscard: StatCheckCard[];
  botDiscard: StatCheckCard[];
  currentCategories: StatCategory[];
  nextCategories: StatCategory[];
  assignments: SlotAssignments;
  lastResolution: RoundResolution | null;
  outcome: MatchOutcome;
  endReason: string | null;
};

const STARTING_HP = 30;
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

export const STAT_CATEGORIES: StatCategory[] = [
  {
    id: "highest-hp-1",
    label: "Highest level-1 health",
    shortLabel: "L1 HP",
    direction: "higher",
    decisiveThreshold: 0.12,
    explanation: "Health spread is meaningful but not massive, so 12% is a prototype tuning value.",
    getValue: (card) => card.stats.hp,
    formatValue: whole,
  },
  {
    id: "highest-hp-18",
    label: "Highest level-18 health",
    shortLabel: "L18 HP",
    direction: "higher",
    decisiveThreshold: 0.12,
    explanation: "Uses Riot's level scaling formula through the shared League Docs stat helpers.",
    getValue: (card) => statAtLevel(card.stats.hp, card.stats.hpPerLevel, 18),
    formatValue: whole,
  },
  {
    id: "highest-ad-18",
    label: "Highest level-18 attack damage",
    shortLabel: "L18 AD",
    direction: "higher",
    decisiveThreshold: 0.12,
    explanation: "Attack damage growth varies enough that 12% catches clear stat-check wins.",
    getValue: (card) => statAtLevel(card.stats.ad, card.stats.adPerLevel, 18),
    formatValue: number,
  },
  {
    id: "lowest-armor-1",
    label: "Lowest base armor",
    shortLabel: "Low armor",
    direction: "lower",
    decisiveThreshold: 0.15,
    explanation: "A 15% lower-armor margin is treated as a decisive prototype mismatch.",
    getValue: (card) => card.stats.armor,
    formatValue: number,
  },
  {
    id: "lowest-mr-1",
    label: "Lowest base magic resistance",
    shortLabel: "Low MR",
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
    direction: "higher",
    decisiveThreshold: 0.05,
    explanation: "Movement speed has a small range, making 5% a notable prototype edge.",
    getValue: (card) => card.stats.moveSpeed,
    formatValue: whole,
  },
  {
    id: "highest-attack-range",
    label: "Highest attack range",
    shortLabel: "Range",
    direction: "higher",
    decisiveThreshold: 0.2,
    explanation: "Range has large class breaks, so 20% avoids constant bonus damage.",
    getValue: (card) => card.stats.attackRange,
    formatValue: whole,
  },
  {
    id: "lowest-attack-speed-1",
    label: "Lowest level-1 attack speed",
    shortLabel: "Low AS",
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

export function generateCategoryBoard(seed: string, round: number, previous?: StatCategory[]): StatCategory[] {
  const random = createSeededRandom(`${seed}:categories:${round}`);
  const pool = STAT_CATEGORIES.slice();
  const board: StatCategory[] = [];
  while (board.length < ROUND_SLOTS && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    board.push(pool.splice(index, 1)[0]);
  }
  if (
    previous &&
    previous.length === board.length &&
    previous.every((category, index) => category.id === board[index].id)
  ) {
    const replacement = STAT_CATEGORIES.find(
      (category) => !board.some((existing) => existing.id === category.id),
    );
    if (replacement) board[2] = replacement;
  }
  return board;
}

export function compareCategory(category: StatCategory, playerCard: StatCheckCard, botCard: StatCheckCard): CategoryResult {
  const playerValue = category.getValue(playerCard);
  const botValue = category.getValue(botCard);
  const winner = (() => {
    if (playerValue === botValue) return "tie";
    if (category.direction === "higher") return playerValue > botValue ? "player" : "bot";
    return playerValue < botValue ? "player" : "bot";
  })();
  const margin =
    winner === "tie"
      ? 0
      : relativeMargin(winner === "player" ? playerValue : botValue, winner === "player" ? botValue : playerValue);
  return {
    category,
    playerCard,
    botCard,
    playerValue,
    botValue,
    winner,
    margin,
    decisive: winner !== "tie" && margin >= category.decisiveThreshold,
  };
}

/**
 * Relative stat margin. The denominator is the winning value so a 700 vs 630
 * higher-wins result is (700 - 630) / 700 = 10%. If the winning value is zero,
 * any non-zero gap is treated as a full 100% margin to avoid division by zero.
 */
export function relativeMargin(winningValue: number, losingValue: number): number {
  const diff = Math.abs(winningValue - losingValue);
  if (diff === 0) return 0;
  const denominator = Math.abs(winningValue);
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

export function selectBotAssignments(hand: StatCheckCard[], categories: StatCategory[]): Record<StatCategoryId, StatCheckCard> {
  if (hand.length < categories.length) throw new Error("Bot needs at least three cards.");
  let best: { cards: StatCheckCard[]; score: number[] } | null = null;

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
        const candidateScore = [total, ...normalized, ...tieBreak];
        if (!best || lexicographic(candidateScore, best.score) > 0) {
          best = { cards, score: candidateScore };
        }
      }
    }
  }

  return categories.reduce((acc, category, index) => {
    acc[category.id] = best!.cards[index];
    return acc;
  }, {} as Record<StatCategoryId, StatCheckCard>);
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

export function createMatch(deck: StatCheckCard[], seed = "stat-check-v1"): MatchState {
  if (deck.length < HAND_SIZE * 2 + ROUND_SLOTS * 2) {
    throw new Error("Stat Check needs at least 18 supported champion cards.");
  }
  const shuffled = shuffleDeterministic(deck, seed);
  const playerDraw = drawUpTo([], shuffled.filter((_, index) => index % 2 === 0), HAND_SIZE);
  const botDraw = drawUpTo([], shuffled.filter((_, index) => index % 2 === 1), HAND_SIZE);
  const currentCategories = generateCategoryBoard(seed, 1);
  const nextCategories = generateCategoryBoard(seed, 2, currentCategories);
  return {
    seed,
    phase: "selecting",
    round: 1,
    playerHp: STARTING_HP,
    botHp: STARTING_HP,
    playerDeck: playerDraw.deck,
    botDeck: botDraw.deck,
    playerHand: playerDraw.hand,
    botHand: botDraw.hand,
    playerDiscard: [],
    botDiscard: [],
    currentCategories,
    nextCategories,
    assignments: emptyAssignments(currentCategories),
    lastResolution: null,
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
  return { ...state, assignments };
}

export function isReadyToLock(state: MatchState): boolean {
  return state.currentCategories.every((category) => Boolean(state.assignments[category.id]));
}

export function resolveCurrentRound(state: MatchState): MatchState {
  if (state.phase !== "selecting" || !isReadyToLock(state)) return state;
  const playerAssignments = state.currentCategories.reduce((acc, category) => {
    const card = state.playerHand.find((item) => item.id === state.assignments[category.id]);
    if (!card) throw new Error(`Missing player card for ${category.id}`);
    acc[category.id] = card;
    return acc;
  }, {} as Record<StatCategoryId, StatCheckCard>);
  const botAssignments = selectBotAssignments(state.botHand, state.currentCategories);
  const results = state.currentCategories.map((category) =>
    compareCategory(category, playerAssignments[category.id], botAssignments[category.id]),
  );
  const damage = calculateRoundDamage(results);
  const playerHpAfter = Math.max(0, state.playerHp - damage.bot);
  const botHpAfter = Math.max(0, state.botHp - damage.player);
  const outcome = matchOutcome(playerHpAfter, botHpAfter);
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
  };
  return {
    ...state,
    phase: outcome ? "match-over" : "resolved",
    playerHp: playerHpAfter,
    botHp: botHpAfter,
    lastResolution: resolution,
    outcome,
    endReason: outcome ? (outcome === "draw" ? "Simultaneous knockout." : "HP reached zero.") : null,
  };
}

export function startNextRound(state: MatchState): MatchState {
  if (state.phase !== "resolved" || !state.lastResolution) return state;
  const playerPlayed = new Set(Object.values(state.assignments).filter(Boolean));
  const botPlayed = new Set(Object.values(state.lastResolution.botAssignments).map((card) => card.id));
  const playerHandRemaining = state.playerHand.filter((card) => !playerPlayed.has(card.id));
  const botHandRemaining = state.botHand.filter((card) => !botPlayed.has(card.id));
  const playerDraw = drawUpTo(playerHandRemaining, state.playerDeck);
  const botDraw = drawUpTo(botHandRemaining, state.botDeck);
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
      playerDeck: playerDraw.deck,
      botDeck: botDraw.deck,
      playerDiscard,
      botDiscard,
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
    playerDeck: playerDraw.deck,
    botDeck: botDraw.deck,
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
