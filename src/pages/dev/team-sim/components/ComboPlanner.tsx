/**
 * CS2 — Combo Planner.
 *
 * The product-loop surface over the SIM2 scenario editor: pick a matchup
 * (already done by the combatant editors below), write each side's ordered
 * combo, press Run, watch the existing playback and calculator explain it.
 *
 * This component owns NO combat truth. It is a view over the existing
 * `PlanDraft` inside `TeamScenarioDraft`, edited exclusively through the
 * existing `draftReducer` actions (`addStep`, `removeStep`, `moveStep`,
 * `clearPlan`), and its action vocabulary is read from the Phase 4A catalog
 * via `championActions` / `index.genericSlots`. There is no second action
 * taxonomy, no timing model, no formula evaluation and no HP arithmetic here —
 * every one of those already lives on the backend, and the planner's only job
 * is to say WHICH actions, in WHAT order.
 *
 * The Run control delegates to the page's single `onRun` callback — the same
 * one behind {@link RunPanel}. It is a second entry point to that one path,
 * never a second path: it serializes nothing, holds no request, and is
 * disabled under exactly the same conditions, so "one deliberate click, at
 * most one billable POST" still holds.
 */
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getAbilityIconUrl,
  getChampionSquareIconUrl,
  toneForSlot,
} from "@/lib/combat-lab/abilityIcons";
import type { AbilitySlot } from "@/lib/combat-lab/team-sim/contract";
import {
  championActions,
  type CatalogIndex,
} from "@/lib/combat-lab/team-sim/catalog";
import {
  activeIdsForTeam,
  type CombatantDraft,
  type DraftAction,
  type DraftValidation,
  type PlanStepDraft,
  type RuntimeId,
  type TeamKey,
  type TeamScenarioDraft,
} from "@/lib/combat-lab/team-sim/draft";

/** One entry the palette can add. Built only from catalog vocabulary. */
type PaletteEntry = {
  /** Stable key AND the value the tests address the button by. */
  key: string;
  label: string;
  /** Longer text for the title attribute; the wire identity where there is one. */
  detail: string;
  step: Omit<PlanStepDraft, "id">;
  /** Ability slot used for icon + tone only. Never sent. */
  slot: AbilitySlot | null;
};

/** Local, because `TEAM_KEYS` is private to the draft module. */
const TEAMS: readonly TeamKey[] = ["A", "B"];
const TEAM_LABEL: Record<TeamKey, string> = { A: "Team A", B: "Team B" };

const TONE_CLASS: Record<string, string> = {
  q: "border-sky-500/50",
  w: "border-amber-500/50",
  e: "border-emerald-500/50",
  r: "border-fuchsia-500/50",
  neutral: "border-border",
};

function paletteFor(index: CatalogIndex, champion: string): PaletteEntry[] {
  const entries: PaletteEntry[] = [
    {
      key: "basic_attack",
      label: "Auto",
      detail: "Basic attack",
      step: { kind: "basic_attack", slot: null, activeName: null, notBefore: 0 },
      slot: null,
    },
  ];

  for (const slot of index.genericSlots) {
    entries.push({
      key: `slot:${slot}`,
      label: slot,
      detail: `Cast ${slot} (generic slot action)`,
      step: { kind: "slot", slot, activeName: null, notBefore: 0 },
      slot,
    });
  }

  // Champion-specific actives. The catalog decides which exist for THIS
  // champion, so a champion with no modelled multi-cast simply has none —
  // the generic slots above still cover Q/W/E/R.
  for (const action of championActions(index, champion)) {
    entries.push({
      key: `action:${action.active_name}`,
      label: action.label,
      detail: `${action.label} — ${action.active_name}`,
      step: {
        kind: "champion_action",
        slot: null,
        activeName: action.active_name,
        notBefore: 0,
      },
      // The catalog publishes the parent slot outright; no inference needed.
      slot: (action.ability_slot || null) as AbilitySlot | null,
    });
  }

  return entries;
}

/** Display label for a step already in the combo. */
function stepLabel(
  index: CatalogIndex,
  champion: string,
  step: PlanStepDraft
): string {
  if (step.kind === "basic_attack") return "Auto";
  if (step.kind === "slot") return step.slot ?? "?";
  const action = championActions(index, champion).find(
    (a) => a.active_name === step.activeName
  );
  return action?.label ?? step.activeName ?? "?";
}

function stepSlot(
  index: CatalogIndex,
  champion: string,
  step: PlanStepDraft
): AbilitySlot | null {
  if (step.kind === "slot") return step.slot;
  if (step.kind !== "champion_action") return null;
  const action = championActions(index, champion).find(
    (a) => a.active_name === step.activeName
  );
  return (action?.ability_slot || null) as AbilitySlot | null;
}

function ActionIcon({
  champion,
  slot,
  label,
}: {
  champion: string;
  slot: AbilitySlot | null;
  label: string;
}) {
  const url = slot
    ? getAbilityIconUrl(champion, slot)
    : getChampionSquareIconUrl(champion);
  if (!url) {
    // Graceful fallback: the glyph, never fabricated artwork.
    return (
      <span
        aria-hidden="true"
        className="grid h-5 w-5 shrink-0 place-items-center rounded bg-muted text-[10px] font-semibold"
      >
        {label.slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className="h-5 w-5 shrink-0 rounded object-cover"
    />
  );
}

function ComboLane({
  combatant,
  index,
  dispatch,
  stepIssues,
  disabled,
}: {
  combatant: CombatantDraft;
  index: CatalogIndex;
  dispatch: (action: DraftAction) => void;
  stepIssues: Record<string, string>;
  disabled: boolean;
}) {
  const id: RuntimeId = combatant.runtimeId;
  const champion = combatant.champion;
  const steps = combatant.plan.steps;
  const palette = paletteFor(index, champion);
  const atStepLimit = steps.length >= index.maxPlanSteps;
  const invalid = new Set(Object.keys(stepIssues));

  return (
    <div
      className="min-w-0 space-y-2 rounded-lg border border-border p-3"
      data-testid={`combo-lane-${id}`}
      aria-label={`Combo for ${id} (${champion})`}
    >
      <div className="flex items-center gap-2">
        <ActionIcon champion={champion} slot={null} label={champion} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{champion}</p>
          <p className="text-[11px] text-muted-foreground">
            {id} · {steps.length}/{index.maxPlanSteps} action
            {steps.length === 1 ? "" : "s"}
          </p>
          {/* The scheduler's own two plan settings, reported rather than
              restated: both are read straight off the draft, and neither is
              editable here — the detailed editor below owns them. */}
          <p
            className="text-[11px] text-muted-foreground"
            data-testid={`combo-plan-mode-${id}`}
          >
            <span className="font-medium">
              {combatant.plan.repeat ? "Repeats" : "Runs once"}
            </span>{" "}
            · on failure: <span className="font-medium">{combatant.plan.onFailure}</span>
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={disabled || steps.length === 0}
          onClick={() => dispatch({ type: "clearPlan", id })}
        >
          Clear combo
        </Button>
      </div>

      {/* ── the combo itself ── */}
      {steps.length === 0 ? (
        <p
          className="rounded border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground"
          data-testid={`combo-empty-${id}`}
        >
          No actions yet — add one below.
        </p>
      ) : (
        <ol
          className="flex flex-wrap items-stretch gap-1"
          data-testid={`combo-sequence-${id}`}
        >
          {steps.map((step, position) => {
            const label = stepLabel(index, champion, step);
            const slot = stepSlot(index, champion, step);
            const broken = invalid.has(step.id);
            return (
              <li
                key={step.id}
                data-testid={`combo-step-${id}-${position + 1}`}
                data-step-label={label}
                className={cn(
                  "flex items-center gap-1 rounded border bg-card px-1.5 py-1",
                  broken
                    ? "border-destructive/60 bg-destructive/5"
                    : TONE_CLASS[toneForSlot(slot)] ?? TONE_CLASS.neutral
                )}
              >
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {position + 1}
                </span>
                <ActionIcon champion={champion} slot={slot} label={label} />
                <span className="text-xs font-medium">{label}</span>
                {step.notBefore > 0 ? (
                  <span className="text-[10px] text-muted-foreground">
                    ≥{step.notBefore}s
                  </span>
                ) : null}
                <span className="ml-0.5 flex items-center">
                  <button
                    type="button"
                    aria-label={`Move ${id} action ${position + 1} earlier`}
                    className="rounded px-0.5 text-[11px] hover:bg-muted disabled:opacity-30"
                    disabled={disabled || position === 0}
                    onClick={() =>
                      dispatch({ type: "moveStep", id, stepId: step.id, direction: -1 })
                    }
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${id} action ${position + 1} later`}
                    className="rounded px-0.5 text-[11px] hover:bg-muted disabled:opacity-30"
                    disabled={disabled || position === steps.length - 1}
                    onClick={() =>
                      dispatch({ type: "moveStep", id, stepId: step.id, direction: 1 })
                    }
                  >
                    →
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${id} action ${position + 1}`}
                    className="rounded px-0.5 text-[11px] hover:bg-muted disabled:opacity-30"
                    disabled={disabled}
                    onClick={() => dispatch({ type: "removeStep", id, stepId: step.id })}
                  >
                    ×
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {invalid.size > 0 ? (
        <p
          className="text-[11px] text-destructive"
          role="alert"
          data-testid={`combo-invalid-${id}`}
        >
          {invalid.size} action{invalid.size === 1 ? "" : "s"} in this combo are
          not available for {champion}. Remove or replace them before running.
        </p>
      ) : null}

      {/* ── click-to-add palette, straight from the catalog ── */}
      <div
        className="flex flex-wrap gap-1 border-t border-border pt-2"
        data-testid={`combo-palette-${id}`}
        aria-label={`Available actions for ${id}`}
      >
        {palette.map((entry) => (
          <button
            key={entry.key}
            type="button"
            data-testid={`combo-add-${id}-${entry.key}`}
            title={entry.detail}
            aria-label={`Add ${entry.label} to ${id}`}
            className={cn(
              "flex items-center gap-1 rounded border px-1.5 py-1 text-xs hover:bg-muted disabled:opacity-40",
              TONE_CLASS[toneForSlot(entry.slot)] ?? TONE_CLASS.neutral
            )}
            disabled={disabled || atStepLimit}
            onClick={() => dispatch({ type: "addStep", id, step: entry.step })}
          >
            <ActionIcon champion={champion} slot={entry.slot} label={entry.label} />
            {entry.label}
          </button>
        ))}
      </div>

      {atStepLimit ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Plan limit reached ({index.maxPlanSteps} actions). Remove one to add
          another.
        </p>
      ) : null}
    </div>
  );
}

export function ComboPlanner({
  draft,
  index,
  dispatch,
  validation,
  disabled,
  isPending,
  onRun,
  creditCost,
}: {
  draft: TeamScenarioDraft;
  index: CatalogIndex;
  dispatch: (action: DraftAction) => void;
  validation: DraftValidation;
  /** Editing is locked while anything is on the wire. */
  disabled: boolean;
  /** A SIMULATION specifically is in flight (drives the button's label). */
  isPending: boolean;
  /** The page's single submit path — see the file header. */
  onRun: () => void;
  creditCost: number | null;
}) {
  const blocked = validation.issues.length > 0;

  return (
    <Card className="space-y-3 p-3" data-testid="combo-planner">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Combo planner</h2>
          <p className="text-[11px] text-muted-foreground">
            Click actions to build each side's sequence, then run it. The
            scheduler executes the plan exactly as written — order and
            availability only, no rotation AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {creditCost === null
              ? "cost unknown"
              : `${creditCost} credit${creditCost === 1 ? "" : "s"}`}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={disabled || blocked}
            onClick={onRun}
            data-testid="combo-planner-run"
          >
            {isPending ? "Running…" : "Run scenario"}
          </Button>
        </div>
      </div>

      {/* What manual QA kept running into: a repeating plan whose W and Q are
          still on cooldown emits a run of `plan_step_skipped` events, which
          looks like a bug until the two settings above are read together.
          Stated once, here, in the scheduler's own terms — this UI does not
          model cooldowns, does not wait, and does not reorder anything. */}
      <p className="text-[11px] text-muted-foreground" data-testid="combo-planner-semantics">
        The scheduler runs each sequence in order and only casts what is ready.
        With <span className="font-medium">Repeats</span> and{" "}
        <span className="font-medium">on failure: skip</span>, an action that is
        not available yet is skipped — it is recorded as a skipped step, the
        sequence continues, and it comes round again on the next cycle. Skipped
        steps are the engine reporting readiness, not an error. Repeat and
        failure handling are set per combatant in the editor below.
      </p>

      {blocked ? (
        <p
          className="text-[11px] text-destructive"
          role="alert"
          data-testid="combo-planner-blocked"
        >
          {validation.issues[0].message}
          {validation.issues.length > 1
            ? ` (+${validation.issues.length - 1} more)`
            : ""}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {TEAMS.map((team) => (
          <section key={team} className="space-y-2" aria-label={`${TEAM_LABEL[team]} combos`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {TEAM_LABEL[team]}
            </h3>
            {activeIdsForTeam(draft, team).map((id) => (
              <ComboLane
                key={id}
                combatant={draft.combatants[id]}
                index={index}
                dispatch={dispatch}
                stepIssues={validation.stepIssues[id]}
                disabled={disabled}
              />
            ))}
          </section>
        ))}
      </div>
    </Card>
  );
}
