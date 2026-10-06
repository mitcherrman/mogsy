/** Test harness for the Patch Impact level graph (not production code). */
import { vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { analyzeChampionStatChange } from "@/lib/patch-impact/analyze";
import { comparePatchVersions } from "@/lib/patch-impact/continuity";
import { isBaseStatsGroup, isChampionsSectionChampionCard } from "@/lib/patch-impact/eligibility";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import type { PatchImpactAnalysis, StatProjection } from "@/lib/patch-impact/types";
import { buildPatchReportStructure } from "@/lib/patch-reports/report-structure";
import type { PatchReportChangeContext } from "@/components/patch-reports/PatchReportEntrySlots";

export type CorpusRow = { ctx: PatchReportChangeContext; patchVersion: string };

/** A Base Stats row of the frozen production corpus, found by patch, champion and Riot's label. */
export function corpusRow(version: string, entityName: string, propertyName: string): CorpusRow {
  const report = CORPUS_REPORTS.find((r) => r.patch_version === version);
  if (!report) throw new Error(`no corpus report ${version}`);
  for (const section of buildPatchReportStructure(report).sections) {
    for (const entity of section.entities) {
      if (!isChampionsSectionChampionCard(entity.card) || entity.card.entity_name !== entityName) continue;
      for (const group of entity.groups) {
        for (const node of group.changes) {
          if (isBaseStatsGroup(node.change) && node.change.property_name === propertyName) {
            return { ctx: { entity, group, node, change: node.change }, patchVersion: version };
          }
        }
      }
    }
  }
  throw new Error(`no corpus row ${version} ${entityName} ${propertyName}`);
}

/** PH2's real verdict for any corpus line (Base Stats or not), exactly as the production analyzer computes it. */
export function corpusAnalysis(version: string, entityName: string, propertyName: string): PatchImpactAnalysis {
  const report = CORPUS_REPORTS.find((r) => r.patch_version === version);
  const card = report?.cards.find((c) => c.entity_name === entityName && c.changes.some((ch) => ch.property_name === propertyName));
  const change = card?.changes.find((ch) => ch.property_name === propertyName);
  if (!card || !change) throw new Error(`no corpus line ${version} ${entityName} ${propertyName}`);
  const later = CORPUS_REPORTS.filter((r) => comparePatchVersions(r.patch_version, version)! > 0);
  return analyzeChampionStatChange({
    card,
    change,
    patchVersion: version,
    canonical: CORPUS_STATS,
    laterReports: later,
    laterVersionsExpected: CORPUS_VERSIONS,
    reconciliationByVersion: Object.fromEntries(CORPUS_REPORTS.map((r) => [r.patch_version, r.reconciliation?.status])),
  });
}

export function corpusProjection(version: string, entityName: string, propertyName: string): StatProjection {
  const analysis = corpusAnalysis(version, entityName, propertyName);
  if (analysis.status !== "projected") throw new Error(`${entityName} ${propertyName} is ${analysis.status}`);
  return analysis.projection;
}

/** jsdom has no layout: give the chart canvas a width so recharts draws, and nothing else one. */
export function stubChartWidth(width: number) {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const w = this.dataset.testid === "patch-impact-graph-canvas" ? width : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: w, bottom: 0, width: w, height: 0, toJSON: () => ({}) } as DOMRect;
    });
}

/** A pointer event with the page coordinates recharts reads (jsdom MouseEvent has no `pageX`). */
export function pointerOn(element: Element, type: "mousemove" | "click", x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pageX", { value: x });
  Object.defineProperty(event, "pageY", { value: y });
  fireEvent(element, event);
}
