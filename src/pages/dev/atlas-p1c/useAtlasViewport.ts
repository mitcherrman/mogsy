/**
 * ATL-P1-C — viewport class for the three compositions.
 *
 *   desktop   ≥ 1024px: docked Context Deck + grid stage
 *   tablet    768–1023px: narrower deck + two-column stage
 *   phone     < 768px: rail + single-column deck + bottom sheet
 *
 * `short` is the landscape-phone / short-phone density switch (the CSS has
 * the matching media query; this flag only changes which controls render).
 */
import { useEffect, useState } from "react";

export type ViewportClass = "desktop" | "tablet" | "phone";

const PHONE = "(max-width: 767px)";
const TABLET = "(min-width: 768px) and (max-width: 1023px)";
const SHORT = "(max-height: 600px) and (max-width: 767px), (orientation: landscape) and (max-height: 560px)";

function read(): { viewport: ViewportClass; short: boolean } {
  if (typeof window === "undefined" || !window.matchMedia) return { viewport: "desktop", short: false };
  const phone = window.matchMedia(PHONE).matches;
  const tablet = window.matchMedia(TABLET).matches;
  const short = window.matchMedia(SHORT).matches;
  return { viewport: phone ? "phone" : tablet ? "tablet" : "desktop", short };
}

export function useAtlasViewport(): { viewport: ViewportClass; short: boolean } {
  const [state, setState] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const queries = [PHONE, TABLET, SHORT].map((q) => window.matchMedia(q));
    const sync = () => setState(read());
    sync();
    for (const q of queries) q.addEventListener?.("change", sync);
    return () => {
      for (const q of queries) q.removeEventListener?.("change", sync);
    };
  }, []);
  return state;
}
