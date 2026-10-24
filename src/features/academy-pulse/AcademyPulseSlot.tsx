/**
 * Academy Pulse — the Home Hub's slot.
 *
 * Reserves Pulse's box from the first frame (an empty device, pure CSS, no
 * images) so the Orrery's layout is final before the startup veil lifts, and
 * fetches the Pulse code only once the page says its own first screen has
 * settled (`ready`). Pulse therefore adds nothing to the startup path: no
 * chunk, no art, no work, until the Orrery is drawn and the browser is idle.
 */
import { Component, lazy, Suspense, type ReactNode } from "react";

import type { AcademyPulseProps } from "./AcademyPulse";
import "./academy-pulse-slot.css";

const AcademyPulse = lazy(() => import("./AcademyPulse"));

function Reserved({ variant }: { variant: "desktop" | "mobile" }) {
  return <div className="apulse-reserved" data-variant={variant} aria-hidden data-testid="academy-pulse-reserved" />;
}

/** A failed chunk or a scene error leaves the reserved frame, never a broken Home Hub. */
class PulseBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.warn("[academy-pulse] disabled after an error", error);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function AcademyPulseSlot({
  ready,
  variant = "desktop",
  ...props
}: AcademyPulseProps & { ready: boolean }) {
  const fallback = <Reserved variant={variant} />;
  return (
    <div className="apulse-slot" data-variant={variant} data-testid={`academy-pulse-slot${variant === "mobile" ? "-mobile" : ""}`}>
      {ready ? (
        <PulseBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <AcademyPulse variant={variant} {...props} />
          </Suspense>
        </PulseBoundary>
      ) : fallback}
    </div>
  );
}
