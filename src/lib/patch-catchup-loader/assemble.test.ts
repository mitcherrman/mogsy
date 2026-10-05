import { beforeEach, describe, expect, it, vi } from "vitest";

// Pass-through spy so tests can read exactly what the domain was given.
vi.mock("@/lib/patch-catchup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/patch-catchup")>();
  return { ...actual, buildCatchUpReport: vi.fn(actual.buildCatchUpReport) };
});

import { buildCatchUpReport } from "@/lib/patch-catchup";
import {
  CORPUS_VERSIONS,
  championCard,
  corpusReports,
  report as makeReport,
  statLine,
} from "@/lib/patch-catchup/test-support";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import {
  assembleCatchUp,
  dedupeReportsByPatch,
  reportProblem,
  reportsAgree,
  type ReportEntry,
} from "./assemble";
import { planCatchUpRange } from "./plan";

const spy = vi.mocked(buildCatchUpReport);
beforeEach(() => {
  spy.mockClear();
});

/* ------------------------------ helpers ----------------------------------- */

/** Built once: card ids are allocated per build, so direct comparisons must share objects. */
const CORPUS = new Map(corpusReports().map((r) => [r.patch_version, r]));
const cachedCorpusReport = (version: string) => CORPUS.get(version)!;
const LISTING = [...CORPUS_VERSIONS].reverse(); // the index lists newest first
const index = (versions: readonly string[]) => ({ patches: versions.map((patch_version) => ({ patch_version })) });

function planOf(since: string, through: string | null = "26.19", listing: readonly string[] = LISTING) {
  const plan = planCatchUpRange(index(listing), since, through);
  if (plan.ok === false) throw new Error(`plan failed: ${plan.failure.code}`);
  return plan;
}

/** Entries for a plan; `override` replaces what the cache holds for a version. */
function entriesFor(
  plan: ReturnType<typeof planOf>,
  override: Record<string, Partial<ReportEntry> | "failed" | "pending"> = {},
  source: (version: string) => unknown = cachedCorpusReport,
): ReportEntry[] {
  return plan.versions.map((version) => {
    const o = override[version];
    const base: ReportEntry = { version, data: source(version), failed: false, errorMessage: null };
    if (o === "failed") return { ...base, data: undefined, failed: true, errorMessage: "boom" };
    if (o === "pending") return { ...base, data: undefined };
    return { ...base, ...o };
  });
}

function built(plan: ReturnType<typeof planOf>, entries: ReportEntry[]) {
  const assembly = assembleCatchUp(plan, entries);
  if (!assembly.report) throw new Error(`no report: ${assembly.failure?.code ?? "pending"}`);
  return { assembly, report: assembly.report };
}

const FIVE_IDENTITIES = [
  `["sr.champions","bel'veth",null,"base stats","health growth"]`,
  `["sr.champions","mordekaiser","R","r - realm of death","stat steal"]`,
  `["sr.champions","sylas","Q","q - chain lash","initial damage"]`,
  `["sr.items","doran's helm",null,"","health"]`,
  `["sr.items","sundered sky",null,"","health"]`,
];

/* --------------------------- full-corpus result --------------------------- */

describe("complete 26.10–26.19 corpus", () => {
  const plan = planOf("26.9");

  it("requests every listed patch up to 26.19 and nothing else", () => {
    expect(plan.versions).toEqual(CORPUS_VERSIONS);
  });

  it("is ready: every Riot line exactly once and exactly the five PH3-B chains", () => {
    const { assembly, report } = built(plan, entriesFor(plan));
    expect(assembly.issues).toEqual([]);
    expect(report.coverage.complete).toBe(true);
    expect(report.totals.riotLines).toBe(1775);
    expect(report.continuity.status).toBe("available");
    expect(report.continuity.chains.map((c) => c.identity).sort()).toEqual([...FIVE_IDENTITIES].sort());
    expect(report.continuity.unclassified).toEqual([]);
  });

  it("equals what PH3-B returns when handed the same reports directly (nothing reinterpreted)", () => {
    const { report } = built(plan, entriesFor(plan));
    const direct = buildCatchUpReport({
      reports: CORPUS_VERSIONS.map(cachedCorpusReport),
      sincePatch: "26.9",
      throughPatch: "26.19",
      listedVersions: plan.listedVersions,
    });
    expect(direct.ok).toBe(true);
    if (direct.ok === false) return;
    expect(report).toEqual(direct.report);
  });

  it("since 26.10 (X excluded) yields the 26.11–26.19 lines only", () => {
    const p = planOf("26.10");
    const { report } = built(p, entriesFor(p));
    expect(report.includedPatches).toEqual(CORPUS_VERSIONS.slice(1));
    expect(report.totals.riotLines).toBe(1619);
    expect(report.lines.some((l) => l.patch === "26.10")).toBe(false);
  });
});

describe("what PH3-B is handed", () => {
  const plan = planOf("26.9");

  it("every loaded report exactly once, as the very objects the cache holds, with the full listing", () => {
    const entries = entriesFor(plan);
    built(plan, entries);
    expect(spy).toHaveBeenCalledTimes(1);
    const input = spy.mock.calls[0][0];
    expect(input.reports.map((r) => r.patch_version)).toEqual(CORPUS_VERSIONS);
    expect(new Set(input.reports.map((r) => r.patch_version)).size).toBe(input.reports.length);
    input.reports.forEach((r, i) => expect(r).toBe(entries[i].data));
    expect(input.listedVersions).toEqual(plan.listedVersions);
    expect(input).toMatchObject({ sincePatch: "26.9", throughPatch: "26.19" });
    // No aliases override: the domain's reviewed registry stays authoritative.
    expect(input).not.toHaveProperty("aliases");
  });

  it("is never filtered down to chainable cards: Systems / Support Adjustments lines survive", () => {
    const { report } = built(plan, entriesFor(plan));
    const nonChainable = report.sections.filter((s) => !s.chainable);
    expect(nonChainable.length).toBeGreaterThan(0);
    expect(report.lines.filter((l) => l.eligibility.status === "out_of_scope").length).toBe(1399);
  });

  it("is withheld while any requested report has never produced a result", () => {
    const assembly = assembleCatchUp(plan, entriesFor(plan, { "26.14": "pending" }));
    expect(assembly.report).toBeNull();
    expect(assembly.failure).toBeNull();
    expect(assembly.pending).toEqual(["26.14"]);
    expect(spy).not.toHaveBeenCalled();
  });
});

/* -------------------------- partial / failed reports ---------------------- */

describe("a missing report is incomplete coverage, never a repaired chain", () => {
  it("one failed report: its patch is absent from the input, the listing stays full, continuity is withheld", () => {
    const plan = planOf("26.9");
    const { assembly, report } = built(plan, entriesFor(plan, { "26.14": "failed" }));

    const input = spy.mock.calls[0][0];
    expect(input.reports.map((r) => r.patch_version)).not.toContain("26.14");
    expect(input.listedVersions).toContain("26.14");

    expect(assembly.issues).toEqual([
      { kind: "report_request_failed", version: "26.14", message: "boom" },
    ]);
    expect(assembly.retryableVersions).toEqual(["26.14"]);
    expect(report.coverage.complete).toBe(false);
    expect(report.coverage.missingPatches).toEqual(["26.14"]);
    expect(report.continuity.status).toBe("withheld");
    expect(report.continuity.chains).toEqual([]);
    // Riot lines for every loaded patch are all still there.
    expect(report.totals.riotLines).toBe(1775 - 98);
    expect(report.lines.some((l) => l.patch === "26.14")).toBe(false);
    expect(assembly.resources.find((r) => r.version === "26.14")?.status).toBe("failed");
  });

  it("no chain is ever produced when ANY patch in the range is missing — every single-patch loss", () => {
    const plan = planOf("26.9");
    const full = built(plan, entriesFor(plan)).report;
    for (const version of CORPUS_VERSIONS) {
      const { report } = built(plan, entriesFor(plan, { [version]: "failed" }));
      expect(report.continuity.status, version).toBe("withheld");
      expect(report.continuity.chains, version).toEqual([]);
      expect(report.coverage.missingPatches, version).toEqual([version]);
      expect(report.totals.riotLines, version).toBe(
        full.totals.riotLines - full.lines.filter((l) => l.patch === version).length,
      );
    }
  });

  it("a chain that needs a missing intermediate patch is not shown even when both endpoints loaded", () => {
    // Sundered Sky: 26.16 + 26.17 are adjacent endpoints; lose 26.17 and the chain must vanish.
    const plan = planOf("26.15");
    const { report } = built(plan, entriesFor(plan, { "26.17": "failed" }));
    expect(report.continuity.chains.some((c) => c.entityName === "Sundered Sky")).toBe(false);
    expect(report.continuity.chains).toEqual([]);
  });

  it("a failed through patch is incomplete too (it stays expected)", () => {
    const plan = planOf("26.17");
    const { report } = built(plan, entriesFor(plan, { "26.19": "failed" }));
    expect(report.coverage.missingPatches).toEqual(["26.19"]);
    expect(report.continuity.status).toBe("withheld");
    expect(report.includedPatches).toEqual(["26.18"]);
  });

  it("every report failed → reports_unavailable, no report (never a '0 changes' answer)", () => {
    const plan = planOf("26.16");
    const assembly = assembleCatchUp(plan, entriesFor(plan, { "26.17": "failed", "26.18": "failed", "26.19": "failed" }));
    expect(assembly.report).toBeNull();
    expect(assembly.failure).toMatchObject({
      code: "reports_unavailable",
      versions: ["26.17", "26.18", "26.19"],
    });
    expect(assembly.retryableVersions).toEqual(["26.17", "26.18", "26.19"]);
  });

  it("a through patch the index does not list is not requested and is reported, with the rest incomplete", () => {
    const plan = planOf("26.17", "26.25");
    expect(plan.versions).toEqual(["26.18", "26.19"]);
    const { assembly, report } = built(plan, entriesFor(plan));
    expect(assembly.issues).toEqual([
      expect.objectContaining({ kind: "through_not_listed", version: "26.25" }),
    ]);
    expect(report.coverage.missingPatches).toContain("26.25");
    expect(report.continuity.status).toBe("withheld");
  });

  it("nothing listed in range and not up to date → reports_unavailable", () => {
    const plan = planOf("26.19", "26.25");
    expect(plan.versions).toEqual([]);
    expect(assembleCatchUp(plan, []).failure).toMatchObject({ code: "reports_unavailable", versions: ["26.25"] });
  });

  it("up to date: no reports, a ready report with no lines", () => {
    const plan = planOf("26.19", "26.19");
    const { assembly, report } = built(plan, []);
    expect(assembly.issues).toEqual([]);
    expect(report.range.status).toBe("up_to_date");
    expect(report.totals.riotLines).toBe(0);
  });
});

describe("malformed report", () => {
  const plan = planOf("26.17");

  it.each<[string, (version: string) => unknown]>([
    ["says it is another patch", (v) => ({ ...cachedCorpusReport(v), patch_version: "26.99" })],
    ["has no cards", (v) => ({ ...cachedCorpusReport(v), cards: null })],
    ["has a null card", (v) => ({ ...cachedCorpusReport(v), cards: [null] })],
    ["has a card whose changes are not a list", (v) => ({ ...cachedCorpusReport(v), cards: [{ changes: "x" }] })],
    ["has a non-object change", (v) => ({ ...cachedCorpusReport(v), cards: [{ changes: [null] }] })],
    ["has unusable section titles", (v) => ({ ...cachedCorpusReport(v), section_titles: "Champions" })],
    ["is not an object", () => null],
  ])("a payload that %s is malformed, retryable, and never reaches the domain", (_label, make) => {
    const entries = entriesFor(plan, {}, (v) => (v === "26.18" ? make(v) : cachedCorpusReport(v)));
    const { assembly, report } = built(plan, entries);

    expect(assembly.resources.find((r) => r.version === "26.18")?.status).toBe("malformed");
    expect(assembly.issues.map((i) => [i.kind, i.version])).toEqual([["report_malformed", "26.18"]]);
    expect(assembly.retryableVersions).toEqual(["26.18"]);
    expect(spy.mock.calls[0][0].reports.map((r) => r.patch_version)).toEqual(["26.19"]);
    expect(report.coverage.missingPatches).toEqual(["26.18"]);
    expect(report.continuity.status).toBe("withheld");
    expect(report.continuity.chains).toEqual([]);
  });

  it("a report with no section_titles at all is still usable (the structure builder allows it)", () => {
    const { section_titles: _omit, ...bare } = cachedCorpusReport("26.19");
    expect(reportProblem("26.19", bare)).toBeNull();
  });
});

/* ------------------------------ de-duplication ---------------------------- */

describe("at most one report per patch", () => {
  const cardA = championCard("Annie", [statLine("health", "100", "110")]);
  const cardB = championCard("Annie", [statLine("health", "100", "120")]);
  const entry = (version: string, report: PatchReportDetail) => ({ version, report });

  it("identical duplicates collapse to the first", () => {
    const first = makeReport("26.4", [cardA]);
    const second = makeReport("26.4", [cardA]);
    const result = dedupeReportsByPatch([entry("26.4", first), entry("26.4", second)]);
    expect(result.kept.map((e) => e.report)).toEqual([first]);
    expect(result.collapsed).toHaveLength(1);
    expect(result.conflicts).toEqual([]);
  });

  it("different spellings of one patch (26.4 / 26.04) are one patch", () => {
    const result = dedupeReportsByPatch([
      entry("26.4", makeReport("26.4", [cardA])),
      entry("26.04", makeReport("26.04", [cardA])),
    ]);
    expect(result.kept).toHaveLength(1);
    expect(result.collapsed).toHaveLength(1);
  });

  it("build metadata (timestamps, adapter timing, reconciliation) is not a disagreement", () => {
    const a = { ...makeReport("26.4", [cardA]), built_at: "2026-01-01", historical_context_summary: { adapter_elapsed_ms: 1 } };
    const b = {
      ...makeReport("26.4", [cardA]),
      built_at: "2026-02-02",
      historical_context_summary: { adapter_elapsed_ms: 999 },
      source_url: "https://elsewhere.test",
    };
    expect(reportsAgree(a, b)).toBe(true);
  });

  it("materially different duplicates fail the whole group closed — nothing is picked", () => {
    const first = makeReport("26.4", [cardA]);
    const second = makeReport("26.4", [cardB]);
    const result = dedupeReportsByPatch([entry("26.4", first), entry("26.4", second)]);
    expect(result.kept).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toHaveLength(2);
  });

  it("differing section titles are a disagreement too", () => {
    expect(reportsAgree(makeReport("26.4", [cardA], ["Champions"]), makeReport("26.4", [cardA], ["Items"]))).toBe(false);
  });

  it("the verdict does not depend on input order", () => {
    const a = entry("26.4", makeReport("26.4", [cardA]));
    const b = entry("26.04", makeReport("26.04", [cardB]));
    const c = entry("26.5", makeReport("26.5", [cardA]));
    const forward = dedupeReportsByPatch([a, b, c]);
    const backward = dedupeReportsByPatch([c, b, a]);
    expect(forward.kept.map((e) => e.version)).toEqual(["26.5"]);
    expect(backward.kept.map((e) => e.version)).toEqual(["26.5"]);
    expect(forward.conflicts.flat().map((e) => e.version).sort()).toEqual(["26.04", "26.4"]);
    expect(backward.conflicts.flat().map((e) => e.version).sort()).toEqual(["26.04", "26.4"]);
  });

  it("assembly: conflicting spellings are both withheld from the domain and reported, with continuity withheld", () => {
    const listing = ["26.3", "26.4", "26.04", "26.5"];
    const plan = planOf("26.2", "26.5", listing);
    const data: Record<string, PatchReportDetail> = {
      "26.3": makeReport("26.3", [cardA]),
      "26.4": makeReport("26.4", [cardA]),
      "26.04": makeReport("26.04", [cardB]),
      "26.5": makeReport("26.5", [cardA]),
    };
    const { assembly, report } = built(plan, entriesFor(plan, {}, (v) => data[v]));

    expect(spy.mock.calls[0][0].reports.map((r) => r.patch_version)).toEqual(["26.3", "26.5"]);
    expect(assembly.resources.filter((r) => r.status === "conflicting").map((r) => r.version)).toEqual(["26.04", "26.4"]);
    expect(assembly.issues.map((i) => i.kind)).toEqual(["report_conflict", "report_conflict"]);
    expect(assembly.retryableVersions).toEqual(["26.04", "26.4"]);
    expect(report.coverage.missingPatches).toEqual(["26.4"]);
    expect(report.continuity.status).toBe("withheld");
    expect(report.lines.some((l) => l.patch === "26.4" || l.patch === "26.04")).toBe(false);
  });

  it("assembly: identical spellings pass ONE report to the domain and the output is clean", () => {
    const listing = ["26.3", "26.4", "26.04", "26.5"];
    const plan = planOf("26.2", "26.5", listing);
    const data: Record<string, PatchReportDetail> = {
      "26.3": makeReport("26.3", [cardA]),
      "26.4": makeReport("26.4", [cardA]),
      "26.04": makeReport("26.04", [cardA]),
      "26.5": makeReport("26.5", [cardA]),
    };
    const { assembly, report } = built(plan, entriesFor(plan, {}, (v) => data[v]));

    expect(spy.mock.calls[0][0].reports.map((r) => r.patch_version)).toEqual(["26.3", "26.04", "26.5"]);
    // The smallest spelling represents the patch, whatever order it was listed in.
    expect(assembly.resources.map((r) => [r.version, r.status])).toEqual([
      ["26.3", "loaded"],
      ["26.04", "loaded"],
      ["26.4", "duplicate_collapsed"],
      ["26.5", "loaded"],
    ]);
    expect(assembly.issues).toEqual([]);
    expect(report.coverage.duplicatePatches).toEqual([]);
    expect(report.coverage.complete).toBe(true);
  });

  it("the domain output does not depend on the order the reports were requested/listed in", () => {
    const base = ["26.3", "26.4", "26.04", "26.5"];
    const data: Record<string, PatchReportDetail> = {
      "26.3": makeReport("26.3", [cardA]),
      "26.4": makeReport("26.4", [cardA]),
      "26.04": makeReport("26.04", [cardA]),
      "26.5": makeReport("26.5", [cardA]),
    };
    const lines = (listing: string[]) =>
      built(planOf("26.2", "26.5", listing), entriesFor(planOf("26.2", "26.5", listing), {}, (v) => data[v])).report.lines.map(
        (l) => `${l.patch}:${l.id}`,
      );
    expect(lines([...base].reverse()).sort()).toEqual(lines(base).sort());
  });
});

describe("domain failure", () => {
  it("a throwing domain becomes domain_error instead of crashing the caller", () => {
    spy.mockImplementationOnce(() => {
      throw new Error("kaboom");
    });
    const plan = planOf("26.17");
    const assembly = assembleCatchUp(plan, entriesFor(plan));
    expect(assembly.report).toBeNull();
    expect(assembly.failure).toMatchObject({ code: "domain_error" });
    expect(assembly.failure?.message).toContain("kaboom");
  });
});
