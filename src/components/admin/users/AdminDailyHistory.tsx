import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DailyHistoryReadError, fetchDailyHistory, type DailyRunHistory, type DailyUserHistory,
} from "@/lib/admin/dailyHistoryApi";
import {
  DAILY_ENTRY_CLICKED, eventLabel, formatAccuracy, formatDuration, resolveEntrySource, runStatusLine,
  STAGE_STATE_LABELS, stageLabel, tierLabel, type EntryClick, type EntrySource,
} from "@/lib/admin/dailyHistory";

export type DailyHistoryLoad =
  | { phase: "loading" }
  | { phase: "error"; kind: DailyHistoryReadError["kind"] | "unknown"; message: string }
  | { phase: "ready"; history: DailyUserHistory; clicks: EntryClick[] | null };

const stamp = (at: string | null) => (at ? new Date(at).toLocaleString() : "not recorded");

/** Browser-side entry clicks for the runs' own sessions, under existing admin RLS. */
async function loadEntryClicks(history: DailyUserHistory): Promise<EntryClick[] | null> {
  const sessions = [...new Set(history.runs.map((r) => r.correlation.sessionId).filter((s): s is string => !!s))];
  if (sessions.length === 0) return [];
  const { data, error } = await supabase
    .from("analytics_events")
    .select("session_id,received_at,metadata")
    .eq("event_name", DAILY_ENTRY_CLICKED)
    .in("session_id", sessions.slice(0, 60))
    .limit(500);
  if (error || !Array.isArray(data)) return null;                 // unavailable, not "none"
  return data.map((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    return {
      sessionId: row.session_id ?? null,
      receivedAt: row.received_at,
      control: typeof meta?.control === "string" ? meta.control : null,
    };
  });
}

function EntryLine({ run, clicks }: { run: DailyRunHistory; clicks: EntryClick[] | null }) {
  if (clicks === null) {
    return <span>Entry source: lookup unavailable</span>;
  }
  const source: EntrySource = resolveEntrySource(run, clicks);
  return source.kind === "observed"
    ? <span data-testid="daily-entry-source">Entry (observed): {source.label}</span>
    : <span data-testid="daily-entry-source" title={source.reason}>Entry source: not recorded</span>;
}

function RunCard({ run, clicks, defaultOpen }: { run: DailyRunHistory; clicks: EntryClick[] | null; defaultOpen: boolean }) {
  const elapsed = formatDuration(run.elapsedMs);
  const source = clicks === null ? null : resolveEntrySource(run, clicks);
  return (
    <details className="rounded-lg border border-border" open={defaultOpen} data-testid="daily-run">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm">
        <span className="font-medium">{run.planDate}</span>
        <span className="text-xs text-muted-foreground">
          {run.status === "completed" ? "Completed" : "Unfinished"}
          {run.main?.score != null ? ` · Main score ${run.main.score}` : ""}
          {run.optional ? ` · Optional ${run.optional.completed}/${run.optional.total}` : ""}
        </span>
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3 text-xs">
        <p data-testid="daily-run-status">{runStatusLine(run)}</p>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Started</dt><dd>{stamp(run.createdAt)}</dd></div>
          <div><dt className="text-muted-foreground">Run finished</dt><dd>{stamp(run.completedAt)}</dd></div>
          <div>
            <dt className="text-muted-foreground">Elapsed, start to finish</dt>
            <dd data-testid="daily-run-elapsed">{elapsed ? `${elapsed} (wall clock, includes time away)` : "not recorded"}</dd>
          </div>
          <div><dt className="text-muted-foreground">Where it started</dt><dd><EntryLine run={run} clicks={clicks} /></dd></div>
        </dl>
        {source?.kind === "not_recorded" && <p className="text-muted-foreground">{source.reason}</p>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left" data-testid="daily-stages">
            <thead className="text-muted-foreground">
              <tr><th className="py-1 pr-2 font-normal">Stage</th><th className="pr-2 font-normal">Role</th><th className="pr-2 font-normal">State</th>
                <th className="pr-2 font-normal">Score</th><th className="pr-2 font-normal">Correct</th><th className="pr-2 font-normal">Answer time</th><th className="font-normal">Elapsed</th></tr>
            </thead>
            <tbody>
              {run.stages.map((s) => (
                <tr key={s.stageIndex} className="border-t border-border align-top" data-testid={`daily-stage-${s.stageIndex}`}>
                  <td className="py-1 pr-2">{s.stageIndex + 1}. {stageLabel(s.kind)}</td>
                  <td className="pr-2">{tierLabel(s.tier)}</td>
                  <td className="pr-2">{STAGE_STATE_LABELS[s.state]}{s.state === "skipped" && s.result.perfect ? " (no misses)" : ""}</td>
                  <td className="pr-2 tabular-nums">{s.result.score ?? "—"}</td>
                  <td className="pr-2 tabular-nums">{formatAccuracy(s) ?? "—"}</td>
                  <td className="pr-2 tabular-nums">{formatDuration(s.result.activeAnswerMs) ?? "—"}</td>
                  <td className="tabular-nums">{formatDuration(s.elapsedMs) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          Answer time is the summed time spent answering. Elapsed is launch to completion on the clock and includes time away.
          A dash means it was not recorded, not zero.
        </p>

        <details className="text-muted-foreground" data-testid="daily-run-technical">
          <summary className="cursor-pointer">Technical details</summary>
          <dl className="mt-2 space-y-1 break-all">
            <div><dt>Run id</dt><dd>{run.runId}</dd></div>
            <div><dt>Plan version</dt><dd>{run.planVersion}</dd></div>
            <div><dt>Recorded browser session</dt><dd>{run.correlation.sessionId ?? "none"}</dd></div>
            <div><dt>Recorded browser id</dt><dd>{run.correlation.visitorId ?? "none"}</dd></div>
            <div><dt>Stage match ids</dt><dd>{run.stages.map((s) => `${s.stageIndex + 1}: ${s.childMatchId ?? "none"}`).join(" · ")}</dd></div>
            <div><dt>Recorded events</dt><dd>{run.events.length === 0 ? "none" : run.events.map((e) => `${eventLabel(e.type)}${e.stageIndex !== null ? ` (stage ${e.stageIndex + 1})` : ""} ${stamp(e.at)}`).join(" · ")}</dd></div>
          </dl>
        </details>
      </div>
    </details>
  );
}

export function AdminDailyHistoryView({ load, isAnonymous }: { load: DailyHistoryLoad; isAnonymous: boolean }) {
  const runs = load.phase === "ready" ? load.history.runs : [];
  const clicks = load.phase === "ready" ? load.clicks : [];
  const completed = runs.filter((r) => r.status === "completed").length;
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Daily Challenge history" data-testid="admin-daily-history">
      <div className="flex items-start gap-2">
        <CalendarCheck className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
        <div>
          <h3 className="text-sm font-semibold">Daily Challenge history</h3>
          <p className="text-xs text-muted-foreground">
            The Daily Challenge as its own activity. Its stages run on the Ranked engine but are not Ranked matches, Role Challenge or More Challenges.
          </p>
        </div>
      </div>
      {isAnonymous && (
        <p className="text-xs text-muted-foreground" data-testid="daily-anonymous-note">
          Guest account: this is the history under this guest id. If the player later signed in to a different existing account, those runs stay here and are not merged.
        </p>
      )}
      {load.phase === "loading" && <p role="status" className="text-sm text-muted-foreground">Reading Daily history…</p>}
      {load.phase === "error" && (
        <p role="alert" className="text-sm text-destructive" data-testid="daily-history-error">
          {load.message} This is not evidence that the player has no Daily history.
        </p>
      )}
      {load.phase === "ready" && runs.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="daily-history-empty">No Daily Challenge runs are recorded for this account.</p>
      )}
      {load.phase === "ready" && runs.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">{runs.length} recorded run{runs.length === 1 ? "" : "s"}, {completed} completed{load.history.truncated ? " — older runs not shown" : ""}.</p>
          <div className="space-y-2">
            {runs.map((run, i) => <RunCard key={run.runId} run={run} clicks={clicks} defaultOpen={i === 0} />)}
          </div>
        </>
      )}
    </section>
  );
}

/** Wired section: loads one account's Daily history, owner-gated on the server. */
export function AdminDailyHistory({ userId, isAnonymous }: { userId: string; isAnonymous: boolean }) {
  const [load, setLoad] = useState<DailyHistoryLoad>({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ phase: "loading" });
    (async () => {
      try {
        const history = await fetchDailyHistory(userId, controller.signal);
        const clicks = await loadEntryClicks(history);
        if (!controller.signal.aborted) setLoad({ phase: "ready", history, clicks });
      } catch (error) {
        if (controller.signal.aborted) return;
        const kind = error instanceof DailyHistoryReadError ? error.kind : "unknown";
        const message = error instanceof DailyHistoryReadError ? error.message : "Daily history could not be read.";
        setLoad({ phase: "error", kind, message });
      }
    })();
    return () => controller.abort();
  }, [userId]);
  return <AdminDailyHistoryView load={load} isAnonymous={isAnonymous} />;
}
