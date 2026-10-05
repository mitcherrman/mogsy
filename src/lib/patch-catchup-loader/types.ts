/**
 * Catch-Up loader types (PH3-C). The loader acquires evidence for the PH3-B
 * domain; it owns no Catch-Up truth. Everything about ranges, lines, chains and
 * coverage is the domain's (`@/lib/patch-catchup`), passed through untouched.
 *
 * Operational outcome and Catch-Up coverage are SEPARATE axes:
 *   - `failed`            the loader could not produce a report at all.
 *   - `ready_incomplete`  a report exists, but coverage is not complete (a report
 *                         failed / was malformed / conflicted, or the domain saw
 *                         a gap). Riot lines are still complete for the loaded
 *                         patches; the domain withholds continuity.
 *   - `ready_complete`    every patch in (since, through] loaded cleanly and the
 *                         domain reports complete coverage.
 */
import type { CatchUpCoverage, CatchUpReport, RangeInvalidDetail } from "@/lib/patch-catchup";

/* -------------------------------------------------------------------------- */
/* Failure (no report)                                                        */
/* -------------------------------------------------------------------------- */

export type CatchUpLoadFailureCode =
  /** `/api/patch-reports` rejected (network, 4xx/5xx, invalid JSON). */
  | "index_failed"
  /** The index payload is not `{ patches: [{ patch_version: string }] }`. */
  | "index_malformed"
  /** The selected range cannot be evaluated (see `detail`). */
  | "range_invalid"
  /** The range is non-empty but not one of its patches produced a usable report. */
  | "reports_unavailable"
  /** The domain threw. Never expected; surfaced instead of crashing the page. */
  | "domain_error";

export type CatchUpLoadFailure = {
  code: CatchUpLoadFailureCode;
  /**
   * `range_invalid`: the domain's `RangeInvalidDetail`, or `no_listed_patches`
   * (no `throughPatch` was given and the index lists no orderable patch).
   */
  detail: RangeInvalidDetail | "no_listed_patches" | null;
  /** Versions involved (`reports_unavailable`: the missing patches). */
  versions: string[];
  message: string;
};

/* -------------------------------------------------------------------------- */
/* Per-report resources and loader issues                                     */
/* -------------------------------------------------------------------------- */

export type CatchUpResourceStatus =
  /** Never produced a result yet (not started, or in flight for the first time). */
  | "pending"
  /** Loaded, valid, and passed to the domain. */
  | "loaded"
  /** The request rejected. */
  | "failed"
  /** A payload arrived but is not the report that was asked for / has no usable shape. */
  | "malformed"
  /** Another report for the same semantic patch is materially different; neither is used. */
  | "conflicting"
  /** An identical duplicate of a kept report for the same semantic patch; not passed twice. */
  | "duplicate_collapsed";

export type CatchUpReportResource = {
  /** The listed spelling that was requested (`["patch-report", version]`). */
  version: string;
  status: CatchUpResourceStatus;
  message: string | null;
};

export type CatchUpLoadIssueKind =
  | "report_request_failed"
  | "report_malformed"
  | "report_conflict"
  /** `throughPatch` is a valid version the index does not list; it is not requested. */
  | "through_not_listed";

/** Something the loader (not the domain) knows made coverage incomplete. */
export type CatchUpLoadIssue = {
  kind: CatchUpLoadIssueKind;
  version: string;
  message: string;
};

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export type CatchUpLoaderState =
  /** `enabled` is false: no subscription, no request, nothing surfaced. */
  | { status: "disabled" }
  /** Enabled, but there is no baseline yet (`sincePatch` is null/empty). Nothing fetched. */
  | { status: "idle" }
  | { status: "loading_index" }
  | {
      status: "loading_reports";
      /** Versions that have never produced a result. */
      pending: string[];
      settled: number;
      total: number;
    }
  | { status: "ready_complete" }
  | { status: "ready_incomplete" }
  | { status: "failed"; failure: CatchUpLoadFailure };

export type CatchUpLoaderRange = {
  sincePatch: string;
  /** The explicit `throughPatch`, or the newest orderable listed patch when none was given. */
  throughPatch: string;
};

export type CatchUpLoader = {
  state: CatchUpLoaderState;
  /** The PH3-B report. Present only in `ready_complete` / `ready_incomplete`. */
  report: CatchUpReport | null;
  /** `report.coverage`, for convenience (same object). */
  coverage: CatchUpCoverage | null;
  range: CatchUpLoaderRange | null;
  /** The full index listing, exactly as `/api/patch-reports` returned it. */
  listedVersions: string[] | null;
  /** Report versions (X excluded, Y included) this range needs, oldest first. */
  requiredVersions: string[];
  /** One entry per required version. */
  resources: CatchUpReportResource[];
  /** Loader-side reasons coverage is incomplete (complements `coverage.issues`). */
  issues: CatchUpLoadIssue[];
  /** Versions `retry()` would re-request (failed, malformed or conflicting). */
  retryableVersions: string[];
  /** A re-request of a previously failed resource is in flight. */
  retrying: boolean;
  /** True when `retry()` would start something. */
  canRetry: boolean;
  /**
   * Re-request ONLY the failed resources (the index when it failed; otherwise
   * each failed / malformed / conflicting report). Reports that loaded are never
   * re-requested. A no-op when nothing is retryable or a retry is in flight.
   */
  retry: () => void;
};
