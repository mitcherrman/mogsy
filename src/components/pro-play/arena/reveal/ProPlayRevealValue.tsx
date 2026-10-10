/**
 * PPQ2-D — one option's statistic, drawn INSIDE its answer tablet.
 *
 * It is PPQ2-C's positional reveal slot: `ProPlayOptionContent` mounts it in
 * the same grid cell as the identity facts (which stay, invisible, to hold the
 * box), so the tablet does not grow where facts exist. It is not interactive
 * and carries no state colour of its own: the canonical button already paints
 * correct / incorrect / "Your pick" and the verdict icon, and this inherits
 * its foreground.
 *
 * SYMMETRY. Every candidate draws the same two elements in the same order —
 * the server's `display` and the support line — whatever its correctness or
 * whether the evidence named it (`—` and an empty, height-holding support
 * line). No bar, no rank, no delta.
 *
 * MOTION. A short fade-and-rise, staggered by server position, after the
 * canonical tablet state has already landed (beat 1). None at all when either
 * reduced-motion switch is on; the value is never withheld either way.
 */
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { cn } from "@/lib/utils";
import type { TabletLayout } from "../proPlayArenaModel";
import { REVEAL_EMPTY_VALUE, type RevealCandidate } from "./proPlayRevealModel";

/** Beat 2 timing. Short on purpose: the reveal must never feel like a wait. */
export const REVEAL_VALUE_DELAY_MS = 120;
export const REVEAL_VALUE_STAGGER_MS = 70;
export const REVEAL_VALUE_DURATION_MS = 280;

export interface ProPlayRevealValueProps {
  candidate: RevealCandidate;
  /** PPQ2-C's tablet layout: "facing" (pair) stacks; "grid"/"stack" is one line. */
  layout: TabletLayout;
}

export function ProPlayRevealValue({ candidate, layout }: ProPlayRevealValueProps) {
  const reduced = useReducedMotionPreference();
  const facing = layout === "facing";
  const display = candidate.value?.display ?? REVEAL_EMPTY_VALUE;
  const support = candidate.value?.support ?? null;
  const motion = reduced ? "static" : "staged";
  return (
    <span
      data-pp-reveal-value={candidate.value ? "present" : "missing"}
      data-pp-reveal-motion={motion}
      title={support ? `${display} · ${support}` : display}
      className={cn(
        "flex min-w-0",
        // A pair stacks value over support on phones (~100px of text). From
        // lg the stage is height-locked and a pair tablet is wide, so it is one
        // line: a champion pair (no facts cell to fill) then grows ~18px, not ~40.
        // `lg:pb-2` clears the canonical "Your pick" label (bottom-right) for
        // a champion pair, whose value is the tablet's last line; a player or
        // team pair still fits inside its facts box.
        facing
          ? "flex-col items-center gap-0.5 text-center lg:flex-row lg:items-baseline lg:justify-center lg:gap-1.5 lg:pb-2"
          // `pr-12`: a compact value can be the tablet's bottom line, where the
          // canonical "Your pick" label sits at the right (measured up to 46px
          // into the content box at 1024×768); the support line truncates
          // before it. Same inset on every candidate, so no tablet differs by
          // correctness or pick.
          : "items-baseline gap-1.5 self-center pr-12",
        !reduced && "animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both ease-out",
      )}
      style={reduced ? undefined : {
        animationDelay: `${REVEAL_VALUE_DELAY_MS + candidate.index * REVEAL_VALUE_STAGGER_MS}ms`,
        animationDuration: `${REVEAL_VALUE_DURATION_MS}ms`,
      }}
    >
      <span
        data-pp-reveal-display
        className={cn(
          "shrink-0 font-black tabular-nums tracking-tight",
          facing ? "text-[18px] sm:text-[20px]" : "text-[15px] sm:text-[16px]",
          // AFTER the size: tailwind-merge drops a `leading-*` that precedes a
          // font-size class, and the value then inherits the tablet's relaxed
          // line-height (10px taller than the facts it replaces).
          "leading-none sm:leading-none",
          !candidate.value && "opacity-60",
        )}
      >
        {display}
      </span>
      <span
        data-pp-reveal-support
        // An absent line keeps its box (one line tall) so every tablet keeps
        // the same rhythm; it is not announced.
        aria-hidden={support ? undefined : true}
        className={cn(
          "min-w-0 text-[10px] font-semibold leading-tight opacity-80 sm:text-[11px]",
          // A phone pair tablet is ~100px of text: tracked capitals clip
          // "of 22 scope games", plain case fits it.
          facing
            ? "line-clamp-1 normal-case tracking-normal sm:uppercase sm:tracking-[0.06em] lg:line-clamp-none lg:truncate"
            : "truncate uppercase tracking-[0.06em]",
          !support && "invisible",
        )}
      >
        {support ?? REVEAL_EMPTY_VALUE}
      </span>
    </span>
  );
}
