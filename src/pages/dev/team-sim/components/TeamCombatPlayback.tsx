/**
 * Two-lane runtime playback + click-to-inspect calculator for one team
 * simulation response.
 *
 * Distinct from EventTracePanel (the readable chronological record of every
 * event): this is a PLAYBACK surface over the scheduler's own action rows
 * only (`scheduler/action_executed` + `scheduler/action_failed`), laid out on
 * a shared clock as two lanes (team A / team B), with a champion roster, HP
 * bars, and a formula calculator kept in sync with the selected/playing
 * action.
 *
 * Every number rendered here is read from the backend response — see
 * `lib/combat-lab/team-sim/playback.ts` for exact field provenance. Nothing
 * in this file computes damage or HP; it only positions and labels backend
 * values on a timeline and drives which one is "selected".
 *
 * The formula/pipeline detail this panel needs is only present in the
 * response at `trace_detail: "calculation"` (CS2-2, live in production —
 * see playback.ts) or `"full"`. At `standard` or `summary` the two lanes and
 * HP bars still render fully (they use only scheduler/lifecycle fields), but
 * the calculator says so instead of rendering an empty table.
 *
 * Icons/portraits are resolved from Mogzy's existing champion asset
 * infrastructure only (`useChampionAssets`, `lib/combat-lab/abilityIcons`) —
 * no new asset pipeline. Every icon gracefully falls back to a neutral glyph
 * when no real art resolves.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Swords } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TeamSimulationResponse } from "@/lib/combat-lab/team-sim/contract";
import { formatNumber, formatSeconds } from "@/lib/combat-lab/team-sim/result";
import {
  actionSpan,
  buildPlaybackActions,
  formulaDiagnostics,
  hasNoFormulaEvidence,
  humanizeActionId,
  isBasicAttackAction,
  isChampionRuntimeAction,
  pipelineEventFor,
  pipelineStages,
  primaryHp,
  shieldAbsorbed,
  type PlaybackAction,
} from "@/lib/combat-lab/team-sim/playback";
import {
  useChampionAssets,
  getChampionIcon,
  type ChampionManifest,
} from "@/hooks/useChampionAssets";
import {
  getAbilityIconUrl,
  getChampionSquareIconUrl,
  inferActionAbilitySlot,
  toneForSlot,
} from "@/lib/combat-lab/abilityIcons";

const PLAYBACK_INTERVAL_MS = 700;

const TONE_RING: Record<string, string> = {
  q: "ring-amber-400/50",
  w: "ring-sky-400/50",
  e: "ring-emerald-400/50",
  r: "ring-fuchsia-400/50",
  neutral: "ring-white/10",
};

export function TeamCombatPlayback({ response }: { response: TeamSimulationResponse }) {
  const actions = useMemo(() => buildPlaybackActions(response), [response]);
  const teamAId = response.team_summaries[Object.keys(response.team_summaries)[0]]?.team_id;
  const [selectedSeq, setSelectedSeq] = useState<number | null>(actions[0]?.seq ?? null);
  const [playing, setPlaying] = useState(false);
  const { data: manifest } = useChampionAssets();

  const selectedIndex = actions.findIndex((a) => a.seq === selectedSeq);

  // Playback advances chronologically through `actions` (scheduler seq order,
  // which is the scheduler's own chronological order). A ref mirrors the
  // current index so the interval callback always advances from the latest
  // selection even though it closes over state from when it was scheduled.
  const indexRef = useRef(selectedIndex);
  indexRef.current = selectedIndex;

  useEffect(() => {
    if (!playing || actions.length === 0) return;
    const timer = window.setInterval(() => {
      const next = indexRef.current + 1;
      if (next >= actions.length) {
        setPlaying(false);
        return;
      }
      setSelectedSeq(actions[next].seq);
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, actions]);

  if (actions.length === 0) {
    return (
      <Card className="p-3 text-xs text-muted-foreground" data-testid="team-combat-playback">
        No scheduler actions were returned to play back.
      </Card>
    );
  }

  const selected = selectedIndex >= 0 ? actions[selectedIndex] : actions[0];

  function selectBySeq(seq: number) {
    setPlaying(false);
    setSelectedSeq(seq);
  }

  function stepTo(index: number) {
    const clamped = Math.max(0, Math.min(actions.length - 1, index));
    setSelectedSeq(actions[clamped].seq);
  }

  return (
    <Card className="space-y-3 p-3" data-testid="team-combat-playback">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Combat playback</h2>
        <PlaybackControls
          playing={playing}
          onPlay={() => {
            if (selectedIndex >= actions.length - 1) stepTo(0);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onReset={() => {
            setPlaying(false);
            stepTo(0);
          }}
        />
      </header>

      <ChampionRoster response={response} manifest={manifest ?? null} selected={selected} />

      <TwoLaneTimeline
        actions={actions}
        selectedSeq={selected.seq}
        onSelect={selectBySeq}
        primaryTeamId={teamAId ?? null}
        response={response}
        manifest={manifest ?? null}
      />

      <CalculatorPanel action={selected} response={response} manifest={manifest ?? null} />
    </Card>
  );
}

function PlaybackControls({
  playing,
  onPlay,
  onPause,
  onReset,
}: {
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Playback controls">
      <button
        type="button"
        onClick={playing ? onPause : onPlay}
        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
        data-testid="playback-play-pause"
      >
        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        {playing ? "Pause" : "Play"}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
        data-testid="playback-reset"
      >
        <RotateCcw className="h-3 w-3" />
        Reset
      </button>
    </div>
  );
}

/**
 * Champion identity strip — one chip per combatant, grouped by team, so a
 * viewer can tell the lanes apart at a glance instead of reading runtime ids.
 * Portrait/name/level come from `effective_builds` (authoritative build that
 * actually ran) plus the shared champion asset manifest already used
 * elsewhere in Mogzy (`useChampionAssets`). HP shown is the combatant's
 * CURRENT state as of the selected action, read from the same
 * `damage_accounting` scopes the HP bars use — never re-derived.
 */
function ChampionRoster({
  response,
  manifest,
  selected,
}: {
  response: TeamSimulationResponse;
  manifest: ChampionManifest | null;
  selected: PlaybackAction;
}) {
  const teams = useMemo(() => {
    const byTeam = new Map<string, string[]>();
    for (const [runtimeId, summary] of Object.entries(response.combatant_summaries)) {
      const list = byTeam.get(summary.team_id) ?? [];
      list.push(runtimeId);
      byTeam.set(summary.team_id, list);
    }
    for (const list of byTeam.values()) {
      list.sort((a, b) => (response.combatant_summaries[a]?.slot_index ?? 0) - (response.combatant_summaries[b]?.slot_index ?? 0));
    }
    return Array.from(byTeam.entries());
  }, [response]);

  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="champion-roster">
      {teams.map(([teamId, runtimeIds]) => (
        <div key={teamId} className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Team {teamId}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {runtimeIds.map((runtimeId) => (
              <RosterChip
                key={runtimeId}
                runtimeId={runtimeId}
                response={response}
                manifest={manifest}
                active={selected.actorId === runtimeId || selected.targetId === runtimeId}
                isDamageTick={selected.targetId === runtimeId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RosterChip({
  runtimeId,
  response,
  manifest,
  active,
  isDamageTick,
}: {
  runtimeId: string;
  response: TeamSimulationResponse;
  manifest: ChampionManifest | null;
  active: boolean;
  isDamageTick: boolean;
}) {
  const build = response.effective_builds[runtimeId];
  const summary = response.combatant_summaries[runtimeId];
  const iconUrl = getChampionIcon(manifest, build?.champion) ?? getChampionSquareIconUrl(build?.champion);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [iconUrl]);

  return (
    <div
      data-testid="roster-chip"
      data-runtime-id={runtimeId}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-1.5 py-1 transition-colors",
        active ? "border-primary/60 bg-primary/10" : "border-border/50 bg-card/60",
        !summary?.alive && "opacity-50 grayscale"
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-inset transition-transform",
          isDamageTick && "ring-destructive/60",
          !isDamageTick && "ring-white/10"
        )}
      >
        {iconUrl && !broken ? (
          <img
            src={iconUrl}
            alt={build?.champion ?? runtimeId}
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <Swords className="h-3.5 w-3.5 text-foreground/50" />
        )}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block max-w-[7rem] truncate text-[11px] font-semibold">
          {build?.champion ?? runtimeId}
        </span>
        <span className="block truncate text-[10px] tabular-nums text-muted-foreground">
          {typeof build?.level === "number" ? `Lv ${build.level} · ` : ""}
          {formatNumber(summary?.final_hp ?? build?.starting_hp ?? 0, 0)}/
          {formatNumber(build?.max_hp ?? 0, 0)} HP
        </span>
      </span>
    </div>
  );
}

/**
 * Two horizontal lanes (one per team), action blocks positioned by their
 * authoritative `time` and widened to the derived start→resolution span (see
 * `actionSpan` — never a fabricated duration field). Labeled with "action
 * start" / "resolves at" rather than "impact"/"hit", since the backend makes
 * no claim about a projectile or hit instant.
 */
function TwoLaneTimeline({
  actions,
  selectedSeq,
  onSelect,
  primaryTeamId,
  response,
  manifest,
}: {
  actions: PlaybackAction[];
  selectedSeq: number;
  onSelect: (seq: number) => void;
  primaryTeamId: string | null;
  response: TeamSimulationResponse;
  manifest: ChampionManifest | null;
}) {
  const maxTime = Math.max(1, ...actions.map((a) => actionSpan(a).end));
  const teams = useMemo(() => {
    const ids = Array.from(new Set(actions.map((a) => a.actorTeam).filter(Boolean))) as string[];
    ids.sort((a, b) => (a === primaryTeamId ? -1 : b === primaryTeamId ? 1 : a.localeCompare(b)));
    return ids;
  }, [actions, primaryTeamId]);

  return (
    <div className="space-y-3" data-testid="two-lane-timeline">
      {teams.map((teamId) => (
        <div key={teamId} className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Team {teamId}
          </div>
          <div className="relative h-14 w-full overflow-x-auto rounded border border-border/60 bg-muted/10">
            <div className="relative h-full" style={{ minWidth: "100%" }}>
              {actions
                .filter((a) => a.actorTeam === teamId)
                .map((action) => (
                  <TimelineBlock
                    key={action.seq}
                    action={action}
                    maxTime={maxTime}
                    selected={action.seq === selectedSeq}
                    onSelect={onSelect}
                    response={response}
                    manifest={manifest}
                  />
                ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineBlock({
  action,
  maxTime,
  selected,
  onSelect,
  response,
  manifest,
}: {
  action: PlaybackAction;
  maxTime: number;
  selected: boolean;
  onSelect: (seq: number) => void;
  response: TeamSimulationResponse;
  manifest: ChampionManifest | null;
}) {
  const { start, end } = actionSpan(action);
  const leftPct = (start / maxTime) * 100;
  // Zero-duration actions still get a real (small) pixel width via minWidth
  // below — this is a display-only clickability floor, never a fabricated
  // duration: the title/label always show the true start/resolve times.
  const widthPct = Math.max(0.6, ((end - start) / maxTime) * 100);
  const zeroDuration = end <= start;

  // The RAW action id leads the tooltip: the block now prints a readable
  // label, so the operator-facing surface has to keep the authoritative
  // identity somewhere it can be read and matched against a trace row.
  const label = humanizeActionId(action.actionId);
  const title = `${action.actionId ?? "action"} — action start ${formatSeconds(
    start
  )}${end > start ? `, resolves at ${formatSeconds(end)}` : ""}${action.ok ? "" : " (failed)"}`;
  // Server classification (`meta.action_type`), never inferred from the id.
  // Drives visual weight ONLY — the block keeps its own instant, its own
  // width and its own click target.
  const auto = isBasicAttackAction(action);

  const champion = action.actorId ? response.effective_builds[action.actorId]?.champion : null;
  const slot = inferActionAbilitySlot(action.actionId, action.actionId);
  const tone = toneForSlot(slot);
  const abilityIconUrl = slot ? getAbilityIconUrl(champion, slot) : null;
  const fallbackIconUrl = getChampionIcon(manifest, champion) ?? getChampionSquareIconUrl(champion);
  const iconUrl = abilityIconUrl ?? fallbackIconUrl;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [iconUrl]);

  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      data-testid="timeline-block"
      data-seq={action.seq}
      data-zero-duration={zeroDuration || undefined}
      onClick={() => onSelect(action.seq)}
      className={cn(
        "absolute top-1 flex h-11 items-center gap-1 rounded border px-1 text-left text-[10px] transition-colors hover:opacity-100",
        action.ok
          ? "border-border/70 bg-card/90 hover:border-primary/50"
          : "border-destructive/60 bg-destructive/10",
        // A repeating plan fills the lane with autos, which buries the casts
        // that actually explain the fight. Successful autos therefore recede;
        // a FAILED one never does, because a failure is the signal.
        auto && action.ok && !selected && "opacity-60 border-border/40 bg-card/60",
        selected && "border-primary bg-primary/20 ring-1 ring-primary opacity-100"
      )}
      data-auto={auto || undefined}
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: "3.5rem" }}
    >
      <span
        className={cn(
          "shrink-0 items-center justify-center overflow-hidden rounded bg-background/70 ring-1 ring-inset",
          // Autos also give back some width, so an ability's icon and label
          // read first in a dense lane.
          auto ? "flex h-5 w-5" : "flex h-7 w-7",
          TONE_RING[tone] ?? TONE_RING.neutral
        )}
      >
        {iconUrl && !broken ? (
          <img
            src={iconUrl}
            alt={action.actionId ?? "action"}
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <Swords className="h-3 w-3 text-foreground/60" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className={cn("block truncate", auto ? "font-normal" : "font-semibold")}>
          {label}
        </span>
        <span className="block truncate tabular-nums text-muted-foreground">
          starts {formatSeconds(start)}
        </span>
      </span>
    </button>
  );
}

/**
 * Click-to-inspect formula/pipeline calculator for the selected action.
 *
 * Renders, in order: an action header (champion, action, target, applied
 * damage), then formula_text + formula_bindings — CS2-2's authoritative
 * calculation evidence, present when the action ran through the generic
 * formula resolver and the response was fetched at `trace_detail:
 * "calculation"` (or `"full"`) — then only the damage-pipeline stages
 * actually present on the kernel event, then the authoritative target HP
 * before→after. `formula_bindings` is never re-evaluated here; every value
 * shown is exactly what the server's own formula evaluator substituted.
 *
 * THREE distinct states, not two — this matters:
 *  - CONFIRMED champion-runtime (`isChampionRuntimeAction`): a
 *    `champion_ability` kernel event exists and reliably signals it did NOT
 *    go through the generic resolver (see `isGenericFormulaEvent`). Labeled
 *    as such — this is a real, provable fact.
 *  - UNAVAILABLE (`hasNoFormulaEvidence`): no `champion_ability` kernel event
 *    exists at all — a basic attack, or a trace fetched at a detail level
 *    that stripped kernel events. This is NOT evidence of a champion-runtime
 *    origin and is never labeled as one; the copy is neutral.
 *  - formula evidence: a generic-formula event exists, rendered with
 *    whatever of `formula_text`/`formula_bindings` the response's
 *    `trace_detail` actually carried.
 * The damage pipeline is sourced independently of which of these applies —
 * `pipelineEventFor` looks at every kernel event, not just `champion_ability`
 * ones, so a basic attack's real mitigation ladder (on its `damage_packet`
 * event) is never hidden by this branching.
 */
function CalculatorPanel({
  action,
  response,
  manifest,
}: {
  action: PlaybackAction;
  response: TeamSimulationResponse;
  manifest: ChampionManifest | null;
}) {
  const hp = primaryHp(action);
  const runtimeOnly = isChampionRuntimeAction(action);
  const noEvidence = hasNoFormulaEvidence(action);
  const formulaEvent =
    action.kernelEvents.find((e) => formulaDiagnostics(e)?.isGenericFormulaEvent) ?? null;
  const diagnostics = formulaEvent ? formulaDiagnostics(formulaEvent) : null;
  const pipeEvent = pipelineEventFor(action);
  const stages = pipeEvent ? pipelineStages(pipeEvent) : [];
  const shield = pipeEvent ? shieldAbsorbed(pipeEvent) : null;

  const champion = action.actorId ? response.effective_builds[action.actorId]?.champion : null;
  const slot = inferActionAbilitySlot(action.actionId, action.actionId);
  const abilityIconUrl = slot ? getAbilityIconUrl(champion, slot) : null;
  const headerIconUrl = abilityIconUrl ?? getChampionIcon(manifest, champion) ?? getChampionSquareIconUrl(champion);
  const maxHp = action.targetId ? response.effective_builds[action.targetId]?.max_hp ?? null : null;

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/5 p-3" data-testid="calculator-panel">
      {/* A. Action header — champion, action, target, applied damage. */}
      <ActionHeader
        action={action}
        champion={champion}
        iconUrl={headerIconUrl}
        appliedDamage={hp?.applied_hp_damage ?? null}
      />

      {/* B. Formula section */}
      {!action.ok ? (
        <div className="text-[11px] text-muted-foreground">
          Rejected action — no damage was computed.
        </div>
      ) : runtimeOnly ? (
        <div className="text-[11px] text-muted-foreground" data-testid="champion-runtime-note">
          Champion-specific runtime calculation — this action's damage came from a
          champion-specific runtime implementation rather than the generic formula
          resolver, so no formula substitution data exists for it. The damage
          pipeline below (when present) and the applied HP change are still the
          engine's authoritative numbers.
        </div>
      ) : noEvidence ? (
        <div className="text-[11px] text-muted-foreground" data-testid="formula-unavailable-note">
          Formula breakdown unavailable for this action. The damage pipeline
          below (when present) and the applied HP change are still the
          engine's authoritative numbers.
        </div>
      ) : (
        <div className="space-y-1.5">
          {diagnostics?.formulaText ? (
            <div className="rounded bg-background/60 p-2 font-mono text-[11px]" data-testid="formula-text">
              {diagnostics.formulaText}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">No formula text on this event.</div>
          )}
          {diagnostics?.formulaBindings && Object.keys(diagnostics.formulaBindings).length > 0 ? (
            <table className="w-full text-left text-[11px]" data-testid="formula-bindings-table">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pr-2 font-medium">Input</th>
                  <th className="font-medium">Value used</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(diagnostics.formulaBindings).map(([k, v]) => (
                  <tr key={k}>
                    <td className="pr-2 font-mono">{k}</td>
                    <td className="font-mono">{formatNumber(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {diagnostics?.error ? (
            <div className="text-[11px] text-destructive">Formula error: {diagnostics.error}</div>
          ) : null}
        </div>
      )}

      {/* C. Damage pipeline — vertical stage path, only stages present. */}
      {stages.length > 0 ? (
        <DamagePipeline stages={stages} shield={shield} />
      ) : action.ok ? (
        <div className="text-[11px] text-muted-foreground">
          No pipeline-stage detail on this event (re-run at trace detail "calculation" to see it).
        </div>
      ) : null}

      {/* D. HP result — visual conclusion. */}
      <HpResult hp={hp} maxHp={maxHp} targetId={action.targetId} />
    </div>
  );
}

function ActionHeader({
  action,
  champion,
  iconUrl,
  appliedDamage,
}: {
  action: PlaybackAction;
  champion: string | null | undefined;
  iconUrl: string | null;
  appliedDamage: number | null;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [iconUrl]);

  return (
    <div className="flex items-center justify-between gap-2" data-testid="calculator-action-header">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background ring-1 ring-inset ring-white/10">
          {iconUrl && !broken ? (
            <img
              src={iconUrl}
              alt={action.actionId ?? "action"}
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <Swords className="h-4 w-4 text-foreground/60" />
          )}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold">
            {humanizeActionId(action.actionId)}
          </div>
          {/* The authoritative id, kept visible: this panel is the operator's
              evidence surface and the readable name above is only a label. */}
          {action.actionId ? (
            <div
              className="truncate font-mono text-[10px] text-muted-foreground/70"
              data-testid="calculator-action-id"
            >
              {action.actionId}
            </div>
          ) : null}
          <div className="truncate text-[11px] text-muted-foreground">
            {champion ?? action.actorId ?? "—"}
            {action.targetId ? ` → ${action.targetId}` : ""}
            {!action.ok && <span className="text-destructive"> · action failed</span>}
          </div>
        </div>
      </div>
      {appliedDamage !== null && (
        <div className="shrink-0 text-right">
          <div className="text-lg font-black tabular-nums text-destructive">
            −{formatNumber(appliedDamage)}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">applied damage</div>
        </div>
      )}
    </div>
  );
}

const PIPELINE_STAGE_TONE: Record<string, string> = {
  raw_damage_before_pipeline: "border-l-muted-foreground/50",
  target_damage_before_defenses: "border-l-muted-foreground/50",
  target_damage_after_defenses: "border-l-amber-400/60",
  damage_after_modifiers: "border-l-sky-400/60",
  target_damage_after_reduction: "border-l-sky-400/60",
  post_mitigation_damage: "border-l-destructive/70",
};

function DamagePipeline({
  stages,
  shield,
}: {
  stages: { key: string; label: string; value: number }[];
  shield: number | null;
}) {
  return (
    <div data-testid="damage-pipeline">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Damage pipeline
      </div>
      <div className="space-y-1">
        {stages.map((stage) => (
          <div
            key={stage.key}
            data-testid="pipeline-stage-row"
            className={cn(
              "flex items-center justify-between rounded border-l-2 bg-background/50 px-2 py-1 text-[11px]",
              PIPELINE_STAGE_TONE[stage.key] ?? "border-l-border"
            )}
          >
            <span className="text-muted-foreground">{stage.label}</span>
            <span className="font-mono font-semibold">{formatNumber(stage.value)}</span>
          </div>
        ))}
        {shield !== null ? (
          <div className="flex items-center justify-between rounded border-l-2 border-l-emerald-400/60 bg-background/50 px-2 py-1 text-[11px]">
            <span className="text-muted-foreground">Shield absorbed</span>
            <span className="font-mono font-semibold">{formatNumber(shield)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Authoritative PRIMARY-scope HP before/after for the selected action, read
 * directly from `damage_accounting` — never subtracted client-side. The
 * conclusion of the calculator: HP before → HP after, with a modest pulse on
 * the bar for the applied change (CSS transition only).
 */
function HpResult({
  hp,
  maxHp,
  targetId,
}: {
  hp: { hp_before: number; hp_after: number; applied_hp_damage: number } | null;
  maxHp: number | null;
  targetId: string | null;
}) {
  return (
    <div className="space-y-1 border-t border-border/40 pt-2" data-testid="hp-bars">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Target HP ({targetId ?? "—"})
      </div>
      {!hp ? (
        <div className="text-[11px] text-muted-foreground">
          This action carries no PRIMARY-scope damage accounting (no HP change to show).
        </div>
      ) : (
        <div className="space-y-1">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted/30">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/40 transition-[width] duration-500"
              style={{ width: `${maxHp ? Math.min(100, (hp.hp_before / maxHp) * 100) : 100}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 animate-pulse rounded-full bg-destructive/70 transition-[width] duration-500"
              style={{ width: `${maxHp ? Math.min(100, (hp.hp_after / maxHp) * 100) : 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[12px] font-semibold tabular-nums">
            <span>
              {formatNumber(hp.hp_before)} → {formatNumber(hp.hp_after)}
              {maxHp !== null ? <span className="font-normal text-muted-foreground"> / {formatNumber(maxHp)} max HP</span> : null}
            </span>
            <span className="text-destructive">−{formatNumber(hp.applied_hp_damage)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
