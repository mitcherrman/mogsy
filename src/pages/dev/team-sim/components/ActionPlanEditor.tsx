/**
 * Explicit ordered action plan for one combatant.
 *
 * There is no rotation generator and no "optimize" here on purpose: the
 * backend has no combat AI, so the plan the operator writes is exactly what
 * runs. Steps whose action the CURRENT champion cannot cast are marked
 * invalid and block submission — they are never quietly rewritten or dropped.
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { AbilitySlot, OnFailurePolicy } from "@/lib/combat-lab/team-sim/contract";
import { championActions, type CatalogIndex } from "@/lib/combat-lab/team-sim/catalog";
import type {
  CombatantDraft,
  DraftAction,
  PlanStepDraft,
  RuntimeId,
} from "@/lib/combat-lab/team-sim/draft";

import { FIELD_CLASS, SelectField } from "./controls";

const STEP_VALUE_BASIC = "basic_attack";

/** Encode a step's action into one <select> value, and back. */
function stepValue(step: PlanStepDraft): string {
  if (step.kind === "basic_attack") return STEP_VALUE_BASIC;
  if (step.kind === "slot") return `slot:${step.slot ?? ""}`;
  return `action:${step.activeName ?? ""}`;
}

function decodeStepValue(value: string): Partial<Omit<PlanStepDraft, "id">> {
  if (value === STEP_VALUE_BASIC) {
    return { kind: "basic_attack", slot: null, activeName: null };
  }
  if (value.startsWith("slot:")) {
    return { kind: "slot", slot: value.slice(5) as AbilitySlot, activeName: null };
  }
  return { kind: "champion_action", slot: null, activeName: value.slice(7) };
}

export function ActionPlanEditor({
  combatant,
  index,
  dispatch,
  stepIssues,
  disabled,
}: {
  combatant: CombatantDraft;
  index: CatalogIndex;
  dispatch: (action: DraftAction) => void;
  /** stepId -> why it cannot be submitted. */
  stepIssues: Record<string, string>;
  disabled?: boolean;
}) {
  const id: RuntimeId = combatant.runtimeId;
  const actions = championActions(index, combatant.champion);
  const invalidStepIds = Object.keys(stepIssues);
  const invalid = new Set(invalidStepIds);
  const atStepLimit = combatant.plan.steps.length >= index.maxPlanSteps;

  const options = [
    { value: STEP_VALUE_BASIC, label: "Basic Attack" },
    ...index.genericSlots.map((slot) => ({
      value: `slot:${slot}`,
      label: `Cast ${slot} (generic)`,
    })),
    ...actions.map((action) => ({
      value: `action:${action.active_name}`,
      label: `${action.label} — ${action.active_name}`,
    })),
  ];

  return (
    <section className="space-y-2" aria-label={`Action plan for ${id}`}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {id} plan
        </h4>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={disabled || atStepLimit}
            onClick={() =>
              dispatch({
                type: "addStep",
                id,
                step: { kind: "basic_attack", slot: null, activeName: null, notBefore: 0 },
              })
            }
          >
            Add step
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            disabled={disabled || combatant.plan.steps.length === 0}
            onClick={() => dispatch({ type: "clearPlan", id })}
          >
            Clear plan
          </Button>
        </div>
      </div>

      {invalidStepIds.length > 0 ? (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
          <p>
            {invalidStepIds.length} step{invalidStepIds.length === 1 ? "" : "s"}{" "}
            cannot be submitted. Fix or remove{" "}
            {invalidStepIds.length === 1 ? "it" : "them"} before running.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-1 h-6 px-2 text-[11px]"
            disabled={disabled}
            onClick={() =>
              dispatch({ type: "removeInvalidSteps", id, stepIds: invalidStepIds })
            }
          >
            Remove invalid steps
          </Button>
        </div>
      ) : null}

      {combatant.plan.steps.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {combatant.plan.repeat
            ? "Empty plan with Repeat on — the backend rejects this. Turn Repeat off for a combatant that never acts."
            : "Empty plan — this combatant never acts (legal, and the backend models it)."}
        </p>
      ) : (
        <ol className="space-y-1">
          {combatant.plan.steps.map((step, position) => (
            <li
              key={step.id}
              className={cn(
                "rounded border p-1.5",
                invalid.has(step.id)
                  ? "border-destructive/60 bg-destructive/5"
                  : "border-border"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {position + 1}.
                </span>
                <select
                  className={cn(FIELD_CLASS, "flex-1 py-1 text-xs")}
                  aria-label={`${id} step ${position + 1} action`}
                  value={stepValue(step)}
                  disabled={disabled}
                  onChange={(e) =>
                    dispatch({
                      type: "updateStep",
                      id,
                      stepId: step.id,
                      patch: decodeStepValue(e.target.value),
                    })
                  }
                >
                  {/* An invalid step keeps its own value visible instead of
                      snapping to some other action the operator never chose.
                      Covers champion actions AND slots the catalog dropped. */}
                  {invalid.has(step.id) &&
                  !options.some((option) => option.value === stepValue(step)) ? (
                    <option value={stepValue(step)}>
                      {step.activeName ?? step.slot ?? "?"} (unavailable)
                    </option>
                  ) : null}
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className={cn(FIELD_CLASS, "w-20 py-1 text-xs")}
                  aria-label={`${id} step ${position + 1} not before (seconds)`}
                  value={step.notBefore}
                  disabled={disabled}
                  onChange={(e) =>
                    dispatch({
                      type: "updateStep",
                      id,
                      stepId: step.id,
                      patch: { notBefore: Number(e.target.value) },
                    })
                  }
                />
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    aria-label={`Move ${id} step ${position + 1} up`}
                    className="rounded px-1 text-xs hover:bg-muted disabled:opacity-30"
                    disabled={disabled || position === 0}
                    onClick={() =>
                      dispatch({ type: "moveStep", id, stepId: step.id, direction: -1 })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${id} step ${position + 1} down`}
                    className="rounded px-1 text-xs hover:bg-muted disabled:opacity-30"
                    disabled={disabled || position === combatant.plan.steps.length - 1}
                    onClick={() =>
                      dispatch({ type: "moveStep", id, stepId: step.id, direction: 1 })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${id} step ${position + 1}`}
                    className="rounded px-1 text-xs hover:bg-muted disabled:opacity-30"
                    disabled={disabled}
                    onClick={() => dispatch({ type: "removeStep", id, stepId: step.id })}
                  >
                    ×
                  </button>
                </div>
              </div>
              {stepIssues[step.id] ? (
                <p className="mt-1 pl-6 text-[11px] text-destructive">
                  {stepIssues[step.id]}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={combatant.plan.repeat}
            disabled={disabled}
            onChange={(e) => dispatch({ type: "setRepeat", id, repeat: e.target.checked })}
          />
          Repeat plan (↻)
        </label>
        <SelectField
          label="On failure"
          value={combatant.plan.onFailure}
          disabled={disabled}
          options={index.onFailurePolicies.map((p) => ({ value: p, label: p }))}
          onChange={(onFailure) =>
            dispatch({ type: "setOnFailure", id, onFailure: onFailure as OnFailurePolicy })
          }
        />
      </div>
    </section>
  );
}
