// ---------------------------------------------------------------------------
// Admin · Public Daily format — which format OFFICIAL Daily runs play.
//
// Not an app_settings switch: the backend owns this setting
// (`/api/daily-run/admin/public-format`, owner-only). The server enforces
// every rule — a change takes effect on a future UTC day, the request repeats
// `<format>@<date>` as its confirmation, a reason is required, the log is
// append-only, and a format this release cannot serve (Three Acts V2 today)
// is refused. This panel only states those rules and shows the server's
// answer; it never assumes a change was saved.
//
// Independent of Creator Replay: admin takes choose their own format there,
// and nothing here reads or changes it.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DAILY_FORMAT_LABEL,
  fetchPublicFormat,
  isDailyFormatId,
  schedulePublicFormat,
  type DailyFormatId,
  type PublicFormatState,
} from "@/lib/daily-challenge/run/dailyFormatAdmin";

export function PublicDailyFormatControl() {
  const [state, setState] = useState<PublicFormatState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [format, setFormat] = useState<DailyFormatId>("classic_v1");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await fetchPublicFormat();
      setState(next);
      setEffectiveDate((d) => d || next.earliestEffectiveDate);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unable to load the public Daily format.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refusal = state?.formats.find((f) => f.id === format)?.publishRefusal ?? null;
  const expected = `${format}@${effectiveDate}`;
  const canSubmit = !!state && !busy && !refusal && !!effectiveDate
    && effectiveDate >= state.earliestEffectiveDate && reason.trim().length > 0 && confirm === expected;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setResult(null);
    try {
      const next = await schedulePublicFormat({ format, effectiveDate, confirm, reason: reason.trim() });
      setState(next);
      setConfirm("");
      setReason("");
      setResult({ ok: true, message: `${DAILY_FORMAT_LABEL[format]} scheduled from ${effectiveDate} (UTC).` });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Nothing was changed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4" data-testid="public-daily-format">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden /> Public Daily format
        </h2>
        <p className="text-xs text-muted-foreground">
          The format every player's official Daily plays. Changes take effect from a
          future UTC day, so today's Daily — started or not — keeps its format, and
          every run keeps the format it started with. Admin takes in Creator Replay
          are separate and never change this.
        </p>
      </div>

      {loadError && (
        <p role="alert" className="mt-3 text-xs text-destructive" data-testid="public-daily-format-error">
          {loadError}
        </p>
      )}
      {!state && !loadError && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading…
        </p>
      )}

      {state && (
        <div className="mt-3 space-y-3 text-xs">
          <p data-testid="public-daily-format-current">
            Today ({state.today} UTC), public players get{" "}
            <strong>{DAILY_FORMAT_LABEL[state.officialRunsPlay]}</strong>.
            {" "}Official runs today:{" "}
            {Object.keys(state.officialRunsToday).length
              ? Object.entries(state.officialRunsToday)
                .map(([id, n]) => `${n} ${isDailyFormatId(id) ? DAILY_FORMAT_LABEL[id] : id}`).join(", ")
              : "none yet"}.
          </p>

          {state.scheduled.length > 0 && (
            <ul className="space-y-1" data-testid="public-daily-format-scheduled">
              {state.scheduled.map((c) => (
                <li key={c.changeId}>
                  Scheduled: <strong>{DAILY_FORMAT_LABEL[c.format]}</strong> from {c.effectiveDate} — {c.reason}
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="public-format-select" className="text-xs font-semibold">Format</Label>
              <select
                id="public-format-select"
                className="w-full rounded-md border bg-background p-2 text-foreground"
                value={format}
                disabled={busy}
                onChange={(e) => { if (isDailyFormatId(e.target.value)) setFormat(e.target.value); setConfirm(""); }}
              >
                {state.formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}{f.publishRefusal ? " (not publishable in this release)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="public-format-date" className="text-xs font-semibold">From (UTC day)</Label>
              <input
                id="public-format-date"
                type="date"
                className="w-full rounded-md border bg-background p-2 text-foreground"
                min={state.earliestEffectiveDate}
                value={effectiveDate}
                disabled={busy}
                onChange={(e) => { setEffectiveDate(e.target.value); setConfirm(""); }}
              />
            </div>
          </div>

          {refusal && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300"
               data-testid="public-daily-format-refusal">
              {refusal.message}
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="public-format-reason" className="text-xs font-semibold">Reason (recorded)</Label>
            <textarea
              id="public-format-reason"
              className="w-full rounded-md border bg-background p-2 text-foreground"
              rows={2}
              maxLength={500}
              value={reason}
              disabled={busy || !!refusal}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="public-format-confirm" className="text-xs font-semibold">
              Type <code>{expected}</code> to confirm
            </Label>
            <input
              id="public-format-confirm"
              className="w-full rounded-md border bg-background p-2 font-mono text-foreground"
              value={confirm}
              autoComplete="off"
              disabled={busy || !!refusal}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={() => void submit()} disabled={!canSubmit} data-testid="public-daily-format-submit">
            {busy ? "Scheduling…" : "Schedule change"}
          </Button>
          {result && (
            <p role={result.ok ? "status" : "alert"}
               className={result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}
               data-testid="public-daily-format-result">
              {result.message}
            </p>
          )}

          <details>
            <summary className="cursor-pointer text-muted-foreground">Change log ({state.history.length})</summary>
            {state.history.length === 0
              ? <p className="mt-1 text-muted-foreground">No changes — the public Daily has always been {DAILY_FORMAT_LABEL.classic_v1}.</p>
              : (
                <ul className="mt-1 space-y-1" data-testid="public-daily-format-history">
                  {state.history.map((c) => (
                    <li key={c.changeId}>
                      #{c.changeId} · {DAILY_FORMAT_LABEL[c.format]} from {c.effectiveDate} · set{" "}
                      {c.requestedAt ? new Date(c.requestedAt).toLocaleString() : "—"} · {c.reason}
                    </li>
                  ))}
                </ul>
              )}
          </details>
        </div>
      )}
    </section>
  );
}
