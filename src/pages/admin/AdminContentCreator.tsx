// ---------------------------------------------------------------------------
// Admin · Content Creator — owner-only social content from the question bank.
//
// Choose questions from the real bank → pick a Content Studio format (classic,
// single-question post, answer reveal, multi-question challenge, daily
// package) → generate in THIS browser with the CC2 engine
// (`src/lib/quiz-screenshot/contentExport.ts`) → preview the exact files →
// download single PNGs or the ZIP (manifest, contact sheet, failures included).
//
// AUTHORIZATION. The route sits inside the `/admin` AdminShell, so AdminRoute
// (owner, MFA step-up) gates it; AdminAuthGate additionally requires the
// account-bound Railway admin session before any question is read. Question
// reads use the owner's own Supabase token (`quizApi` admin GETs). No admin
// key, no privileged endpoint, no write: nothing here mutates the bank.
//
// NO LOCAL SERVER. Rendering, QA, packaging and history all happen in the
// browser; the loopback Content Studio is untouched and not contacted.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { QuestionBank } from "@/components/admin/content-creator/QuestionBank";
import { Composer } from "@/components/admin/content-creator/Composer";
import { OutputPanel, type GenerationProgress } from "@/components/admin/content-creator/OutputPanel";
import { quizApi, type ReviewQuestion } from "@/lib/quiz/api";
import {
  buildCreatorRequest,
  DEFAULT_SETTINGS,
  MODE_COPY,
  type CreatorItem,
  type CreatorSettings,
} from "@/lib/content-creator/creatorState";
import { openRunHistory, type HistoryEntry, type RunHistory } from "@/lib/content-creator/history";
import { viewFromArchive, viewFromResult, type CreatorRunView } from "@/lib/content-creator/runView";
import { assessBrowserExportSupport } from "@/lib/quiz-screenshot/browserSupport";

export const ADMIN_CONTENT_CREATOR_PATH = "/admin/content-creator";

/** `?ids=1,2,3` — a Quiz Review hand-off. Numeric stored ids only. */
function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^\d{1,12}$/.test(s)).map(Number))].slice(0, 25);
}

function ContentCreatorWorkspace() {
  const [params] = useSearchParams();
  const [items, setItems] = useState<CreatorItem[]>([]);
  const [settings, setSettingsState] = useState<CreatorSettings>(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress>(null);
  const [view, setView] = useState<CreatorRunView | null>(null);
  const [history, setHistory] = useState<RunHistory | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const support = useMemo(() => assessBrowserExportSupport(), []);

  const setSettings = useCallback((next: Partial<CreatorSettings>) => setSettingsState((s) => ({ ...s, ...next })), []);

  // Local history (fails soft).
  useEffect(() => {
    let live = true;
    void openRunHistory().then(async (h) => {
      if (!live) return;
      setHistory(h);
      setHistoryRows(await h.list());
    });
    return () => {
      live = false;
    };
  }, []);

  // Quiz Review hand-off: ?ids=…
  const intake = params.get("ids");
  useEffect(() => {
    const ids = parseIds(intake);
    if (!ids.length) return;
    let live = true;
    void Promise.all(
      ids.map((id) =>
        quizApi
          .getReviewQuestion(id)
          .then((r) => (r.ok ? r.question : null))
          .catch(() => null),
      ),
    ).then((rows) => {
      if (!live) return;
      const found = rows.filter((r): r is ReviewQuestion => !!r);
      setItems((prev) => {
        const have = new Set(prev.map((p) => p.id));
        return [...prev, ...found.filter((r) => !have.has(String(r.id))).map((row) => ({ id: String(row.id), row }))];
      });
      if (found.length < ids.length) toast.warning(`${ids.length - found.length} handed-off question(s) could not be loaded.`);
    });
    return () => {
      live = false;
    };
  }, [intake]);

  const selectedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const built = useMemo(() => buildCreatorRequest(settings, items), [settings, items]);

  const add = useCallback((row: ReviewQuestion) => {
    setItems((prev) => (prev.some((p) => p.id === String(row.id)) ? prev : [...prev, { id: String(row.id), row }]));
  }, []);
  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    setSettingsState((s) => (s.featuredId === id ? { ...s, featuredId: null } : s));
  }, []);
  const move = useCallback((index: number, delta: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const generate = async () => {
    if (!built.request) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setView(null);
    setProgress({ done: 0, total: built.cardCount, runId: "", label: "Preparing templates…" });
    try {
      // Imported on demand: the render harness sets a realm-wide animation flag
      // at module scope, which must not apply to Admin from first paint.
      const { runContentExport } = await import("@/lib/quiz-screenshot/contentExport");
      const result = await runContentExport({
        request: built.request,
        questions: built.questions,
        signal: controller.signal,
        platform: settings.platform,
        sourceDescription: "Admin Content Creator",
        onProgress: (p) =>
          setProgress({ done: p.done, total: p.total, runId: p.runId, label: `${p.card.slug} · ${p.card.formatKey}` }),
      });
      const next = viewFromResult(result);
      setView(next);
      const captured = next.runs.reduce((n, r) => n + r.images.length, 0);
      if (next.aborted) toast.warning(`Stopped: ${next.aborted}. ${captured} image(s) were finished.`);
      else if (next.status === "failed") toast.error("Some images could not be produced — see the failures below.");
      else toast.success(`${captured} image${captured === 1 ? "" : "s"} ready.`);
      if (history?.available && captured > 0) {
        const entry: HistoryEntry = {
          id: `${Date.now()}-${result.archive.fileName}`,
          createdAt: new Date().toISOString(),
          title: `${MODE_COPY[settings.mode].title} · ${result.archive.fileName}`,
          mode: settings.mode,
          status: next.status,
          zipFileName: result.archive.fileName,
          zipBytes: result.archive.blob.size,
          captured,
          failed: next.runs.reduce((n, r) => n + r.failures.length, 0),
          runIds: next.runs.map((r) => r.runId),
        };
        if (await history.save(entry, result.archive.blob)) setHistoryRows(await history.list());
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const openHistory = async (id: string) => {
    if (!history) return;
    const entry = historyRows.find((h) => h.id === id);
    const blob = await history.archive(id);
    if (!blob || !entry) {
      toast.error("That run is no longer stored in this browser.");
      return;
    }
    setView(await viewFromArchive(blob, entry.zipFileName));
  };

  const deleteHistory = async (id: string) => {
    if (!history) return;
    await history.remove(id);
    setHistoryRows(await history.list());
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,1fr)_minmax(320px,1.05fr)_minmax(360px,1.35fr)]">
      <div className="min-h-[420px] lg:h-[calc(100vh-170px)]">
        <QuestionBank selectedIds={selectedIds} onAdd={add} onRemove={remove} />
      </div>
      <div className="min-h-[420px] lg:h-[calc(100vh-170px)]">
        <Composer
          items={items}
          settings={settings}
          onSettings={setSettings}
          onMove={move}
          onRemove={remove}
          onClear={() => {
            setItems([]);
            setSettings({ featuredId: null });
          }}
        />
      </div>
      <div className="min-h-[420px] lg:h-[calc(100vh-170px)]">
        <OutputPanel
          canGenerate={!!built.request && !generating && support.status !== "unsupported"}
          planErrors={built.errors}
          cardCount={built.cardCount}
          zipFileName={built.zipFileName}
          generating={generating}
          progress={progress}
          view={view}
          onGenerate={() => void generate()}
          onCancel={() => abortRef.current?.abort()}
          history={historyRows}
          historyAvailable={history?.available ?? false}
          onOpenHistory={(id) => void openHistory(id)}
          onDeleteHistory={(id) => void deleteHistory(id)}
          supportNotes={support.status === "verified" ? [] : support.notes}
        />
      </div>
    </div>
  );
}

export default function AdminContentCreator() {
  return (
    <div className="flex min-h-0 w-full flex-col gap-3 px-3 py-4 md:px-5" data-testid="admin-content-creator">
      <SEOHead
        title="Mogzy Admin · Content Creator"
        description="Private owner tool for social quiz content."
        path={ADMIN_CONTENT_CREATOR_PATH}
        noindex
      />
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <Link to="/admin/studio?section=video-social" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Studio
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Content Creator
          </h1>
          <p className="text-xs text-muted-foreground">
            Question images for social posts — rendered with Mogzy's own templates, checked, and packaged in your browser.
          </p>
        </div>
      </header>
      <AdminAuthGate>
        <ContentCreatorWorkspace />
      </AdminAuthGate>
    </div>
  );
}
