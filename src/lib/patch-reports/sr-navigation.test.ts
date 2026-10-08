import { describe, expect, it } from "vitest";
import { CORPUS_REPORTS } from "@/lib/patch-impact/fixtures/corpus";
import type { PatchReportCard } from "./api";
import {
  PATCH_HUB_TOP_ANCHOR,
  activeSrAnchor,
  buildSrNavGroups,
  isCondensedNavStuck,
  isMainGameSection,
  srNavAnchors,
  type MeasuredBox,
} from "./sr-navigation";
import { buildPatchReportStructure, filterReportStructure } from "./report-structure";
import { SR_CARDS, srCard, srDetail } from "./sr-test-fixtures";

const card = srCard;
const sections = (cards: PatchReportCard[] = SR_CARDS) => buildPatchReportStructure(srDetail(cards)).sections;

describe("isMainGameSection", () => {
  it.each([
    ["Champions", true],
    ["Items", true],
    ["Runes", true],
    ["Systems", true],
    ["Game Systems", true],
    ["Arena", false],
    ["Classic", false],
    ["ARAM: Mayhem", false],
    ["Team Voice", false],
  ])("%s -> %s", (title, expected) => {
    expect(isMainGameSection({ title })).toBe(expected);
  });
});

describe("buildSrNavGroups", () => {
  it("keeps only Summoner's Rift sections, in official order", () => {
    const groups = buildSrNavGroups(sections());
    expect(groups.map((g) => g.section.label)).toEqual(["Champions", "Items", "Runes", "Systems"]);
  });

  it("never lists Arena or ARAM: Mayhem", () => {
    const labels = buildSrNavGroups(sections()).map((g) => g.section.label);
    expect(labels.join()).not.toMatch(/Arena|ARAM/);
  });

  it("Champions carries Buffs / Nerfs / Adjustments with their counts; the other sections carry no buckets", () => {
    const [champions, items, , systems] = buildSrNavGroups(sections());
    expect(champions.buckets.map((b) => `${b.label} ${b.count}`)).toEqual(["Buffs 1", "Nerfs 2", "Adjustments 1"]);
    expect(items.buckets).toEqual([]);
    expect(systems.buckets).toEqual([]);
  });

  it("every destination anchor is the structure's own anchor", () => {
    const s = sections();
    const groups = buildSrNavGroups(s);
    const champions = s.find((x) => x.title === "Champions")!;
    expect(groups[0].section.anchor).toBe(champions.anchor);
    expect(groups[0].buckets.map((b) => b.anchor)).toEqual(champions.directionBuckets!.map((b) => b.anchor));
    expect(new Set(srNavAnchors(groups)).size).toBe(srNavAnchors(groups).length);
  });

  it("omits a section the filter removed, and a bucket with no entries left", () => {
    const s = buildPatchReportStructure(srDetail());
    const keep = new Set(s.sections.flatMap((x) => x.entities.map((e) => e.card)).filter((c) => c.entity_name === "Zed"));
    const groups = buildSrNavGroups(filterReportStructure(s, keep).sections);
    expect(groups.map((g) => g.section.label)).toEqual(["Champions"]);
    expect(groups[0].buckets.map((b) => `${b.label} ${b.count}`)).toEqual(["Nerfs 1"]);
  });

  it("is empty when no main-game section survives", () => {
    const s = buildPatchReportStructure(srDetail());
    const keep = new Set(s.sections.flatMap((x) => x.entities.map((e) => e.card)).filter((c) => c.section_title === "Arena"));
    expect(buildSrNavGroups(filterReportStructure(s, keep).sections)).toEqual([]);
  });

  it("a champions section with no editorial direction has no buckets (only the Champions link)", () => {
    const groups = buildSrNavGroups(sections([card("Ahri", "Champions")]));
    expect(groups).toHaveLength(1);
    expect(groups[0].buckets).toEqual([]);
  });

  it("maps a null-direction champion to an Other bucket", () => {
    const groups = buildSrNavGroups(
      sections([
        card("Ahri", "Champions", { editorial_direction: "buff", editorial_direction_source: "riot_patch_highlights" }),
        card("Kai", "Champions"),
      ]),
    );
    expect(groups[0].buckets.map((b) => b.label)).toEqual(["Buffs", "Other"]);
  });

  it("builds from every frozen real report without throwing and always leads with Champions", () => {
    for (const report of CORPUS_REPORTS) {
      const groups = buildSrNavGroups(buildPatchReportStructure(report).sections);
      expect(groups[0]?.section.label).toBe("Champions");
    }
  });
});

describe("activeSrAnchor", () => {
  const groups = buildSrNavGroups(sections());
  const [champions, items, runes, systems] = groups;
  const box = (anchor: string, top: number, bottom: number): [string, MeasuredBox] => [anchor, { anchor, top, bottom }];
  const boxes = (...entries: Array<[string, MeasuredBox]>) => new Map(entries);

  it("prefers the bucket over its section", () => {
    const nerfs = champions.buckets[1].anchor;
    const m = boxes(box(champions.section.anchor, -500, 900), box(nerfs, 100, 400));
    expect(activeSrAnchor(groups, m, 200)).toBe(nerfs);
  });

  it("falls back to the section when no bucket spans the probe", () => {
    const m = boxes(box(champions.section.anchor, -500, 900), box(champions.buckets[0].anchor, -400, 50));
    expect(activeSrAnchor(groups, m, 200)).toBe(champions.section.anchor);
  });

  it("selects Items, Runes and Systems by their own boxes", () => {
    expect(activeSrAnchor(groups, boxes(box(items.section.anchor, 0, 500)), 200)).toBe(items.section.anchor);
    expect(activeSrAnchor(groups, boxes(box(runes.section.anchor, 0, 500)), 200)).toBe(runes.section.anchor);
    expect(activeSrAnchor(groups, boxes(box(systems.section.anchor, 0, 500)), 200)).toBe(systems.section.anchor);
  });

  it("is null when the reader is outside every main-game section (Arena after Systems)", () => {
    const m = boxes(box(systems.section.anchor, -900, 100));
    expect(activeSrAnchor(groups, m, 200)).toBeNull();
  });

  it("is null before the first section, and when nothing is measured", () => {
    expect(activeSrAnchor(groups, boxes(box(champions.section.anchor, 400, 900)), 200)).toBeNull();
    expect(activeSrAnchor(groups, new Map(), 200)).toBeNull();
  });

  it("the probe line is half-open: a box that ends exactly on it no longer owns it", () => {
    const m = boxes(box(champions.section.anchor, 0, 200));
    expect(activeSrAnchor(groups, m, 200)).toBeNull();
    expect(activeSrAnchor(groups, boxes(box(champions.section.anchor, 200, 400)), 200)).toBe(champions.section.anchor);
  });
});

describe("isCondensedNavStuck", () => {
  it("is false while the holder is in flow with its sentinel", () => {
    expect(isCondensedNavStuck(640, 640)).toBe(false);
  });
  it("ignores sub-pixel layout rounding", () => {
    expect(isCondensedNavStuck(100, 100.4)).toBe(false);
  });
  it("is true once the sentinel has scrolled above the stuck holder", () => {
    expect(isCondensedNavStuck(-300, 62)).toBe(true);
  });
});

describe("constants", () => {
  it("the Top destination is the masthead's anchor", () => {
    expect(PATCH_HUB_TOP_ANCHOR).toBe("patch-hub");
  });
});
