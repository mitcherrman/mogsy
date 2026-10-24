// ---------------------------------------------------------------------------
// PULSE-2B — the real Academy Pulse device, fed by the workspace.
//
// No look-alike: this mounts the production `AcademyPulse` (frame, scenes,
// ticker, expanded view) with a provider built from workspace data, at the
// slot sizes the Home Hub gives it. Anything not live is passed with
// provenance "fixture", so the frame wears its "Sample" badge in preview.
// ---------------------------------------------------------------------------

import { Component, lazy, Suspense, useMemo, type ReactNode } from "react";

import { isRenderable } from "@/features/academy-pulse/model/pulse-cadence";
import type { PulseCadence, PulseCatalogue, PulseContentProvider, PulseItem } from "@/features/academy-pulse/model/pulse-types";

const AcademyPulse = lazy(() => import("@/features/academy-pulse/AcademyPulse"));

/** Slot sizes measured from the Orrery's left column (same as the PULSE-1 lab). */
export const PULSE_PREVIEW_SIZES = {
  desktop: { w: 369, h: 246, label: "Desktop 1366×768" },
  short: { w: 369, h: 151, label: "Short laptop (ticker)" },
  tall: { w: 430, h: 420, label: "Desktop 1920×1080" },
  mobile: { w: 358, h: 286, label: "Phone, below the first screen" },
} as const;
export type PulsePreviewSize = keyof typeof PULSE_PREVIEW_SIZES;

class PreviewBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("[admin-pulse] preview failed to draw", error); }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { key: string }) {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null;
  }
  render() {
    return this.state.failed
      ? <p role="alert" className="p-3 text-xs text-destructive">This content made the Pulse device fail to draw. It would be caught by the Home Hub's error boundary; fix it before publishing.</p>
      : this.props.children;
  }
}

interface Props {
  catalogue: PulseCatalogue;
  cadence: PulseCadence;
  size: PulsePreviewSize;
  startAt?: string;
  paused?: boolean;
  /** Changes remount the device (e.g. after an edit). */
  revisionKey: string;
}

export function PulsePresentation({ catalogue, cadence, size, startAt, paused = true, revisionKey }: Props) {
  const provider = useMemo<PulseContentProvider>(
    () => ({ id: `admin-preview:${revisionKey}`, load: async () => catalogue, peek: () => catalogue }),
    // revisionKey stands for the catalogue's content
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revisionKey],
  );
  const dims = PULSE_PREVIEW_SIZES[size];
  const key = `${revisionKey}:${size}:${startAt ?? ""}:${paused}`;
  return (
    <div
      className="relative mt-3 rounded-md bg-[#050a14]" /* not overflow-hidden: the nameplate sits on the frame's top edge (PULSE-1 §3) */
      style={{ width: dims.w, height: dims.h, maxWidth: "100%" }}
      data-testid="pulse-admin-presentation"
      data-size={size}
    >
      <PreviewBoundary resetKey={key}>
        <Suspense fallback={<div className="p-3 text-xs text-muted-foreground">Loading Pulse…</div>}>
          <AcademyPulse key={key} provider={provider} cadence={cadence} startAt={startAt} startPaused={paused} variant={size === "mobile" ? "mobile" : "desktop"} />
        </Suspense>
      </PreviewBoundary>
    </div>
  );
}

/** One item, alone, as its scene draws it. */
export function PulseItemPresentation({ item, size, paused = true }: { item: PulseItem; size: PulsePreviewSize; paused?: boolean }) {
  const renderable = isRenderable(item);
  const revisionKey = useMemo(() => JSON.stringify(item), [item]);
  const catalogue = useMemo<PulseCatalogue>(() => ({ [item.category]: [item] }), [item]);
  const cadence = useMemo<PulseCadence>(() => ({ slots: [item.category], maxPromotionsPerCycle: 1, minPromotionGap: 1 }), [item.category]);
  if (!renderable) {
    const dims = PULSE_PREVIEW_SIZES[size];
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-center text-xs text-amber-700 dark:text-amber-300"
        style={{ width: dims.w, height: dims.h, maxWidth: "100%" }}
        data-testid="pulse-admin-presentation-incomplete"
      >
        Not drawable yet: the scheduler skips incomplete scenes. Fill in the required fields to preview.
      </div>
    );
  }
  return <PulsePresentation catalogue={catalogue} cadence={cadence} size={size} startAt={item.id} paused={paused} revisionKey={revisionKey} />;
}
