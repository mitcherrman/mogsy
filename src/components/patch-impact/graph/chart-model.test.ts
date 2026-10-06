import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalRow, championCard, statLine } from "@/lib/patch-impact/fixtures/builders";
import { analyzeChampionStatChange } from "@/lib/patch-impact/analyze";
import type { LevelPoint, PatchImpactAnalysis, StatProjection } from "@/lib/patch-impact/types";
import {
  buildImpactChartModel,
  chartYAxis,
  hasPlottableLevels,
  impactGraphEligibility,
} from "./chart-model";
import { corpusAnalysis, corpusProjection } from "./test-support";

const here = path.dirname(fileURLToPath(import.meta.url));

/** A hand-built projection whose numbers deliberately do NOT follow any stat curve. */
function arbitraryProjection(over: Partial<StatProjection> = {}): StatProjection {
  const levels: LevelPoint[] = Array.from({ length: 18 }, (_, i) => {
    const before = 100 + ((i * 7) % 5) * 13.37;
    const after = before + (i % 2 === 0 ? 4.25 : -3.5);
    return { level: i + 1, before, after, absDelta: 999 + i, relDelta: null, relDeltaUnavailableReason: null };
  });
  return {
    family: "ad",
    inputs: {
      baseBefore: { value: 1, provenance: "riot_line" },
      baseAfter: { value: 2, provenance: "riot_line" },
      growthBefore: { value: 3, provenance: "riot_line" },
      growthAfter: { value: 4, provenance: "riot_line" },
    },
    trust: { usesMogzyData: false, canonicalEntity: null, laterVersionsChecked: [] },
    levels,
    checkpoints: [1, 6, 11, 18],
    crossoverLevel: null,
    ...over,
  };
}

describe("graph eligibility", () => {
  it("accepts only PH2's projected verdict (Vi 26.19, Draven 26.19)", () => {
    for (const [entity, property] of [["Vi", "Attack Damage"], ["Draven", "Attack Damage"]] as const) {
      const verdict = impactGraphEligibility(corpusAnalysis("26.19", entity, property));
      expect(verdict.ok).toBe(true);
    }
  });

  it("refuses an unavailable Impact (Vi Passive Shield 12% → 10%)", () => {
    const analysis = corpusAnalysis("26.19", "Vi", "Shield");
    expect(analysis.status).toBe("unavailable");
    expect(impactGraphEligibility(analysis)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses parameter-only changes: LeBlanc attack-speed growth, and a Jhin-shaped attack-speed line", () => {
    const leblanc = corpusAnalysis("26.17", "LeBlanc", "Attack Speed Growth");
    expect(leblanc.status).toBe("parameter_only");
    expect(impactGraphEligibility(leblanc)).toEqual({ ok: false, reason: "parameter_only" });

    // The corpus has no Jhin line. The shape that matters is "attack speed", which PH2 never projects.
    const change = statLine("attack_speed_growth", "Attack Speed Growth", "2.5%", "2%");
    const jhin = analyzeChampionStatChange({
      card: championCard("Jhin", [change]),
      change,
      patchVersion: "26.12",
      canonical: [canonicalRow("Jhin")],
      laterReports: [],
      laterVersionsExpected: [],
    });
    expect(jhin.status).toBe("parameter_only");
    expect(impactGraphEligibility(jhin)).toEqual({ ok: false, reason: "parameter_only" });
  });

  it("refuses a parameter-only change whose projection could still load (history_incomplete)", () => {
    const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
    const analysis = analyzeChampionStatChange({
      card: championCard("Lee Sin", [change]),
      change,
      patchVersion: "26.12",
      canonical: null,
      laterReports: null,
      laterVersionsExpected: null,
    });
    expect(analysis).toMatchObject({ status: "parameter_only", projectionUnavailable: "history_incomplete" });
    expect(impactGraphEligibility(analysis).ok).toBe(false);
  });

  it("refuses null / undefined analyses and incomplete projections", () => {
    expect(impactGraphEligibility(null)).toEqual({ ok: false, reason: "no_analysis" });
    expect(impactGraphEligibility(undefined)).toEqual({ ok: false, reason: "no_analysis" });
    const short = arbitraryProjection({ levels: arbitraryProjection().levels.slice(0, 17) });
    const incomplete: PatchImpactAnalysis = { status: "projected", family: "ad", facts: [], projection: short };
    expect(impactGraphEligibility(incomplete)).toEqual({ ok: false, reason: "incomplete_levels" });
    expect(buildImpactChartModel(short)).toBeNull();
  });

  it("requires ordered L1..L18 rows with finite numbers", () => {
    const levels = arbitraryProjection().levels;
    expect(hasPlottableLevels(levels)).toBe(true);
    expect(hasPlottableLevels([...levels].reverse())).toBe(false);
    expect(hasPlottableLevels(levels.map((p, i) => (i === 5 ? { ...p, after: Number.NaN } : p)))).toBe(false);
    expect(hasPlottableLevels(levels.map((p, i) => (i === 5 ? { ...p, absDelta: Infinity } : p)))).toBe(false);
    expect(hasPlottableLevels(null)).toBe(false);
  });
});

describe("chart data is PH2's projection, field for field", () => {
  it("maps Vi 26.19 to 18 points equal to projection.levels", () => {
    const projection = corpusProjection("26.19", "Vi", "Attack Damage");
    const model = buildImpactChartModel(projection)!;
    expect(model.points).toHaveLength(18);
    model.points.forEach((point, i) => {
      const source = projection.levels[i];
      expect(point).toEqual({ level: source.level, before: source.before, after: source.after, absDelta: source.absDelta });
    });
    expect(model.points.map((p) => p.level)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it("maps Draven 26.19 (+2 base AD at every level)", () => {
    const projection = corpusProjection("26.19", "Draven", "Attack Damage");
    const model = buildImpactChartModel(projection)!;
    projection.levels.forEach((source, i) => {
      expect(model.points[i].before).toBe(source.before);
      expect(model.points[i].after).toBe(source.after);
      expect(model.points[i].absDelta).toBe(source.absDelta);
    });
    // Parallel lines: PH2's own delta is +2 at all 18 levels, and nothing is drawn as a crossover.
    for (const point of model.points) expect(point.absDelta).toBeCloseTo(2, 9);
    expect(model.crossoverLevel).toBeNull();
  });

  it("uses PH2's values even when they follow no stat curve (a recomputing chart would fail here)", () => {
    const projection = arbitraryProjection();
    const model = buildImpactChartModel(projection)!;
    model.points.forEach((point, i) => {
      expect(point.before).toBe(projection.levels[i].before);
      expect(point.after).toBe(projection.levels[i].after);
      // absDelta here is a deliberate lie (999 + i): the model carries PH2's number, it never recomputes after − before.
      expect(point.absDelta).toBe(999 + i);
    });
  });

  it("takes the checkpoints and the stat label from the projection", () => {
    const model = buildImpactChartModel(corpusProjection("26.19", "Vi", "Attack Damage"))!;
    expect(model.xTicks).toEqual([1, 6, 11, 18]);
    expect(model.statLabel).toBe("base AD");
  });
});

describe("crossover is PH2's, never recomputed", () => {
  it("Vi 26.19: crossover level 8, from the projection", () => {
    const projection = corpusProjection("26.19", "Vi", "Attack Damage");
    expect(projection.crossoverLevel).toBe(8);
    expect(buildImpactChartModel(projection)!.crossoverLevel).toBe(8);
  });

  it("follows the projection when PH2's crossover changes or goes away", () => {
    const vi = corpusProjection("26.19", "Vi", "Attack Damage");
    expect(buildImpactChartModel({ ...vi, crossoverLevel: 12 })!.crossoverLevel).toBe(12);
    expect(buildImpactChartModel({ ...vi, crossoverLevel: null })!.crossoverLevel).toBeNull();
  });

  it("does not invent a crossover from the values: crossing data with PH2 saying null stays null", () => {
    const levels = arbitraryProjection().levels; // after − before flips sign every level
    expect(buildImpactChartModel(arbitraryProjection({ levels, crossoverLevel: null }))!.crossoverLevel).toBeNull();
  });

  it("drops a crossover that names no plotted level", () => {
    const vi = corpusProjection("26.19", "Vi", "Attack Damage");
    expect(buildImpactChartModel({ ...vi, crossoverLevel: 40 })!.crossoverLevel).toBeNull();
  });
});

describe("y-axis policy", () => {
  const spanShare = (a: number, b: number, [lo, hi]: readonly [number, number] | readonly number[]) =>
    Math.abs(b - a) / (hi - lo);

  it("crops to the level curve with headroom for real curves (Vi), and says it does not start at 0", () => {
    const model = buildImpactChartModel(corpusProjection("26.19", "Vi", "Attack Damage"))!;
    const values = model.points.flatMap((p) => [p.before, p.after]);
    const [lo, hi] = model.y.domain;
    expect(lo).toBeLessThanOrEqual(Math.min(...values));
    expect(hi).toBeGreaterThanOrEqual(Math.max(...values));
    expect(model.y.fromZero).toBe(lo === 0);
    expect(model.y.ticks[0]).toBe(lo);
    expect(model.y.ticks[model.y.ticks.length - 1]).toBe(hi);
  });

  it("does not make Draven's +2 AD look large: it stays a few percent of the plot height", () => {
    const model = buildImpactChartModel(corpusProjection("26.19", "Draven", "Attack Damage"))!;
    for (const point of model.points) {
      expect(spanShare(point.before, point.after, model.y.domain)).toBeLessThan(0.05);
    }
  });

  it("anchors a near-flat curve at 0 so a small change cannot fill the plot", () => {
    // 60 → 62 at every level: a cropped axis would stretch +2 across the whole plot.
    const flat = Array.from({ length: 18 }, () => [60, 62]).flat();
    const axis = chartYAxis(flat);
    expect(axis.domain[0]).toBe(0);
    expect(axis.fromZero).toBe(true);
    expect(2 / (axis.domain[1] - axis.domain[0])).toBeLessThan(0.05);
  });

  it("crops (and does not anchor at 0) once the spread is a quarter of the top value or more", () => {
    const axis = chartYAxis([100, 120, 140]); // spread 40 of 140 = 29%
    expect(axis.domain[0]).toBeGreaterThan(0);
    expect(axis.fromZero).toBe(false);
  });

  it("never goes below 0 for non-negative values and keeps ticks aligned, few and clean", () => {
    for (const values of [[3, 40], [0, 1], [610, 2200], [0.1, 0.35], [55, 125]]) {
      const { domain, ticks } = chartYAxis(values);
      expect(domain[0]).toBeGreaterThanOrEqual(0);
      expect(domain[0]).toBeLessThanOrEqual(Math.min(...values));
      expect(domain[1]).toBeGreaterThanOrEqual(Math.max(...values));
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(7);
      expect(ticks[0]).toBe(domain[0]);
      expect(ticks[ticks.length - 1]).toBe(domain[1]);
      const steps = ticks.slice(1).map((t, i) => Number((t - ticks[i]).toFixed(9)));
      expect(new Set(steps).size).toBe(1);
      for (const tick of ticks) expect(String(tick).length).toBeLessThan(8);
    }
  });

  it("handles degenerate input", () => {
    expect(chartYAxis([]).domain).toEqual([0, 1]);
    expect(chartYAxis([0, 0]).domain).toEqual([0, 1]);
    expect(chartYAxis([7, 7]).domain[0]).toBe(0);
  });

  it("derives bounds from supplied values only (a different value set gives different bounds)", () => {
    expect(chartYAxis([10, 400]).domain[1]).toBeGreaterThanOrEqual(400);
    expect(chartYAxis([10, 40]).domain[1]).toBeLessThan(400);
  });
});

describe("authority boundary (source scan)", () => {
  const files = readdirSync(here).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.|test-support/.test(f));

  it("scans the three production files", () => {
    expect(files.sort()).toEqual(["PatchImpactGraph.tsx", "PatchImpactLevelChart.tsx", "chart-model.ts"]);
  });

  it("imports no stat math, analyzer, registry or League Docs code", () => {
    for (const file of files) {
      const source = readFileSync(path.join(here, file), "utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(/league-docs|patch-impact\/(math|analyze|companion|families|grammar|continuity|eligibility)/);
        expect(spec, `${file} imports ${spec}`).not.toMatch(/patch-impact-loader|usePatchImpactLoader/);
      }
      expect(source).not.toMatch(/\b(statAtLevel|riotLevelMultiplier|projectFlatLevels|projectAtLevel|crossoverLevel\(|relativeDelta)\b/);
      expect(source).not.toMatch(/0\.7025|0\.0175/);
    }
  });

  it("contains no champion-specific branches and never fetches", () => {
    for (const file of files) {
      const source = readFileSync(path.join(here, file), "utf8");
      expect(source).not.toMatch(/jhin|draven|\bvi\b/i);
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|useQuery|queryClient/);
    }
  });

  it("keeps recharts out of the eager shell (it is only imported by the lazy canvas)", () => {
    expect(readFileSync(path.join(here, "PatchImpactGraph.tsx"), "utf8")).not.toMatch(/from\s+["']recharts["']/);
    expect(readFileSync(path.join(here, "chart-model.ts"), "utf8")).not.toMatch(/from\s+["']recharts["']/);
    expect(readFileSync(path.join(here, "PatchImpactGraph.tsx"), "utf8")).toMatch(/lazy\(\(\) => import\("\.\/PatchImpactLevelChart"\)\)/);
  });
});
