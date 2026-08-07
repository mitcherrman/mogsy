/**
 * Targeting policy for one combatant.
 *
 * Only the four policies the catalog declares are offered. There is no
 * geometry, range or frontline concept in the engine, so none is exposed —
 * "fixed" is an ordered list of enemy RUNTIME IDs. Entries naming a slot that
 * is currently inactive are kept and shown struck through, so a team-shape
 * round trip does not silently rewrite the operator's priority; only the
 * active ones are sent.
 */
import { Button } from "@/components/ui/button";
import type { TargetingPolicy } from "@/lib/combat-lab/team-sim/contract";
import {
  targetingPolicyInfo,
  type CatalogIndex,
} from "@/lib/combat-lab/team-sim/catalog";
import type {
  CombatantDraft,
  DraftAction,
  RuntimeId,
} from "@/lib/combat-lab/team-sim/draft";

import { SelectField } from "./controls";

export function TargetingEditor({
  combatant,
  index,
  activeEnemies,
  dispatch,
  disabled,
}: {
  combatant: CombatantDraft;
  index: CatalogIndex;
  activeEnemies: RuntimeId[];
  dispatch: (action: DraftAction) => void;
  disabled?: boolean;
}) {
  const id = combatant.runtimeId;
  const { policy, priority } = combatant.targeting;
  const info = targetingPolicyInfo(index, policy);
  const active = new Set<string>(activeEnemies);
  const unpicked = activeEnemies.filter((enemy) => !priority.includes(enemy));
  const activeCount = priority.filter((entry) => active.has(entry)).length;

  return (
    <section className="space-y-2" aria-label={`Targeting for ${id}`}>
      <SelectField
        label={`${id} targeting`}
        value={policy}
        disabled={disabled}
        options={index.targetingPolicies.map((p) => ({ value: p, label: p }))}
        onChange={(next) =>
          dispatch({ type: "setTargetingPolicy", id, policy: next as TargetingPolicy })
        }
        hint={info?.description}
      />

      {policy === "fixed" ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            Priority order (first living entry is the target)
          </p>
          {activeCount === 0 ? (
            <p className="text-[11px] text-destructive">
              Add at least one ACTIVE enemy — fixed targeting with nothing live to
              aim at cannot run.
            </p>
          ) : null}
          {priority.length > 0 ? (
            <ol className="space-y-1" data-testid={`priority-${id}`}>
              {priority.map((enemy, position) => (
                <li key={enemy} className="flex items-center gap-1 text-xs">
                  <span className="w-5 tabular-nums text-muted-foreground">
                    {position + 1}.
                  </span>
                  <span
                    className={
                      active.has(enemy)
                        ? "flex-1 font-medium"
                        : "flex-1 font-medium text-muted-foreground line-through"
                    }
                  >
                    {enemy}
                    {active.has(enemy) ? "" : " (inactive — not sent)"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Move ${enemy} up in ${id} priority`}
                    className="rounded px-1 hover:bg-muted disabled:opacity-30"
                    disabled={disabled || position === 0}
                    onClick={() =>
                      dispatch({ type: "movePriority", id, target: enemy, direction: -1 })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${enemy} down in ${id} priority`}
                    className="rounded px-1 hover:bg-muted disabled:opacity-30"
                    disabled={disabled || position === priority.length - 1}
                    onClick={() =>
                      dispatch({ type: "movePriority", id, target: enemy, direction: 1 })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${enemy} from ${id} priority`}
                    className="rounded px-1 hover:bg-muted disabled:opacity-30"
                    disabled={disabled}
                    onClick={() => dispatch({ type: "togglePriority", id, target: enemy })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
          {unpicked.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {unpicked.map((enemy) => (
                <Button
                  key={enemy}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px]"
                  disabled={disabled}
                  onClick={() => dispatch({ type: "togglePriority", id, target: enemy })}
                >
                  + {enemy}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
