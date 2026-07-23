import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ChampionBaseStats } from "@/lib/league-docs/api";
import { ACTIVE_STAT_CATEGORIES, STAT_CATEGORIES } from "../statCheckEngine";
import { parseChampionStatsResponse, rosterDeckFromResponse } from "./rosterAdapter";
import { formatDiagnosticsReport, runDiagnostics } from "./simulation";

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
      console.log(`\n[REAL ROSTER n=${deck.length}]\n${formatDiagnosticsReport(report)}\n`);
    },
    180_000,
  );
});
