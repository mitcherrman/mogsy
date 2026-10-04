/**
 * Line eligibility: which patch-report changes Impact may say anything about.
 *
 * Pure and fail-closed. `mogzy_property` is the only property gate; Riot's
 * structured before/after own the changed parameter. `mogzy_status`,
 * `mogzy_current_raw` and reconciliation state are never read here.
 */
import type { PatchReportCard, PatchReportChange } from "@/lib/patch-reports/api";
import { isDirectionGroupedCard, normalizeAbilitySlot } from "@/lib/patch-reports/report-structure";
import { V1_PROPERTIES, isV1Property, propertyOf, type V1Property } from "./families";
import { parseImpactPair } from "./grammar";
import type { ImpactFamily, ImpactHalf, ImpactUnavailableReason } from "./types";

export type StatedHalf = { before: number; after: number };

export type EligibleLine = {
  /** `mogzy_property` of the line, i.e. the half Riot's label named. */
  property: V1Property;
  family: ImpactFamily;
  /** The half Riot's label named. */
  half: ImpactHalf;
  shape: "scalar" | "compound";
  /** Every half the line states: one for a scalar, both for a compound. */
  stated: Partial<Record<ImpactHalf, StatedHalf>>;
  /** Halves whose value actually changed. Never empty on an eligible line. */
  moved: ImpactHalf[];
};

export type Eligibility =
  | { ok: true; line: EligibleLine }
  | { ok: false; reason: ImpactUnavailableReason };

/** A Champions-section champion card (the same gate the report grouping uses). */
export function isChampionsSectionChampionCard(card: PatchReportCard): boolean {
  return card.entity_type === "champion" && isDirectionGroupedCard(card);
}

export function isBaseStatsGroup(change: PatchReportChange): boolean {
  return (change.group_title ?? "").trim().toLowerCase() === "base stats";
}

/** Scope gate shared with the continuity scan. */
export function isImpactScopedLine(card: PatchReportCard, change: PatchReportChange): boolean {
  return (
    isChampionsSectionChampionCard(card) &&
    change.change_kind === "numeric" &&
    normalizeAbilitySlot(change.ability_slot) === null &&
    isBaseStatsGroup(change)
  );
}

export function classifyChange(card: PatchReportCard, change: PatchReportChange): Eligibility {
  if (!isImpactScopedLine(card, change)) return { ok: false, reason: "out_of_scope" };

  const property = change.mogzy_property;
  if (typeof property !== "string" || property === "") {
    return { ok: false, reason: "property_unmapped" };
  }
  if (!isV1Property(property)) return { ok: false, reason: "property_unsupported" };

  const spec = V1_PROPERTIES[property];
  const pair = parseImpactPair(property, change.before_raw, change.after_raw);
  if (!pair.ok) return { ok: false, reason: "unparseable_value" };

  const stated: EligibleLine["stated"] = {};
  if (pair.shape === "scalar") {
    stated[spec.half] = { before: pair.before, after: pair.after };
  } else {
    stated.base = { before: pair.before.base, after: pair.after.base };
    stated.growth = { before: pair.before.growth, after: pair.after.growth };
    // A compound line is only ever attached to a family with both columns.
    if (propertyOf(spec.family, "base") === null || propertyOf(spec.family, "growth") === null) {
      return { ok: false, reason: "unparseable_value" };
    }
  }

  const moved = (["base", "growth"] as const).filter((half) => {
    const value = stated[half];
    return value !== undefined && value.before !== value.after;
  });
  if (moved.length === 0) return { ok: false, reason: "no_parameter_change" };

  return {
    ok: true,
    line: { property, family: spec.family, half: spec.half, shape: pair.shape, stated, moved },
  };
}
