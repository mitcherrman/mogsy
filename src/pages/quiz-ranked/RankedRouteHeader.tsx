/**
 * The Ranked route's chrome — now just the way back, and almost no height.
 *
 * WHAT WAS HERE AND WHY IT IS NOT
 * ──────────────────────────────
 * "Ranked Duel · Competitive Mode" was a page heading over a screen that is
 * already, unmistakably, a ranked duel: the Match Header names the match, the
 * two banners name the duellists, and the Module Rail counts the rounds. A
 * title telling a player which mode they are in is the kind of chrome that
 * earns its place on a landing page and not on a board they are playing. It
 * cost a full row at the top of a shell that is locked to the viewport — and
 * height at the top of THIS page is height taken from the question.
 *
 * So the row is gone and the space is the arena's. `ArenaShell` still renders
 * this slot, but what it renders is a zero-height box with the way back
 * ABSOLUTELY positioned inside it, which is what lets the row collapse
 * completely instead of merely becoming short.
 *
 * WHERE THE LINK WENT, AND WHY THE FIRST ATTEMPT MISSED.
 * It was `absolute lg:left-14` — 56px from the left edge of `ArenaShell`. But
 * the shell is `mx-auto` with a `max-w`, so its left edge is NOT the viewport's:
 * at 1920 the shell spans x 240..1680, and 56px inside it put the link at
 * x ~296 — a quarter of the screen away from the hat it was supposed to sit
 * beside. The offset was right and the coordinate space was wrong.
 *
 * So it is `fixed` now, in the viewport's own space, where the hat lives.
 * `GlobalHud` lays its bar out at `h-[var(--app-header-h)]` with `pl-2 sm:pl-3`
 * and the hat chip is `h-9 w-9` — so the hat occupies x 8..44, or x 12..48 from
 * `sm` up. `left-14` (56px) clears the wider of those by 8px at every width,
 * and matching the bar's height with `items-center` puts the link on the hat's
 * own baseline rather than guessing a top offset.
 *
 * It is deliberately NOT put inside `GlobalHud`: that is global chrome on every
 * route, and a Ranked-only link does not belong in it.
 */
import { Link } from "react-router-dom";

export function RankedRouteHeader({ size = "default" }:
{ size?: "default" | "wide" }) {
  // Accepted and unused: the row no longer has a width-dependent geometry to
  // choose, because it no longer has a row.
  void size;
  return (
    // `h-0` and not "no element": the shell gives its header slot a place in
    // the flex column, and a zero-height box there collapses the row. The link
    // itself is `fixed`, so it takes no part in layout at all.
    <div className="h-0 shrink-0">
      <Link
        to="/quiz"
        data-testid="ranked-back-to-quiz"
        className="fixed left-14 top-0 z-40 flex h-[var(--app-header-h)] items-center
          text-xs text-muted-foreground/70 underline underline-offset-2
          transition-colors hover:text-muted-foreground"
      >
        Back to Quiz
      </Link>
    </div>
  );
}
