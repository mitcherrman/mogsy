import {
  STAT_CHECK_RULES,
  STAT_FAMILY_LABELS,
  type MatchState,
  type StatFamily,
} from "./statCheckEngine";

// Local, non-persistent post-match playtest summary. Every number is derived
// from the authoritative resolved-round history — no damage recalculation.

export type SideDamageSummary = {
  boardDamage: number;
  sweepDamage: number;
  decisiveDamage: number;
  total: number;
};

export type MatchSummary = {
  result: "win" | "loss" | "draw" | null;
  endReason: string | null;
  rounds: number;
  finalPlayerHp: number;
  finalBotHp: number;
  player: SideDamageSummary;
  bot: SideDamageSummary;
  tiedBoards: number;
  noDamageRounds: number;
  simultaneousDamageRounds: number;
  /** Clue families in the order they were shown, as display labels. */
  clueFamilies: string[];
  /** Rounds where the strongest clue-family card stayed in the player's hand. */
  clueRetainedRounds: number;
  /** Rounds where a retention determination was possible at all. */
  clueTrackedRounds: number;
  poolRemaining: number;
  playerDiscards: number;
  botDiscards: number;
};

export function buildMatchSummary(state: MatchState): MatchSummary {
  const rounds = state.roundHistory;
  const side = (who: "player" | "bot"): SideDamageSummary => {
    let boardDamage = 0;
    let sweepDamage = 0;
    let decisiveDamage = 0;
    for (const round of rounds) {
      const damage = round.damage;
      const boardTotal = who === "player" ? damage.playerBoardDamage : damage.botBoardDamage;
      // Stored board damage already includes the sweep bonus; split it back
      // out for display without recomputing any rule.
      if (boardTotal > 0) {
        boardDamage += STAT_CHECK_RULES.boardDamage;
        sweepDamage += boardTotal - STAT_CHECK_RULES.boardDamage;
      }
      decisiveDamage += who === "player" ? damage.playerDecisiveDamage : damage.botDecisiveDamage;
    }
    return { boardDamage, sweepDamage, decisiveDamage, total: boardDamage + sweepDamage + decisiveDamage };
  };

  const clueFamilies = rounds
    .map((round) => round.clueFamily)
    .filter((family): family is StatFamily => Boolean(family))
    .map((family) => STAT_FAMILY_LABELS[family]);

  return {
    result: state.outcome === null ? null : state.outcome === "player" ? "win" : state.outcome === "bot" ? "loss" : "draw",
    endReason: state.endReason,
    rounds: rounds.length,
    finalPlayerHp: state.playerHp,
    finalBotHp: state.botHp,
    player: side("player"),
    bot: side("bot"),
    tiedBoards: rounds.filter((round) => round.damage.boardWinner === "tie").length,
    noDamageRounds: rounds.filter((round) => round.damage.player === 0 && round.damage.bot === 0).length,
    simultaneousDamageRounds: rounds.filter((round) => round.damage.player > 0 && round.damage.bot > 0).length,
    clueFamilies,
    clueRetainedRounds: rounds.filter((round) => round.playerRetainedBestClueCard === true).length,
    clueTrackedRounds: rounds.filter((round) => round.playerRetainedBestClueCard !== null).length,
    poolRemaining: state.drawPile.length,
    playerDiscards: state.playerDiscard.length,
    botDiscards: state.botDiscard.length,
  };
}
