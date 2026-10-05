import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { PATCH_REPORTS_KEY, patchReportKey } from "@/lib/patch-catchup-loader";
import {
  LIST_PATH,
  callsTo,
  createBackend,
  deferred,
  installFetch,
  reportPath,
  reportRequests,
  requestedVersions,
  resetCalls,
  totalCalls,
  type FakeBackend,
} from "@/lib/patch-catchup-loader/test-support";
import { fetchPatchReport, fetchPatchReports, type PatchReportDetail } from "@/lib/patch-reports/api";
import { usePatchCatchUpLoader, type PatchCatchUpLoaderInput } from "./usePatchCatchUpLoader";

const spy = vi.mocked(buildCatchUpReport);

/* ------------------------------ scenario ---------------------------------- */

const NEWEST_FIRST = [...CORPUS_VERSIONS].reverse(); // what the index returns

type Setup = { backend: FakeBackend; client: QueryClient; reports: PatchReportDetail[] };

function setup(opts: { reports?: PatchReportDetail[]; listOrder?: string[] } = {}): Setup {
  const reports = opts.reports ?? corpusReports();
  const backend = createBackend(reports, opts.listOrder ?? NEWEST_FIRST);
  installFetch(backend);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return { backend, client, reports };
}

const wrapperFor =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

function mount(s: Setup, input: PatchCatchUpLoaderInput) {
  return renderHook((props: PatchCatchUpLoaderInput) => usePatchCatchUpLoader(props), {
    wrapper: wrapperFor(s.client),
    initialProps: input,
  });
}

type Mounted = ReturnType<typeof mount>;
const statusOf = (hook: Mounted) => hook.result.current.state.status;
const settled = (hook: Mounted, status: string) => waitFor(() => expect(statusOf(hook)).toBe(status));

const ENABLED = { sincePatch: "26.15", throughPatch: "26.19", enabled: true } as const;

beforeEach(() => {
  spy.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

/* ------------------------------ laziness (A) ------------------------------ */

describe("zero eager network", () => {
  it("a disabled mount, re-renders and unmount make no request and surface nothing", () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.15", throughPatch: "26.19" });
    for (let i = 0; i < 5; i++) hook.rerender({ sincePatch: "26.15", throughPatch: "26.19", enabled: false });

    expect(totalCalls(s.backend)).toBe(0);
    expect(hook.result.current.state).toEqual({ status: "disabled" });
    expect(hook.result.current.report).toBeNull();
    expect(hook.result.current.canRetry).toBe(false);
    hook.unmount();
    expect(totalCalls(s.backend)).toBe(0);
  });

  it("enabled but with no baseline yet is idle and still requests nothing", () => {
    const s = setup();
    for (const sincePatch of [null, undefined, ""]) {
      const hook = mount(s, { sincePatch, enabled: true });
      expect(hook.result.current.state).toEqual({ status: "idle" });
    }
    expect(totalCalls(s.backend)).toBe(0);
  });

  it("nothing loads until enabled flips to true, and only then", async () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.18", throughPatch: "26.19" });
    expect(totalCalls(s.backend)).toBe(0);
    hook.rerender({ sincePatch: "26.18", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    expect(totalCalls(s.backend)).toBe(2);
  });

  it("a disabled loader is unaffected by other consumers warming the same cache (PH2 / page reads)", async () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.15", throughPatch: "26.19" });
    // What a Patch Report page / Patch Impact does on the shared keys.
    await s.client.fetchQuery({ queryKey: PATCH_REPORTS_KEY, queryFn: fetchPatchReports });
    await s.client.fetchQuery({ queryKey: patchReportKey("26.19"), queryFn: () => fetchPatchReport("26.19") });
    expect(totalCalls(s.backend)).toBe(2);
    expect(hook.result.current.state).toEqual({ status: "disabled" });
    expect(hook.result.current.report).toBeNull();
  });
});

/* ------------------------- request accounting (B–E) ----------------------- */

describe("request accounting: (since, through], X excluded", () => {
  it("B: since 26.18 through 26.19 → the index and 26.19 only, never 26.18", async () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.18", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");

    expect(Object.fromEntries(s.backend.calls)).toEqual({ [LIST_PATH]: 1, [reportPath("26.19")]: 1 });
    expect(hook.result.current.requiredVersions).toEqual(["26.19"]);
    expect(hook.result.current.report?.includedPatches).toEqual(["26.19"]);
  });

  it("C: since 26.15 through 26.19 → 26.16, .17, .18, .19 each exactly once", async () => {
    const s = setup();
    const hook = mount(s, ENABLED);
    await settled(hook, "ready_complete");

    expect(callsTo(s.backend, LIST_PATH)).toBe(1);
    expect(reportRequests(s.backend)).toEqual({ "26.16": 1, "26.17": 1, "26.18": 1, "26.19": 1 });
    expect(totalCalls(s.backend)).toBe(5);
  });

  it("since === through is up to date after the index alone", async () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.19", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    expect(totalCalls(s.backend)).toBe(1);
    expect(hook.result.current.report?.range.status).toBe("up_to_date");
  });

  it("through omitted → the newest listed patch, by semantic order not list position", async () => {
    const listOrder = ["26.10", "26.19", "26.11", "26.18", "26.12", "26.17", "26.13", "26.14", "26.15", "26.16"];
    const s = setup({ listOrder });
    const hook = mount(s, { sincePatch: "26.17", enabled: true });
    await settled(hook, "ready_complete");
    expect(hook.result.current.range).toEqual({ sincePatch: "26.17", throughPatch: "26.19" });
    expect(requestedVersions(s.backend)).toEqual(["26.18", "26.19"]);
  });

  it("the listing orders semantically: 26.2 < 26.10, with no consecutive-minor assumption", async () => {
    const reports = ["26.2", "26.9", "26.10", "26.12"].map((v) => makeReport(v, []));
    const s = setup({ reports, listOrder: ["26.12", "26.2", "26.10", "26.9"] });
    const hook = mount(s, { sincePatch: "26.2", throughPatch: "26.12", enabled: true });
    await settled(hook, "ready_incomplete");
    expect(hook.result.current.requiredVersions).toEqual(["26.9", "26.10", "26.12"]);
    expect(requestedVersions(s.backend)).toEqual(["26.10", "26.12", "26.9"]);
    // 26.10 → 26.12 is a hole in plain YY.N numbering: the domain says so and withholds.
    expect(hook.result.current.coverage?.issues.map((i) => i.kind)).toContain("ordinal_gap");
  });

  it("D/E: a fresh cached list and a fresh cached selected report are not refetched", async () => {
    const s = setup();
    s.client.setQueryData(PATCH_REPORTS_KEY, { patches: NEWEST_FIRST.map((patch_version) => ({ patch_version })) });
    s.client.setQueryData(patchReportKey("26.19"), s.reports.find((r) => r.patch_version === "26.19"));
    const hook = mount(s, { sincePatch: "26.18", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    expect(totalCalls(s.backend)).toBe(0);
  });

  it("D: only the uncached report is requested when the selected one is already cached", async () => {
    const s = setup();
    s.client.setQueryData(patchReportKey("26.19"), s.reports.find((r) => r.patch_version === "26.19"));
    const hook = mount(s, { sincePatch: "26.17", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    expect(Object.fromEntries(s.backend.calls)).toEqual({ [LIST_PATH]: 1, [reportPath("26.18")]: 1 });
  });

  it("E: a cached list alone saves exactly the list request", async () => {
    const s = setup();
    s.client.setQueryData(PATCH_REPORTS_KEY, { patches: NEWEST_FIRST.map((patch_version) => ({ patch_version })) });
    const hook = mount(s, { sincePatch: "26.17", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    expect(callsTo(s.backend, LIST_PATH)).toBe(0);
    expect(requestedVersions(s.backend)).toEqual(["26.18", "26.19"]);
  });
});

/* ------------------------- parallelism and dedupe (F) --------------------- */

describe("parallelism and de-duplication", () => {
  it("all needed reports are requested at once once the version set is known (no waterfall)", async () => {
    const s = setup();
    for (const v of ["26.16", "26.17", "26.18", "26.19"]) s.backend.gates.set(v, deferred());
    const hook = mount(s, ENABLED);

    // Every response is held, yet all four requests are already in flight.
    await waitFor(() => expect(requestedVersions(s.backend)).toEqual(["26.16", "26.17", "26.18", "26.19"]));
    expect(statusOf(hook)).toBe("loading_reports");
    expect(hook.result.current.state).toMatchObject({
      pending: ["26.16", "26.17", "26.18", "26.19"],
      settled: 0,
      total: 4,
    });
    expect(hook.result.current.report).toBeNull();

    for (const gate of s.backend.gates.values()) gate.release();
    await settled(hook, "ready_complete");
    expect(totalCalls(s.backend)).toBe(5);
  });

  it("a half-loaded range is never shown as a gap: no report while one patch has never answered", async () => {
    const s = setup();
    s.backend.gates.set("26.18", deferred());
    const hook = mount(s, ENABLED);
    await waitFor(() => expect(hook.result.current.state).toMatchObject({ status: "loading_reports", pending: ["26.18"] }));
    expect(hook.result.current.report).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    s.backend.gates.get("26.18")!.release();
    await settled(hook, "ready_complete");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("F: two consumers of the same range share one request per resource", async () => {
    const s = setup();
    const hook = renderHook(() => [usePatchCatchUpLoader(ENABLED), usePatchCatchUpLoader(ENABLED)] as const, {
      wrapper: wrapperFor(s.client),
    });
    await waitFor(() => {
      expect(hook.result.current[0].state.status).toBe("ready_complete");
      expect(hook.result.current[1].state.status).toBe("ready_complete");
    });
    expect(callsTo(s.backend, LIST_PATH)).toBe(1);
    expect(reportRequests(s.backend)).toEqual({ "26.16": 1, "26.17": 1, "26.18": 1, "26.19": 1 });
    expect(hook.result.current[1].report).toEqual(hook.result.current[0].report);
  });

  it("two simultaneous consumers mounted separately on one client also share every request", async () => {
    const s = setup();
    const a = mount(s, ENABLED);
    const b = mount(s, ENABLED);
    await Promise.all([settled(a, "ready_complete"), settled(b, "ready_complete")]);
    expect(totalCalls(s.backend)).toBe(5);
  });

  it("a later consumer of a loaded range costs nothing", async () => {
    const s = setup();
    await settled(mount(s, ENABLED), "ready_complete");
    resetCalls(s.backend);
    await settled(mount(s, ENABLED), "ready_complete");
    expect(totalCalls(s.backend)).toBe(0);
  });

  it("G: overlapping ranges reuse the shared report cache — only the new patches are requested", async () => {
    const s = setup();
    await settled(mount(s, ENABLED), "ready_complete"); // 26.16–26.19
    resetCalls(s.backend);

    await settled(mount(s, { sincePatch: "26.17", throughPatch: "26.19", enabled: true }), "ready_complete");
    expect(totalCalls(s.backend)).toBe(0);

    await settled(mount(s, { sincePatch: "26.14", throughPatch: "26.19", enabled: true }), "ready_complete");
    expect(requestedVersions(s.backend)).toEqual(["26.15"]);
    expect(callsTo(s.backend, LIST_PATH)).toBe(0);
  });
});

/* -------------------------- cache sharing (9) ---------------------------- */

describe("cache sharing with the Patch Reports page and Patch Impact", () => {
  it("reuses what the page already holds on the canonical keys", async () => {
    const s = setup();
    // The page: list + selected patch, via its own query keys and accessors.
    const page = renderHook(
      () => {
        const list = useQuery({ queryKey: ["patch-reports"], queryFn: fetchPatchReports });
        const detail = useQuery({ queryKey: ["patch-report", "26.19"], queryFn: () => fetchPatchReport("26.19") });
        return { list, detail };
      },
      { wrapper: wrapperFor(s.client) },
    );
    await waitFor(() => expect(page.result.current.detail.data?.patch_version).toBe("26.19"));
    expect(totalCalls(s.backend)).toBe(2);

    await settled(mount(s, { sincePatch: "26.18", throughPatch: "26.19", enabled: true }), "ready_complete");
    expect(totalCalls(s.backend)).toBe(2); // nothing new
  });

  it("reports loaded by Catch-Up land on the same keys the page / Patch Impact read", async () => {
    const s = setup();
    await settled(mount(s, ENABLED), "ready_complete");
    for (const v of ["26.16", "26.17", "26.18", "26.19"]) {
      expect((s.client.getQueryData(patchReportKey(v)) as PatchReportDetail).patch_version).toBe(v);
    }
    expect(s.client.getQueryData(PATCH_REPORTS_KEY)).toBeDefined();

    // A page-style reader of one of them is a pure cache hit within the shared freshness window.
    resetCalls(s.backend);
    const page = renderHook(
      () => useQuery({ queryKey: ["patch-report", "26.17"], queryFn: () => fetchPatchReport("26.17"), staleTime: 60_000 }),
      { wrapper: wrapperFor(s.client) },
    );
    expect(page.result.current.data?.patch_version).toBe("26.17");
    expect(totalCalls(s.backend)).toBe(0);
  });

  it("never requests anything but the index and patch reports, and never writes (no champion stats, GET only)", async () => {
    const s = setup();
    await settled(mount(s, { sincePatch: "26.9", throughPatch: "26.19", enabled: true }), "ready_complete");

    const allowed = new Set([LIST_PATH, ...CORPUS_VERSIONS.map(reportPath)]);
    for (const path of s.backend.calls.keys()) expect(allowed.has(path), path).toBe(true);
    expect([...s.backend.calls.keys()].some((p) => p.includes("champion"))).toBe(false);
    expect(s.backend.log.length).toBe(11);
    for (const entry of s.backend.log) expect(entry.startsWith("GET ")).toBe(true);
    expect(s.client.getQueryData(["league-docs", "champion-base-stats"])).toBeUndefined();
  });
});

/* ----------------------- failure, incompleteness, retry ------------------- */

describe("failed and malformed reports → incomplete coverage", () => {
  it("one failed report: ready_incomplete, continuity withheld, no chain, the other reports kept", async () => {
    const s = setup();
    s.backend.failing.add("26.17");
    const hook = mount(s, { sincePatch: "26.9", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_incomplete");

    const loader = hook.result.current;
    expect(loader.issues).toEqual([
      expect.objectContaining({ kind: "report_request_failed", version: "26.17" }),
    ]);
    expect(loader.retryableVersions).toEqual(["26.17"]);
    expect(loader.canRetry).toBe(true);
    expect(loader.resources.find((r) => r.version === "26.17")?.status).toBe("failed");
    expect(loader.report?.continuity.status).toBe("withheld");
    expect(loader.report?.continuity.chains).toEqual([]);
    expect(loader.coverage?.missingPatches).toEqual(["26.17"]);
    expect(loader.report?.lines.length).toBe(1775 - 202); // every other patch's Riot lines survive
    // The domain was given the full listing and only the nine reports that loaded.
    const input = spy.mock.calls.at(-1)![0];
    expect(input.listedVersions).toHaveLength(10);
    expect(input.reports.map((r) => r.patch_version)).not.toContain("26.17");
    expect(input.reports).toHaveLength(9);
  });

  it("I: a malformed report (wrong patch) is incomplete coverage and makes no unsafe chain claim", async () => {
    const s = setup();
    s.backend.reports["26.16"] = { ...s.backend.reports["26.16"] as PatchReportDetail, patch_version: "26.99" };
    const hook = mount(s, { sincePatch: "26.9", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_incomplete");

    expect(hook.result.current.resources.find((r) => r.version === "26.16")?.status).toBe("malformed");
    expect(hook.result.current.issues.map((i) => i.kind)).toEqual(["report_malformed"]);
    expect(hook.result.current.coverage?.missingPatches).toEqual(["26.16"]);
    expect(hook.result.current.report?.continuity.chains).toEqual([]);
    expect(spy.mock.calls.at(-1)![0].reports.map((r) => r.patch_version)).not.toContain("26.16");
  });

  it("a report with no cards array is malformed too", async () => {
    const s = setup();
    s.backend.reports["26.18"] = { patch_version: "26.18" };
    const hook = mount(s, ENABLED);
    await settled(hook, "ready_incomplete");
    expect(hook.result.current.issues[0]).toMatchObject({ kind: "report_malformed", version: "26.18" });
  });

  it("every report failing is failed/reports_unavailable, not an empty 'nothing changed' report", async () => {
    const s = setup();
    for (const v of ["26.16", "26.17", "26.18", "26.19"]) s.backend.failing.add(v);
    const hook = mount(s, ENABLED);
    await settled(hook, "failed");
    expect(hook.result.current.state).toMatchObject({
      status: "failed",
      failure: { code: "reports_unavailable", versions: ["26.16", "26.17", "26.18", "26.19"] },
    });
    expect(hook.result.current.report).toBeNull();
    expect(hook.result.current.canRetry).toBe(true);
  });

  it("conflicting duplicate spellings of one patch fail closed", async () => {
    const card = (value: string) => championCard("Annie", [statLine("health", "100", value)]);
    const reports = [
      makeReport("26.3", [card("101")]),
      makeReport("26.4", [card("110")]),
      makeReport("26.04", [card("120")]),
      makeReport("26.5", [card("130")]),
    ];
    const s = setup({ reports, listOrder: ["26.5", "26.4", "26.04", "26.3"] });
    const hook = mount(s, { sincePatch: "26.2", throughPatch: "26.5", enabled: true });
    await settled(hook, "ready_incomplete");

    expect(requestedVersions(s.backend)).toEqual(["26.04", "26.3", "26.4", "26.5"]);
    expect(hook.result.current.issues.map((i) => [i.kind, i.version])).toEqual([
      ["report_conflict", "26.04"],
      ["report_conflict", "26.4"],
    ]);
    expect(spy.mock.calls.at(-1)![0].reports.map((r) => r.patch_version)).toEqual(["26.3", "26.5"]);
    expect(hook.result.current.report?.continuity.status).toBe("withheld");
  });

  it("identical duplicate spellings pass exactly one report", async () => {
    const card = championCard("Annie", [statLine("health", "100", "110")]);
    const reports = ["26.3", "26.4", "26.04", "26.5"].map((v) => makeReport(v, [card]));
    const s = setup({ reports, listOrder: ["26.5", "26.4", "26.04", "26.3"] });
    const hook = mount(s, { sincePatch: "26.2", throughPatch: "26.5", enabled: true });
    await settled(hook, "ready_complete");
    const patches = spy.mock.calls.at(-1)![0].reports.map((r) => r.patch_version);
    expect(patches).toEqual(["26.3", "26.04", "26.5"]);
  });

  it("an index failure is failed/index_failed with no report request", async () => {
    const s = setup();
    s.backend.failing.add("list");
    const hook = mount(s, ENABLED);
    await settled(hook, "failed");
    expect(hook.result.current.state).toMatchObject({ status: "failed", failure: { code: "index_failed" } });
    expect(requestedVersions(s.backend)).toEqual([]);
    expect(hook.result.current.canRetry).toBe(true);
  });

  it("a malformed index is failed/index_malformed", async () => {
    const s = setup();
    s.backend.listBody = { patches: [{ nope: 1 }] };
    const hook = mount(s, ENABLED);
    await settled(hook, "failed");
    expect(hook.result.current.state).toMatchObject({ failure: { code: "index_malformed" } });
    expect(requestedVersions(s.backend)).toEqual([]);
  });

  it.each([
    ["bad", "26.19", "since_unparseable"],
    ["26.19", "26.15", "since_after_through"],
    ["26.15", "latest", "through_unparseable"],
  ])("invalid range %s → %s is failed/range_invalid and requests no report", async (since, through, detail) => {
    const s = setup();
    const hook = mount(s, { sincePatch: since, throughPatch: through, enabled: true });
    await settled(hook, "failed");
    expect(hook.result.current.state).toMatchObject({ failure: { code: "range_invalid", detail } });
    expect(requestedVersions(s.backend)).toEqual([]);
    expect(hook.result.current.canRetry).toBe(false);
  });

  it("a failed report is not silently re-requested when another consumer mounts", async () => {
    const s = setup();
    s.backend.failing.add("26.17");
    await settled(mount(s, ENABLED), "ready_incomplete");
    expect(reportRequests(s.backend)["26.17"]).toBe(1);

    const second = mount(s, ENABLED);
    await settled(second, "ready_incomplete");
    expect(reportRequests(s.backend)["26.17"]).toBe(1);
    expect(totalCalls(s.backend)).toBe(5);
  });
});

describe("retry re-requests only what failed (H)", () => {
  it("26.17 failed, 26.16/.18/.19 loaded → retry fetches 26.17 and nothing else, then completes", async () => {
    const s = setup();
    s.backend.failing.add("26.17");
    const hook = mount(s, ENABLED);
    await settled(hook, "ready_incomplete");
    expect(hook.result.current.report?.continuity.status).toBe("withheld");

    resetCalls(s.backend);
    s.backend.failing.delete("26.17");
    act(() => hook.result.current.retry());
    await settled(hook, "ready_complete");

    expect(Object.fromEntries(s.backend.calls)).toEqual({ [reportPath("26.17")]: 1 });
    expect(hook.result.current.issues).toEqual([]);
    expect(hook.result.current.coverage?.complete).toBe(true);
    expect(hook.result.current.report?.continuity.status).toBe("available");
    expect(hook.result.current.canRetry).toBe(false);
  });

  it("keeps the incomplete report visible while the retry is in flight (no flicker)", async () => {
    const s = setup();
    s.backend.failing.add("26.17");
    const hook = mount(s, ENABLED);
    await settled(hook, "ready_incomplete");
    const before = hook.result.current.report;

    s.backend.failing.delete("26.17");
    s.backend.gates.set("26.17", deferred());
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.result.current.retrying).toBe(true));
    expect(statusOf(hook)).toBe("ready_incomplete");
    expect(hook.result.current.report).toBe(before);
    expect(hook.result.current.canRetry).toBe(false);

    // A second retry while one is in flight does not double-request.
    act(() => hook.result.current.retry());
    s.backend.gates.get("26.17")!.release();
    await settled(hook, "ready_complete");
    expect(reportRequests(s.backend)["26.17"]).toBe(2); // the original failure + one retry
  });

  it("a malformed report retries alone", async () => {
    const s = setup();
    const good = s.backend.reports["26.18"];
    s.backend.reports["26.18"] = { patch_version: "26.18", cards: null };
    const hook = mount(s, ENABLED);
    await settled(hook, "ready_incomplete");

    resetCalls(s.backend);
    s.backend.reports["26.18"] = good;
    act(() => hook.result.current.retry());
    await settled(hook, "ready_complete");
    expect(Object.fromEntries(s.backend.calls)).toEqual({ [reportPath("26.18")]: 1 });
  });

  it("an index failure retries the index, then loads the reports", async () => {
    const s = setup();
    s.backend.failing.add("list");
    const hook = mount(s, ENABLED);
    await settled(hook, "failed");

    s.backend.failing.delete("list");
    act(() => hook.result.current.retry());
    await settled(hook, "ready_complete");
    expect(callsTo(s.backend, LIST_PATH)).toBe(2);
    expect(reportRequests(s.backend)).toEqual({ "26.16": 1, "26.17": 1, "26.18": 1, "26.19": 1 });
  });

  it("retry with nothing retryable is a no-op", async () => {
    const s = setup();
    const hook = mount(s, ENABLED);
    await settled(hook, "ready_complete");
    resetCalls(s.backend);
    act(() => hook.result.current.retry());
    expect(totalCalls(s.backend)).toBe(0);
  });

  it("retry that fails again stays incomplete and retryable", async () => {
    const s = setup();
    s.backend.failing.add("26.17");
    const hook = mount(s, ENABLED);
    await settled(hook, "ready_incomplete");
    act(() => hook.result.current.retry());
    await waitFor(() => expect(reportRequests(s.backend)["26.17"]).toBe(2));
    await waitFor(() => expect(hook.result.current.retrying).toBe(false));
    expect(statusOf(hook)).toBe("ready_incomplete");
    expect(hook.result.current.canRetry).toBe(true);
  });
});

/* --------------------------- range changes (13) --------------------------- */

describe("range changes while requests are in flight", () => {
  it("a late response for the range the caller left never replaces the current result", async () => {
    const s = setup();
    for (const v of ["26.16", "26.17"]) s.backend.gates.set(v, deferred());
    const hook = mount(s, { sincePatch: "26.15", throughPatch: "26.19", enabled: true });
    await waitFor(() => expect(requestedVersions(s.backend)).toEqual(["26.16", "26.17", "26.18", "26.19"]));
    expect(statusOf(hook)).toBe("loading_reports");

    // Caller moves the baseline forward; the old 26.16/26.17 requests are still pending.
    hook.rerender({ sincePatch: "26.17", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    const current = hook.result.current.report;
    expect(current?.range.sincePatch).toBe("26.17");
    expect(current?.includedPatches).toEqual(["26.18", "26.19"]);
    expect(hook.result.current.requiredVersions).toEqual(["26.18", "26.19"]);

    // The stale responses now arrive. They warm the cache; the result does not move.
    for (const gate of s.backend.gates.values()) gate.release();
    await waitFor(() => expect(s.client.getQueryData(patchReportKey("26.16"))).toBeDefined());
    expect(hook.result.current.report).toBe(current);
    expect(hook.result.current.range).toEqual({ sincePatch: "26.17", throughPatch: "26.19" });

    // Going back is free: everything is already cached.
    resetCalls(s.backend);
    hook.rerender({ sincePatch: "26.15", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    expect(hook.result.current.report?.range.sincePatch).toBe("26.15");
    expect(hook.result.current.report?.includedPatches).toEqual(["26.16", "26.17", "26.18", "26.19"]);
    expect(totalCalls(s.backend)).toBe(0);
  });

  it("moving the baseline back requests only the newly needed patches", async () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.17", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    resetCalls(s.backend);
    hook.rerender({ sincePatch: "26.15", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    expect(requestedVersions(s.backend)).toEqual(["26.16", "26.17"]);
    expect(callsTo(s.backend, LIST_PATH)).toBe(0);
  });

  it("one range's incomplete result does not poison another range", async () => {
    const s = setup();
    s.backend.failing.add("26.16");
    const hook = mount(s, { sincePatch: "26.15", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_incomplete");

    hook.rerender({ sincePatch: "26.16", throughPatch: "26.19", enabled: true }); // 26.16 excluded
    await settled(hook, "ready_complete");
    expect(hook.result.current.report?.continuity.status).toBe("available");
    expect(hook.result.current.issues).toEqual([]);
    expect(hook.result.current.report?.coverage.complete).toBe(true);
  });

  it("disabling mid-flight surfaces nothing", async () => {
    const s = setup();
    s.backend.gates.set("26.19", deferred());
    const hook = mount(s, { sincePatch: "26.18", throughPatch: "26.19", enabled: true });
    await waitFor(() => expect(requestedVersions(s.backend)).toEqual(["26.19"]));
    hook.rerender({ sincePatch: "26.18", throughPatch: "26.19", enabled: false });
    expect(hook.result.current.state).toEqual({ status: "disabled" });
    s.backend.gates.get("26.19")!.release();
    await act(async () => {
      await Promise.resolve();
    });
    expect(hook.result.current.state).toEqual({ status: "disabled" });
    expect(hook.result.current.report).toBeNull();
  });
});

/* --------------------------- full corpus (16–18) -------------------------- */

describe("complete 26.10–26.19 corpus through the hook", () => {
  it("loads all ten reports once and yields every Riot line and exactly the five PH3-B chains", async () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.9", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");

    expect(reportRequests(s.backend)).toEqual(Object.fromEntries(CORPUS_VERSIONS.map((v) => [v, 1])));
    const report = hook.result.current.report!;
    expect(hook.result.current.coverage).toBe(report.coverage);
    expect(report.coverage.complete).toBe(true);
    expect(report.totals.riotLines).toBe(1775);
    expect(report.continuity.status).toBe("available");
    expect(report.continuity.chains.map((c) => c.entityName).sort()).toEqual([
      "Bel'Veth",
      "Doran's Helm",
      "Mordekaiser",
      "Sundered Sky",
      "Sylas",
    ]);
    expect(report.continuity.chains.map((c) => c.valueState).sort()).toEqual([
      "changed",
      "returns_to_start_value",
      "returns_to_start_value",
      "returns_to_start_value",
      "returns_to_start_value",
    ]);
  });

  it("hands PH3-B every loaded report exactly once — the very objects in the cache — plus the full listing", async () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.9", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");

    expect(spy).toHaveBeenCalledTimes(1);
    const input = spy.mock.calls[0][0];
    expect(input.reports.map((r) => r.patch_version)).toEqual(CORPUS_VERSIONS);
    expect(new Set(input.reports.map((r) => r.patch_version)).size).toBe(10);
    input.reports.forEach((r) => expect(r).toBe(s.client.getQueryData(patchReportKey(r.patch_version))));
    expect(input.listedVersions).toEqual(NEWEST_FIRST);
    // Complete reports: no card or change was filtered out before the domain.
    const cached = s.client.getQueryData(patchReportKey("26.16")) as PatchReportDetail;
    expect(input.reports.find((r) => r.patch_version === "26.16")!.cards).toHaveLength(cached.cards.length);
  });

  it("re-renders do not rebuild the domain report", async () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.9", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    const { report } = hook.result.current;
    const calls = spy.mock.calls.length;
    for (let i = 0; i < 5; i++) hook.rerender({ sincePatch: "26.9", throughPatch: "26.19", enabled: true });
    expect(spy.mock.calls.length).toBe(calls);
    expect(hook.result.current.report).toBe(report);
  });

  it("a baseline below the coverage floor is clamped by the domain and reported as such", async () => {
    const s = setup();
    const hook = mount(s, { sincePatch: "26.1", throughPatch: "26.19", enabled: true });
    await settled(hook, "ready_complete");
    expect(hook.result.current.report?.range).toMatchObject({ clampedToCoverageFloor: true, coverageFloor: "26.10" });
    expect(hook.result.current.requiredVersions).toEqual(CORPUS_VERSIONS);
  });
});
