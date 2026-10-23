/**
 * Content Creator — generation, previews, downloads, failures and history.
 *
 * Previews are object URLs of the EXACT blobs that go into the ZIP and the
 * single-PNG downloads; nothing is re-rendered for display, so a preview is the
 * file the operator will publish.
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  History,
  ImageDown,
  LayoutGrid,
  Loader2,
  Play,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { downloadBlob } from "@/lib/quiz-screenshot/deliverExport";
import type { HistoryEntry } from "@/lib/content-creator/history";
import { linkedContactSheet, type CreatorImage, type CreatorRunView } from "@/lib/content-creator/runView";
import { cn } from "@/lib/utils";

export type GenerationProgress = { done: number; total: number; runId: string; label: string } | null;

const STATUS_TONE: Record<string, string> = {
  succeeded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  "succeeded-with-warnings": "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
};
const STATUS_LABEL: Record<string, string> = {
  succeeded: "Complete",
  "succeeded-with-warnings": "Complete with warnings",
  failed: "Failed or incomplete",
};

/** Object URLs for the images, owned by an effect so each one is revoked exactly once. */
function useObjectUrls(images: readonly CreatorImage[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  useEffect(() => {
    const next = new Map(images.map((i) => [i.path, URL.createObjectURL(i.blob)]));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);
  return urls;
}

function flatName(runId: string, path: string) {
  return `${runId}_${path.replace(/\//g, "_")}`;
}

function RunResult({ run, onZoom }: { run: CreatorRunView["runs"][number]; onZoom: (img: CreatorImage, url: string) => void }) {
  const urls = useObjectUrls(run.images);
  const openContactSheet = () => {
    const html = linkedContactSheet(run.contactSheetHtml, urls);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return (
    <div className="space-y-2" data-testid={`cc-run-${run.runId}`} data-status={run.status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold" title={run.runId}>
            {run.runId}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {run.images.length} image{run.images.length === 1 ? "" : "s"}
            {run.counts.planned !== null ? ` of ${run.counts.planned} planned` : ""}
            {run.failures.length ? ` · ${run.failures.length} failure${run.failures.length === 1 ? "" : "s"}` : ""}
            {run.skipped.length ? ` · ${run.skipped.length} skipped` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          {run.manifest && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() =>
                downloadBlob(
                  new Blob([JSON.stringify(run.manifest, null, 2)], { type: "application/json" }),
                  `${run.runId}-manifest.json`,
                )
              }
              data-testid="cc-download-manifest"
            >
              <FileJson className="mr-1 h-3.5 w-3.5" /> Manifest
            </Button>
          )}
          {run.contactSheetHtml && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={openContactSheet} data-testid="cc-contact-sheet">
              <LayoutGrid className="mr-1 h-3.5 w-3.5" /> Contact sheet
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-4" data-testid="cc-previews">
        {run.images.map((img) => {
          const url = urls.get(img.path);
          if (!url) return <div key={img.path} className="aspect-square animate-pulse rounded-lg bg-muted/30" />;
          return (
            <figure key={img.path} className="group overflow-hidden rounded-lg border border-border/60 bg-black/40">
              <button type="button" className="block w-full" onClick={() => onZoom(img, url)} aria-label={`Preview ${img.path}`}>
                <img
                  src={url}
                  alt={img.path}
                  className="aspect-auto w-full object-contain"
                  data-testid="cc-preview-image"
                  data-path={`${run.runId}/${img.path}`}
                />
              </button>
              <figcaption className="flex items-center justify-between gap-1 px-1.5 py-1 text-[10px] text-muted-foreground">
                <span className="truncate" title={img.path}>
                  {img.slide ? `${img.slide.index}. ${img.slide.slug}` : img.path} · {img.width}×{img.height}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded p-0.5 hover:text-foreground"
                  aria-label={`Download ${img.path}`}
                  onClick={() => downloadBlob(img.blob, flatName(run.runId, img.path))}
                  data-testid="cc-download-png"
                >
                  <ImageDown className="h-3.5 w-3.5" />
                </button>
              </figcaption>
            </figure>
          );
        })}
      </div>
      {(run.failures.length > 0 || run.skipped.length > 0) && (
        <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px]" data-testid="cc-failures">
          {run.failures.map((f, i) => (
            <li key={`f${i}`} className="flex gap-1.5">
              <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
              <span>
                <strong>{f.state ?? ""}</strong> {f.format ? `(${f.format})` : ""} — {f.classification}: {f.message}
              </span>
            </li>
          ))}
          {run.skipped.map((s, i) => (
            <li key={`s${i}`} className="flex gap-1.5 text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                <strong>{s.state}</strong> skipped — {s.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OutputPanel({
  canGenerate,
  planErrors,
  cardCount,
  zipFileName,
  generating,
  progress,
  view,
  onGenerate,
  onCancel,
  history,
  historyAvailable,
  onOpenHistory,
  onDeleteHistory,
  supportNotes,
}: {
  canGenerate: boolean;
  planErrors: string[];
  cardCount: number;
  zipFileName: string;
  generating: boolean;
  progress: GenerationProgress;
  view: CreatorRunView | null;
  onGenerate: () => void;
  onCancel: () => void;
  history: HistoryEntry[];
  historyAvailable: boolean;
  onOpenHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  supportNotes: string[];
}) {
  const [zoom, setZoom] = useState<{ img: CreatorImage; url: string } | null>(null);
  const pct = progress && progress.total ? Math.round((100 * progress.done) / progress.total) : 0;

  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border/70 bg-card/60 p-3" data-testid="cc-output">
      {supportNotes.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-200" data-testid="cc-browser-note">
          {supportNotes.join(" ")}
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold" data-testid="cc-plan-summary">
              {cardCount > 0 ? `${cardCount} image${cardCount === 1 ? "" : "s"} → ${zipFileName}` : "Nothing to generate yet"}
            </p>
            <p className="text-[10px] text-muted-foreground">Rendered in this browser with the Content Factory's own templates and QA.</p>
          </div>
          {generating ? (
            <Button variant="destructive" size="sm" onClick={onCancel} data-testid="cc-cancel">
              <Square className="mr-1.5 h-3.5 w-3.5" /> Cancel
            </Button>
          ) : (
            <Button size="sm" onClick={onGenerate} disabled={!canGenerate} data-testid="cc-generate">
              <Play className="mr-1.5 h-3.5 w-3.5" /> Generate
            </Button>
          )}
        </div>
        {planErrors.length > 0 && !generating && (
          <ul className="space-y-0.5 text-[11px] text-muted-foreground" data-testid="cc-plan-errors">
            {planErrors.map((e) => (
              <li key={e}>• {e}</li>
            ))}
          </ul>
        )}
        {generating && progress && (
          <div className="space-y-1" data-testid="cc-progress">
            <Progress value={pct} className="h-1.5" />
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {progress.done}/{progress.total} · {progress.label}
            </p>
          </div>
        )}
      </div>

      {view && (
        <div className="space-y-3" data-testid="cc-result" data-status={view.status}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[view.status])}
              data-testid="cc-result-status"
            >
              {view.status === "failed" ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {STATUS_LABEL[view.status]}
              {view.aborted ? ` — ${view.aborted}` : ""}
            </span>
            <Button size="sm" variant="secondary" onClick={() => downloadBlob(view.archive.blob, view.archive.fileName)} data-testid="cc-download-zip">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download ZIP
            </Button>
          </div>
          {view.runs.map((run) => (
            <RunResult key={run.runId} run={run} onZoom={(img, url) => setZoom({ img, url })} />
          ))}
        </div>
      )}

      <div className="space-y-1.5" data-testid="cc-history">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          <History className="h-3.5 w-3.5" /> Previous runs <span className="font-normal text-muted-foreground">(this browser)</span>
        </h3>
        {!historyAvailable ? (
          <p className="text-[11px] text-muted-foreground">This browser is not keeping local history (private window or storage disabled).</p>
        ) : history.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Runs you generate are kept here.</p>
        ) : (
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1 text-[11px]" data-testid="cc-history-row">
                <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onOpenHistory(h.id)}>
                  {h.title}
                </button>
                <span className={cn("rounded-full border px-1.5 text-[10px]", STATUS_TONE[h.status] ?? "")}>{h.captured} img</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{new Date(h.createdAt).toLocaleString()}</span>
                <button type="button" aria-label={`Delete ${h.title}`} onClick={() => onDeleteHistory(h.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={zoom !== null} onOpenChange={(open) => !open && setZoom(null)}>
        <DialogContent className="max-w-4xl">
          <DialogTitle className="text-sm">{zoom?.img.path}</DialogTitle>
          {zoom && <img src={zoom.url} alt={zoom.img.path} className="max-h-[80vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
