import {
  ITEM_IDS,
  type ItemId,
  type ItemInventory,
} from "../items";
import {
  autoAssignBestPlayerHand,
  beginItemChoice,
  chooseItem,
  createMatch,
  equipItem,
  resolveCurrentRound,
  selectBotItemPlay,
  shuffleDeterministic,
  startNextRound,
  validateMatchInvariants,
  type MatchState,
  type StatCategoryId,
  type StatCheckCard,
} from "../statCheckEngine";

/**
 * Deterministic golden-transcript exporter — the cross-language parity
 * contract for the authoritative Python engine mirror.
 *
 * A transcript records one complete deterministic match as a neutral
 * two-seat protocol: seat "p1" is the local player, seat "p2" is the local
 * bot. The Python engine must replay the SAME seed/deck through its own
 * shuffle, board generation, draw, item, and resolution code, apply the
 * recorded seat ACTIONS (assignments, item picks, equips), and reproduce
 * every recorded value exactly — including IEEE-754 float margins.
 *
 * Bot decision policies are deliberately NOT part of the contract: the
 * transcript stores the actions the policies chose, so the server-side
 * engine never needs the bot. Any rules change that alters these fixtures
 * must regenerate them AND update the Python mirror in the same change.
 */

export const TRANSCRIPT_FORMAT_VERSION = "stat-check-transcript.v1";

export type TranscriptCard = {
  id: string;
  name: string;
  stats: StatCheckCard["stats"];
};

export type TranscriptSeatRoundActions = {
  /** categoryId -> cardId, exactly the three active lanes. */
  assignments: Record<string, string>;
  /** Consumed item this round, if any. */
  item: { categoryId: string; itemId: ItemId } | null;
};

export type TranscriptLaneResult = {
  categoryId: string;
  p1CardId: string;
  p2CardId: string;
  p1Natural: number;
  p2Natural: number;
  p1Item: ItemId | null;
  p2Item: ItemId | null;
  p1Bonus: number;
  p2Bonus: number;
  p1Final: number;
  p2Final: number;
  winner: "p1" | "p2" | "tie";
  margin: number;
  decisive: boolean;
};

export type TranscriptRound = {
  round: number;
  /** Exact board ids in lane order. */
  boardCategoryIds: string[];
  /** Public one-family hint for the FOLLOWING round (nextCategories[0].family). */
  hintFamily: string | null;
  /** Hands at selection time, in hand order. */
  p1HandIds: string[];
  p2HandIds: string[];
  drawPileCount: number;
  p1: TranscriptSeatRoundActions;
  p2: TranscriptSeatRoundActions;
  results: TranscriptLaneResult[];
  damage: {
    p1Dealt: number;
    p2Dealt: number;
    boardWinner: "p1" | "p2" | "tie";
    p1CategoryWins: number;
    p2CategoryWins: number;
    p1DecisiveDamage: number;
    p2DecisiveDamage: number;
  };
  p1HpAfter: number;
  p2HpAfter: number;
};

export type TranscriptItemChoice = {
  /** 0 = pre-Round-1; then after completed rounds 3, 6, 9, ... */
  choiceIndex: number;
  completedRounds: number;
  p1Pick: ItemId;
  p2Pick: ItemId;
};

export type MatchTranscript = {
  formatVersion: typeof TRANSCRIPT_FORMAT_VERSION;
  seed: string;
  itemsEnabled: boolean;
  deck: TranscriptCard[];
  /** Full deterministic shuffle of the unique deck (server-only data; fixtures are trusted). */
  initialShuffleIds: string[];
  itemChoices: TranscriptItemChoice[];
  rounds: TranscriptRound[];
  final: {
    outcome: "p1" | "p2" | "draw";
    endReason: string | null;
    roundsPlayed: number;
    p1Hp: number;
    p2Hp: number;
    drawPileCount: number;
    p1Inventory: ItemInventory;
    p2Inventory: ItemInventory;
    invariantIssues: string[];
  };
};

const seatOutcome = (outcome: MatchState["outcome"]): "p1" | "p2" | "draw" => {
  if (outcome === "player") return "p1";
  if (outcome === "bot") return "p2";
  return "draw";
};

const seatWinner = (winner: "player" | "bot" | "tie"): "p1" | "p2" | "tie" =>
  winner === "player" ? "p1" : winner === "bot" ? "p2" : "tie";

/** Deterministic simulated-p1 acquisition pick (offset from the bot's cycle). */
export function transcriptPlayerItemPick(choiceIndex: number): ItemId {
  return ITEM_IDS[(choiceIndex + 1) % ITEM_IDS.length];
}

/**
 * Build one deterministic transcript by driving the local engine end to end.
 * The driver mirrors diagnostics/simulation.ts: greedy assignment for p1,
 * the engine bot for p2, and (when items are enabled) the shared item-play
 * policy applied to p1's own board.
 */
export function buildMatchTranscript(
  deck: StatCheckCard[],
  seed: string,
  options: { items?: boolean; maxRounds?: number } = {},
): MatchTranscript {
  const items = options.items === true;
  const maxRounds = options.maxRounds ?? 100;
  let state = createMatch(deck, seed, { items });

  const uniqueDeck = deck.filter(
    (card, index) => deck.findIndex((entry) => entry.id === card.id) === index,
  );
  const transcript: MatchTranscript = {
    formatVersion: TRANSCRIPT_FORMAT_VERSION,
    seed,
    itemsEnabled: items,
    deck: uniqueDeck.map((card) => ({ id: card.id, name: card.name, stats: { ...card.stats } })),
    initialShuffleIds: shuffleDeterministic(uniqueDeck, seed).map((card) => card.id),
    itemChoices: [],
    rounds: [],
    final: {
      outcome: "draw",
      endReason: null,
      roundsPlayed: 0,
      p1Hp: 0,
      p2Hp: 0,
      drawPileCount: 0,
      p1Inventory: { "long-sword": 0, "cloth-armor": 0, "ruby-crystal": 0, "mogzy-snack": 0 },
      p2Inventory: { "long-sword": 0, "cloth-armor": 0, "ruby-crystal": 0, "mogzy-snack": 0 },
      invariantIssues: [],
    },
  };

  const recordItemChoice = () => {
    const choiceIndex = state.itemChoicesCompleted;
    const p1Pick = transcriptPlayerItemPick(choiceIndex);
    const before = state.botInventory;
    state = chooseItem(state, p1Pick);
    const p2Pick = ITEM_IDS.find((id) => state.botInventory[id] === (before[id] ?? 0) + 1)!;
    transcript.itemChoices.push({
      choiceIndex,
      completedRounds: state.roundHistory.length,
      p1Pick,
      p2Pick,
    });
  };

  if (state.phase === "item-choice") recordItemChoice();

  while (state.phase === "selecting" && state.round <= maxRounds) {
    const roundRecord: Pick<
      TranscriptRound,
      "round" | "boardCategoryIds" | "hintFamily" | "p1HandIds" | "p2HandIds" | "drawPileCount"
    > = {
      round: state.round,
      boardCategoryIds: state.currentCategories.map((category) => category.id),
      hintFamily: state.nextCategories[0]?.family ?? null,
      p1HandIds: state.playerHand.map((card) => card.id),
      p2HandIds: state.botHand.map((card) => card.id),
      drawPileCount: state.drawPile.length,
    };

    state = autoAssignBestPlayerHand(state);
    if (items) {
      const p1Cards = {} as Record<StatCategoryId, StatCheckCard>;
      for (const category of state.currentCategories) {
        const id = state.assignments[category.id];
        const card = state.playerHand.find((entry) => entry.id === id);
        if (card) p1Cards[category.id] = card;
      }
      const play = selectBotItemPlay(p1Cards, state.currentCategories, state.playerInventory);
      if (play) state = equipItem(state, play.categoryId, play.itemId);
    }

    state = resolveCurrentRound(state);
    const resolution = state.lastResolution!;
    const p1Item = resolution.results.find((result) => result.playerItem);
    const p2Item = resolution.results.find((result) => result.botItem);
    transcript.rounds.push({
      ...roundRecord,
      p1: {
        assignments: Object.fromEntries(
          resolution.categories.map((category) => [
            category.id,
            resolution.playerAssignments[category.id].id,
          ]),
        ),
        item: p1Item ? { categoryId: p1Item.category.id, itemId: p1Item.playerItem! } : null,
      },
      p2: {
        assignments: Object.fromEntries(
          resolution.categories.map((category) => [
            category.id,
            resolution.botAssignments[category.id].id,
          ]),
        ),
        item: p2Item ? { categoryId: p2Item.category.id, itemId: p2Item.botItem! } : null,
      },
      results: resolution.results.map((result) => ({
        categoryId: result.category.id,
        p1CardId: result.playerCard.id,
        p2CardId: result.botCard.id,
        p1Natural: result.playerNaturalValue,
        p2Natural: result.botNaturalValue,
        p1Item: result.playerItem,
        p2Item: result.botItem,
        p1Bonus: result.playerBonus,
        p2Bonus: result.botBonus,
        p1Final: result.playerValue,
        p2Final: result.botValue,
        winner: seatWinner(result.winner),
        margin: result.margin,
        decisive: result.decisive,
      })),
      damage: {
        p1Dealt: resolution.damage.player,
        p2Dealt: resolution.damage.bot,
        boardWinner: seatWinner(resolution.damage.boardWinner),
        p1CategoryWins: resolution.damage.playerCategoryWins,
        p2CategoryWins: resolution.damage.botCategoryWins,
        p1DecisiveDamage: resolution.damage.playerDecisiveDamage,
        p2DecisiveDamage: resolution.damage.botDecisiveDamage,
      },
      p1HpAfter: resolution.playerHpAfter,
      p2HpAfter: resolution.botHpAfter,
    });

    for (const issue of validateMatchInvariants(state, deck)) {
      transcript.final.invariantIssues.push(`round ${state.round}: ${issue.code} — ${issue.message}`);
    }

    if (state.phase === "resolved") {
      state = beginItemChoice(state);
      if (state.phase === "item-choice") recordItemChoice();
      state = startNextRound(state);
    }
  }

  transcript.final.outcome = seatOutcome(state.outcome);
  transcript.final.endReason = state.endReason;
  transcript.final.roundsPlayed = transcript.rounds.length;
  transcript.final.p1Hp = state.playerHp;
  transcript.final.p2Hp = state.botHp;
  transcript.final.drawPileCount = state.drawPile.length;
  transcript.final.p1Inventory = { ...state.playerInventory };
  transcript.final.p2Inventory = { ...state.botInventory };
  return transcript;
}

/** Synthetic long-match deck: the fixture roster plus graded filler cards. */
export function transcriptLongDeck(base: StatCheckCard[]): StatCheckCard[] {
  const filler = Array.from({ length: 72 }, (_, index): StatCheckCard => ({
    id: `T${index + 1}`,
    name: `T${index + 1}`,
    stats: {
      hp: 480 + index * 4,
      hpPerLevel: 80 + (index % 9) * 5,
      ad: 45 + (index % 25),
      adPerLevel: 2 + (index % 7) * 0.5,
      armor: 18 + (index % 30),
      armorPerLevel: 3.5 + (index % 4) * 0.5,
      magicResist: 28 + (index % 8),
      moveSpeed: 320 + (index % 12) * 5,
      attackRange: 125 + (index % 11) * 50,
      attackSpeed: 0.6 + (index % 10) * 0.01,
      attackSpeedPerLevel: 1 + (index % 6) * 0.5,
    },
  }));
  return [...base, ...filler];
}
