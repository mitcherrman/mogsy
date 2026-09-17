/**
 * RMOB2 — THE PHONE'S BOTTOM ROW.
 *
 *   [ Report ]   [ 3  4  [5]  6  7 ]   [ Rules ]
 *
 * Replaces, below `lg`, the two floating Mogzy pills and the nine-node Module
 * Rail that sat on separate lines at the foot of the page.
 *
 * NOTHING HERE IS A SECOND IMPLEMENTATION.
 *  - The timeline is the arena's own `RoundTimeline`, drawing a 5-slot WINDOW
 *    of the same projected view (`windowTimelineView`): same nodes, same
 *    states, same current marker.
 *  - Report and Rules are the dock's own tabs. This row only HOSTS them
 *    (`useMogzyDockTabHost`) while the viewport is a phone; the panels, their
 *    open state, exclusivity, focus return and the rules-seen record are the
 *    dock's and the panels' exactly as before. On a desktop viewport — and in
 *    jsdom, which has no `matchMedia` — nothing is hosted and the tabs stay in
 *    their fixed corners.
 */
import { useEffect, useState } from "react";
import { DOCK_SIDE, useMogzyDockTabHost } from "@/components/mogzy-dock/MogzyDock";
import { windowTimelineView } from "@/lib/ranked-core/roundTimeline";
import type { RoundTimelineView } from "@/lib/ranked-core/viewTypes";
import { RoundTimeline } from "./RoundTimeline";

/** Slots on screen. Five reads as a window, not a squeezed rail (see RMOB2). */
export const MOBILE_TIMELINE_WINDOW = 5;

/** The arena's phone regime: everything below Tailwind's `lg`. */
const PHONE_QUERY = "(max-width: 1023.98px)";

function usePhoneViewport(): boolean {
  const [phone, setPhone] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return phone;
}

export function MobileBottomBar({ timeline, className = "" }: {
  timeline: RoundTimelineView;
  className?: string;
}) {
  const phone = usePhoneViewport();
  const [left, setLeft] = useState<HTMLDivElement | null>(null);
  const [right, setRight] = useState<HTMLDivElement | null>(null);
  useMogzyDockTabHost(DOCK_SIDE.questionReport, left, phone);
  useMogzyDockTabHost(DOCK_SIDE.rules, right, phone);
  // Not a hidden desktop element: off a phone viewport (and in jsdom, which has
  // no `matchMedia`) the bar does not exist, so the desktop DOM is unchanged
  // and there is only ever one timeline in the document that anyone can read.
  if (!phone) return null;
  return (
    <section data-testid="ranked-mobile-bottombar" aria-label="Match controls"
      className={`ranked-mobile-bottombar flex items-center gap-1 ${className}`}>
      <div ref={setLeft} data-testid="ranked-mobile-bottombar-left"
        className="flex min-w-0 shrink-0 items-center justify-start" />
      <RoundTimeline timeline={windowTimelineView(timeline, MOBILE_TIMELINE_WINDOW)}
        testIdPrefix="mobile-" className="min-w-0 flex-1" />
      <div ref={setRight} data-testid="ranked-mobile-bottombar-right"
        className="flex min-w-0 shrink-0 items-center justify-end" />
    </section>
  );
}
