// Mechanics Explorer — production surface for the Phase 5A canonical
// mechanics engine (/api/mechanics/explorer). Phase 5B1 ships the shell,
// the Respawn Calculator and the Wave Timeline; Minions / Structures /
// Supers are visibly "Soon" until their phases land.
//
// Tool state lives in query parameters (?tool=respawn&level=11&time=21:15,
// ?tool=waves&wave=29, ?tool=waves&at=30:00) so results are shareable.
// The dev XP calculator at /dev/mechanics/xp is unrelated to this page and
// deliberately untouched.

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Clock3, Landmark, Shield, Skull, Waves as WavesIcon } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import DataSourcesNotice from "@/components/lol/DataSourcesNotice";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fetchExplorerContext, type ExplorerContext } from "@/lib/mechanics-explorer/api";
import RespawnCalculator from "./RespawnCalculator";
import WaveTimeline, { type WaveLookupMode } from "./WaveTimeline";
import { ErrorBanner, GOLD, SoonChip } from "./ui";

const DEFAULTS = {
  level: 11,
  time: "21:15",
  wave: "1",
  at: "15:00",
};

/** Backend context tokens → reader-facing names (presentation only). */
const MAP_LABELS: Record<string, string> = { summoners_rift: "Summoner's Rift" };
const MODE_LABELS: Record<string, string> = { classic_5v5: "Classic 5v5" };

export default function MechanicsExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tool = searchParams.get("tool") === "waves" ? "waves" : "respawn";
  const levelParam = Number(searchParams.get("level") ?? DEFAULTS.level);
  const timeText = searchParams.get("time") ?? DEFAULTS.time;
  const waveText = searchParams.get("wave") ?? DEFAULTS.wave;
  const atText = searchParams.get("at") ?? DEFAULTS.at;
  // `?wave=` selects by-number mode; `?at=` selects by-time; default by-number.
  const waveMode: WaveLookupMode =
    searchParams.get("at") !== null && searchParams.get("wave") === null ? "time" : "wave";

  const patchParams = (patch: Record<string, string | null>) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  const contextQuery = useQuery<ExplorerContext, Error>({
    queryKey: ["mechanics-explorer", "context"],
    queryFn: fetchExplorerContext,
    staleTime: Infinity,
  });

  return (
    <div>
      <SEOHead
        title="Mechanics Explorer — LoL Death Timers & Minion Waves | Mogzy"
        description="Interactive League of Legends mechanics tools backed by Mogzy's canonical mechanics engine: exact death-timer calculations and the full minion wave schedule, with sources for every number."
        path="/lol/mechanics"
        keywords="lol death timer calculator, league respawn timer, minion wave timer, lol wave spawn times, cannon minion timing"
      />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-8">
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
            Mogzy x LoL · Mechanics Engine
          </div>
          <h1 className="mt-1 text-3xl md:text-4xl font-bold text-foreground">Mechanics Explorer</h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
            The game's environment numbers, served straight from Mogzy's canonical mechanics engine —
            death timers, minion waves, and (soon) minions, structures and super minions. Every
            result names the rules and sources behind it.
          </p>
          <div className="mt-4" data-testid="mechanics-context">
            {contextQuery.data ? (
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-[#c9a84c]/30 bg-black/40 px-3 py-1 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  Patch {contextQuery.data.default_patch}
                </span>
                <span aria-hidden>·</span>
                <span>{MAP_LABELS[contextQuery.data.map] ?? contextQuery.data.map}</span>
                <span aria-hidden>·</span>
                <span>{MODE_LABELS[contextQuery.data.mode] ?? contextQuery.data.mode}</span>
              </span>
            ) : contextQuery.isError ? (
              <ErrorBanner error={contextQuery.error} onRetry={() => contextQuery.refetch()} />
            ) : (
              <span
                className="inline-block h-6 w-64 animate-pulse rounded-full bg-muted/40"
                aria-hidden
              />
            )}
          </div>
        </div>

        {/* Tool tabs */}
        <Tabs value={tool} onValueChange={(value) => patchParams({ tool: value })}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-border/60 bg-card/40 p-1">
            <TabsTrigger value="respawn" className="gap-1.5 px-3 py-1.5 text-xs sm:text-sm">
              <Clock3 className="h-3.5 w-3.5" />
              Respawn
            </TabsTrigger>
            <TabsTrigger value="waves" className="gap-1.5 px-3 py-1.5 text-xs sm:text-sm">
              <WavesIcon className="h-3.5 w-3.5" />
              Waves
            </TabsTrigger>
            <TabsTrigger value="minions" disabled className="gap-1.5 px-3 py-1.5 text-xs sm:text-sm">
              <Skull className="h-3.5 w-3.5" />
              Minions
              <SoonChip />
            </TabsTrigger>
            <TabsTrigger
              value="structures"
              disabled
              className="gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
            >
              <Landmark className="h-3.5 w-3.5" />
              Structures
              <SoonChip />
            </TabsTrigger>
            <TabsTrigger value="supers" disabled className="gap-1.5 px-3 py-1.5 text-xs sm:text-sm">
              <Shield className="h-3.5 w-3.5" />
              Supers
              <SoonChip />
            </TabsTrigger>
          </TabsList>

          <TabsContent value="respawn" className="mt-4">
            <RespawnCalculator
              level={levelParam}
              timeText={timeText}
              onLevelChange={(level) => patchParams({ level: String(level) })}
              onTimeTextChange={(text) => patchParams({ time: text })}
            />
          </TabsContent>

          <TabsContent value="waves" className="mt-4">
            <WaveTimeline
              mode={waveMode}
              waveText={waveText}
              timeText={atText}
              onModeChange={(mode) =>
                mode === "time"
                  ? patchParams({ at: atText, wave: null })
                  : patchParams({ wave: waveText, at: null })
              }
              onWaveTextChange={(text) => patchParams({ wave: text, at: null })}
              onTimeTextChange={(text) => patchParams({ at: text, wave: null })}
            />
          </TabsContent>
        </Tabs>

        <DataSourcesNotice freshness="Values are computed by Mogzy's canonical mechanics engine and verified through the patch shown above; unresolved mechanics are labeled rather than guessed." />
      </div>
    </div>
  );
}
