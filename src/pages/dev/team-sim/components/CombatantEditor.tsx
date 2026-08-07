/**
 * One runtime combatant: champion, build, plan and targeting.
 *
 * Every selector is built from the Phase 4A catalog — never from
 * /api/meta/items, which describes a different (smaller) vocabulary than the
 * simulation endpoint accepts.
 */
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CritMode } from "@/lib/combat-lab/team-sim/contract";
import {
  championActions,
  rankBoundsFor,
  type CatalogIndex,
} from "@/lib/combat-lab/team-sim/catalog";
import {
  LEVEL_MAX,
  LEVEL_MIN,
  type CombatantDraft,
  type DraftAction,
  type RuntimeId,
} from "@/lib/combat-lab/team-sim/draft";

import { ActionPlanEditor } from "./ActionPlanEditor";
import { TargetingEditor } from "./TargetingEditor";
import { CatalogPicker, NumberField, SelectField } from "./controls";

type CombatantEditorProps = {
  combatant: CombatantDraft;
  index: CatalogIndex;
  activeEnemies: RuntimeId[];
  /** Other ACTIVE slots this build may be copied onto. */
  copyTargets: RuntimeId[];
  dispatch: (action: DraftAction) => void;
  /** stepId -> why it cannot be submitted. */
  stepIssues: Record<string, string>;
  disabled?: boolean;
};

function CombatantEditorImpl({
  combatant,
  index,
  activeEnemies,
  copyTargets,
  dispatch,
  stepIssues,
  disabled,
}: CombatantEditorProps) {
  const id = combatant.runtimeId;
  const actionCount = championActions(index, combatant.champion).length;

  return (
    <Card className="space-y-3 p-3" data-testid={`combatant-${id}`}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-xs">{id}</span>{" "}
          {combatant.champion}
        </h3>
        <div className="flex gap-1">
          {copyTargets.map((target) => (
            <Button
              key={target}
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={disabled}
              onClick={() => dispatch({ type: "copyBuild", from: id, to: target })}
            >
              Copy build → {target}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            disabled={disabled}
            onClick={() => dispatch({ type: "resetCombatant", id, index })}
          >
            Reset {id}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={`${id} champion`}
          value={combatant.champion}
          disabled={disabled}
          options={index.championOptions}
          onChange={(champion) => dispatch({ type: "setChampion", id, champion })}
          hint={
            actionCount > 0
              ? `${actionCount} champion-specific actions`
              : "basic attack + generic slot casts only"
          }
        />
        <NumberField
          label={`${id} level`}
          value={combatant.level}
          min={LEVEL_MIN}
          max={LEVEL_MAX}
          onChange={(level) => dispatch({ type: "setLevel", id, level: level ?? LEVEL_MIN })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Crit mode"
          value={combatant.critMode}
          disabled={disabled}
          options={index.critModes.map((mode) => ({ value: mode, label: mode }))}
          onChange={(critMode) =>
            dispatch({ type: "setCritMode", id, critMode: critMode as CritMode })
          }
        />
        <NumberField
          label="Starting HP"
          value={combatant.startingHp}
          min={1}
          allowEmpty
          placeholder="champion max HP"
          hint="Blank = the champion's computed max HP."
          onChange={(startingHp) => dispatch({ type: "setStartingHp", id, startingHp })}
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Ability ranks</p>
        {/* Static class list: Tailwind cannot see an interpolated column count. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {index.rankedSlots.map((slot) => {
            const bounds = rankBoundsFor(index, slot);
            return (
              <NumberField
                key={slot}
                label={`${slot} (${bounds.min}–${bounds.max})`}
                value={combatant.abilityRanks[slot] ?? bounds.min}
                min={bounds.min}
                max={bounds.max}
                onChange={(rank) =>
                  dispatch({ type: "setAbilityRank", id, slot, rank: rank ?? bounds.min })
                }
              />
            );
          })}
        </div>
      </div>

      <CatalogPicker
        label="Items"
        testId={`items-${id}`}
        entries={index.itemEntries}
        selected={combatant.items}
        max={index.maxItems}
        emptyLabel="No items."
        onToggle={(item) => dispatch({ type: "toggleItem", id, item, max: index.maxItems })}
        onClear={() => dispatch({ type: "clearItems", id })}
      />

      <CatalogPicker
        label="Runes"
        testId={`runes-${id}`}
        entries={index.runeEntries}
        selected={combatant.runes}
        max={index.maxRunes}
        emptyLabel="No runes."
        onToggle={(rune) => dispatch({ type: "toggleRune", id, rune, max: index.maxRunes })}
        onClear={() => dispatch({ type: "clearRunes", id })}
      />

      <ActionPlanEditor
        combatant={combatant}
        index={index}
        dispatch={dispatch}
        stepIssues={stepIssues}
        disabled={disabled}
      />

      <TargetingEditor
        combatant={combatant}
        index={index}
        activeEnemies={activeEnemies}
        dispatch={dispatch}
        disabled={disabled}
      />
    </Card>
  );
}

/**
 * Memoized by CONTENT for the list-shaped props.
 *
 * The reducer replaces only the edited combatant's object, but `validateDraft`
 * and the active-enemy helpers build fresh arrays on every page render. Without
 * this comparator, one keystroke in A1 re-renders four editors — each holding a
 * 172-option champion select and two 60-row catalog pickers.
 */
export const CombatantEditor = memo(
  CombatantEditorImpl,
  (prev, next) =>
    prev.combatant === next.combatant &&
    prev.index === next.index &&
    prev.dispatch === next.dispatch &&
    prev.disabled === next.disabled &&
    prev.activeEnemies.join(",") === next.activeEnemies.join(",") &&
    prev.copyTargets.join(",") === next.copyTargets.join(",") &&
    JSON.stringify(prev.stepIssues) === JSON.stringify(next.stepIssues)
);
