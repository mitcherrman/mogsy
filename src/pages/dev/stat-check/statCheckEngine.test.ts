import { describe, expect, it } from "vitest";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";
import {
  ACTIVE_STAT_CATEGORIES,
  STAT_CATEGORIES,
  STAT_CHECK_RULES,
  assignCard,
  autoAssignBestPlayerHand,
  calculateRoundDamage,
  compareCategory,
  createMatch,
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
    magicResist: value,
    moveSpeed: value,
    attackRange: value,
    attackSpeed: value,
    attackSpeedPerLevel: 1,
  },
});

const cat = (id: string, direction: "higher" | "lower", threshold = 0.12): StatCategory => ({
  id: id as StatCategory["id"],
  label: id,
  shortLabel: id,
  family: "health",
  active: true,
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

  it("gives every active category an explicit calibrated threshold", () => {
    const expected: Record<string, number> = {
      "highest-hp-1": 0.05,
      "highest-hp-18": 0.075,
      "highest-ad-1": 0.1,
      "highest-ad-18": 0.15,
      "lowest-armor-1": 0.25,
      "highest-move-speed": 0.05,
      "highest-attack-range": 0.2,
    };
    expect(Object.fromEntries(ACTIVE_STAT_CATEGORIES.map((c) => [c.id, c.decisiveThreshold]))).toEqual(expected);
    for (const category of ACTIVE_STAT_CATEGORIES) {
      expect(category.decisiveThreshold).toBeGreaterThan(0);
      expect(category.decisiveThreshold).toBeLessThanOrEqual(0.5);
    }
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
