// Inhibitor / Super-Minion Explorer — consumer surface over
// POST /api/mechanics/explorer/supers/state.
//
// The canonical rule this board must teach correctly: super minions stop
// spawning TWO WAVES BEFORE the lane's inhibitor respawns — a look-ahead on
// the scheduled respawn, not a queue that drains afterwards. The affected
// wave count depends on the live cadence, so nothing here hardcodes "8
// waves" or any wave count: every count, cutoff verdict and explanation is
// rendered from the backend response. Presets populate inputs only; the
// backend computes every result.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  type LaneToken,
  type MechanicProvenance,
  type SupersLaneState,
  type SupersStateRequest,
  type SupersStateResult,
  formatClock,
  parseGameTimeInput,
  postSupersState,
} from "@/lib/mechanics-explorer/api";
import type { WaveLookupMode } from "./WaveTimeline";
import {
  ChoiceChips,
  CompositionChips,
  ErrorBanner,
  GameTimeField,
  Panel,
  ProvenanceList,
  ResultSkeleton,
} from "./ui";

interface SupersExplorerProps {
  mode: WaveLookupMode;
  waveText: string;
  timeText: string;
  onModeChange: (mode: WaveLookupMode) => void;
  onWaveTextChange: (text: string) => void;
  onTimeTextChange: (text: string) => void;
}

const WAVE_MIN = 1;
const WAVE_MAX = 1000;

const LANES: LaneToken[] = ["top", "middle", "bottom"];
const LANE_LABELS: Record<LaneToken, string> = {
  top: "Top",
  middle: "Mid",
  bottom: "Bot",
};

interface LaneInput {
  destroyed: boolean;
  destroyedText: string;
}

const DEFAULT_LANE_INPUT: LaneInput = { destroyed: false, destroyedText: "15:00" };

/** Educational presets. Inputs only — the backend computes every result. */
const PRESETS: Array<{
  label: string;
  wave: string;
  lanes: Partial<Record<LaneToken, string>>;
}> = [
  { label: "All standing", wave: "32", lanes: {} },
  { label: "Top down", wave: "32", lanes: { top: "15:00" } },
  { label: "Top + Mid down", wave: "32", lanes: { top: "15:00", middle: "15:00" } },
  {
    label: "All three down",
    wave: "32",
    lanes: { top: "15:00", middle: "15:00", bottom: "15:00" },
  },
  // Top destroyed at 10:00 respawns at 15:00 (wave 31); waves 29-30 spawn
  // while it is still down but inside the look-ahead cutoff.
  { label: "Inside respawn cutoff", wave: "29", lanes: { top: "10:00" } },
];

export default function SupersExplorer({
  mode,
  waveText,
  timeText,
  onModeChange,
  onWaveTextChange,
  onTimeTextChange,
}: SupersExplorerProps) {
  const [laneInputs, setLaneInputs] = useState<Record<LaneToken, LaneInput>>({
    top: DEFAULT_LANE_INPUT,
    middle: DEFAULT_LANE_INPUT,
    bottom: DEFAULT_LANE_INPUT,
  });

  const waveNumber = Number(waveText);
  const waveValid =
    waveText.trim() !== "" &&
    Number.isInteger(waveNumber) &&
    waveNumber >= WAVE_MIN &&
    waveNumber <= WAVE_MAX;
  const parsedTime = useMemo(() => parseGameTimeInput(timeText), [timeText]);
  const waveInputValid = mode === "wave" ? waveValid : parsedTime.ok;

  // Parse each destroyed lane's destruction time; any failure blocks the
  // request with an inline message (no stale results for invalid inputs).
  const laneParse = useMemo(() => {
    const inhibitors: NonNullable<SupersStateRequest["inhibitors"]> = {};
    for (const lane of LANES) {
      const input = laneInputs[lane];
      if (!input.destroyed) continue;
      const parsed = parseGameTimeInput(input.destroyedText);
      if (!parsed.ok) {
        return {
          ok: false as const,
          error: `${LANE_LABELS[lane]} inhibitor destruction time: ${parsed.error}`,
        };
      }
      inhibitors[lane] = { destroyed_at_s: parsed.seconds };
    }
    return { ok: true as const, inhibitors };
  }, [laneInputs]);

  const requestBody: SupersStateRequest | null = useMemo(() => {
    if (!waveInputValid || !laneParse.ok) return null;
    const body: SupersStateRequest = { inhibitors: laneParse.inhibitors };
    if (mode === "wave") body.wave_number = waveNumber;
    else if (parsedTime.ok) body.game_time_s = parsedTime.seconds;
    return body;
  }, [waveInputValid, laneParse, mode, waveNumber, parsedTime]);

  const query = useQuery<SupersStateResult, Error>({
    queryKey: ["mechanics-explorer", "supers", requestBody],
    queryFn: () => postSupersState(requestBody as SupersStateRequest),
    enabled: requestBody !== null,
    staleTime: Infinity, // deterministic engine: same inputs, same answer
  });

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    onModeChange("wave");
    onWaveTextChange(preset.wave);
    setLaneInputs({
      top: presetLane(preset.lanes.top),
      middle: presetLane(preset.lanes.middle),
      bottom: presetLane(preset.lanes.bottom),
    });
  };

  return (
    <div className="space-y-4">
      <Panel title="Scenario">
        {/* Presets — populate inputs only; the engine computes the outcome.
            "Inside respawn cutoff" gets the accent: it demonstrates the
            unusual look-ahead rule and should be one obvious click away. */}
        <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
          Try an example
        </div>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="supers-presets">
          {PRESETS.map((preset) => {
            const featured = preset.label === "Inside respawn cutoff";
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className={
                  featured
                    ? "rounded-md border border-[#c9a84c]/60 bg-[#c9a84c]/10 px-3 py-1.5 text-xs font-semibold text-[#f0d78c] transition-colors hover:bg-[#c9a84c]/20"
                    : "rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-[#c9a84c]/50 hover:text-foreground"
                }
              >
                {featured ? `${preset.label} — see the unusual rule` : preset.label}
              </button>
            );
          })}
        </div>

        {/* Wave selection */}
        <div className="mt-4">
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
                  htmlFor="supers-wave"
                  className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground"
                >
                  Wave number
                </label>
                <Input
                  id="supers-wave"
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
              <GameTimeField
                id="supers-time"
                value={timeText}
                placeholder="15:40"
                parsed={parsedTime}
                onChange={onTimeTextChange}
              />
            )}
          </div>
        </div>

        {/* Per-lane inhibitor timelines */}
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Inhibitor state
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {LANES.map((lane) => {
              const input = laneInputs[lane];
              const destroyedParsed = input.destroyed
                ? parseGameTimeInput(input.destroyedText)
                : null;
              return (
                <div key={lane} className="rounded-md border border-border/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {LANE_LABELS[lane]}
                    </span>
                    <ChoiceChips
                      options={[
                        { value: "standing", label: "Standing" },
                        { value: "destroyed", label: "Destroyed" },
                      ]}
                      value={input.destroyed ? "destroyed" : "standing"}
                      onChange={(state) =>
                        setLaneInputs((previous) => ({
                          ...previous,
                          [lane]: { ...previous[lane], destroyed: state === "destroyed" },
                        }))
                      }
                      ariaLabel={`${LANE_LABELS[lane]} inhibitor state`}
                    />
                  </div>
                  {input.destroyed && (
                    <div className="mt-2">
                      <label
                        htmlFor={`supers-${lane}-destroyed`}
                        className="text-[11px] text-muted-foreground"
                      >
                        Destroyed at
                      </label>
                      <Input
                        id={`supers-${lane}-destroyed`}
                        value={input.destroyedText}
                        onChange={(e) =>
                          setLaneInputs((previous) => ({
                            ...previous,
                            [lane]: { ...previous[lane], destroyedText: e.target.value },
                          }))
                        }
                        placeholder="15:00"
                        inputMode="numeric"
                        className="mt-1 w-28 tabular-nums"
                      />
                      {destroyedParsed?.ok && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Respawns 5:00 later (canonical default).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!laneParse.ok && (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {laneParse.error}
            </p>
          )}
        </div>
      </Panel>

      {requestBody !== null && query.isPending && <ResultSkeleton />}
      {requestBody !== null && query.isError && (
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
      )}
      {requestBody !== null && query.data && <SupersResultView result={query.data} />}
    </div>
  );
}

function presetLane(destroyedText: string | undefined): LaneInput {
  return destroyedText === undefined
    ? DEFAULT_LANE_INPUT
    : { destroyed: true, destroyedText };
}

// ---------------------------------------------------------------------------
// Result board
// ---------------------------------------------------------------------------

type LaneVisualState =
  | "standing"
  | "supers_active"
  | "cutoff"
  | "restored"
  | "not_yet_destroyed";

/** Classify a lane purely from returned fields (presentation only). */
function laneVisualState(lane: SupersLaneState, waveSpawnS: number): LaneVisualState {
  if (lane.inhibitor.down_at_spawn) {
    return lane.suppressed_by_cutoff ? "cutoff" : "supers_active";
  }
  if (lane.inhibitor.destroyed_at_s === null) return "standing";
  if (lane.inhibitor.respawn_at_s !== null && waveSpawnS >= lane.inhibitor.respawn_at_s) {
    return "restored";
  }
  return "not_yet_destroyed";
}

const LANE_STATE_BADGE: Record<LaneVisualState, { text: string; className: string }> = {
  standing: {
    text: "Inhibitor standing",
    className: "border-zinc-500/40 bg-zinc-500/15 text-zinc-300",
  },
  supers_active: {
    text: "Inhibitor down — supers active",
    className: "border-red-500/40 bg-red-500/15 text-red-300",
  },
  cutoff: {
    text: "Down — pre-respawn cutoff",
    className: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  },
  restored: {
    text: "Inhibitor restored",
    className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  },
  not_yet_destroyed: {
    text: "Not yet destroyed at this wave",
    className: "border-zinc-500/40 bg-zinc-500/15 text-zinc-300",
  },
};

function SupersResultView({ result }: { result: SupersStateResult }) {
  // One page-level provenance disclosure: the three lanes consume the same
  // canonical rules, so entries are merged and deduplicated by mechanic id.
  const provenance: MechanicProvenance[] = [];
  const seen = new Set<string>();
  for (const lane of LANES) {
    for (const rule of result.lanes[lane].provenance) {
      if (!seen.has(rule.mechanic_id)) {
        seen.add(rule.mechanic_id);
        provenance.push(rule);
      }
    }
  }

  return (
    <div className="space-y-4" data-testid="supers-result">
      {/* Wave identity */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-[#1e3a5f]/60 to-[#0a1428]/90 p-5">
        <div className="text-[10px] uppercase tracking-widest font-bold text-[#c9a84c]">
          {result.derivation.queried_by === "game_time"
            ? `Most recent wave at ${result.derivation.game_time_display}`
            : "Wave"}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-bold tabular-nums text-foreground">
            {result.wave.wave_number}
          </span>
          <span className="text-sm text-muted-foreground">
            spawns at{" "}
            <span className="font-semibold tabular-nums">{result.wave.spawn_time_display}</span>
          </span>
          {result.all_inhibitors_down_at_spawn && (
            <span
              className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300"
              data-testid="all-three-banner"
            >
              All three inhibitors down at spawn
            </span>
          )}
        </div>
      </div>

      {/* Three-lane board */}
      <div className="grid gap-4 md:grid-cols-3" data-testid="supers-board">
        {LANES.map((laneToken) => {
          const lane = result.lanes[laneToken];
          const state = laneVisualState(lane, result.wave.spawn_time_s);
          const badge = LANE_STATE_BADGE[state];
          const count = lane.super_minion_count;
          return (
            <div
              key={laneToken}
              data-testid={`supers-lane-${laneToken}`}
              className={cn(
                "rounded-xl border bg-card/60 p-4",
                state === "cutoff" ? "border-amber-500/50" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground">
                  {LANE_LABELS[laneToken]}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    badge.className,
                  )}
                >
                  {badge.text}
                </span>
              </div>

              <div className="mt-3 text-2xl font-bold text-foreground">
                {count === 0 ? "No supers" : count === 1 ? "1 Super" : `${count} Supers`}
              </div>

              {lane.inhibitor.respawn_display && lane.waves_until_respawn !== null && (
                <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                  Inhibitor respawns at {lane.inhibitor.respawn_display} ·{" "}
                  {lane.waves_until_respawn} wave
                  {lane.waves_until_respawn === 1 ? "" : "s"} until respawn
                </p>
              )}

              <div className="mt-3">
                <CompositionChips
                  composition={lane.composition}
                  testId={`supers-composition-${laneToken}`}
                />
                {lane.siege_replaced_by_super && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    The scheduled cannon slot is replaced by the super minion.
                  </p>
                )}
              </div>

              <p className="mt-3 text-xs text-muted-foreground">{lane.explanation}</p>
            </div>
          );
        })}
      </div>

      {/* The canonical cutoff rule, stated once for the whole board */}
      <p className="text-[11px] text-muted-foreground">
        Super minions stop <span className="font-semibold text-foreground">two waves before</span>{" "}
        the lane's inhibitor respawns — a look-ahead on the scheduled respawn, so a lane can lose
        its supers while the inhibitor is still down. How many waves that covers depends on the
        live spawn cadence.
      </p>

      {/* Backend-generated summary */}
      <Panel title="Summary">
        <p className="text-sm text-muted-foreground">{result.explanation}</p>
      </Panel>

      <ProvenanceList provenance={provenance} />
    </div>
  );
}
