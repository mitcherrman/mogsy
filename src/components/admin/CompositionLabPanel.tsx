// ---------------------------------------------------------------------------
// Admin · Daily Composition Lab (Creator Replay).
//
// Sample Daily compositions without gameplay, for content and balance review.
// The date's actual composition, or reproducible experimental variations;
// every sample shows its questions in playing order and the whole batch
// downloads as one CSV (one row per graded answer). Read-only on the server:
// nothing here changes the public Daily, its schedule or any run.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  LAB_COUNTS,
  choicesOf,
  downloadCsv,
  generateSamples,
  type LabBatch,
  type LabCount,
  type LabMode,
  type LabSample,
} from "@/lib/daily-challenge/run/compositionLab";

const todayUtc = () => new Date().toISOString().slice(0, 10);

function Counts({ label, counts }: { label: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  return (
    <p className="text-xs">
      <span className="font-semibold">{label}:</span>{" "}
      {entries.map(([k, n]) => `${k} ${n}`).join(" · ")}
    </p>
  );
}

function SampleCard({ sample }: { sample: LabSample }) {
  const [open, setOpen] = useState(false);
  const s = sample.summary;
  const quotasUnmet = s.quotas_unmet.length;
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="lab-sample">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <code className="break-all text-xs" data-testid="lab-sample-id">{sample.sample_id}</code>
        <span className={`text-xs ${sample.status === "composed" && !s.unresolved ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
          {sample.status === "composed" ? `${s.answers} answers${s.unresolved ? ` · ${s.unresolved} unresolved` : ""}` : "could not compose"}
        </span>
      </div>
      {sample.status === "composed" ? (
        <div className="space-y-1" data-testid="lab-sample-summary">
          <Counts label="Interactions" counts={s.interactions} />
          <Counts label="Acts" counts={s.acts} />
          <Counts label="Difficulty" counts={s.difficulty} />
          <p className="text-xs">
            <span className="font-semibold">Families:</span> {Object.keys(s.families).length} distinct ·{" "}
            {Object.entries(s.families).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(" · ")}
            {Object.keys(s.families).length > 6 ? " …" : ""}
          </p>
          <p className="text-xs">
            <span className="font-semibold">Repeats:</span> {s.duplicate_refs} duplicate questions · {s.duplicate_subjects} repeated subjects
            {typeof s.refs_shared_with_other_samples === "number" ? ` · ${s.refs_shared_with_other_samples} shared with other samples` : ""}
          </p>
          <p className="text-xs">
            <span className="font-semibold">Quotas:</span>{" "}
            {Object.entries(s.quotas).map(([k, n]) => `${k} ${n}`).join(" · ") || "none"}
            {quotasUnmet ? ` · ${quotasUnmet} unmet` : ""}
          </p>
        </div>
      ) : (
        <p className="text-xs text-destructive">{s.shortages.length} slot shortage(s) — see the CSV/JSON for detail.</p>
      )}
      {sample.status === "composed" && (
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} data-testid="lab-view-questions">
          {open ? "Hide questions" : "View questions"}
        </Button>
      )}
      {open && (
        <ol className="space-y-2 text-xs" data-testid="lab-question-list">
          {sample.rows.map((r) => (
            <li key={r.answer_index} className="rounded border p-2">
              <p className="text-muted-foreground">
                #{r.answer_index} · {r.act ? `${r.set_id} · ${r.difficulty_band} · ${r.timer_seconds}s` : `Meta Reflex card ${r.challenge_index + 1}`} · {r.interaction} · {r.family}
                {r.resolution !== "exact" ? ` · ${r.resolution}` : ""}
              </p>
              <p className="font-medium">{r.prompt}</p>
              <p>{choicesOf(r).join(" / ")}</p>
              <p className="text-emerald-700 dark:text-emerald-400">
                Answer: {r.correct_answer}
                {r.mr_left_display && r.mr_right_display ? ` (${r.mr_left_display} vs ${r.mr_right_display})` : ""}
              </p>
              {r.resolution === "unresolved" && <p className="text-destructive">{r.resolution_note}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function CompositionLabPanel() {
  const [mode, setMode] = useState<LabMode>("actual");
  const [date, setDate] = useState(todayUtc);
  const [count, setCount] = useState<LabCount>(5);
  const [sampleId, setSampleId] = useState("");
  const [batch, setBatch] = useState<LabBatch | null>(null);
  const [busy, setBusy] = useState<"generate" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "generate" | "shuffle" | "reproduce") {
    setBusy("generate");
    setError(null);
    try {
      const next = kind === "reproduce"
        ? await generateSamples({ sampleId: sampleId.trim() })
        : await generateSamples({
          date, mode, count,
          ...(mode === "variant" ? (kind === "shuffle" ? { shuffle: true } : { token: batch?.request.mode === "variant" && batch.request.date === date && batch.request.token ? batch.request.token : "base" }) : {}),
        });
      setBatch(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate samples.");
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    if (!batch) return;
    setBusy("csv");
    setError(null);
    try {
      await downloadCsv(batch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download the CSV.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border p-5" data-testid="composition-lab">
      <div>
        <h2 className="text-lg font-semibold">Composition Lab · Three Acts Daily V2</h2>
        <p className="text-sm text-muted-foreground">
          Generate complete Daily compositions without playing them, inspect every question in playing order, and
          download the batch as one CSV (one row per answer, with answers). Nothing here changes the public Daily,
          its schedule or any run.
        </p>
      </div>

      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Composition</legend>
        {(["actual", "variant"] as const).map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input type="radio" name="lab-mode" value={m} checked={mode === m} onChange={() => setMode(m)} data-testid={`lab-mode-${m}`} />
            {m === "actual" ? "Actual date composition" : "Experimental variations"}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="lab-date" className="text-xs font-semibold">UTC date</Label>
          <input id="lab-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border bg-background p-2 text-foreground" />
        </div>
        {mode === "variant" && (
          <div className="space-y-1">
            <Label htmlFor="lab-count" className="text-xs font-semibold">Sample count</Label>
            <select id="lab-count" value={count} onChange={(e) => setCount(Number(e.target.value) as LabCount)}
              className="w-full rounded-md border bg-background p-2 text-foreground">
              {LAB_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void run("generate")} disabled={busy !== null || !date} data-testid="lab-generate">
          {busy === "generate" ? "Generating…" : "Generate samples"}
        </Button>
        {mode === "variant" && (
          <Button variant="outline" onClick={() => void run("shuffle")} disabled={busy !== null || !date} data-testid="lab-shuffle">
            Shuffle samples
          </Button>
        )}
        <Button variant="outline" onClick={() => void exportCsv()} disabled={busy !== null || !batch} data-testid="lab-download">
          {busy === "csv" ? "Preparing CSV…" : "Download CSV"}
        </Button>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Reproduce a sample by ID</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <input value={sampleId} onChange={(e) => setSampleId(e.target.value)} placeholder="tav2.2026-10-23.base.1"
            aria-label="Sample ID" className="min-w-0 flex-1 rounded-md border bg-background p-2 font-mono text-foreground" />
          <Button size="sm" variant="outline" disabled={busy !== null || !sampleId.trim()} onClick={() => void run("reproduce")} data-testid="lab-reproduce">
            Load sample
          </Button>
        </div>
      </details>

      {error && <p role="alert" className="text-sm text-destructive" data-testid="lab-error">{error}</p>}

      {batch && (
        <div className="space-y-3" data-testid="lab-batch">
          <p className="text-xs text-muted-foreground">
            {batch.samples.length} sample(s){batch.request.token ? ` · variation token ${batch.request.token}` : ""} · bank{" "}
            {batch.samples[0]?.bank_revision} · {batch.batch_refs_in_multiple_samples} question(s) appear in more than one sample.
            Quiz questions are exact; Order Forge sets are exact (display order sampled); Meta Reflex cards are samples
            drawn from the day&apos;s families.
          </p>
          {batch.samples.map((s) => <SampleCard key={s.sample_id} sample={s} />)}
        </div>
      )}
    </section>
  );
}
