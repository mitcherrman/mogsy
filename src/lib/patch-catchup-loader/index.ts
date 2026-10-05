/**
 * Patch Hub Catch-Up loader (PH3-C): evidence acquisition for the PH3-B domain.
 * Pure planning/assembly/state here; the React Query wiring is
 * `@/hooks/usePatchCatchUpLoader`. See docs/PATCH_HUB_PH3_CATCHUP_LOADER_HANDOFF.md.
 */
export {
  assembleCatchUp,
  dedupeReportsByPatch,
  reportProblem,
  reportsAgree,
  type CatchUpAssembly,
  type DedupEntry,
  type DedupResult,
  type ReportEntry,
} from "./assemble";
export {
  CATCHUP_REPORT_STALE_MS,
  PATCH_REPORTS_KEY,
  patchReportKey,
  planCatchUpRange,
  type CatchUpPlan,
} from "./plan";
export { deriveCatchUpLoaderState, indexFailure, type IndexSnapshot, type StateInput } from "./state";
export type * from "./types";
