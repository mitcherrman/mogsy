/**
 * Read-only extraction of authoritative calculation evidence for the 1v1
 * Combat Lab (`/combat-lab`, `src/pages/CombatLab.tsx`).
 *
 * Every value here is read straight off the backend response for
 * `/api/combat-lab/basic-attack` / `/api/combat-lab/active`. This module
 * computes no damage, no mitigation, no HP, and no formulas — it only reads
 * fields the server already put on the wire.
 *
 * Field provenance (verified against the backend repo, not assumed):
 *  - Each event's `metadata` — `runtime_event_to_dict()`
 *    (runtime_effect_registry.py) passes the engine's `RuntimeEvent.metadata`
 *    through unfiltered; `serialize_events()` (services/combat_helpers.py)
 *    does no trimming. Unlike the SIM2 team-sim response, there is no
 *    `trace_detail` gate on the 1v1 endpoints — when the underlying engine
 *    populated a key, it is on the wire.
 *  - `formula_text` / `formula_bindings` / `formula_status` / `formula_found`
 *    / `formula_missing_required` / `formula_warnings` / `formula_error` /
 *    `state_used` — set unconditionally by the generic formula resolver
 *    (`_diagnostic_metadata` in generic_ability_runtime.py) on every
 *    `champion_ability` event it emits. `formula_bindings` (CS2-2, commit
 *    6287be2, merged to origin/master) is every identifier `formula_text`
 *    references mapped to the value the server's own evaluator substituted
 *    for it — the authoritative calculation evidence. Absent entirely (never
 *    an empty object) for a champion-specific runtime implementation that
 *    computes damage in Python rather than through a formula.
 *  - Damage-pipeline stage fields (`raw_damage_before_pipeline`,
 *    `target_damage_before_defenses`, `target_damage_after_defenses`,
 *    `damage_after_modifiers`, `target_damage_after_reduction`,
 *    `post_mitigation_damage`) and `target_shield_absorbed` /
 *    `shield_absorbed` — stamped by scoped_damage_application.py, which both
 *    1v1 routes call directly. Only stages actually present are ever shown.
 *  - `damage_accounting` (top-level on the response) —
 *    `build_damage_accounting()` (services/combat_action_result.py):
 *    `{ total_applied_hp_damage, by_scope: { [scope]: { hp_before, hp_after,
 *    applied_hp_damage } } }`, computed from actual state transitions.
 */
import type { TimelineEvent, SandboxStepResponse } from "./api";

export const PRIMARY_SCOPE = "PRIMARY";

export type DamageScopeAccounting = {
  hp_before: number;
  hp_after: number;
  applied_hp_damage: number;
};

export type DamageAccounting = {
  total_applied_hp_damage: number;
  by_scope: Record<string, DamageScopeAccounting>;
};

export function asDamageAccounting(value: unknown): DamageAccounting | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const byScope = v.by_scope;
  if (!byScope || typeof byScope !== "object") return null;
  const out: Record<string, DamageScopeAccounting> = {};
  for (const [scope, entry] of Object.entries(byScope as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (
      typeof e.hp_before !== "number" ||
      typeof e.hp_after !== "number" ||
      typeof e.applied_hp_damage !== "number"
    ) {
      continue;
    }
    out[scope] = {
      hp_before: e.hp_before,
      hp_after: e.hp_after,
      applied_hp_damage: e.applied_hp_damage,
    };
  }
  return {
    total_applied_hp_damage:
      typeof v.total_applied_hp_damage === "number" ? v.total_applied_hp_damage : 0,
    by_scope: out,
  };
}

/** PRIMARY-scope hp_before/hp_after off a response's `damage_accounting`. */
export function primaryHp(
  response: SandboxStepResponse | null | undefined
): DamageScopeAccounting | null {
  const accounting = asDamageAccounting((response as Record<string, unknown> | null)?.damage_accounting);
  return accounting?.by_scope?.[PRIMARY_SCOPE] ?? null;
}

function eventMetadata(event: TimelineEvent): Record<string, unknown> {
  const meta = (event as Record<string, unknown>).metadata;
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
}

/** One champion_ability event's formula diagnostics, when present. */
export type FormulaEvidence = {
  formulaText: string | null;
  /**
   * The authoritative calculation evidence (CS2-2): every identifier
   * `formulaText` references, mapped to the value the server's own formula
   * evaluator actually used. `null` when the backend did not send the key —
   * the ONLY signal trusted for "no formula evidence exists"; never inferred
   * from `stateUsed`.
   */
  formulaBindings: Record<string, number> | null;
  /**
   * True iff this event's metadata carries the `formula_status` KEY at all.
   * Set unconditionally by the generic formula resolver, never by a
   * champion-specific runtime path — the reliable "went through the generic
   * resolver" signal.
   */
  isGenericFormulaEvent: boolean;
  formulaStatus: string | null;
  formulaFound: boolean | null;
  missingRequired: string[] | null;
  warnings: string[] | null;
  error: string | null;
};

export function formulaEvidence(event: TimelineEvent): FormulaEvidence | null {
  if (event.type !== "champion_ability") return null;
  const metadata = eventMetadata(event);
  const hasAny =
    "formula_text" in metadata || "formula_bindings" in metadata || "formula_status" in metadata;
  if (!hasAny) return null;

  const rawBindings = metadata.formula_bindings;
  let formulaBindings: Record<string, number> | null = null;
  if (rawBindings && typeof rawBindings === "object" && !Array.isArray(rawBindings)) {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(rawBindings as Record<string, unknown>)) {
      if (typeof value === "number") out[key] = value;
    }
    formulaBindings = out;
  }

  return {
    formulaText: typeof metadata.formula_text === "string" ? metadata.formula_text : null,
    formulaBindings,
    isGenericFormulaEvent: "formula_status" in metadata,
    formulaStatus: typeof metadata.formula_status === "string" ? metadata.formula_status : null,
    formulaFound: typeof metadata.formula_found === "boolean" ? metadata.formula_found : null,
    missingRequired: Array.isArray(metadata.formula_missing_required)
      ? (metadata.formula_missing_required as string[])
      : null,
    warnings: Array.isArray(metadata.formula_warnings) ? (metadata.formula_warnings as string[]) : null,
    error: typeof metadata.formula_error === "string" ? metadata.formula_error : null,
  };
}

export type PipelineStage = { key: string; label: string; value: number };

/**
 * Base stages, in the engine's actual execution order (verified against
 * scoped_damage_application.py): raw -> armor/MR mitigation -> % damage
 * reduction. Always shown when present, even when a stage didn't change the
 * number (e.g. true damage skips mitigation but still reports the same
 * value) — that equality is itself real evidence.
 */
const BASE_PIPELINE_STAGE_LABELS: Array<{ key: string; label: string }> = [
  { key: "raw_damage_before_pipeline", label: "Raw damage" },
  { key: "post_mitigation_damage", label: "After armor/MR mitigation" },
  { key: "target_damage_after_reduction", label: "After % damage reduction" },
];

/**
 * Amp stages (SIM2 Phase 8B/8D) sit between mitigation and % reduction in
 * the real pipeline, but the backend sets their percent key unconditionally
 * (0 when no amp applied) — showing a permanent "+0%" row for the vast
 * majority of actions that have none would bury the stages that matter. Read
 * the percent field itself to decide whether to show the stage; the damage
 * value shown is still exactly what the server computed, never derived here.
 */
const AMP_PIPELINE_STAGES: Array<{ percentKey: string; valueKey: string; verb: string }> = [
  { percentKey: "attacker_outgoing_damage_amp_percent", valueKey: "post_outgoing_amp_damage", verb: "Outgoing damage amp" },
  { percentKey: "target_damage_taken_amp_percent", valueKey: "post_amp_damage", verb: "Incoming damage amp" },
];

/** Only the stages actually present on this event's metadata, in pipeline order. */
export function pipelineStages(event: TimelineEvent): PipelineStage[] {
  const metadata = eventMetadata(event);
  const stages: PipelineStage[] = [];

  for (const { key, label } of BASE_PIPELINE_STAGE_LABELS) {
    if (key === "target_damage_after_reduction") {
      // Insert the amp stages ahead of % reduction, matching the engine's
      // actual order — mitigation, then outgoing/incoming amp, then reduction.
      for (const { percentKey, valueKey, verb } of AMP_PIPELINE_STAGES) {
        const percent = metadata[percentKey];
        const value = metadata[valueKey];
        if (typeof percent === "number" && percent !== 0 && typeof value === "number") {
          const sign = percent > 0 ? "+" : "";
          stages.push({ key: valueKey, label: `${verb} (${sign}${percent}%)`, value });
        }
      }
    }
    const value = metadata[key];
    if (typeof value === "number") stages.push({ key, label, value });
  }

  return stages;
}

export function shieldAbsorbed(event: TimelineEvent): number | null {
  const metadata = eventMetadata(event);
  const v = metadata.target_shield_absorbed ?? metadata.shield_absorbed;
  return typeof v === "number" ? v : null;
}

/** The event (of a batch) carrying pipeline stages, if any — a basic attack's
 * damage_packet event as much as a champion_ability one. */
export function pipelineEventFor(events: TimelineEvent[]): TimelineEvent | null {
  return events.find((e) => pipelineStages(e).length > 0) ?? null;
}

/** True only when a champion_ability event exists and reliably signals it did
 * NOT go through the generic formula resolver. */
export function isChampionRuntimeAction(events: TimelineEvent[]): boolean {
  const abilityEvents = events.filter((e) => e.type === "champion_ability");
  if (abilityEvents.length === 0) return false;
  return abilityEvents.every((e) => !formulaEvidence(e)?.isGenericFormulaEvent);
}

/** True when there is simply no formula/ability evidence to show. */
export function hasNoFormulaEvidence(events: TimelineEvent[]): boolean {
  return !events.some((e) => e.type === "champion_ability");
}

export function formulaEventFor(events: TimelineEvent[]): TimelineEvent | null {
  return events.find((e) => formulaEvidence(e)?.isGenericFormulaEvent) ?? null;
}
