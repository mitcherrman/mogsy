// Minion Inspector — consumer surface over GET /api/mechanics/explorer/minions.
// Every stat, upgrade instant, Minion Slayer percentage and damage modifier
// comes from the backend engine; this component maps inputs and renders each
// stat with its backend-declared status. The flagship truth-over-precision
// case: siege attack damage is certified strictly before the wave-15
// transition and rendered as an explicit Unresolved state from that instant
// on — never extrapolated.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import {
  MINION_TYPES,
  type MinionTypeToken,
  fetchMinion,
  formatClock,
  parseGameTimeInput,
  type MinionResult,
  type StatValue,
} from "@/lib/mechanics-explorer/api";
import {
  ChoiceChips,
  ErrorBanner,
  GameTimeField,
  Panel,
  ProvenanceList,
  ResultSkeleton,
  StatValueCell,
} from "./ui";

interface MinionInspectorProps {
  minionType: MinionTypeToken;
  timeText: string;
  onMinionTypeChange: (type: MinionTypeToken) => void;
  onTimeTextChange: (text: string) => void;
}

/** Reader-facing labels over canonical API vocabulary (labels only). */
const TYPE_OPTIONS: Array<{ value: MinionTypeToken; label: string; hint?: string }> = [
  { value: "melee", label: "Melee" },
  { value: "caster", label: "Caster", hint: "(ranged)" },
  { value: "siege", label: "Siege", hint: "(cannon)" },
  { value: "super", label: "Super" },
];

const STAT_ROWS: Array<{ key: keyof MinionResult["stats"]; label: string; unit?: string }> = [
  { key: "health", label: "Health" },
  { key: "attack_damage", label: "Attack damage" },
  { key: "armor", label: "Armor" },
  { key: "magic_resist", label: "Magic resist" },
  { key: "attack_speed", label: "Attack speed" },
  { key: "attack_range", label: "Attack range" },
  { key: "movement_speed", label: "Movement speed" },
  { key: "gold", label: "Gold bounty" },
  { key: "experience", label: "Experience" },
];

export default function MinionInspector({
  minionType,
  timeText,
  onMinionTypeChange,
  onTimeTextChange,
}: MinionInspectorProps) {
  const parsedTime = useMemo(() => parseGameTimeInput(timeText), [timeText]);

  const query = useQuery<MinionResult, Error>({
    queryKey: [
      "mechanics-explorer",
      "minion",
      minionType,
      parsedTime.ok ? parsedTime.seconds : null,
    ],
    queryFn: () => fetchMinion(minionType, parsedTime.ok ? parsedTime.seconds : 0),
    enabled: parsedTime.ok,
    staleTime: Infinity, // deterministic engine: same inputs, same answer
  });

  return (
    <div className="space-y-4">
      <Panel title="Pick a minion">
        <ChoiceChips
          options={TYPE_OPTIONS}
          value={minionType}
          onChange={onMinionTypeChange}
          ariaLabel="Minion type"
        />
        <div className="mt-3 max-w-xs">
          <GameTimeField
            id="minion-time"
            value={timeText}
            placeholder="14:00"
            parsed={parsedTime}
            onChange={onTimeTextChange}
          />
        </div>
      </Panel>

      {parsedTime.ok && query.isPending && <ResultSkeleton />}
      {parsedTime.ok && query.isError && (
        <ErrorBanner error={query.error} onRetry={() => query.refetch()} />
      )}
      {parsedTime.ok && query.data && <MinionResultView result={query.data} />}
    </div>
  );
}

function MinionResultView({ result }: { result: MinionResult }) {
  const typeLabel =
    TYPE_OPTIONS.find((option) => option.value === result.minion_type)?.label ??
    result.minion_type;
  const anyUnresolved = STAT_ROWS.some(
    (row) => (result.stats[row.key] as StatValue).value === null,
  );

  return (
    <div className="space-y-4" data-testid="minion-result">
      {/* Summary */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-[#1e3a5f]/60 to-[#0a1428]/90 p-5">
        <div className="text-[10px] uppercase tracking-widest font-bold text-[#c9a84c]">
          {typeLabel} minion at {result.game_time_display}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-bold tabular-nums text-foreground">
            {result.upgrades.count}
          </span>
          <span className="text-sm text-muted-foreground">
            stat upgrade{result.upgrades.count === 1 ? "" : "s"} received (every 90s from 0:30)
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
          {result.upgrades.last_upgrade_at_s !== null && (
            <>Last upgrade at {formatClock(result.upgrades.last_upgrade_at_s)} · </>
          )}
          Next upgrade at {formatClock(result.upgrades.next_upgrade_at_s)}
        </div>
      </div>

      {/* Siege AD transition callout — always visible for siege */}
      {result.siege_attack_damage_transition && (
        <div
          className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-4"
          data-testid="siege-ad-transition"
        >
          <div className="flex items-center gap-2 text-sky-300">
            <Info className="h-4 w-4 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Siege attack damage boundary
            </span>
          </div>
          <p className="mt-2 text-sm text-sky-200/90">
            Siege attack damage is certified strictly before{" "}
            <span className="font-semibold tabular-nums">
              {result.siege_attack_damage_transition.certified_strictly_before_display}
            </span>{" "}
            and unresolved from{" "}
            <span className="font-semibold tabular-nums">
              {result.siege_attack_damage_transition.unresolved_from_display}
            </span>{" "}
            onward. Mogzy shows the unresolved state rather than guessing a value the sources
            don't settle.
          </p>
        </div>
      )}

      {/* Stat table */}
      <Panel title="Stats at this game time">
        <div className="divide-y divide-border/50">
          {STAT_ROWS.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
              data-testid={`minion-stat-${row.key}`}
            >
              <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                {row.label}
              </span>
              <span className="text-sm text-right">
                <StatValueCell stat={result.stats[row.key] as StatValue} unit={row.unit} />
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Health: {result.health_breakdown.base} base +{" "}
          {result.health_breakdown.from_upgrades} from upgrades
          {result.health_breakdown.capped && " (at its cap)"}.
          {anyUnresolved &&
            " Stats marked Unresolved have no certified value at this instant — Mogzy does not guess."}
        </p>
      </Panel>

      {/* Minion Slayer */}
      <Panel title="On-hit vs lane minions">
        {result.minion_slayer.has_passive ? (
          <p className="text-sm text-muted-foreground" data-testid="minion-slayer">
            <span className="font-semibold text-foreground">
              {result.minion_slayer.passive_name}
            </span>
            : attacks deal an extra{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {result.minion_slayer.percent_current_health}%
            </span>{" "}
            of the target's <em>current</em> health as bonus {result.minion_slayer.damage_type}{" "}
            damage — against lane minions only.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="minion-slayer">
            This minion type has no on-hit passive against lane minions.
          </p>
        )}
      </Panel>

      {/* Structure damage + aggro */}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Damage vs structures">
          <ul className="space-y-2 text-sm text-muted-foreground" data-testid="structure-damage">
            <li className="flex items-center justify-between gap-3">
              <span>vs turrets</span>
              <span className="font-semibold tabular-nums text-foreground">
                ×{result.structure_damage.vs_turret?.damage_multiplier}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span>vs inhibitors / Nexus</span>
              <span className="font-semibold tabular-nums text-foreground">
                ×{result.structure_damage.vs_non_turret_structure?.damage_multiplier}
              </span>
            </li>
          </ul>
        </Panel>
        <Panel title="Champion aggro rule">
          <p className="text-sm text-muted-foreground" data-testid="minion-aggro">
            {result.aggro.attacking_minion_triggers_aggro ? (
              "Attacking a lane minion draws enemy-minion aggro."
            ) : (
              <>
                Attacking a lane minion does{" "}
                <span className="font-semibold text-foreground">not</span> by itself draw
                enemy-minion aggro (removed in patch {result.aggro.removed_in_patch}).
                Minions still target champions who damage an enemy champion nearby.
              </>
            )}
          </p>
        </Panel>
      </div>

      {/* Backend-generated explanation */}
      <Panel title="Summary">
        <p className="text-sm text-muted-foreground">{result.explanation}</p>
      </Panel>

      <ProvenanceList provenance={result.provenance} />
    </div>
  );
}
