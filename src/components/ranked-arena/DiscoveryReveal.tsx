/**
 * PT1.3 — the post-match discovery ceremony.
 *
 * "I earned knowledge by playing." Ranked already ends with the result, the
 * final combatant panels and the reveal of the last round; this is the reward
 * that follows them, mounted into `MatchOverFrame`'s existing `summary` slot
 * so it COMPLEMENTS the terminal frame rather than competing with it. It
 * renders below the outcome and above nothing important.
 *
 * PRESENTATIONAL, AND STRICTLY SO
 * ───────────────────────────────
 * Everything here comes from the server's own answer (see
 * `useMatchDiscoveries`). This component never decides what was discovered,
 * never counts a collection, and never derives ownership from a prompt, an
 * answer or a round. It renders `newCount`, `collectionTotalBefore` and
 * `collectionTotal` verbatim, so the celebration cannot say something the
 * discovery table does not.
 *
 * THREE STATES, ONE OF WHICH IS NOTHING
 * ─────────────────────────────────────
 * 1. **New discoveries** — the reveal: what was earned, how the collection
 *    grew, and a way into it.
 * 2. **None, but the account has a collection** — ONE quiet line. A match can
 *    legitimately discover nothing (every question already owned, or a format
 *    whose segments mint no canonical ref), and dressing that up as an event
 *    would turn a normal outcome into a negative one. No celebration, no
 *    empty-state art, no "0".
 * 3. **Nothing at all** — no discoveries and no collection: render nothing.
 *    The match result is complete on its own, and an empty collection panel on
 *    a player's first finished match is noise, not onboarding.
 *
 * Loading is also state 3. The read is one request against an already-settled
 * match, and a skeleton that flashes under a victory banner would delay the
 * moment for no information; the panel simply appears when it has something to
 * say.
 *
 * ANSWER-FREE
 * ───────────
 * Prompt and category only — the contract refuses anything else before this
 * component ever sees it. There is nothing to expand and nothing to click into
 * here: the full card, with the answer, lives in the match's own HISTORY entry
 * where it is legitimately the player's to read.
 */
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  MatchDiscoveriesView, MatchDiscoveryEntryView,
} from "@/lib/ranked-public/contracts";

export interface DiscoveryRevealProps {
  /** The server's answer, or null while it is loading and after any failure.
   *  Both render nothing — see the module docstring. */
  view: MatchDiscoveriesView | null;
  /** Into REVIEW → OWNED. Supplied by the controller; this component owns no
   *  navigation, exactly like every other arena component. */
  onReview: () => void;
}

/** Entrance stagger, capped so a long list still finishes promptly. A reward
 *  that outlasts the reader's attention is a delay, not a ceremony. */
const STEP_MS = 70;
const MAX_DELAY_MS = 560;

function entranceDelay(index: number): string {
  return `${Math.min(index * STEP_MS, MAX_DELAY_MS)}ms`;
}

function DiscoveryRow({ entry, index }: {
  entry: MatchDiscoveryEntryView; index: number;
}) {
  const unavailable = entry.metadataStatus === "unavailable";
  const category = entry.question?.category;
  return (
    <li
      data-testid="discovery-entry"
      style={{ animationDelay: entranceDelay(index) }}
      className="ranked-subpanel flex items-start gap-3 px-3 py-2
        animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300
        motion-reduce:animate-none"
    >
      <span
        aria-hidden
        className="mt-0.5 shrink-0 rounded bg-[#f0d78c]/10 px-1.5 py-0.5 text-[10px]
          font-bold uppercase tracking-[0.14em] text-[#f0d78c]"
      >
        {entry.firstRoundNumber === null ? "New" : `R${entry.firstRoundNumber}`}
      </span>
      <div className="min-w-0 flex-1">
        {/* Literal colours, for the reason MatchOverFrame states about its own
            banner: `.ranked-panel` paints its own dark navy whatever the page
            theme is, so a theme token (`text-muted-foreground`) resolves to
            near-black on any surface outside `.theme-lol` — the dev arena
            inspector among them — and the text vanishes. */}
        <p className={`text-[12.5px] leading-snug ${
          unavailable ? "italic text-slate-400" : "text-slate-100"
        }`}>
          {/* A discovery is permanent even when nothing can currently describe
              it, so an unresolvable entry is still counted and still shown —
              dropping it would print a smaller number than the player earned. */}
          {unavailable ? "A question that has since left the Ranked bank." : entry.question?.prompt}
        </p>
        {category && (
          // The arena's own cyan chip rather than the shared `secondary`
          // purple: OWNED wears `secondary` because it sits on parchment, and
          // the same chip on navy reads as a different product.
          <Badge variant="outline"
            className="mt-1 border-[#7fd6ef]/35 bg-[#7fd6ef]/5 px-1.5 py-0
              text-[10px] font-medium text-[#9fdff2]">
            {category}
          </Badge>
        )}
      </div>
    </li>
  );
}

/**
 * Would this view render anything at all?
 *
 * Exported because the CALLER has to know too: `MatchOverFrame` wraps its
 * summary slot in a flex child, so passing an element that renders null still
 * costs a gap in the terminal frame's layout. One predicate, used by the
 * component and by whoever mounts it, is how those two answers stay identical.
 */
export function discoveryRevealHasContent(
  view: MatchDiscoveriesView | null,
): boolean {
  return view !== null && (view.newCount > 0 || view.collectionTotal > 0);
}

export function DiscoveryReveal({ view, onReview }: DiscoveryRevealProps) {
  if (view === null || !discoveryRevealHasContent(view)) return null;

  // State 2: nothing was discovered, but the account has a collection.
  // Never a celebratory panel, never a "0".
  if (view.newCount <= 0) {
    return (
      <section
        data-testid="discovery-quiet"
        aria-label="Collection status"
        /* The `.ranked-subpanel` LOOK, spelled out rather than borrowed: that
           class paints a translucent gradient, which is a background-IMAGE, so
           a Tailwind `bg-[...]` cannot make it opaque and the strip takes the
           colour of whatever is behind the frame. An opaque ground of its own
           keeps this line legible wherever it is mounted — and it stays the
           quietest box on the screen, which is the right weight for a
           non-event. */
        className="flex flex-wrap items-center justify-between gap-2
          rounded-[0.6rem] border border-[#7fd6ef]/25 bg-[#0b1727] px-3 py-2
          text-xs text-slate-400"
      >
        <span>
          No new questions this match ·{" "}
          <strong className="font-semibold text-slate-200">{view.collectionTotal}</strong>
          {" "}in your collection
        </span>
        <button
          type="button"
          onClick={onReview}
          data-testid="discovery-quiet-cta"
          className="underline underline-offset-2 hover:text-slate-100"
        >
          Review collection
        </button>
      </section>
    );
  }

  const plural = view.newCount === 1 ? "question" : "questions";
  return (
    <section
      data-testid="discovery-reveal"
      data-new-count={view.newCount}
      aria-label="New questions discovered"
      className="ranked-panel space-y-3 px-4 py-4
        animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
    >
      <header className="space-y-1 text-center">
        <div className="ranked-eyebrow flex items-center justify-center gap-1.5">
          <Sparkles aria-hidden className="h-3 w-3" />
          New Questions Discovered
        </div>
        <p className="ranked-title text-lg font-bold" data-testid="discovery-headline">
          {view.newCount} new {plural} added to your collection
        </p>
      </header>

      <ul className="space-y-1.5">
        {view.newDiscoveries.map((entry, i) => (
          <DiscoveryRow key={entry.canonicalQuestionRef} entry={entry} index={i} />
        ))}
      </ul>

      {/* Growth, printed from the server's own before/after rather than from
          the list length — the two differ if the row list was ever capped, and
          the collection is the number that must be right. */}
      <p
        data-testid="discovery-growth"
        className="text-center text-xs uppercase tracking-[0.16em] text-slate-400"
      >
        {/* The arrow carries the meaning visually and reads as nothing at all
            aloud ("420 423 discovered"), so the same fact is spelled out for a
            screen reader and the glyph row is hidden from it. */}
        <span aria-hidden>
          <span>{view.collectionTotalBefore}</span>
          <span className="px-1.5 text-[#f0d78c]">→</span>
          <span className="font-bold text-[#f5e6b8]">{view.collectionTotal}</span>
          <span className="pl-1.5">discovered</span>
        </span>
        <span className="sr-only">
          Your collection grew from {view.collectionTotalBefore} to{" "}
          {view.collectionTotal} discovered questions.
        </span>
      </p>

      {/* Deliberately NOT the frame's primary style. `MatchOverFrame` already
          renders a full-width primary ("Back to Quiz") directly beneath this
          panel, and two identical bars would read as one control repeated.
          This is the PANEL's action, in the panel's own gold. */}
      <Button
        type="button"
        variant="outline"
        onClick={onReview}
        data-testid="discovery-cta"
        className="min-h-[44px] w-full border-[#c9a84c]/55 bg-[#f0d78c]/5
          font-semibold text-[#f5e6b8] hover:bg-[#f0d78c]/12 hover:text-[#fdf3d4]"
      >
        Review New Discoveries
      </Button>
    </section>
  );
}
