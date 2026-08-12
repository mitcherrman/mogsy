// Wave Timeline — consumer surface over GET /api/mechanics/explorer/wave.
// Point lookup by wave number or by game time. The wave schedule, cadence
// transitions and composition all come from the backend engine; cadence
// badges below render returned flags, nothing is computed here.
//
// Canonical edge honored by the backend and surfaced verbatim: no wave spawns
// at exactly 30:00 — a 30:00 game-time query returns wave 66 (29:50) as the
// most recent spawn with wave 67 (30:10) next.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchWaveByNumber,
  fetchWaveByTime,
  formatClock,
  parseGameTimeInput,
  type WaveDetail,
  type WaveLookupResult,
  type WaveRef,
} from "@/lib/mechanics-explorer/api";
import { ErrorBanner, Panel, ProvenanceList, ResultSkeleton, StatRow } from "./ui";

export type WaveLookupMode = "wave" | "time";

interface WaveTimelineProps {
  mode: WaveLookupMode;
  waveText: string;
  timeText: string;
  onModeChange: (mode: WaveLookupMode) => void;
  onWaveTextChange: (text: string) => void;
  onTimeTextChange: (text: string) => void;
}

const WAVE_MIN = 1;
const WAVE_MAX = 1000;

const COMPOSITION_LABELS: Record<string, string> = {
  melee: "Melee",
  caster: "Caster",
  cannon: "Cannon",
  super: "Super",
};

export default function WaveTimeline({
  mode,
  waveText,
  timeText,
  onModeChange,
  onWaveTextChange,
  onTimeTextChange,
}: WaveTimelineProps) {
  const waveNumber = Number(waveText);
  const waveValid =
    waveText.trim() !== "" &&
    Number.isInteger(waveNumber) &&
    waveNumber >= WAVE_MIN &&
    waveNumber <= WAVE_MAX;
  const parsedTime = useMemo(() => parseGameTimeInput(timeText), [timeText]);
  const inputsValid = mode === "wave" ? waveValid : parsedTime.ok;

  const query = useQuery<WaveLookupResult, Error>({
    queryKey: [
      "mechanics-explorer",
      "wave",
      mode,
      mode === "wave" ? waveNumber : parsedTime.ok ? parsedTime.seconds : null,
    ],
    queryFn: () =>
      mode === "wave"
        ? fetchWaveByNumber(waveNumber)
        : fetchWaveByTime(parsedTime.ok ? parsedTime.seconds : 0),
    enabled: inputsValid,
    staleTime: Infinity, // deterministic engine: same inputs, same answer
  });

  const jumpToWave = (n: number) => {
    onModeChange("wave");
    onWaveTextChange(String(n));
  };

  return (
    <div className="space-y-4">
      <Panel title="Look up a wave">
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as WaveLookupMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="wave" className="px-3 py-1 text-xs">
              By wave number
            </TabsTrigger>
            <TabsTrigger value="time" className="px-3 py-1 text-xs">
              By game time
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-3 max-w-xs">
          {mode === "wave" ? (
            <>
              <label
                htmlFor="wave-number"
                className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground"
              >
                Wave number
              </label>
              <Input
                id="wave-number"
                type="number"
                inputMode="numeric"
                min={WAVE_MIN}
                max={WAVE_MAX}
                value={waveText}
                onChange={(e) => onWaveTextChange(e.target.value)}
                className="mt-2 w-32 tabular-nums"
              />
              {!waveValid && (
                <p className="mt-1.5 text-xs text-destructive" role="alert">
                  Wave number must be a whole number from {WAVE_MIN} to {WAVE_MAX}.
                </p>
              )}
            </>
          ) : (
            <>
              <label
                htmlFor="wave-time"
                className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground"
              >
                Game time
              </label>
              <Input
                id="wave-time"
                value={timeText}
                onChange={(e) => onTimeTextChange(e.target.value)}
                placeholder="30:00"
                inputMode="numeric"
                className="mt-2 w-32 tabular-nums"
              />
              {parsedTime.ok ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Reading as {formatClock(parsedTime.seconds)} game time.
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-destructive" role="alert">
                  {parsedTime.error}
                </p>
              )}
            </>
          )}
        </div>
      </Panel>

      {inputsValid && query.isPending && <ResultSkeleton />}
      {inputsValid && query.isError && (
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
      )}
      {inputsValid && query.data && (
        <WaveLookupView result={query.data} onJumpToWave={jumpToWave} />
      )}
    </div>
  );
}

function WaveLookupView({
  result,
  onJumpToWave,
}: {
  result: WaveLookupResult;
  onJumpToWave: (n: number) => void;
}) {
  const byTime = result.query.by === "game_time";
  return (
    <div className="space-y-4" data-testid="wave-result">
      {byTime && (
        <p className="text-xs text-muted-foreground">
          At <span className="font-semibold tabular-nums">{
            result.query.by === "game_time" ? result.query.game_time_display : ""
          }</span>
          , the most recent wave to have spawned is shown below
          {result.wave === null && " — no wave has spawned yet"}.
        </p>
      )}

      {result.wave ? (
        <WaveDetailView
          detail={result.wave}
          headline={byTime ? "Most recent wave" : "Wave"}
          onJumpToWave={onJumpToWave}
        />
      ) : (
        <Panel>
          <p className="text-sm text-muted-foreground" data-testid="wave-none-yet">
            {result.explanation}
          </p>
        </Panel>
      )}

      {byTime && result.next_wave_to_spawn && (
        <NextWaveCard next={result.next_wave_to_spawn} onJumpToWave={onJumpToWave} />
      )}

      {result.wave && (
        <Panel title="Summary">
          <p className="text-sm text-muted-foreground">{result.explanation}</p>
        </Panel>
      )}

      <ProvenanceList provenance={result.provenance} />
    </div>
  );
}

function NextWaveCard({
  next,
  onJumpToWave,
}: {
  next: WaveRef;
  onJumpToWave: (n: number) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-4"
      data-testid="next-wave-to-spawn"
    >
      <div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
          Next wave to spawn
        </div>
        <div className="mt-0.5 text-sm font-semibold text-foreground">
          Wave {next.wave_number} at <span className="tabular-nums">{next.spawn_time_display}</span>
          {typeof next.seconds_until_spawn === "number" && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              in {next.seconds_until_spawn}s
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onJumpToWave(next.wave_number)}
        className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:border-[#c9a84c]/50 hover:text-foreground"
      >
        Inspect
      </button>
    </div>
  );
}

function WaveDetailView({
  detail,
  headline,
  onJumpToWave,
}: {
  detail: WaveDetail;
  headline: string;
  onJumpToWave: (n: number) => void;
}) {
  const cadence = detail.cadence;
  return (
    <div className="space-y-4">
      {/* Headline */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-[#1e3a5f]/60 to-[#0a1428]/90 p-5">
        <div className="text-[10px] uppercase tracking-widest font-bold text-[#c9a84c]">
          {headline}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-bold tabular-nums text-foreground">
            {detail.wave_number}
          </span>
          <span className="text-sm text-muted-foreground">
            spawns at <span className="font-semibold tabular-nums">{detail.spawn_time_display}</span>
          </span>
          {detail.is_cannon_wave && (
            <span className="rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10 px-2 py-0.5 text-[11px] font-semibold text-[#f0d78c]">
              Cannon wave
            </span>
          )}
        </div>
        {/* Composition chips */}
        <div className="mt-3 flex flex-wrap gap-2" data-testid="wave-composition">
          {Object.entries(detail.composition)
            .filter(([, count]) => count > 0)
            .map(([type, count]) => (
              <span
                key={type}
                className="rounded-md border border-border/60 bg-black/30 px-2 py-1 text-xs text-foreground"
              >
                <span className="font-bold tabular-nums">{count}</span>{" "}
                <span className="text-muted-foreground">
                  {COMPOSITION_LABELS[type] ?? type}
                </span>
              </span>
            ))}
        </div>
      </div>

      {/* Cadence */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatRow
          label="Interval before"
          value={cadence.interval_before_s != null ? `${cadence.interval_before_s}s` : "—"}
          hint={cadence.is_first_wave_of_game ? "First wave of the game" : undefined}
        />
        <StatRow
          label="Interval after"
          value={cadence.interval_after_s != null ? `${cadence.interval_after_s}s` : "—"}
        />
        <StatRow
          label="Next cannon"
          value={
            detail.next_cannon_wave
              ? `Wave ${detail.next_cannon_wave.wave_number} (${detail.next_cannon_wave.spawn_time_display})`
              : "—"
          }
        />
      </div>
      {(cadence.is_first_wave_of_cadence || cadence.is_last_wave_of_cadence) && (
        <p className="text-xs font-semibold text-sky-300" data-testid="cadence-transition">
          {cadence.is_first_wave_of_cadence &&
            `First wave on the ${cadence.interval_before_s}-second spawn cadence.`}{" "}
          {cadence.is_last_wave_of_cadence &&
            `Last wave on the ${cadence.interval_before_s}-second spawn cadence — the interval changes after this wave.`}
        </p>
      )}

      {/* Previous / next navigation */}
      <div className="flex flex-wrap items-center gap-2" data-testid="wave-neighbors">
        {detail.previous_wave && (
          <button
            type="button"
            onClick={() => onJumpToWave(detail.previous_wave!.wave_number)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:border-[#c9a84c]/50 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Wave {detail.previous_wave.wave_number}
            <span className="font-normal tabular-nums">
              ({detail.previous_wave.spawn_time_display})
            </span>
          </button>
        )}
        {detail.next_wave && (
          <button
            type="button"
            onClick={() => onJumpToWave(detail.next_wave!.wave_number)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:border-[#c9a84c]/50 hover:text-foreground"
          >
            Wave {detail.next_wave.wave_number}
            <span className="font-normal tabular-nums">({detail.next_wave.spawn_time_display})</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
