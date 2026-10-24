// PULSE-2B — "what the Home Hub would play": the public projection running
// in the real Pulse device, at a chosen moment and slot size, plus the list
// of content held back and why.
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PulseWorkspaceSnapshot } from "@/lib/admin/pulse/contract";
import { EXCLUSION_LABEL, projectPublicPulse } from "@/lib/admin/pulse/projection";
import { isoToLocalInput, localInputToIso } from "@/lib/admin/pulse/usePulseWorkspace";

import { PulsePresentation, PULSE_PREVIEW_SIZES, type PulsePreviewSize } from "./PulsePresentation";

export function PulsePreviewPanel({ snapshot, now }: { snapshot: PulseWorkspaceSnapshot; now: Date }) {
  const [size, setSize] = useState<PulsePreviewSize>("desktop");
  const [at, setAt] = useState("");
  const [rotating, setRotating] = useState(false);
  const moment = useMemo(() => (at ? new Date(localInputToIso(at) ?? now.toISOString()) : now), [at, now]);
  const projection = useMemo(() => projectPublicPulse(snapshot, moment), [snapshot, moment]);
  const revisionKey = useMemo(() => JSON.stringify([projection.catalogue, projection.cadence]), [projection]);
  const empty = Object.values(projection.catalogue).every((l) => !l?.length);
  const label = (id: string) => snapshot.items.find((i) => i.id === id)?.label ?? id;

  return (
    <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Slot size">
          {(Object.keys(PULSE_PREVIEW_SIZES) as PulsePreviewSize[]).map((s) => (
            <Button key={s} size="sm" variant={s === size ? "default" : "outline"} className="h-7 px-2 text-[11px]" aria-pressed={s === size}
              onClick={() => setSize(s)} data-testid={`pulse-preview-size-${s}`}>
              {PULSE_PREVIEW_SIZES[s].label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-[11px] font-semibold">
            <span className="block">As of</span>
            <input type="datetime-local" className="rounded-md border bg-background px-2 py-1 text-xs" value={at || isoToLocalInput(now.toISOString())}
              onChange={(e) => setAt(e.target.value)} data-testid="pulse-preview-at" />
          </label>
          {at && <Button size="sm" variant="ghost" onClick={() => setAt("")}>Now</Button>}
          <Button size="sm" variant="outline" aria-pressed={rotating} onClick={() => setRotating((r) => !r)} data-testid="pulse-preview-rotate">
            {rotating ? "Rotating" : "Paused"}
          </Button>
        </div>
        {projection.fallbackToStatic ? (
          <p className="max-w-[430px] rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs" data-testid="pulse-preview-fallback">
            Emergency disable is on for all managed content: the Home Hub shows the shipped static editorial set instead of anything here.
          </p>
        ) : empty ? (
          <p className="max-w-[430px] rounded-md border border-dashed p-3 text-xs text-muted-foreground" data-testid="pulse-preview-empty">
            Nothing managed is eligible at this moment.
          </p>
        ) : (
          <PulsePresentation catalogue={projection.catalogue} cadence={projection.cadence} size={size} paused={!rotating} revisionKey={revisionKey} />
        )}
        <p className="max-w-[430px] text-[11px] text-muted-foreground">
          The production Pulse device with this workspace's public projection. Use Next / the pips inside it to step through scenes.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Held back at this moment</h3>
        {projection.excluded.length === 0 ? (
          <p className="text-xs text-muted-foreground">Everything authored is playing.</p>
        ) : (
          <ul className="space-y-1 text-xs" data-testid="pulse-preview-excluded">
            {projection.excluded.map((e) => (
              <li key={e.id}><span className="font-medium">{label(e.id)}</span> <span className="text-muted-foreground">— {EXCLUSION_LABEL[e.reason]}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
