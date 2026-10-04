/**
 * Patch Impact analysis: the one entry point a consumer needs.
 *
 * Deterministic and pure: no fetching, no clock, no input mutation. The caller
 * supplies the evidence (live canonical stats, later reports) it has loaded; a
 * missing piece never yields a partial projection, only parameter facts with the
 * reason the projection is unavailable.
 */
import { classifyChange } from "./eligibility";
import { resolveProjectionInputs, type CompanionEvidence } from "./companion";
import { IMPACT_CHECKPOINTS, crossoverLevel, parameterFact, projectFlatLevels } from "./math";
import { isProjectableFamily, propertyOf } from "./families";
import type { ParameterFact, PatchImpactAnalysis } from "./types";

export type PatchImpactInput = CompanionEvidence;

export function analyzeChampionStatChange(input: PatchImpactInput): PatchImpactAnalysis {
  const eligibility = classifyChange(input.card, input.change);
  if (eligibility.ok === false) return { status: "unavailable", reason: eligibility.reason };
  const { line } = eligibility;

  // Riot-only parameter facts, one per half that moved. They need no Mogzy data,
  // so they never depend on reconciliation state or on any evidence being loaded.
  const facts: ParameterFact[] = [];
  for (const half of line.moved) {
    const stated = line.stated[half];
    const property = propertyOf(line.family, half);
    if (stated && property) {
      facts.push(parameterFact({ property, before: stated.before, after: stated.after }));
    }
  }

  if (!isProjectableFamily(line.family)) {
    return {
      status: "parameter_only",
      family: line.family,
      facts,
      projectionUnavailable: "projection_deferred",
    };
  }

  const resolution = resolveProjectionInputs(line, input);
  if (resolution.ok === false) {
    return {
      status: "parameter_only",
      family: line.family,
      facts,
      projectionUnavailable: resolution.reason,
    };
  }

  const levels = projectFlatLevels(resolution.inputs);
  return {
    status: "projected",
    family: line.family,
    facts,
    projection: {
      family: line.family,
      inputs: resolution.inputs,
      trust: resolution.trust,
      levels,
      checkpoints: IMPACT_CHECKPOINTS,
      crossoverLevel: crossoverLevel(levels),
    },
  };
}
