/**
 * UX1 — the Worlds 2026 experience prototype, at /lol/dev/worlds-experience.
 *
 * DEVELOPMENT ONLY. App.tsx registers this route behind `import.meta.env.DEV`
 * (the literal `false` in a production build, so the import and every
 * fixture behind it are dead code there and the path 404s). The published
 * tournament page, `/lol/pro-play/tournament/worlds-2026`, is untouched.
 *
 * DATA. `?scenario=` picks the source: `live` (default) reads production
 * through the published page's own hook; `snapshot` is the real captured
 * body; anything else is a SIMULATED phase and carries a marker in the bar.
 * `?now=<ISO>` pins the clock (screenshots); simulated phases otherwise run on
 * a clock that suits them. Both keys survive every in-experience navigation.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FlaskConical } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import { DESKTOP_QUERY, useMediaQuery } from "@/components/pro-play/worlds-experience/ExperienceContext";
import WorldsExperience from "@/components/pro-play/worlds-experience/WorldsExperience";
import { Skeleton } from "@/components/ui/skeleton";
import { isTournamentV2, useTournament, type TournamentResponseV2 } from "@/lib/pro-play/tournamentApi";
import { mediaKeysV2 } from "@/lib/pro-play/tournamentV2View";
import { cn } from "@/lib/utils";

import { SCENARIOS, scenarioById, scenarioClock } from "./scenarios";

export const WORLDS_EXPERIENCE_DEV_ROUTE = "/lol/dev/worlds-experience";

function useClock(pinned: number | null, tickMs = 15_000) {
  const [now, setNow] = useState(() => pinned ?? Date.now());
  useEffect(() => {
    if (pinned !== null) {
      setNow(pinned);
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [pinned, tickMs]);
  return now;
}

function SimulatedBadge({ label }: { label: string }) {
  return (
    <span
      data-testid="simulated-badge"
      title={`Simulated results (${label}) for design review. Not real Worlds 2026 data.`}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-amber-400/60 bg-[repeating-linear-gradient(135deg,rgba(251,191,36,0.16)_0_6px,rgba(251,191,36,0.06)_6px_12px)] px-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-amber-200"
    >
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      Simulated
    </span>
  );
}

function ScenarioPicker({ current, inline = false }: { current: string; inline?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <label
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-full border border-white/10 py-1 pl-3 pr-1 text-[11px] text-muted-foreground",
        inline ? "bg-white/[0.03]" : "fixed bottom-4 right-4 z-40 bg-[hsl(214_50%_7%/0.92)] shadow-lg backdrop-blur",
      )}
      data-testid="scenario-picker"
    >
      <FlaskConical className="h-3.5 w-3.5 text-[#c9a84c]" aria-hidden="true" />
      <span className={cn(inline ? "hidden 2xl:inline" : "hidden sm:inline")}>Prototype data</span>
      <select
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams(location.search);
          params.set("scenario", e.target.value);
          params.delete("match");
          params.delete("round");
          params.delete("now");
          navigate(`${location.pathname}?${params}`, { replace: true });
        }}
        className="h-7 w-full min-w-[96px] max-w-[170px] rounded-full border border-white/10 bg-[hsl(214_45%_11%)] px-2.5 text-[11px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
      >
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.kind === "simulated" ? "◇ " : ""}{s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Loaded({ data, now, simulated, label, scenario, onRetry, retrying, refreshFailed }: {
  data: TournamentResponseV2;
  now: number;
  simulated: boolean;
  label: string;
  scenario: string;
  onRetry?: () => void;
  retrying?: boolean;
  refreshFailed?: boolean;
}) {
  const keys = useMemo(() => mediaKeysV2(data), [data]);
  const leagues = useMemo(() => [data.context.league.slug], [data]);
  return (
    <ProPlayMediaProvider teams={keys.teams} players={keys.players} leagues={leagues}>
      <WorldsExperience
        data={data}
        now={now}
        base={WORLDS_EXPERIENCE_DEV_ROUTE}
        onRetry={onRetry}
        retrying={retrying}
        refreshFailed={refreshFailed}
        badge={simulated ? <SimulatedBadge label={label} /> : undefined}
        tools={<ScenarioPicker current={scenario} inline />}
      />
    </ProPlayMediaProvider>
  );
}

function LiveSource({ pinned }: { pinned: number | null }) {
  const query = useTournament("worlds-2026");
  const now = useClock(pinned);
  const data = query.data && isTournamentV2(query.data) ? query.data : null;
  if (query.isLoading) {
    return (
      <div className="space-y-4 p-6" data-testid="experience-loading">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-12 gap-4">
          <Skeleton className="col-span-8 h-72" />
          <Skeleton className="col-span-4 h-72" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-8" role="alert" data-testid="experience-error">
        <p className="text-base font-semibold">
          {query.data ? "The live endpoint answered with a contract this prototype doesn't read." : "The live tournament feed could not be loaded."}
        </p>
        <p className="text-sm text-muted-foreground">
          Try again, or review the prototype on the{" "}
          <Link to={`${WORLDS_EXPERIENCE_DEV_ROUTE}?scenario=snapshot`} className="text-[#e3c66f] underline">
            real 13 Oct snapshot
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <Loaded
      data={data}
      now={now}
      simulated={false}
      label="live"
      scenario="live"
      onRetry={() => void query.refetch()}
      retrying={query.isFetching}
      refreshFailed={query.isRefetchError}
    />
  );
}

function FixtureSource({ id, pinned }: { id: string; pinned: number | null }) {
  const scenario = scenarioById(id);
  const data = useMemo(() => scenario.build!(), [scenario]);
  const own = scenario.kind === "simulated" ? scenarioClock(data) : null;
  const now = useClock(pinned ?? own);
  return <Loaded data={data} now={now} simulated={scenario.kind === "simulated"} label={scenario.label} scenario={scenario.id} />;
}

export default function WorldsExperienceDev() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const scenario = scenarioById(params.get("scenario"));
  const nowParam = Date.parse(params.get("now") ?? "");
  const pinned = Number.isFinite(nowParam) ? nowParam : null;
  const desktop = useMediaQuery(DESKTOP_QUERY);
  return (
    <div className="relative" data-testid="worlds-experience-dev" data-scenario={scenario.id}>
      <SEOHead title="Worlds experience prototype | Mogzy" description="Development prototype." path={WORLDS_EXPERIENCE_DEV_ROUTE} noindex />
      {scenario.kind === "live" ? <LiveSource pinned={pinned} /> : <FixtureSource key={scenario.id} id={scenario.id} pinned={pinned} />}
      {!desktop && <ScenarioPicker current={scenario.id} />}
    </div>
  );
}
