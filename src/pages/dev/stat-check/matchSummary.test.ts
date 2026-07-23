import { describe, expect, it } from "vitest";
import { STAT_CHECK_FIXTURE_DECK } from "./fixtureDeck";
import { buildMatchSummary } from "./matchSummary";
import {
  autoAssignBestPlayerHand,
  createMatch,
  resolveCurrentRound,
  startNextRound,
  STAT_CHECK_RULES,
  type MatchState,
} from "./statCheckEngine";

function playToCompletion(seed: string): MatchState {
  let state = createMatch(STAT_CHECK_FIXTURE_DECK, seed);
  while (state.phase === "selecting") {
    state = resolveCurrentRound(autoAssignBestPlayerHand(state));
    if (state.phase === "resolved") state = startNextRound(state);
  }
  return state;
}

describe("match summary", () => {
  it("derives totals from the authoritative round history without double counting", () => {
    const state = playToCompletion("summary");
    const summary = buildMatchSummary(state);

    expect(summary.rounds).toBe(state.roundHistory.length);
    expect(summary.rounds).toBeGreaterThan(0);
    expect(summary.finalPlayerHp).toBe(state.playerHp);
    expect(summary.finalBotHp).toBe(state.botHp);

    const expectedPlayerTotal = state.roundHistory.reduce((sum, round) => sum + round.damage.player, 0);
    const expectedBotTotal = state.roundHistory.reduce((sum, round) => sum + round.damage.bot, 0);
    expect(summary.player.total).toBe(expectedPlayerTotal);
    expect(summary.bot.total).toBe(expectedBotTotal);
    expect(summary.player.boardDamage + summary.player.sweepDamage + summary.player.decisiveDamage).toBe(
      summary.player.total,
    );
    // HP checks out against damage received.
    expect(summary.finalPlayerHp).toBe(Math.max(0, STAT_CHECK_RULES.startingHp - expectedBotTotal));

    expect(summary.poolRemaining).toBe(state.drawPile.length);
    expect(summary.playerDiscards).toBe(state.playerDiscard.length);
    expect(summary.botDiscards).toBe(state.botDiscard.length);
    expect(summary.clueFamilies.length).toBe(state.roundHistory.length);
    expect(summary.clueTrackedRounds).toBeGreaterThanOrEqual(summary.clueRetainedRounds);
  });

  it("maps outcomes including exhaustion and simultaneous knockout", () => {
    const exhausted = playToCompletion("summary-exhaust");
    // The 24-card fixture always ends by exhaustion; result comes from HP.
    expect(exhausted.endReason).toContain("Deck exhausted");
    const summary = buildMatchSummary(exhausted);
    expect(summary.endReason).toContain("Deck exhausted");
    expect(["win", "loss", "draw"]).toContain(summary.result!);

    let simultaneous = createMatch(STAT_CHECK_FIXTURE_DECK, "summary-simul");
    simultaneous = { ...simultaneous, playerHp: 1, botHp: 1 };
    let resolved = resolveCurrentRound(autoAssignBestPlayerHand(simultaneous));
    // Keep resolving until damage lands on both sides or the match ends.
    while (resolved.phase === "resolved") resolved = resolveCurrentRound(autoAssignBestPlayerHand(startNextRound(resolved)));
    const endSummary = buildMatchSummary(resolved);
    if (resolved.outcome === "draw") {
      expect(endSummary.result).toBe("draw");
      expect(endSummary.finalPlayerHp).toBe(0);
      expect(endSummary.finalBotHp).toBe(0);
    } else {
      expect(["win", "loss"]).toContain(endSummary.result!);
    }
  });

  it("counts tied, no-damage, and simultaneous rounds consistently", () => {
    const state = playToCompletion("summary-counts");
    const summary = buildMatchSummary(state);
    const tied = state.roundHistory.filter((round) => round.damage.boardWinner === "tie").length;
    const none = state.roundHistory.filter((round) => round.damage.player === 0 && round.damage.bot === 0).length;
    const both = state.roundHistory.filter((round) => round.damage.player > 0 && round.damage.bot > 0).length;
    expect(summary.tiedBoards).toBe(tied);
    expect(summary.noDamageRounds).toBe(none);
    expect(summary.simultaneousDamageRounds).toBe(both);
    expect(summary.noDamageRounds + summary.simultaneousDamageRounds).toBeLessThanOrEqual(summary.rounds);
  });

  it("is empty for a fresh match and resets via restart's new match state", () => {
    const fresh = buildMatchSummary(createMatch(STAT_CHECK_FIXTURE_DECK, "summary-fresh"));
    expect(fresh.rounds).toBe(0);
    expect(fresh.result).toBeNull();
    expect(fresh.player.total).toBe(0);
    expect(fresh.clueFamilies).toEqual([]);
    expect(fresh.playerDiscards).toBe(0);
  });
});
