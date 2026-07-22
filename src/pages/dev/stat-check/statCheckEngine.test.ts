import { describe, expect, it } from "vitest";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";
import {
  STAT_CATEGORIES,
  assignCard,
  autoAssignBestPlayerHand,
  calculateRoundDamage,
  compareCategory,
  createMatch,
  generateCategoryBoard,
  relativeMargin,
  resolveCurrentRound,
  selectBotAssignments,
  shuffleDeterministic,
  startNextRound,
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

  it("uses adaptive decisive thresholds from category definitions", () => {
    expect(STAT_CATEGORIES.find((c) => c.id === "highest-move-speed")?.decisiveThreshold).toBe(0.05);
    expect(STAT_CATEGORIES.find((c) => c.id === "highest-attack-range")?.decisiveThreshold).toBe(0.2);
  });

  it("calculates 2-1 board damage", () => {
    const damage = calculateRoundDamage([result("player"), result("player"), result("bot")]);
    expect(damage.boardWinner).toBe("player");
    expect(damage.player).toBe(2);
    expect(damage.bot).toBe(0);
  });

  it("adds sweep damage for 3-0 boards", () => {
    const damage = calculateRoundDamage([result("player"), result("player"), result("player")]);
    expect(damage.player).toBe(3);
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

  it("keeps upcoming preview matched to the next round", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "preview");
    const preview = state.nextCategories[0].id;
    state = resolveCurrentRound(autoAssignBestPlayerHand(state));
    const next = startNextRound(state);
    expect(next.currentCategories.map((c) => c.id)).toContain(preview);
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

  it("resolves deck exhaustion by remaining HP", () => {
    let state = createMatch(STAT_CHECK_FIXTURE_DECK, "exhaust");
    state = autoAssignBestPlayerHand(state);
    state = resolveCurrentRound(state);
    state = {
      ...state,
      playerHp: 12,
      botHp: 10,
      playerDeck: [],
      botDeck: [],
      playerHand: state.playerHand.slice(0, 3),
      botHand: state.botHand.slice(0, 3),
    };
    const next = startNextRound(state);
    expect(next.phase).toBe("match-over");
    expect(next.outcome).toBe("player");
    expect(next.endReason).toMatch(/Deck exhausted/);
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
