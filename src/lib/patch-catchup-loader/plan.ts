/**
 * Which resources does a Catch-Up range need? (pure; no React, no fetch)
 *
 * Authorities (reused, never duplicated):
 *   fetchPatchReports()       key ["patch-reports"]          (PatchReports page, PH2-C)
 *   fetchPatchReport(version) key ["patch-report", version]  (PatchReports page, PH2-C)
 *
 * Ordering and range membership are PH3-B's (`comparePatchVersions` /
 * `isInRange` / `validateRange`): numeric and segment-wise, never lexical, never
 * list order, never release dates or build timestamps.
 */
import {
  comparePatchVersions,
  isInRange,
  orderVersions,
  validateRange,
} from "@/lib/patch-catchup";
import type { CatchUpLoadFailure } from "./types";

/** The same keys the Patch Reports page and the Patch Impact loader use. */
export const PATCH_REPORTS_KEY = ["patch-reports"] as const;
export const patchReportKey = (version: string) => ["patch-report", version] as const;

/**
 * Freshness for OUR observers on the shared keys: a copy younger than this is
 * used without a request, whoever put it there. Matches the Patch Impact loader
 * (reports are published artefacts).
 */
export const CATCHUP_REPORT_STALE_MS = 30 * 60 * 1000;

export type CatchUpPlan =
  | {
      ok: true;
      /** The index listing exactly as returned (order, duplicates and odd forms preserved). */
      listedVersions: string[];
      sincePatch: string;
      throughPatch: string;
      upToDate: boolean;
      /** Listed spellings inside (since, through], oldest first. The ONLY reports to request. */
      versions: string[];
      /** `throughPatch` is (semantically) present in the listing. */
      throughListed: boolean;
    }
  | { ok: false; failure: CatchUpLoadFailure };

const fail = (
  code: CatchUpLoadFailure["code"],
  message: string,
  detail: CatchUpLoadFailure["detail"] = null,
): CatchUpPlan => ({ ok: false, failure: { code, detail, versions: [], message } });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Plan the fetch set for `(sincePatch, throughPatch]` from the raw index payload.
 *
 * `throughPatch` null/undefined means "the newest listed patch": the domain
 * never reads "latest", so it is resolved here, by semantic order.
 */
export function planCatchUpRange(
  indexData: unknown,
  sincePatch: string,
  throughPatch: string | null | undefined,
): CatchUpPlan {
  if (!isRecord(indexData) || !Array.isArray(indexData.patches)) {
    return fail("index_malformed", "The patch list is not a list of patches.");
  }
  const listedVersions: string[] = [];
  for (const entry of indexData.patches) {
    const version = isRecord(entry) ? entry.patch_version : undefined;
    if (typeof version !== "string" || version.trim() === "") {
      return fail("index_malformed", "The patch list has an entry without a patch version.");
    }
    listedVersions.push(version);
  }

  let through = throughPatch ?? null;
  if (through === null) {
    const newest = orderVersions(listedVersions).ordered.at(-1);
    if (!newest) {
      return fail("range_invalid", "The patch list has no orderable patch to end the range at.", "no_listed_patches");
    }
    through = newest;
  }

  const range = validateRange(sincePatch, through);
  if (range.ok === false) {
    return fail("range_invalid", `The selected range is not valid (${range.detail}).`, range.detail);
  }

  const versions = range.upToDate
    ? []
    : orderVersions(
        [...new Set(listedVersions)]
          .filter((version) => isInRange(version, sincePatch, through))
          // Equal-ranked spellings (26.4 / 26.04): break the tie by spelling, not listing order.
          .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      ).ordered;
  const throughListed = listedVersions.some((v) => comparePatchVersions(v, through) === 0);

  return {
    ok: true,
    listedVersions,
    sincePatch,
    throughPatch: through,
    upToDate: range.upToDate,
    versions,
    throughListed,
  };
}
