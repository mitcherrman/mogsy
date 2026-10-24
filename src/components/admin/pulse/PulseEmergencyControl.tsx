// ---------------------------------------------------------------------------
// PULSE-2B — emergency editorial disable.
//
// Takes managed content off the public Home Hub immediately, WITHOUT turning
// Pulse itself off (that is the build-time VITE_ACADEMY_PULSE=off rollback,
// which removes the whole device from /lol). Two scopes:
//   partners  sponsor + creator content only (brand-safety incident)
//   managed   everything authored here; Pulse falls back to the shipped
//             static editorial set
// It needs a reason, carries no revision (it must win over any concurrent
// edit), and asks only for the trusted owner session so it is never blocked
// behind an MFA prompt during an incident.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { OctagonAlert, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PulseKillScope, PulseScheduleSettings } from "@/lib/admin/pulse/contract";
import type { PulseWorkspaceState } from "@/lib/admin/pulse/usePulseWorkspace";
import { cn } from "@/lib/utils";

const SCOPE_LABEL: Record<PulseKillScope, string> = {
  partners: "Sponsor and creator content",
  managed: "All managed content",
};

export function PulseEmergencyControl({ schedule, busy, write }: { schedule: PulseScheduleSettings; busy: boolean; write: PulseWorkspaceState["write"] }) {
  const { kill } = schedule;
  const [scope, setScope] = useState<PulseKillScope>(kill.active ? kill.scope : "partners");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const apply = async (active: boolean) => {
    const r = await write((repo) => repo.setEditorialKill({ active, scope, reason: active ? reason : `Restored: ${reason || "no note"}` }));
    setResult(r.ok ? null : r.message);
    if (r.ok) setReason("");
  };

  return (
    <section
      className={cn("rounded-lg border p-3", kill.active ? "border-destructive/60 bg-destructive/10" : "border-border bg-muted/20")}
      data-testid="pulse-emergency"
      data-active={kill.active ? "true" : "false"}
      aria-labelledby="pulse-emergency-h"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 id="pulse-emergency-h" className="flex items-center gap-1.5 text-sm font-semibold">
            {kill.active ? <OctagonAlert className="h-4 w-4 text-destructive" aria-hidden /> : <ShieldOff className="h-4 w-4 text-muted-foreground" aria-hidden />}
            Emergency editorial disable
          </h3>
          {kill.active ? (
            <p className="text-xs" role="status" data-testid="pulse-emergency-status">
              <strong>{SCOPE_LABEL[kill.scope]}</strong> is off the Home Hub{kill.changedAt ? ` since ${new Date(kill.changedAt).toLocaleString()}` : ""}.
              {" "}Reason: {kill.reason}
              {kill.scope === "managed" && " Pulse is showing the shipped static editorial set."}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Pulls content off the public Home Hub at once. Pulse itself stays on; turning the whole device off is the build-time rollback
              (<code>VITE_ACADEMY_PULSE=off</code>).
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {!kill.active && (
            <label className="space-y-1 text-[11px] font-semibold">
              <span className="block">Scope</span>
              <select className="rounded-md border bg-background px-2 py-1 text-xs" value={scope} disabled={busy}
                onChange={(e) => setScope(e.target.value as PulseKillScope)} data-testid="pulse-emergency-scope">
                <option value="partners">{SCOPE_LABEL.partners}</option>
                <option value="managed">{SCOPE_LABEL.managed}</option>
              </select>
            </label>
          )}
          <label className="space-y-1 text-[11px] font-semibold">
            <span className="block">{kill.active ? "Note (optional)" : "Reason (recorded)"}</span>
            <input className="w-56 rounded-md border bg-background px-2 py-1 text-xs" value={reason} disabled={busy} maxLength={300}
              onChange={(e) => setReason(e.target.value)} data-testid="pulse-emergency-reason" />
          </label>
          {kill.active ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void apply(false)} data-testid="pulse-emergency-restore">Restore content</Button>
          ) : (
            <Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={() => void apply(true)} data-testid="pulse-emergency-disable">
              Disable now
            </Button>
          )}
        </div>
      </div>
      {result && <p role="alert" className="mt-2 text-xs text-destructive">{result}</p>}
    </section>
  );
}
