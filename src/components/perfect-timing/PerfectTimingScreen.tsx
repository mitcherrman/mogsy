/**
 * PERFECT TIMING — THE SCREEN: a fixed, non-scrolling frame the whole mode
 * lives in (PT4.4).
 *
 * The mode owns the viewport while it is mounted (`useFixedViewport`): the page
 * behind it cannot scroll, no key scrolls it, and every state — dealing, armed,
 * running, reveal, results, a failure — is laid out to FIT, not to overflow.
 * One slim top bar (the way back, the round pips, the running score) and one
 * stage; nothing else is on the screen.
 *
 * It renders through a portal into <body>: the app's header, account cluster and
 * footer live in stacking contexts the screen could not otherwise rise above, and
 * the same hook makes the app root inert so Tab cannot reach anything under it.
 *
 * The backdrop is the current champion's splash, darkened and held behind the
 * stage. It is decoration: a missing or failed image leaves the dark frame.
 */
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFixedViewport } from "@/lib/perfect-timing/useFixedViewport";
import type { PtTier } from "@/lib/perfect-timing/viewModel";
import "./perfectTiming.css";

/** Progress through the run as pips, one per round, lit by the tier each settled at. */
export function RunPips({ index, total, outcomes }: { index: number; total: number; outcomes?: readonly (PtTier | "voided" | null)[] }) {
  const count = Math.max(1, Math.min(total, 12));
  return (
    <span className="pt-pips" role="img" aria-label={`Round ${index} of ${total}`} data-testid="pt-pips">
      {Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        const state = n < index ? "done" : n === index ? "current" : "upcoming";
        const outcome = outcomes?.[i] ?? null;
        return <span key={n} className="pt-pip" data-state={state} data-tier={outcome ?? undefined} />;
      })}
    </span>
  );
}

/** The top bar: the way back (`lead`), the run's pips, the score, then any trailing control. */
export function PerfectTimingBar({ lead, index, total, outcomes, points, trailing }: {
  lead: ReactNode;
  /** 1-based; 0 while dealing. */
  index: number;
  total: number;
  outcomes?: readonly (PtTier | "voided" | null)[];
  points: number | null;
  trailing?: ReactNode;
}) {
  return (
    <div className="pt-bar" data-testid="pt-chrome">
      {lead}
      <span className="pt-bar-run">
        <RunPips index={index} total={total} outcomes={outcomes} />
      </span>
      <span className="pt-bar-score" data-testid="pt-score" aria-label="Points so far">
        <b>{points ?? 0}</b><small>pts</small>
      </span>
      {trailing}
    </div>
  );
}

/** A champion's art behind the stage, fading in once it has loaded; a failed image leaves the frame bare. */
function Backdrop({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const show = src && failed !== src;
  return (
    <div className="pt-backdrop" aria-hidden data-testid="pt-backdrop" data-art={show && loaded === src ? "loaded" : "none"}>
      {show ? (
        <img key={src} src={src} alt="" draggable={false}
          onLoad={() => setLoaded(src)} onError={() => setFailed(src)} />
      ) : null}
    </div>
  );
}

export function PerfectTimingScreen({ bar, art, stage, children }: {
  bar: ReactNode;
  /** The backdrop's image URL. */
  art?: string | null;
  /** Host state, for tests and the page's own selectors. */
  stage?: string;
  children: ReactNode;
}) {
  useFixedViewport();
  return createPortal(
    <div className="pt-screen" data-testid="perfect-timing-page" data-stage={stage}>
      <Backdrop src={art} />
      {bar}
      <main className="pt-main">{children}</main>
    </div>,
    document.body,
  );
}
