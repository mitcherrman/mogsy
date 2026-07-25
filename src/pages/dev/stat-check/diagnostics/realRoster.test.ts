import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ChampionBaseStats } from "@/lib/league-docs/api";
import { ACTIVE_STAT_CATEGORIES, STAT_CATEGORIES } from "../statCheckEngine";
import { parseChampionStatsResponse, rosterDeckFromResponse } from "./rosterAdapter";
import { formatDiagnosticsReport, hpCandidateTable, runDiagnostics, thresholdCandidateTable } from "./simulation";

const row = (name: string, overrides: Partial<ChampionBaseStats> = {}): ChampionBaseStats => ({
  champion_name: name,
  hp: 600,
  hp_per_level: 100,
  hp5: 3,
  mp: 300,
  mp_per_level: 40,
  ad: 60,
  ad_per_level: 3,
  attack_speed: 0.65,
  attack_speed_per_level: 2,
  armor: 30,
  armor_per_level: 4,
  magic_resist: 32,
  magic_resist_per_level: 1.3,
  move_speed: 335,
  attack_range: 175,
  ...overrides,
});

describe("roster adapter", () => {
  it("unwraps the champion-stats payload like the live fetch", () => {
    const rows = parseChampionStatsResponse({ ok: true, champion_stats: [row("Ahri"), row("  ")] });
    expect(rows.map((r) => r.champion_name)).toEqual(["Ahri"]);
    expect(parseChampionStatsResponse(null)).toEqual([]);
    expect(parseChampionStatsResponse({})).toEqual([]);
  });

  it("filters rows with missing stats and stays deterministic", () => {
    const payload = {
      champion_stats: [
        row("Zed"),
        row("Ahri"),
        row("Broken", { hp: Number.NaN }),
        row("AlsoBroken", { attack_range: null as unknown as number }),
      ],
    };
    const a = rosterDeckFromResponse(payload);
    const b = rosterDeckFromResponse(payload);
    expect(a).toEqual(b);
    expect(a.map((card) => card.name)).toEqual(["Ahri", "Zed"]);
  });
});

// Real-roster diagnostics use a gitignored roster.local.json snapshot of the
// live /api/meta/champion-stats payload (acquired outside tests). Skipped
// cleanly when the snapshot is absent so CI never needs the network.
const rosterPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "roster.local.json");
const hasRoster = existsSync(rosterPath);

describe.skipIf(!hasRoster)("real roster diagnostics", () => {
  const payload = hasRoster ? JSON.parse(readFileSync(rosterPath, "utf8").replace(/^\uFEFF/, "")) : null;

  it(
    "runs 500 deterministic matches on the live roster with zero violations",
    () => {
      const deck = rosterDeckFromResponse(payload);
      expect(deck.length).toBeGreaterThanOrEqual(100);
      expect(new Set(deck.map((card) => card.id)).size).toBe(deck.length);

      const seeds = Array.from({ length: 500 }, (_, i) => `stat-check-roster:${i}`);
      const report = runDiagnostics(deck, seeds);

      expect(report.matchRecords.flatMap((m) => m.invariantIssues)).toEqual([]);
      expect(report.repeatedFamilyBoards).toBe(0);
      for (const category of STAT_CATEGORIES.filter((c) => !c.active)) {
        expect(report.categoryStats[category.id]).toBeUndefined();
      }
      for (const category of ACTIVE_STAT_CATEGORIES) {
        expect(report.categoryStats[category.id]?.appearances ?? 0).toBeGreaterThan(0);
      }
      for (const match of report.matchRecords) {
        expect(match.exhausted || match.outcome !== null).toBe(true);
      }

      // Calibration guards: bounded ranges, not exact percentages. Armor and
      // AD-18 must stay well below their pre-calibration 38%/34% rates, HP
      // lanes must no longer be effectively zero, and nothing may dominate.
      const decisiveRate = (id: string) => {
        const stats = report.categoryStats[id as keyof typeof report.categoryStats];
        return stats ? stats.decisiveWins / stats.appearances : 0;
      };
      expect(decisiveRate("lowest-armor-1")).toBeGreaterThan(0.05);
      expect(decisiveRate("lowest-armor-1")).toBeLessThan(0.25);
      expect(decisiveRate("highest-ad-18")).toBeGreaterThan(0.05);
      expect(decisiveRate("highest-ad-18")).toBeLessThan(0.3);
      expect(decisiveRate("highest-hp-1")).toBeGreaterThan(0.05);
      expect(decisiveRate("highest-hp-18")).toBeGreaterThan(0.05);
      expect(decisiveRate("highest-ad-1")).toBeGreaterThan(0.05);
      for (const category of ACTIVE_STAT_CATEGORIES) {
        expect(decisiveRate(category.id)).toBeLessThan(0.3);
      }
      // Ties never count as decisive: decisive wins can never exceed non-ties.
      for (const stats of Object.values(report.categoryStats)) {
        expect(stats.decisiveWins).toBeLessThanOrEqual(stats.appearances - stats.ties);
      }

      // Match-length calibration guard at production starting HP (broad bounds).
      const medianRounds = [...report.roundsPerMatch].sort((a, b) => a - b)[Math.floor(report.matches / 2)];
      expect(medianRounds).toBeGreaterThanOrEqual(11);
      expect(medianRounds).toBeLessThanOrEqual(18);
      expect(report.exhaustedMatches / report.matches).toBeLessThan(0.1);
      const decided = report.outcomes.player + report.outcomes.bot;
      expect(report.outcomes.player / decided).toBeGreaterThan(0.35);
      expect(report.outcomes.player / decided).toBeLessThan(0.65);
      console.log(`\n[REAL ROSTER n=${deck.length}]\n${formatDiagnosticsReport(report)}\n\n${thresholdCandidateTable(report)}\n`);
    },
    180_000,
  );

  it(
    "runs 500 deterministic items-enabled matches on the live roster with zero violations",
    () => {
      const deck = rosterDeckFromResponse(payload);
      const seeds = Array.from({ length: 500 }, (_, i) => `stat-check-roster:${i}`);
      const report = runDiagnostics(deck, seeds, { items: true });
      expect(report.matchRecords.flatMap((m) => m.invariantIssues)).toEqual([]);
      expect(report.repeatedFamilyBoards).toBe(0);
      for (const match of report.matchRecords) {
        // A match that dies by HP exactly on a cadence round never reaches
        // that acquisition; every other path completes it before advancing.
        const hpEndedOnCadence = !match.exhausted && match.outcome !== null && match.rounds % 3 === 0;
        expect(match.itemChoicesCompleted).toBe(Math.floor(match.rounds / 3) + (hpEndedOnCadence ? 0 : 1));
      }
      for (const round of report.roundRecords) {
        expect(round.playerItemsUsed).toBeLessThanOrEqual(1);
        expect(round.botItemsUsed).toBeLessThanOrEqual(1);
      }
      const used = report.matchRecords.reduce((sum, m) => sum + m.playerItemsUsed + m.botItemsUsed, 0);
      expect(used).toBeGreaterThan(0);
      console.log(`\n[REAL ROSTER + ITEMS]\n${formatDiagnosticsReport(report)}\n`);
    },
    300_000,
  );

  it(
    "compares greedy versus clue-aware bot on mirrored seeds",
    () => {
      const deck = rosterDeckFromResponse(payload);
      const seeds = Array.from({ length: 500 }, (_, i) => `stat-check-roster:${i}`);
      const greedy = runDiagnostics(deck, seeds, { botUsesClue: false });
      const aware = runDiagnostics(deck, seeds, { botUsesClue: true });
      const summarize = (name: string, r: typeof greedy) => {
        const decided = r.outcomes.player + r.outcomes.bot;
        return (
          `${name}: botWin=${((r.outcomes.bot / decided) * 100).toFixed(1)}% (P/B/D ${r.outcomes.player}/${r.outcomes.bot}/${r.outcomes.draw}) ` +
          `rounds mean=${(r.totalRounds / r.matches).toFixed(1)} dmg/round bot=${(r.botDamageTotal / r.totalRounds).toFixed(2)} player=${(r.playerDamageTotal / r.totalRounds).toFixed(2)} ` +
          `botBoards=${r.boardResults.bot} sweeps=${r.sweeps}`
        );
      };
      const bot = aware.botClueStats;
      console.log(
        `\n[BOT STRATEGY COMPARISON]\n${summarize("greedy    ", greedy)}\n${summarize("clue-aware", aware)}\n` +
          `preservation: preservedBest=${bot.preservedBest}/${bot.cluedRounds} (${((bot.preservedBest / bot.cluedRounds) * 100).toFixed(1)}%) ` +
          `withSacrifice=${bot.sacrificedRounds} meanSacrifice=${(bot.sacrificeTotal / (bot.preservedBest || 1)).toFixed(3)} ` +
          `playedInCluedRound=${bot.playedInCluedRound}/${bot.preservedAndReachedNext}\n` +
          Object.entries(bot.perFamily)
            .sort((a, b) => b[1].clued - a[1].clued)
            .map(([family, s]) => `  ${family}: preserved ${((s.preserved / s.clued) * 100).toFixed(1)}% of ${s.clued}`)
            .join("\n") +
          "\n",
      );
      for (const report of [greedy, aware]) {
        expect(report.matchRecords.flatMap((m) => m.invariantIssues)).toEqual([]);
      }
      // The clue-aware bot preserves meaningfully but not constantly.
      expect(bot.preservedBest).toBeGreaterThan(0);
      expect(bot.preservedBest / bot.cluedRounds).toBeLessThan(0.9);
    },
    300_000,
  );

  it(
    "evaluates starting-HP candidates on the live roster",
    () => {
      const deck = rosterDeckFromResponse(payload);
      const seeds = Array.from({ length: 500 }, (_, i) => `stat-check-roster:${i}`);
      console.log(`\n${hpCandidateTable(deck, seeds, [16, 18, 20, 22, 24, 30])}\n`);
    },
    300_000,
  );
});
