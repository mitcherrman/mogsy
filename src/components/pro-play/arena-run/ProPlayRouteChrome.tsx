/**
 * PPQ2-E — the Pro Play Quiz route's chrome: the way back, and no height.
 *
 * It is the arena routes' own pattern (`RankedRouteHeader`): a zero-height box
 * in the shell's header slot, with the link in the HUD band (below `lg`
 * beside the hat: 56px from the viewport's left edge clears the hat chip; see
 * that file for the geometry). Two differences, because this arena is not one
 * screen tall and has no clock:
 *
 *  - from `lg` the shell is locked to the viewport and nothing scrolls, so the
 *    link is `fixed` in the viewport's own space, as Ranked's. But not beside
 *    the hat: from `lg` the arena header strip is pulled up into the HUD band,
 *    and below ~1350px its left zone ("PRO PLAY QUIZ / QUESTION n / N") starts
 *    under that spot (measured at 1024: the link ran over the eyebrow). Pro
 *    Play has no clock, so the strip's CENTRE track is empty at every width;
 *    the link sits there, centred in the band;
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
import { ArrowLeft } from "lucide-react";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { cn } from "@/lib/utils";

/**
 * `fromLg={false}` on the arena's empty frames (loading, error, end): from
 * `lg` their centred panel is pulled up into the HUD band and covered the
 * link (still focusable, so a keyboard user landed on an invisible control).
 * Those panels carry their own way back, so there the band link is phone-only.
 */
export function ProPlayRouteChrome({ to, label = "Back to Pro Play", fromLg = true }: {
  to: string;
  label?: string;
  fromLg?: boolean;
}) {
  return (
    // `h-0` and not "no element": the shell gives its header slot a place in
    // the flex column, and a zero-height box there collapses the row.
    <div className="h-0 shrink-0">
      <Link
        to={to}
        data-testid="pro-play-back"
        className={cn(
          `absolute -top-[calc(var(--app-header-h)+0.75rem)] left-10 z-40 flex h-[var(--app-header-h)]
          items-center text-xs text-muted-foreground/70 underline underline-offset-2 transition-colors
          hover:text-muted-foreground`,
          fromLg ? "lg:fixed lg:left-1/2 lg:top-0 lg:-translate-x-1/2" : "lg:hidden",
        )}
      >
        {label}
      </Link>
    </div>
  );
}

/**
 * W26Q-UX — the Worlds 2026 Quiz's one-screen chrome: the way back, the
 * position, and the site's name (`mogzy.lol`) at EVERY width, as the Daily's
 * and Practice's header rows carry it.
 *
 *  - below `lg` it is Practice's one line, a real row in the shell's header
 *    slot (`arenaHeaderRowClass`, `min-h-7`) under the app's HUD band: way
 *    back at the left, the position beside it (the desktop strip is hidden on
 *    a phone, so the position lives here), the domain at the right. The row
 *    never wraps: `Back to Worlds`, `n / N` and the domain together are ~190px
 *    at 12px type, against 328px at 360 wide;
 *  - from `lg` the row is the zero-height box `ProPlayRouteChrome` is, and its
 *    two items are `fixed` in the HUD band so the stage keeps every pixel it
 *    has: the way back centred (the strip's centre track is empty — there is
 *    no clock), the domain at the band's right, clear of the identity cluster
 *    (`right-62`: ~236px of cluster plus a gutter). The position and the
 *    score are the strip's own there.
 *
 * Same link, same test id and same label as `ProPlayRouteChrome`; one element
 * serves both regimes, so there is exactly one way back in the DOM.
 */
export function ProPlayOneScreenChrome({ to, label, brand, number, total, correct, emptyFrame = false }: {
  to: string;
  label: string;
  brand: string;
  /** The question on the stage (1-based), or null on the empty frames. */
  number: number | null;
  total: number;
  /** The server's score so far, shown once something has been answered. */
  correct: number | null;
  /**
   * The loading / error / end frames: from `lg` their panel carries its own
   * way back and would cover the band's (as `ProPlayRouteChrome`'s
   * `fromLg={false}`), so the band link is phone-only there.
   */
  emptyFrame?: boolean;
}) {
  return (
    <header data-testid="pro-play-chrome"
      className={`${arenaHeaderRowClass("wide")} !flex-nowrap !gap-1.5 sm:!gap-2 lg:!h-0 lg:!min-h-0 lg:!p-0`}>
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to={to}
          data-testid="pro-play-back"
          className="relative z-40 inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap text-xs
            text-muted-foreground/80 underline-offset-2 transition-colors hover:text-muted-foreground
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-300
            before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']
            lg:fixed lg:left-1/2 lg:top-0 lg:h-[var(--app-header-h)] lg:-translate-x-1/2 lg:underline
            data-[empty-frame=true]:lg:hidden"
          data-empty-frame={emptyFrame ? "true" : undefined}
        >
          <ArrowLeft aria-hidden className="h-3.5 w-3.5 lg:hidden" />
          {label}
        </Link>
        {number !== null && total > 0 && (
          <span data-testid="pro-play-position"
            className="shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums text-muted-foreground lg:hidden">
            <span aria-hidden>
              {number} / {total}
              {correct !== null && correct > 0 ? <span className="hidden min-[400px]:inline">{` · ${correct} correct`}</span> : null}
            </span>
            <span className="sr-only">
              {`Question ${number} of ${total}${correct !== null && correct > 0 ? `, ${correct} correct` : ""}`}
            </span>
          </span>
        )}
      </div>
      <span data-testid="pro-play-brand"
        className="ml-auto shrink-0 whitespace-nowrap text-xs font-semibold tracking-wide text-sky-200 sm:text-sm
          lg:fixed lg:right-[15.5rem] lg:top-0 lg:z-40 lg:ml-0 lg:flex lg:h-[var(--app-header-h)] lg:items-center">
        {brand}
      </span>
    </header>
  );
}
