import { describe, expect, it } from "vitest";
import { statAtLevel } from "@/lib/league-docs/api";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";
import {
  ITEMS,
  ITEM_IDS,
  emptyItemInventory,
  expectedItemChoices,
  isItemChoicePoint,
  isItemCompatible,
  itemBonusFor,
  totalInventoryCount,
  type ItemId,
} from "./items";
import {
  ACTIVE_STAT_CATEGORIES,
  BOT_ITEM_STRATEGY,
  analyzeBotAssignments,
  beginItemChoice,
  chooseItem,
  equipItem,
  itemChoiceDue,
  selectBotItemAcquisition,
  selectBotItemPlay,
  unequipItem,
  STAT_CATEGORIES,
  STAT_CHECK_RULES,
  assignCard,
  autoAssignBestPlayerHand,
  calculateRoundDamage,
  compareCategory,
  createMatch,
  emptyAssignments,
  generateCategoryBoard,
  relativeMargin,
  relativeMarginForCategory,
  resolveCurrentRound,
  selectBotAssignments,
  shuffleDeterministic,
  startNextRound,
  validateMatchInvariants,
  type CategoryResult,
  type StatCategory,
  type StatCheckCard,
} from "./statCheckEngine";

const card = (name: string, value: number): StatCheckCard => ({
  id: name,
  name,
  stats: {
    hp: value,
    hpPerLevel: 10,
    ad: value,
    adPerLevel: 2,
    armor: value,
    armorPerLevel: 4,
    magicResist: value,
    moveSpeed: value,
    attackRange: value,
    attackSpeed: value,
    attackSpeedPerLevel: 1,
  },
});

const cat = (id: string, direction: "higher" | "lower", threshold = 0.12, family: StatCategory["family"] = "health"): StatCategory => ({
  id: id as StatCategory["id"],
  label: id,
  shortLabel: id,
  family,
  active: true,
  level: 1,
  direction,
  decisiveThreshold: threshold,
  explanation: "test",
  getValue: (c) => c.stats.hp,
  formatValue: String,
});

const result = (winner: "player" | "bot" | "tie", decisive = false): CategoryResult => ({
  category: cat(`highest-hp-1`, "higher"),
  playerCard: card("P", 10),
  botCard: card("B", 9),
  playerNaturalValue: 10,
  botNaturalValue: 9,
  playerItem: null,
  botItem: null,
  playerBonus: 0,
  botBonus: 0,
  playerValue: 10,
  botValue: 9,
  winner,
  margin: decisive ? 0.5 : 0.01,
  decisive,
});

const ids = (cards: StatCheckCard[]) => cards.map((item) => item.id);
const uniqueIds = (cards: StatCheckCard[]) => new Set(ids(cards));
const expectValidSharedDeck = (state: ReturnType<typeof createMatch>) => {
  expect(validateMatchInvariants(state, STAT_CHECK_FIXTURE_DECK)).toEqual([]);
};
const expandedDeck = () => [
  ...STAT_CHECK_FIXTURE_DECK,
  ...Array.from({ length: 24 }, (_, index) => card(`Extra ${index + 1}`, 100 + index)),
];

describe("Stat Check engine", () => {
  it("compares higher-wins categories", () => {
    expect(compareCategory(cat("highest-hp-1", "higher"), card("Big", 10), card("Small", 9)).winner).toBe("player");
  });

  it("compares lower-wins categories", () => {
    expect(compareCategory(cat("lowest-armor-1", "lower"), card("Soft", 9), card("Hard", 10)).winner).toBe("player");
  });

  it("handles exact ties without decisive damage", () => {
    const tied = compareCategory(cat("highest-hp-1", "higher"), card("A", 10), card("B", 10));
    expect(tied.winner).toBe("tie");
    expect(tied.margin).toBe(0);
    expect(tied.decisive).toBe(false);
  });

  it("uses winning value as the percentage-margin denominator", () => {
    expect(relativeMargin(100, 80)).toBeCloseTo(0.2);
    expect(relativeMargin(0, 8)).toBe(1);
  });

  it("uses the canonical decisive margin denominator for higher and lower categories", () => {
    expect(relativeMarginForCategory(cat("highest-hp-1", "higher"), 100, 80)).toBeCloseTo(0.2);
    expect(relativeMarginForCategory(cat("lowest-armor-1", "lower"), 20, 25)).toBeCloseTo(0.2);

    const lowerResult = compareCategory(cat("lowest-armor-1", "lower", 0.2), card("Soft", 20), card("Hard", 25));
    expect(lowerResult.winner).toBe("player");
    expect(lowerResult.margin).toBeCloseTo(0.2);
    expect(lowerResult.decisive).toBe(true);
  });

  it("uses adaptive decisive thresholds from category definitions", () => {
    expect(STAT_CATEGORIES.find((c) => c.id === "highest-move-speed")?.decisiveThreshold).toBe(0.05);
    expect(STAT_CATEGORIES.find((c) => c.id === "highest-attack-range")?.decisiveThreshold).toBe(0.2);
  });

  it("records an authoritative round history with the visible clue", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "history");
    expect(state.roundHistory).toEqual([]);
    const visibleClue = state.nextCategories[0].family;
    state = resolveCurrentRound(autoAssignBestPlayerHand(state));
    expect(state.roundHistory).toHaveLength(1);
    expect(state.roundHistory[0]).toBe(state.lastResolution);
    expect(state.roundHistory[0].clueFamily).toBe(visibleClue);
    expect([true, false, null]).toContain(state.roundHistory[0].playerRetainedBestClueCard);
    state = startNextRound(state);
    expect(state.roundHistory).toHaveLength(1);
    state = resolveCurrentRound(autoAssignBestPlayerHand(state));
    expect(state.roundHistory).toHaveLength(2);
    expect(state.roundHistory[1].round).toBe(2);
    // A fresh match (restart) starts with an empty history again.
    expect(createMatch(STAT_CHECK_FIXTURE_DECK, "history").roundHistory).toEqual([]);
  });

  it("owns starting HP in one authoritative constant", () => {
    expect(STAT_CHECK_RULES.startingHp).toBe(20);
    const state = createMatch(STAT_CHECK_FIXTURE_DECK, "hp-ownership");
    expect(state.playerHp).toBe(STAT_CHECK_RULES.startingHp);
    expect(state.botHp).toBe(STAT_CHECK_RULES.startingHp);
    const restarted = createMatch(STAT_CHECK_FIXTURE_DECK, "hp-ownership:restart");
    expect(restarted.playerHp).toBe(STAT_CHECK_RULES.startingHp);
    expect(restarted.botHp).toBe(STAT_CHECK_RULES.startingHp);
  });

  it("documents simultaneous-lethal and overkill endings", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "lethal");
    // Overkill: damage beyond remaining HP clamps to zero and ends the match.
    state = { ...state, playerHp: 2, botHp: STAT_CHECK_RULES.startingHp };
    state = resolveCurrentRound(autoAssignBestPlayerHand(state));
    if (state.lastResolution!.damage.bot >= 2) {
      expect(state.playerHp).toBe(0);
      expect(state.phase).toBe("match-over");
      expect(state.outcome).toBe("bot");
    } else {
      expect(state.playerHp).toBeGreaterThan(0);
      expect(state.outcome).toBeNull();
    }
    // No premature ending above zero.
    let fresh = createMatch(STAT_CHECK_FIXTURE_DECK, "lethal:fresh");
    fresh = resolveCurrentRound(autoAssignBestPlayerHand(fresh));
    expect(fresh.playerHp).toBeGreaterThan(0);
    expect(fresh.botHp).toBeGreaterThan(0);
    expect(fresh.outcome).toBeNull();
  });

  it("gives every active category an explicit calibrated threshold across the 16-category pool", () => {
    const expected: Record<string, number> = {
      "highest-hp-1": 0.05,
      "lowest-hp-1": 0.075,
      "highest-hp-18": 0.075,
      "lowest-hp-18": 0.1,
      "highest-ad-1": 0.1,
      "lowest-ad-1": 0.125,
      "highest-ad-18": 0.15,
      "lowest-ad-18": 0.15,
      "highest-armor-1": 0.25,
      "lowest-armor-1": 0.25,
      "highest-armor-18": 0.1,
      "lowest-armor-18": 0.15,
      "highest-move-speed": 0.05,
      "lowest-move-speed": 0.05,
      "highest-attack-range": 0.2,
      "lowest-attack-range": 0.2,
    };
    expect(Object.fromEntries(ACTIVE_STAT_CATEGORIES.map((c) => [c.id, c.decisiveThreshold]))).toEqual(expected);
    expect(ACTIVE_STAT_CATEGORIES).toHaveLength(16);
    for (const category of ACTIVE_STAT_CATEGORIES) {
      expect(category.decisiveThreshold).toBeGreaterThan(0);
      expect(category.decisiveThreshold).toBeLessThanOrEqual(0.5);
    }
  });

  it("defines exact category identity as stat family + direction + level", () => {
    // Every active category is unique on the identity triple, and Highest/
    // Lowest and L1/L18 variants of one stat are distinct categories.
    const identities = ACTIVE_STAT_CATEGORIES.map((c) => `${c.family}|${c.direction}|${c.level}`);
    expect(new Set(identities).size).toBe(ACTIVE_STAT_CATEGORIES.length);
    const byFamily = (family: StatCategory["family"]) => ACTIVE_STAT_CATEGORIES.filter((c) => c.family === family);
    for (const family of ["health", "attack-damage", "armor"] as const) {
      expect(byFamily(family)).toHaveLength(4);
      expect(new Set(byFamily(family).map((c) => `${c.direction}|${c.level}`)).size).toBe(4);
      expect(byFamily(family).every((c) => c.level === 1 || c.level === 18)).toBe(true);
    }
    for (const family of ["move-speed", "attack-range"] as const) {
      expect(byFamily(family)).toHaveLength(2);
      expect(byFamily(family).every((c) => c.level === null)).toBe(true);
    }
    // No intermediate curated levels are active yet.
    expect(ACTIVE_STAT_CATEGORIES.some((c) => c.level !== null && c.level !== 1 && c.level !== 18)).toBe(false);
  });

  it("evaluates level-18 armor through the shared statAtLevel path", () => {
    const category = STAT_CATEGORIES.find((c) => c.id === "highest-armor-18")!;
    const sample = card("Armored", 30);
    expect(category.getValue(sample)).toBe(statAtLevel(30, 4, 18));
    expect(category.getValue(sample)).toBeGreaterThan(30);
  });

  it("treats the exact threshold as decisive and just-below as not", () => {
    const higher = cat("highest-hp-1", "higher", 0.1);
    expect(compareCategory(higher, card("Big", 100), card("Small", 90)).decisive).toBe(true);
    expect(compareCategory(higher, card("Big", 100), card("Small", 91)).decisive).toBe(false);
    const lower = cat("lowest-armor-1", "lower", 0.25);
    expect(compareCategory(lower, card("Soft", 75), card("Hard", 100)).decisive).toBe(true);
    expect(compareCategory(lower, card("Soft", 76), card("Hard", 100)).decisive).toBe(false);
  });

  it("calculates 2-1 board damage", () => {
    const damage = calculateRoundDamage([result("player"), result("player"), result("bot")]);
    expect(damage.boardWinner).toBe("player");
    expect(damage.player).toBe(2);
    expect(damage.bot).toBe(0);
  });

  it("awards board wins for 2-0 with one tie and 1-0 with two ties", () => {
    expect(calculateRoundDamage([result("player"), result("player"), result("tie")]).boardWinner).toBe("player");
    expect(calculateRoundDamage([result("bot"), result("tie"), result("tie")]).boardWinner).toBe("bot");
  });

  it("keeps 1-1 and 0-0 boards tied", () => {
    expect(calculateRoundDamage([result("player"), result("bot"), result("tie")]).boardWinner).toBe("tie");
    expect(calculateRoundDamage([result("tie"), result("tie"), result("tie")]).boardWinner).toBe("tie");
  });

  it("calculates narrow 2-1 and decisive 2-1 damage", () => {
    expect(calculateRoundDamage([result("player"), result("player"), result("bot")]).player).toBe(2);

    const decisive = calculateRoundDamage([result("player", true), result("player"), result("bot")]);
    expect(decisive.player).toBe(3);
    expect(decisive.bot).toBe(0);
  });

  it("calculates contested 2-1 damage with both sides dealing", () => {
    const damage = calculateRoundDamage([result("player", true), result("player"), result("bot", true)]);
    expect(damage.boardWinner).toBe("player");
    expect(damage.player).toBe(3);
    expect(damage.bot).toBe(1);
  });

  it("adds sweep damage for 3-0 boards", () => {
    const damage = calculateRoundDamage([result("player"), result("player"), result("player")]);
    expect(damage.player).toBe(3);
  });

  it("caps a fully decisive 3-0 sweep at 6 damage", () => {
    const damage = calculateRoundDamage([result("player", true), result("player", true), result("player", true)]);
    expect(damage.player).toBe(6);
    expect(damage.bot).toBe(0);
  });

  it("awards decisive category damage on tied boards without board-win damage", () => {
    const damage = calculateRoundDamage([result("player", true), result("bot", true), result("tie")]);
    expect(damage.boardWinner).toBe("tie");
    expect(damage.playerBoardDamage).toBe(0);
    expect(damage.botBoardDamage).toBe(0);
    expect(damage.player).toBe(1);
    expect(damage.bot).toBe(1);
  });

  it("never awards decisive damage for tied categories", () => {
    const damage = calculateRoundDamage([result("tie", true), result("tie", true), result("tie", true)]);
    expect(damage.player).toBe(0);
    expect(damage.bot).toBe(0);
  });

  it("allows losing the board while still dealing decisive category damage", () => {
    const damage = calculateRoundDamage([result("player", true), result("bot"), result("bot")]);
    expect(damage.boardWinner).toBe("bot");
    expect(damage.player).toBe(1);
    expect(damage.bot).toBe(2);
  });

  it("allows both players to deal damage in one round", () => {
    const damage = calculateRoundDamage([result("player", true), result("bot", true), result("bot")]);
    expect(damage.player).toBe(1);
    expect(damage.bot).toBe(3);
  });

  it("allows simultaneous knockout as a draw", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "ko");
    const categories = [
      STAT_CATEGORIES.find((c) => c.id === "highest-attack-range")!,
      STAT_CATEGORIES.find((c) => c.id === "highest-move-speed")!,
      STAT_CATEGORIES.find((c) => c.id === "lowest-armor-1")!,
    ];
    const rangeAce = { ...card("Range Ace", 1), stats: { ...card("Range Ace", 1).stats, attackRange: 2000, moveSpeed: 100, armor: 100 } };
    const fillerA = card("Filler A", 10);
    const fillerB = card("Filler B", 11);
    const botRange = { ...card("Bot Range", 1), stats: { ...card("Bot Range", 1).stats, attackRange: 500, moveSpeed: 100, armor: 100 } };
    const botFast = { ...card("Bot Fast", 1), stats: { ...card("Bot Fast", 1).stats, attackRange: 100, moveSpeed: 500, armor: 100 } };
    const botSoft = { ...card("Bot Soft", 1), stats: { ...card("Bot Soft", 1).stats, attackRange: 100, moveSpeed: 100, armor: 1 } };
    state = {
      ...state,
      currentCategories: categories,
      playerHand: [rangeAce, fillerA, fillerB],
      botHand: [botRange, botFast, botSoft],
      assignments: {
        "highest-attack-range": rangeAce.id,
        "highest-move-speed": fillerA.id,
        "lowest-armor-1": fillerB.id,
      } as typeof state.assignments,
      playerHp: 1,
      botHp: 1,
    };
    const resolved = resolveCurrentRound(state);
    expect(resolved.phase).toBe("match-over");
    expect(resolved.outcome).toBe("draw");
    expect(resolved.playerHp).toBe(0);
    expect(resolved.botHp).toBe(0);
  });

  it("shuffles decks deterministically", () => {
    const a = shuffleDeterministic(STAT_CHECK_FIXTURE_DECK, "same").map((c) => c.id);
    const b = shuffleDeterministic(STAT_CHECK_FIXTURE_DECK, "same").map((c) => c.id);
    const c = shuffleDeterministic(STAT_CHECK_FIXTURE_DECK, "other").map((x) => x.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("generates deterministic category boards without duplicates", () => {
    const a = generateCategoryBoard("seed", 1);
    const b = generateCategoryBoard("seed", 1);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
  });

  it("only generates active categories and never retired ones", () => {
    const retired = new Set(STAT_CATEGORIES.filter((c) => !c.active).map((c) => c.id));
    expect(retired).toEqual(new Set(["lowest-mr-1", "lowest-attack-speed-1"]));
    const seen = new Set<string>();
    for (let seedIndex = 0; seedIndex < 100; seedIndex++) {
      for (let round = 1; round <= 6; round++) {
        for (const category of generateCategoryBoard(`pool:${seedIndex}`, round)) {
          expect(retired.has(category.id)).toBe(false);
          seen.add(category.id);
        }
      }
    }
    expect(seen).toEqual(new Set(ACTIVE_STAT_CATEGORIES.map((c) => c.id)));
    expect(seen.has("highest-move-speed")).toBe(true);
    expect(seen.has("highest-attack-range")).toBe(true);
  });

  it("never repeats a broad stat family on one board", () => {
    for (let seedIndex = 0; seedIndex < 100; seedIndex++) {
      let previous: ReturnType<typeof generateCategoryBoard> | undefined;
      for (let round = 1; round <= 6; round++) {
        const board = generateCategoryBoard(`family:${seedIndex}`, round, previous);
        expect(board).toHaveLength(3);
        expect(new Set(board.map((c) => c.family)).size).toBe(3);
        previous = board;
      }
    }
  });

  it("exposes only active broad families through the next-round clue slot", () => {
    const activeFamilies = new Set(ACTIVE_STAT_CATEGORIES.map((c) => c.family));
    expect(activeFamilies.has("magic-resist")).toBe(false);
    expect(activeFamilies.has("attack-speed")).toBe(false);
    for (let seedIndex = 0; seedIndex < 50; seedIndex++) {
      const state = createMatch(STAT_CHECK_FIXTURE_DECK, `clue:${seedIndex}`);
      expect(activeFamilies.has(state.nextCategories[0].family)).toBe(true);
    }
  });

  it("keeps upcoming preview matched to the next round", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "preview");
    const preview = state.nextCategories[0].id;
    state = resolveCurrentRound(autoAssignBestPlayerHand(state));
    const next = startNextRound(state);
    expect(next.currentCategories.map((c) => c.id)).toContain(preview);
  });

  it("resolves one-sided lethal damage as the matching winner", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "lethal");
    const categories = [
      STAT_CATEGORIES.find((c) => c.id === "highest-attack-range")!,
      STAT_CATEGORIES.find((c) => c.id === "highest-move-speed")!,
      STAT_CATEGORIES.find((c) => c.id === "lowest-armor-1")!,
    ];
    const playerRange = { ...card("Player Range", 1), stats: { ...card("Player Range", 1).stats, attackRange: 2000, moveSpeed: 400, armor: 5 } };
    const playerFast = { ...card("Player Fast", 1), stats: { ...card("Player Fast", 1).stats, attackRange: 500, moveSpeed: 500, armor: 5 } };
    const playerSoft = { ...card("Player Soft", 1), stats: { ...card("Player Soft", 1).stats, attackRange: 500, moveSpeed: 400, armor: 1 } };
    const botA = card("Bot A", 100);
    const botB = card("Bot B", 100);
    const botC = card("Bot C", 100);
    state = {
      ...state,
      currentCategories: categories,
      playerHand: [playerRange, playerFast, playerSoft],
      botHand: [botA, botB, botC],
      assignments: {
        "highest-attack-range": playerRange.id,
        "highest-move-speed": playerFast.id,
        "lowest-armor-1": playerSoft.id,
      } as typeof state.assignments,
      botHp: 1,
    };
    state = resolveCurrentRound(state);
    expect(state.phase).toBe("match-over");
    expect(state.outcome).toBe("player");
    expect(state.botHp).toBe(0);
  });

  it("clears the cached round result when entering a new selecting round", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "clear-result");
    state = resolveCurrentRound(autoAssignBestPlayerHand(state));
    expect(state.phase).toBe("resolved");
    expect(state.lastResolution?.round).toBe(1);

    const next = startNextRound(state);

    expect(next.phase).toBe("selecting");
    expect(next.round).toBe(2);
    expect(next.lastResolution).toBeNull();
    expect(next.playerDiscard).toHaveLength(3);
    expect(next.botDiscard).toHaveLength(3);
  });

  it("selects legal bot assignments with no duplicated cards", () => {
    const categories = generateCategoryBoard("bot", 1);
    const picked = selectBotAssignments(STAT_CHECK_FIXTURE_DECK.slice(0, 6), categories);
    expect(new Set(Object.values(picked).map((c) => c.id)).size).toBe(3);
  });

  it("breaks bot ties deterministically by hand order", () => {
    const hand = [card("A", 10), card("B", 10), card("C", 10), card("D", 10)];
    const categories = [cat("highest-hp-1", "higher"), cat("highest-hp-18", "higher"), cat("highest-ad-18", "higher")];
    const picked = selectBotAssignments(hand, categories);
    expect(Object.values(picked).map((c) => c.id)).toEqual(["A", "B", "C"]);
  });

  it("discards played cards and draws back to six", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "draw");
    const playedIds = new Set(Object.values(autoAssignBestPlayerHand(state).assignments));
    state = resolveCurrentRound(autoAssignBestPlayerHand(state));
    const next = startNextRound(state);
    expect(next.playerDiscard.map((c) => c.id).sort()).toEqual([...playedIds].sort());
    expect(next.playerHand).toHaveLength(6);
  });

  it("starts with unique six-card hands and no overlap between sides", () => {
    const state = createMatch(STAT_CHECK_FIXTURE_DECK, "unique-hands");
    expect(state.playerHand).toHaveLength(6);
    expect(state.botHand).toHaveLength(6);
    expect(new Set(state.playerHand.map((card) => card.id)).size).toBe(6);
    expect(new Set(state.botHand.map((card) => card.id)).size).toBe(6);
    expect(state.playerHand.some((card) => state.botHand.some((botCard) => botCard.id === card.id))).toBe(false);
  });

  it("preserves unplayed cards, permanently discards played cards, and draws replacements", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "preserve-three");
    state = autoAssignBestPlayerHand(state);
    const playedIds = new Set(Object.values(state.assignments));
    const preservedIds = state.playerHand.filter((card) => !playedIds.has(card.id)).map((card) => card.id);

    state = resolveCurrentRound(state);
    const next = startNextRound(state);

    expect(next.playerDiscard.map((card) => card.id).sort()).toEqual([...playedIds].sort());
    expect(next.playerHand.map((card) => card.id).slice(0, 3)).toEqual(preservedIds);
    expect(next.playerHand).toHaveLength(6);
    expect(next.playerHand.some((card) => playedIds.has(card.id))).toBe(false);
    expect(next.drawPile.some((card) => playedIds.has(card.id))).toBe(false);
  });

  it("resolves deck exhaustion by remaining HP", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "exhaust");
    state = autoAssignBestPlayerHand(state);
    state = resolveCurrentRound(state);
    state = {
      ...state,
      playerHp: 12,
      botHp: 10,
      drawPile: [],
      playerHand: state.playerHand.slice(0, 3),
      botHand: state.botHand.slice(0, 3),
    };
    const next = startNextRound(state);
    expect(next.phase).toBe("match-over");
    expect(next.outcome).toBe("player");
    expect(next.endReason).toMatch(/Deck exhausted/);
  });

  it("deals one shared shuffled champion pool without hand or pile overlap", () => {
    const state = createMatch(STAT_CHECK_FIXTURE_DECK, "shared-initial");
    const shuffledIds = ids(shuffleDeterministic(STAT_CHECK_FIXTURE_DECK, "shared-initial"));

    expect(ids(state.playerHand)).toEqual(shuffledIds.slice(0, 6));
    expect(ids(state.botHand)).toEqual(shuffledIds.slice(6, 12));
    expect(ids(state.drawPile)).toEqual(shuffledIds.slice(12));
    expect(state.playerHand).toHaveLength(6);
    expect(state.botHand).toHaveLength(6);
    expect(state.drawPile).toHaveLength(STAT_CHECK_FIXTURE_DECK.length - 12);
    expect(uniqueIds(state.playerHand).size).toBe(6);
    expect(uniqueIds(state.botHand).size).toBe(6);
    expect(state.playerHand.some((card) => uniqueIds(state.botHand).has(card.id))).toBe(false);
    expect(state.drawPile.some((card) => uniqueIds([...state.playerHand, ...state.botHand]).has(card.id))).toBe(false);
    expectValidSharedDeck(state);
  });

  it("draws player replacements first and bot replacements second from the same shared pile", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "shared-replacements");
    const initialDrawPileIds = ids(state.drawPile);
    state = autoAssignBestPlayerHand(state);
    const playerPlayedIds = new Set(Object.values(state.assignments));
    const playerPreservedIds = ids(state.playerHand.filter((card) => !playerPlayedIds.has(card.id)));

    state = resolveCurrentRound(state);
    const botPlayedIds = new Set(Object.values(state.lastResolution!.botAssignments).map((card) => card.id));
    const botPreservedIds = ids(state.botHand.filter((card) => !botPlayedIds.has(card.id)));
    const next = startNextRound(state);

    expect(ids(next.playerHand)).toEqual([...playerPreservedIds, ...initialDrawPileIds.slice(0, 3)]);
    expect(ids(next.botHand)).toEqual([...botPreservedIds, ...initialDrawPileIds.slice(3, 6)]);
    expect(ids(next.drawPile)).toEqual(initialDrawPileIds.slice(6));
    expect(next.playerDiscard).toHaveLength(3);
    expect(next.botDiscard).toHaveLength(3);
    expect(next.drawPile).toHaveLength(STAT_CHECK_FIXTURE_DECK.length - 18);
    expectValidSharedDeck(next);
  });

  it("keeps shared-pool uniqueness over several sequential rounds", () => {
    const deck = expandedDeck();
    let state = createMatch(deck, "several-rounds");
    const pileSizes = [state.drawPile.length];
    expect(validateMatchInvariants(state, deck)).toEqual([]);

    for (let round = 0; round < 3; round++) {
      const playerHandBefore = state.playerHand;
      state = autoAssignBestPlayerHand(state);
      const playerPlayedIds = new Set(Object.values(state.assignments));
      const preservedIds = ids(playerHandBefore.filter((card) => !playerPlayedIds.has(card.id)));
      state = resolveCurrentRound(state);
      state = startNextRound(state);
      expect(state.phase).toBe("selecting");
      expect(ids(state.playerHand).slice(0, preservedIds.length)).toEqual(preservedIds);
      expect(state.drawPile.length).toBeLessThan(pileSizes[pileSizes.length - 1]);
      pileSizes.push(state.drawPile.length);
      expect(validateMatchInvariants(state, deck)).toEqual([]);
    }
  });

  it("keeps identical seed and actions deterministic while different seeds change ordering", () => {
    const playOneRound = (seed: string) => {
      let state = createMatch(STAT_CHECK_FIXTURE_DECK, seed);
      state = resolveCurrentRound(autoAssignBestPlayerHand(state));
      return startNextRound(state);
    };
    const a = playOneRound("canonical-seed");
    const b = playOneRound("canonical-seed");
    const c = playOneRound("other-canonical-seed");

    expect(ids(a.playerHand)).toEqual(ids(b.playerHand));
    expect(ids(a.botHand)).toEqual(ids(b.botHand));
    expect(ids(a.drawPile)).toEqual(ids(b.drawPile));
    expect([...ids(a.playerHand), ...ids(a.botHand), ...ids(a.drawPile)]).not.toEqual([
      ...ids(c.playerHand),
      ...ids(c.botHand),
      ...ids(c.drawPile),
    ]);
  });

  it("does not duplicate champions when the shared pile is insufficient", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "insufficient-shared-pile");
    state = resolveCurrentRound(autoAssignBestPlayerHand(state));
    state = {
      ...state,
      drawPile: state.drawPile.slice(0, 1),
      playerHand: Object.values(state.lastResolution!.playerAssignments),
      botHand: Object.values(state.lastResolution!.botAssignments),
    };

    const next = startNextRound(state);

    expect(next.phase).toBe("match-over");
    expect(next.endReason).toMatch(/Deck exhausted/);
    expect(validateMatchInvariants(next)).toEqual([]);
  });

  it("allows assigning, moving, and removing cards before lock-in", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "assign");
    const [a, b] = state.currentCategories;
    const first = state.playerHand[0].id;
    state = assignCard(state, a.id, first);
    expect(state.assignments[a.id]).toBe(first);
    state = assignCard(state, b.id, first);
    expect(state.assignments[a.id]).toBeNull();
    expect(state.assignments[b.id]).toBe(first);
    state = assignCard(state, b.id, null);
    expect(state.assignments[b.id]).toBeNull();
  });
});

describe("clue-aware bot", () => {
  const sc = (name: string, stats: Partial<StatCheckCard["stats"]> = {}): StatCheckCard => ({
    id: name,
    name,
    stats: {
      hp: 600,
      hpPerLevel: 90,
      ad: 25,
      adPerLevel: 3,
      armor: 40,
      armorPerLevel: 4,
      magicResist: 30,
      moveSpeed: 335,
      attackRange: 150,
      attackSpeed: 0.65,
      attackSpeedPerLevel: 2,
      ...stats,
    },
  });
  const catById = (id: StatCategory["id"]) => STAT_CATEGORIES.find((c) => c.id === id)!;
  const board = [catById("highest-ad-1"), catById("lowest-armor-1"), catById("highest-move-speed")];
  const playedIds = (assignments: Record<string, StatCheckCard>) => Object.values(assignments).map((c) => c.id);

  const nearEqualHand = () => [
    sc("AdNearBest", { ad: 59 }),
    sc("AdBestHpGiant", { ad: 60, hp: 2000 }),
    sc("ArmorAce", { armor: 15 }),
    sc("SpeedAce", { moveSpeed: 400, ad: 24 }),
    sc("FillerOne", { ad: 20, armor: 60, moveSpeed: 300 }),
    sc("FillerTwo", { ad: 21, armor: 55, moveSpeed: 305 }),
  ];

  it("preserves a superior clue-family card when current choices are near-equal", () => {
    const assignments = selectBotAssignments(nearEqualHand(), board, "health");
    expect(assignments["highest-ad-1"].id).toBe("AdNearBest");
    expect(playedIds(assignments)).not.toContain("AdBestHpGiant");
    // The greedy path (no clue) spends the giant instead.
    expect(selectBotAssignments(nearEqualHand(), board)["highest-ad-1"].id).toBe("AdBestHpGiant");
  });

  it("spends the clue card when it materially improves the current board", () => {
    const hand = nearEqualHand().map((card) =>
      card.id === "AdNearBest" ? sc("AdNearBest", { ad: 30 }) : card,
    );
    const assignments = selectBotAssignments(hand, board, "health");
    expect(assignments["highest-ad-1"].id).toBe("AdBestHpGiant");
  });

  it("does not sacrifice for a weak clustered move-speed clue", () => {
    const hpBoard = [catById("highest-ad-1"), catById("lowest-armor-1"), catById("highest-hp-1")];
    const hand = [
      sc("Sprinter", { hp: 800, moveSpeed: 339 }),
      sc("HpAlt", { hp: 780, moveSpeed: 335 }),
      sc("AdAce", { ad: 60, moveSpeed: 336 }),
      sc("ArmorAce", { armor: 15, moveSpeed: 337 }),
      sc("FillerOne", { moveSpeed: 335 }),
      sc("FillerTwo", { moveSpeed: 338 }),
    ];
    const analysis = analyzeBotAssignments(hand, hpBoard, "move-speed");
    expect(analysis.clueInformativeness).toBeLessThan(0.1);
    expect(analysis.assignments["highest-hp-1"].id).toBe("Sprinter");
    expect(analysis.preservedBestClueCard).toBe(false);
  });

  it("evaluates the broad family across level variants without knowing the exact category", () => {
    const hand = [
      sc("AdNearBest", { ad: 59 }),
      sc("LateBloomer", { ad: 60, hp: 595, hpPerLevel: 220 }),
      sc("ArmorAce", { armor: 15 }),
      sc("SpeedAce", { moveSpeed: 400, ad: 24 }),
      sc("FillerOne", { ad: 20, armor: 60, moveSpeed: 300 }),
      sc("FillerTwo", { ad: 21, armor: 55, moveSpeed: 305 }),
    ];
    // LateBloomer has the worst level-1 health but the best level-18 health;
    // a health clue must still treat it as the family's strongest card.
    const assignments = selectBotAssignments(hand, board, "health");
    expect(playedIds(assignments)).not.toContain("LateBloomer");
    expect(assignments["highest-ad-1"].id).toBe("AdNearBest");
  });

  it("matches greedy behavior when the clue offers no useful distinction", () => {
    const hand = [
      sc("AdAce", { ad: 70 }),
      sc("ArmorAce", { armor: 10 }),
      sc("SpeedAce", { moveSpeed: 400 }),
      sc("FillerOne", { ad: 20, armor: 60, moveSpeed: 300 }),
      sc("FillerTwo", { ad: 21, armor: 55, moveSpeed: 305 }),
      sc("FillerThree", { ad: 22, armor: 50, moveSpeed: 310 }),
    ];
    // All attack ranges are identical, so the clue carries zero information.
    const withClue = selectBotAssignments(hand, board, "attack-range");
    const greedy = selectBotAssignments(hand, board);
    expect(playedIds(withClue)).toEqual(playedIds(greedy));
    const analysis = analyzeBotAssignments(hand, board, "attack-range");
    expect(analysis.clueInformativeness).toBe(0);
    expect(analysis.currentScore).toBeCloseTo(analysis.bestCurrentScore);
  });

  it("breaks exact score ties deterministically by hand order", () => {
    const twin = { ad: 60 };
    const hand = [
      sc("TwinA", twin),
      sc("TwinB", twin),
      sc("ArmorAce", { armor: 15 }),
      sc("SpeedAce", { moveSpeed: 400, ad: 24 }),
      sc("FillerOne", { ad: 20, armor: 60, moveSpeed: 300 }),
      sc("FillerTwo", { ad: 21, armor: 55, moveSpeed: 305 }),
    ];
    const first = selectBotAssignments(hand, board, "health");
    const second = selectBotAssignments(hand, board, "health");
    expect(playedIds(first)).toEqual(playedIds(second));
    expect(first["highest-ad-1"].id).toBe("TwinA");
  });

  it("always submits three distinct legal cards from its hand", () => {
    for (const family of ["health", "attack-damage", "armor", "move-speed", "attack-range"] as const) {
      const assignments = selectBotAssignments(nearEqualHand(), board, family);
      const ids = playedIds(assignments);
      expect(new Set(ids).size).toBe(3);
      const handIds = new Set(nearEqualHand().map((c) => c.id));
      for (const id of ids) expect(handIds.has(id)).toBe(true);
    }
  });

  it("ignores hidden future information beyond the public family clue", () => {
    const base = autoAssignBestPlayerHand(createMatch(STAT_CHECK_FIXTURE_DECK, "hidden-info"));
    const hp1 = catById("highest-hp-1");
    const hp18 = catById("highest-hp-18");
    const variantA = {
      ...base,
      nextCategories: [hp1, catById("highest-ad-18"), catById("lowest-armor-1")],
    };
    const variantB = {
      ...base,
      nextCategories: [hp18, catById("highest-attack-range"), catById("highest-move-speed")],
      drawPile: base.drawPile.slice().reverse(),
    };
    const resolvedA = resolveCurrentRound(variantA);
    const resolvedB = resolveCurrentRound(variantB);
    const ids = (state: typeof resolvedA) =>
      state.currentCategories.map((category) => state.lastResolution!.botAssignments[category.id].id);
    // Same public family ("health") and same hand: identical bot submission
    // despite different exact future categories and a different draw order.
    expect(ids(resolvedA)).toEqual(ids(resolvedB));
  });
});

describe("category board adjacency", () => {
  it("never repeats an exact category in the immediately following round", () => {
    for (let seedIndex = 0; seedIndex < 200; seedIndex++) {
      let previous: ReturnType<typeof generateCategoryBoard> | undefined;
      for (let round = 1; round <= 10; round++) {
        const board = generateCategoryBoard(`adjacent:${seedIndex}`, round, previous);
        expect(new Set(board.map((c) => c.id)).size).toBe(3);
        expect(new Set(board.map((c) => c.family)).size).toBe(3);
        if (previous) {
          for (const category of board) {
            expect(previous.some((prev) => prev.id === category.id)).toBe(false);
          }
        }
        previous = board;
      }
    }
  });

  it("keeps related direction/level variants legal in the following round", () => {
    // The exclusion is exact-identity scoped: across a deterministic sweep,
    // adjacent rounds must sometimes reuse a stat family through a different
    // direction or level variant.
    let relatedAdjacent = 0;
    for (let seedIndex = 0; seedIndex < 100; seedIndex++) {
      let previous: ReturnType<typeof generateCategoryBoard> | undefined;
      for (let round = 1; round <= 8; round++) {
        const board = generateCategoryBoard(`related:${seedIndex}`, round, previous);
        if (previous) {
          for (const category of board) {
            if (previous.some((prev) => prev.family === category.family && prev.id !== category.id)) {
              relatedAdjacent += 1;
            }
          }
        }
        previous = board;
      }
    }
    expect(relatedAdjacent).toBeGreaterThan(0);
  });

  it("reaches all 16 active exact categories over deterministic seed coverage", () => {
    const seen = new Set<string>();
    for (let seedIndex = 0; seedIndex < 100; seedIndex++) {
      let previous: ReturnType<typeof generateCategoryBoard> | undefined;
      for (let round = 1; round <= 8; round++) {
        const board = generateCategoryBoard(`cover:${seedIndex}`, round, previous);
        for (const category of board) seen.add(category.id);
        previous = board;
      }
    }
    expect(seen).toEqual(new Set(ACTIVE_STAT_CATEGORIES.map((c) => c.id)));
  });

  it("enforces adjacency and board structure through live match transitions", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "live-adjacency");
    for (let i = 0; i < 4 && state.phase === "selecting"; i++) {
      const currentIds = state.currentCategories.map((c) => c.id);
      state = resolveCurrentRound(autoAssignBestPlayerHand(state));
      if (state.phase !== "resolved") break;
      state = startNextRound(state);
      if (state.phase !== "selecting") break;
      for (const category of state.currentCategories) {
        expect(currentIds).not.toContain(category.id);
      }
      expect(validateMatchInvariants(state, STAT_CHECK_FIXTURE_DECK)).toEqual([]);
    }
  });
});

describe("items", () => {
  const catById = (id: string) => STAT_CATEGORIES.find((c) => c.id === id)!;
  const withItems = (seed: string) => createMatch(STAT_CHECK_FIXTURE_DECK, seed, { items: true });
  const bigDeck = () => [
    ...STAT_CHECK_FIXTURE_DECK,
    ...Array.from({ length: 72 }, (_, index) => card(`X${index + 1}`, 50 + index)),
  ];

  /** Items-enabled selecting state with a controlled board and custom hands. */
  const controlled = (
    playerItem: ItemId,
    categoryIds: string[],
    playerCards: StatCheckCard[],
    botCards: StatCheckCard[],
  ) => {
    let state = chooseItem(withItems("items-controlled"), playerItem);
    const categories = categoryIds.map(catById);
    state = {
      ...state,
      currentCategories: categories,
      playerHand: playerCards,
      botHand: botCards,
      assignments: emptyAssignments(categories),
      // Bot inventory is zeroed so controlled contests are player-item-only;
      // ledger invariants are intentionally not asserted on these states.
      botInventory: emptyItemInventory(),
    };
    return state;
  };

  it("defines the four items with the exact specified bonuses", () => {
    expect(ITEM_IDS).toEqual(["long-sword", "cloth-armor", "ruby-crystal", "mogzy-snack"]);
    expect(ITEMS["long-sword"].bonuses).toEqual({ "attack-damage": 10 });
    expect(ITEMS["cloth-armor"].bonuses).toEqual({ armor: 15 });
    expect(ITEMS["ruby-crystal"].bonuses).toEqual({ health: 150 });
    expect(ITEMS["mogzy-snack"].bonuses).toEqual({ health: 75, "attack-damage": 5, armor: 8 });
    expect(itemBonusFor("mogzy-snack", "health")).toBe(75);
    expect(itemBonusFor("mogzy-snack", "attack-damage")).toBe(5);
    expect(itemBonusFor("mogzy-snack", "armor")).toBe(8);
    // Not yet legal in move speed or attack range.
    expect(itemBonusFor("mogzy-snack", "move-speed")).toBe(0);
    expect(itemBonusFor("mogzy-snack", "attack-range")).toBe(0);
    expect(isItemCompatible("mogzy-snack", "move-speed")).toBe(false);
    expect(isItemCompatible("mogzy-snack", "attack-range")).toBe(false);
    for (const itemId of ["long-sword", "cloth-armor", "ruby-crystal"] as const) {
      expect(isItemCompatible(itemId, "move-speed")).toBe(false);
      expect(isItemCompatible(itemId, "attack-range")).toBe(false);
    }
  });

  it("owes item choices exactly at completed-round counts 0, 3, 6, 9, 12, ...", () => {
    for (const n of [0, 3, 6, 9, 12, 15]) expect(isItemChoicePoint(n)).toBe(true);
    for (const n of [1, 2, 4, 5, 7, 8, 10, 11]) expect(isItemChoicePoint(n)).toBe(false);
    expect([0, 1, 2, 3, 5, 6, 8, 9, 12].map(expectedItemChoices)).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 5]);
  });

  it("opens with a pre-Round-1 item choice that gates selection and locking", () => {
    const state = withItems("pre-round");
    expect(state.phase).toBe("item-choice");
    expect(state.round).toBe(1);
    expect(itemChoiceDue(state)).toBe(true);
    // Round 1 categories exist internally for determinism but play is inert.
    expect(state.currentCategories).toHaveLength(3);
    expect(assignCard(state, state.currentCategories[0].id, state.playerHand[0].id)).toBe(state);
    expect(resolveCurrentRound(state)).toBe(state);
    const chosen = chooseItem(state, "cloth-armor");
    expect(chosen.phase).toBe("selecting");
    expect(chosen.playerInventory["cloth-armor"]).toBe(1);
    expect(itemChoiceDue(chosen)).toBe(false);
  });

  it("accepts any of the four acquisition choices and mirrors a hidden bot pick", () => {
    for (const itemId of ITEM_IDS) {
      const state = chooseItem(withItems(`acquire:${itemId}`), itemId);
      expect(state.playerInventory[itemId]).toBe(1);
      expect(totalInventoryCount(state.playerInventory)).toBe(1);
      expect(totalInventoryCount(state.botInventory)).toBe(1);
      expect(state.botInventory[selectBotItemAcquisition(0)]).toBe(1);
      expect(state.itemChoicesCompleted).toBe(1);
    }
  });

  it("makes repeated chooseItem calls idempotent (no duplicate acquisition)", () => {
    const once = chooseItem(withItems("idem"), "long-sword");
    const twice = chooseItem(once, "long-sword");
    expect(twice).toBe(once);
    expect(once.playerInventory["long-sword"]).toBe(1);
  });

  it("follows the full cadence over 12 completed rounds with duplicates, persistence, and blocked transitions", () => {
    let state = createMatch(bigDeck(), "cadence", { items: true });
    state = { ...state, playerHp: 999, botHp: 999 };
    expect(state.phase).toBe("item-choice");
    state = chooseItem(state, "ruby-crystal");
    let completed = 0;
    let choices = 1;
    while (state.phase === "selecting" && completed < 12) {
      state = resolveCurrentRound(autoAssignBestPlayerHand(state));
      expect(state.phase).toBe("resolved");
      completed += 1;
      expect(state.roundHistory).toHaveLength(completed);
      if (completed % 3 === 0) {
        expect(itemChoiceDue(state)).toBe(true);
        // The next round may not begin before the item choice completes.
        expect(startNextRound(state)).toBe(state);
        state = beginItemChoice(state);
        expect(state.phase).toBe("item-choice");
        // Resolved-round evidence remains available during the choice.
        expect(state.lastResolution?.round).toBe(completed);
        state = chooseItem(state, "ruby-crystal");
        choices += 1;
        expect(state.phase).toBe("resolved");
      } else {
        expect(itemChoiceDue(state)).toBe(false);
        expect(beginItemChoice(state)).toBe(state);
      }
      expect(validateMatchInvariants(state, bigDeck())).toEqual([]);
      state = startNextRound(state);
    }
    expect(completed).toBe(12);
    expect(choices).toBe(5); // before R1 and after rounds 3, 6, 9, 12
    expect(state.itemChoicesCompleted).toBe(5);
    // The player never equipped anything: duplicate copies persist untouched.
    expect(state.playerInventory["ruby-crystal"]).toBe(5);
    expect(totalInventoryCount(state.playerInventory)).toBe(5);
  });

  it("deterministic bot acquisition follows the explainable rotation", () => {
    expect(BOT_ITEM_STRATEGY.acquisitionCycle).toEqual(["mogzy-snack", "ruby-crystal", "long-sword", "cloth-armor"]);
    expect([0, 1, 2, 3, 4, 5].map(selectBotItemAcquisition)).toEqual([
      "mogzy-snack",
      "ruby-crystal",
      "long-sword",
      "cloth-armor",
      "mogzy-snack",
      "ruby-crystal",
    ]);
  });

  it("validates equips: empty lane, unowned item, family mismatch, and no-item families", () => {
    const player = [card("A", 100), card("B", 90), card("C", 80), card("D", 70), card("E", 60), card("F", 50)];
    const bot = [card("Y", 40), card("Z", 30), card("W", 20)];
    let state = controlled("ruby-crystal", ["highest-hp-1", "lowest-ad-1", "highest-move-speed"], player, bot);

    // Empty lane: nothing placed yet.
    expect(equipItem(state, "highest-hp-1", "ruby-crystal")).toBe(state);
    state = assignCard(state, "highest-hp-1", "A");
    state = assignCard(state, "lowest-ad-1", "B");
    state = assignCard(state, "highest-move-speed", "C");

    // Unowned item.
    expect(equipItem(state, "highest-hp-1", "long-sword")).toBe(state);
    // Stat-family mismatch: Ruby Crystal cannot touch an Attack Damage lane.
    expect(equipItem(state, "lowest-ad-1", "ruby-crystal")).toBe(state);
    // Move speed has no compatible item at all yet.
    expect(equipItem(state, "highest-move-speed", "ruby-crystal")).toBe(state);

    const equipped = equipItem(state, "highest-hp-1", "ruby-crystal");
    expect(equipped.equippedItem).toEqual({ categoryId: "highest-hp-1", itemId: "ruby-crystal" });
    // Equipping is pending only: nothing is consumed before resolution.
    expect(equipped.playerInventory["ruby-crystal"]).toBe(1);
  });

  it("rejects Mogzy Snack on move-speed and attack-range lanes but accepts the stat trio", () => {
    const player = [card("A", 100), card("B", 90), card("C", 80), card("D", 70), card("E", 60), card("F", 50)];
    const bot = [card("Y", 40), card("Z", 30), card("W", 20)];
    let state = controlled("mogzy-snack", ["highest-move-speed", "highest-attack-range", "lowest-armor-1"], player, bot);
    state = assignCard(state, "highest-move-speed", "A");
    state = assignCard(state, "highest-attack-range", "B");
    state = assignCard(state, "lowest-armor-1", "C");
    expect(equipItem(state, "highest-move-speed", "mogzy-snack")).toBe(state);
    expect(equipItem(state, "highest-attack-range", "mogzy-snack")).toBe(state);
    const armored = equipItem(state, "lowest-armor-1", "mogzy-snack");
    expect(armored.equippedItem).toEqual({ categoryId: "lowest-armor-1", itemId: "mogzy-snack" });
  });

  it("keeps exactly one pending equip, supports changing and removing it, and clears with the card", () => {
    const player = [card("A", 100), card("B", 90), card("C", 80), card("D", 70), card("E", 60), card("F", 50)];
    const bot = [card("Y", 40), card("Z", 30), card("W", 20)];
    let state = controlled("ruby-crystal", ["highest-hp-1", "lowest-hp-18", "highest-move-speed"], player, bot);
    state = assignCard(state, "highest-hp-1", "A");
    state = assignCard(state, "lowest-hp-18", "B");
    state = assignCard(state, "highest-move-speed", "C");

    state = equipItem(state, "highest-hp-1", "ruby-crystal");
    // Re-equipping moves the single pending assignment; it never duplicates.
    state = equipItem(state, "lowest-hp-18", "ruby-crystal");
    expect(state.equippedItem).toEqual({ categoryId: "lowest-hp-18", itemId: "ruby-crystal" });

    // Removing the champion releases the pending item without consuming it.
    const removed = assignCard(state, "lowest-hp-18", null);
    expect(removed.equippedItem).toBeNull();
    expect(removed.playerInventory["ruby-crystal"]).toBe(1);

    // Explicit unequip also releases without consuming.
    const unequipped = unequipItem(state);
    expect(unequipped.equippedItem).toBeNull();
    expect(unequipped.playerInventory["ruby-crystal"]).toBe(1);
  });

  it("applies natural, bonus, and final values; winner, margin, and decisive use finals; consumption is atomic", () => {
    const player = [card("P1", 600), card("P2", 90), card("P3", 80), card("P4", 70), card("P5", 60), card("P6", 50)];
    const bot = [card("B1", 700), card("B2", 10), card("B3", 9)];
    let state = controlled("ruby-crystal", ["highest-hp-1", "highest-move-speed", "highest-attack-range"], player, bot);
    state = assignCard(state, "highest-hp-1", "P1");
    state = assignCard(state, "highest-move-speed", "P2");
    state = assignCard(state, "highest-attack-range", "P3");
    state = equipItem(state, "highest-hp-1", "ruby-crystal");
    expect(state.playerInventory["ruby-crystal"]).toBe(1);

    const resolved = resolveCurrentRound(state);
    const lane = resolved.lastResolution!.results.find((r) => r.category.id === "highest-hp-1")!;
    expect(lane.playerNaturalValue).toBe(600);
    expect(lane.playerItem).toBe("ruby-crystal");
    expect(lane.playerBonus).toBe(150);
    expect(lane.playerValue).toBe(750);
    expect(lane.botNaturalValue).toBe(700);
    expect(lane.botItem).toBeNull();
    expect(lane.botBonus).toBe(0);
    expect(lane.botValue).toBe(700);
    // Natural 600 loses to 700; the final 750 wins: winner uses final values.
    expect(lane.winner).toBe("player");
    expect(lane.margin).toBeCloseTo((750 - 700) / 750);
    expect(lane.decisive).toBe(lane.margin >= lane.category.decisiveThreshold);

    // Atomic single consumption at resolution.
    expect(resolved.playerInventory["ruby-crystal"]).toBe(0);
    expect(resolved.equippedItem).toBeNull();
    const otherLanes = resolved.lastResolution!.results.filter((r) => r.category.id !== "highest-hp-1");
    for (const other of otherLanes) {
      expect(other.playerItem).toBeNull();
      expect(other.playerBonus).toBe(0);
    }
    // Repeated resolve calls are no-ops: no double consumption.
    expect(resolveCurrentRound(resolved)).toBe(resolved);
  });

  it("never consumes an item that was unequipped before lock-in", () => {
    const player = [card("P1", 600), card("P2", 90), card("P3", 80), card("P4", 70), card("P5", 60), card("P6", 50)];
    const bot = [card("B1", 700), card("B2", 10), card("B3", 9)];
    let state = controlled("ruby-crystal", ["highest-hp-1", "highest-move-speed", "highest-attack-range"], player, bot);
    state = assignCard(state, "highest-hp-1", "P1");
    state = assignCard(state, "highest-move-speed", "P2");
    state = assignCard(state, "highest-attack-range", "P3");
    state = unequipItem(equipItem(state, "highest-hp-1", "ruby-crystal"));

    const resolved = resolveCurrentRound(state);
    expect(resolved.playerInventory["ruby-crystal"]).toBe(1);
    for (const result of resolved.lastResolution!.results) {
      expect(result.playerItem).toBeNull();
      expect(result.playerBonus).toBe(0);
      expect(result.playerValue).toBe(result.playerNaturalValue);
    }
  });

  it("keeps a positive bonus legal in Lowest categories, where it can worsen the contest", () => {
    const category = catById("lowest-hp-1");
    const withBonus = compareCategory(category, card("P", 500), card("B", 550), "ruby-crystal", null);
    expect(withBonus.playerBonus).toBe(150);
    expect(withBonus.playerValue).toBe(650);
    // Natural 500 would have won the Lowest contest; the boosted 650 loses.
    expect(withBonus.winner).toBe("bot");
    const natural = compareCategory(category, card("P", 500), card("B", 550));
    expect(natural.winner).toBe("player");
  });

  it("feeds final values into decisive thresholds and damage", () => {
    const hp = catById("highest-hp-1"); // 5% decisive threshold
    const narrow = compareCategory(hp, card("P", 700), card("B", 680));
    expect(narrow.decisive).toBe(false);
    const boosted = compareCategory(hp, card("P", 700), card("B", 680), "ruby-crystal");
    expect(boosted.playerValue).toBe(850);
    expect(boosted.margin).toBeCloseTo((850 - 680) / 850);
    expect(boosted.decisive).toBe(true);
    const damage = calculateRoundDamage([boosted, result("bot"), result("bot")]);
    // Player lost the board 1-2 but the boosted decisive lane still deals +1.
    expect(damage.player).toBe(1);
    expect(damage.playerDecisiveDamage).toBe(1);
  });

  it("bot item use is deterministic, avoids Lowest lanes, prefers the strongest legal gain, and can hold", () => {
    const inventoryAll = {
      "long-sword": 1,
      "cloth-armor": 1,
      "ruby-crystal": 1,
      "mogzy-snack": 1,
    };
    const assignments = {
      "lowest-hp-1": card("LowHp", 100),
      "highest-ad-1": card("Ad", 100),
      "highest-move-speed": card("Fast", 400),
    } as Record<StatCategory["id"], StatCheckCard>;
    const categories = [catById("lowest-hp-1"), catById("highest-ad-1"), catById("highest-move-speed")];

    const first = selectBotItemPlay(assignments, categories, inventoryAll);
    const second = selectBotItemPlay(assignments, categories, inventoryAll);
    expect(first).toEqual(second);
    // Long Sword (+10 on 100 AD = 10% = 1.0x the 10% threshold) beats the
    // snack (+5 = 0.5x); the harmful lowest-HP boost is never considered and
    // move speed has no compatible item.
    expect(first).toEqual({ categoryId: "highest-ad-1", itemId: "long-sword" });

    // All-lowest board: the bot holds everything rather than hurting itself.
    const lowBoard = [catById("lowest-hp-1"), catById("lowest-ad-1"), catById("lowest-armor-1")];
    const lowAssignments = {
      "lowest-hp-1": card("A", 100),
      "lowest-ad-1": card("B", 100),
      "lowest-armor-1": card("C", 100),
    } as Record<StatCategory["id"], StatCheckCard>;
    expect(selectBotItemPlay(lowAssignments, lowBoard, inventoryAll)).toBeNull();

    // Gains below the spend floor are held, not wasted.
    const hugeAssignments = {
      "highest-hp-1": card("Huge", 40000),
      "highest-move-speed": card("Fast", 400),
      "highest-attack-range": card("Far", 600),
    } as Record<StatCategory["id"], StatCheckCard>;
    const hugeBoard = [catById("highest-hp-1"), catById("highest-move-speed"), catById("highest-attack-range")];
    expect(selectBotItemPlay(hugeAssignments, hugeBoard, { ...inventoryAll, "long-sword": 0 })).toBeNull();
  });

  it("bot consumes its own hidden play atomically during resolution", () => {
    const player = [card("P1", 600), card("P2", 90), card("P3", 80), card("P4", 70), card("P5", 60), card("P6", 50)];
    const bot = [card("B1", 700), card("B2", 10), card("B3", 9)];
    let state = controlled("ruby-crystal", ["highest-hp-1", "highest-move-speed", "highest-attack-range"], player, bot);
    // Hand the bot one snack; its policy will spend it on the 700-HP lane
    // (75/700 ~ 10.7% against a 5% threshold ~ 2.1x, well over the floor).
    state = { ...state, botInventory: { ...emptyItemInventory(), "mogzy-snack": 1 } };
    state = assignCard(state, "highest-hp-1", "P1");
    state = assignCard(state, "highest-move-speed", "P2");
    state = assignCard(state, "highest-attack-range", "P3");

    const resolved = resolveCurrentRound(state);
    const lane = resolved.lastResolution!.results.find((r) => r.category.id === "highest-hp-1")!;
    expect(lane.botItem).toBe("mogzy-snack");
    expect(lane.botBonus).toBe(75);
    expect(lane.botValue).toBe(775);
    expect(resolved.botInventory["mogzy-snack"]).toBe(0);
    expect(resolveCurrentRound(resolved)).toBe(resolved);
  });

  it("keeps zero-item behavior identical to the pre-item engine", () => {
    const legacy = createMatch(STAT_CHECK_FIXTURE_DECK, "legacy");
    expect(legacy.itemsEnabled).toBe(false);
    expect(legacy.phase).toBe("selecting");
    expect(itemChoiceDue(legacy)).toBe(false);
    expect(chooseItem(legacy, "ruby-crystal")).toBe(legacy);
    const placedId = legacy.playerHand[0].id;
    const placed = assignCard(legacy, legacy.currentCategories[0].id, placedId);
    expect(equipItem(placed, legacy.currentCategories[0].id, "ruby-crystal")).toBe(placed);

    const resolved = resolveCurrentRound(autoAssignBestPlayerHand(legacy));
    for (const result of resolved.lastResolution!.results) {
      expect(result.playerItem).toBeNull();
      expect(result.botItem).toBeNull();
      expect(result.playerBonus).toBe(0);
      expect(result.botBonus).toBe(0);
      expect(result.playerValue).toBe(result.playerNaturalValue);
      expect(result.botValue).toBe(result.botNaturalValue);
    }
    expect(startNextRound(resolved).phase).toBe("selecting");
  });

  it("flags corrupted item ledgers and illegal equips through invariant validation", () => {
    const base = chooseItem(withItems("ledger"), "ruby-crystal");
    expect(validateMatchInvariants(base, STAT_CHECK_FIXTURE_DECK)).toEqual([]);

    const inflated = { ...base, playerInventory: { ...base.playerInventory, "ruby-crystal": 5 } };
    expect(validateMatchInvariants(inflated, STAT_CHECK_FIXTURE_DECK).map((i) => i.code)).toContain("item-ledger-mismatch");

    const ghostEquip = { ...base, equippedItem: { categoryId: base.currentCategories[0].id, itemId: "long-sword" as ItemId } };
    const codes = validateMatchInvariants(ghostEquip, STAT_CHECK_FIXTURE_DECK).map((i) => i.code);
    expect(codes).toContain("equip-not-owned");
    expect(codes).toContain("equip-empty-lane");
  });
});
