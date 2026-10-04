/**
 * Real-corpus characterization: production patch reports 26.10–26.19 plus the
 * `champion_stats` rows of every champion with a Base Stats change, captured
 * read-only on 2026-10-03 (see ./fixtures/corpus.ts).
 *
 * AUTHORITATIVE BREAKDOWN under the final policy (family-scoped continuity):
 *
 *   53 Base Stats rows on Champions-section cards
 *     35 projected         = 11 Riot-only (5 compound lines + 6 same-card pairs)
 *                          + 24 using Mogzy current data (proven constant)
 *      3 parameter-only    = Bel'Veth AD 26.15 (unclassifiable Total Attack
 *                            Animation line in the same card), Locke 26.15
 *                            (null mogzy_entity_ref), LeBlanc AS growth 26.17
 *                            (attack-speed projection deferred)
 *     15 unavailable       = 13 null mogzy_property, 1 move speed (not a V1
 *                            property), 1 mechanical line
 *
 * Why not the handoff's "33 / 5 / 15": that dry run applied the entity-wide
 * refusal (any unmapped Base Stats line on the champion blocks everything).
 * Under the final family-scoped policy two of its five parameter-only rows
 * become provable — Brand 26.11 (only a LATER mana-regeneration line) and
 * Poppy 26.16 (only same-card Mana / Health Regeneration lines), neither of
 * which can touch AD or armor. 33 + 2 = 35; the other 5 − 2 = 3 stay
 * parameter-only. The test below reproduces the superseded 33 from the same
 * data, so the delta is proven rather than asserted.
 *
 * The handoff's other figure, "34 of 34", is not a projectable count: it is the
 * finding that today's live canonical value equals Riot's `after` for every
 * latest-change row. The replay below states it per changed half: 39 of 39.
 */
import { describe, expect, it } from "vitest";
import type { PatchReportCard, PatchReportChange } from "@/lib/patch-reports/api";
import { analyzeChampionStatChange } from "./analyze";
import { comparePatchVersions, isSameEntityCard } from "./continuity";
import { classifyChange, isBaseStatsGroup, isChampionsSectionChampionCard } from "./eligibility";
import { V1_PROPERTIES, propertyOf } from "./families";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "./fixtures/corpus";
import type { PatchImpactAnalysis } from "./types";

type Row = {
  version: string;
  card: PatchReportCard;
  change: PatchReportChange;
  analysis: PatchImpactAnalysis;
};

function analyzeAll(): Row[] {
  const rows: Row[] = [];
  for (const rep of CORPUS_REPORTS) {
    const later = CORPUS_REPORTS.filter((r) => comparePatchVersions(r.patch_version, rep.patch_version)! > 0);
    for (const card of rep.cards) {
      for (const change of card.changes) {
        rows.push({
          version: rep.patch_version,
          card,
          change,
          analysis: analyzeChampionStatChange({
            card,
            change,
            patchVersion: rep.patch_version,
            canonical: CORPUS_STATS,
            laterReports: later,
            laterVersionsExpected: CORPUS_VERSIONS,
            reconciliationByVersion: Object.fromEntries(
              CORPUS_REPORTS.map((r) => [r.patch_version, r.reconciliation?.status]),
            ),
          }),
        });
      }
    }
  }
  return rows;
}

const rows = analyzeAll();
const baseStatsRows = rows.filter(
  (r) => isChampionsSectionChampionCard(r.card) && isBaseStatsGroup(r.change),
);
const key = (r: Row) => `${r.version} ${r.card.entity_name} · ${r.change.property_name}`;
const outcome = (r: Row) =>
  r.analysis.status === "unavailable"
    ? `unavailable:${r.analysis.reason}`
    : r.analysis.status === "parameter_only"
      ? `parameter_only:${r.analysis.projectionUnavailable}`
      : "projected";

describe("real corpus 26.10–26.19", () => {
  it("has the audited shape", () => {
    expect(CORPUS_VERSIONS).toEqual(["26.10", "26.11", "26.12", "26.13", "26.14", "26.15", "26.16", "26.17", "26.18", "26.19"]);
    expect(baseStatsRows).toHaveLength(53);
    const champRows = rows.filter((r) => isChampionsSectionChampionCard(r.card));
    expect(champRows).toHaveLength(320);
    expect(champRows.filter((r) => r.change.change_kind === "numeric")).toHaveLength(303);
  });

  it("pins the authoritative 35 / 3 / 15 breakdown", () => {
    const tally = (pred: (r: Row) => boolean) => baseStatsRows.filter(pred).length;
    expect(tally((r) => r.analysis.status === "projected")).toBe(35);
    expect(tally((r) => r.analysis.status === "parameter_only")).toBe(3);
    expect(tally((r) => r.analysis.status === "unavailable")).toBe(15);
  });

  it("pins every parameter-only and unavailable line, with its reason", () => {
    const listed = baseStatsRows
      .filter((r) => r.analysis.status !== "projected")
      .map((r) => `${key(r)} → ${outcome(r)}`);
    expect(listed).toEqual([
      "26.11 Diana · Monster Damage → unavailable:property_unmapped",
      "26.13 Brand · Base Mana Regeneration → unavailable:property_unmapped",
      "26.15 Alistar · Move Speed → unavailable:property_unsupported",
      "26.15 Bel'Veth · Attack Speed → unavailable:property_unmapped",
      "26.15 Bel'Veth · Attack Speed Ratio → unavailable:property_unmapped",
      "26.15 Bel'Veth · Attack Damage → parameter_only:unclassified_base_stat_change",
      "26.15 Bel'Veth · Basic Attack Damage Modifier → unavailable:property_unmapped",
      "26.15 Bel'Veth · Attack Cast Time → unavailable:property_unmapped",
      "26.15 Bel'Veth · Total Attack Animation → unavailable:out_of_scope",
      "26.15 Bel'Veth · Model Size → unavailable:property_unmapped",
      "26.15 Locke · Health → parameter_only:identity_unresolved",
      "26.16 Camille · Mana → unavailable:property_unmapped",
      "26.16 Poppy · Health Regeneration → unavailable:property_unmapped",
      "26.16 Poppy · Mana → unavailable:property_unmapped",
      "26.17 LeBlanc · Attack Speed Ratio → unavailable:property_unmapped",
      "26.17 LeBlanc · Attack Speed Growth → parameter_only:projection_deferred",
      "26.17 Vayne · Health Regeneration → unavailable:property_unmapped",
      "26.17 Vayne · Attack Speed Ratio → unavailable:property_unmapped",
    ]);
  });

  it("splits the 35 projections into 11 Riot-only and 24 using Mogzy current data", () => {
    const projected = baseStatsRows.filter((r) => r.analysis.status === "projected");
    const usesMogzy = projected.filter(
      (r) => r.analysis.status === "projected" && r.analysis.projection.trust.usesMogzyData,
    );
    expect(projected.length - usesMogzy.length).toBe(11);
    expect(usesMogzy).toHaveLength(24);
    // The real data has no later change to any held companion.
    for (const r of usesMogzy) {
      if (r.analysis.status !== "projected") continue;
      const { baseBefore, growthBefore } = r.analysis.projection.inputs;
      expect([baseBefore.provenance, growthBefore.provenance]).not.toContain("riot_later_before");
    }
  });

  it("nothing outside the Champions Base Stats group is ever more than unavailable", () => {
    const outside = rows.filter((r) => !baseStatsRows.includes(r));
    expect(outside.length).toBeGreaterThan(250);
    for (const r of outside) expect(r.analysis.status).toBe("unavailable");
    // Including the two non-champion cards that carry a base-stat property.
    const classic = outside.filter((r) => r.card.section_title === "Classic");
    expect(classic.map((r) => r.card.entity_name).sort()).toEqual(["Heimerdinger", "Jarvan IV"]);
  });

  it("every projection is finite and has exactly 18 levels", () => {
    for (const r of rows) {
      if (r.analysis.status !== "projected") continue;
      expect(r.analysis.projection.levels).toHaveLength(18);
      for (const p of r.analysis.projection.levels) {
        for (const n of [p.before, p.after, p.absDelta]) expect(Number.isFinite(n)).toBe(true);
        if (p.relDelta !== null) expect(Number.isFinite(p.relDelta)).toBe(true);
      }
    }
  });

  it("reproduces the documented worked examples from real data", () => {
    const find = (version: string, name: string, label: string) => {
      const r = rows.find((x) => x.version === version && x.card.entity_name === name && x.change.property_name === label);
      if (!r || r.analysis.status !== "projected") throw new Error(`${version} ${name} ${label} not projected`);
      return r.analysis;
    };
    const leeSin = find("26.12", "Lee Sin", "AD Growth");
    expect(leeSin.projection.levels[17].before).toBeCloseTo(128.9, 6);
    expect(leeSin.projection.levels[17].absDelta).toBeCloseTo(-5.1, 6);
    const fiora = find("26.19", "Fiora", "Health Growth");
    expect(fiora.projection.levels[17].absDelta).toBeCloseTo(102, 6);
    const smolder = find("26.10", "Smolder", "Base AD");
    for (const p of smolder.projection.levels) expect(p.absDelta).toBeCloseTo(-2, 9);
    const vi = find("26.19", "Vi", "Attack Damage");
    expect(vi.projection.crossoverLevel).toBe(8);
    expect(vi.projection.trust.usesMogzyData).toBe(false);
    const belVethHealth = find("26.15", "Bel'Veth", "Health");
    expect(belVethHealth.projection.inputs.growthBefore).toEqual({ value: 105, provenance: "riot_same_card" });
    expect(belVethHealth.projection.inputs.growthAfter).toEqual({ value: 110, provenance: "riot_same_card" });
  });

  it("keeps Riot parameter facts for lines whose projection is unavailable", () => {
    const locke = rows.find((r) => r.card.entity_name === "Locke" && r.change.property_name === "Health");
    expect(locke?.analysis).toMatchObject({
      status: "parameter_only",
      facts: [{ property: "base_health", before: 655, after: 620 }],
    });
    const leblanc = rows.find((r) => r.card.entity_name === "LeBlanc" && r.change.property_name === "Attack Speed Growth");
    expect(leblanc?.analysis).toMatchObject({
      status: "parameter_only",
      facts: [{ unit: "percent_points", before: 2.35, after: 1.5 }],
    });
  });

  it("family-scoped policy: Brand 26.11 and Poppy 26.16 project; the entity-wide rule would have blocked them", () => {
    // Re-derive the superseded handoff rule from the same data: any Base Stats
    // line on the champion, in P's card or later, that is not a fully
    // understood supported line.
    const entityWideBlocked = (r: Row): boolean => {
      const ref = r.card.mogzy_entity_ref;
      if (!ref) return true;
      return CORPUS_REPORTS.filter((rep) => comparePatchVersions(rep.patch_version, r.version)! >= 0).some((rep) =>
        rep.cards.some(
          (c) =>
            (c === r.card || isSameEntityCard(c, ref, r.card.entity_name)) &&
            c.changes.some((ch) => {
              if (!isBaseStatsGroup(ch) || ch === r.change) return false;
              const e = classifyChange(c, ch);
              return e.ok === false && e.reason !== "no_parameter_change";
            }),
        ),
      );
    };
    const projected = baseStatsRows.filter((r) => r.analysis.status === "projected");
    const legacy = projected.filter(
      (r) =>
        r.analysis.status === "projected" &&
        (!r.analysis.projection.trust.usesMogzyData || !entityWideBlocked(r)),
    );
    expect(legacy).toHaveLength(33);
    const gained = projected.filter((r) => !legacy.includes(r)).map(key);
    expect(gained).toEqual(["26.11 Brand · Base Armor", "26.16 Poppy · Attack Damage"]);
  });

  it("replays the audit's latest-change check: live canonical equals Riot's `after`, 39 of 39 halves", () => {
    type Half = { version: string; ref: string; property: string; after: number };
    const halves: Half[] = [];
    for (const r of rows) {
      const e = classifyChange(r.card, r.change);
      if (!e.ok || !r.card.mogzy_entity_ref) continue;
      for (const half of e.line.moved) {
        halves.push({
          version: r.version,
          ref: r.card.mogzy_entity_ref,
          property: propertyOf(e.line.family, half)!,
          after: e.line.stated[half]!.after,
        });
      }
    }
    const latest = halves.filter(
      (h) =>
        !halves.some(
          (o) => o.ref === h.ref && o.property === h.property && comparePatchVersions(o.version, h.version)! > 0,
        ),
    );
    const matching = latest.filter((h) => {
      const row = CORPUS_STATS.find((s) => s.champion_name === h.ref);
      const column = V1_PROPERTIES[h.property as keyof typeof V1_PROPERTIES].column;
      const value = row ? (row as unknown as Record<string, number>)[column] : NaN;
      return Math.abs(value - h.after) < 1e-6;
    });
    expect(latest).toHaveLength(39);
    expect(matching).toHaveLength(39);
  });
});
