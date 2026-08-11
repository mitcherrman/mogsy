// Dev-only League mechanics XP calculator (MECH1 Phase 0).
// Thin client over the backend league_mechanics engine — this page performs
// no XP math of its own. Not linked from any navigation; DEV-gated below.

import { useEffect, useMemo, useState } from "react";
import WaveBreakpointsSection from "./WaveBreakpointsSection";
import {
  MINION_TYPES,
  MinionEventInput,
  MinionType,
  SimulationResult,
  XpConfig,
  buildEventsFromCounts,
  fetchXpConfig,
  simulateXp,
} from "./api";

const EMPTY_COUNTS: Record<MinionType, number> = {
  melee: 0,
  caster: 0,
  cannon: 0,
  super: 0,
};

export default function MechanicsXpPage() {
  const [config, setConfig] = useState<XpConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [patch, setPatch] = useState("26.15");
  const [startingLevel, setStartingLevel] = useState(1);
  const [startingXp, setStartingXp] = useState("0");
  const [recipientCount, setRecipientCount] = useState(1);
  const [rounding, setRounding] = useState("exact");
  const [counts, setCounts] = useState<Record<MinionType, number>>({ ...EMPTY_COUNTS });
  const [orderedMode, setOrderedMode] = useState(false);
  const [orderedEvents, setOrderedEvents] = useState<MinionEventInput[]>([]);

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchXpConfig()
      .then(setConfig)
      .catch((error: Error) => setConfigError(error.message));
  }, []);

  const events = useMemo(
    () => (orderedMode ? orderedEvents : buildEventsFromCounts(counts, recipientCount)),
    [orderedMode, orderedEvents, counts, recipientCount],
  );

  if (!import.meta.env.DEV) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center text-sm text-muted-foreground">
        The mechanics XP calculator is a development-only tool.
      </div>
    );
  }

  const runSimulation = async () => {
    setBusy(true);
    setSimError(null);
    try {
      const simulation = await simulateXp({
        patch,
        starting_level: startingLevel,
        starting_cumulative_xp: startingXp,
        events,
        rounding_strategy: rounding,
      });
      setResult(simulation);
    } catch (error) {
      setResult(null);
      setSimError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const addOrderedEvent = (type: MinionType) => {
    setOrderedEvents((previous) => [
      ...previous,
      {
        kind: "minion",
        minion_type: type,
        recipient_count: recipientCount,
        event_id: `${type}-${previous.length + 1}`,
      },
    ]);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4" data-testid="mechanics-xp-page">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">League Mechanics — XP Calculator (dev)</h1>
        <p className="text-sm text-muted-foreground">
          Deterministic lane-minion XP and champion-level engine. All math runs in the
          backend; results carry rule identity and provisional-data warnings.
        </p>
        {config ? (
          <p className="text-xs text-muted-foreground">
            Ruleset <code>{config.ruleset_id}</code> — effective patch{" "}
            {config.effective_patch}, verified through {config.verified_through} —{" "}
            {config.map} / {config.mode} — level cap {config.level_cap}
          </p>
        ) : configError ? (
          <p className="text-xs text-red-500">
            Could not load backend config: {configError}. Is the FastAPI backend running?
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Loading backend config…</p>
        )}
      </header>

      <section className="grid gap-4 rounded border p-4 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Starting state</h2>
          <label className="block text-sm">
            Patch
            <input
              className="mt-1 w-full rounded border bg-transparent px-2 py-1"
              value={patch}
              onChange={(event) => setPatch(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Starting level
            <input
              type="number"
              min={1}
              max={config?.level_cap ?? 18}
              className="mt-1 w-full rounded border bg-transparent px-2 py-1"
              value={startingLevel}
              onChange={(event) => setStartingLevel(Number(event.target.value))}
            />
          </label>
          <label className="block text-sm">
            Starting cumulative XP
            <input
              className="mt-1 w-full rounded border bg-transparent px-2 py-1"
              value={startingXp}
              onChange={(event) => setStartingXp(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            XP recipients near each dying minion (1–6, includes you)
            <input
              type="number"
              min={1}
              max={6}
              className="mt-1 w-full rounded border bg-transparent px-2 py-1"
              value={recipientCount}
              onChange={(event) => setRecipientCount(Number(event.target.value))}
            />
          </label>
          <label className="block text-sm">
            Rounding strategy
            <select
              className="mt-1 w-full rounded border bg-transparent px-2 py-1"
              value={rounding}
              onChange={(event) => setRounding(event.target.value)}
            >
              {(config?.rounding_strategies ?? ["exact"]).map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Minion XP events</h2>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={orderedMode}
                onChange={(event) => setOrderedMode(event.target.checked)}
              />
              ordered-event mode
            </label>
          </div>

          {orderedMode ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {MINION_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => addOrderedEvent(type)}
                  >
                    + {type}
                  </button>
                ))}
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs text-red-500"
                  onClick={() => setOrderedEvents([])}
                >
                  clear
                </button>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-xs">
                {orderedEvents.map((event, index) => (
                  <li key={event.event_id}>
                    {event.minion_type} ({event.recipient_count} recipient
                    {event.recipient_count > 1 ? "s" : ""}){" "}
                    <button
                      type="button"
                      className="text-red-500"
                      onClick={() =>
                        setOrderedEvents((previous) =>
                          previous.filter((_, i) => i !== index),
                        )
                      }
                    >
                      remove
                    </button>
                  </li>
                ))}
                {orderedEvents.length === 0 && (
                  <li className="list-none text-muted-foreground">
                    No events yet — add minions in kill order.
                  </li>
                )}
              </ol>
              <p className="text-xs text-muted-foreground">
                Events use the recipient count set at the moment they are added.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {MINION_TYPES.map((type) => (
                <label key={type} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {type}
                    {config ? (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        ({config.minion_base_xp[type]} XP base)
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="w-24 rounded border bg-transparent px-2 py-1"
                    value={counts[type]}
                    onChange={(event) =>
                      setCounts((previous) => ({
                        ...previous,
                        [type]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Counts are expanded to ordered events (melee → caster → cannon → super).
              </p>
            </div>
          )}

          <button
            type="button"
            className="rounded border px-3 py-1 text-sm font-medium disabled:opacity-50"
            disabled={busy || events.length === 0}
            onClick={runSimulation}
          >
            {busy ? "Calculating…" : `Calculate (${events.length} events)`}
          </button>
          {simError && <p className="text-xs text-red-500">{simError}</p>}
        </div>
      </section>

      {result && (
        <section className="space-y-4">
          <div className="grid gap-3 rounded border p-4 sm:grid-cols-4">
            <Stat label="Ending level" value={String(result.ending_level)} />
            <Stat label="Cumulative XP" value={result.ending_cumulative_xp} />
            <Stat label="XP into current level" value={result.xp_within_current_level} />
            <Stat
              label="XP to next level"
              value={result.xp_to_next_level ?? "— (level cap)"}
            />
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded border border-amber-500/60 p-3 text-xs">
              <p className="mb-1 font-semibold">Warnings</p>
              <ul className="list-disc space-y-1 pl-4">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {result.level_up_events.length > 0 && (
            <div className="rounded border p-3 text-xs">
              <p className="mb-1 font-semibold">Level-ups</p>
              <ul className="list-disc pl-4">
                {result.level_up_events.map((levelUp) => (
                  <li key={`${levelUp.event_id}-${levelUp.new_level}`}>
                    Level {levelUp.new_level} on event{" "}
                    <code>{levelUp.event_id}</code> at{" "}
                    {levelUp.cumulative_xp_at_level_up} cumulative XP
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b">
                  <th className="p-2">#</th>
                  <th className="p-2">Event</th>
                  <th className="p-2">Base</th>
                  <th className="p-2">Share ×</th>
                  <th className="p-2">Awarded</th>
                  <th className="p-2">Cumulative</th>
                  <th className="p-2">Level</th>
                  <th className="p-2">Rules / caveats</th>
                </tr>
              </thead>
              <tbody>
                {result.event_ledger.map((entry, index) => (
                  <tr key={entry.event_id} className="border-b align-top">
                    <td className="p-2">{index + 1}</td>
                    <td className="p-2">
                      <code>{entry.event_id}</code>
                      <div className="text-muted-foreground">{entry.detail}</div>
                    </td>
                    <td className="p-2">{entry.base_xp}</td>
                    <td className="p-2">{entry.share_multiplier ?? "—"}</td>
                    <td className="p-2">
                      {entry.awarded_xp}
                      {entry.discarded_at_cap_xp !== "0" && (
                        <div className="text-amber-600">
                          −{entry.discarded_at_cap_xp} at cap
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      {entry.cumulative_before} → {entry.cumulative_after}
                    </td>
                    <td className="p-2">
                      {entry.level_before === entry.level_after
                        ? entry.level_before
                        : `${entry.level_before} → ${entry.level_after}`}
                    </td>
                    <td className="p-2">
                      <div>{entry.rule_ids.join(", ")}</div>
                      {entry.caveats.map((caveat) => (
                        <div key={caveat} className="text-amber-600">
                          {caveat}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded border p-3 text-xs">
            <p className="mb-1 font-semibold">Applied rules and sources</p>
            <ul className="space-y-2">
              {result.applied_rules.map((rule) => (
                <li key={rule.rule_id}>
                  <code>{rule.rule_id}</code> — {rule.description ?? ""}{" "}
                  {rule.value_repr ? <em>({rule.value_repr})</em> : null}{" "}
                  <span className="text-muted-foreground">
                    [{rule.status}
                    {rule.confidence ? `, ${rule.confidence} confidence` : ""}
                    {rule.effective_patch ? `, effective ${rule.effective_patch}` : ""}]
                  </span>
                  {rule.sources?.map((source) => (
                    <div key={source.location} className="pl-4 text-muted-foreground">
                      {source.name} — {source.location}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <WaveBreakpointsSection />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
