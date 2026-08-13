/**
 * Team-size control: one row of sizes per team, plus the price of the shape
 * they currently form.
 *
 * Through Phase 5A this rendered one button per PRICED SHAPE, which was four
 * buttons and read well. Phase 6A took the cap to three per side, and the
 * same design would have produced nine "1v1 1c / 1v2 2c / …" buttons — a grid
 * the operator has to scan to find the shape they want, growing quadratically
 * with a cap that is expected to keep rising. Two independent rows are linear
 * in the cap, read as what they are ("how many champions per team"), and put
 * the credit cost in one authoritative place instead of repeating it nine
 * times.
 *
 * Phase 6B is the payoff, and it needed no change here: a cap of five is 25
 * priced shapes, which the per-shape design would have rendered as 25 buttons.
 * This control renders ten, five per row, because it is derived from
 * TEAM_SIZES rather than from the price table's cardinality.
 *
 * What did NOT change: the sizes offered are still exactly the ones the
 * catalog prices, so an unpriced shape cannot be selected, and changing shape
 * still never moves or destroys a configuration — hidden slots keep their
 * build, plan AND targeting, and a fixed-priority entry naming a now-inactive
 * enemy stays in the draft, is shown as inactive, and is filtered out when the
 * request is built.
 */
import { cn } from "@/lib/utils";
import {
  creditCostFor,
  pricedTeamShapes,
  type CatalogIndex,
} from "@/lib/combat-lab/team-sim/catalog";
import {
  MAX_EDITOR_TEAM_SIZE,
  TEAM_SIZES,
  type TeamKey,
  type TeamSize,
} from "@/lib/combat-lab/team-sim/draft";

/**
 * The sizes this control may offer for one side: a size is selectable only if
 * the catalog prices AT LEAST ONE shape using it, it is within the backend's
 * published cap, and the editor has slots for it. All three bounds matter —
 * the backend cap and the editor's slot count are allowed to disagree, and
 * whichever is smaller wins.
 */
export function selectableSizes(
  index: CatalogIndex,
  team: TeamKey
): TeamSize[] {
  const priced = pricedTeamShapes(index);
  return TEAM_SIZES.filter((size) => {
    if (size > index.maxTeamSize || size > MAX_EDITOR_TEAM_SIZE) return false;
    return priced.some((shape) => (team === "A" ? shape.a : shape.b) === size);
  });
}

function SizeRow({
  team,
  label,
  sizes,
  selected,
  disabled,
  onSelect,
}: {
  team: TeamKey;
  label: string;
  sizes: TeamSize[];
  selected: TeamSize;
  disabled?: boolean;
  onSelect: (size: TeamSize) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div
        className="flex gap-1"
        role="group"
        aria-label={`Team ${team} size`}
        data-testid={`team-size-${team}`}
      >
        {sizes.map((size) => (
          <button
            key={size}
            type="button"
            disabled={disabled}
            aria-pressed={size === selected}
            aria-label={`Team ${team}: ${size}`}
            onClick={() => onSelect(size)}
            className={cn(
              "min-w-8 rounded border px-2 py-1 text-xs tabular-nums",
              size === selected
                ? "border-primary bg-primary/15 font-semibold"
                : "border-border hover:bg-muted",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  /**
   * Reports ONLY the side that changed.
   *
   * The first version of this control reported the whole shape —
   * `onChange(size, teamSizeB)` — and dropped an update when both rows were
   * clicked inside one React batch: the second handler still closed over the
   * pre-batch `teamSizeA`, so "A=3 then B=3" committed as 1v3. Real users
   * click in separate ticks and would not have hit it, but the hazard is
   * structural and disappears entirely when a control that owns one field
   * only ever reports that field.
   */
  onChange: (team: TeamKey, size: TeamSize) => void;
  disabled?: boolean;
}) {
  const sizesA = selectableSizes(index, "A");
  const sizesB = selectableSizes(index, "B");
  // Null when the catalog does not price this combination. `validateDraft`
  // already blocks submission in that case; this states it where the choice
  // was made rather than only in the issues list.
  const cost = creditCostFor(index, teamSizeA, teamSizeB);

  return (
    <div className="space-y-1.5" data-testid="team-size-selector">
      <p className="text-xs font-medium text-muted-foreground">Team size</p>
      <SizeRow
        team="A"
        label="Team A"
        sizes={sizesA}
        selected={teamSizeA}
        disabled={disabled}
        onSelect={(size) => onChange("A", size)}
      />
      <SizeRow
        team="B"
        label="Team B"
        sizes={sizesB}
        selected={teamSizeB}
        disabled={disabled}
        onSelect={(size) => onChange("B", size)}
      />
      <p className="text-[11px] text-muted-foreground" data-testid="team-shape-cost">
        {teamSizeA}v{teamSizeB}
        {cost === null ? (
          <span className="ml-1 text-destructive">not priced</span>
        ) : (
          <span className="ml-1">
            · {cost} credit{cost === 1 ? "" : "s"}
          </span>
        )}
      </p>
    </div>
  );
}
