/**
 * Two-lane runtime playback + click-to-inspect calculator for one team
 * simulation response.
 *
 * Distinct from EventTracePanel (the readable chronological record of every
 * event): this is a PLAYBACK surface over the scheduler's own action rows
 * only (`scheduler/action_executed` + `scheduler/action_failed`), laid out on
 * a shared clock as two lanes (team A / team B), with HP bars and a formula
 * calculator kept in sync with the selected/playing action.
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
  isChampionRuntimeAction,
  pipelineEventFor,
  pipelineStages,
  primaryHp,
  shieldAbsorbed,
  type PlaybackAction,
} from "@/lib/combat-lab/team-sim/playback";
const PLAYBACK_INTERVAL_MS = 700;

export function TeamCombatPlayback({ response }: { response: TeamSimulationResponse }) {
  const actions = useMemo(() => buildPlaybackActions(response), [response]);
  const teamAId = response.team_summaries[Object.keys(response.team_summaries)[0]]?.team_id;
  const [selectedSeq, setSelectedSeq] = useState<number | null>(actions[0]?.seq ?? null);
  const [playing, setPlaying] = useState(false);

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

      <TwoLaneTimeline
        actions={actions}
        selectedSeq={selected.seq}
        onSelect={selectBySeq}
        primaryTeamId={teamAId ?? null}
      />

      <HpBars response={response} selected={selected} />

      <CalculatorPanel action={selected} response={response} />
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
}: {
  actions: PlaybackAction[];
  selectedSeq: number;
  onSelect: (seq: number) => void;
  primaryTeamId: string | null;
}) {
  const maxTime = Math.max(1, ...actions.map((a) => actionSpan(a).end));
  const teams = useMemo(() => {
    const ids = Array.from(new Set(actions.map((a) => a.actorTeam).filter(Boolean))) as string[];
    ids.sort((a, b) => (a === primaryTeamId ? -1 : b === primaryTeamId ? 1 : a.localeCompare(b)));
    return ids;
  }, [actions, primaryTeamId]);

  return (
    <div className="space-y-2" data-testid="two-lane-timeline">
      {teams.map((teamId) => (
        <div key={teamId} className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Team {teamId}
          </div>
          <div className="relative h-10 w-full overflow-x-auto rounded border border-border/60 bg-muted/10">
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
}: {
  action: PlaybackAction;
  maxTime: number;
  selected: boolean;
  onSelect: (seq: number) => void;
}) {
  const { start, end } = actionSpan(action);
  const leftPct = (start / maxTime) * 100;
  const widthPct = Math.max(0.6, ((end - start) / maxTime) * 100);

  const title = `${action.actionId ?? "action"} — action start ${formatSeconds(
    start
  )}${end > start ? `, resolves at ${formatSeconds(end)}` : ""}${action.ok ? "" : " (failed)"}`;

  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      data-testid="timeline-block"
      data-seq={action.seq}
      onClick={() => onSelect(action.seq)}
      className={cn(
        "absolute top-0.5 flex h-9 items-center gap-1 rounded border px-1 text-left text-[10px] transition-colors",
        action.ok
          ? "border-border/70 bg-card/90 hover:border-primary/50"
          : "border-destructive/60 bg-destructive/10",
        selected && "border-primary bg-primary/20 ring-1 ring-primary"
      )}
      style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: "3.25rem" }}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-background/70 ring-1 ring-inset ring-white/10">
        <Swords className="h-3 w-3 text-foreground/60" />
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="block truncate font-semibold">{action.actionId ?? "action"}</span>
        <span className="block truncate tabular-nums text-muted-foreground">
          {formatSeconds(start)}
        </span>
      </span>
    </button>
  );
}

/**
 * Authoritative PRIMARY-scope HP before/after for the selected action, read
 * directly from `damage_accounting` — never subtracted client-side.
 */
function HpBars({
  response,
  selected,
}: {
  response: TeamSimulationResponse;
  selected: PlaybackAction;
}) {
  const hp = primaryHp(selected);
  const targetId = selected.targetId;
  const maxHp = targetId ? response.effective_builds[targetId]?.max_hp ?? null : null;

  return (
    <div className="space-y-1" data-testid="hp-bars">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Target HP ({targetId ?? "—"})
      </div>
      {!hp ? (
        <div className="text-[11px] text-muted-foreground">
          This action carries no PRIMARY-scope damage accounting (no HP change to show).
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] tabular-nums">
            <span>Before: {formatNumber(hp.hp_before)}</span>
            <span>After: {formatNumber(hp.hp_after)}</span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded bg-muted/30">
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500/40"
              style={{ width: `${maxHp ? Math.min(100, (hp.hp_before / maxHp) * 100) : 100}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-destructive/70"
              style={{ width: `${maxHp ? Math.min(100, (hp.hp_after / maxHp) * 100) : 0}%` }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground">
            Applied HP damage: {formatNumber(hp.applied_hp_damage)}
            {maxHp !== null ? ` · max HP ${formatNumber(maxHp)}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Click-to-inspect formula/pipeline calculator for the selected action.
 *
 * Renders, in order: formula_text + formula_bindings — CS2-2's authoritative
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
}: {
  action: PlaybackAction;
  response: TeamSimulationResponse;
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

  return (
    <div className="space-y-2 rounded border border-border/60 bg-muted/5 p-2" data-testid="calculator-panel">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Calculator — {action.actionId ?? "action"} (#{action.seq})</span>
        {!action.ok && <span className="text-destructive">action failed</span>}
      </div>

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
          Detailed formula breakdown is unavailable for this action. The damage
          pipeline below (when present) and the applied HP change are still the
          engine's authoritative numbers.
        </div>
      ) : (
        <div className="space-y-1">
          {diagnostics?.formulaText ? (
            <div className="rounded bg-background/60 p-1.5 font-mono text-[11px]" data-testid="formula-text">
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

      {stages.length > 0 ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Damage pipeline
          </div>
          <table className="w-full text-left text-[11px]" data-testid="pipeline-stages-table">
            <tbody>
              {stages.map((stage) => (
                <tr key={stage.key} data-testid="pipeline-stage-row">
                  <td className="pr-2 text-muted-foreground">{stage.label}</td>
                  <td className="font-mono">{formatNumber(stage.value)}</td>
                </tr>
              ))}
              {shield !== null ? (
                <tr>
                  <td className="pr-2 text-muted-foreground">Shield absorbed</td>
                  <td className="font-mono">{formatNumber(shield)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : action.ok ? (
        <div className="text-[11px] text-muted-foreground">
          No pipeline-stage detail on this event (re-run at trace detail "calculation" to see it).
        </div>
      ) : null}

      {hp ? (
        <div className="flex justify-between border-t border-border/40 pt-1 text-[11px] font-medium">
          <span>Target HP {formatNumber(hp.hp_before)} → {formatNumber(hp.hp_after)}</span>
          <span className="tabular-nums text-destructive">
            −{formatNumber(hp.applied_hp_damage)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
