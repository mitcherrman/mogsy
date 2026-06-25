import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity, Database, Bug, FileText, BookOpen, History, Share2, Tv2,
  RefreshCw, Copy, Download, Trash2, Plus, Save, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import type { QuizQuestion } from "@/lib/quiz/api";
import { quizApi } from "@/lib/quiz/api";
import type { BroadcastEngine } from "@/lib/quiz-broadcast/engine";
import type { BroadcastConfig, EngineSnapshot } from "@/lib/quiz-broadcast/types";
import { DEFAULT_CONFIG } from "@/lib/quiz-broadcast/types";
import {
  devToolsRepository,
  type BroadcastPreset,
  type ChangelogEntry,
  type DocsSection,
  type EventLogEntry,
} from "@/lib/quiz-broadcast/dev-tools/repository";

type Props = {
  engine: BroadcastEngine;
  snapshot: EngineSnapshot;
  pool: QuizQuestion[];
  playlistItems: QuizQuestion[];
  apiStatus: "loading" | "ok" | "error";
  apiError?: string | null;
  usingFallback: boolean;
  apiRecordCount: number;
  onRefetch: () => void;
  bcConnected: boolean;
  lastSyncAt: number | null;
};

// ============================================================================
// Helpers
// ============================================================================

const APP_VERSION = "0.2.0";

function fmtTs(t?: number | null) {
  if (!t) return "—";
  return new Date(t).toLocaleString();
}

function tally<T extends string | number | undefined>(items: T[]) {
  const map = new Map<string, number>();
  for (const v of items) {
    const k = v == null || v === "" ? "(none)" : String(v);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function downloadText(name: string, body: string, mime = "text/plain") {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

async function copy(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Clipboard unavailable");
  }
}

// ============================================================================
// Starter presets — created lazily so the UI is always populated.
// ============================================================================

function starterPresets(): BroadcastPreset[] {
  const now = Date.now();
  const base = DEFAULT_CONFIG;
  type PresetPatch = {
    playback?: BroadcastConfig["playback"];
    repeatCount?: number;
    visuals?: Partial<BroadcastConfig["visuals"]>;
    timing?: Partial<BroadcastConfig["timing"]>;
  };
  const mk = (
    id: string,
    name: string,
    description: string,
    patch: PresetPatch,
    filters?: BroadcastPreset["filters"],
  ): BroadcastPreset => ({
    id, name, description, createdAt: now, updatedAt: now, filters,
    config: {
      ...base,
      playback: patch.playback ?? base.playback,
      repeatCount: patch.repeatCount ?? base.repeatCount,
      timing: { ...base.timing, ...(patch.timing ?? {}) },
      visuals: { ...base.visuals, ...(patch.visuals ?? {}) },
    },
  });
  return [
    mk("starter-beginner", "Beginner Quiz", "Slower timing, easy filter.",
      { playback: "sequential", timing: { questionMs: 16000, explanationMs: 8000 } },
      { difficulty: "1" }),
    mk("starter-champ", "Champion Abilities", "Champion-focused, hextech theme.",
      { playback: "random_no_repeat", visuals: { theme: "hextech" } },
      { search: "champion" }),
    mk("starter-items", "Item Trivia", "Item-focused trivia.",
      { playback: "random_no_repeat" }, { search: "item" }),
    mk("starter-patch", "Patch History", "Patch knowledge run.",
      { playback: "sequential" }, { search: "patch" }),
    mk("starter-tiktok", "TikTok Vertical", "9:16 layout, quick pacing.",
      { playback: "random", timing: { questionMs: 8000, revealMs: 3000, explanationMs: 4000 },
        visuals: { aspect: "9:16", fontScale: 1.1, showQrCode: true } }),
    mk("starter-youtube", "YouTube Horizontal", "16:9 layout, calm pacing.",
      { playback: "loop_playlist", timing: { questionMs: 14000, explanationMs: 7000 },
        visuals: { aspect: "16:9", theme: "midnight" } }),
  ];
}

// ============================================================================
// Sub-panels
// ============================================================================

function StatRow({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "ok" | "warn" | "err" }) {
  const color =
    tone === "ok" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "err" ? "text-rose-300" : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className={`truncate text-right text-sm font-medium ${color}`}>{v}</span>
    </div>
  );
}

function DiagnosticsPanel(props: Props) {
  const { snapshot, pool, playlistItems, apiStatus, usingFallback, apiRecordCount, onRefetch, bcConnected, lastSyncAt } = props;
  const t = snapshot.config.timing;
  const cur = snapshot.currentQuestion;
  const remainingMs = Math.max(0, snapshot.phaseDurationMs - (Date.now() - snapshot.phaseStartedAt));

  const summary = useMemo(() => ({
    quiz_api_status: apiStatus,
    api_endpoint: quizApi.baseUrl,
    mock_fallback_active: usingFallback,
    questions_in_database_estimate: apiRecordCount || pool.length,
    questions_loaded_from_api: apiRecordCount,
    questions_after_filters: pool.length,
    playlist_size: playlistItems.length,
    playback_mode: snapshot.config.playback,
    broadcast_phase: snapshot.phase,
    current_question_id: cur?.id ?? null,
    timers_ms: t,
    phase_remaining_ms: remainingMs,
    broadcast_channel_connected: bcConnected,
    last_sync: lastSyncAt,
  }), [apiStatus, usingFallback, apiRecordCount, pool.length, playlistItems.length, snapshot, cur, t, remainingMs, bcConnected, lastSyncAt]);

  const text = JSON.stringify(summary, null, 2);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onRefetch}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh Questions</Button>
        <Button size="sm" variant="outline" onClick={onRefetch}><Activity className="mr-1.5 h-3.5 w-3.5" />Reload API</Button>
        <Button size="sm" variant="outline" onClick={() => copy(text, "Diagnostics copied")}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy Diagnostics</Button>
        <Button size="sm" variant="outline" onClick={() => downloadText(`broadcast-diagnostics-${Date.now()}.json`, text, "application/json")}>
          <Download className="mr-1.5 h-3.5 w-3.5" />Export Diagnostics
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="overflow-hidden">
          <StatRow k="Quiz API status" v={apiStatus} tone={apiStatus === "ok" ? "ok" : apiStatus === "error" ? "err" : "warn"} />
          <StatRow k="API endpoint" v={<code className="text-xs">{quizApi.baseUrl}</code>} />
          <StatRow k="Mock fallback" v={usingFallback ? "ACTIVE" : "inactive"} tone={usingFallback ? "warn" : "ok"} />
          <StatRow k="Questions in DB (loaded)" v={apiRecordCount} />
          <StatRow k="Questions after filters" v={pool.length} />
          <StatRow k="Playlist size" v={playlistItems.length} />
        </Card>
        <Card className="overflow-hidden">
          <StatRow k="Playback mode" v={snapshot.config.playback} />
          <StatRow k="Broadcast phase" v={snapshot.phase} />
          <StatRow k="Current question ID" v={cur?.id ?? "—"} />
          <StatRow k="Phase duration" v={`${(snapshot.phaseDurationMs / 1000).toFixed(1)}s`} />
          <StatRow k="Phase remaining" v={`${(remainingMs / 1000).toFixed(1)}s`} />
          <StatRow k="BroadcastChannel" v={bcConnected ? "connected" : "unavailable"} tone={bcConnected ? "ok" : "err"} />
          <StatRow k="Last sync" v={fmtTs(lastSyncAt)} />
        </Card>
      </div>
    </div>
  );
}

function ApiInspectorPanel(props: Props) {
  const { pool, apiStatus, apiError, apiRecordCount, usingFallback } = props;
  const sample = pool.slice(0, 3);
  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <StatRow k="Base URL" v={<code className="text-xs">{quizApi.baseUrl}</code>} />
        <StatRow k="Sets endpoint" v={<code className="text-xs">GET /api/quiz/sets</code>} />
        <StatRow k="Questions endpoint" v={<code className="text-xs">GET /api/quiz/questions?set=NAME&limit=200</code>} />
        <StatRow k="Status" v={apiStatus} tone={apiStatus === "ok" ? "ok" : apiStatus === "error" ? "err" : "warn"} />
        <StatRow k="Records returned" v={apiRecordCount} />
        <StatRow k="Pagination" v="single-page (no cursor)" tone="warn" />
        <StatRow k="Using fallback" v={usingFallback ? "YES" : "no"} tone={usingFallback ? "warn" : "ok"} />
        <StatRow k="Last error" v={apiError || "—"} tone={apiError ? "err" : undefined} />
      </Card>
      <div>
        <Label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">Raw response preview (first 3)</Label>
        <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-black/40 p-3 text-[11px] leading-snug">
{JSON.stringify(sample, null, 2)}
        </pre>
      </div>
      {apiRecordCount > 0 && apiRecordCount < 300 && (
        <p className="text-xs text-amber-300">
          Heads-up: only {apiRecordCount} questions loaded. The studio fetches up to 200 per quiz set — if your database has more, raise the per-set limit in <code>AdminQuizBroadcast.tsx</code> or implement pagination.
        </p>
      )}
    </div>
  );
}

function DatabaseInspectorPanel({ pool, apiRecordCount }: Props) {
  const groups = useMemo(() => {
    const meta = (q: QuizQuestion) => (q.metadata ?? {}) as Record<string, any>;
    return {
      category: tally(pool.map((q) => q.category as any)),
      difficulty: tally(pool.map((q) => (q.difficulty ?? "—") as any)),
      format: tally(pool.map((q) => q.format as any)),
      champion: tally(pool.map((q) => meta(q).champion)),
      item: tally(pool.map((q) => meta(q).item)),
      rune: tally(pool.map((q) => meta(q).rune)),
      summoner: tally(pool.map((q) => meta(q).summoner)),
      patch: tally(pool.map((q) => meta(q).patch)),
    };
  }, [pool]);

  const hidden = pool.filter((q) => (q.metadata as any)?.hidden).length;
  const disabled = pool.filter((q) => (q.metadata as any)?.disabled).length;

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <StatRow k="Total in database (loaded)" v={apiRecordCount} />
        <StatRow k="Loaded questions" v={pool.length} />
        <StatRow k="Hidden" v={hidden} tone={hidden ? "warn" : undefined} />
        <StatRow k="Disabled" v={disabled} tone={disabled ? "warn" : undefined} />
      </Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(groups).map(([k, rows]) => (
          <Card key={k} className="overflow-hidden">
            <div className="border-b border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              By {k} <span className="float-right opacity-60">{rows.length}</span>
            </div>
            <ScrollArea className="h-44">
              <div className="divide-y divide-white/5">
                {rows.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No data</div>}
                {rows.map(([label, n]) => (
                  <div key={label} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="truncate">{label}</span>
                    <span className="ml-2 font-mono opacity-70">{n}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EventLogPanel() {
  const [tick, setTick] = useState(0);
  useEffect(() => devToolsRepository.subscribeEvents(() => setTick((t) => t + 1)), []);
  const events = useMemo(() => devToolsRepository.listEvents(), [tick]);
  const text = events.map((e) => `[${new Date(e.ts).toISOString()}] ${e.level.toUpperCase().padEnd(7)} ${e.source} — ${e.message}`).join("\n");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => copy(text, "Log copied")}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy Log</Button>
        <Button size="sm" variant="outline" onClick={() => downloadText(`broadcast-events-${Date.now()}.log`, text)}><Download className="mr-1.5 h-3.5 w-3.5" />Export Log</Button>
        <Button size="sm" variant="outline" onClick={() => { devToolsRepository.clearEvents(); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Clear Log</Button>
        <span className="ml-auto self-center text-xs text-muted-foreground">{events.length} events</span>
      </div>
      <Card className="overflow-hidden">
        <ScrollArea className="h-96">
          <div className="divide-y divide-white/5 font-mono text-[11px]">
            {events.length === 0 && <div className="p-4 text-center text-muted-foreground">No events recorded yet.</div>}
            {events.map((e) => (
              <div key={e.id} className="grid grid-cols-[auto_auto_auto_1fr] items-baseline gap-2 px-3 py-1.5">
                <span className="text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>
                <Badge variant="outline" className={
                  e.level === "error" ? "border-rose-500/40 text-rose-300" :
                  e.level === "warn" ? "border-amber-500/40 text-amber-300" :
                  e.level === "success" ? "border-emerald-500/40 text-emerald-300" :
                  "border-white/20 text-foreground/80"
                }>{e.level}</Badge>
                <span className="text-cyan-300">{e.source}</span>
                <span className="truncate">{e.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

function ChangelogPanel() {
  const [list, setList] = useState<ChangelogEntry[]>(() => devToolsRepository.listChangelog());
  const [draft, setDraft] = useState({ version: "", title: "", notes: "" });
  const add = () => {
    if (!draft.version || !draft.title) { toast.error("Version and title required"); return; }
    devToolsRepository.prependChangelog({
      version: draft.version,
      title: draft.title,
      notes: draft.notes.split("\n").map((s) => s.trim()).filter(Boolean),
      kind: "feature",
    });
    setList(devToolsRepository.listChangelog());
    setDraft({ version: "", title: "", notes: "" });
    toast.success("Changelog entry added");
  };
  const remove = (id: string) => {
    devToolsRepository.deleteChangelog(id);
    setList(devToolsRepository.listChangelog());
  };
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_minmax(0,320px)]">
      <Card className="overflow-hidden">
        <ScrollArea className="h-[28rem]">
          <div className="divide-y divide-white/5">
            {list.map((c) => (
              <div key={c.id} className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <Badge variant="outline" className="border-cyan-400/40 text-cyan-300">v{c.version}</Badge>
                    <h4 className="text-sm font-semibold">{c.title}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{fmtTs(c.ts)}</span>
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)} className="h-6 w-6"><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {c.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>
      <Card className="p-3">
        <h4 className="mb-2 text-sm font-semibold">New entry</h4>
        <div className="space-y-2">
          <Input placeholder="Version (e.g. 0.3.0)" value={draft.version} onChange={(e) => setDraft((d) => ({ ...d, version: e.target.value }))} />
          <Input placeholder="Title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          <Textarea rows={5} placeholder="Notes (one per line)" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
          <Button size="sm" onClick={add}><Plus className="mr-1 h-3 w-3" />Add Entry</Button>
        </div>
      </Card>
    </div>
  );
}

function DocsPanel() {
  const [docs, setDocs] = useState<DocsSection[]>(() => devToolsRepository.listDocs());
  const [selected, setSelected] = useState<string>(() => devToolsRepository.listDocs()[0]?.id ?? "");
  const cur = docs.find((d) => d.id === selected);
  const save = (next: DocsSection) => {
    devToolsRepository.upsertDoc(next);
    setDocs(devToolsRepository.listDocs());
    toast.success("Saved");
  };
  const addNew = () => {
    const id = `doc-${Date.now().toString(36)}`;
    const entry = devToolsRepository.upsertDoc({ id, title: "New section", body: "" });
    setDocs(devToolsRepository.listDocs());
    setSelected(entry.id);
  };
  return (
    <div className="grid gap-3 md:grid-cols-[220px_1fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 p-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Sections</span>
          <Button size="icon" variant="ghost" onClick={addNew} className="h-6 w-6"><Plus className="h-3 w-3" /></Button>
        </div>
        <ScrollArea className="h-[28rem]">
          <div className="divide-y divide-white/5">
            {docs.map((d) => (
              <button key={d.id} onClick={() => setSelected(d.id)} className={`block w-full px-3 py-2 text-left text-sm hover:bg-white/[0.04] ${selected === d.id ? "bg-white/[0.06]" : ""}`}>
                <div className="truncate font-medium">{d.title}</div>
                <div className="text-[10px] text-muted-foreground">{fmtTs(d.updatedAt)}</div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>
      <Card className="p-3">
        {cur ? (
          <div className="space-y-2">
            <Input value={cur.title} onChange={(e) => save({ ...cur, title: e.target.value })} />
            <Textarea rows={18} value={cur.body} onChange={(e) => save({ ...cur, body: e.target.value })} className="font-mono text-xs" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Last updated: {fmtTs(cur.updatedAt)}</span>
              <Button size="sm" variant="ghost" onClick={() => {
                devToolsRepository.deleteDoc(cur.id);
                const next = devToolsRepository.listDocs();
                setDocs(next); setSelected(next[0]?.id ?? "");
              }}><Trash2 className="mr-1 h-3 w-3" />Delete section</Button>
            </div>
          </div>
        ) : <div className="p-6 text-center text-sm text-muted-foreground">Select or create a section.</div>}
      </Card>
    </div>
  );
}

function ExportContextPanel(props: Props) {
  const { snapshot, pool, playlistItems, apiStatus, usingFallback, apiRecordCount, bcConnected, lastSyncAt } = props;
  const changelog = devToolsRepository.listChangelog();
  const docs = devToolsRepository.listDocs();

  const stats = {
    api_status: apiStatus,
    api_endpoint: quizApi.baseUrl,
    using_fallback: usingFallback,
    questions_loaded: apiRecordCount,
    pool_after_filters: pool.length,
    playlist_size: playlistItems.length,
    current_phase: snapshot.phase,
    playback: snapshot.config.playback,
    broadcast_channel: bcConnected,
    last_sync: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
  };

  const filesInvolved = [
    "src/pages/admin/AdminQuizBroadcast.tsx",
    "src/pages/admin/QuizBroadcastView.tsx",
    "src/lib/quiz-broadcast/engine.ts",
    "src/lib/quiz-broadcast/channel.ts",
    "src/lib/quiz-broadcast/useBroadcastEngine.ts",
    "src/lib/quiz-broadcast/storage.ts",
    "src/lib/quiz-broadcast/mock-questions.ts",
    "src/lib/quiz-broadcast/types.ts",
    "src/lib/quiz-broadcast/dev-tools/repository.ts",
    "src/components/quiz-broadcast/BroadcastRenderer.tsx",
    "src/components/quiz-broadcast/ControlPanel.tsx",
    "src/components/quiz-broadcast/PlaylistBuilder.tsx",
    "src/components/quiz-broadcast/PlaylistLibrary.tsx",
    "src/components/quiz-broadcast/QuestionBrowser.tsx",
    "src/components/quiz-broadcast/TimingSettings.tsx",
    "src/components/quiz-broadcast/VisualSettings.tsx",
    "src/components/quiz-broadcast/BroadcastStats.tsx",
    "src/components/quiz-broadcast/DeveloperTools.tsx",
  ];

  const projectContext = [
    `# Mogsy Quiz Broadcast Studio — Project Context (v${APP_VERSION})`,
    "",
    "## Purpose",
    "Admin-only 24/7 livestream studio for the Mogsy League quiz. Runs in a browser, outputs a clean renderer window for OBS capture.",
    "",
    "## Architecture",
    "- Engine (pure state machine) → Studio (control room) → Renderer (presentation).",
    "- Studio publishes EngineSnapshot over BroadcastChannel; the popup at /admin/quiz-broadcast/view is a passive subscriber.",
    "- Dev Tools data goes through DevToolsRepository (localStorage today, swappable to backend).",
    "",
    "## Features",
    "- Playlist builder + saved playlists.",
    "- Playback modes: sequential, random, weighted random, random no-repeat, loop playlist, loop single, repeat N, forever.",
    "- Visual config: aspect (16:9 / 9:16), theme, countdown style, badge toggles, QR code, logo, etc.",
    "- Timing config per phase.",
    "- Mock question fallback when /api/quiz is unreachable.",
    "- Developer Tools: diagnostics, API inspector, DB inspector, event log, changelog, docs, export, presets, OBS help.",
    "",
    "## Current Statistics",
    "```json",
    JSON.stringify(stats, null, 2),
    "```",
    "",
    "## Files Involved",
    filesInvolved.map((f) => `- ${f}`).join("\n"),
    "",
    "## Known Issues / TODO",
    "- Question pool capped at 200 per quiz set; needs pagination for very large databases.",
    "- Dev Tools data is per-browser (localStorage); migrate to backend for team workflows.",
    "- BroadcastChannel is same-origin only.",
    "",
    "## Recent Changelog",
    changelog.slice(0, 5).map((c) => `### v${c.version} — ${c.title}\n${c.notes.map((n) => `- ${n}`).join("\n")}`).join("\n\n"),
    "",
    "## Documentation",
    docs.map((d) => `### ${d.title}\n${d.body}`).join("\n\n"),
  ].join("\n");

  const continuationPrompt = [
    `Continue work on the Mogsy Quiz Broadcast Studio (v${APP_VERSION}).`,
    "",
    "Architecture: Engine (src/lib/quiz-broadcast/engine.ts) → Studio (src/pages/admin/AdminQuizBroadcast.tsx) → Renderer (src/components/quiz-broadcast/BroadcastRenderer.tsx). Studio and Broadcast Window (/admin/quiz-broadcast/view) sync over BroadcastChannel('mogsy-quiz-broadcast'). Dev Tools data flows through DevToolsRepository (src/lib/quiz-broadcast/dev-tools/repository.ts) — localStorage implementation today.",
    "",
    "Current state:",
    `- Questions loaded: ${apiRecordCount} (fallback: ${usingFallback}).`,
    `- Playlist size: ${playlistItems.length}. Phase: ${snapshot.phase}. Playback: ${snapshot.config.playback}.`,
    `- API: ${quizApi.baseUrl} (${apiStatus}).`,
    "",
    "Keep changes admin-gated under /admin/quiz-broadcast and respect the Engine/Studio/Renderer split. Persist any new dev-tools data through DevToolsRepository, never directly via localStorage in components.",
  ].join("\n");

  const chatgptContext = [
    `Mogsy Quiz Broadcast Studio — technical brief (v${APP_VERSION}).`,
    "Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + React Query. Backend: Supabase (Lovable Cloud) + external quiz API at " + quizApi.baseUrl + ".",
    "",
    "Layering:",
    "- BroadcastEngine: state machine (phase, playlist, timers).",
    "- AdminQuizBroadcast page: instantiates the engine, owns config and playlists, publishes snapshots over BroadcastChannel.",
    "- QuizBroadcastView page: passive subscriber, renders BroadcastRenderer with the incoming snapshot.",
    "- DevToolsRepository: abstraction layer for docs/changelog/events/presets; LocalDevToolsRepository persists to localStorage.",
    "",
    "Phases: question → reveal → explanation → transition → (next question).",
    "Reveal: tries question.metadata.correct_answer first, falls back to POST /api/quiz/attempts.",
    "",
    `Snapshot: ${JSON.stringify(stats)}`,
  ].join("\n");

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card className="p-3">
        <h4 className="text-sm font-semibold">Copy Project Context</h4>
        <p className="mt-1 text-xs text-muted-foreground">Comprehensive markdown brief — paste into ChatGPT or docs.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => copy(projectContext, "Project context copied")}><Copy className="mr-1 h-3 w-3" />Copy</Button>
          <Button size="sm" variant="outline" onClick={() => downloadText("broadcast-project-context.md", projectContext, "text/markdown")}><Download className="mr-1 h-3 w-3" />Export</Button>
        </div>
      </Card>
      <Card className="p-3">
        <h4 className="text-sm font-semibold">Lovable Continuation Prompt</h4>
        <p className="mt-1 text-xs text-muted-foreground">Drop into a new Lovable chat to keep building with full context.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => copy(continuationPrompt, "Lovable prompt copied")}><Copy className="mr-1 h-3 w-3" />Copy</Button>
          <Button size="sm" variant="outline" onClick={() => downloadText("broadcast-lovable-prompt.txt", continuationPrompt)}><Download className="mr-1 h-3 w-3" />Export</Button>
        </div>
      </Card>
      <Card className="p-3">
        <h4 className="text-sm font-semibold">ChatGPT Context</h4>
        <p className="mt-1 text-xs text-muted-foreground">Compact technical brief for architecture / debugging questions.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => copy(chatgptContext, "ChatGPT context copied")}><Copy className="mr-1 h-3 w-3" />Copy</Button>
          <Button size="sm" variant="outline" onClick={() => downloadText("broadcast-chatgpt-context.txt", chatgptContext)}><Download className="mr-1 h-3 w-3" />Export</Button>
        </div>
      </Card>
    </div>
  );
}

function PresetsPanel({ engine, snapshot }: Props) {
  const [list, setList] = useState<BroadcastPreset[]>(() => {
    const cur = devToolsRepository.listPresets();
    if (cur.length === 0) {
      for (const p of starterPresets()) devToolsRepository.upsertPreset(p);
      return devToolsRepository.listPresets();
    }
    return cur;
  });
  const [name, setName] = useState("");
  const saveCurrent = () => {
    if (!name.trim()) { toast.error("Name the preset first"); return; }
    const p: BroadcastPreset = {
      id: `pr_${Date.now().toString(36)}`,
      name: name.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      config: snapshot.config,
      playlistId: snapshot.playlistId,
    };
    setList(devToolsRepository.upsertPreset(p));
    setName("");
    toast.success(`Saved preset "${p.name}"`);
  };
  const load = (p: BroadcastPreset) => {
    engine.setConfig(p.config);
    toast.success(`Loaded "${p.name}"`);
  };
  const remove = (id: string) => setList(devToolsRepository.deletePreset(id));

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-2 p-3">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Save current config as preset</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name…" />
        </div>
        <Button onClick={saveCurrent}><Save className="mr-1.5 h-4 w-4" />Save Preset</Button>
      </Card>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <Card key={p.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold">{p.name}</h4>
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(p.id)} className="h-7 w-7"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-wide">
              <Badge variant="outline">{p.config.visuals.aspect}</Badge>
              <Badge variant="outline">{p.config.playback}</Badge>
              <Badge variant="outline">{p.config.visuals.theme}</Badge>
              {p.filters?.difficulty && <Badge variant="outline">D{p.filters.difficulty}</Badge>}
              {p.filters?.search && <Badge variant="outline">“{p.filters.search}”</Badge>}
            </div>
            <Button size="sm" variant="secondary" onClick={() => load(p)}><Radio className="mr-1.5 h-3.5 w-3.5" />Load</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ObsHelpPanel() {
  return (
    <Card className="space-y-3 p-4 text-sm">
      <h3 className="text-base font-semibold">OBS Capture Workflow</h3>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Configure the broadcast in Broadcast Studio (playlist, timing, visuals).</li>
        <li>Click <em>Open Broadcast Window</em> — a popup at <code>/admin/quiz-broadcast/view</code>.</li>
        <li>In OBS add a <strong>Window Capture</strong> source and pick that popup.</li>
        <li>Keep the Studio open in another window — controls and snapshots stay synced via BroadcastChannel.</li>
        <li>Use <strong>Crop / Pad</strong> in OBS if the popup includes browser chrome you don't want streamed.</li>
      </ol>
      <Separator />
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Use 9:16 visuals for TikTok / Shorts; 16:9 for YouTube / Twitch / Kick.</li>
        <li>Same browser profile is required — BroadcastChannel does not cross profiles.</li>
        <li>If the popup is blocked, allow popups for this domain and click the button again.</li>
      </ul>
    </Card>
  );
}

// ============================================================================
// Root
// ============================================================================

export default function DeveloperTools(props: Props) {
  return (
    <Tabs defaultValue="diag" className="w-full">
      <TabsList className="flex h-auto flex-wrap">
        <TabsTrigger value="diag"><Activity className="mr-1.5 h-3.5 w-3.5" />Diagnostics</TabsTrigger>
        <TabsTrigger value="api"><Bug className="mr-1.5 h-3.5 w-3.5" />API Inspector</TabsTrigger>
        <TabsTrigger value="db"><Database className="mr-1.5 h-3.5 w-3.5" />DB Inspector</TabsTrigger>
        <TabsTrigger value="events"><History className="mr-1.5 h-3.5 w-3.5" />Event Log</TabsTrigger>
        <TabsTrigger value="changelog"><FileText className="mr-1.5 h-3.5 w-3.5" />Changelog</TabsTrigger>
        <TabsTrigger value="docs"><BookOpen className="mr-1.5 h-3.5 w-3.5" />Documentation</TabsTrigger>
        <TabsTrigger value="export"><Share2 className="mr-1.5 h-3.5 w-3.5" />Export Context</TabsTrigger>
        <TabsTrigger value="presets"><Save className="mr-1.5 h-3.5 w-3.5" />Presets</TabsTrigger>
        <TabsTrigger value="obs"><Tv2 className="mr-1.5 h-3.5 w-3.5" />OBS Help</TabsTrigger>
      </TabsList>
      <TabsContent value="diag" className="pt-3"><DiagnosticsPanel {...props} /></TabsContent>
      <TabsContent value="api" className="pt-3"><ApiInspectorPanel {...props} /></TabsContent>
      <TabsContent value="db" className="pt-3"><DatabaseInspectorPanel {...props} /></TabsContent>
      <TabsContent value="events" className="pt-3"><EventLogPanel /></TabsContent>
      <TabsContent value="changelog" className="pt-3"><ChangelogPanel /></TabsContent>
      <TabsContent value="docs" className="pt-3"><DocsPanel /></TabsContent>
      <TabsContent value="export" className="pt-3"><ExportContextPanel {...props} /></TabsContent>
      <TabsContent value="presets" className="pt-3"><PresetsPanel {...props} /></TabsContent>
      <TabsContent value="obs" className="pt-3"><ObsHelpPanel /></TabsContent>
    </Tabs>
  );
}
