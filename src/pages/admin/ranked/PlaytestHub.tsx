/**
 * UGMP — the owner's one place to play every game mode: Admin → Leaguecraft →
 * Ranked → Playtests.
 *
 * Every mode is one `PlaytestModeCard`. Ranked Bot presets launch an unrated
 * Ranked Bot match through the ordinary queue (`PresetLaunch`); the four owner
 * labs open `/admin/playtests/:mode`, where the backend deals their rounds. The
 * hub reads `GET /api/admin/playtests/status` once so a lab is never offered
 * when this backend cannot serve it, and says exactly why. A preset stays
 * playable unless the backend positively reports it unavailable: the queue join
 * is its own authority and reports its own failure.
 */
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import { describePlaytestError, playtestsApi, type PlaytestStatus, type PlaytestsApi } from "@/lib/playtests/api";
import { HUB_ORDER, LAB_MODES, labModeRoute, type HubEntry, type LabModeId } from "@/lib/playtests/modes";
import { DraftMemoryLaunch, DRAFT_MEMORY_PRESET, RosterLockLaunch, ROSTER_LOCK_PRESET } from "./AssemblyLaunch";
import { MatchGridLaunch, MATCH_GRID_PRESET } from "./MatchGridLaunch";
import { OrderForgeLaunch, ORDER_FORGE_PRESET } from "./OrderForgeLaunch";
import { ReconstructLaunch, RECONSTRUCT_PRESET } from "./ReconstructLaunch";
import { ScrubLaunch, SCRUB_PRESET } from "./ScrubLaunch";
import { PlaytestModeCard } from "./PlaytestModeCard";

type StatusLoad =
  | { state: "loading" }
  | { state: "ready"; data: PlaytestStatus }
  | { state: "error"; message: string };

function usePlaytestStatus(api: PlaytestsApi, nonce: number): StatusLoad {
  const [load, setLoad] = useState<StatusLoad>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    setLoad({ state: "loading" });
    api.status()
      .then((data) => { if (!cancelled) setLoad({ state: "ready", data }); })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ state: "error", message: describePlaytestError(err, "Reading playtest availability") });
      });
    return () => { cancelled = true; };
  }, [api, nonce]);
  return load;
}

const ROUND_NOUN: Record<LabModeId, string> = {
  rangefinder: "abilities in the pool, 10 per session",
  "glyph-press": "verified rounds",
  "stat-drop": "historical rounds",
  "combat-estimate": "captured scenarios",
};

function LabModeCard({ id, status }: { id: LabModeId; status: StatusLoad }) {
  const mode = LAB_MODES[id];
  const lab = status.state === "ready" ? status.data.labs[mode.statusKey] : undefined;
  const disabledReason = status.state === "error"
    ? status.message
    : status.state === "ready"
      ? (!lab ? "This backend does not report this mode. Deploy the current League_Combat_Simulator master." : lab.available ? null : lab.reason ?? "Unavailable on this backend.")
      : null;
  return (
    <PlaytestModeCard
      testId={`${id}-launch`}
      title={mode.title}
      tier={mode.tier}
      description={mode.description}
      play={{ kind: "link", label: `Play ${mode.title}`, to: labModeRoute(id), testId: `${id}-launch-button` }}
      checking={status.state === "loading"}
      disabledReason={disabledReason}
      note={lab?.available ? `${lab.rounds} ${ROUND_NOUN[id]} · historical capture` : null}
    />
  );
}

const PRESET_OF = {
  "roster-lock": ROSTER_LOCK_PRESET,
  "draft-memory": DRAFT_MEMORY_PRESET,
  chronoscope: SCRUB_PRESET,
  "match-grid": MATCH_GRID_PRESET,
  reconstruct: RECONSTRUCT_PRESET,
  "order-forge": ORDER_FORGE_PRESET,
} as const;

function PresetModeCard({ id, status }: { id: Extract<HubEntry, { kind: "preset" }>["id"]; status: StatusLoad }) {
  const reported = status.state === "ready" ? status.data.presets[PRESET_OF[id]] : undefined;
  const unavailableReason = reported && !reported.available ? reported.reason ?? "Unavailable on this backend." : null;
  switch (id) {
    case "roster-lock": return <RosterLockLaunch title="Roster Lock" unavailableReason={unavailableReason} />;
    case "draft-memory": return <DraftMemoryLaunch title="Draft Memory" unavailableReason={unavailableReason} />;
    case "chronoscope": return <ScrubLaunch title="Chronoscope" unavailableReason={unavailableReason} />;
    case "match-grid": return <MatchGridLaunch title="Match Grid" unavailableReason={unavailableReason} />;
    case "reconstruct": return <ReconstructLaunch title="Reconstruct" unavailableReason={unavailableReason} />;
    case "order-forge": return <OrderForgeLaunch title="Order Forge" unavailableReason={unavailableReason} />;
  }
}

export function PlaytestHub({ api: injected }: { api?: PlaytestsApi } = {}) {
  const api = useMemo(() => injected ?? playtestsApi(), [injected]);
  const [nonce, setNonce] = useState(0);
  const status = usePlaytestStatus(api, nonce);
  return (
    <AdminPanel
      title="Game modes"
      description="Every mode the owner can playtest, in one place. Ranked Bot modes start an unrated match against the bot; prototypes and experiments run owner-only rounds the backend deals and reveals. Nothing here awards rating, points or leaderboard standing."
      testId="ranked-game-modes"
      action={
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => setNonce((n) => n + 1)}
          disabled={status.state === "loading"} data-testid="playtests-refresh">
          <RefreshCw className="h-3 w-3" aria-hidden /> Recheck
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="playtest-mode-grid">
        {HUB_ORDER.map((entry) =>
          entry.kind === "lab"
            ? <LabModeCard key={entry.id} id={entry.id} status={status} />
            : <PresetModeCard key={entry.id} id={entry.id} status={status} />)}
      </div>
    </AdminPanel>
  );
}

export default PlaytestHub;
