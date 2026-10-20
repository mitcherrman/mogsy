import { describe, expect, it } from "vitest";
import type { PatchReportCard, PatchReportDetail } from "@/lib/patch-reports/api";
import { CORPUS_REPORTS } from "@/lib/patch-impact/fixtures/corpus";
import report2620 from "./fixtures/report-26.20.json";
import { earlierVersions, entityHistory, matchesSubject } from "./history";

const detail = report2620 as unknown as PatchReportDetail;
const reports = Object.values(CORPUS_REPORTS) as PatchReportDetail[];
const card = (name: string, section: string) =>
  detail.cards.find((c) => c.entity_name === name && c.section_title === section) as PatchReportCard;

describe("entity history over the frozen 26.10–26.19 corpus", () => {
  it("orders earlier versions newest first and ignores the current and later ones", () => {
    const versions = ["26.10", "26.20", "26.19", "26.18", "bogus"];
    expect(earlierVersions(versions, "26.20")).toEqual(["26.19", "26.18", "26.10"]);
    expect(earlierVersions(versions, "26.10")).toEqual([]);
    expect(earlierVersions(versions, "nope")).toEqual([]);
  });

  it("finds Cassiopeia's earlier Summoner's Rift entries (Riot: 'our changes two patches ago')", () => {
    const history = entityHistory(card("Cassiopeia", "Champions"), reports, "26.20");
    expect(history.length).toBeGreaterThan(0);
    expect(history.map((h) => h.patchVersion)).toContain("26.18");
    expect(history.every((h) => h.sectionTitle === "Champions")).toBe(true);
    const versions = history.map((h) => h.patchVersion);
    expect(versions).toEqual([...versions].sort().reverse());
  });

  it("never matches a champion's mode card to its Summoner's Rift history", () => {
    const sr = card("K'Sante", "Champions");
    const mayhem = card("K'Sante", "ARAM: Mayhem");
    expect(matchesSubject(sr, mayhem)).toBe(false);
    expect(matchesSubject(mayhem, sr)).toBe(false);
    expect(matchesSubject(sr, sr)).toBe(true);
    const mayhemHistory = entityHistory(mayhem, reports, "26.20");
    expect(mayhemHistory.every((h) => h.sectionTitle === "ARAM: Mayhem")).toBe(true);
  });

  it("matches items by catalog ref or name within the Items section", () => {
    const rocketbelt = card("Hextech Rocketbelt", "Items");
    const history = entityHistory(rocketbelt, reports, "26.20");
    expect(history.every((h) => h.entity.card.entity_type === "item" && h.sectionTitle === "Items")).toBe(true);
  });

  it("excludes the current version and anything after it", () => {
    const history = entityHistory(card("Swain", "Champions"), [...reports, detail], "26.19");
    expect(history.map((h) => h.patchVersion)).not.toContain("26.19");
    expect(history.map((h) => h.patchVersion)).not.toContain("26.20");
  });
});
