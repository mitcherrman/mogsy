// Wave/XP authority timeline (MECH1 Phase 6). Thin client over
// GET /api/mechanics/xp/wave-xp-authority — no wave/XP math lives here.
//
// Goal: make "wave 9" concrete — game time, cannon status, minion
// composition, and any solo/duo level breakpoint, at a glance.
//
// `WaveBreakpointBadge` and `WaveTimelineRow` are exported so a future quiz
// explanation can reuse a single wave's fragment (e.g. "Wave 2 — 3 melee —
// Duo Level 2") without re-implementing this table.

import { Fragment, useEffect, useState } from "react";
import { WaveXpAuthorityResult, WaveXpRow, fetchWaveXpAuthority } from "./api";

export function WaveBreakpointBadge({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <span className="inline-block rounded-full bg-emerald-600/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
      {note}
    </span>
  );
}

export function WaveTimelineRow({
  row,
  mode,
  selected,
  onSelect,
}: {
  row: WaveXpRow;
  mode: "solo" | "duo";
  selected: boolean;
  onSelect: () => void;
}) {
  const note = mode === "solo" ? row.solo_level_breakpoint_note : row.duo_level_breakpoint_note;
  const cumulative = mode === "solo" ? row.solo_cumulative_xp : row.duo_cumulative_xp_per_player;
  const waveXp = mode === "solo" ? row.solo_wave_xp : row.duo_wave_xp_per_player;

  return (
    <tr
      className={`cursor-pointer border-b text-xs ${
        row.is_cannon_wave ? "bg-amber-500/10" : ""
      } ${note ? "outline outline-1 outline-emerald-500/40" : ""} ${
        selected ? "bg-primary/10" : ""
      }`}
      onClick={onSelect}
      data-testid={`wave-row-${row.wave_number}`}
    >
      <td className="p-2 font-semibold">
        {row.wave_number}
        {row.wave_number === 1 && (
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">first wave</span>
        )}
      </td>
      <td className="p-2">{row.spawn_time_display}</td>
      <td className="p-2">
        {row.is_cannon_wave ? (
          <span className="rounded bg-amber-500/30 px-1.5 py-0.5 font-semibold text-amber-600">
            cannon
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="p-2">
        {row.melee_count} melee, {row.caster_count} caster
        {row.cannon_count > 0 ? `, ${row.cannon_count} cannon` : ""}
      </td>
      <td className="p-2">{waveXp}</td>
      <td className="p-2 font-medium">{cumulative}</td>
      <td className="p-2">
        <WaveBreakpointBadge note={note} />
      </td>
    </tr>
  );
}

export default function WaveXpAuthorityTimeline() {
  const [patch, setPatch] = useState("26.15");
  const [waveCount, setWaveCount] = useState(15);
  const [mode, setMode] = useState<"solo" | "duo" | "both">("both");
  const [data, setData] = useState<WaveXpAuthorityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedWave, setSelectedWave] = useState<number | null>(null);

  const load = () => {
    setBusy(true);
    setError(null);
    fetchWaveXpAuthority({ patch, waveCount })
      .then((result) => setData(result))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstCannonWave = data?.rows.find((r) => r.is_cannon_wave)?.wave_number;
  const selectedRow = data?.rows.find((r) => r.wave_number === selectedWave) ?? null;

  return (
    <section className="space-y-4 rounded border p-4" data-testid="wave-xp-authority">
      <header>
        <h2 className="text-base font-semibold">Wave / XP timeline</h2>
        <p className="text-xs text-muted-foreground">
          Canonical wave timing, composition, and solo/duo XP in one pass —
          GET /api/mechanics/xp/wave-xp-authority. Same authority module the
          calculator and future quiz questions will read from.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="block">
          Patch
          <input
            className="mt-1 w-24 rounded border bg-transparent px-2 py-1"
            value={patch}
            onChange={(e) => setPatch(e.target.value)}
          />
        </label>
        <label className="block">
          Waves shown
          <input
            type="number"
            min={1}
            max={30}
            className="mt-1 w-20 rounded border bg-transparent px-2 py-1"
            value={waveCount}
            onChange={(e) => setWaveCount(Number(e.target.value))}
          />
        </label>
        <div className="flex rounded border text-xs">
          {(["solo", "duo", "both"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`px-3 py-1 ${mode === m ? "bg-primary/20 font-semibold" : ""}`}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <button type="button" className="rounded border px-3 py-1 text-sm" disabled={busy} onClick={load}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">Could not load: {error}. Is the backend running?</p>}

      {data && (
        <>
          {firstCannonWave && (
            <p className="text-xs text-muted-foreground">
              First cannon wave: <strong>wave {firstCannonWave}</strong>
            </p>
          )}

          <div className="overflow-x-auto rounded border">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-xs">
                  <th className="p-2">Wave</th>
                  <th className="p-2">Time</th>
                  <th className="p-2">Cannon</th>
                  <th className="p-2">Composition</th>
                  <th className="p-2">Wave XP</th>
                  <th className="p-2">Cumulative</th>
                  <th className="p-2">Level breakpoint</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) =>
                  mode === "both" ? (
                    <Fragment key={row.wave_number}>
                      <WaveTimelineRow
                        key={`${row.wave_number}-solo`}
                        row={row}
                        mode="solo"
                        selected={selectedWave === row.wave_number}
                        onSelect={() => setSelectedWave(row.wave_number)}
                      />
                      <tr className="border-b bg-muted/20 text-xs">
                        <td className="p-2 pl-6 text-muted-foreground" colSpan={4}>
                          duo
                        </td>
                        <td className="p-2">{row.duo_wave_xp_per_player}</td>
                        <td className="p-2 font-medium">{row.duo_cumulative_xp_per_player}</td>
                        <td className="p-2">
                          <WaveBreakpointBadge note={row.duo_level_breakpoint_note} />
                        </td>
                      </tr>
                    </Fragment>
                  ) : (
                    <WaveTimelineRow
                      key={row.wave_number}
                      row={row}
                      mode={mode}
                      selected={selectedWave === row.wave_number}
                      onSelect={() => setSelectedWave(row.wave_number)}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>

          {selectedRow && (
            <div className="rounded border p-3 text-xs" data-testid="wave-xp-authority-detail">
              <p className="text-sm font-semibold">Wave {selectedRow.wave_number} detail</p>
              <p>{selectedRow.spawn_time_display} — {selectedRow.is_cannon_wave ? "cannon wave" : "no cannon"}</p>
              <p>
                {selectedRow.melee_count} melee, {selectedRow.caster_count} caster
                {selectedRow.cannon_count > 0 ? `, ${selectedRow.cannon_count} cannon` : ""}
              </p>
              <p>
                Solo: {selectedRow.solo_wave_xp} this wave, {selectedRow.solo_cumulative_xp} cumulative
                {selectedRow.solo_level_breakpoint_note ? ` — ${selectedRow.solo_level_breakpoint_note}` : ""}
              </p>
              <p>
                Duo (per player): {selectedRow.duo_wave_xp_per_player} this wave,{" "}
                {selectedRow.duo_cumulative_xp_per_player} cumulative
                {selectedRow.duo_level_breakpoint_note ? ` — ${selectedRow.duo_level_breakpoint_note}` : ""}
              </p>
            </div>
          )}

          {data.warnings.length > 0 && (
            <details className="rounded border p-3 text-xs">
              <summary className="cursor-pointer font-semibold">Warnings ({data.warnings.length})</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
