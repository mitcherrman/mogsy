/**
 * The integration wiring against the frozen real corpus (production reports
 * 26.10–26.19): every Base Stats row goes through the SAME path as the page
 * (buildPatchReportStructure → changeAnalysis ctx → PatchImpactChangeAnalysis →
 * loader → PatchImpact), every offered Explore is opened, and the rendered
 * verdicts must be exactly the PH2-A contract: 35 projected / 3 parameter-only
 * / 15 unavailable. Wiring may never reclassify a row.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import { isBaseStatsGroup, isChampionsSectionChampionCard } from "@/lib/patch-impact/eligibility";
import { buildPatchReportStructure } from "@/lib/patch-reports/report-structure";
import type { PatchReportChangeContext } from "@/components/patch-reports/PatchReportEntrySlots";
import { LIST_PATH, STATS_PATH, callsTo, createBackend, installFetch, reportPath } from "@/lib/patch-impact-loader/test-support";
import { PatchImpactChangeAnalysis } from "./PatchImpactChangeAnalysis";

afterEach(() => vi.unstubAllGlobals());

type Row = { key: string; ctx: PatchReportChangeContext; patchVersion: string };

function baseStatRows(): Row[] {
  const rows: Row[] = [];
  for (const rep of CORPUS_REPORTS) {
    for (const section of buildPatchReportStructure(rep).sections) {
      for (const entity of section.entities) {
        if (!isChampionsSectionChampionCard(entity.card)) continue;
        for (const group of entity.groups) {
          for (const node of group.changes) {
            if (!isBaseStatsGroup(node.change)) continue;
            rows.push({
              key: `${rep.patch_version}|${node.anchor}`,
              ctx: { entity, group, node, change: node.change },
              patchVersion: rep.patch_version,
            });
          }
        }
      }
    }
  }
  return rows;
}

describe("real corpus 26.10–26.19 through the Patch Report wiring", () => {
  it("renders exactly 35 projected / 3 parameter-only / 15 unavailable, with one shared load", async () => {
    const backend = createBackend(CORPUS_REPORTS, CORPUS_STATS, [...CORPUS_VERSIONS].reverse());
    installFetch(backend);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const rows = baseStatRows();
    expect(rows).toHaveLength(53);

    render(
      <QueryClientProvider client={client}>
        {rows.map((row) => (
          <div key={row.key} data-testid="corpus-row" data-row={row.key}>
            <PatchImpactChangeAnalysis ctx={row.ctx} patchVersion={row.patchVersion} />
          </div>
        ))}
      </QueryClientProvider>,
    );

    // Mounting all 53 rows fetches nothing.
    expect(backend.calls.size).toBe(0);

    const loadable = screen
      .getAllByTestId("patch-impact")
      .filter((el) => el.getAttribute("data-impact-reason") === "history_incomplete");
    for (const el of loadable) fireEvent.click(within(el).getByTestId("patch-impact-explore-toggle"));

    await waitFor(
      () =>
        expect(
          screen
            .getAllByTestId("patch-impact")
            .filter((el) => el.getAttribute("data-impact-reason") === "history_incomplete"),
        ).toHaveLength(0),
      { timeout: 10_000 },
    );

    const byStatus = { projected: 0, parameter_only: 0, unavailable: 0 };
    for (const row of screen.getAllByTestId("corpus-row")) {
      const impact = within(row).queryByTestId("patch-impact");
      const status = impact?.getAttribute("data-impact-status") ?? "unavailable";
      byStatus[status as keyof typeof byStatus]++;
    }
    expect(byStatus).toEqual({ projected: 35, parameter_only: 3, unavailable: 15 });

    // Every Explore that needed evidence shared one list, one stats table, each report at most once.
    expect(callsTo(backend, LIST_PATH)).toBe(1);
    expect(callsTo(backend, STATS_PATH)).toBe(1);
    for (const version of CORPUS_VERSIONS) {
      expect(callsTo(backend, reportPath(version))).toBeLessThanOrEqual(1);
    }
  });
});
