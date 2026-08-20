import bookSpread from "@/academy/welcome/academy-book-spread.png";
import { MOGZY_MASCOT_ASSETS } from "@/components/mascot/mascot-assets";

// ---------------------------------------------------------------------------
// The Academy introduction's FIRST SCREEN, as a list (HI1-C4).
//
// WHY THIS MODULE EXISTS. The cinematic introduction starts writing 260ms after
// it mounts (OPENING_PAUSE_MS), and on a cold arrival that is long before the
// stage it writes onto has arrived. Two of the three files below are the stage:
// without the painted book the tome has no drawn frame at all, and without
// Cinzel the heading is set in Georgia and then re-set — either one turns the
// opening beat into the page assembling itself in front of the visitor. The
// readiness gate in useSceneReady waits for exactly these, and the entrance at
// `/` warms them during its own 780ms veil so that by the time the route
// changes they are usually already in cache.
//
// DELIBERATELY THREE FILES, NOT THE WHOLE INTRODUCTION. Chapters two to five
// carry their own artwork, and blocking the first page on the fifth chapter's
// medallion would be the "arbitrary loading screen" this pass exists to avoid.
// They stay lazy: each one arrives long before its page is turned to, and if it
// does not, its own page's wash covers it.
//
// NO COMPONENT IMPORTS HERE. The entrance screen at `/` imports this module to
// warm the scene, and it must not drag the introduction's React tree into its
// own chunk to do so. Everything below is a string or a promise.
// ---------------------------------------------------------------------------

/** The painted two-page spread. The tome's frame, and its geometry. */
export const TOME_BOOK_SRC = bookSpread;

/** Chapter one's illustration: Mogzy himself, mid-apparition. */
export const TOME_MASCOT_SRC = MOGZY_MASCOT_ASSETS.base;

/**
 * Everything the first frame of the introduction genuinely needs.
 *
 * The room plate behind the tome is deliberately absent: it sits at 14% opacity
 * behind everything, it is the single largest file on the screen, and warming
 * it here would have it competing for the connection with the two files the
 * opening beat actually cannot start without. The page fades it in when it
 * lands instead (see AcademyWelcomePage), so it no longer arrives as a stage.
 */
export const CRITICAL_SCENE_IMAGES: readonly string[] = [TOME_BOOK_SRC, TOME_MASCOT_SRC];

/**
 * The display face the chapter headings are set in.
 *
 * Loaded by index.html with `display=swap`, which means the heading paints in
 * Georgia and then re-sets in Cinzel — a visible re-flow of the largest text on
 * the page, arriving in the middle of the opening beat. Naming the face here
 * lets the readiness gate ask for it explicitly rather than hoping it wins the
 * race. The shorthand is what `FontFaceSet.load` wants: `<weight> <size> <family>`.
 */
export const TOME_DISPLAY_FONT = '700 1rem "Cinzel"';

/**
 * Pull the introduction's first screen into cache, from wherever the visitor
 * currently is.
 *
 * Fire and forget, in every sense: no return value worth awaiting, no error
 * that matters, and nothing downstream may wait on it. A warm that fails simply
 * leaves the readiness gate on the far side to do the waiting instead.
 *
 * NOT `prefetchImages` from route-prefetch. That helper is built for the
 * opposite situation — likely-next routes, warmed at idle and at LOW priority
 * so they never compete with the current paint. Here the visitor has already
 * committed: the entrance veil is closing over them, these three files are the
 * next thing they will look at, and there is nothing left on this screen worth
 * yielding to.
 */
export function warmAcademyWelcomeScene(): void {
  if (typeof window === "undefined") return;
  try {
    for (const src of CRITICAL_SCENE_IMAGES) {
      const img = new Image() as HTMLImageElement & { fetchPriority?: string };
      img.decoding = "async";
      img.fetchPriority = "high";
      img.src = src;
    }
    void document.fonts?.load(TOME_DISPLAY_FONT).catch(() => undefined);
  } catch {
    /* A warm is an optimisation. It may never be the reason anything fails. */
  }
}
