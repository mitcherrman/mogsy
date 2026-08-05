// Dev-only Wave Breakpoints section (MECH1 Phase 1B) for /dev/mechanics/xp.
// Thin client over POST /api/mechanics/xp/breakpoints[/compare] — no wave or
// XP math is reproduced here.

import { useState } from "react";
import {
  BreakpointAnalysisResult,
  BreakpointsParams,
  ComparisonResult,
  MINION_TYPES,
  MinionType,
  MissedMinionRuleInput,
  analyzeBreakpoints,
  buildBreakpointsBody,
  compareBreakpoints,
} from "./api";

const ORDERING_STRATEGIES = ["melee_first", "caster_first"];
const ROUNDING_STRATEGIES = ["exact", "floor_per_event", "round_half_up_per_event"];

export default function WaveBreakpointsSection() {
  const [patch, setPatch] = useState("26.15");
  const [startingLevel, setStartingLevel] = useState(1);
  const [startingXp, setStartingXp] = useState("0");
  const [startWave, setStartWave] = useState(1);
  const [waveCount, setWaveCount] = useState(3);
  const [recipientCount, setRecipientCount] = useState(1);
  const [ordering, setOrdering] = useState("melee_first");
  const [rounding, setRounding] = useState("exact");
  const [targetLevelsText, setTargetLevelsText] = useState("2,3");
  const [superPerWave, setSuperPerWave] = useState(0);
  const [missedRules, setMissedRules] = useState<MissedMinionRuleInput[]>([]);

  const [missWave, setMissWave] = useState(2);
  const [missType, setMissType] = useState<MinionType>("melee");
  const [missCount, setMissCount] = useState(1);

  const [compareClearMisses, setCompareClearMisses] = useState(true);
  const [compareSolo, setCompareSolo] = useState(false);

  const [result, setResult] = useState<BreakpointAnalysisResult | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const params = (): BreakpointsParams => ({
    patch,
    startingLevel,
    startingCumulativeXp: startingXp,
    startWave,
    waveCount,
    recipientCount,
    orderingStrategy: ordering,
    roundingStrategy: rounding,
    missedMinions: missedRules,
    targetLevels: targetLevelsText
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    superMinionsPerWave: superPerWave,
  });

  const run = async () => {
    setBusy(true);
    setError(null);
    setComparison(null);
    try {
      setResult(await analyzeBreakpoints(buildBreakpointsBody(params())));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runComparison = async () => {
    setBusy(true);
    setError(null);
    try {
      const current = params();
      const baseline: BreakpointsParams = {
        ...current,
        missedMinions: compareClearMisses ? [] : current.missedMinions,
        recipientCount: compareSolo ? 1 : current.recipientCount,
      };
      setComparison(
        await compareBreakpoints(
          buildBreakpointsBody(baseline),
          buildBreakpointsBody(current),
        ),
      );
    } catch (err) {
      setComparison(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded border p-4" data-testid="wave-breakpoints">
      <header>
        <h2 className="text-base font-semibold">Wave breakpoints</h2>
        <p className="text-xs text-muted-foreground">
          Generates lane waves from certified rules and feeds them into the XP
          engine. Times are wave spawn times at the Nexus — minion deaths are
          not simulated.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Scenario</h3>
          <LabeledInput label="Patch" value={patch} onChange={setPatch} />
          <LabeledNumber label="Starting level" value={startingLevel} onChange={setStartingLevel} min={1} max={18} />
          <LabeledInput label="Starting cumulative XP" value={startingXp} onChange={setStartingXp} />
          <LabeledNumber label="Start wave" value={startWave} onChange={setStartWave} min={1} />
          <LabeledNumber label="Number of waves" value={waveCount} onChange={setWaveCount} min={1} />
          <LabeledInput label="Target levels (comma-separated)" value={targetLevelsText} onChange={setTargetLevelsText} />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">XP context</h3>
          <LabeledNumber label="XP recipients (1–6)" value={recipientCount} onChange={setRecipientCount} min={1} max={6} />
          <label className="block text-sm">
            Ordering strategy
            <select className="mt-1 w-full rounded border bg-transparent px-2 py-1" value={ordering} onChange={(e) => setOrdering(e.target.value)}>
              {ORDERING_STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            Rounding strategy
            <select className="mt-1 w-full rounded border bg-transparent px-2 py-1" value={rounding} onChange={(e) => setRounding(e.target.value)}>
              {ROUNDING_STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <LabeledNumber label="Super minions per wave (0–2)" value={superPerWave} onChange={setSuperPerWave} min={0} max={2} />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Missed minions</h3>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <LabeledNumber label="Wave" value={missWave} onChange={setMissWave} min={1} small />
            <label className="block">
              Type
              <select className="mt-1 rounded border bg-transparent px-2 py-1" value={missType} onChange={(e) => setMissType(e.target.value as MinionType)}>
                {MINION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <LabeledNumber label="Count" value={missCount} onChange={setMissCount} min={1} small />
            <button
              type="button"
              className="rounded border px-2 py-1"
              onClick={() =>
                setMissedRules((rules) => [
                  ...rules,
                  { wave_number: missWave, minion_type: missType, count: missCount },
                ])
              }
            >
              + add rule
            </button>
          </div>
          <ul className="space-y-1 text-xs">
            {missedRules.map((rule, index) => (
              <li key={`${rule.wave_number}-${rule.minion_type}-${index}`}>
                miss {rule.count} {rule.minion_type} in wave {rule.wave_number}{" "}
                <button
                  type="button"
                  className="text-red-500"
                  onClick={() => setMissedRules((rules) => rules.filter((_, i) => i !== index))}
                >
                  remove
                </button>
              </li>
            ))}
            {missedRules.length === 0 && (
              <li className="text-muted-foreground">No missed-minion rules.</li>
            )}
          </ul>
          <div className="space-y-1 border-t pt-2 text-xs">
            <p className="font-semibold">Comparison baseline</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={compareClearMisses} onChange={(e) => setCompareClearMisses(e.target.checked)} />
              baseline clears missed-minion rules
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={compareSolo} onChange={(e) => setCompareSolo(e.target.checked)} />
              baseline uses solo XP (1 recipient)
            </label>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className="rounded border px-3 py-1 text-sm font-medium disabled:opacity-50" disabled={busy} onClick={run}>
          {busy ? "Working…" : "Analyze breakpoints"}
        </button>
        <button type="button" className="rounded border px-3 py-1 text-sm disabled:opacity-50" disabled={busy} onClick={runComparison}>
          Compare vs baseline
        </button>
      </div>
      {error && <p className="text-xs text-red-500" data-testid="wave-breakpoints-error">{error}</p>}

      {result && (
        <div className="space-y-4" data-testid="wave-breakpoints-result">
          <div className="flex flex-wrap gap-3">
            {result.target_level_breakpoints.map((bp) => (
              <div key={bp.target_level} className={`rounded border p-3 text-xs ${bp.reached ? "" : "border-amber-500/60"}`}>
                <div className="text-sm font-semibold">Level {bp.target_level}</div>
                {bp.reached && bp.event_id ? (
                  <>
                    <div>wave {bp.wave_number} ({bp.spawn_time_display}) — <code>{bp.event_id}</code></div>
                    <div>cumulative {bp.cumulative_xp} (+{bp.xp_over_threshold} over threshold)</div>
                  </>
                ) : bp.reached ? (
                  <div>already reached at start</div>
                ) : (
                  <div>not reached in the requested wave range</div>
                )}
              </div>
            ))}
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded border border-amber-500/60 p-3 text-xs">
              <p className="mb-1 font-semibold">Warnings</p>
              <ul className="list-disc space-y-1 pl-4">
                {result.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b">
                  <th className="p-2">Wave</th>
                  <th className="p-2">Spawn</th>
                  <th className="p-2">Cannon</th>
                  <th className="p-2">Composition</th>
                  <th className="p-2">Missed</th>
                  <th className="p-2">Wave XP</th>
                  <th className="p-2">Cumulative</th>
                  <th className="p-2">Level</th>
                </tr>
              </thead>
              <tbody>
                {result.wave_summaries.map((wave) => (
                  <tr key={wave.wave_number} className="border-b">
                    <td className="p-2">{wave.wave_number}</td>
                    <td className="p-2">{wave.spawn_time_display}</td>
                    <td className="p-2">{wave.is_cannon_wave ? "cannon" : "—"}</td>
                    <td className="p-2">
                      {Object.entries(wave.minion_counts)
                        .filter(([, n]) => n > 0)
                        .map(([type, n]) => `${n} ${type}`)
                        .join(", ")}
                    </td>
                    <td className="p-2">{wave.omitted_count || "—"}</td>
                    <td className="p-2">{wave.wave_xp}</td>
                    <td className="p-2">{wave.cumulative_xp_after_wave ?? "—"}</td>
                    <td className="p-2">{wave.level_after_wave ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.omitted_events.length > 0 && (
            <div className="rounded border p-3 text-xs">
              <p className="mb-1 font-semibold">Omitted events</p>
              <ul className="list-disc pl-4">
                {result.omitted_events.map((event) => (
                  <li key={event.event_id}>
                    <code>{event.event_id}</code> ({event.minion_type}, wave{" "}
                    {event.wave_number} at {event.spawn_time_display})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="rounded border p-3 text-xs">
            <summary className="cursor-pointer font-semibold">
              Applied rules and sources ({result.applied_rules.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {result.applied_rules.map((rule) => (
                <li key={rule.rule_id}>
                  <code>{rule.rule_id}</code> — {rule.description ?? ""}{" "}
                  <span className="text-muted-foreground">[{rule.status}]</span>
                  {rule.sources?.map((source) => (
                    <div key={source.location} className="pl-4 text-muted-foreground">
                      {source.name} — {source.location}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {comparison && (
        <div className="space-y-3 rounded border p-3 text-xs" data-testid="wave-breakpoints-comparison">
          <p className="text-sm font-semibold">Comparison (baseline → current)</p>
          <p>
            Ending-XP difference: <strong>{comparison.xp_difference}</strong>
            {comparison.first_divergence
              ? ` — first divergence at ledger index ${comparison.first_divergence.ledger_index} (${comparison.first_divergence.baseline_event ?? "—"} vs ${comparison.first_divergence.comparison_event ?? "—"})`
              : " — scenarios are identical"}
          </p>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="p-1">Target</th>
                <th className="p-1">Baseline</th>
                <th className="p-1">Current</th>
                <th className="p-1">Wave Δ</th>
                <th className="p-1">Event Δ</th>
              </tr>
            </thead>
            <tbody>
              {comparison.level_breakpoint_deltas.map((delta) => (
                <tr key={delta.target_level} className="border-b">
                  <td className="p-1">L{delta.target_level}</td>
                  <td className="p-1">{delta.baseline_event ?? "not reached"} (w{delta.baseline_wave ?? "—"})</td>
                  <td className="p-1">{delta.comparison_event ?? "not reached"} (w{delta.comparison_wave ?? "—"})</td>
                  <td className="p-1">{delta.wave_delta ?? "—"}</td>
                  <td className="p-1">{delta.event_delta ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground">
            Wave/event deltas are not exact gameplay-time deltas; minion deaths
            are not simulated.
          </p>
        </div>
      )}
    </section>
  );
}

function LabeledInput({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input className="mt-1 w-full rounded border bg-transparent px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LabeledNumber({ label, value, onChange, min, max, small }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; small?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        className={`mt-1 rounded border bg-transparent px-2 py-1 ${small ? "w-16" : "w-full"}`}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
