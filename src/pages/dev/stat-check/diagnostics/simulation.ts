import {
  autoAssignBestPlayerHand,
  createMatch,
  resolveCurrentRound,
  startNextRound,
  STAT_CATEGORIES,
  validateMatchInvariants,
  type MatchOutcome,
  type MatchState,
  type StatCategory,
  type StatCategoryId,
  type StatCheckCard,
  type StatFamily,
} from "../statCheckEngine";

// Deterministic, engine-consuming simulation diagnostics. This module is
// intentionally pure logic with no UI, timers, or randomness of its own:
// all randomness flows through the engine's seeded helpers via the seed list.

export type { StatFamily };

export function familyOfCategory(id: StatCategoryId): StatFamily {
  const category = STAT_CATEGORIES.find((entry) => entry.id === id);
  if (!category) throw new Error(`Unknown Stat Check category id: ${id}`);
  return category.family;
}

export type CategoryStats = {
  appearances: number;
  ties: number;
  playerWins: number;
  botWins: number;
  decisiveWins: number;
  /** Relative margin of every non-tie result, for spread analysis. */
  winningMargins: number[];
};

export type RoundCategoryOutcome = {
  id: StatCategoryId;
  winner: "player" | "bot" | "tie";
  margin: number;
  decisive: boolean;
};

export type RoundRecord = {
  seed: string;
  round: number;
  categoryIds: StatCategoryId[];
  results: RoundCategoryOutcome[];
  boardWinner: "player" | "bot" | "tie";
  sweep: boolean;
  playerDamage: number;
  botDamage: number;
  bothDamaged: boolean;
  tieCount: number;
  decisiveCount: number;
};

export type MatchRecord = {
  seed: string;
  rounds: number;
  outcome: MatchOutcome;
  endReason: string | null;
  exhausted: boolean;
  finalPlayerHp: number;
  finalBotHp: number;
  /** Shared draw pile size when the match ended. */
  endPoolSize: number;
  invariantIssues: string[];
};

export type ClueFamilyStats = {
  clued: number;
  conflicts: number;
  /** Clued rounds where 2+ hand cards sit within 5% of the best clue value. */
  contested: number;
};

export type ClueStats = {
  /** Rounds where a next-round clue existed and the match actually reached that next round. */
  cluedRoundsReached: number;
  /** Rounds where a next-round clue existed at selection time. */
  cluedRounds: number;
  /**
   * Rounds where the player's single best card for the clued category was one
   * the greedy current-round strategy wanted to play — i.e. the clue created a
   * genuine spend-versus-preserve tension.
   */
  clueConflicts: number;
  /** Clued rounds where the best clue card was naturally preserved by greedy play. */
  cluePreservedFree: number;
  /** Clued rounds where 2+ hand cards sit within 5% of the best clue value. */
  clueContested: number;
  perFamily: Partial<Record<StatFamily, ClueFamilyStats>>;
};

export type DiagnosticsReport = {
  matches: number;
  seeds: string[];
  totalRounds: number;
  deckSize: number;
  categoryStats: Record<StatCategoryId, CategoryStats>;
  familyFrequency: Record<StatFamily, number>;
  pairFrequency: Record<string, number>;
  boardComboFrequency: Record<string, number>;
  repeatedFamilyBoards: number;
  boardResults: { player: number; bot: number; tie: number };
  sweeps: number;
  tiedBoards: number;
  simultaneousDamageRounds: number;
  noDamageRounds: number;
  playerDamageTotal: number;
  botDamageTotal: number;
  finalPlayerHps: number[];
  finalBotHps: number[];
  endPoolSizes: number[];
  outcomes: { player: number; bot: number; draw: number };
  exhaustedMatches: number;
  hpEndedMatches: number;
  roundsPerMatch: number[];
  totalDamagePerRound: number[];
  clueStats: ClueStats;
  matchRecords: MatchRecord[];
  roundRecords: RoundRecord[];
};

function sortKey(ids: StatCategoryId[]): string {
  return ids.slice().sort().join("+");
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function bestCardForCategory(hand: StatCheckCard[], category: StatCategory): StatCheckCard | null {
  let best: StatCheckCard | null = null;
  for (const card of hand) {
    if (!best) {
      best = card;
      continue;
    }
    const value = category.getValue(card);
    const bestValue = category.getValue(best);
    if (category.direction === "higher" ? value > bestValue : value < bestValue) best = card;
  }
  return best;
}

export function simulateMatch(
  deck: StatCheckCard[],
  seed: string,
  maxRounds = 100,
): { match: MatchRecord; rounds: RoundRecord[]; clue: ClueStats } {
  let state: MatchState = createMatch(deck, seed);
  const rounds: RoundRecord[] = [];
  const clue: ClueStats = {
    cluedRounds: 0,
    cluedRoundsReached: 0,
    clueConflicts: 0,
    cluePreservedFree: 0,
    clueContested: 0,
    perFamily: {},
  };
  const invariantIssues: string[] = [];

  while (state.phase === "selecting" && state.round <= maxRounds) {
    const clueCategory = state.nextCategories[0] ?? null;
    const bestClueCard = clueCategory ? bestCardForCategory(state.playerHand, clueCategory) : null;

    state = autoAssignBestPlayerHand(state);
    const playedIds = new Set(Object.values(state.assignments).filter(Boolean));

    if (clueCategory && bestClueCard) {
      clue.cluedRounds += 1;
      const familyStats =
        clue.perFamily[clueCategory.family] ??
        (clue.perFamily[clueCategory.family] = { clued: 0, conflicts: 0, contested: 0 });
      familyStats.clued += 1;
      const bestValue = clueCategory.getValue(bestClueCard);
      const nearBest = state.playerHand.filter((cardInHand) => {
        const value = clueCategory.getValue(cardInHand);
        const gap = Math.abs(bestValue - value) / (Math.abs(bestValue) || 1);
        return gap <= 0.05;
      }).length;
      if (nearBest >= 2) {
        clue.clueContested += 1;
        familyStats.contested += 1;
      }
      if (playedIds.has(bestClueCard.id)) {
        clue.clueConflicts += 1;
        familyStats.conflicts += 1;
      } else {
        clue.cluePreservedFree += 1;
      }
    }

    state = resolveCurrentRound(state);
    const resolution = state.lastResolution!;
    const tieCount = resolution.results.filter((r) => r.winner === "tie").length;
    const decisiveCount = resolution.results.filter((r) => r.decisive).length;
    rounds.push({
      seed,
      round: resolution.round,
      categoryIds: resolution.categories.map((c) => c.id),
      results: resolution.results.map((r) => ({
        id: r.category.id,
        winner: r.winner,
        margin: r.margin,
        decisive: r.decisive,
      })),
      boardWinner: resolution.damage.boardWinner,
      sweep: resolution.damage.playerCategoryWins === 3 || resolution.damage.botCategoryWins === 3,
      playerDamage: resolution.damage.player,
      botDamage: resolution.damage.bot,
      bothDamaged: resolution.damage.player > 0 && resolution.damage.bot > 0,
      tieCount,
      decisiveCount,
    });

    for (const issue of validateMatchInvariants(state, deck)) {
      invariantIssues.push(`round ${state.round}: ${issue.code} — ${issue.message}`);
    }

    if (state.phase === "resolved") {
      state = startNextRound(state);
      if (state.phase === "selecting" && clueCategory) clue.cluedRoundsReached += 1;
    }
  }

  return {
    match: {
      seed,
      rounds: rounds.length,
      outcome: state.outcome,
      endReason: state.endReason,
      exhausted: (state.endReason ?? "").includes("Deck exhausted"),
      finalPlayerHp: state.playerHp,
      finalBotHp: state.botHp,
      endPoolSize: state.drawPile.length,
      invariantIssues,
    },
    rounds,
    clue,
  };
}

export function runDiagnostics(deck: StatCheckCard[], seeds: string[]): DiagnosticsReport {
  const categoryStats = {} as Record<StatCategoryId, CategoryStats>;
  const familyFrequency = {
    health: 0,
    "attack-damage": 0,
    armor: 0,
    "magic-resist": 0,
    "move-speed": 0,
    "attack-range": 0,
    "attack-speed": 0,
  } as Record<StatFamily, number>;
  const pairFrequency: Record<string, number> = {};
  const boardComboFrequency: Record<string, number> = {};
  const boardResults = { player: 0, bot: 0, tie: 0 };
  const outcomes = { player: 0, bot: 0, draw: 0 };
  const report: DiagnosticsReport = {
    matches: seeds.length,
    seeds,
    totalRounds: 0,
    deckSize: deck.length,
    categoryStats,
    familyFrequency,
    pairFrequency,
    boardComboFrequency,
    repeatedFamilyBoards: 0,
    boardResults,
    sweeps: 0,
    tiedBoards: 0,
    simultaneousDamageRounds: 0,
    noDamageRounds: 0,
    playerDamageTotal: 0,
    botDamageTotal: 0,
    finalPlayerHps: [],
    finalBotHps: [],
    endPoolSizes: [],
    outcomes,
    exhaustedMatches: 0,
    hpEndedMatches: 0,
    roundsPerMatch: [],
    totalDamagePerRound: [],
    clueStats: {
      cluedRounds: 0,
      cluedRoundsReached: 0,
      clueConflicts: 0,
      cluePreservedFree: 0,
      clueContested: 0,
      perFamily: {},
    },
    matchRecords: [],
    roundRecords: [],
  };

  for (const seed of seeds) {
    const { match, rounds, clue } = simulateMatch(deck, seed);
    report.matchRecords.push(match);
    report.roundRecords.push(...rounds);
    report.roundsPerMatch.push(match.rounds);
    report.totalRounds += match.rounds;
    if (match.exhausted) report.exhaustedMatches += 1;
    else if (match.outcome) report.hpEndedMatches += 1;
    if (match.outcome) outcomes[match.outcome] += 1;
    report.finalPlayerHps.push(match.finalPlayerHp);
    report.finalBotHps.push(match.finalBotHp);
    report.endPoolSizes.push(match.endPoolSize);
    report.clueStats.cluedRounds += clue.cluedRounds;
    report.clueStats.cluedRoundsReached += clue.cluedRoundsReached;
    report.clueStats.clueConflicts += clue.clueConflicts;
    report.clueStats.cluePreservedFree += clue.cluePreservedFree;
    report.clueStats.clueContested += clue.clueContested;
    for (const [family, stats] of Object.entries(clue.perFamily) as [StatFamily, ClueFamilyStats][]) {
      const target =
        report.clueStats.perFamily[family] ??
        (report.clueStats.perFamily[family] = { clued: 0, conflicts: 0, contested: 0 });
      target.clued += stats.clued;
      target.conflicts += stats.conflicts;
      target.contested += stats.contested;
    }

    for (const round of rounds) {
      report.totalDamagePerRound.push(round.playerDamage + round.botDamage);
      report.playerDamageTotal += round.playerDamage;
      report.botDamageTotal += round.botDamage;
      boardResults[round.boardWinner] += 1;
      if (round.sweep) report.sweeps += 1;
      if (round.boardWinner === "tie") report.tiedBoards += 1;
      if (round.bothDamaged) report.simultaneousDamageRounds += 1;
      if (round.playerDamage === 0 && round.botDamage === 0) report.noDamageRounds += 1;

      for (const result of round.results) {
        const stats =
          categoryStats[result.id] ??
          (categoryStats[result.id] = {
            appearances: 0,
            ties: 0,
            playerWins: 0,
            botWins: 0,
            decisiveWins: 0,
            winningMargins: [],
          });
        stats.appearances += 1;
        if (result.winner === "tie") stats.ties += 1;
        else if (result.winner === "player") stats.playerWins += 1;
        else stats.botWins += 1;
        if (result.decisive) stats.decisiveWins += 1;
        if (result.winner !== "tie") stats.winningMargins.push(result.margin);
      }

      const families = round.categoryIds.map(familyOfCategory);
      if (new Set(families).size < families.length) report.repeatedFamilyBoards += 1;
      for (const family of families) familyFrequency[family] += 1;

      const combo = sortKey(round.categoryIds);
      boardComboFrequency[combo] = (boardComboFrequency[combo] ?? 0) + 1;
      const sorted = round.categoryIds.slice().sort();
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const key = `${sorted[i]}+${sorted[j]}`;
          pairFrequency[key] = (pairFrequency[key] ?? 0) + 1;
        }
      }
    }
  }

  return report;
}

/**
 * Candidate-threshold table for calibration passes. Winning margins are
 * threshold-independent, so decisive rates for any candidate threshold can be
 * read straight off the recorded margin distribution without re-simulating.
 */
export function thresholdCandidateTable(
  report: DiagnosticsReport,
  candidates: number[] = [0.03, 0.05, 0.075, 0.1, 0.125, 0.15, 0.2, 0.25, 0.3],
): string {
  const lines: string[] = [];
  lines.push(`Candidate decisive rates (per appearance | per non-tied lane):`);
  lines.push(`  ${"category".padEnd(22)}${candidates.map((c) => `${(c * 100).toFixed(1)}%`.padStart(13)).join("")}`);
  for (const [id, stats] of Object.entries(report.categoryStats).sort((a, b) => a[0].localeCompare(b[0]))) {
    const nonTied = stats.appearances - stats.ties;
    const cells = candidates.map((candidate) => {
      const hits = stats.winningMargins.filter((margin) => margin >= candidate).length;
      const perAppearance = stats.appearances ? (hits / stats.appearances) * 100 : 0;
      const perNonTied = nonTied ? (hits / nonTied) * 100 : 0;
      return `${perAppearance.toFixed(1)}|${perNonTied.toFixed(1)}`.padStart(13);
    });
    lines.push(`  ${id.padEnd(22)}${cells.join("")}`);
  }
  return lines.join("\n");
}

export function formatDiagnosticsReport(report: DiagnosticsReport): string {
  const lines: string[] = [];
  const pct = (n: number, d: number) => (d === 0 ? "0%" : `${((n / d) * 100).toFixed(1)}%`);
  lines.push(`Stat Check simulation diagnostics`);
  lines.push(`matches=${report.matches} deckSize=${report.deckSize} totalRounds=${report.totalRounds}`);
  lines.push(`seeds: ${report.seeds.slice(0, 5).join(", ")}${report.seeds.length > 5 ? ` … (+${report.seeds.length - 5})` : ""}`);
  lines.push("");
  lines.push(
    `Rounds/match: mean=${mean(report.roundsPerMatch).toFixed(2)} median=${median(report.roundsPerMatch)} min=${Math.min(...report.roundsPerMatch)} max=${Math.max(...report.roundsPerMatch)}`,
  );
  lines.push(
    `Total damage/round: mean=${mean(report.totalDamagePerRound).toFixed(2)} median=${median(report.totalDamagePerRound)} | per-side mean: player=${(report.playerDamageTotal / (report.totalRounds || 1)).toFixed(2)} bot=${(report.botDamageTotal / (report.totalRounds || 1)).toFixed(2)} | no-damage rounds=${pct(report.noDamageRounds, report.totalRounds)}`,
  );
  lines.push(
    `Final HP: player mean=${mean(report.finalPlayerHps).toFixed(1)} median=${median(report.finalPlayerHps)} | bot mean=${mean(report.finalBotHps).toFixed(1)} median=${median(report.finalBotHps)} | end pool size mean=${mean(report.endPoolSizes).toFixed(1)} median=${median(report.endPoolSizes)}`,
  );
  lines.push(
    `Endings: exhausted=${report.exhaustedMatches} (${pct(report.exhaustedMatches, report.matches)}) hp=${report.hpEndedMatches} (${pct(report.hpEndedMatches, report.matches)})`,
  );
  lines.push(`Outcomes: player=${report.outcomes.player} bot=${report.outcomes.bot} draw=${report.outcomes.draw}`);
  lines.push(
    `Boards: player=${report.boardResults.player} bot=${report.boardResults.bot} tie=${report.boardResults.tie} sweeps=${report.sweeps} (${pct(report.sweeps, report.totalRounds)}) tiedBoards=${pct(report.tiedBoards, report.totalRounds)} simultaneousDamage=${pct(report.simultaneousDamageRounds, report.totalRounds)}`,
  );
  lines.push(`Repeated-family boards: ${report.repeatedFamilyBoards} (${pct(report.repeatedFamilyBoards, report.totalRounds)})`);
  lines.push("");
  lines.push("Per-category (appearances | P/B wins | tie% | decisive% | margin mean/median/p90):");
  for (const [id, stats] of Object.entries(report.categoryStats).sort((a, b) => b[1].appearances - a[1].appearances)) {
    const margins = stats.winningMargins.slice().sort((a, b) => a - b);
    const p90 = margins.length ? margins[Math.min(margins.length - 1, Math.floor(margins.length * 0.9))] : 0;
    lines.push(
      `  ${id.padEnd(22)} n=${String(stats.appearances).padStart(5)} P=${stats.playerWins} B=${stats.botWins} tie=${pct(stats.ties, stats.appearances).padStart(6)} decisive=${pct(stats.decisiveWins, stats.appearances).padStart(6)} margin=${(mean(margins) * 100).toFixed(1)}%/${(median(margins) * 100).toFixed(1)}%/${(p90 * 100).toFixed(1)}%`,
    );
  }
  lines.push("");
  lines.push("Family frequency (category slots):");
  for (const [family, count] of Object.entries(report.familyFrequency).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${family.padEnd(14)} ${count} (${pct(count, report.totalRounds * 3)})`);
  }
  lines.push("");
  const combos = Object.entries(report.boardComboFrequency).sort((a, b) => b[1] - a[1]);
  lines.push(`Distinct board combos: ${combos.length}; top 8:`);
  for (const [combo, count] of combos.slice(0, 8)) lines.push(`  ${combo}: ${count}`);
  lines.push("");
  const pairs = Object.entries(report.pairFrequency).sort((a, b) => b[1] - a[1]);
  lines.push(`Distinct category pairs: ${pairs.length}; top 8:`);
  for (const [pair, count] of pairs.slice(0, 8)) lines.push(`  ${pair}: ${count}`);
  lines.push("");
  const clue = report.clueStats;
  lines.push(
    `Clue: cluedRounds=${clue.cluedRounds} reachedNext=${clue.cluedRoundsReached} conflicts=${clue.clueConflicts} (${pct(clue.clueConflicts, clue.cluedRounds)}) preservedFree=${clue.cluePreservedFree} contested=${clue.clueContested} (${pct(clue.clueContested, clue.cluedRounds)})`,
  );
  for (const [family, stats] of Object.entries(clue.perFamily).sort((a, b) => b[1].clued - a[1].clued)) {
    lines.push(
      `  clue:${family.padEnd(14)} clued=${stats.clued} conflict=${pct(stats.conflicts, stats.clued)} contested=${pct(stats.contested, stats.clued)}`,
    );
  }
  const issues = report.matchRecords.flatMap((m) => m.invariantIssues.map((issue) => `${m.seed}: ${issue}`));
  lines.push(`Invariant issues: ${issues.length}`);
  for (const issue of issues.slice(0, 10)) lines.push(`  ${issue}`);
  return lines.join("\n");
}
