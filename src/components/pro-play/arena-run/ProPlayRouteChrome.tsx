/**
 * PPQ2-E — the Pro Play Quiz route's chrome: the way back, and no height.
 *
 * It is the arena routes' own pattern (`RankedRouteHeader`): a zero-height box
 * in the shell's header slot, with the link in the HUD band beside the hat
 * (56px from the viewport's left edge clears the hat chip at every width; see
 * that file for the geometry). One difference, because this arena is not one
 * screen tall:
 *
 *  - from `lg` the shell is locked to the viewport and nothing scrolls, so the
 *    link is `fixed` in the viewport's own space, exactly as Ranked's;
 *  - below `lg` the arena stacks and the PAGE scrolls. A `fixed` text link
 *    there floated over the stage as it scrolled under it (measured at
 *    390×844), unreadable and on top of the plate. So below `lg` it is
 *    `absolute` and scrolls away with the page like any page header.
 *
 * WHAT IT IS ABSOLUTE TO. `.ranked-shell > *` makes every shell child
 * `position: relative`, so the containing block is this zero-height box, not
 * the shell: it sits at the shell's padding edge, `px-4 pt-3` below `lg`
 * (ArenaShell), and the shell itself starts at the HUD band's bottom. Hence
 * `top: -(band + 0.75rem)` and `left: 56px - 1rem`, which put the link on the
 * same box `RankedRouteHeader` uses (x 56, y 0..band), at scroll 0.
 */
import { Link } from "react-router-dom";

export function ProPlayRouteChrome({ to, label = "Back to Pro Play" }: { to: string; label?: string }) {
  return (
    // `h-0` and not "no element": the shell gives its header slot a place in
    // the flex column, and a zero-height box there collapses the row.
    <div className="h-0 shrink-0">
      <Link
        to={to}
        data-testid="pro-play-back"
        className="absolute -top-[calc(var(--app-header-h)+0.75rem)] left-10 z-40 flex h-[var(--app-header-h)]
          items-center text-xs text-muted-foreground/70 underline underline-offset-2 transition-colors
          hover:text-muted-foreground lg:fixed lg:left-14 lg:top-0"
      >
        {label}
      </Link>
    </div>
  );
}
