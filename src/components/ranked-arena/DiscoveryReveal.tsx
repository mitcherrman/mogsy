/**
 * PT1.3 — the post-match discovery ceremony.
 *
 * "I earned knowledge by playing." Ranked already ends with the result, the
 * final combatant panels and the reveal of the last round; this is the reward
 * that follows them, mounted into the shared result body's REVIEW slot so it
 * COMPLEMENTS the terminal frame rather than competing with it. It renders
 * below the record strip and above the way on.
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
 * MPE — THE CEREMONY, AND WHEN IT IS ONE
 * ──────────────────────────────────────
 * The reveal is choreographed as one short sequence (~1.4 s to the last beat):
 * the header and Mogzy — holding the book the questions go into — arrive, a
 * light sweeps the panel, each discovered question LANDS as a card on a 90 ms
 * stagger (capped, so a long list still finishes promptly), the collection
 * count climbs from before to after once the last card is down, and the way
 * into the collection follows. The discovery cue sounds as the first card
 * lands, under a stable `eventId` (`ranked:<matchId>:discovery`), so the
 * engine's own dedupe is what keeps a refetch, StrictMode or a second mount in
 * the same session from replaying it.
 *
 * `ceremony` is the CALLER's statement that the player just watched this
 * match end (Ranked passes its live-completion flag). A refresh, a reconnect
 * or a History visit onto an already finished match passes false and gets the
 * same panel at rest: every fact, no motion, no sound — a reward is celebrated
 * once, and is still TRUE every time after.
 *
 * ANSWER-FREE
 * ───────────
 * Prompt and category only — the contract refuses anything else before this
 * component ever sees it. There is nothing to expand and nothing to click into
 * here: the full card, with the answer, lives in the match's own HISTORY entry
 * where it is legitimately the player's to read.
 */
import { useEffect, type CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { useCountUp } from "@/components/game-results/useCountUp";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { useSfx } from "@/lib/audio/useSfx";
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
  /**
   * Did the player just watch this match end? True (the default) plays the
   * ceremony — motion and the discovery cue. False renders the same panel at
   * rest, for a reload or a History visit onto an already finished match.
   */
  ceremony?: boolean;
}

/**
 * THE TIMELINE, in ms after the panel mounts. One table, so the sound, the
 * cards and the count agree about when each beat is.
 */
export const DISCOVERY_BEATS = {
  mascot: 120,
  /** The first card lands, and the cue sounds. */
  cards: 180,
  /** Between cards. */
  cardStep: 90,
  /** The last card's delay is capped: a reward that outlasts the reader's
   *  attention is a delay, not a ceremony. */
  cardMaxDelay: 640,
  /** The collection count begins this long after the last card. */
  growthAfterLastCard: 320,
  growthDuration: 600,
} as const;

export function cardDelayMs(index: number): number {
  return Math.min(DISCOVERY_BEATS.cards + index * DISCOVERY_BEATS.cardStep, DISCOVERY_BEATS.cardMaxDelay);
}

function delayStyle(ms: number): CSSProperties {
  return { "--reward-delay": `${ms}ms` } as CSSProperties;
}

/** The engine's identity for this match's cue. Exported so a test can name it. */
export function discoverySoundEventId(matchId: string): string {
  return `ranked:${matchId}:discovery`;
}

function DiscoveryCard({ entry, index }: {
  entry: MatchDiscoveryEntryView; index: number;
}) {
  const unavailable = entry.metadataStatus === "unavailable";
  const category = entry.question?.category;
  return (
    <li
      data-testid="discovery-entry"
      data-metadata={entry.metadataStatus}
      style={delayStyle(cardDelayMs(index))}
      className="reward-card relative flex items-stretch gap-3 overflow-hidden rounded-[0.55rem]
        border border-[#f0d78c]/18 bg-[#0b1727] py-2 pr-3"
    >
      {/* The spine: a discovered question is a card in the player's book. A
          retired question keeps its place with a quieter spine — it is still
          owned, there is just nothing in the bank to describe it. */}
      <span aria-hidden className={`reward-card__spine w-1 shrink-0 self-stretch rounded-r-sm ${
        unavailable
          ? "bg-slate-500/60"
          : "bg-gradient-to-b from-[#f5e6b8] via-[#c9a84c] to-[#7fd6ef]/70"}`} />
      {entry.firstRoundNumber !== null && (
        <span aria-hidden className="mt-0.5 flex h-6 min-w-7 shrink-0 items-center justify-center
          rounded-md border border-[#f0d78c]/35 bg-[#f0d78c]/10 px-1.5
          text-[10px] font-bold tracking-wide text-[#f0d78c]">
          R{entry.firstRoundNumber}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {/* Literal colours, for the reason MatchOverFrame states about its own
            banner: `.ranked-panel` paints its own dark navy whatever the page
            theme is, so a theme token (`text-muted-foreground`) resolves to
            near-black on any surface outside `.theme-lol` — the dev arena
            inspector among them — and the text vanishes. */}
        <p className={`text-[12.5px] leading-snug ${
          unavailable ? "italic text-slate-400" : "text-slate-100"}`}>
          {/* A discovery is permanent even when nothing can currently describe
              it, so an unresolvable entry is still counted and still shown —
              dropping it would print a smaller number than the player earned. */}
          {unavailable ? "A question that has since left the Ranked bank." : entry.question?.prompt}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {/* Every row here is a FIRST-TIME discovery by contract; the stamp
              says so in words, so the panel never relies on gold alone. */}
          <span className="rounded-sm bg-[#f0d78c]/15 px-1 py-px text-[9px] font-bold uppercase
            tracking-[0.18em] text-[#f5e6b8]">
            New
          </span>
          {category && (
            // The arena's own cyan chip rather than the shared `secondary`
            // purple: OWNED wears `secondary` because it sits on parchment, and
            // the same chip on navy reads as a different product.
            <Badge variant="outline"
              className="border-[#7fd6ef]/35 bg-[#7fd6ef]/5 px-1.5 py-0
                text-[10px] font-medium text-[#9fdff2]">
              {category}
            </Badge>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Would this view render anything at all?
 *
 * Exported because the CALLER has to know too: the result body wraps its
 * review slot in its own element, so passing something that renders null still
 * costs a gap in the layout. One predicate, used by the component and by
 * whoever mounts it, is how those two answers stay identical.
 */
export function discoveryRevealHasContent(
  view: MatchDiscoveriesView | null,
): boolean {
  return view !== null && (view.newCount > 0 || view.collectionTotal > 0);
}

export function DiscoveryReveal({ view, onReview, ceremony = true }: DiscoveryRevealProps) {
  const sfx = useSfx();
  const reducedMotion = useReducedMotionPreference();
  const matchId = view?.matchId ?? null;
  const newCount = view?.newCount ?? 0;
  const rowCount = view?.newDiscoveries.length ?? 0;
  const lastCardDelay = rowCount > 0 ? cardDelayMs(rowCount - 1) : DISCOVERY_BEATS.cards;
  const growthDelay = lastCardDelay + DISCOVERY_BEATS.growthAfterLastCard;

  // The cue lands with the first card. Under a stable id, so the engine (not a
  // second guard here) decides it plays once per match per session.
  useEffect(() => {
    if (!ceremony || !matchId || newCount <= 0) return;
    const timer = window.setTimeout(() => {
      sfx.play("ranked.discovery.reveal", { eventId: discoverySoundEventId(matchId) });
    }, DISCOVERY_BEATS.cards);
    return () => window.clearTimeout(timer);
  }, [ceremony, matchId, newCount, sfx]);

  // The collection climbing from before to after, once the cards are down.
  // Both numbers are the server's; the hook only draws the distance between.
  const growth = useCountUp(view?.collectionTotal ?? 0, {
    from: view?.collectionTotalBefore ?? 0,
    delayMs: growthDelay,
    durationMs: DISCOVERY_BEATS.growthDuration,
    animate: ceremony && !reducedMotion && newCount > 0,
  });

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
      data-ceremony={ceremony ? "true" : "false"}
      aria-label="New questions discovered"
      className="ranked-panel relative isolate space-y-3 overflow-hidden px-4 py-4"
    >
      {/* Accent light: an ambient wash at the top, and one sweep as the
          cards begin. Decoration only — both are aria-hidden and absent at
          rest and under reduced motion. */}
      <div aria-hidden className="reward-glow pointer-events-none absolute inset-x-0 top-0 h-28
        bg-[radial-gradient(70%_100%_at_50%_0%,rgba(240,215,140,0.18),transparent)]" />
      {ceremony && <span aria-hidden className="reward-sheen" style={delayStyle(DISCOVERY_BEATS.cards)} />}

      <header className="relative flex items-start gap-3">
        <div className="reward-enter min-w-0 flex-1 space-y-1">
          <div className="ranked-eyebrow flex items-center gap-1.5">
            <Sparkles aria-hidden className="h-3 w-3" />
            New Questions Discovered
          </div>
          <p className="ranked-title text-lg font-bold leading-tight" data-testid="discovery-headline">
            {view.newCount} new {plural} added to your collection
          </p>
          <p className="text-[11px] text-slate-400">
            Saved to your collection — yours to study any time.
          </p>
        </div>
        {/* Mogzy holding the book the questions go into: the knowledge pose,
            served from its small-surface plate (the compact WebP, ~10 KB) —
            never the 1024px source for a 64px figure. One mascot, once, at the
            moment's edge; the hero above already carries the result's
            emotion, so this is not a second cheer. */}
        <MogzyMascot pose="holdingBook" scale="compact" decorative
          data-testid="discovery-mascot"
          className="reward-mascot h-14 w-14 shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)] sm:h-20 sm:w-20"
          style={delayStyle(DISCOVERY_BEATS.mascot)} />
      </header>

      {/* Ordered: the cards are listed in the order the match produced them. */}
      <ol className="relative space-y-1.5">
        {view.newDiscoveries.map((entry, i) => (
          <DiscoveryCard key={entry.canonicalQuestionRef} entry={entry} index={i} />
        ))}
      </ol>

      {/* Growth, printed from the server's own before/after rather than from
          the list length — the two differ if the row list was ever capped, and
          the collection is the number that must be right. The visible "after"
          climbs; the spoken sentence and the data attributes always carry the
          final figures. */}
      <p
        data-testid="discovery-growth"
        data-collection-before={view.collectionTotalBefore}
        data-collection-total={view.collectionTotal}
        className="reward-enter text-center text-xs uppercase tracking-[0.16em] text-slate-400"
        style={delayStyle(growthDelay - 200)}
      >
        {/* The arrow carries the meaning visually and reads as nothing at all
            aloud ("420 423 discovered"), so the same fact is spelled out for a
            screen reader and the glyph row is hidden from it. */}
        <span aria-hidden>
          <span>{view.collectionTotalBefore}</span>
          <span className="px-1.5 text-[#f0d78c]">→</span>
          <span className="reward-xp-value inline-block text-right font-bold tabular-nums text-[#f5e6b8]"
            data-landed={growth.done ? "true" : "false"}
            style={{ minWidth: `${String(view.collectionTotal).length}ch` }}>
            <span className="reward-xp-value__figure">{growth.value}</span>
          </span>
          <span className="pl-1.5">discovered</span>
        </span>
        <span className="sr-only">
          Your collection grew from {view.collectionTotalBefore} to{" "}
          {view.collectionTotal} discovered questions.
        </span>
      </p>

      {/* Deliberately NOT the frame's primary style. The result body renders
          its own primary ("Play Again") directly beneath this panel, and two
          identical bars would read as one control repeated. This is the
          PANEL's action, in the panel's own gold. */}
      <Button
        type="button"
        variant="outline"
        onClick={onReview}
        data-testid="discovery-cta"
        className="reward-enter min-h-[44px] w-full border-[#c9a84c]/55 bg-[#f0d78c]/5
          font-semibold text-[#f5e6b8] hover:bg-[#f0d78c]/12 hover:text-[#fdf3d4]"
        style={delayStyle(growthDelay)}
      >
        Review New Discoveries
      </Button>
    </section>
  );
}
