/**
 * Test harness for the Catch-Up loader (not production code).
 *
 * Stubs global `fetch` and routes by URL so the REAL accessors
 * (fetchPatchReports / fetchPatchReport) run and every count is a count of actual
 * HTTP requests. Any URL other than the index or a patch report throws, which is
 * how the tests prove nothing else (champion stats, a write) is ever requested.
 */
import { vi } from "vitest";
import type { PatchReportDetail } from "@/lib/patch-reports/api";

export type Deferred = { promise: Promise<void>; release: () => void };
export function deferred(): Deferred {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export const LIST_PATH = "/api/patch-reports";
export const reportPath = (version: string) => `${LIST_PATH}/${encodeURIComponent(version)}`;

export type FakeBackend = {
  /** Versions in the order the index returns them. */
  listOrder: string[];
  /** Per-version payloads the report endpoint serves. */
  reports: Record<string, unknown>;
  /** Resource ids that answer 500: "list" or a version. */
  failing: Set<string>;
  /** Hold a resource's response until released. */
  gates: Map<string, Deferred>;
  /** URL path (no origin) → request count. */
  calls: Map<string, number>;
  /** Every request, in order: `METHOD path`. */
  log: string[];
  /** Replace the whole index body (e.g. to make it malformed). */
  listBody?: unknown;
};

export function createBackend(
  reports: PatchReportDetail[],
  listOrder?: string[],
): FakeBackend {
  return {
    listOrder: listOrder ?? reports.map((r) => r.patch_version),
    reports: Object.fromEntries(reports.map((r) => [r.patch_version, r])),
    failing: new Set(),
    gates: new Map(),
    calls: new Map(),
    log: [],
  };
}

export function installFetch(backend: FakeBackend) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    backend.calls.set(path, (backend.calls.get(path) ?? 0) + 1);
    backend.log.push(`${init?.method ?? "GET"} ${path}`);

    let id: string;
    let body: unknown;
    if (path === LIST_PATH) {
      id = "list";
      body = backend.listBody ?? { patches: backend.listOrder.map((patch_version) => ({ patch_version })) };
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
export const resetCalls = (backend: FakeBackend) => {
  backend.calls.clear();
  backend.log.length = 0;
};

/** Report versions requested so far, with how many times each. */
export function reportRequests(backend: FakeBackend): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [path, n] of backend.calls) {
    if (path.startsWith(`${LIST_PATH}/`)) out[decodeURIComponent(path.slice(LIST_PATH.length + 1))] = n;
  }
  return out;
}

/** Sorted list of the distinct report versions requested. */
export const requestedVersions = (backend: FakeBackend) => Object.keys(reportRequests(backend)).sort();
