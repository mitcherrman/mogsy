/**
 * One runtime combatant: champion, build, plan and targeting.
 *
 * Every selector is built from the Phase 4A catalog — never from
 * /api/meta/items, which describes a different (smaller) vocabulary than the
 * simulation endpoint accepts.
 *
 * Phase 6B makes the card COLLAPSIBLE, and that is a scaling change rather than
 * a cosmetic one. Through Phase 6A a team held at most three of these, and each
 * one is tall: champion select, level, crit mode, starting HP, four ability
 * ranks, an item picker, a rune picker, an action-plan editor and a targeting
 * editor. Five per side is ten of them, and rendering ten expanded is a wall
 * several thousand pixels long in which nothing is findable — the operator
 * cannot see their own roster without scrolling past the thing they are editing.
 *
 * Collapsed, the card is the ROSTER ROW: runtime-ID chip, champion, and a
 * one-line summary of the plan and targeting policy that is actually going to be
 * sent. So all five champions per team stay visible at a glance, each one's
 * plan/targeting is legible without expanding it, and exactly one card per team
 * is open for editing. The page owns which one (see TeamSimPage), so opening A3
 * closes A1 rather than growing the column.
 *
 * The collapsed body is UNMOUNTED, not hidden. That is deliberate: the memo
 * comparator below exists because these cards are expensive (a 172-option
 * champion select and two 60-row catalog pickers each), and keeping ten of them
 * mounted-but-invisible would pay the whole cost for no benefit.
 */
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CritMode } from "@/lib/combat-lab/team-sim/contract";
import {
  championActions,
  rankBoundsFor,
  type CatalogIndex,
} from "@/lib/combat-lab/team-sim/catalog";
import {
  describePlan,
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
  /** Whether this card's editing controls are mounted. */
  expanded: boolean;
  /** Ask the page to make this the open card for its team. */
  onExpand: (id: RuntimeId) => void;
  /** True when this combatant has at least one submission-blocking issue. */
  hasIssues?: boolean;
};

/** The one-line roster summary a collapsed card shows. */
function summarize(combatant: CombatantDraft): string {
  const { policy, priority } = combatant.targeting;
  const aim = policy === "fixed" ? `fixed ${priority.join(">") || "—"}` : policy;
  const build = [
    combatant.items.length ? `${combatant.items.length}i` : null,
    combatant.runes.length ? `${combatant.runes.length}r` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return [`L${combatant.level}`, build, describePlan(combatant.plan), aim]
    .filter(Boolean)
    .join(" · ");
}

function CombatantEditorImpl({
  combatant,
  index,
  activeEnemies,
  copyTargets,
  dispatch,
  stepIssues,
  disabled,
  expanded,
  onExpand,
  hasIssues,
}: CombatantEditorProps) {
  const id = combatant.runtimeId;
  const actionCount = championActions(index, combatant.champion).length;

  return (
    <Card
      className={cn(
        "space-y-3 p-3",
        expanded ? "space-y-3" : "space-y-0 py-2",
        hasIssues && "border-destructive/60"
      )}
      data-testid={`combatant-${id}`}
      data-expanded={expanded ? "true" : "false"}
    >
      {/* A COLLAPSED header is the expand control, so a roster row is one click
          from being editable. An EXPANDED one is a plain heading, deliberately:
          exactly one card per team is open, so "collapse" is not an action this
          component can honour — closing the only open card would leave the team
          with no editor at all, which is the state the page's clamp exists to
          prevent. The first version made it a button in both states with a
          `Collapse …` label, which promised something the handler never did.
          Found in the Phase 6B browser pass. */}
      <div className="flex min-w-0 items-start justify-between gap-2">
        {expanded ? (
          <h3 className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-xs">
              {id}
            </span>
            <span className="truncate text-sm font-semibold">
              {combatant.champion}
            </span>
          </h3>
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
            aria-expanded={false}
            aria-label={`Edit ${id} ${combatant.champion}`}
            onClick={() => onExpand(id)}
          >
            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-xs">
              {id}
            </span>
            <span className="truncate text-sm font-semibold">
              {combatant.champion}
            </span>
            {hasIssues ? (
              <span
                className="shrink-0 text-[10px] font-semibold uppercase text-destructive"
                data-testid={`roster-issues-${id}`}
              >
                check
              </span>
            ) : null}
          </button>
        )}
        <span
          className="shrink-0 text-[10px] text-muted-foreground"
          aria-hidden="true"
        >
          {expanded ? "▾" : "▸"}
        </span>
      </div>

      {expanded ? null : (
        // The roster line. `truncate` rather than wrap: a collapsed card must
        // stay ONE row tall, or five of them stop being a roster.
        <p
          className="truncate pt-0.5 text-[11px] text-muted-foreground"
          data-testid={`roster-summary-${id}`}
        >
          {summarize(combatant)}
        </p>
      )}

      {expanded ? (
        <>
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
            {/* Bounds from the catalog (Phase 4C), never local literals. */}
            <NumberField
              label={`${id} level`}
              value={combatant.level}
              min={index.levelBounds.min}
              max={index.levelBounds.max}
              onChange={(level) =>
                dispatch({ type: "setLevel", id, level: level ?? index.levelBounds.min })
              }
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

          {/* Moved out of the header and compacted. Through Phase 6A this was
              one "Copy build → A2"-style button per teammate, which is two at a
              cap of three and FOUR at a cap of five — a header row that wraps
              or overflows on a phone. The destination is now the whole label. */}
          <div className="flex flex-wrap items-center gap-1 border-t pt-2">
            {copyTargets.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">Copy build to</span>
            ) : null}
            {copyTargets.map((target) => (
              <Button
                key={target}
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-1.5 font-mono text-[11px]"
                disabled={disabled}
                aria-label={`Copy ${id} build to ${target}`}
                onClick={() => dispatch({ type: "copyBuild", from: id, to: target })}
              >
                {target}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-6 px-2 text-[11px]"
              disabled={disabled}
              onClick={() => dispatch({ type: "resetCombatant", id, index })}
            >
              Reset {id}
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}

/**
 * Memoized by CONTENT for the list-shaped props.
 *
 * The reducer replaces only the edited combatant's object, but `validateDraft`
 * and the active-enemy helpers build fresh arrays on every page render. Without
 * this comparator, one keystroke in A1 re-renders every other card — and at a
 * cap of five that is nine cards, each holding a 172-option champion select and
 * two 60-row catalog pickers. The collapsed cards are cheap now, but the
 * comparator is what keeps the OPEN one from re-rendering for another team's
 * edit.
 */
export const CombatantEditor = memo(
  CombatantEditorImpl,
  (prev, next) =>
    prev.combatant === next.combatant &&
    prev.index === next.index &&
    prev.dispatch === next.dispatch &&
    prev.disabled === next.disabled &&
    prev.expanded === next.expanded &&
    prev.onExpand === next.onExpand &&
    prev.hasIssues === next.hasIssues &&
    prev.activeEnemies.join(",") === next.activeEnemies.join(",") &&
    prev.copyTargets.join(",") === next.copyTargets.join(",") &&
    JSON.stringify(prev.stepIssues) === JSON.stringify(next.stepIssues)
);
