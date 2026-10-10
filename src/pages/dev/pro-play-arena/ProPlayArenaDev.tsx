/**
 * PPQ2-INT — the playable Pro Play Arena, on an isolated DEV route.
 *
 *   /lol/dev/pro-play-arena?source=live|fixture
 *     fixture only: &set=default|two|four|<sample,keys> &latency=<ms> &fault=start|answer
 *
 * `live` (the default) plays real sessions against the configured backend
 * (`VITE_COMBAT_API_URL`) through the production controller. `fixture` plays
 * the frozen production payloads through an in-memory stand-in for the same
 * API (see `fixtureTransport.ts`), so every run is identical. Both mount the
 * same `ProPlayArenaRun`, and a badge says which one is on screen.
 *
 * Registered only when `import.meta.env.DEV` (see App.tsx): a production build
 * dead-code-eliminates this page and the path 404s. The production route
 * `/lol/pro-play/quiz` is NOT switched by this pass.
 */
import { useMemo } from "react";

import ProPlayArenaRun from "@/components/pro-play/arena-run/ProPlayArenaRun";
import { proPlayApi } from "@/lib/pro-play/api";
import { useProPlayArenaController } from "@/lib/pro-play/arena";
import { createFixtureTransport, resolveFixtureKeys, type FixtureFault } from "./fixtureTransport";

export type ArenaDevSource = "live" | "fixture";

export interface ArenaDevParams {
  source: ArenaDevSource;
  keys: string[];
  latencyMs: number;
  fault: FixtureFault;
}

export function readArenaDevParams(search: string): ArenaDevParams {
  const q = new URLSearchParams(search);
  const latency = Number(q.get("latency"));
  const fault = q.get("fault");
  return {
    source: q.get("source") === "fixture" ? "fixture" : "live",
    keys: resolveFixtureKeys(q.get("set")),
    latencyMs: Number.isFinite(latency) && q.get("latency") !== null ? latency : 350,
    fault: fault === "start" || fault === "answer" ? fault : "none",
  };
}

function apiHost(): string {
  try {
    return new URL(proPlayApi.baseUrl).host;
  } catch {
    return proPlayApi.baseUrl;
  }
}

/**
 * Fixed, out of flow: it labels the run without moving the arena. It sits in
 * the arena header strip's empty zone (Pro Play has no clock): the right end
 * below `lg`, the centre track from `lg`.
 */
function SourceBadge({ params }: { params: ArenaDevParams }) {
  const fixture = params.source === "fixture";
  const other = new URLSearchParams(window.location.search);
  other.set("source", fixture ? "live" : "fixture");
  return (
    <div data-testid="pro-play-arena-source" data-source={params.source}
      className="pointer-events-none fixed right-3 top-[calc(var(--app-header-h)+1.1rem)] z-50
        lg:left-1/2 lg:right-auto lg:top-[1.15rem] lg:-translate-x-1/2">
      <div className={`pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] shadow-lg lg:text-[10px] ${
        fixture
          ? "border-amber-400/60 bg-amber-950/90 text-amber-200"
          : "border-emerald-400/60 bg-emerald-950/90 text-emerald-200"}`}>
        <span>{fixture ? "Fixture" : "Live API"}</span>
        <span className="hidden lg:inline">{fixture
          ? `· frozen payloads, simulated server${params.fault !== "none" ? ` · fault=${params.fault}` : ""}`
          : `· ${apiHost()}`}</span>
        <a className="underline decoration-dotted underline-offset-2 opacity-80 hover:opacity-100"
          href={`?${other.toString()}`}>
          {fixture ? "use live" : "use fixtures"}
        </a>
      </div>
    </div>
  );
}

function ArenaDevRun({ params }: { params: ArenaDevParams }) {
  // One transport per mount: the controller reads it through a ref.
  const transport = useMemo(
    () => (params.source === "fixture"
      ? createFixtureTransport({ keys: params.keys, latencyMs: params.latencyMs, fault: params.fault })
      : undefined),
    [params],
  );
  const controller = useProPlayArenaController({ transport });
  return <ProPlayArenaRun controller={controller} />;
}

export default function ProPlayArenaDev() {
  const params = useMemo(() => readArenaDevParams(window.location.search), []);
  return (
    <div data-testid="pro-play-arena-dev" data-source={params.source}>
      <ArenaDevRun params={params} />
      <SourceBadge params={params} />
    </div>
  );
}
