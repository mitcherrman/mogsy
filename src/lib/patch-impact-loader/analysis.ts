/**
 * Glue between the loaded evidence and the PH2-A analyzer. Pure: no fetching,
 * no React. The loader decides WHEN evidence is worth fetching; the analyzer
 * alone decides what it proves.
 */
import { analyzeChampionStatChange } from "@/lib/patch-impact";
import type { ImpactUnavailableReason, PatchImpactAnalysis, PatchImpactInput } from "@/lib/patch-impact";
import type { PatchReportCard, PatchReportChange } from "@/lib/patch-reports/api";
import type { PatchImpactLoadFailure, LoadedImpactEvidence } from "./evidence";

export type PatchImpactSubject = {
  card: PatchReportCard;
  change: PatchReportChange;
  patchVersion: string;
};

/**
 * The immediate analysis: Riot's own parameter facts plus every projection that
 * needs nothing beyond the card itself. Zero network, safe to run on render.
 */
export function analyzeImmediate(subject: PatchImpactSubject): PatchImpactAnalysis {
  return analyzeChampionStatChange({ ...subject });
}

/**
 * Would canonical stats and the later-report chain change this analysis?
 *
 * PH2-A returns `history_incomplete` exactly when the projection's rule order
 * reached the canonical rule and no evidence was supplied. Every other outcome
 * (projected from Riot, deferred family, unresolved identity, ambiguous card,
 * unparseable value, ...) is decided by the card alone, and no amount of loading
 * can alter it.
 */
export function needsImpactEvidence(immediate: PatchImpactAnalysis): boolean {
  return immediate.status === "parameter_only" && immediate.projectionUnavailable === "history_incomplete";
}

/**
 * The enriched analysis: the exact analyzer call, fed the loaded evidence.
 * Returns null if the analyzer throws on a malformed payload, so the caller can
 * fail closed instead of breaking the Patch Report.
 */
export function analyzeWithEvidence(
  subject: PatchImpactSubject,
  evidence: LoadedImpactEvidence,
): PatchImpactAnalysis | null {
  const input: PatchImpactInput = {
    ...subject,
    canonical: evidence.canonical,
    laterReports: evidence.laterReports,
    laterVersionsExpected: evidence.laterVersionsExpected,
    reconciliationByVersion: evidence.reconciliationByVersion,
  };
  try {
    return analyzeChampionStatChange(input);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Machine-readable load state                                                */
/* -------------------------------------------------------------------------- */

export type PatchImpactLoadState =
  /** Riot's card already yields a projection; nothing to load, ever. */
  | { status: "not_required"; reason: "riot_complete" }
  /** Card alone decides this; loading cannot change it. `reason` is the domain's. */
  | { status: "unavailable"; reason: ImpactUnavailableReason }
  /** Evidence would help; nothing has been requested, nothing has been fetched. */
  | { status: "idle" }
  | { status: "loading" }
  /** Evidence loaded and the analyzer ran; `analysis` is its (possibly still parameter-only) verdict. */
  | { status: "ready" }
  /** Loading failed. `analysis` stays the immediate one; nothing is fabricated. */
  | { status: "failed"; error: PatchImpactLoadFailure };

/** Terminal state implied by the immediate analysis alone (no request involved). */
export function immediateLoadState(immediate: PatchImpactAnalysis): PatchImpactLoadState {
  if (immediate.status === "projected") return { status: "not_required", reason: "riot_complete" };
  if (needsImpactEvidence(immediate)) return { status: "idle" };
  return {
    status: "unavailable",
    reason: immediate.status === "unavailable" ? immediate.reason : immediate.projectionUnavailable,
  };
}
