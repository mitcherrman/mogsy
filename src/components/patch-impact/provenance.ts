/**
 * Where an Impact number came from, in the three tiers the presentation must be
 * able to tell apart. Quiet by design: this builds trust, it is not a banner.
 *
 * Mogzy's per-line status and promote-time "current raw" snapshot are never an
 * input here or anywhere in this component: they are not mathematical authority.
 */
import type {
  ImpactFamily,
  PatchImpactAnalysis,
  StatProjection,
  StatValue,
} from "@/lib/patch-impact/types";
import { formatStatValue, parameterLabel } from "./format";

export type PatchImpactProvenanceKind =
  /** Parameter facts only: Riot's before and after, nothing else. */
  | "riot_parameter"
  /** A projection whose four inputs are all Riot's published numbers. */
  | "riot_projection"
  /** A projection that holds a companion value from Mogzy's canonical data. */
  | "mogzy_companion_projection";

const MOGZY_PROVENANCE = new Set<StatValue["provenance"]>(["canonical_current", "riot_later_before"]);

function projectionUsesMogzy(projection: StatProjection): boolean {
  // Either signal is enough. Under-claiming "Riot only" is the unsafe direction.
  return (
    projection.trust.usesMogzyData ||
    Object.values(projection.inputs).some((input) => MOGZY_PROVENANCE.has(input.provenance))
  );
}

/** `null` when the analysis is unavailable (nothing is rendered). */
export function impactProvenanceKind(
  analysis: PatchImpactAnalysis | null | undefined,
): PatchImpactProvenanceKind | null {
  if (!analysis || analysis.status === "unavailable") return null;
  if (analysis.status === "parameter_only") return "riot_parameter";
  return projectionUsesMogzy(analysis.projection) ? "mogzy_companion_projection" : "riot_projection";
}

export const PROVENANCE_COPY: Record<PatchImpactProvenanceKind, { short: string; long: string }> = {
  riot_parameter: {
    short: "Riot's patch notes",
    long: "Parameter change taken directly from Riot's patch notes.",
  },
  riot_projection: {
    short: "Riot's patch notes",
    long: "Projection built entirely from Riot's patch notes.",
  },
  mogzy_companion_projection: {
    short: "Riot's patch notes + Mogzy data",
    long: "Projection uses Mogzy's current champion data for the value this patch did not change.",
  },
};

function sourceOf(value: StatValue): string {
  switch (value.provenance) {
    case "riot_line":
      return "Riot's patch notes";
    case "riot_same_card":
      return "Riot's patch notes, another line in this entry";
    case "canonical_current":
      return "Mogzy's current champion data";
    case "riot_later_before":
      return value.patch
        ? `Riot's patch notes, the “before” value in patch ${value.patch}`
        : "Riot's patch notes, from a later patch";
  }
}

export type ProvenanceRow = {
  key: "base" | "growth";
  label: string;
  /** Text such as "66" (held constant) or "63 → 61". */
  values: string;
  /** One or two source sentences. */
  source: string;
  heldConstant: boolean;
  usesMogzyData: boolean;
};

function row(
  key: ProvenanceRow["key"],
  family: ImpactFamily,
  before: StatValue,
  after: StatValue,
): ProvenanceRow {
  const sameValue = before.value === after.value;
  const sameSource = before.provenance === after.provenance && before.patch === after.patch;
  const heldConstant = sameValue && sameSource && MOGZY_PROVENANCE.has(before.provenance);
  const values = sameValue
    ? formatStatValue(before.value)
    : `${formatStatValue(before.value)} → ${formatStatValue(after.value)}`;
  let source: string;
  if (heldConstant) {
    source = `${sourceOf(before)}, held the same before and after this patch`;
  } else if (sameSource) {
    source = sourceOf(before);
  } else {
    source = `before: ${sourceOf(before)}; after: ${sourceOf(after)}`;
  }
  return {
    key,
    label: parameterLabel(family, key),
    values,
    source,
    heldConstant,
    usesMogzyData: MOGZY_PROVENANCE.has(before.provenance) || MOGZY_PROVENANCE.has(after.provenance),
  };
}

/** One row per half (base, growth), naming each number's source. */
export function describeProjectionInputs(projection: StatProjection): ProvenanceRow[] {
  const { inputs, family } = projection;
  return [
    row("base", family, inputs.baseBefore, inputs.baseAfter),
    row("growth", family, inputs.growthBefore, inputs.growthAfter),
  ];
}
