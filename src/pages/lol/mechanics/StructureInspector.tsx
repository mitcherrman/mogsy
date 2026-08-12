// Structure / Turret Inspector — consumer surface over
// POST /api/mechanics/explorer/structures/inspect.
//
// The backend decides everything: stats, plate thresholds and gold buckets,
// Warming Up, penetration, Bulwark, Crystalline Overgrowth, backdoor state
// and targetability. This component only assembles the request from what-if
// controls and renders returned sections. Sections the backend marks
// inapplicable are hidden and summarized in one compact note — a Nexus never
// pretends to have plates. The backdoor control is deliberately a plain
// "enemy minion nearby" toggle: the qualifying radius is unpublished and no
// distance control is invented here.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  STRUCTURE_TOKENS,
  type LaneToken,
  type StructureInspectRequest,
  type StructureInspectResult,
  type StructureToken,
  formatClock,
  formatDisplayNumber,
  parseGameTimeInput,
  postStructureInspect,
} from "@/lib/mechanics-explorer/api";
import {
  ChoiceChips,
  ErrorBanner,
  GameTimeField,
  MechanicStatusBadge,
  NotApplicableNotes,
  Panel,
  ProvenanceList,
  ResultSkeleton,
  StatRow,
} from "./ui";

interface StructureInspectorProps {
  structureType: StructureToken;
  timeText: string;
  onStructureTypeChange: (type: StructureToken) => void;
  onTimeTextChange: (text: string) => void;
}

/** Reader-facing labels over canonical API tokens (labels only). */
const STRUCTURE_OPTIONS: Array<{ value: StructureToken; label: string }> = [
  { value: "turret_outer", label: "Outer turret" },
  { value: "turret_inner", label: "Inner turret" },
  { value: "turret_inhibitor", label: "Inhibitor turret" },
  { value: "turret_nexus", label: "Nexus turret" },
  { value: "inhibitor", label: "Inhibitor" },
  { value: "nexus", label: "Nexus" },
];

const LANES: LaneToken[] = ["top", "middle", "bottom"];

/** Structures whose targetability is lane-bound (the API requires a lane). */
const LANE_BOUND: ReadonlySet<StructureToken> = new Set([
  "turret_outer",
  "turret_inner",
  "turret_inhibitor",
  "inhibitor",
]);

interface LaneStateInput {
  outer_turret_destroyed: boolean;
  inner_turret_destroyed: boolean;
  inhibitor_turret_destroyed: boolean;
  inhibitor_destroyed: boolean;
}

const INTACT_LANE: LaneStateInput = {
  outer_turret_destroyed: false,
  inner_turret_destroyed: false,
  inhibitor_turret_destroyed: false,
  inhibitor_destroyed: false,
};

/** Display rounding for long exact decimals; the exact string is preserved
 * in the accompanying hint. Presentation only — no mechanics arithmetic. */
function approx(value: string, decimals: number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  const rounded = parsed.toFixed(decimals);
  return Number(rounded) === parsed ? rounded : `≈${rounded}`;
}

export default function StructureInspector({
  structureType,
  timeText,
  onStructureTypeChange,
  onTimeTextChange,
}: StructureInspectorProps) {
  const parsedTime = useMemo(() => parseGameTimeInput(timeText), [timeText]);

  // What-if controls (local state; deliberately not in the URL).
  const [bulwarkOn, setBulwarkOn] = useState(false);
  const [bulwarkStacks, setBulwarkStacks] = useState(1);
  const [bulwarkNearby, setBulwarkNearby] = useState(1);
  const [overgrowthOn, setOvergrowthOn] = useState(false);
  const [ogLevel, setOgLevel] = useState(10);
  const [ogSeconds, setOgSeconds] = useState(300);
  const [backdoorOn, setBackdoorOn] = useState(false);
  const [minionNearby, setMinionNearby] = useState(false);
  const [sinceChange, setSinceChange] = useState(5);
  const [targetabilityOn, setTargetabilityOn] = useState(false);
  const [lane, setLane] = useState<LaneToken>("middle");
  const [laneStates, setLaneStates] = useState<Record<LaneToken, LaneStateInput>>({
    top: INTACT_LANE,
    middle: INTACT_LANE,
    bottom: INTACT_LANE,
  });
  const [nexusTurretsDestroyed, setNexusTurretsDestroyed] = useState(0);

  const laneBound = LANE_BOUND.has(structureType);
  const isTurret = structureType.startsWith("turret_");

  const validationError = useMemo(() => {
    if (bulwarkOn && (!Number.isInteger(bulwarkStacks) || bulwarkStacks < 0 || bulwarkStacks > 4))
      return "Bulwark stacks must be a whole number from 0 to 4 (the fifth plate destroys the turret).";
    if (bulwarkOn && (!Number.isInteger(bulwarkNearby) || bulwarkNearby < 0 || bulwarkNearby > 5))
      return "Nearby enemy champions must be a whole number from 0 to 5.";
    if (overgrowthOn && (!Number.isFinite(ogLevel) || ogLevel < 1 || ogLevel > 18))
      return "Team average level must be between 1 and 18.";
    if (overgrowthOn && (!Number.isFinite(ogSeconds) || ogSeconds < 0))
      return "Seconds since the overgrowth appeared must be 0 or more.";
    if (backdoorOn && !minionNearby && (!Number.isFinite(sinceChange) || sinceChange < 0))
      return "Seconds since the last enemy minion left must be 0 or more.";
    return null;
  }, [bulwarkOn, bulwarkStacks, bulwarkNearby, overgrowthOn, ogLevel, ogSeconds, backdoorOn, minionNearby, sinceChange]);

  const requestBody: StructureInspectRequest | null = useMemo(() => {
    if (!parsedTime.ok || validationError) return null;
    const body: StructureInspectRequest = {
      structure: structureType,
      game_time_s: parsedTime.seconds,
    };
    if (bulwarkOn) {
      body.bulwark = { stacks: bulwarkStacks, nearby_enemy_champions: bulwarkNearby };
    }
    if (overgrowthOn) {
      body.overgrowth = { team_average_level: ogLevel, seconds_since_available: ogSeconds };
    }
    if (backdoorOn) {
      body.backdoor = minionNearby
        ? { enemy_minion_nearby: true }
        : { enemy_minion_nearby: false, seconds_since_minion_state_change: sinceChange };
    }
    if (targetabilityOn) {
      body.base_state = {
        lanes: laneStates,
        nexus_turrets_destroyed: nexusTurretsDestroyed,
      };
      if (laneBound) body.lane = lane;
    }
    return body;
  }, [parsedTime, validationError, structureType, bulwarkOn, bulwarkStacks, bulwarkNearby, overgrowthOn, ogLevel, ogSeconds, backdoorOn, minionNearby, sinceChange, targetabilityOn, laneStates, nexusTurretsDestroyed, laneBound, lane]);

  const query = useQuery<StructureInspectResult, Error>({
    queryKey: ["mechanics-explorer", "structure", requestBody],
    queryFn: () => postStructureInspect(requestBody as StructureInspectRequest),
    enabled: requestBody !== null,
    staleTime: Infinity, // deterministic engine: same inputs, same answer
  });

  const setLaneFlag = (target: LaneToken, key: keyof LaneStateInput, value: boolean) =>
    setLaneStates((previous) => ({
      ...previous,
      [target]: { ...previous[target], [key]: value },
    }));

  return (
    <div className="space-y-4">
      <Panel title="Pick a structure">
        <ChoiceChips
          options={STRUCTURE_OPTIONS}
          value={structureType}
          onChange={onStructureTypeChange}
          ariaLabel="Structure"
        />
        <div className="mt-3 max-w-xs">
          <GameTimeField
            id="structure-time"
            value={timeText}
            placeholder="11:40"
            parsed={parsedTime}
            onChange={onTimeTextChange}
          />
        </div>
      </Panel>

      {/* What-if scenario controls, progressively disclosed */}
      <Panel title="Scenario mechanics (optional)">
        <div className="space-y-3">
          {isTurret && (
            <WhatIfRow
              label="Bulwark"
              hint="Resistances from fallen plates"
              on={bulwarkOn}
              onToggle={setBulwarkOn}
              testId="whatif-bulwark"
            >
              <NumberField
                label="Stacks (0–4)"
                value={bulwarkStacks}
                min={0}
                max={4}
                onChange={setBulwarkStacks}
              />
              <NumberField
                label="Nearby enemy champions (0–5)"
                value={bulwarkNearby}
                min={0}
                max={5}
                onChange={setBulwarkNearby}
              />
            </WhatIfRow>
          )}
          {isTurret && (
            <WhatIfRow
              label="Crystalline Overgrowth"
              hint="Stored true damage on lane turrets"
              on={overgrowthOn}
              onToggle={setOvergrowthOn}
              testId="whatif-overgrowth"
            >
              <NumberField
                label="Attacking team's average level (1–18)"
                value={ogLevel}
                min={1}
                max={18}
                onChange={setOgLevel}
              />
              <NumberField
                label="Seconds since the overgrowth appeared"
                value={ogSeconds}
                min={0}
                onChange={setOgSeconds}
              />
            </WhatIfRow>
          )}
          <WhatIfRow
            label="Backdoor protection"
            hint="Reinforced Armor state"
            on={backdoorOn}
            onToggle={setBackdoorOn}
            testId="whatif-backdoor"
          >
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={minionNearby}
                onCheckedChange={setMinionNearby}
                aria-label="Enemy minion nearby"
              />
              Enemy minion nearby
            </label>
            {!minionNearby && (
              <NumberField
                label="Seconds since the last enemy minion left"
                value={sinceChange}
                min={0}
                onChange={setSinceChange}
              />
            )}
          </WhatIfRow>
          <WhatIfRow
            label="Targetability"
            hint="What must fall before this can be attacked"
            on={targetabilityOn}
            onToggle={setTargetabilityOn}
            testId="whatif-targetability"
          >
            {laneBound && (
              <div>
                <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                  This structure's lane
                </div>
                <div className="mt-1.5">
                  <ChoiceChips
                    options={LANES.map((l) => ({ value: l, label: l }))}
                    value={lane}
                    onChange={setLane}
                    ariaLabel="Structure lane"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                Enemy base state
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {LANES.map((l) => (
                  <div key={l} className="rounded-md border border-border/50 p-2">
                    <div className="text-xs font-bold capitalize text-foreground">{l}</div>
                    {(
                      [
                        ["outer_turret_destroyed", "Outer turret down"],
                        ["inner_turret_destroyed", "Inner turret down"],
                        ["inhibitor_turret_destroyed", "Inhib. turret down"],
                        ["inhibitor_destroyed", "Inhibitor down"],
                      ] as Array<[keyof LaneStateInput, string]>
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={laneStates[l][key]}
                          onChange={(e) => setLaneFlag(l, key, e.target.checked)}
                          className="h-3.5 w-3.5 accent-[#c9a84c]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <NumberField
                label="Enemy nexus turrets destroyed (0–2)"
                value={nexusTurretsDestroyed}
                min={0}
                max={2}
                onChange={setNexusTurretsDestroyed}
              />
            </div>
          </WhatIfRow>
        </div>
        {validationError && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {validationError}
          </p>
        )}
      </Panel>

      {requestBody !== null && query.isPending && <ResultSkeleton />}
      {requestBody !== null && query.isError && (
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
      )}
      {requestBody !== null && query.data && <StructureResultView result={query.data} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// What-if building blocks
// ---------------------------------------------------------------------------

/**
 * Inspect/expand disclosure for one scenario mechanic (5B4). Expanding
 * includes the section in the request exactly as the old switch did —
 * request behavior is unchanged; only the control now reads as "inspect
 * this mechanic" rather than "turn this mechanic on/off".
 */
function WhatIfRow({
  label,
  hint,
  on,
  onToggle,
  testId,
  children,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: (value: boolean) => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        on ? "border-[#c9a84c]/40" : "border-border/50",
      )}
      data-testid={testId}
    >
      <button
        type="button"
        onClick={() => onToggle(!on)}
        aria-expanded={on}
        aria-label={`Inspect ${label}`}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-foreground">{label}</span>
          <span className="block text-[11px] text-muted-foreground">{hint}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
          {on ? "Close" : "Inspect"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", on && "rotate-180")} />
        </span>
      </button>
      {on && <div className="mt-3 space-y-3 border-t border-border/40 pt-3">{children}</div>}
    </div>
  );
}

/** Eyebrow heading for one result group (5B4 information grouping). */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pt-1 text-[10px] uppercase tracking-[0.2em] font-bold text-[#c9a84c]/90">
      {children}
    </h3>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-28 tabular-nums"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Result rendering
// ---------------------------------------------------------------------------

function StructureResultView({ result }: { result: StructureInspectResult }) {
  const { identity, stats } = result;
  const isTurret = identity.kind === "turret";

  // Sections the backend marked inapplicable, as one compact educational note.
  const notApplicable: Array<{ name: string; reason: string }> = [];
  if (!result.plates.applicable) {
    notApplicable.push({
      name: "Turret plates",
      reason: isTurret
        ? result.plates.reason
        : `Turret plates do not apply to the ${identity.display_name}.`,
    });
  }
  if (!result.warming_up.applicable) {
    notApplicable.push({ name: "Warming Up", reason: result.warming_up.reason });
  }
  if (result.bulwark && !result.bulwark.applicable) {
    notApplicable.push({ name: "Bulwark", reason: result.bulwark.reason });
  }
  if (result.overgrowth && !result.overgrowth.applicable) {
    notApplicable.push({ name: "Crystalline Overgrowth", reason: result.overgrowth.reason });
  }

  return (
    <div className="space-y-4" data-testid="structure-result">
      <GroupHeading>Base stats</GroupHeading>
      {/* Identity + stats */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-[#1e3a5f]/60 to-[#0a1428]/90 p-5">
        <div className="text-[10px] uppercase tracking-widest font-bold text-[#c9a84c]">
          {identity.display_name}
          {result.game_time_display ? ` at ${result.game_time_display}` : ""}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-bold tabular-nums text-foreground">
            {stats.max_health}
          </span>
          <span className="text-sm text-muted-foreground">max health</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatRow label="Armor" value={formatDisplayNumber(stats.armor)} />
          <StatRow label="Magic resist" value={formatDisplayNumber(stats.magic_resist)} />
          {stats.attack_damage !== undefined && (
            <StatRow label="Attack damage" value={formatDisplayNumber(stats.attack_damage)} />
          )}
          {stats.attack_speed !== undefined && (
            <StatRow label="Attack speed" value={formatDisplayNumber(stats.attack_speed)} />
          )}
          {stats.attack_range !== undefined && (
            <StatRow label="Attack range" value={formatDisplayNumber(stats.attack_range)} />
          )}
          {stats.health_regen_per_second != null && (
            <StatRow
              label="Health regen"
              value={`${formatDisplayNumber(stats.health_regen_per_second)}/s`}
            />
          )}
          {stats.last_hitter_gold != null && (
            <StatRow label="Last-hit gold" value={stats.last_hitter_gold} />
          )}
          {stats.respawn_after_s != null && (
            <StatRow
              label="Respawns after"
              value={`${stats.respawn_after_s}s`}
              hint={formatClock(Number(stats.respawn_after_s))}
            />
          )}
          {stats.count_per_team !== undefined && (
            <StatRow label="Per team" value={String(stats.count_per_team)} />
          )}
        </div>
      </div>

      {/* Plates */}
      {result.plates.applicable && (
        <>
          <GroupHeading>Turret plates</GroupHeading>
          <Panel>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" data-testid="plate-gold">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {result.plates.current_gold_per_plate}g
            </span>
            <span className="text-sm text-muted-foreground">
              per plate at this game time{result.plates.gold_decayed && " (decayed)"}
            </span>
          </div>
          {result.plates.gold_schedule.decays &&
            result.plates.gold_schedule.decay_start_s !== undefined && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {result.plates.gold_schedule.base_gold}g base, dropping{" "}
                {result.plates.gold_schedule.per_minute_loss}g per minute from{" "}
                {formatClock(result.plates.gold_schedule.decay_start_s)} to a{" "}
                {result.plates.gold_schedule.floor_gold}g floor at{" "}
                {result.plates.gold_schedule.floor_reached_at_s !== undefined
                  ? formatClock(result.plates.gold_schedule.floor_reached_at_s)
                  : "—"}
                .
              </p>
            )}
          {!result.plates.gold_schedule.decays && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Flat {result.plates.gold_schedule.base_gold}g per plate at any game time.
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[430px] text-left text-xs" data-testid="plate-table">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-1.5 pr-2">Plate</th>
                  <th className="py-1.5 pr-2">Falls at missing HP</th>
                  <th className="py-1.5 pr-2">Turret HP</th>
                  <th className="py-1.5 pr-2">Segment</th>
                  <th className="py-1.5">Effect</th>
                </tr>
              </thead>
              <tbody>
                {result.plates.thresholds.map((plate) => (
                  <tr key={plate.index} className="border-b border-border/40 last:border-0">
                    <td className="py-1.5 pr-2 font-semibold">{plate.index}</td>
                    <td className="py-1.5 pr-2 tabular-nums">
                      {approx(String(Number(plate.missing_hp_fraction) * 100), 0)}%
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">{approx(plate.health_at_threshold, 0)}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{approx(plate.segment_health, 0)}</td>
                    <td className="py-1.5 text-muted-foreground">
                      {plate.destroys_turret
                        ? "Destroys the turret"
                        : plate.grants_bulwark_stack
                          ? "Grants a Bulwark stack"
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Thresholds are fractions of missing health, so the five segments are deliberately
            unequal.
          </p>
          </Panel>
        </>
      )}

      <GroupHeading>Combat rules</GroupHeading>
      {/* Warming Up */}
      {result.warming_up.applicable && (
        <Panel title="Warming Up (consecutive hits on a champion)">
          <div className="flex flex-wrap gap-2" data-testid="warming-up">
            {Object.entries(result.warming_up.multipliers_by_consecutive_hit).map(
              ([hit, multiplier]) => (
                <span
                  key={hit}
                  className="rounded-md border border-border/60 bg-black/30 px-2 py-1 text-xs"
                >
                  <span className="text-muted-foreground">Hit {hit}:</span>{" "}
                  <span className="font-bold tabular-nums text-foreground">
                    ×{formatDisplayNumber(multiplier)}
                  </span>
                </span>
              ),
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Resets {result.warming_up.reset_after_s}s after the last champion hit
            {result.warming_up.resets_on_target_switch
              ? "; switching champion targets also resets it."
              : "; switching between champion targets does not reset it."}
          </p>
        </Panel>
      )}

      {/* Penetration */}
      <Panel title="What reaches this structure">
        <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2" data-testid="penetration">
          <PenRow label="Flat armor penetration" applies={result.penetration.flat_armor_penetration_applies} />
          <PenRow label="% armor penetration" applies={result.penetration.percent_armor_penetration_applies} />
          <PenRow label="Armor reduction" applies={result.penetration.armor_reduction_applies} />
          <PenRow
            label="Magic penetration"
            applies={result.penetration.magic_penetration_applies}
            moot={result.penetration.magic_penetration_moot}
          />
          <PenRow label="Critical strikes" applies={result.penetration.critical_strike_applies} />
          <PenRow label="Life steal" applies={result.penetration.life_steal_applies} />
        </ul>
        {result.penetration.turret_own_armor_penetration_fraction && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            The turret's own shots ignore{" "}
            {approx(
              String(Number(result.penetration.turret_own_armor_penetration_fraction) * 100),
              0,
            )}
            % of the target's armor; melee champions deal ×
            {formatDisplayNumber(result.penetration.melee_damage_taken_multiplier ?? "")} damage
            to it.
          </p>
        )}
      </Panel>

      <GroupHeading>Scenario mechanics</GroupHeading>
      {/* Bulwark */}
      {result.bulwark?.applicable && (
        <Panel title="Bulwark">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="bulwark-result">
            <StatRow label="Stacks" value={String(result.bulwark.stacks)} />
            <StatRow
              label="Per stack"
              value={formatDisplayNumber(result.bulwark.per_stack)}
              hint={`with ${result.bulwark.nearby_enemy_champions} enemies within ${result.bulwark.radius} range`}
            />
            <StatRow label="Bonus armor" value={formatDisplayNumber(result.bulwark.bonus_armor)} />
            <StatRow
              label="Bonus magic resist"
              value={formatDisplayNumber(result.bulwark.bonus_magic_resist)}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Each of the first four plates grants a stack lasting {result.bulwark.duration_s}s
            {result.bulwark.durations_overlap && "; stack durations overlap rather than refresh"}
            . The per-stack value scales with alive enemy champions near the turret.
          </p>
        </Panel>
      )}

      {/* Crystalline Overgrowth */}
      {result.overgrowth?.applicable && (
        <Panel title="Crystalline Overgrowth">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-bold tabular-nums text-foreground" data-testid="overgrowth-damage">
              {approx(result.overgrowth.damage, 0)}
            </span>
            <span className="text-sm text-muted-foreground">stored true damage</span>
            {result.overgrowth.level_interpolation_assumed && (
              <MechanicStatusBadge status="derived" />
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatRow
              label="Fraction of turret HP"
              value={`${approx(
                String(Number(result.overgrowth.damage_fraction_of_turret_max_health) * 100),
                1,
              )}%`}
            />
            <StatRow
              label="Ramp progress"
              value={`${approx(String(Number(result.overgrowth.ramp_progress) * 100), 0)}%`}
            />
            <StatRow label="Team avg level" value={result.overgrowth.team_average_level} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground" data-testid="overgrowth-derived-note">
            {result.overgrowth.level_interpolation_assumed &&
              "Only the level-1 and level-18 endpoints are published; values between them are derived by linear interpolation (an accepted canonical derivation, marked Derived above). "}
            {result.overgrowth.suppressed_by_backdoor_protection &&
              "Suppressed while backdoor protection is active."}
          </p>
        </Panel>
      )}

      {/* Backdoor */}
      {result.backdoor?.applicable && (
        <Panel title="Backdoor protection (Reinforced Armor)">
          <div className="flex flex-wrap items-center gap-2" data-testid="backdoor-result">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                result.backdoor.protection_active
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                  : "border-zinc-500/40 bg-zinc-500/15 text-zinc-400",
              )}
            >
              {result.backdoor.protection_active ? "Protection active" : "Protection inactive"}
            </span>
            {result.backdoor.protection_active && (
              <span className="text-sm text-muted-foreground">
                damage taken ×{formatDisplayNumber(result.backdoor.damage_multiplier)}
                {result.backdoor.applies_to_true_damage && " (including true damage)"}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{result.backdoor.explanation}</p>
        </Panel>
      )}

      {/* Dependencies */}
      <Panel title="Before it can be attacked">
        {result.dependencies.required_predecessors.length > 0 ? (
          <div data-testid="dependencies">
            <p className="text-sm text-muted-foreground">Must already be destroyed:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {result.dependencies.required_predecessors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="dependencies">
            Always targetable — nothing stands in front of it.
          </p>
        )}
        {result.dependencies.targetability && (
          <div
            className={cn(
              "mt-3 rounded-md border p-3 text-sm",
              result.dependencies.targetability.targetable
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300",
            )}
            data-testid="targetability-verdict"
          >
            <span className="font-bold">
              {result.dependencies.targetability.targetable
                ? "Targetable in this scenario. "
                : "Not targetable in this scenario. "}
            </span>
            {result.dependencies.targetability.explanation}
          </div>
        )}
      </Panel>

      <NotApplicableNotes notes={notApplicable} />

      {/* Backend-generated explanation */}
      <Panel title="Summary">
        <p className="text-sm text-muted-foreground">{result.explanation}</p>
      </Panel>

      <ProvenanceList provenance={result.provenance} />
    </div>
  );
}

function PenRow({ label, applies, moot }: { label: string; applies: boolean; moot?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-xs font-semibold",
          applies ? "text-emerald-400" : "text-zinc-400",
        )}
      >
        {applies ? "Applies" : moot ? "Moot (0 magic resist)" : "Does not apply"}
      </span>
    </li>
  );
}
