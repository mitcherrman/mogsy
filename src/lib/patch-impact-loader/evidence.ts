/**
 * Patch Impact evidence loader (PH2-C): the lazy data substrate behind the
 * PH2-A analyzer. No React and no presentation; the hook in
 * `@/hooks/usePatchImpactLoader` is the only caller that matters.
 *
 * Authorities (reused, never re-implemented):
 *   fetchPatchReports()       key ["patch-reports"]                     (PatchReports page)
 *   fetchPatchReport(version) key ["patch-report", version]             (PatchReports page)
 *   fetchChampionBaseStats()  key ["league-docs","champion-base-stats"] (useChampionBaseStats)
 *
 * Every read goes through `queryClient.fetchQuery` on those keys, so a report the
 * page already holds is a cache hit and concurrent callers share one request.
 * Nothing here runs until a caller asks; loading is never a side effect of
 * rendering a Patch Report.
 */
import type { QueryClient } from "@tanstack/react-query";
import { comparePatchVersions, parsePatchVersion } from "@/lib/patch-impact";
import type { ChampionBaseStats } from "@/lib/league-docs/api";
import { fetchChampionBaseStats } from "@/lib/league-docs/api";
import {
  fetchPatchReport,
  fetchPatchReports,
  type PatchReconciliationStatus,
  type PatchReportDetail,
  type PatchReportSummary,
} from "@/lib/patch-reports/api";

/* -------------------------------------------------------------------------- */
/* Query keys and freshness                                                   */
/* -------------------------------------------------------------------------- */

/** Same keys the existing pages use, so their cached data is reused. */
export const PATCH_REPORTS_KEY = ["patch-reports"] as const;
export const patchReportKey = (version: string) => ["patch-report", version] as const;
export const CHAMPION_BASE_STATS_KEY = ["league-docs", "champion-base-stats"] as const;
/** The assembled evidence for one analysed patch (champion-independent). */
export const impactEvidenceKey = (patchVersion: string) =>
  ["patch-impact", "evidence", patchVersion] as const;

/**
 * Freshness passed to `fetchQuery` for the shared reads. A cached copy younger
 * than this is used without a request, whoever put it there. Reports are
 * published artefacts, so half an hour is well inside "same as what the page
 * shows"; canonical stats match `useChampionBaseStats`.
 */
export const IMPACT_REPORT_STALE_MS = 30 * 60 * 1000;
export const IMPACT_CANONICAL_STALE_MS = 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Failure vocabulary                                                         */
/* -------------------------------------------------------------------------- */

export type PatchImpactLoadErrorCode =
  /** A public accessor rejected (network, 4xx/5xx, invalid JSON). */
  | "request_failed"
  /** The version list is unusable: bad/duplicate version, or P is not listed. */
  | "patch_chain_malformed"
  /** A report payload is not the report that was asked for. */
  | "report_malformed"
  /** The canonical champion table is not an array. */
  | "canonical_malformed"
  /** The loaded evidence could not be analysed (the analyzer rejected it). */
  | "analysis_failed";

export type PatchImpactLoadResource = "patch-reports" | "patch-report" | "champion-stats";

/** Machine-readable failure; also what the loader throws internally. */
export type PatchImpactLoadFailure = {
  code: PatchImpactLoadErrorCode;
  resource: PatchImpactLoadResource | null;
  /** The report version involved, when there is one. */
  version: string | null;
  message: string;
};

export class PatchImpactLoadError extends Error implements PatchImpactLoadFailure {
  readonly code: PatchImpactLoadErrorCode;
  readonly resource: PatchImpactLoadResource | null;
  readonly version: string | null;
  /** The underlying rejection, when this wraps one. */
  readonly cause?: unknown;

  constructor(
    code: PatchImpactLoadErrorCode,
    message: string,
    detail: { resource?: PatchImpactLoadResource; version?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.cause = detail.cause;
    this.name = "PatchImpactLoadError";
    this.code = code;
    this.resource = detail.resource ?? null;
    this.version = detail.version ?? null;
  }
}

/** Plain-object view of any thrown value, safe to hand to the UI. */
export function toLoadFailure(error: unknown): PatchImpactLoadFailure {
  if (error instanceof PatchImpactLoadError) {
    return {
      code: error.code,
      resource: error.resource,
      version: error.version,
      message: error.message,
    };
  }
  return {
    code: "request_failed",
    resource: null,
    version: null,
    message: error instanceof Error ? error.message : "Patch Impact evidence could not be loaded.",
  };
}

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

/** Everything PH2-A needs beyond the card, change and patch version. */
export type LoadedImpactEvidence = {
  canonical: ChampionBaseStats[];
  /** Strictly later than P, oldest first. */
  laterReports: PatchReportDetail[];
  /** Every version the list endpoint reports (the analyzer filters to > P). */
  laterVersionsExpected: string[];
  /**
   * Reconciliation status AS THE PAYLOADS REPORT IT, for P and each later
   * report. A report with no `reconciliation` block has no entry: absence is
   * preserved, never turned into a status.
   */
  reconciliationByVersion: Partial<Record<string, PatchReconciliationStatus>>;
};

async function shared<T>(
  queryClient: QueryClient,
  resource: PatchImpactLoadResource,
  version: string | null,
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  staleTime: number,
): Promise<T> {
  try {
    return await queryClient.fetchQuery({ queryKey, queryFn, staleTime, retry: false });
  } catch (cause) {
    if (cause instanceof PatchImpactLoadError) throw cause;
    throw new PatchImpactLoadError(
      "request_failed",
      `Patch Impact could not load ${resource}${version ? ` ${version}` : ""}.`,
      { resource, version: version ?? undefined, cause },
    );
  }
}

function loadReport(queryClient: QueryClient, version: string): Promise<PatchReportDetail> {
  return shared(
    queryClient,
    "patch-report",
    version,
    patchReportKey(version),
    () => fetchPatchReport(version),
    IMPACT_REPORT_STALE_MS,
  ).then((report) => {
    if (
      !report ||
      typeof report !== "object" ||
      report.patch_version !== version ||
      !Array.isArray(report.cards)
    ) {
      throw new PatchImpactLoadError(
        "report_malformed",
        `Patch report ${version} is not the report that was requested.`,
        { resource: "patch-report", version },
      );
    }
    return report;
  });
}

/**
 * The listed versions, validated: every entry parses, none repeats, and P is
 * among them. Order is whatever the API returned; nothing here relies on it.
 */
function listedVersions(summaries: readonly PatchReportSummary[] | undefined, patchVersion: string): string[] {
  if (!Array.isArray(summaries)) {
    throw new PatchImpactLoadError("patch_chain_malformed", "The patch list is not a list.", {
      resource: "patch-reports",
    });
  }
  const versions: string[] = [];
  const seen = new Set<string>();
  for (const summary of summaries) {
    const version = summary?.patch_version;
    if (typeof version !== "string" || !parsePatchVersion(version) || seen.has(version)) {
      throw new PatchImpactLoadError(
        "patch_chain_malformed",
        `The patch list has an unusable or repeated version (${String(version)}).`,
        { resource: "patch-reports", version: typeof version === "string" ? version : undefined },
      );
    }
    seen.add(version);
    versions.push(version);
  }
  if (!seen.has(patchVersion)) {
    throw new PatchImpactLoadError(
      "patch_chain_malformed",
      `Patch ${patchVersion} is not in the patch list.`,
      { resource: "patch-reports", version: patchVersion },
    );
  }
  return versions;
}

/**
 * Load the evidence PH2-A needs to resolve a canonical companion for a change in
 * patch `patchVersion`: the version list, canonical champion stats and P's own
 * report (independent, so in parallel), then every strictly later report
 * (parallel again). Rejects with a {@link PatchImpactLoadError}; the caller turns
 * that into a state. Never returns partial evidence.
 */
export async function loadImpactEvidence(
  queryClient: QueryClient,
  patchVersion: string,
): Promise<LoadedImpactEvidence> {
  if (!parsePatchVersion(patchVersion)) {
    throw new PatchImpactLoadError(
      "patch_chain_malformed",
      `"${patchVersion}" is not a patch version.`,
      { resource: "patch-report", version: patchVersion },
    );
  }

  const [list, canonical, own] = await Promise.all([
    shared(queryClient, "patch-reports", null, PATCH_REPORTS_KEY, fetchPatchReports, IMPACT_REPORT_STALE_MS),
    shared(
      queryClient,
      "champion-stats",
      null,
      CHAMPION_BASE_STATS_KEY,
      fetchChampionBaseStats,
      IMPACT_CANONICAL_STALE_MS,
    ),
    loadReport(queryClient, patchVersion),
  ]);

  if (!Array.isArray(canonical)) {
    throw new PatchImpactLoadError("canonical_malformed", "Canonical champion stats are not a list.", {
      resource: "champion-stats",
    });
  }
  const expected = listedVersions(list?.patches, patchVersion);

  const laterVersions = expected
    .filter((version) => (comparePatchVersions(version, patchVersion) ?? 0) > 0)
    .sort((a, b) => comparePatchVersions(a, b) ?? 0);
  const laterReports = await Promise.all(laterVersions.map((version) => loadReport(queryClient, version)));

  const reconciliationByVersion: LoadedImpactEvidence["reconciliationByVersion"] = {};
  for (const report of [own, ...laterReports]) {
    const status = report.reconciliation?.status;
    if (status) reconciliationByVersion[report.patch_version] = status;
  }

  return {
    canonical,
    laterReports,
    laterVersionsExpected: expected,
    reconciliationByVersion,
  };
}
