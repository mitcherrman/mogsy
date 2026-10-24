// ---------------------------------------------------------------------------
// PULSE-2B — Admin Pulse Workspace.
//
// The owner manages Academy Pulse content and cadence here instead of in
// frontend source. Storage is whatever `PulseAdminRepository` it is given:
// the in-memory prototype (clearly labelled, nothing saved) until the staged
// migration is applied, then the owner-RPC repository.
//
// AUTHORIZATION: this component assumes nothing. It is mounted behind
// <AdminRoute> (AdminPulsePage), and every write is refused server-side by
// assert_owner() regardless of what this UI shows.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Loader2, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { projectPublicPulse } from "@/lib/admin/pulse/projection";
import type { PulseAdminRepository } from "@/lib/admin/pulse/repository";
import { usePulseWorkspace } from "@/lib/admin/pulse/usePulseWorkspace";

import { PulseCadencePanel } from "./PulseCadencePanel";
import { PulseCampaignsPanel } from "./PulseCampaignsPanel";
import { PulseContentPanel } from "./PulseContentPanel";
import { PulseEmergencyControl } from "./PulseEmergencyControl";
import { PulsePreviewPanel } from "./PulsePreviewPanel";

export interface AdminPulseWorkspaceProps {
  repository: PulseAdminRepository;
  /** Clock override (tests, harness). Defaults to the server's time at load, advancing locally. */
  now?: () => Date;
}

/** The server's clock, advanced by local elapsed time, ticking each minute (schedules flip on time). */
function useServerClock(serverNow: string | undefined, override?: () => Date): Date {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const anchor = useMemo(() => ({ server: serverNow ? Date.parse(serverNow) : Date.now(), local: Date.now() }), [serverNow]);
  return override ? override() : new Date(anchor.server + (Date.now() - anchor.local));
}

export function AdminPulseWorkspace({ repository, now: nowOverride }: AdminPulseWorkspaceProps) {
  const ws = usePulseWorkspace(repository);
  const now = useServerClock(ws.snapshot?.serverNow, nowOverride);
  const nowKey = Math.floor(now.getTime() / 60_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableNow = useMemo(() => now, [nowKey]);
  const live = useMemo(() => {
    if (!ws.snapshot) return null;
    const p = projectPublicPulse(ws.snapshot, stableNow);
    return Object.values(p.catalogue).reduce((n, l) => n + (l?.length ?? 0), 0);
  }, [ws.snapshot, stableNow]);

  return (
    <div className="space-y-4" data-testid="admin-pulse-workspace" data-repository-mode={repository.mode}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Radio className="h-4 w-4 text-primary" aria-hidden /> Academy Pulse
          </h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Editorial content, cadence and partner campaigns for the Home Hub's Pulse device.
            {live !== null && <> <span data-testid="pulse-live-count">{live}</span> managed item(s) eligible right now.</>}
          </p>
        </div>
        {repository.mode === "prototype" ? (
          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200"
            data-testid="pulse-prototype-banner" role="note">
            Prototype · changes live in this tab only and are not saved to the server. The public Home Hub is unaffected.
          </p>
        ) : (
          <p className="rounded-md border px-2.5 py-1.5 text-[11px] text-muted-foreground">Server · changes apply to the public Home Hub.</p>
        )}
      </header>

      {ws.loadError && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs" data-testid="pulse-load-error">
          {ws.loadError}
          <Button size="sm" variant="outline" onClick={() => void ws.reload()}>Retry</Button>
        </div>
      )}
      {!ws.snapshot && !ws.loadError && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading…</p>
      )}

      {ws.snapshot && (
        <>
          <PulseEmergencyControl schedule={ws.snapshot.schedule} busy={ws.busy} write={ws.write} />
          <Tabs defaultValue="content">
            <TabsList>
              <TabsTrigger value="content" data-testid="pulse-tab-content">Content</TabsTrigger>
              <TabsTrigger value="cadence" data-testid="pulse-tab-cadence">Cadence & categories</TabsTrigger>
              <TabsTrigger value="campaigns" data-testid="pulse-tab-campaigns">Campaigns</TabsTrigger>
              <TabsTrigger value="preview" data-testid="pulse-tab-preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="content" className="pt-3">
              <PulseContentPanel snapshot={ws.snapshot} now={stableNow} busy={ws.busy} write={ws.write} />
            </TabsContent>
            <TabsContent value="cadence" className="pt-3">
              <PulseCadencePanel snapshot={ws.snapshot} now={stableNow} busy={ws.busy} write={ws.write} />
            </TabsContent>
            <TabsContent value="campaigns" className="pt-3">
              <PulseCampaignsPanel snapshot={ws.snapshot} busy={ws.busy} write={ws.write} />
            </TabsContent>
            <TabsContent value="preview" className="pt-3">
              <PulsePreviewPanel snapshot={ws.snapshot} now={stableNow} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
