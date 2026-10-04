/**
 * Test harness for the Patch Impact loader (not production code).
 *
 * Stubs global `fetch` and routes by URL so the REAL accessors
 * (fetchPatchReports / fetchPatchReport / fetchChampionBaseStats) run and every
 * count is a count of actual HTTP requests.
 */
import { vi } from "vitest";
import type { ChampionBaseStats } from "@/lib/league-docs/api";
import type { PatchReportDetail } from "@/lib/patch-reports/api";

export type Deferred = { promise: Promise<void>; release: () => void };
export function deferred(): Deferred {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export type FakeBackend = {
  /** Versions in the order the list endpoint returns them. */
  listOrder: string[];
  reports: Record<string, PatchReportDetail>;
  canonical: ChampionBaseStats[];
  /** Resource ids that answer 500: "list", "champion-stats", or a version. */
  failing: Set<string>;
  /** Hold a resource's response until released. */
  gates: Map<string, Deferred>;
  /** URL path (no origin) → request count. */
  calls: Map<string, number>;
};

export const LIST_PATH = "/api/patch-reports";
export const STATS_PATH = "/api/meta/champion-stats";
export const reportPath = (version: string) => `${LIST_PATH}/${encodeURIComponent(version)}`;

export function createBackend(
  reports: PatchReportDetail[],
  canonical: ChampionBaseStats[],
  listOrder?: string[],
): FakeBackend {
  return {
    listOrder: listOrder ?? reports.map((r) => r.patch_version),
    reports: Object.fromEntries(reports.map((r) => [r.patch_version, r])),
    canonical,
    failing: new Set(),
    gates: new Map(),
    calls: new Map(),
  };
}

export function installFetch(backend: FakeBackend) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    backend.calls.set(path, (backend.calls.get(path) ?? 0) + 1);

    let id: string;
    let body: unknown;
    if (path === LIST_PATH) {
      id = "list";
      body = { patches: backend.listOrder.map((patch_version) => ({ patch_version })) };
    } else if (path === STATS_PATH) {
      id = "champion-stats";
      body = { champion_stats: backend.canonical };
    } else if (path.startsWith(`${LIST_PATH}/`)) {
      id = decodeURIComponent(path.slice(LIST_PATH.length + 1));
      body = backend.reports[id];
    } else {
      throw new Error(`unexpected request ${path}`);
    }

    await backend.gates.get(id)?.promise;
    if (backend.failing.has(id) || body === undefined) {
      return { ok: false, status: body === undefined ? 404 : 500, statusText: "x", json: async () => ({}) };
    }
    return { ok: true, status: 200, statusText: "OK", json: async () => structuredClone(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export const callsTo = (backend: FakeBackend, path: string) => backend.calls.get(path) ?? 0;
export const totalCalls = (backend: FakeBackend) =>
  [...backend.calls.values()].reduce((sum, n) => sum + n, 0);
export const resetCalls = (backend: FakeBackend) => backend.calls.clear();
