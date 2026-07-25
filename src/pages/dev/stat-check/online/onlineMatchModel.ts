import type { ItemId, ItemInventory } from "../items";
import {
  STAT_CATEGORIES,
  emptyAssignments,
  type CategoryResult,
  type MatchState,
  type RoundResolution,
  type StatCategory,
  type StatCheckCard,
  type StatFamily,
} from "../statCheckEngine";
import type {
  MatchPrivateView,
  MatchPublicView,
  OnlineCard,
  OnlineSeat,
  ResolvedRoundView,
} from "@/lib/stat-check-online/contracts";

/**
 * Synthesizes the page's local MatchState render model from authoritative
 * server projections, oriented to the viewer's seat (self = the engine's
 * "player" side, opponent = the "bot" side) so the existing board, reveal,
 * and damage presentation render unchanged.
 *
 * Presentation-only: nothing here computes rules. Opponent hand and the
 * draw pile are represented as opaque placeholder cards (counts only) —
 * their real contents never reach this client.
 */

const CATEGORY_BY_ID = new Map(STAT_CATEGORIES.map((category) => [category.id as string, category]));

export class OnlineModelError extends Error {}

function categoryById(id: string): StatCategory {
  const category = CATEGORY_BY_ID.get(id);
  if (!category) throw new OnlineModelError(`unknown category ${id}`);
  return category;
}

function toCard(card: OnlineCard): StatCheckCard {
  const stats = card.stats;
  const required = [
    "hp", "hpPerLevel", "ad", "adPerLevel", "armor", "armorPerLevel",
    "magicResist", "moveSpeed", "attackRange", "attackSpeed", "attackSpeedPerLevel",
  ];
  for (const key of required) {
    if (typeof stats[key] !== "number") throw new OnlineModelError(`card ${card.id}: missing ${key}`);
  }
  return { id: card.id, name: card.name, stats: stats as StatCheckCard["stats"] };
}

/** Opaque stand-in for cards this client must never know. */
function placeholderCard(id: string): StatCheckCard {
  return {
    id,
    name: "Concealed",
    stats: {
      hp: 0, hpPerLevel: 0, ad: 0, adPerLevel: 0, armor: 0, armorPerLevel: 0,
      magicResist: 0, moveSpeed: 0, attackRange: 0, attackSpeed: 0, attackSpeedPerLevel: 0,
    },
  };
}

/**
 * Concealed-board placeholder categories for the opening item choice: the
 * page renders hidden plaques (never category content) and reads only
 * `[0].family` for the one-family hint.
 */
function concealedBoard(hintFamily: string | null): StatCategory[] {
  return [0, 1, 2].map((index) => ({
    ...STAT_CATEGORIES[0],
    id: `concealed-${index}` as StatCategory["id"],
    family: (hintFamily ?? "health") as StatFamily,
    label: "Hidden category",
    shortLabel: "Hidden",
  }));
}

function emptyOnlineInventory(): ItemInventory {
  return { "long-sword": 0, "cloth-armor": 0, "ruby-crystal": 0, "mogzy-snack": 0 };
}

function toInventory(raw: Record<string, number>): ItemInventory {
  return { ...emptyOnlineInventory(), ...raw } as ItemInventory;
}

type Orientation = {
  self: OnlineSeat;
  other: OnlineSeat;
};

export function orientationFor(seat: OnlineSeat): Orientation {
  return { self: seat, other: seat === "p1" ? "p2" : "p1" };
}

const seatToSide = (orientation: Orientation, seat: OnlineSeat | "tie"): "player" | "bot" | "tie" =>
  seat === "tie" ? "tie" : seat === orientation.self ? "player" : "bot";

/** Map one resolved server round into the page's RoundResolution shape. */
export function toRoundResolution(resolved: ResolvedRoundView, seat: OnlineSeat): RoundResolution {
  const orientation = orientationFor(seat);
  const pick = <T,>(p1: T, p2: T): [T, T] => (seat === "p1" ? [p1, p2] : [p2, p1]);
  const categories = resolved.boardCategoryIds.map(categoryById);

  const results: CategoryResult[] = resolved.results.map((lane) => {
    const category = categoryById(lane.categoryId);
    const [selfCard, otherCard] = pick(lane.p1Card, lane.p2Card);
    const [selfNatural, otherNatural] = pick(lane.p1Natural, lane.p2Natural);
    const [selfItem, otherItem] = pick(lane.p1Item, lane.p2Item);
    const [selfBonus, otherBonus] = pick(lane.p1Bonus, lane.p2Bonus);
    const [selfFinal, otherFinal] = pick(lane.p1Final, lane.p2Final);
    return {
      category,
      playerCard: toCard(selfCard),
      botCard: toCard(otherCard),
      playerNaturalValue: selfNatural,
      botNaturalValue: otherNatural,
      playerItem: (selfItem as ItemId | null) ?? null,
      botItem: (otherItem as ItemId | null) ?? null,
      playerBonus: selfBonus,
      botBonus: otherBonus,
      playerValue: selfFinal,
      botValue: otherFinal,
      winner: seatToSide(orientation, lane.winner),
      margin: lane.margin,
      decisive: lane.decisive,
    };
  });

  const [selfDealt, otherDealt] = pick(resolved.damage.p1Dealt, resolved.damage.p2Dealt);
  const [selfWins, otherWins] = pick(resolved.damage.p1CategoryWins, resolved.damage.p2CategoryWins);
  const [selfDecisive, otherDecisive] = pick(
    resolved.damage.p1DecisiveDamage,
    resolved.damage.p2DecisiveDamage,
  );
  const [selfHpBefore, otherHpBefore] = pick(resolved.p1HpBefore, resolved.p2HpBefore);
  const [selfHpAfter, otherHpAfter] = pick(resolved.p1HpAfter, resolved.p2HpAfter);
  const boardWinner = seatToSide(orientation, resolved.damage.boardWinner);

  const playerAssignments = {} as RoundResolution["playerAssignments"];
  const botAssignments = {} as RoundResolution["botAssignments"];
  for (const result of results) {
    playerAssignments[result.category.id] = result.playerCard;
    botAssignments[result.category.id] = result.botCard;
  }

  return {
    round: resolved.roundNumber,
    categories,
    playerAssignments,
    botAssignments,
    results,
    damage: {
      player: selfDealt,
      bot: otherDealt,
      boardWinner,
      playerCategoryWins: selfWins,
      botCategoryWins: otherWins,
      playerBoardDamage: boardWinner === "player" ? selfDealt - selfDecisive : 0,
      botBoardDamage: boardWinner === "bot" ? otherDealt - otherDecisive : 0,
      playerDecisiveDamage: selfDecisive,
      botDecisiveDamage: otherDecisive,
    },
    playerHpBefore: selfHpBefore,
    botHpBefore: otherHpBefore,
    playerHpAfter: selfHpAfter,
    botHpAfter: otherHpAfter,
    outcome: null,
    clueFamily: (resolved.hintFamily as StatFamily | null) ?? null,
    playerRetainedBestClueCard: null,
  };
}

/**
 * Build the presented MatchState from the current public+private projections
 * plus the locally accumulated round history.
 */
export function synthesizeMatchState(
  publicView: MatchPublicView,
  privateView: MatchPrivateView,
  history: RoundResolution[],
): MatchState {
  const seat = privateView.yourSeat;
  const orientation = orientationFor(seat);
  const selfSeat = publicView.seats[orientation.self];
  const otherSeat = publicView.seats[orientation.other];
  const opening = publicView.phase === "item-choice-opening";
  const currentCategories = opening
    ? concealedBoard(publicView.hintFamily)
    : publicView.boardCategoryIds.map(categoryById);
  // Only the one-family hint ever exists client-side; slots 1-2 are decoys
  // the page never reads beyond "hidden" tiles.
  const hintBoard = concealedBoard(publicView.hintFamily);
  const lastResolution = history.length > 0 ? history[history.length - 1] : null;
  const phase: MatchState["phase"] =
    publicView.phase === "item-choice-opening" || publicView.phase === "item-choice"
      ? "item-choice"
      : publicView.phase;

  return {
    seed: "online",
    phase,
    round: publicView.round,
    itemsEnabled: true,
    playerInventory: toInventory(privateView.inventory),
    botInventory: emptyOnlineInventory(),
    itemChoicesCompleted: publicView.itemChoicesCompleted,
    equippedItem: null,
    playerHp: selfSeat.hp,
    botHp: otherSeat.hp,
    drawPile: Array.from({ length: publicView.drawPileCount }, (_, index) =>
      placeholderCard(`pool-${index}`),
    ),
    playerHand: privateView.hand.map(toCard),
    botHand: Array.from({ length: otherSeat.handCount }, (_, index) =>
      placeholderCard(`opp-${index}`),
    ),
    playerDiscard: selfSeat.discardCardIds.map((id) => placeholderNamed(id)),
    botDiscard: otherSeat.discardCardIds.map((id) => placeholderNamed(id)),
    currentCategories,
    nextCategories: hintBoard,
    assignments: emptyAssignments(currentCategories),
    lastResolution:
      phase === "item-choice" && lastResolution && lastResolution.round === publicView.completedRounds
        ? lastResolution
        : phase === "match-over"
          ? lastResolution
          : null,
    roundHistory: history,
    outcome: publicView.outcome === null ? null : seatOutcome(publicView.outcome, seat),
    endReason: publicView.endReason,
  };
}

/** Discards are open information: id doubles as champion name for art. */
function placeholderNamed(id: string): StatCheckCard {
  return { ...placeholderCard(id), name: id };
}

function seatOutcome(outcome: OnlineSeat | "draw", seat: OnlineSeat): MatchState["outcome"] {
  if (outcome === "draw") return "draw";
  return outcome === seat ? "player" : "bot";
}
