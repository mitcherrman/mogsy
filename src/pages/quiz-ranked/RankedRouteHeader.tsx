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
 * WHERE THE LINK WENT. Far top-left, beside the Mogzy hat — the corner a
 * player already looks at to leave. `GlobalHud`'s hat chip is a 44px fixed
 * element at x 12–56, so `left-14` seats the link just clear of it, on the
 * same baseline, at the same quiet weight it always had. It is deliberately
 * NOT put inside `GlobalHud`: that is global chrome on every route, and a
 * Ranked-only link does not belong in it.
 */
import { Link } from "react-router-dom";

export function RankedRouteHeader({ size = "default" }:
{ size?: "default" | "wide" }) {
  // Accepted and unused: the row no longer has a width-dependent geometry to
  // choose, because it no longer has a row.
  void size;
  return (
    // `h-0` and not "no element": the shell gives its header slot a place in
    // the flex column, and a zero-height box there collapses the row while
    // keeping the link's positioning context predictable.
    <div className="relative h-0 shrink-0">
      <Link
        to="/quiz"
        // Below `lg` the app shell's own header band is still reserved and the
        // hat sits inside it, so the link keeps a normal inline position there
        // rather than overlapping chrome it cannot measure.
        className="absolute left-0 top-0 z-10 text-xs text-muted-foreground/70
          underline underline-offset-2 transition-colors hover:text-muted-foreground
          lg:left-14 lg:-top-0.5"
      >
        Back to Quiz
      </Link>
    </div>
  );
}
