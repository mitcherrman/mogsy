import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pass-through spy so tests can read exactly what the analyzer was given.
vi.mock("@/lib/patch-impact", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/patch-impact")>();
  return { ...actual, analyzeChampionStatChange: vi.fn(actual.analyzeChampionStatChange) };
});

import { analyzeChampionStatChange } from "@/lib/patch-impact";
import type { PatchImpactAnalysis } from "@/lib/patch-impact";
import { canonicalRow, championCard, report, statLine } from "@/lib/patch-impact/fixtures/builders";
import {
  CHAMPION_BASE_STATS_KEY,
  PATCH_REPORTS_KEY,
  patchReportKey,
} from "@/lib/patch-impact-loader/evidence";
import {
  LIST_PATH,
  STATS_PATH,
  callsTo,
  createBackend,
  deferred,
  installFetch,
  reportPath,
  resetCalls,
  totalCalls,
  type FakeBackend,
} from "@/lib/patch-impact-loader/test-support";
import type { PatchReportCard, PatchReportChange, PatchReportDetail } from "@/lib/patch-reports/api";
import { usePatchImpactLoader } from "./usePatchImpactLoader";

const spy = vi.mocked(analyzeChampionStatChange);

/* ------------------------------ scenario ---------------------------------- */

const P = "26.9";
const baseAd = () => statLine("base_ad", "Base AD", "60", "58");

type Subject = { card: PatchReportCard; change: PatchReportChange; patchVersion: string };

function subjectFor(name: string, patchVersion = P, change = baseAd()): Subject {
  return { card: championCard(name, [change]), change, patchVersion };
}

/** P's own report, holding the analysed card. */
const ownReport = (s: Subject, status?: Parameters<typeof report>[2]) =>
  report(s.patchVersion, [s.card], status);

type Setup = { backend: FakeBackend; client: QueryClient; subject: Subject };

function setup(opts: {
  later?: PatchReportDetail[];
  listOrder?: string[];
  canonical?: ReturnType<typeof canonicalRow>[];
  subject?: Subject;
  ownStatus?: Parameters<typeof report>[2];
} = {}): Setup {
  const subject = opts.subject ?? subjectFor("Smolder");
  const later = opts.later ?? [report("26.10", []), report("26.11", [])];
  const reports = [ownReport(subject, opts.ownStatus), ...later];
  const backend = createBackend(
    reports,
    opts.canonical ?? [canonicalRow("Smolder", { ad_per_level: 2.3 })],
    opts.listOrder ?? ["26.10", "26.9", "26.11", "26.8"],
  );
  installFetch(backend);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return { backend, client, subject };
}

function mount(s: Setup, subject: Subject = s.subject) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={s.client}>{children}</QueryClientProvider>
  );
  return renderHook(({ subject: sub }: { subject: Subject }) => usePatchImpactLoader(sub), {
    wrapper,
    initialProps: { subject },
  });
}

async function request(hook: ReturnType<typeof mount>, until: "ready" | "failed" = "ready") {
  act(() => hook.result.current.requestProjection());
  await waitFor(() => expect(hook.result.current.state.status).toBe(until));
}

function projected(a: PatchImpactAnalysis) {
  expect(a.status).toBe("projected");
  if (a.status !== "projected") throw new Error("not projected");
  return a;
}

beforeEach(() => {
  spy.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

/* -------------------------------- tests ----------------------------------- */

describe("laziness", () => {
  it("performs no request on mount, re-render or analysis reads — only the explicit request loads", async () => {
    const s = setup();
    const hook = mount(s);
    for (let i = 0; i < 5; i++) hook.rerender({ subject: s.subject });

    expect(totalCalls(s.backend)).toBe(0);
    expect(hook.result.current.state).toEqual({ status: "idle" });
    expect(hook.result.current.canRequest).toBe(true);
    // The Riot parameter fact is there immediately, with no evidence.
    expect(hook.result.current.analysis).toMatchObject({
      status: "parameter_only",
      projectionUnavailable: "history_incomplete",
      facts: [{ property: "base_ad", before: 60, after: 58, provenance: "riot_line" }],
    });

    await request(hook);
    expect(totalCalls(s.backend)).toBeGreaterThan(0);
  });

  it("a Riot-only projection (same-card pair) needs nothing and never fetches, even when asked", async () => {
    const change = baseAd();
    const pair = statLine("ad_growth", "AD Growth", "3", "3.2");
    const subject: Subject = { card: championCard("Smolder", [change, pair]), change, patchVersion: P };
    const s = setup({ subject });
    const hook = mount(s);

    expect(hook.result.current.state).toEqual({ status: "not_required", reason: "riot_complete" });
    expect(hook.result.current.canRequest).toBe(false);
    const a = projected(hook.result.current.analysis);
    expect(a.projection.trust.usesMogzyData).toBe(false);

    act(() => hook.result.current.requestProjection());
    expect(totalCalls(s.backend)).toBe(0);
    expect(hook.result.current.analysis).toBe(a);
  });

  it("a card no evidence can improve (identity unresolved) is unavailable and never fetches", () => {
    const change = baseAd();
    const subject: Subject = {
      card: championCard("Smolder", [change], { mogzy_entity_ref: null }),
      change,
      patchVersion: P,
    };
    const s = setup({ subject });
    const hook = mount(s);

    expect(hook.result.current.state).toEqual({ status: "unavailable", reason: "identity_unresolved" });
    act(() => hook.result.current.requestProjection());
    expect(totalCalls(s.backend)).toBe(0);
    expect(hook.result.current.analysis).toMatchObject({
      status: "parameter_only",
      projectionUnavailable: "identity_unresolved",
    });
  });

  it("changing the analysed patch on a mounted hook does not carry the request over", async () => {
    const s = setup();
    const hook = mount(s);
    await request(hook);
    resetCalls(s.backend);

    const other = subjectFor("Smolder", "26.10");
    hook.rerender({ subject: other });
    expect(hook.result.current.state).toEqual({ status: "idle" });
    expect(totalCalls(s.backend)).toBe(0);
  });
});

describe("evidence chains", () => {
  it("latest-patch companion path: list + canonical + own report only, canonical companion", async () => {
    const s = setup({ later: [], listOrder: ["26.8", "26.9"] });
    const hook = mount(s);
    await request(hook);

    expect(callsTo(s.backend, LIST_PATH)).toBe(1);
    expect(callsTo(s.backend, STATS_PATH)).toBe(1);
    expect(callsTo(s.backend, reportPath("26.9"))).toBe(1);
    expect(callsTo(s.backend, reportPath("26.8"))).toBe(0); // earlier than P: never needed
    expect(totalCalls(s.backend)).toBe(3);

    const a = projected(hook.result.current.analysis);
    expect(a.projection.inputs.growthBefore).toEqual({ value: 2.3, provenance: "canonical_current" });
    expect(a.projection.trust).toEqual({
      usesMogzyData: true,
      canonicalEntity: "Smolder",
      laterVersionsChecked: [],
    });
  });

  it("old-patch chain: fetches exactly the later reports, ordered numerically (26.9 < 26.10 < 26.11)", async () => {
    const s = setup();
    const hook = mount(s);
    await request(hook);

    expect(callsTo(s.backend, reportPath("26.10"))).toBe(1);
    expect(callsTo(s.backend, reportPath("26.11"))).toBe(1);
    expect(callsTo(s.backend, reportPath("26.9"))).toBe(1);
    expect(callsTo(s.backend, reportPath("26.8"))).toBe(0);
    expect(totalCalls(s.backend)).toBe(5);

    const a = projected(hook.result.current.analysis);
    expect(a.projection.trust.laterVersionsChecked).toEqual(["26.10", "26.11"]);
  });

  it("a later Riot line on the companion anchors it at that report's before value", async () => {
    const later = [
      report("26.10", [championCard("Smolder", [statLine("ad_growth", "AD Growth", "2", "2.3")])]),
      report("26.11", []),
    ];
    const s = setup({ later });
    const hook = mount(s);
    await request(hook);

    const a = projected(hook.result.current.analysis);
    expect(a.projection.inputs.growthBefore).toEqual({
      value: 2,
      provenance: "riot_later_before",
      patch: "26.10",
    });
    expect(a.projection.trust.laterVersionsChecked).toEqual(["26.10", "26.11"]);
  });

  it("analyzer receives the exact later reports, expected versions and status map", async () => {
    const later = [report("26.10", [], "RECONCILED"), report("26.11", [])];
    const s = setup({ later, ownStatus: "RECONCILED_WITH_HELDS" });
    const hook = mount(s);
    await request(hook);

    const call = spy.mock.calls.at(-1)?.[0];
    expect(call?.patchVersion).toBe(P);
    expect(call?.card).toBe(s.subject.card);
    expect(call?.change).toBe(s.subject.change);
    expect(call?.canonical).toEqual([canonicalRow("Smolder", { ad_per_level: 2.3 })]);
    expect(call?.laterReports).toEqual(later); // strictly later, oldest first, nothing else
    expect(call?.laterVersionsExpected).toEqual(["26.10", "26.9", "26.11", "26.8"]); // list as returned
    // P and 26.10 report a status; 26.11 has no block and gets no entry.
    expect(call?.reconciliationByVersion).toEqual({ "26.9": "RECONCILED_WITH_HELDS", "26.10": "RECONCILED" });
    expect(Object.keys(call?.reconciliationByVersion ?? {})).not.toContain("26.11");
  });
});

describe("shared cache", () => {
  it("reuses an already cached selected report and later report (no refetch)", async () => {
    const s = setup();
    s.client.setQueryData(patchReportKey("26.9"), s.backend.reports["26.9"]);
    s.client.setQueryData(patchReportKey("26.10"), s.backend.reports["26.10"]);
    const hook = mount(s);
    await request(hook);

    expect(callsTo(s.backend, reportPath("26.9"))).toBe(0);
    expect(callsTo(s.backend, reportPath("26.10"))).toBe(0);
    expect(callsTo(s.backend, reportPath("26.11"))).toBe(1);
    projected(hook.result.current.analysis);
  });

  it("reuses cached version list and canonical champion stats (League Docs key)", async () => {
    const s = setup();
    s.client.setQueryData(PATCH_REPORTS_KEY, {
      patches: ["26.10", "26.9", "26.11", "26.8"].map((patch_version) => ({ patch_version })),
    });
    s.client.setQueryData(CHAMPION_BASE_STATS_KEY, [canonicalRow("Smolder", { ad_per_level: 2.3 })]);
    const hook = mount(s);
    await request(hook);

    expect(callsTo(s.backend, LIST_PATH)).toBe(0);
    expect(callsTo(s.backend, STATS_PATH)).toBe(0);
    expect(callsTo(s.backend, reportPath("26.9"))).toBe(1);
    projected(hook.result.current.analysis);
  });

  it("two consumers requesting at once share every request", async () => {
    const s = setup();
    const gate = deferred();
    s.backend.gates.set("list", gate); // hold the first request so the second truly overlaps
    const second = subjectFor("Smolder");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={s.client}>{children}</QueryClientProvider>
    );
    const both = renderHook(
      () => ({ a: usePatchImpactLoader(s.subject), b: usePatchImpactLoader(second) }),
      { wrapper },
    );

    act(() => {
      both.result.current.a.requestProjection();
      both.result.current.b.requestProjection();
    });
    await waitFor(() => expect(callsTo(s.backend, LIST_PATH)).toBe(1));
    gate.release();
    await waitFor(() => {
      expect(both.result.current.a.state.status).toBe("ready");
      expect(both.result.current.b.state.status).toBe("ready");
    });

    for (const path of [LIST_PATH, STATS_PATH, reportPath("26.9"), reportPath("26.10"), reportPath("26.11")]) {
      expect(callsTo(s.backend, path)).toBe(1);
    }
  });

  it("a second panel on an already loaded chain performs zero requests", async () => {
    const s = setup();
    const first = mount(s);
    await request(first);
    resetCalls(s.backend);

    const second = mount(s, subjectFor("Smolder"));
    expect(second.result.current.state).toEqual({ status: "idle" }); // nothing shown until it asks
    await request(second);
    expect(totalCalls(s.backend)).toBe(0);
    projected(second.result.current.analysis);
  });

  it("different analysed patches share the reports they have in common", async () => {
    const s = setup({
      later: [report("26.10", []), report("26.11", [])],
      listOrder: ["26.9", "26.10", "26.11"],
    });
    const at9 = mount(s);
    await request(at9);
    resetCalls(s.backend);

    // 26.10's own report plus 26.11 are already cached from the 26.9 chain.
    const at10 = mount(s, subjectFor("Smolder", "26.10"));
    await request(at10);
    expect(callsTo(s.backend, reportPath("26.10"))).toBe(0);
    expect(callsTo(s.backend, reportPath("26.11"))).toBe(0);
    expect(callsTo(s.backend, LIST_PATH)).toBe(0);
    expect(callsTo(s.backend, STATS_PATH)).toBe(0);
  });

  it("slider-like repeated reads after load cause no network activity and no new analysis", async () => {
    const s = setup();
    const hook = mount(s);
    await request(hook);
    resetCalls(s.backend);
    spy.mockClear();

    const analysis = projected(hook.result.current.analysis);
    for (let level = 1; level <= 18; level++) {
      hook.rerender({ subject: s.subject });
      const current = projected(hook.result.current.analysis);
      expect(current).toBe(analysis);
      expect(current.projection.levels[level - 1].level).toBe(level);
      act(() => hook.result.current.requestProjection()); // re-clicking is harmless too
    }
    expect(totalCalls(s.backend)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("fail closed", () => {
  it("a later report failure leaves the parameter-only analysis and says why; retry refetches only the failure", async () => {
    const s = setup();
    s.backend.failing.add("26.10");
    const hook = mount(s);
    await request(hook, "failed");

    expect(hook.result.current.state).toMatchObject({
      status: "failed",
      error: { code: "request_failed", resource: "patch-report", version: "26.10" },
    });
    expect(hook.result.current.canRequest).toBe(true);
    expect(hook.result.current.analysis).toMatchObject({
      status: "parameter_only",
      projectionUnavailable: "history_incomplete",
      facts: [{ property: "base_ad", before: 60, after: 58 }],
    });
    expect(spy.mock.calls.some((c) => c[0].laterReports != null)).toBe(false); // analyzer never saw partial evidence

    s.backend.failing.clear();
    resetCalls(s.backend);
    await request(hook);
    projected(hook.result.current.analysis);
    expect(callsTo(s.backend, LIST_PATH)).toBe(0);
    expect(callsTo(s.backend, STATS_PATH)).toBe(0);
    expect(callsTo(s.backend, reportPath("26.9"))).toBe(0);
    expect(callsTo(s.backend, reportPath("26.11"))).toBe(0);
    expect(callsTo(s.backend, reportPath("26.10"))).toBe(1);
  });

  it("canonical stats failure fails closed", async () => {
    const s = setup();
    s.backend.failing.add("champion-stats");
    const hook = mount(s);
    await request(hook, "failed");
    expect(hook.result.current.state).toMatchObject({
      status: "failed",
      error: { code: "request_failed", resource: "champion-stats" },
    });
    expect(hook.result.current.analysis.status).toBe("parameter_only");
  });

  it("a missing (404) own report fails closed", async () => {
    const s = setup();
    delete s.backend.reports[P];
    const hook = mount(s);
    await request(hook, "failed");
    expect(hook.result.current.state).toMatchObject({ status: "failed", error: { version: P } });
  });

  it.each([
    ["a duplicate version", ["26.9", "26.10", "26.10"], "patch_chain_malformed"],
    ["an unparseable version", ["26.9", "26.10", "twenty-six"], "patch_chain_malformed"],
    ["the analysed patch missing from the list", ["26.10", "26.11"], "patch_chain_malformed"],
  ])("a malformed patch list (%s) fails closed", async (_label, listOrder, code) => {
    const s = setup({ listOrder });
    const hook = mount(s);
    await request(hook, "failed");
    expect(hook.result.current.state).toMatchObject({ status: "failed", error: { code } });
    expect(hook.result.current.analysis.status).toBe("parameter_only");
  });

  it("a report payload that is not the requested version fails closed", async () => {
    const s = setup();
    s.backend.reports["26.10"] = report("26.12", []);
    const hook = mount(s);
    await request(hook, "failed");
    expect(hook.result.current.state).toMatchObject({
      status: "failed",
      error: { code: "report_malformed", version: "26.10" },
    });
  });

  it("an unknown champion (no canonical row) loads, then fails closed in the domain", async () => {
    const s = setup({ canonical: [canonicalRow("Someone Else")] });
    const hook = mount(s);
    await request(hook);
    expect(hook.result.current.analysis).toMatchObject({
      status: "parameter_only",
      projectionUnavailable: "identity_unresolved",
      facts: [{ property: "base_ad" }],
    });
  });

  it("an analyzer that rejects the loaded evidence fails closed instead of throwing", async () => {
    const s = setup();
    const hook = mount(s);
    spy.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    // The immediate analysis already ran; the next call is the enrichment.
    await request(hook, "failed");
    expect(hook.result.current.state).toMatchObject({ status: "failed", error: { code: "analysis_failed" } });
    expect(hook.result.current.analysis.status).toBe("parameter_only");
  });
});

describe("reconciliation", () => {
  it("an explicit later RECONCILIATION_FAILED reaches the domain, which refuses the projection", async () => {
    const s = setup({ later: [report("26.10", [], "RECONCILIATION_FAILED"), report("26.11", [])] });
    const hook = mount(s);
    await request(hook);
    expect(spy.mock.calls.at(-1)?.[0].reconciliationByVersion).toEqual({ "26.10": "RECONCILIATION_FAILED" });
    expect(hook.result.current.analysis).toMatchObject({
      status: "parameter_only",
      projectionUnavailable: "reconciliation_failed",
      facts: [{ property: "base_ad" }],
    });
  });

  it("an explicit RECONCILIATION_FAILED on the analysed patch itself reaches the domain", async () => {
    const s = setup({ ownStatus: "RECONCILIATION_FAILED" });
    const hook = mount(s);
    await request(hook);
    expect(spy.mock.calls.at(-1)?.[0].reconciliationByVersion).toEqual({ "26.9": "RECONCILIATION_FAILED" });
    expect(hook.result.current.analysis).toMatchObject({
      status: "parameter_only",
      projectionUnavailable: "reconciliation_failed",
    });
  });

  it("missing reconciliation is preserved as absence, never invented, and does not block", async () => {
    const s = setup(); // no report carries a reconciliation block
    const hook = mount(s);
    await request(hook);
    const map = spy.mock.calls.at(-1)?.[0].reconciliationByVersion;
    expect(map).toEqual({});
    expect(Object.values(map ?? {})).not.toContain("RECONCILED");
    projected(hook.result.current.analysis);
  });
});
