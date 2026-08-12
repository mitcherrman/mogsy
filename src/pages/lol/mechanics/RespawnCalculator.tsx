// Respawn Calculator — consumer surface over GET /api/mechanics/explorer/respawn.
// All death-timer math (BRW table, TIF brackets, cap, boundary ambiguity)
// happens in the backend engine; this component maps inputs, renders the
// returned breakdown, and never decides between boundary interpretations.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  fetchRespawn,
  parseGameTimeInput,
  type RespawnResult,
} from "@/lib/mechanics-explorer/api";
import { ErrorBanner, GameTimeField, Panel, ProvenanceList, ResultSkeleton, StatRow } from "./ui";

interface RespawnCalculatorProps {
  level: number;
  timeText: string;
  onLevelChange: (level: number) => void;
  onTimeTextChange: (text: string) => void;
}

const LEVEL_MIN = 1;
const LEVEL_MAX = 18;

export default function RespawnCalculator({
  level,
  timeText,
  onLevelChange,
  onTimeTextChange,
}: RespawnCalculatorProps) {
  const levelValid = Number.isInteger(level) && level >= LEVEL_MIN && level <= LEVEL_MAX;
  const parsedTime = useMemo(() => parseGameTimeInput(timeText), [timeText]);
  const inputsValid = levelValid && parsedTime.ok;

  const query = useQuery<RespawnResult, Error>({
    queryKey: ["mechanics-explorer", "respawn", level, parsedTime.ok ? parsedTime.seconds : null],
    queryFn: () => fetchRespawn({ level, gameTimeS: parsedTime.ok ? parsedTime.seconds : 0 }),
    enabled: inputsValid,
    staleTime: Infinity, // deterministic engine: same inputs, same answer
  });

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <Panel title="Death scenario">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="respawn-level"
              className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground"
            >
              Champion level
            </label>
            <div className="mt-2 flex items-center gap-3">
              <Slider
                value={[levelValid ? level : LEVEL_MIN]}
                min={LEVEL_MIN}
                max={LEVEL_MAX}
                step={1}
                onValueChange={([v]) => onLevelChange(v)}
                className="flex-1"
                aria-label="Champion level"
              />
              <Input
                id="respawn-level"
                type="number"
                inputMode="numeric"
                min={LEVEL_MIN}
                max={LEVEL_MAX}
                value={Number.isNaN(level) ? "" : level}
                onChange={(e) => onLevelChange(Number(e.target.value))}
                className="w-16 text-center tabular-nums"
              />
            </div>
            {!levelValid && (
              <p className="mt-1.5 text-xs text-destructive" role="alert">
                Level must be a whole number from {LEVEL_MIN} to {LEVEL_MAX}.
              </p>
            )}
          </div>
          <GameTimeField
            id="respawn-time"
            label="Game time of death"
            value={timeText}
            placeholder="21:15"
            parsed={parsedTime}
            onChange={onTimeTextChange}
            inputClassName="w-full"
          />
        </div>
      </Panel>

      {/* Result — never rendered for invalid inputs, never stale for new ones */}
      {inputsValid && query.isPending && <ResultSkeleton />}
      {inputsValid && query.isError && (
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
      )}
      {inputsValid && query.data && <RespawnResultView result={query.data} />}
    </div>
  );
}

function RespawnResultView({ result }: { result: RespawnResult }) {
  const timeShown = result.input.game_time_display ?? `${result.input.game_time_s}s`;
  return (
    <div className="space-y-4" data-testid="respawn-result">
      {/* Headline: what the player actually sees in game */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-[#1e3a5f]/60 to-[#0a1428]/90 p-5">
        <div className="text-[10px] uppercase tracking-widest font-bold text-[#c9a84c]">
          Displayed death timer
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-bold tabular-nums text-foreground">
            {result.displayed_timer_s}s
          </span>
          <span className="text-sm text-muted-foreground">
            level {result.input.level}, dying at {timeShown}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Exact duration: <span className="tabular-nums">{result.duration_s}s</span> — the in-game
          timer always rounds up.
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatRow label="Base respawn (BRW)" value={`${result.base_respawn_wait_s}s`} />
        <StatRow
          label="Time increase factor"
          value={`+${result.time_increase_factor_percent}%`}
          hint={result.tif_active ? undefined : "Inactive before 15:00"}
        />
        <StatRow label="TIF adds" value={`+${result.time_increase_s}s`} />
      </div>

      {result.at_tif_cap && (
        <p className="text-xs font-semibold text-amber-400" data-testid="tif-cap-note">
          The Time Increase Factor is at its 50% cap — death timers no longer grow with game time.
        </p>
      )}

      {/* Backend-generated explanation */}
      <Panel title="How this was calculated">
        <p className="text-sm text-muted-foreground">{result.explanation}</p>
      </Panel>

      {/* Boundary ambiguity: shown verbatim, never collapsed or decided here */}
      {result.boundary.on_step_boundary && (
        <div
          className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-4"
          data-testid="respawn-boundary"
        >
          <div className="flex items-center gap-2 text-sky-300">
            <Info className="h-4 w-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Exact 30-second boundary
            </span>
          </div>
          <p className="mt-2 text-sm text-sky-200/90">
            This timestamp sits exactly on a published 30-second step boundary, where the source can
            be read two ways. The value above uses the canonical reading (
            <code className="text-xs">{result.step_rule}</code>); the alternate reading gives{" "}
            <span className="font-semibold tabular-nums">{result.boundary.alternate_duration_s}s</span>
            . One second earlier or later, both readings agree.
          </p>
        </div>
      )}

      <ProvenanceList provenance={result.provenance} />
    </div>
  );
}
