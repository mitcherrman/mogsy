/**
 * The loader against the frozen real corpus (production reports 26.10–26.19):
 * for every Base Stats line, "load through the shared cache, then analyse" must
 * give exactly the analysis PH2-A gives when handed the same evidence by hand,
 * and the whole sweep must cost one list, one stats table and each report once.
 */
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeChampionStatChange, comparePatchVersions } from "@/lib/patch-impact";
import { isBaseStatsGroup, isChampionsSectionChampionCard } from "@/lib/patch-impact/eligibility";
import { CORPUS_REPORTS, CORPUS_STATS, CORPUS_VERSIONS } from "@/lib/patch-impact/fixtures/corpus";
import { analyzeImmediate, analyzeWithEvidence, needsImpactEvidence } from "./analysis";
import { loadImpactEvidence } from "./evidence";
import { LIST_PATH, STATS_PATH, callsTo, createBackend, installFetch, reportPath } from "./test-support";

afterEach(() => vi.unstubAllGlobals());

describe("real corpus 26.10–26.19 through the loader", () => {
  it("matches hand-fed PH2-A for all 53 Base Stats rows, sharing one load across them", async () => {
    // The API lists newest first; nothing in the loader may depend on that.
    const backend = createBackend(CORPUS_REPORTS, CORPUS_STATS, [...CORPUS_VERSIONS].reverse());
    installFetch(backend);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

    let rows = 0;
    let loaded = 0;
    let riotOnly = 0;
    for (const rep of CORPUS_REPORTS) {
      for (const card of rep.cards) {
        if (!isChampionsSectionChampionCard(card)) continue;
        for (const change of card.changes) {
          if (!isBaseStatsGroup(change)) continue;
          rows++;
          const subject = { card, change, patchVersion: rep.patch_version };
          const immediate = analyzeImmediate(subject);

          let actual = immediate;
          if (needsImpactEvidence(immediate)) {
            loaded++;
            const evidence = await loadImpactEvidence(client, rep.patch_version);
            const enriched = analyzeWithEvidence(subject, evidence);
            expect(enriched).not.toBeNull();
            actual = enriched!;
          } else if (immediate.status === "projected") {
            riotOnly++;
          }

          const expected = analyzeChampionStatChange({
            ...subject,
            canonical: CORPUS_STATS,
            laterReports: CORPUS_REPORTS.filter(
              (r) => (comparePatchVersions(r.patch_version, rep.patch_version) ?? 0) > 0,
            ),
            laterVersionsExpected: CORPUS_VERSIONS,
            reconciliationByVersion: Object.fromEntries(
              CORPUS_REPORTS.map((r) => [r.patch_version, r.reconciliation?.status]),
            ),
          });
          expect(actual, `${rep.patch_version} ${card.entity_name} · ${change.property_name}`).toEqual(expected);
        }
      }
    }

    expect(rows).toBe(53);
    expect(riotOnly).toBe(11); // the 11 Riot-only projections need nothing and fetch nothing
    expect(loaded).toBeGreaterThan(0);

    // The whole sweep: one list, one stats table, each report at most once.
    expect(callsTo(backend, LIST_PATH)).toBe(1);
    expect(callsTo(backend, STATS_PATH)).toBe(1);
    for (const version of CORPUS_VERSIONS) {
      expect(callsTo(backend, reportPath(version))).toBeLessThanOrEqual(1);
    }
  });
});
