/**
 * PLAY1 — the Director. Utilitarian on purpose: cohort identity, the
 * authoritative scene/build/revision, one Reveal/Advance control, and the
 * tester roster with progress and feedback.
 *
 * The host never writes state directly. "Advance" asks the database to move
 * from the revision this console is SHOWING to the manifest's next position;
 * if anyone (another tab, a double click) moved it first, the call is refused
 * as stale and the console adopts the current row instead.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findScene, nextPosition, PLAY1_MANIFEST, resolveManifest } from "../manifest";
import { useDirectorState } from "../useDirectorState";
import {
  advanceDirector, createCohort, fetchRoster, listCohorts, setCohortStatus, subscribeRosterChanges,
  type CohortRow, type RosterRow,
} from "../api";

const ROSTER_POLL_MS = 15_000;

export function PlaytestDirectorConsole() {
  const [cohorts, setCohorts] = useState<CohortRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadCohorts = useCallback(async () => {
    try {
      const rows = await listCohorts();
      setCohorts(rows);
      setSelectedId((cur) => cur ?? rows.find((c) => c.status === "open")?.id ?? rows[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void loadCohorts(); }, [loadCohorts]);

  const selected = cohorts?.find((c) => c.id === selectedId) ?? null;

  return (
    <div data-testid="playtest-director" className="space-y-4 text-sm">
      <section className="space-y-2 rounded border p-3">
        <h2 className="font-semibold">Cohorts</h2>
        {cohorts === null ? <p className="text-muted-foreground">Loading…</p> : (
          <ul className="space-y-1">
            {cohorts.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2">
                  <input type="radio" name="cohort" checked={c.id === selectedId} onChange={() => setSelectedId(c.id)} />
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.status} · {c.manifest_id} v{c.manifest_version}</span>
                </label>
              </li>
            ))}
            {cohorts.length === 0 && <li className="text-muted-foreground">No cohorts yet.</li>}
          </ul>
        )}
        <form className="flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          try {
            const created = await createCohort(name.trim(), PLAY1_MANIFEST.id, PLAY1_MANIFEST.version,
              PLAY1_MANIFEST.scenes[0].id);
            setName("");
            setSelectedId(created.id);
            await loadCohorts();
          } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New cohort name" className="h-8" />
          <Button type="submit" size="sm" data-testid="playtest-create-cohort">Create cohort</Button>
        </form>
      </section>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {selected && <CohortDirector key={selected.id} cohort={selected} onChanged={loadCohorts} />}
    </div>
  );
}

function CohortDirector({ cohort, onChanged }: { cohort: CohortRow; onChanged: () => Promise<void> }) {
  const manifest = resolveManifest(cohort.manifest_id, cohort.manifest_version);
  const { state, accept, refresh, channel } = useDirectorState(cohort.id);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);

  const loadRoster = useCallback(async () => {
    try { setRoster(await fetchRoster(cohort.id)); } catch { /* keep last roster */ }
  }, [cohort.id]);

  useEffect(() => {
    void loadRoster();
    const unsubscribe = subscribeRosterChanges(cohort.id, () => { void loadRoster(); });
    const poll = setInterval(() => { void loadRoster(); }, ROSTER_POLL_MS);
    return () => { unsubscribe(); clearInterval(poll); };
  }, [cohort.id, loadRoster]);

  const inviteUrl = `${window.location.origin}/playtest/${cohort.invite_slug}`;
  const scene = manifest && state ? findScene(manifest, state.sceneId) : null;
  const next = manifest && state ? nextPosition(manifest, state) : null;
  const nextScene = manifest && next ? findScene(manifest, next.sceneId) : null;
  const advanceLabel = !next ? "End of manifest"
    : next.sceneId === state?.sceneId ? `Reveal build ${next.buildStep}`
    : nextScene?.kind === "gameplay" ? `Release gameplay: ${nextScene.id}`
    : `Advance to ${next.sceneId}`;

  return (
    <section data-testid="playtest-cohort-director" className="space-y-3 rounded border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{cohort.name}</h2>
        <Button size="sm" variant="outline" onClick={async () => {
          await setCohortStatus(cohort.id, cohort.status === "open" ? "closed" : "open");
          await onChanged();
        }}>{cohort.status === "open" ? "Close enrollment" : "Reopen enrollment"}</Button>
      </div>
      <p className="break-all text-xs">Invite: <code data-testid="playtest-invite-url">{inviteUrl}</code></p>
      {!manifest && <p className="text-destructive">Unknown manifest {cohort.manifest_id} v{cohort.manifest_version}.</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Scene</dt>
        <dd data-testid="playtest-director-scene">{state ? `${state.sceneId} (${scene?.kind ?? "unknown"})` : "…"}</dd>
        <dt className="text-muted-foreground">Build step</dt>
        <dd data-testid="playtest-director-build">{state?.buildStep ?? "…"}</dd>
        <dt className="text-muted-foreground">Revision</dt>
        <dd data-testid="playtest-director-revision">{state?.revision ?? "…"}</dd>
        <dt className="text-muted-foreground">Realtime</dt>
        <dd>{channel}</dd>
      </dl>

      <div className="flex items-center gap-2">
        <Button data-testid="playtest-advance" disabled={!state || !next || busy} onClick={async () => {
          if (!state || !next) return;
          setBusy(true);
          setNotice(null);
          try {
            const result = await advanceDirector(cohort.id, state.revision, next);
            accept(result.state);
            if (!result.applied) {
              setNotice(`Stale click — state had already moved to revision ${result.state.revision}. Showing current state.`);
              await refresh();
            }
          } catch (e) {
            setNotice(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}>{advanceLabel}</Button>
        {notice && <span data-testid="playtest-advance-notice" className="text-xs text-muted-foreground">{notice}</span>}
      </div>

      <table data-testid="playtest-roster" className="w-full text-left text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1">Tester</th><th>Status</th><th>Daily</th><th>Feedback</th><th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <tr key={r.enrollment_id} data-testid="playtest-roster-row" className="border-t align-top">
              <td className="py-1">{r.display_name ?? r.user_id.slice(0, 8)}</td>
              <td>{r.status}</td>
              <td>{r.daily_run_id
                ? `${r.daily_plan_date} · ${r.daily_run_status} · stage ${r.daily_stage_index ?? "–"} ${r.daily_stage_status ?? ""}`
                : "—"}</td>
              <td>{r.feedback.length
                ? r.feedback.map((f) => `${f.prompt_key}: ${String((f.response as { choice?: unknown }).choice ?? JSON.stringify(f.response))}`).join("; ")
                : "—"}</td>
              <td>{r.progress_updated_at ? new Date(r.progress_updated_at).toLocaleTimeString() : "—"}</td>
            </tr>
          ))}
          {roster.length === 0 && <tr><td colSpan={5} className="py-2 text-muted-foreground">No testers yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}
