/**
 * ATL-P1-C — comparison composition.
 *
 * The workspace decides WHICH two Lenses to compare; the sources decide
 * WHETHER a difference is allowed. A difference is only computed when both
 * sides read the same facet, in the same unit, inside the same population.
 * Otherwise the pair is shown side by side with the delta blocked, or the
 * comparison is blocked outright.
 */
import { contextLabel, sameContext } from "./context";
import type { Comparison, ComparisonView, Facet, FacetDifference, LensView } from "./types";

function numericDelta(a: Facet["value"], b: Facet["value"]): number | number[] | null {
  if (typeof a === "number" && typeof b === "number") return Math.round((b - a) * 100) / 100;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.map((x, i) => Math.round((b[i] - x) * 100) / 100);
  }
  return null;
}

export function composeComparison(comparison: Comparison, a: LensView, b: LensView): ComparisonView {
  const blocked = (reason: string): ComparisonView => ({ comparison, a, b, verdict: { kind: "blocked", reason } });

  if (a.universe !== b.universe) {
    return blocked(`Different universes (${a.universe} vs ${b.universe}). Transform one Lens first.`);
  }
  if (a.lens.subject.kind !== b.lens.subject.kind) {
    return blocked(`Different subject kinds (${a.lens.subject.kind} vs ${b.lens.subject.kind}).`);
  }
  if (a.capability === "gated" || b.capability === "gated") {
    return blocked("A sealed owner-only Lens cannot take part in a comparison.");
  }
  if (a.coverage === "unavailable" || b.coverage === "unavailable" || a.coverage === "not_applicable" || b.coverage === "not_applicable") {
    return blocked("One side has no values under its effective context. Align the contexts or clear the override.");
  }
  if (!sameContext(a.effective.context, b.effective.context)) {
    return blocked(`Contexts differ (${contextLabel(a.effective.context)} vs ${contextLabel(b.effective.context)}). Side-by-side reading across contexts is not a comparison.`);
  }

  const rows: FacetDifference[] = [];
  const notes: string[] = [];
  let anyDelta = false;
  let anyBlocked = false;

  for (const fa of a.facets) {
    const fb = b.facets.find((f) => f.key === fa.key);
    if (!fb) continue;
    let delta: FacetDifference["delta"] = null;
    let reason: string | null = null;
    if (fa.unit !== fb.unit) {
      reason = "units differ";
    } else if (fa.value === null || fb.value === null) {
      reason = "one side is not covered";
    } else if (fa.population !== fb.population) {
      reason = "populations differ";
    } else {
      delta = numericDelta(fa.value, fb.value);
      if (delta === null) reason = "not numeric";
    }
    if (delta !== null) anyDelta = true;
    if (reason) anyBlocked = true;
    rows.push({ key: fa.key, label: fa.label, unit: fa.unit, a: fa.value, b: fb.value, delta, deltaBlockedReason: reason });
  }

  if (rows.length === 0) return blocked("No shared facets.");

  const sameKind = a.lens.subject.kind;
  if (sameKind === "player-champion") {
    notes.push("Each cell is its own population (one player's games). Differences are blocked; read the cells side by side.");
  }
  if (sameKind === "champion") {
    notes.push("Same season scope and population; denominators differ per champion and are printed with each rate.");
  }
  if (sameKind === "ability") {
    notes.push("Same catalog snapshot; per-rank deltas are Syndra minus Ahri in the order the Lenses were selected (b − a).");
  }
  if (anyBlocked && !anyDelta) {
    return { comparison, a, b, verdict: { kind: "side-by-side", rows, notes } };
  }
  return { comparison, a, b, verdict: { kind: "comparable", rows, notes } };
}
