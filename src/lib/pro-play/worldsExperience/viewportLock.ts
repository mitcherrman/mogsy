// ---------------------------------------------------------------------------
// UX4 — the document does not scroll while the Worlds experience is on screen.
//
// The experience is a fixed-viewport application: its frame is exactly the
// height the shell leaves under the global HUD, and every screen is composed
// to fit it. This lock is the backstop for the document itself (wheel, touch,
// Space / PageDown, a stale scroll offset carried in from the previous page),
// not the way content is made to fit.
//
// Reference-counted, because the page's loading frame and the shell can be
// mounted together for a moment while the experience chunk resolves; the
// class comes off when the last holder unmounts, so every other Mogzy route
// scrolls exactly as before.
// ---------------------------------------------------------------------------

import { useLayoutEffect } from "react";

export const VIEWPORT_LOCK_CLASS = "worlds-viewport-locked";

let holders = 0;

/** Locks document scrolling; returns the release. */
export function lockViewport(): () => void {
  if (typeof document === "undefined") return () => undefined;
  holders += 1;
  document.documentElement.classList.add(VIEWPORT_LOCK_CLASS);
  // A page left scrolled hands its offset to the next route; a locked
  // document must start at the top or its frame sits partly off screen.
  if (typeof window.scrollTo === "function" && (window.scrollX || window.scrollY)) {
    try {
      window.scrollTo(0, 0);
    } catch {
      /* jsdom: not implemented */
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (!holders) document.documentElement.classList.remove(VIEWPORT_LOCK_CLASS);
  };
}

/** Holds the lock for as long as the calling component is mounted. */
export function useViewportLock() {
  useLayoutEffect(() => lockViewport(), []);
}
