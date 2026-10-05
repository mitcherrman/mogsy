import { useCallback, useMemo, useRef } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchPatchReport, fetchPatchReports, type PatchReportDetail } from "@/lib/patch-reports/api";
import {
  CATCHUP_REPORT_STALE_MS,
  PATCH_REPORTS_KEY,
  assembleCatchUp,
  deriveCatchUpLoaderState,
  patchReportKey,
  planCatchUpRange,
  type CatchUpAssembly,
  type CatchUpLoader,
  type ReportEntry,
} from "@/lib/patch-catchup-loader";

export type PatchCatchUpLoaderInput = {
  /** The baseline the reader has already seen (EXCLUDED). Null/empty: nothing to load yet (`idle`). */
  sincePatch: string | null | undefined;
  /** Last patch (INCLUDED). Null/undefined: the newest patch the index lists. */
  throughPatch?: string | null;
  /** Explicit opt-in. Defaults to false: a mounted-but-disabled loader costs nothing. */
  enabled?: boolean;
};

type ReportSnapshot = {
  data: PatchReportDetail | undefined;
  error: unknown;
  /**
   * Holds no data and has failed — including WHILE a retry is in flight (TanStack
   * resets an errored, data-less query to `pending` when it refetches, but keeps
   * `errorUpdateCount`), so a retry never blanks the report that was showing.
   */
  failed: boolean;
  fetching: boolean;
};

const EMPTY_VERSIONS: string[] = [];
const noop = () => {};

/** Observer options shared by every read: lazy, never refetched behind the caller's back. */
const SHARED_READ = {
  staleTime: CATCHUP_REPORT_STALE_MS,
  retry: false,
  // A cached failure is not silently re-requested when another consumer mounts:
  // only `retry()` re-requests, and only the failed resource.
  retryOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

function combineReports(
  results: ReadonlyArray<{
    data: PatchReportDetail | undefined;
    error: unknown;
    status: "pending" | "error" | "success";
    fetchStatus: "fetching" | "paused" | "idle";
    errorUpdateCount: number;
  }>,
): ReportSnapshot[] {
  return results.map((r) => ({
    data: r.data,
    error: r.error,
    failed: r.data === undefined && (r.status === "error" || r.errorUpdateCount > 0),
    fetching: r.fetchStatus === "fetching",
  }));
}

const messageOf = (error: unknown): string | null =>
  error instanceof Error ? error.message : error == null ? null : String(error);

function sameEntries(a: readonly ReportEntry[], b: readonly ReportEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (e, i) =>
        e.version === b[i].version &&
        e.data === b[i].data &&
        e.failed === b[i].failed &&
        e.errorMessage === b[i].errorMessage,
    )
  );
}

/**
 * Lazy Catch-Up data ("what changed since patch X?") for the PH3-B domain.
 *
 * Nothing loads until `enabled` is true AND a baseline is given: mounting,
 * re-rendering and ordinary Patch Hub use never touch the network. Once active it
 * reads the patch index and exactly the reports in (since, through] through the
 * shared TanStack cache on the existing keys (`["patch-reports"]`,
 * `["patch-report", version]`), in parallel, so anything the Patch Report page or
 * Patch Impact already holds is reused and any number of consumers of the same
 * range share one request per resource. It never fetches canonical champion stats.
 *
 * What the consumer gets is derived on every render from the CURRENT range's keys,
 * so a late response for a range the caller has left can never replace the
 * current result (it only warms the cache).
 *
 * Fail-closed: only reports that loaded and validated reach the domain (one per
 * patch), together with the full index listing, so a failed patch surfaces as
 * incomplete coverage with continuity withheld — never as a synthesised empty
 * report. `retry()` re-requests only what failed.
 */
export function usePatchCatchUpLoader({
  sincePatch,
  throughPatch,
  enabled = false,
}: PatchCatchUpLoaderInput): CatchUpLoader {
  const queryClient = useQueryClient();
  const since = sincePatch ? sincePatch : null;
  const through = throughPatch ? throughPatch : null;
  const active = enabled && since !== null;

  const indexQuery = useQuery({
    queryKey: PATCH_REPORTS_KEY,
    queryFn: fetchPatchReports,
    enabled: active,
    ...SHARED_READ,
  });
  const indexData: unknown = active ? indexQuery.data : undefined;

  const plan = useMemo(
    () => (since !== null && indexData !== undefined ? planCatchUpRange(indexData, since, through) : null),
    [since, through, indexData],
  );
  const okPlan = plan !== null && plan.ok === true ? plan : null;
  const versions = okPlan?.versions ?? EMPTY_VERSIONS;

  const snapshots = useQueries({
    queries: versions.map((version) => ({
      queryKey: patchReportKey(version),
      queryFn: () => fetchPatchReport(version),
      ...SHARED_READ,
    })),
    combine: combineReports,
  });

  // Entries ignore `fetching`, so a retry's start/stop does not rebuild the (heavy) domain report.
  const entriesRef = useRef<ReportEntry[]>([]);
  // The error is cleared while a retry runs; remember its message so the issue does not change.
  const lastErrorRef = useRef(new Map<string, string | null>());
  const nextEntries: ReportEntry[] = versions.map((version, i) => {
    const snap = snapshots[i];
    if (snap?.error != null) lastErrorRef.current.set(version, messageOf(snap.error));
    return {
      version,
      data: snap?.data,
      failed: snap?.failed ?? false,
      errorMessage: snap?.failed ? (lastErrorRef.current.get(version) ?? null) : null,
    };
  });
  if (!sameEntries(entriesRef.current, nextEntries)) entriesRef.current = nextEntries;
  const entries = entriesRef.current;

  const assembly: CatchUpAssembly | null = useMemo(
    () => (okPlan ? assembleCatchUp(okPlan, entries) : null),
    [okPlan, entries],
  );

  const indexFailed = active && indexData === undefined && indexQuery.isError && !indexQuery.isFetching;
  const state = deriveCatchUpLoaderState({
    enabled,
    hasSince: since !== null,
    index: {
      data: indexData,
      failed: indexFailed,
      errorMessage: indexFailed ? messageOf(indexQuery.error) : null,
    },
    plan,
    assembly,
  });

  const retryableVersions = assembly?.retryableVersions ?? EMPTY_VERSIONS;
  const retrying = retryableVersions.some((version) => {
    const i = versions.indexOf(version);
    return i >= 0 && snapshots[i]?.fetching === true;
  });
  const indexRetryable =
    indexFailed || (plan !== null && plan.ok === false && plan.failure.code === "index_malformed" && !indexQuery.isFetching);
  const canRetry = state.status !== "disabled" && (indexRetryable || (retryableVersions.length > 0 && !retrying));

  const { refetch: refetchIndex } = indexQuery;
  const retry = useCallback(() => {
    if (!canRetry) return;
    if (indexRetryable) {
      void refetchIndex().catch(noop);
      return;
    }
    for (const version of retryableVersions) {
      void queryClient
        .refetchQueries({ queryKey: patchReportKey(version), exact: true }, { cancelRefetch: false })
        .catch(noop);
    }
  }, [canRetry, indexRetryable, refetchIndex, queryClient, retryableVersions]);

  return useMemo<CatchUpLoader>(() => {
    const report = state.status === "ready_complete" || state.status === "ready_incomplete" ? (assembly?.report ?? null) : null;
    return {
      state,
      report,
      coverage: report?.coverage ?? null,
      range: okPlan ? { sincePatch: okPlan.sincePatch, throughPatch: okPlan.throughPatch } : null,
      listedVersions: okPlan?.listedVersions ?? null,
      requiredVersions: versions,
      resources: assembly?.resources ?? [],
      issues: assembly?.issues ?? [],
      retryableVersions,
      retrying,
      canRetry,
      retry,
    };
  }, [state, assembly, okPlan, versions, retryableVersions, retrying, canRetry, retry]);
}
