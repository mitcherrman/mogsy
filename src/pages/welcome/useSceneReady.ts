import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// "Is the stage actually there yet?" (HI1-C4)
//
// THE PROBLEM THIS SOLVES. The introduction's clock used to start 260ms after
// mount, unconditionally. On a cold arrival from the entrance that is well
// before the painted book has decoded and before Cinzel has replaced Georgia,
// so the opening beat played over a stage that was still being built: the tome
// arriving in pieces, the heading re-setting itself in a different face, the
// first sentence and the quill starting under both. The fix is not a longer
// pause — it is asking.
//
// WHAT "READY" MEANS. Every image in `sources` has DECODED (not merely
// downloaded — `decode()` is what guarantees the next frame can paint it
// without stalling), and the display face has loaded. Nothing else: the room
// plate, the later chapters' artwork and the audio graph are all allowed to
// arrive whenever they arrive, because none of them can move the geometry or
// re-set the type.
//
// THE CEILING IS A CEILING, NOT A DELAY. `capMs` is not a pause anybody waits
// out — on a warm arrival readiness resolves in a frame or two and the cap is
// never reached. It exists so that a wedged CDN, a blocked font host or a
// decode that simply never resolves cannot hold the introduction shut. When it
// fires, the sequence starts anyway; the visitor gets the imperfect version
// rather than no version, which is the correct failure for a first impression.
//
// AND IT ALWAYS RESOLVES. Every path below — decoded, failed, unsupported,
// capped, no sources at all — ends with `ready` true. This is load-bearing:
// the page holds its opening frame while `ready` is false, so a state that
// could stay false would be a blank screen. `useSceneReady.test.ts` pins each
// path.
// ---------------------------------------------------------------------------

/**
 * The longest the introduction may hold its opening frame, in ms.
 *
 * Chosen against what is actually being waited for — a ~530KB painting and one
 * font file — rather than as a round number: on anything better than a poor 3G
 * connection both land well inside it, and beyond it the visitor is better
 * served by a book that starts writing than by a room that keeps not opening.
 */
export const SCENE_READY_CAP_MS = 2200;

/**
 * True when this environment can actually observe an image decoding.
 *
 * jsdom fetches no subresources and implements no `HTMLImageElement.decode`, so
 * `load` never fires and `complete` never turns true: waiting there would wait
 * for ever, and every test of this page would hang against a blank stage. An
 * environment that cannot answer the question is treated as already ready,
 * which is also the correct answer for server rendering.
 */
function canObserveDecode(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof HTMLImageElement !== "undefined" &&
    typeof HTMLImageElement.prototype.decode === "function"
  );
}

/** One image, resolved when it is decoded — or when it is hopeless. */
function decoded(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    // A failed decode is a resolved promise on purpose. This gate decides WHEN
    // the curtain goes up, never WHETHER — a 404 must not close the theatre.
    img.decoding = "async";
    img.src = src;
    img
      .decode()
      .then(() => resolve())
      .catch(() => resolve());
  });
}

/** The display face, resolved when it is usable — or when it is not coming. */
function fontLoaded(font: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  return document.fonts
    .load(font)
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * Hold until the first screen can be painted in one piece.
 *
 * @param sources  Images the opening frame cannot be honest without.
 * @param font     `FontFaceSet.load` shorthand for the display face, if any.
 * @param capMs    The ceiling. See the note above — it is a guard, not a pause.
 */
export function useSceneReady(
  sources: readonly string[],
  font?: string,
  capMs: number = SCENE_READY_CAP_MS,
): boolean {
  // Ready from the first render wherever there is nothing to wait for, so the
  // gate costs a warm arrival (and every test) exactly nothing.
  const [ready, setReady] = useState(() => !canObserveDecode());

  useEffect(() => {
    if (!canObserveDecode()) return;

    let live = true;
    const settle = () => {
      if (live) setReady(true);
    };

    // Bare setTimeout, not window.setTimeout: fake timers replace the global
    // one, and a `window.`-qualified timer is never faked. Same reason as the
    // sequence clock in useRevealSequence.
    const cap = setTimeout(settle, capMs);
    void Promise.all([...sources.map(decoded), font ? fontLoaded(font) : Promise.resolve()]).then(
      settle,
    );

    return () => {
      live = false;
      clearTimeout(cap);
    };
    // `sources` is a module-level constant at every call site; joining it keeps
    // a caller who builds the array inline from re-arming the gate every render.
  }, [sources.join("|"), font, capMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return ready;
}
