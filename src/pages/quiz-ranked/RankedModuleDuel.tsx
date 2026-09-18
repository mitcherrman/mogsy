/**
 * RE1 — THE TEN-VS-TEN MODULE COMPARISON.
 *
 * The viewer's modules on top, the opponent's underneath, the module numbers
 * between them, and every column one module. It is ONE CSS grid, not two flex
 * rows: a bubble's column is decided by the grid track its module number
 * names, so the two rows cannot drift apart whatever either bubble contains —
 * `+0`, `+4`, a dot, a neutral dash.
 *
 * The bubbles are `ModuleBubble`, the same token the live Player Columns draw,
 * with its meaning unchanged: the number is the BASE award, the white dot is
 * the speed bonus, green is a positive base, red is `+0`, neutral is a module
 * with no award to show. Oldest module on the left.
 *
 * The axis comes from `buildModuleDuel`, which places each settlement by its
 * own module number — see that file for why an index never decides a column.
 */
import { ModuleBubble } from "@/components/ranked-arena/ModuleBubble";
import type { RoleIdentity } from "@/components/ranked-arena/roleIdentity";
import type { ModuleDuelSlot, ModuleDuelSlotState } from "./moduleDuel";

type Side = "viewer" | "opponent";

function RowHeader({ label, identity, side }: {
  label: string; identity: RoleIdentity; side: Side;
}) {
  return (
    <div role="rowheader" data-testid={`module-duel-label-${side}`}
      className="flex min-w-0 items-center gap-1.5 pr-1 sm:pr-2">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: identity.accent }} />
      <span className="max-w-[3.25rem] truncate text-[10px] font-bold uppercase
        tracking-[0.12em] text-slate-300 sm:max-w-[6.5rem] sm:text-[11px]">
        {label}
      </span>
    </div>
  );
}

function Cell({ slot, side }: { slot: ModuleDuelSlot; side: Side }) {
  const cell = side === "viewer" ? slot.viewer : slot.opponent;
  const state: ModuleDuelSlotState = side === "viewer" ? slot.viewerState : slot.opponentState;
  return (
    <div role="cell"
      data-testid={`module-duel-${side}-${slot.module}`}
      data-module={slot.module}
      data-slot-state={state}
      // A module the match never reached is still a column, dimmed so it does
      // not read as one somebody lost.
      className={`flex justify-center ${state === "unplayed" ? "opacity-40" : ""}`}
    >
      <ModuleBubble
        testId={`module-duel-bubble-${side}-${slot.module}`}
        // Straight pass-through; `null` (missing, unplayed, unscored) is the
        // bubble's neutral "not scored" state, never a zero.
        basePoints={cell?.basePoints ?? null}
        speedBonusPoints={cell?.speedBonusPoints ?? null}
        // Size only — the token's two states keep their own colours. A touch
        // larger on a desktop, where ten columns have room to breathe.
        className="lg:scale-[1.2] min-[1500px]:scale-[1.3]"
      />
    </div>
  );
}

export function RankedModuleDuel({
  slots, viewerLabel, opponentLabel, viewerIdentity, opponentIdentity,
}: {
  slots: readonly ModuleDuelSlot[];
  viewerLabel: string;
  opponentLabel: string;
  viewerIdentity: RoleIdentity;
  opponentIdentity: RoleIdentity;
}) {
  if (slots.length === 0) return null;
  return (
    // A deliberately scrollable LOCAL region for the narrowest phones only:
    // the grid's tracks never shrink below a bubble, so a screen that cannot
    // seat every column scrolls this strip sideways rather than the document.
    //
    // Capped in width and centred: ten bubbles spread across a 1000px panel
    // stop reading as one row, and the comparison is a thing the eye takes in
    // at once, not scans across.
    //
    // `py-1` because the speed dot sits on the bubble's top-right edge: a
    // scroll container clips on both axes, and a dot cut in half reads as a
    // different mark.
    <div className="mx-auto w-full max-w-[46rem] overflow-x-auto py-1 sm:overflow-visible">
      <div
        role="table"
        aria-label="Module comparison"
        data-testid="module-duel"
        data-module-count={slots.length}
        className="grid min-w-max items-center gap-x-1 gap-y-1.5 sm:min-w-0 sm:gap-x-1.5 lg:gap-y-2.5"
        style={{
          gridTemplateColumns: `auto repeat(${slots.length}, minmax(1.75rem, 1fr))`,
        }}
      >
        <div role="row" className="contents">
          <RowHeader label={viewerLabel} identity={viewerIdentity} side="viewer" />
          {slots.map((s) => <Cell key={s.module} slot={s} side="viewer" />)}
        </div>
        {/* The shared module numbers, between the rows they index. */}
        <div role="row" className="contents" data-testid="module-duel-axis">
          <span aria-hidden />
          {slots.map((s) => (
            <span key={s.module} role="columnheader" aria-label={`Module ${s.module}`}
              data-testid={`module-duel-axis-${s.module}`}
              className="text-center text-[9px] font-semibold tabular-nums leading-none
                text-muted-foreground/60">
              {s.module}
            </span>
          ))}
        </div>
        <div role="row" className="contents">
          <RowHeader label={opponentLabel} identity={opponentIdentity} side="opponent" />
          {slots.map((s) => <Cell key={s.module} slot={s} side="opponent" />)}
        </div>
      </div>
    </div>
  );
}
