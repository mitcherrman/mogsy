/**
 * Turn whatever the cache holds for a planned range into ONE PH3-B call
 * (pure; no React, no fetch).
 *
 * Contract with the domain (`docs/PATCH_HUB_PH3_CATCHUP_HANDOFF.md` §4, §10.8):
 *   - `reports` = only reports that loaded AND validated, at most ONE per
 *     semantic patch, complete and untouched (same objects the cache holds; never
 *     filtered down to chainable cards).
 *   - `listedVersions` = the full index listing.
 *   A failed / malformed / conflicting report is therefore simply absent from
 *   `reports` and the domain reports `missing_report`, withholds continuity and
 *   keeps every Riot line it does have. Nothing is synthesised or repaired.
 */
import {
  buildCatchUpReport,
  parsePatchVersion,
  type CatchUpReport,
} from "@/lib/patch-catchup";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import type { CatchUpPlan } from "./plan";
import type {
  CatchUpLoadFailure,
  CatchUpLoadIssue,
  CatchUpReportResource,
} from "./types";

type OkPlan = Extract<CatchUpPlan, { ok: true }>;

/** What the cache currently says about one requested report. */
export type ReportEntry = {
  version: string;
  /** Raw cached payload; undefined until something loaded. */
  data: unknown;
  /** The query is in error state (and holds no data). */
  failed: boolean;
  errorMessage: string | null;
};

export type CatchUpAssembly = {
  resources: CatchUpReportResource[];
  issues: CatchUpLoadIssue[];
  /** Versions with no result at all yet. */
  pending: string[];
  /** Failed, malformed or conflicting: what `retry()` re-requests. */
  retryableVersions: string[];
  /** Null while anything is pending, or when `failure` is set. */
  report: CatchUpReport | null;
  failure: CatchUpLoadFailure | null;
};

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Why a payload is not the report that was requested, or null when it is usable.
 * Structural only: enough that the domain cannot be handed something it would
 * throw on. Content (Riot's words) is never judged here.
 */
export function reportProblem(version: string, payload: unknown): string | null {
  if (!isRecord(payload)) return `Patch report ${version} is not an object.`;
  if (payload.patch_version !== version) {
    return `Patch report ${version} says it is patch ${String(payload.patch_version)}.`;
  }
  if (!Array.isArray(payload.cards)) return `Patch report ${version} has no list of cards.`;
  if (payload.section_titles !== undefined && !Array.isArray(payload.section_titles)) {
    return `Patch report ${version} has unusable section titles.`;
  }
  for (const card of payload.cards) {
    if (!isRecord(card) || !Array.isArray(card.changes) || !card.changes.every(isRecord)) {
      return `Patch report ${version} has a card without a usable list of changes.`;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* De-duplication                                                             */
/* -------------------------------------------------------------------------- */

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isRecord(a) || !isRecord(b)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]),
  );
}

/**
 * Two payloads for the same patch AGREE when the Riot-authored content the
 * Catch-Up reads is identical: section titles and every card. Build metadata
 * (`built_at`, `source_url`, `historical_context_summary` — whose
 * `adapter_elapsed_ms` changes on every request — and `reconciliation`) is not
 * content and never makes two copies "disagree".
 */
export function reportsAgree(a: PatchReportDetail, b: PatchReportDetail): boolean {
  return deepEqual(a.section_titles, b.section_titles) && deepEqual(a.cards, b.cards);
}

export type DedupEntry = { version: string; report: PatchReportDetail };

export type DedupResult = {
  /** At most one per semantic patch, in input order. */
  kept: DedupEntry[];
  /** Entries dropped because an identical report for the same patch is kept. */
  collapsed: DedupEntry[];
  /** Groups that disagree materially. NONE of their members is kept. */
  conflicts: DedupEntry[][];
};

/** `25.4` and `25.04` are the same patch (`comparePatchVersions`); so group semantically. */
function patchIdentity(version: string): string {
  const parsed = parsePatchVersion(version);
  return parsed ? `v:${parsed.join(".")}` : `raw:${version}`;
}

/**
 * Guarantee PH3-B at most one report per patch. A duplicate group whose members
 * all agree collapses to its first member; any disagreement fails the whole
 * group closed (nothing is picked), so the output never depends on input order.
 */
export function dedupeReportsByPatch(entries: readonly DedupEntry[]): DedupResult {
  const groups = new Map<string, DedupEntry[]>();
  for (const entry of entries) {
    const identity = patchIdentity(entry.report.patch_version);
    const group = groups.get(identity);
    if (group) group.push(entry);
    else groups.set(identity, [entry]);
  }
  const keptSet = new Set<DedupEntry>();
  const collapsed: DedupEntry[] = [];
  const conflicts: DedupEntry[][] = [];
  for (const group of groups.values()) {
    // Representative = the smallest spelling, so which of several identical copies is
    // kept never depends on request / listing order.
    const [first, ...rest] = [...group].sort((x, y) =>
      x.report.patch_version < y.report.patch_version ? -1 : x.report.patch_version > y.report.patch_version ? 1 : 0,
    );
    if (rest.every((other) => reportsAgree(first.report, other.report))) {
      keptSet.add(first);
      collapsed.push(...rest);
    } else {
      conflicts.push(group);
    }
  }
  return { kept: entries.filter((entry) => keptSet.has(entry)), collapsed, conflicts };
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

function failure(
  code: CatchUpLoadFailure["code"],
  message: string,
  versions: string[] = [],
): CatchUpLoadFailure {
  return { code, detail: null, versions, message };
}

/**
 * Classify every requested report, de-duplicate, call PH3-B once, and describe
 * what happened. While any requested report has never produced a result the
 * report is withheld (`pending`), so a half-loaded range is never shown as a
 * gap.
 */
export function assembleCatchUp(plan: OkPlan, entries: readonly ReportEntry[]): CatchUpAssembly {
  const resources: CatchUpReportResource[] = [];
  const issues: CatchUpLoadIssue[] = [];
  const pending: string[] = [];
  const retryable = new Set<string>();
  const valid: DedupEntry[] = [];

  for (const entry of entries) {
    if (entry.failed) {
      const message = entry.errorMessage ?? `Patch report ${entry.version} could not be loaded.`;
      resources.push({ version: entry.version, status: "failed", message });
      issues.push({ kind: "report_request_failed", version: entry.version, message });
      retryable.add(entry.version);
    } else if (entry.data === undefined) {
      resources.push({ version: entry.version, status: "pending", message: null });
      pending.push(entry.version);
    } else {
      const problem = reportProblem(entry.version, entry.data);
      if (problem) {
        resources.push({ version: entry.version, status: "malformed", message: problem });
        issues.push({ kind: "report_malformed", version: entry.version, message: problem });
        retryable.add(entry.version);
      } else {
        resources.push({ version: entry.version, status: "loaded", message: null });
        valid.push({ version: entry.version, report: entry.data as PatchReportDetail });
      }
    }
  }

  const setStatus = (version: string, status: CatchUpReportResource["status"], message: string | null) => {
    const resource = resources.find((r) => r.version === version);
    if (resource) {
      resource.status = status;
      resource.message = message;
    }
  };

  const { kept, collapsed, conflicts } = dedupeReportsByPatch(valid);
  for (const entry of collapsed) {
    setStatus(entry.version, "duplicate_collapsed", "An identical report for the same patch is already used.");
  }
  for (const group of conflicts) {
    const versions = group.map((entry) => entry.version);
    const message = `Patch reports ${versions.join(" and ")} are the same patch but differ; neither is used.`;
    for (const entry of group) {
      setStatus(entry.version, "conflicting", message);
      issues.push({ kind: "report_conflict", version: entry.version, message });
      retryable.add(entry.version);
    }
  }

  const retryableVersions = entries.map((e) => e.version).filter((v) => retryable.has(v));
  const base = { resources, issues, pending, retryableVersions };

  if (pending.length > 0) return { ...base, report: null, failure: null };

  if (!plan.upToDate && !plan.throughListed) {
    issues.push({
      kind: "through_not_listed",
      version: plan.throughPatch,
      message: `Patch ${plan.throughPatch} is not in the patch list, so it was not requested.`,
    });
  }

  let result: ReturnType<typeof buildCatchUpReport>;
  try {
    result = buildCatchUpReport({
      reports: kept.map((entry) => entry.report),
      sincePatch: plan.sincePatch,
      throughPatch: plan.throughPatch,
      listedVersions: plan.listedVersions,
    });
  } catch (cause) {
    return {
      ...base,
      report: null,
      failure: failure(
        "domain_error",
        `The Catch-Up could not be assembled (${cause instanceof Error ? cause.message : "unknown error"}).`,
      ),
    };
  }
  if (result.ok === false) {
    return {
      ...base,
      report: null,
      failure: { ...failure("range_invalid", `The selected range is not valid (${result.detail}).`), detail: result.detail },
    };
  }
  const { report } = result;

  // A non-empty range with not one usable report would otherwise read as "nothing changed".
  if (report.range.status === "range" && report.coverage.loadedPatches.length === 0) {
    return {
      ...base,
      report: null,
      failure: failure(
        "reports_unavailable",
        "None of the patch reports in this range could be loaded.",
        report.coverage.missingPatches,
      ),
    };
  }
  return { ...base, report, failure: null };
}
