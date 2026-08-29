/**
 * Read-only derivations for the two-lane combat playback + calculator.
 *
 * Every value here is read straight off the backend response — this module
 * computes no damage, no HP, and no timing beyond simple arithmetic over two
 * backend-reported timestamps (an action's own `executed_time` and
 * `clock_after`, both scheduler fields — see team_combat/scheduler.py). It
 * never re-derives HP by subtracting damage; HP before/after always comes
 * from `meta.damage_accounting.by_scope[scope]`.
 *
 * Field provenance (verified against the backend repo, not assumed):
 *  - envelope: seq, time, source, type, actor_id, actor_team, target_id,
 *    target_team, action_id, payload, meta — team_combat/scheduler.py `_emit`.
 *  - `meta.executed_time` / `meta.clock_after` — set on every
 *    scheduler/action_executed and scheduler/action_failed event in
 *    `_execute_ready` (team_combat/scheduler.py). `clock_after` is the
 *    acting combatant's own post-action readiness time, i.e. when its next
 *    action becomes eligible; there is no `consumed_seconds` field on the
 *    wire, so the block's displayed span is `clock_after - executed_time`
 *    (or `time`), computed here as a display-only derivation of two
 *    backend-reported instants, not a re-simulation of duration.
 *  - `meta.damage_accounting` — `CombatActionResult.to_damage_accounting()`
 *    (services/combat_action_result.py): `{ total_applied_hp_damage,
 *    by_scope: { [scope]: { hp_before, hp_after, applied_hp_damage } } }`.
 *  - formula data — ONLY present on kernel events of type `champion_ability`
 *    (generic_ability_runtime.py), and only at `trace_detail: "calculation"`
 *    or `"full"` (the `standard`/`summary` levels strip `formula_text`,
 *    `formula_bindings`, `formula_status`, `state_used`, etc. —
 *    services/team_simulation_trace.py REDUNDANT_METADATA_KEYS /
 *    CALCULATION_METADATA_KEYS). CS2-2 (live in production as of commit
 *    6287be2) added `formula_bindings`: every identifier referenced by
 *    `formula_text`, mapped to the value the server's own evaluator actually
 *    substituted for it — e.g. `{"P_Q": 5.0, "AP": 0.0, "MOD_Magic": 1.0}`
 *    for `(40 + 40 * P_Q + 0.8 * AP) * MOD_Magic`. This is the authoritative
 *    calculation evidence and is what the calculator renders; `state_used`
 *    (the resolved champion-state variables, a broader and less specific
 *    set) is READ but never shown or fallen back to — CS2-2's frontend
 *    integration requirement is `formula_bindings` or nothing.
 *  - `formula_bindings` is present ONLY for formula-priced abilities. A
 *    champion-runtime implementation that computes its damage in Python has
 *    no formula and the key is absent entirely — never an empty object, per
 *    generic_ability_runtime.py's own comment. Absence is therefore the
 *    honest, sole signal for "this action resolved through a
 *    champion-specific runtime path", never inferred from `state_used`.
 *  - damage pipeline stage fields (`raw_damage_before_pipeline`,
 *    `damage_after_modifiers`, `post_mitigation_damage`,
 *    `target_damage_after_defenses`, `target_damage_after_reduction`,
 *    `target_damage_reduction_percent`) — also kernel `payload.metadata`,
 *    also stripped below `calculation`. Only the stages actually present in
 *    the payload are ever rendered; nothing here fabricates a stage.
 */
import type { TeamSimEvent, TeamSimulationResponse } from "./contract";

export const PRIMARY_SCOPE = "PRIMARY";

/** One `by_scope` entry from `damage_accounting`. Wire shape, read-only. */
export type DamageScopeAccounting = {
  hp_before: number;
  hp_after: number;
  applied_hp_damage: number;
};

export type DamageAccounting = {
  total_applied_hp_damage: number;
  by_scope: Record<string, DamageScopeAccounting>;
};

export type HealingAccounting = Record<string, unknown> | null;

/** A scheduler action row this playback can select — one per lane block. */
export type PlaybackAction = {
  event: TeamSimEvent;
  seq: number;
  /** Authoritative start instant — the event's own `time`. */
  startTime: number;
  /** `meta.clock_after`, when present: the actor's own post-action readiness. */
  resolutionTime: number | null;
  ok: boolean;
  actorId: string | null;
  targetId: string | null;
  actorTeam: string | null;
  actionId: string | null;
  actionType: string | null;
  damageAccounting: DamageAccounting | null;
  healingAccounting: HealingAccounting;
  /** Kernel `champion_ability` events attributed to this same action instant. */
  kernelEvents: TeamSimEvent[];
};

function asDamageAccounting(value: unknown): DamageAccounting | null {
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

/**
 * Every scheduler action (executed or failed), in scheduler `seq` order, with
 * the kernel events the scheduler emitted for the same action instant
 * attached — the raw material for both timeline lanes and the calculator.
 *
 * Kernel events are matched to their action by `(actor_id, action_id, time)`
 * agreement, which is exactly how the scheduler itself associates them (it
 * emits them immediately after the action_executed row, stamped with the
 * same `exec_time` — team_combat/scheduler.py `_execute_ready`).
 */
export function buildPlaybackActions(response: TeamSimulationResponse): PlaybackAction[] {
  const events = response.events;
  const actionRows = events.filter(
    (e) => e.source === "scheduler" && (e.type === "action_executed" || e.type === "action_failed")
  );
  const kernelRows = events.filter((e) => e.source === "kernel");

  return actionRows
    .map((event) => {
      const meta = (event.meta ?? {}) as Record<string, unknown>;
      const clockAfter = typeof meta.clock_after === "number" ? meta.clock_after : null;
      const kernelEvents = kernelRows.filter(
        (k) =>
          k.actor_id === event.actor_id &&
          k.action_id === event.action_id &&
          k.time === event.time
      );
      return {
        event,
        seq: event.seq,
        startTime: event.time,
        resolutionTime: clockAfter,
        ok: event.type === "action_executed",
        actorId: event.actor_id,
        targetId: event.target_id,
        actorTeam: event.actor_team,
        actionId: event.action_id,
        actionType: typeof meta.action_type === "string" ? meta.action_type : null,
        damageAccounting: asDamageAccounting(meta.damage_accounting),
        healingAccounting: (meta.healing_accounting as HealingAccounting) ?? null,
        kernelEvents,
      } satisfies PlaybackAction;
    })
    .sort((a, b) => a.seq - b.seq);
}

/**
 * A readable label for an authoritative action id. DISPLAY ONLY.
 *
 * The id itself is the action's identity on the wire and is never rewritten:
 * this returns a string to PRINT, while every lookup, icon resolution, kernel
 * matching and calculator query keeps using `actionId` unchanged. The raw id
 * stays visible to an operator in the timeline block's tooltip and in the
 * calculator's detail line.
 *
 * The transformation is purely lexical — underscores become spaces and tokens
 * are title-cased, with ability-slot tokens (`q`, `q1`, `qw`, `r2`, `p`)
 * upper-cased because "Q1" is how the game writes them and "Q1" is what the
 * catalog's own `label` says. Nothing is dropped, reordered or inferred, so an
 * id this function has never seen still round-trips to something the operator
 * can match against the raw value beside it.
 */
export function humanizeActionId(actionId: string | null | undefined): string {
  const raw = (actionId ?? "").trim();
  if (!raw) return "action";
  return raw
    .split("_")
    .filter(Boolean)
    .map((token) =>
      /^[qwerp]{1,2}\d*$/i.test(token)
        ? token.toUpperCase()
        : token.charAt(0).toUpperCase() + token.slice(1)
    )
    .join(" ");
}

/**
 * True when the SERVER classified this action as a basic attack.
 *
 * Read from `meta.action_type`, never inferred from the id, and used only to
 * decide visual weight on the timeline. No event is merged, hidden, retimed or
 * reordered by this — a de-emphasised auto is still its own clickable block at
 * its own authoritative instant.
 */
export function isBasicAttackAction(action: PlaybackAction): boolean {
  return action.actionType === "basic_attack";
}

/** Display-only span for a lane block. Never fabricated when unavailable. */
export function actionSpan(action: PlaybackAction): { start: number; end: number } {
  const end =
    action.resolutionTime !== null && action.resolutionTime > action.startTime
      ? action.resolutionTime
      : action.startTime;
  return { start: action.startTime, end };
}

/** The PRIMARY-scope hp_before/hp_after for one action, when it dealt to it. */
export function primaryHp(
  action: PlaybackAction
): { hp_before: number; hp_after: number; applied_hp_damage: number } | null {
  const scope = action.damageAccounting?.by_scope?.[PRIMARY_SCOPE];
  return scope ?? null;
}

/** One champion_ability kernel event's formula diagnostics, when present. */
export type FormulaDiagnostics = {
  formulaText: string | null;
  /**
   * The authoritative calculation evidence (CS2-2): every identifier
   * `formulaText` references, mapped to the value the server's own formula
   * evaluator actually used for it. `null` when the backend did not send the
   * key at all — a champion-runtime action, or a trace_detail below
   * `"calculation"` — and this is the ONLY signal the calculator trusts for
   * "no formula evidence exists"; it is never inferred from `stateUsed`.
   */
  formulaBindings: Record<string, number> | null;
  /**
   * True iff this event's metadata carries the `formula_status` KEY at all
   * (even when its value is null), independent of `trace_detail` and of
   * `formulaBindings`. This is the reliable signal for "this action went
   * through the generic formula resolver" — generic_ability_runtime.py sets
   * `formula_status` unconditionally on every event it emits, on every
   * branch (success, healing, missing formula, invalid state), while
   * champion_recast_runtime.py — the actual champion-specific runtime path —
   * never sets it. `formulaBindings == null` alone does NOT mean
   * champion-runtime: it is equally true of a generic-formula event fetched
   * below `trace_detail: "calculation"`, which is a detail-level choice, not
   * a fact about which code path priced the damage.
   */
  isGenericFormulaEvent: boolean;
  formulaStatus: string | null;
  formulaFound: boolean | null;
  /** Broader resolved champion-state variables. Read for completeness but
   * never rendered — CS2-2 supersedes it with `formulaBindings`, which is
   * scoped to exactly what the formula referenced. */
  stateUsed: Record<string, unknown> | null;
  missingRequired: string[] | null;
  warnings: string[] | null;
  error: string | null;
};

export function formulaDiagnostics(event: TeamSimEvent): FormulaDiagnostics | null {
  const payload = event.payload as Record<string, unknown> | null;
  if (!payload || event.type !== "champion_ability") return null;
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  const hasAny =
    "formula_text" in metadata ||
    "formula_bindings" in metadata ||
    "formula_status" in metadata ||
    "state_used" in metadata;
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
    stateUsed:
      metadata.state_used && typeof metadata.state_used === "object"
        ? (metadata.state_used as Record<string, unknown>)
        : null,
    missingRequired: Array.isArray(metadata.formula_missing_required)
      ? (metadata.formula_missing_required as string[])
      : null,
    warnings: Array.isArray(metadata.formula_warnings)
      ? (metadata.formula_warnings as string[])
      : null,
    error: typeof metadata.formula_error === "string" ? metadata.formula_error : null,
  };
}

/** One damage-pipeline stage the calculator can show, in pipeline order. */
export type PipelineStage = { key: string; label: string; value: number };

const PIPELINE_STAGE_LABELS: Array<{ key: string; label: string }> = [
  { key: "raw_damage_before_pipeline", label: "Raw (before pipeline)" },
  { key: "target_damage_before_defenses", label: "Before defenses" },
  { key: "target_damage_after_defenses", label: "After defenses (mitigation)" },
  { key: "damage_after_modifiers", label: "After modifiers (amp)" },
  { key: "target_damage_after_reduction", label: "After reduction" },
  { key: "post_mitigation_damage", label: "Post-mitigation" },
];

/**
 * Only the stages actually present in this kernel event's `payload.metadata`
 * — never a fixed list padded with zeros. Requires `trace_detail:
 * "calculation"` (or `"full"`); at `standard`/`summary` these keys are
 * stripped by the backend and this returns an empty array (the caller falls
 * back to `final_damage`/`applied_hp_damage` alone, per the
 * champion-specific-runtime case).
 */
export function pipelineStages(event: TeamSimEvent): PipelineStage[] {
  const payload = event.payload as Record<string, unknown> | null;
  const metadata = (payload?.metadata ?? {}) as Record<string, unknown>;
  const stages: PipelineStage[] = [];
  for (const { key, label } of PIPELINE_STAGE_LABELS) {
    const value = metadata[key];
    if (typeof value === "number") stages.push({ key, label, value });
  }
  return stages;
}

/** Shield absorbed, when the kernel event reports one. */
export function shieldAbsorbed(event: TeamSimEvent): number | null {
  const payload = event.payload as Record<string, unknown> | null;
  const metadata = (payload?.metadata ?? {}) as Record<string, unknown>;
  const v = metadata.target_shield_absorbed ?? metadata.shield_absorbed;
  return typeof v === "number" ? v : null;
}

/**
 * The kernel event carrying this action's damage-pipeline stages, if any —
 * checked directly against `pipelineStages()`, not against event `type`.
 * Pipeline data lives on whichever kernel event actually did the damage
 * math: `champion_ability` for a formula-priced or champion-runtime ability,
 * but a plain `damage_packet` for a basic attack. Sourcing pipeline data
 * from `champion_ability` events only would silently hide the mitigation
 * ladder for every basic attack, which does exist on the wire.
 */
export function pipelineEventFor(action: PlaybackAction): TeamSimEvent | null {
  return action.kernelEvents.find((e) => pipelineStages(e).length > 0) ?? null;
}

/**
 * True ONLY when this action has a RELIABLE signal that its damage was
 * computed by a champion-specific runtime implementation rather than the
 * generic formula resolver: a `champion_ability` kernel event whose metadata
 * carries no `formula_status` key at all (see `isGenericFormulaEvent` on
 * `FormulaDiagnostics` for why that key, not `formula_bindings`, is the
 * trustworthy signal). An action with NO `champion_ability` kernel event —
 * a basic attack, or any action whose trace was returned at `"summary"`
 * (which strips kernel events entirely) — is NOT claimed to be
 * champion-runtime here; see `hasNoFormulaEvidence` for that case.
 */
export function isChampionRuntimeAction(action: PlaybackAction): boolean {
  const abilityEvents = action.kernelEvents.filter((e) => e.type === "champion_ability");
  if (abilityEvents.length === 0) return false;
  return abilityEvents.every((e) => !formulaDiagnostics(e)?.isGenericFormulaEvent);
}

/**
 * True when there is simply no formula/ability evidence to show for this
 * action — no `champion_ability` kernel event was returned at all (a basic
 * attack, an action whose trace_detail elided kernel events, or a failed
 * action). Makes no claim about WHY the evidence is missing; the calculator
 * uses this to show neutral copy ("unavailable") rather than asserting
 * champion-runtime ownership it cannot prove.
 */
export function hasNoFormulaEvidence(action: PlaybackAction): boolean {
  return !action.kernelEvents.some((e) => e.type === "champion_ability");
}
