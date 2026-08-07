/**
 * Team-shape selector, offering exactly the shapes the catalog prices.
 *
 * Changing shape never moves or destroys a configuration: hidden slots keep
 * their build, plan AND targeting, so a shape round trip restores exactly what
 * was there. A fixed-priority entry naming a now-inactive enemy stays in the
 * draft, is shown as inactive, and is filtered out when the request is built —
 * so the outgoing payload can never name a combatant it does not contain.
 */
import { cn } from "@/lib/utils";
import { pricedTeamShapes, type CatalogIndex } from "@/lib/combat-lab/team-sim/catalog";
import { RUNTIME_IDS, type TeamSize } from "@/lib/combat-lab/team-sim/draft";

/**
 * The editor models exactly four runtime IDs (A1/A2/B1/B2), so it cannot
 * express a larger team even if the catalog ever prices one. Capped here
 * rather than trusting the `as TeamSize` cast below.
 */
const MAX_UI_TEAM_SIZE = RUNTIME_IDS.length / 2;

export function TeamSizeSelector({
  index,
  teamSizeA,
  teamSizeB,
  onChange,
  disabled,
}: {
  index: CatalogIndex;
  teamSizeA: TeamSize;
  teamSizeB: TeamSize;
  onChange: (a: TeamSize, b: TeamSize) => void;
  disabled?: boolean;
}) {
  const shapes = pricedTeamShapes(index).filter(
    (shape) =>
      shape.a <= index.maxTeamSize &&
      shape.b <= index.maxTeamSize &&
      shape.a <= MAX_UI_TEAM_SIZE &&
      shape.b <= MAX_UI_TEAM_SIZE
  );

  return (
    <div className="space-y-1" data-testid="team-size-selector">
      <p className="text-xs font-medium text-muted-foreground">Team shape</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Team shape">
        {shapes.map((shape) => {
          const selected = shape.a === teamSizeA && shape.b === teamSizeB;
          return (
            <button
              key={`${shape.a}v${shape.b}`}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(shape.a as TeamSize, shape.b as TeamSize)}
              className={cn(
                "rounded border px-2.5 py-1 text-xs",
                selected
                  ? "border-primary bg-primary/15 font-semibold"
                  : "border-border hover:bg-muted",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              {shape.a}v{shape.b}
              <span className="ml-1 text-[10px] text-muted-foreground">
                {shape.credits}c
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
