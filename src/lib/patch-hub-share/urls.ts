import { catchUpSearch, patchReportHref } from "@/components/patch-catchup/route";
import { SITE_URL } from "@/lib/site-config";

/**
 * Canonical, absolute Patch Hub share URLs (PH4-A).
 *
 * They are built from explicit inputs, never from `window.location`, so a copy
 * made while the page shows "whatever is latest" still names its patch. The two
 * view contracts stay mutually exclusive:
 *
 *   report   /lol/patch-reports?patch=<version>#<semantic anchor>
 *   catch-up /lol/patch-reports?since=<baseline>#cu-…
 */

const REPORT_PATH = "/lol/patch-reports";

/** Entity, group or labelled-change anchor inside one explicit patch report. */
export const reportAnchorUrl = (patch: string, anchor: string): string =>
  `${SITE_URL}${patchReportHref(patch, anchor)}`;

/** One Catch-Up entry under an explicit baseline. Null when there is no baseline to name. */
export function catchUpEntryUrl(since: string | null, entryId: string): string | null {
  if (!since || !since.trim()) return null;
  return `${SITE_URL}${REPORT_PATH}${catchUpSearch(since.trim())}#${entryId}`;
}
