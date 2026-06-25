import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity, Database, Bug, FileText, BookOpen, History, Share2, Tv2,
  RefreshCw, Copy, Download, Trash2, Plus, Save, Radio, Filter, Layers, PlayCircle,
  Package,
} from "lucide-react";
import JSZip from "jszip";
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
import type { FetchReport, BrowserFilterState } from "@/pages/admin/AdminQuizBroadcast";

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
  fetchReport: FetchReport;
  filterState: BrowserFilterState;
  mockFallbackCount: number;
};

// ============================================================================
// Helpers
// ============================================================================

const APP_VERSION = "0.3.0";
const DIAGNOSTICS_VERSION = "2";
const EXPORT_VERSION = "2";

function fmtTs(t?: number | null) {
  if (!t) return "—";
  return new Date(t).toLocaleString();
}

function isoStamp(d = new Date()) {
  // Filesystem-safe ISO stamp, e.g. 2025-01-31T14-05-09
  return d.toISOString().replace(/\..+$/, "").replace(/:/g, "-");
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
  const { snapshot, pool, playlistItems, apiStatus, usingFallback, apiRecordCount, onRefetch, bcConnected, lastSyncAt, fetchReport, filterState, mockFallbackCount } = props;
  const t = snapshot.config.timing;
  const cur = snapshot.currentQuestion;
  const remainingMs = Math.max(0, snapshot.phaseDurationMs - (Date.now() - snapshot.phaseStartedAt));

  const summary = useMemo(() => ({
    quiz_api_status: apiStatus,
    api_endpoint: quizApi.baseUrl,
    mock_fallback_active: usingFallback,
    mock_fallback_count: mockFallbackCount,
    inventory: {
      database_total: "Not provided by API",
      api_returned_raw: fetchReport.raw_total_across_sets,
      api_returned_unique: fetchReport.unique_total,
      loaded_into_frontend: pool.length,
      after_active_filters: filterState.totalAfterFilters,
      added_to_playlist: playlistItems.length,
    },
    api_request_details: {
      per_set_limit: fetchReport.per_set_limit,
      sets_discovered: fetchReport.sets_count,
      pagination_metadata: "Not provided by API",
      per_set_summary: fetchReport.per_set.map((e) => ({
        set: e.set_name, returned: e.returned, limit: e.params.limit,
        truncated: e.returned === e.params.limit, status: e.status,
      })),
    },
    active_filters: {
      search: filterState.search, category: filterState.category, difficulty: filterState.difficulty,
    },
    playback_mode: snapshot.config.playback,
    broadcast_phase: snapshot.phase,
    current_question_id: cur?.id ?? null,
    timers_ms: t,
    phase_remaining_ms: remainingMs,
    broadcast_channel_connected: bcConnected,
    last_sync: lastSyncAt,
  }), [apiStatus, usingFallback, mockFallbackCount, apiRecordCount, pool.length, playlistItems.length, snapshot, cur, t, remainingMs, bcConnected, lastSyncAt, fetchReport, filterState]);

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
          <StatRow k="API returned (unique)" v={fetchReport.unique_total} />
          <StatRow k="Data source" v={fetchReport.data_source} tone={fetchReport.data_source === "network" ? "ok" : fetchReport.data_source === "cache" ? "warn" : undefined} />
          <StatRow k="Served from React Query cache" v={fetchReport.from_cache ? "yes" : "no"} />
          <StatRow k="Loaded into frontend" v={pool.length} />
          <StatRow k="After active filters" v={filterState.totalAfterFilters} />
          <StatRow k="Playlist size" v={playlistItems.length} />
        </Card>
        <Card className="overflow-hidden">
          <StatRow k="Playback mode" v={snapshot.config.playback} />
          <StatRow k="Broadcast phase" v={snapshot.phase} />
          <StatRow k="Current question ID" v={cur?.id ?? "—"} />
          <StatRow k="Phase duration" v={`${(snapshot.phaseDurationMs / 1000).toFixed(1)}s`} />
          <StatRow k="Phase remaining" v={`${(remainingMs / 1000).toFixed(1)}s`} />
          <StatRow k="BroadcastChannel" v={bcConnected ? "connected" : "unavailable"} tone={bcConnected ? "ok" : "err"} />
          <StatRow k="Last snapshot post" v={fmtTs(lastSyncAt)} />
          <StatRow
            k="Window sync"
            v={lastSyncAt && Date.now() - lastSyncAt < 5000 ? "live" : lastSyncAt ? "idle" : "—"}
            tone={lastSyncAt && Date.now() - lastSyncAt < 5000 ? "ok" : "warn"}
          />
        </Card>
      </div>
    </div>
  );
}

// --- Pagination probe -------------------------------------------------------

type PaginationProbe = {
  running: boolean;
  finishedAt: number | null;
  per_set: Array<{
    set_name: string;
    pages: Array<{ url: string; limit: number; offset: number; returned: number; status: "ok" | "error"; error?: string }>;
    raw_total: number;
    duplicates_removed: number;
    unique_ids: number;
    offset_supported: boolean | "unknown";
    note: string;
  }>;
  raw_total: number;
  duplicates_removed: number;
  unique_total: number;
  duration_ms: number;
  note: string;
};

const EMPTY_PROBE: PaginationProbe = {
  running: false, finishedAt: null, per_set: [],
  raw_total: 0, duplicates_removed: 0, unique_total: 0, duration_ms: 0,
  note: "Not run yet.",
};

async function fetchPage(setName: string, limit: number, offset: number): Promise<{ url: string; items: QuizQuestion[]; error?: string }> {
  const url = `${quizApi.baseUrl}/api/quiz/questions?set=${encodeURIComponent(setName)}&limit=${limit}&offset=${offset}`;
  try {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return { url, items: [], error: `${res.status} ${res.statusText}` };
    const json = (await res.json()) as { questions?: QuizQuestion[] };
    return { url, items: json.questions ?? [] };
  } catch (e: any) {
    return { url, items: [], error: e?.message || String(e) };
  }
}

function ApiInspectorPanel(props: Props) {
  const { fetchReport, apiStatus, apiError, usingFallback, onRefetch } = props;
  const [probe, setProbe] = useState<PaginationProbe>(EMPTY_PROBE);

  const runProbe = async () => {
    setProbe({ ...EMPTY_PROBE, running: true, note: "Probing…" });
    const start = Date.now();
    const PAGE = 500;
    const MAX_PAGES_PER_SET = 20; // hard cap
    const seen = new Set<string | number>();
    const perSet: PaginationProbe["per_set"] = [];
    let rawTotal = 0;
    for (const entry of fetchReport.per_set) {
      const pages: PaginationProbe["per_set"][number]["pages"] = [];
      const setSeen = new Set<string | number>();
      let offset = 0;
      let raw = 0;
      let offsetSupported: boolean | "unknown" = "unknown";
      let firstPageIds: Array<string | number> | null = null;
      let note = "";
      for (let i = 0; i < MAX_PAGES_PER_SET; i++) {
        const r = await fetchPage(entry.set_name, PAGE, offset);
        const ids = r.items.map((q) => q.id);
        pages.push({ url: r.url, limit: PAGE, offset, returned: r.items.length, status: r.error ? "error" : "ok", error: r.error });
        if (r.error) { note = `Stopped on error: ${r.error}`; break; }
        if (r.items.length === 0) { note = note || "Empty page → end reached."; break; }
        // Detect whether offset is honored: page 2 must contain different IDs
        if (i === 0) {
          firstPageIds = ids;
        } else if (i === 1 && firstPageIds) {
          const overlap = ids.filter((id) => firstPageIds!.includes(id)).length;
          if (overlap === ids.length) {
            offsetSupported = false;
            note = "Offset appears to be ignored (page 2 returned identical IDs). Pagination not supported.";
            // count only this page once
          } else {
            offsetSupported = true;
          }
        }
        let added = 0;
        for (const q of r.items) {
          raw++; rawTotal++;
          if (!setSeen.has(q.id)) { setSeen.add(q.id); added++; }
          seen.add(q.id);
        }
        if (offsetSupported === false) break;
        if (r.items.length < PAGE) { note = note || "Short page → end reached."; break; }
        if (added === 0) { note = note || "No new IDs → end reached."; break; }
        offset += PAGE;
      }
      perSet.push({
        set_name: entry.set_name, pages, raw_total: raw,
        duplicates_removed: raw - setSeen.size, unique_ids: setSeen.size,
        offset_supported: offsetSupported,
        note: note || "Completed.",
      });
    }
    const uniqueTotal = seen.size;
    setProbe({
      running: false, finishedAt: Date.now(), per_set: perSet,
      raw_total: rawTotal, duplicates_removed: rawTotal - uniqueTotal, unique_total: uniqueTotal,
      duration_ms: Date.now() - start,
      note: perSet.length === 0
        ? "No sets to probe."
        : perSet.every((s) => s.offset_supported === false)
          ? "Backend ignored offset on every probed set — pagination is NOT supported. Raise per-set limit or add a backend pagination/total endpoint."
          : perSet.some((s) => s.offset_supported === true)
            ? "Offset paging is honored by at least one set."
            : "Pagination behavior unclear — only one page returned per set.",
    });
    toast.success("Pagination probe complete");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onRefetch}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refetch</Button>
        <Button size="sm" onClick={runProbe} disabled={probe.running || fetchReport.per_set.length === 0}>
          <PlayCircle className="mr-1.5 h-3.5 w-3.5" />{probe.running ? "Probing…" : "Fetch All Pages (Pagination Test)"}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <StatRow k="Base URL" v={<code className="text-xs">{fetchReport.base_url}</code>} />
        <StatRow k="Sets endpoint" v={<code className="text-xs">GET {fetchReport.sets_request_url}</code>} />
        <StatRow k="Questions endpoint template" v={<code className="text-xs">GET {fetchReport.questions_endpoint_template}</code>} />
        <StatRow k="Per-set limit (frontend)" v={fetchReport.per_set_limit} />
        <StatRow k="Sets request status" v={fetchReport.sets_status} tone={fetchReport.sets_status === "ok" ? "ok" : "err"} />
        <StatRow k="Sets discovered" v={fetchReport.sets_count ?? "—"} />
        <StatRow k="Overall API status" v={apiStatus} tone={apiStatus === "ok" ? "ok" : apiStatus === "error" ? "err" : "warn"} />
        <StatRow k="Using mock fallback" v={usingFallback ? "YES" : "no"} tone={usingFallback ? "warn" : "ok"} />
        <StatRow k="Last error" v={apiError || fetchReport.sets_error || "—"} tone={apiError || fetchReport.sets_error ? "err" : undefined} />
        <StatRow k="Pagination metadata" v="Not provided by API" tone="warn" />
        <StatRow k="Total count metadata" v="Not provided by API" tone="warn" />
        <StatRow k="Strategy" v={`${fetchReport.per_set.length} parallel requests (one per quiz set)`} />
        <StatRow k="Fetch duration" v={`${fetchReport.duration_ms} ms`} />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          Per-set requests <span className="float-right opacity-60">{fetchReport.per_set.length}</span>
        </div>
        <ScrollArea className="max-h-80">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-white/5">
                <th className="px-3 py-1.5">Set</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5">Limit</th>
                <th className="px-3 py-1.5">Returned</th>
                <th className="px-3 py-1.5">ms</th>
                <th className="px-3 py-1.5">URL</th>
              </tr>
            </thead>
            <tbody>
              {fetchReport.per_set.map((e) => (
                <tr key={e.set_name} className="border-b border-white/5">
                  <td className="px-3 py-1.5 font-medium">{e.set_name}</td>
                  <td className={`px-3 py-1.5 ${e.status === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{e.status}{e.error ? ` — ${e.error}` : ""}</td>
                  <td className="px-3 py-1.5 font-mono">{e.params.limit}</td>
                  <td className={`px-3 py-1.5 font-mono ${e.returned === Number(e.params.limit) ? "text-amber-300" : ""}`} title={e.returned === Number(e.params.limit) ? "Returned exactly limit — likely truncated" : undefined}>
                    {e.returned}{e.returned === Number(e.params.limit) ? " ⚠" : ""}
                  </td>
                  <td className="px-3 py-1.5 font-mono opacity-60">{e.duration_ms}</td>
                  <td className="px-3 py-1.5 font-mono opacity-60"><code className="break-all">{e.request_url}</code></td>
                </tr>
              ))}
              {fetchReport.per_set.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No fetch report yet.</td></tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
        <div className="border-t border-white/10 px-3 py-2 text-xs text-muted-foreground">
          Raw across sets: <span className="font-mono">{fetchReport.raw_total_across_sets}</span> · Duplicates removed: <span className="font-mono">{fetchReport.duplicates_removed}</span> · Unique loaded: <span className="font-mono text-foreground">{fetchReport.unique_total}</span>
        </div>
      </Card>

      {/* Pagination probe results */}
      <Card className="overflow-hidden">
        <div className="border-b border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
          Pagination Probe {probe.running && <span className="ml-2 text-amber-300">running…</span>}
        </div>
        <div className="px-3 py-2 text-xs">
          <p className={probe.note.includes("NOT supported") ? "text-rose-300" : probe.note.includes("honored") ? "text-emerald-300" : "text-muted-foreground"}>{probe.note}</p>
          {probe.finishedAt && (
            <div className="mt-1 text-muted-foreground">
              Pages fetched: <span className="font-mono">{probe.per_set.reduce((a, s) => a + s.pages.length, 0)}</span> ·
              Raw: <span className="font-mono">{probe.raw_total}</span> ·
              Dupes removed: <span className="font-mono">{probe.duplicates_removed}</span> ·
              Final unique: <span className="font-mono text-foreground">{probe.unique_total}</span> ·
              Duration: <span className="font-mono">{probe.duration_ms} ms</span>
            </div>
          )}
        </div>
        {probe.per_set.length > 0 && (
          <ScrollArea className="max-h-80 border-t border-white/10">
            <div className="divide-y divide-white/5 text-xs">
              {probe.per_set.map((s) => (
                <div key={s.set_name} className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.set_name}</span>
                    <span className={
                      s.offset_supported === true ? "text-emerald-300" :
                      s.offset_supported === false ? "text-rose-300" : "text-amber-300"
                    }>
                      offset: {String(s.offset_supported)}
                    </span>
                  </div>
                  <div className="text-muted-foreground">{s.note} · pages {s.pages.length} · unique {s.unique_ids} · dupes {s.duplicates_removed}</div>
                  <div className="mt-1 space-y-0.5 font-mono text-[10px] opacity-70">
                    {s.pages.map((p, i) => (
                      <div key={i}>#{i + 1} offset={p.offset} → {p.status === "ok" ? `${p.returned} items` : `ERR ${p.error}`}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      <div>
        <Label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">Raw response preview (first 3 questions)</Label>
        <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-black/40 p-3 text-[11px] leading-snug">
{JSON.stringify(props.pool.slice(0, 3), null, 2)}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventory Summary — explicit counts at every stage of the pipeline.
// ---------------------------------------------------------------------------

function InventorySummaryPanel(props: Props) {
  const { fetchReport, pool, playlistItems, filterState, usingFallback, mockFallbackCount } = props;
  const truncatedSets = fetchReport.per_set.filter((e) => e.returned === e.params.limit);

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <StatRow k="Database total" v="Not provided by API" tone="warn" />
        <StatRow k="API returned (raw, all sets)" v={fetchReport.raw_total_across_sets} />
        <StatRow k="API returned (unique after dedup)" v={fetchReport.unique_total} />
        <StatRow k="Duplicate questions removed" v={fetchReport.duplicates_removed} />
        <StatRow k="Loaded into frontend" v={pool.length} tone={usingFallback ? "warn" : "ok"} />
        <StatRow k="After active filters (Question Browser)" v={filterState.totalAfterFilters} />
        <StatRow k="Added to playlist" v={playlistItems.length} />
        <StatRow k="Mock fallback dataset size" v={mockFallbackCount} />
        <StatRow k="Mock fallback active" v={usingFallback ? "YES" : "no"} tone={usingFallback ? "warn" : "ok"} />
        <StatRow k="Data source" v={fetchReport.data_source} />
      </Card>

      {truncatedSets.length > 0 && (
        <Card className="border-amber-400/30 bg-amber-500/5 p-3 text-xs">
          <p className="font-semibold text-amber-300">⚠ {truncatedSets.length} set(s) returned exactly the per-set limit ({fetchReport.per_set_limit}).</p>
          <p className="mt-1 text-muted-foreground">
            This strongly suggests truncation. The current frontend issues one request per set with <code>limit={fetchReport.per_set_limit}</code> and the API exposes no total-count or pagination metadata. Run the pagination probe on the API Inspector tab to determine whether the backend honors <code>offset</code>.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {truncatedSets.map((s) => <li key={s.set_name}><code>{s.set_name}</code> → {s.returned}</li>)}
          </ul>
        </Card>
      )}

      <Card className="p-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">How to interpret these numbers</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li><strong>Database total = "Not provided by API"</strong> means the backend has no endpoint reporting the true row count — we cannot know the database total from the frontend.</li>
          <li>If <strong>API returned (unique)</strong> equals <strong>Loaded into frontend</strong>, no frontend-side filter is dropping questions before the Question Browser.</li>
          <li>If a set's returned count equals the limit, you are probably seeing a backend truncation, not the real total.</li>
          <li>If <strong>Loaded into frontend</strong> is much smaller than expected and no set hit the limit, the database really only has that many published questions in the queried sets.</li>
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frontend Filter Inspector
// ---------------------------------------------------------------------------

function FilterInspectorPanel({ filterState, pool }: Props) {
  const implicit: string[] = [
    "Question Browser dedupes by question.id (case-insensitive).",
    "Playlist set/get uses identity equality on id — no dedup at playlist layer.",
    `Per-set fetch limit is hard-coded on the Studio (currently the value shown in API Inspector).`,
    "No published/hidden filter is applied client-side — backend decides what is returned.",
  ];
  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <StatRow k="Active search query" v={filterState.search ? <code>{filterState.search}</code> : "(none)"} />
        <StatRow k="Active category filter" v={filterState.category === "all" ? "all" : <code>{filterState.category}</code>} />
        <StatRow k="Active difficulty filter" v={filterState.difficulty === "all" ? "any" : <code>D{filterState.difficulty}</code>} />
        <StatRow k="Count before filters" v={filterState.totalBeforeFilters || pool.length} />
        <StatRow k="Count after filters" v={filterState.totalAfterFilters} />
        <StatRow k="Dropped by filters" v={Math.max(0, (filterState.totalBeforeFilters || pool.length) - filterState.totalAfterFilters)} />
      </Card>
      <Card className="p-3 text-xs">
        <p className="mb-1 font-semibold">Implicit filters / behaviors</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {implicit.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </Card>
    </div>
  );
}

function DatabaseInspectorPanel({ pool, apiRecordCount, fetchReport }: Props) {
  const meta = (q: QuizQuestion) => (q.metadata ?? {}) as Record<string, any>;

  const setOf = (q: QuizQuestion) => meta(q).set ?? meta(q).quiz_set ?? null;
  const fieldPresence = useMemo(() => {
    const fields = ["champion", "item", "rune", "summoner", "patch", "set", "quiz_set", "published", "hidden", "disabled"];
    const map: Record<string, number> = {};
    for (const f of fields) map[f] = 0;
    for (const q of pool) {
      const m = meta(q);
      for (const f of fields) if (m[f] != null && m[f] !== "") map[f]++;
    }
    return map;
  }, [pool]);

  const groups = useMemo(() => ({
    category: tally(pool.map((q) => q.category as any)),
    difficulty: tally(pool.map((q) => (q.difficulty ?? "—") as any)),
    format: tally(pool.map((q) => q.format as any)),
    quiz_set_meta: tally(pool.map((q) => setOf(q))),
    fetch_set_origin: fetchReport.per_set.map((e) => [e.set_name, e.returned] as [string, number]),
    champion: tally(pool.map((q) => meta(q).champion)),
    item: tally(pool.map((q) => meta(q).item)),
    rune: tally(pool.map((q) => meta(q).rune)),
    summoner: tally(pool.map((q) => meta(q).summoner)),
    patch: tally(pool.map((q) => meta(q).patch)),
  }), [pool, fetchReport.per_set]);

  const hidden = pool.filter((q) => meta(q).hidden).length;
  const disabled = pool.filter((q) => meta(q).disabled).length;
  const published = pool.filter((q) => meta(q).published === true).length;

  const NPA = <span className="italic text-amber-300">Not provided by API</span>;

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <StatRow k="API records (unique)" v={apiRecordCount} />
        <StatRow k="Loaded questions" v={pool.length} />
        <StatRow k="Has 'published' field" v={fieldPresence.published > 0 ? `${fieldPresence.published} / ${pool.length}` : NPA} tone={fieldPresence.published > 0 ? undefined : "warn"} />
        <StatRow k="Marked published=true" v={fieldPresence.published > 0 ? published : NPA} />
        <StatRow k="Marked hidden" v={fieldPresence.hidden > 0 ? hidden : NPA} tone={hidden ? "warn" : undefined} />
        <StatRow k="Marked disabled" v={fieldPresence.disabled > 0 ? disabled : NPA} tone={disabled ? "warn" : undefined} />
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">Metadata field coverage</div>
        <div className="grid grid-cols-2 gap-x-3 p-3 text-xs sm:grid-cols-3 md:grid-cols-5">
          {Object.entries(fieldPresence).map(([f, n]) => (
            <div key={f} className="flex justify-between border-b border-white/5 py-1">
              <code>{f}</code>
              <span className={n === 0 ? "text-amber-300" : "text-muted-foreground"}>{n === 0 ? "n/a" : `${n}/${pool.length}`}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(groups).map(([k, rows]) => (
          <Card key={k} className="overflow-hidden">
            <div className="border-b border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              By {k.replace(/_/g, " ")} <span className="float-right opacity-60">{rows.length}</span>
            </div>
            <ScrollArea className="h-44">
              <div className="divide-y divide-white/5">
                {rows.length === 0 && <div className="px-3 py-2 text-xs text-amber-300">Not provided by API</div>}
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

// ---------------------------------------------------------------------------
// buildReports — single source of truth for every exported artifact.
// ---------------------------------------------------------------------------

type ReportBundle = {
  diagnosticsJson: string;
  eventsLog: string;
  projectContextMd: string;
  lovablePrompt: string;
  chatgptContext: string;
};

function buildReports(props: Props): ReportBundle {
  const { snapshot, pool, playlistItems, apiStatus, apiError, usingFallback, apiRecordCount, bcConnected, lastSyncAt, fetchReport, filterState, mockFallbackCount } = props;
  const changelog = devToolsRepository.listChangelog();
  const docs = devToolsRepository.listDocs();
  const events = devToolsRepository.listEvents();

  const NOT_PROVIDED = "Not provided by API";

  const inventory = {
    database_total: NOT_PROVIDED,
    api_returned_raw: fetchReport.raw_total_across_sets,
    api_returned_unique: fetchReport.unique_total,
    duplicate_questions_removed: fetchReport.duplicates_removed,
    loaded_into_frontend: pool.length,
    after_active_filters: filterState.totalAfterFilters,
    added_to_playlist: playlistItems.length,
    mock_fallback_count: mockFallbackCount,
    mock_fallback_active: usingFallback,
    data_source: fetchReport.data_source,
    served_from_cache: fetchReport.from_cache,
    cached_at: fetchReport.cached_at ? new Date(fetchReport.cached_at).toISOString() : null,
  };

  const apiDetails = {
    base_url: fetchReport.base_url,
    sets_request: fetchReport.sets_request_url,
    questions_template: fetchReport.questions_endpoint_template,
    per_set_limit: fetchReport.per_set_limit,
    sets_discovered: fetchReport.sets_count,
    sets_status: fetchReport.sets_status,
    sets_error: fetchReport.sets_error ?? null,
    pagination_metadata_available: fetchReport.pagination_metadata_available,
    pagination_note: fetchReport.pagination_note,
    duration_ms: fetchReport.duration_ms,
    started_at: fetchReport.started_at ? new Date(fetchReport.started_at).toISOString() : null,
    finished_at: fetchReport.finished_at ? new Date(fetchReport.finished_at).toISOString() : null,
    per_set: fetchReport.per_set.map((e) => ({
      set: e.set_name, status: e.status, limit: e.params.limit,
      returned: e.returned, truncated: e.returned === e.params.limit,
      duration_ms: e.duration_ms, error: e.error, request_url: e.request_url,
    })),
  };

  const pagination = {
    metadata_available: fetchReport.pagination_metadata_available,
    note: fetchReport.pagination_note,
    current_page: NOT_PROVIDED,
    total_pages: NOT_PROVIDED,
    page_size: NOT_PROVIDED,
    total_available_records: NOT_PROVIDED,
    next_page_available: NOT_PROVIDED,
    previous_page_available: NOT_PROVIDED,
  };

  const activeFilters = {
    search: filterState.search,
    category: filterState.category,
    difficulty: filterState.difficulty,
    total_before_filters: filterState.totalBeforeFilters,
    total_after_filters: filterState.totalAfterFilters,
    dropped_by_filters: Math.max(0, (filterState.totalBeforeFilters || pool.length) - filterState.totalAfterFilters),
  };

  const playbackConfig = {
    playback: snapshot.config.playback,
    repeatCount: snapshot.config.repeatCount,
    visuals: snapshot.config.visuals,
  };

  const broadcastStatus = {
    phase: snapshot.phase,
    playing: snapshot.playing,
    current_index: snapshot.currentIndex,
    current_question_id: snapshot.currentQuestion?.id ?? null,
    playlist_id: snapshot.playlistId ?? null,
    broadcast_channel_connected: bcConnected,
    last_snapshot_post: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
  };

  const timingConfig = snapshot.config.timing;

  const rendererState = {
    phase: snapshot.phase,
    phaseStartedAt: snapshot.phaseStartedAt ? new Date(snapshot.phaseStartedAt).toISOString() : null,
    phaseDurationMs: snapshot.phaseDurationMs,
    revealed_correct: snapshot.revealedCorrect ?? null,
    last_explanation_present: Boolean(snapshot.currentQuestion?.explanation),
  };

  const detectedLimitations = [
    fetchReport.per_set.filter((e) => e.returned === e.params.limit).length > 0
      ? `${fetchReport.per_set.filter((e) => e.returned === e.params.limit).length} set(s) hit the per-set limit (${fetchReport.per_set_limit}) — likely truncated.`
      : null,
    !fetchReport.pagination_metadata_available
      ? "API exposes no total-count or pagination metadata."
      : null,
    usingFallback ? "Mock fallback active — real database not contacted." : null,
    apiError ? `API error: ${apiError}` : null,
  ].filter(Boolean);

  const diagnostics = {
    versions: { app: APP_VERSION, diagnostics: DIAGNOSTICS_VERSION, export: EXPORT_VERSION },
    generated_at: new Date().toISOString(),
    inventory,
    api_details: apiDetails,
    pagination,
    active_filters: activeFilters,
    playback_config: playbackConfig,
    broadcast_status: broadcastStatus,
    timing_config: timingConfig,
    renderer_state: rendererState,
    detected_limitations: detectedLimitations,
  };

  const diagnosticsJson = JSON.stringify(diagnostics, null, 2);

  const eventsLog = events.map((e) =>
    `[${new Date(e.ts).toISOString()}] ${e.level.toUpperCase().padEnd(7)} ${e.source} — ${e.message}`,
  ).join("\n");

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
    "src/components/quiz-broadcast/DeveloperTools.tsx",
  ];

  const projectContextMd = [
    `# Mogsy Quiz Broadcast Studio — Project Context (v${APP_VERSION})`,
    `_Diagnostics v${DIAGNOSTICS_VERSION} · Export v${EXPORT_VERSION} · Generated ${new Date().toISOString()}_`,
    "",
    "## Purpose",
    "Admin-only 24/7 livestream studio for the Mogsy League quiz. Runs in a browser, outputs a clean renderer window for OBS capture.",
    "",
    "## Architecture",
    "- Engine (pure state machine) → Studio (control room) → Renderer (presentation).",
    "- Studio publishes EngineSnapshot over BroadcastChannel; the popup at /admin/quiz-broadcast/view is a passive subscriber.",
    "- Latest snapshot mirrored to localStorage so the popup restores state after tab discard / visibility change.",
    "- Dev Tools data flows through DevToolsRepository (localStorage today, swappable to backend).",
    "",
    "## Current Features",
    "- Playlist builder + saved playlists.",
    "- Playback modes: sequential, random, weighted random, random no-repeat, loop playlist, loop single, repeat N, forever.",
    "- Visual config: aspect (16:9 / 9:16), theme, countdown style, badge toggles, QR code, logo.",
    "- Mock question fallback when /api/quiz is unreachable.",
    "- Developer Tools: diagnostics, API inspector, DB inspector, event log, changelog, docs, presets, OBS help.",
    "- Export Center: one-click bundle of diagnostics, events, project context, Lovable prompt, ChatGPT brief.",
    "",
    "## Current Configuration",
    "```json",
    JSON.stringify({ playback: playbackConfig, timing: timingConfig, broadcast: broadcastStatus }, null, 2),
    "```",
    "",
    "## Question Inventory",
    "```json",
    JSON.stringify(inventory, null, 2),
    "```",
    "",
    "## API Request Details",
    "```json",
    JSON.stringify(apiDetails, null, 2),
    "```",
    "",
    "## Pagination Diagnostics",
    "```json",
    JSON.stringify(pagination, null, 2),
    "```",
    "",
    "## Renderer State",
    "```json",
    JSON.stringify(rendererState, null, 2),
    "```",
    "",
    "## Known Limitations",
    detectedLimitations.length === 0 ? "- None detected." : detectedLimitations.map((l) => `- ${l}`).join("\n"),
    "",
    "## Files Involved",
    filesInvolved.map((f) => `- ${f}`).join("\n"),
    "",
    "## TODOs / Roadmap",
    "- Add server-side total-count endpoint so Inventory can report true DB size.",
    "- Migrate DevToolsRepository to backend for shared team data.",
    "- Paginated question loading + server-side filters.",
    "",
    "## Changelog (recent)",
    changelog.slice(0, 8).map((c) => `### v${c.version} — ${c.title}\n${c.notes.map((n) => `- ${n}`).join("\n")}`).join("\n\n"),
    "",
    "## Documentation",
    docs.map((d) => `### ${d.title}\n${d.body}`).join("\n\n"),
    "",
    "## Implementation Notes",
    "- Studio's React Query returns `{ questions, report }` so the API Inspector traces the same request the Question Browser consumes.",
    "- Subscriber (Broadcast Window) auto-recovers from cached snapshot on mount/visibility, never restarts the engine on tab focus.",
  ].join("\n");

  const lovablePrompt = [
    `Continue work on the Mogsy Quiz Broadcast Studio (v${APP_VERSION}).`,
    "",
    "Architecture: Engine (src/lib/quiz-broadcast/engine.ts) → Studio (src/pages/admin/AdminQuizBroadcast.tsx) → Renderer (src/components/quiz-broadcast/BroadcastRenderer.tsx). Studio and Broadcast Window (/admin/quiz-broadcast/view) sync over BroadcastChannel('mogsy-quiz-broadcast'). Dev Tools data flows through DevToolsRepository.",
    "",
    "Current state:",
    `- Questions loaded: ${apiRecordCount} (fallback: ${usingFallback}, source: ${fetchReport.data_source}).`,
    `- Playlist size: ${playlistItems.length}. Phase: ${snapshot.phase}. Playback: ${snapshot.config.playback}.`,
    `- API: ${quizApi.baseUrl} (${apiStatus}).`,
    `- Inventory: api_unique=${fetchReport.unique_total}, after_filters=${filterState.totalAfterFilters}, dup_removed=${fetchReport.duplicates_removed}.`,
    `- Limitations: ${detectedLimitations.length ? detectedLimitations.join(" | ") : "none detected"}.`,
    "",
    "Keep changes admin-gated under /admin/quiz-broadcast and respect the Engine/Studio/Renderer split. Persist any new dev-tools data through DevToolsRepository, never directly via localStorage in components.",
  ].join("\n");

  const chatgptContext = [
    `Mogsy Quiz Broadcast Studio — technical brief (v${APP_VERSION}).`,
    "Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + React Query. External quiz API at " + quizApi.baseUrl + ".",
    "",
    "Layering:",
    "- BroadcastEngine: state machine (phase, playlist, timers).",
    "- AdminQuizBroadcast: instantiates the engine, owns config and playlists, publishes snapshots over BroadcastChannel.",
    "- QuizBroadcastView: passive subscriber, renders BroadcastRenderer.",
    "- DevToolsRepository: abstraction layer for docs/changelog/events/presets.",
    "",
    "Phases: question → reveal → explanation → transition → (next question).",
    "Reveal: tries question.metadata.correct_answer first, falls back to POST /api/quiz/attempts.",
    "",
    `Inventory: ${JSON.stringify(inventory)}`,
    `Broadcast: ${JSON.stringify(broadcastStatus)}`,
    detectedLimitations.length ? `Known issues: ${detectedLimitations.join("; ")}` : "",
  ].filter(Boolean).join("\n");

  return { diagnosticsJson, eventsLog, projectContextMd, lovablePrompt, chatgptContext };
}

function ExportContextPanel(props: Props) {
  const r = buildReports(props);
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card className="p-3">
        <h4 className="text-sm font-semibold">Copy Project Context</h4>
        <p className="mt-1 text-xs text-muted-foreground">Comprehensive markdown brief — paste into ChatGPT or docs.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => copy(r.projectContextMd, "Project context copied")}><Copy className="mr-1 h-3 w-3" />Copy</Button>
          <Button size="sm" variant="outline" onClick={() => downloadText(`broadcast-project-context-${isoStamp()}.md`, r.projectContextMd, "text/markdown")}><Download className="mr-1 h-3 w-3" />Export</Button>
        </div>
      </Card>
      <Card className="p-3">
        <h4 className="text-sm font-semibold">Lovable Continuation Prompt</h4>
        <p className="mt-1 text-xs text-muted-foreground">Drop into a new Lovable chat to keep building with full context.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => copy(r.lovablePrompt, "Lovable prompt copied")}><Copy className="mr-1 h-3 w-3" />Copy</Button>
          <Button size="sm" variant="outline" onClick={() => downloadText(`broadcast-lovable-prompt-${isoStamp()}.txt`, r.lovablePrompt)}><Download className="mr-1 h-3 w-3" />Export</Button>
        </div>
      </Card>
      <Card className="p-3">
        <h4 className="text-sm font-semibold">ChatGPT Context</h4>
        <p className="mt-1 text-xs text-muted-foreground">Compact technical brief for architecture / debugging questions.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => copy(r.chatgptContext, "ChatGPT context copied")}><Copy className="mr-1 h-3 w-3" />Copy</Button>
          <Button size="sm" variant="outline" onClick={() => downloadText(`broadcast-chatgpt-context-${isoStamp()}.txt`, r.chatgptContext)}><Download className="mr-1 h-3 w-3" />Export</Button>
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
        <TabsTrigger value="inv"><Layers className="mr-1.5 h-3.5 w-3.5" />Inventory</TabsTrigger>
        <TabsTrigger value="api"><Bug className="mr-1.5 h-3.5 w-3.5" />API Inspector</TabsTrigger>
        <TabsTrigger value="db"><Database className="mr-1.5 h-3.5 w-3.5" />DB Inspector</TabsTrigger>
        <TabsTrigger value="filters"><Filter className="mr-1.5 h-3.5 w-3.5" />Filters</TabsTrigger>
        <TabsTrigger value="events"><History className="mr-1.5 h-3.5 w-3.5" />Event Log</TabsTrigger>
        <TabsTrigger value="changelog"><FileText className="mr-1.5 h-3.5 w-3.5" />Changelog</TabsTrigger>
        <TabsTrigger value="docs"><BookOpen className="mr-1.5 h-3.5 w-3.5" />Documentation</TabsTrigger>
        <TabsTrigger value="export"><Share2 className="mr-1.5 h-3.5 w-3.5" />Export Context</TabsTrigger>
        <TabsTrigger value="presets"><Save className="mr-1.5 h-3.5 w-3.5" />Presets</TabsTrigger>
        <TabsTrigger value="obs"><Tv2 className="mr-1.5 h-3.5 w-3.5" />OBS Help</TabsTrigger>
      </TabsList>
      <TabsContent value="diag" className="pt-3"><DiagnosticsPanel {...props} /></TabsContent>
      <TabsContent value="inv" className="pt-3"><InventorySummaryPanel {...props} /></TabsContent>
      <TabsContent value="api" className="pt-3"><ApiInspectorPanel {...props} /></TabsContent>
      <TabsContent value="db" className="pt-3"><DatabaseInspectorPanel {...props} /></TabsContent>
      <TabsContent value="filters" className="pt-3"><FilterInspectorPanel {...props} /></TabsContent>
      <TabsContent value="events" className="pt-3"><EventLogPanel /></TabsContent>
      <TabsContent value="changelog" className="pt-3"><ChangelogPanel /></TabsContent>
      <TabsContent value="docs" className="pt-3"><DocsPanel /></TabsContent>
      <TabsContent value="export" className="pt-3"><ExportContextPanel {...props} /></TabsContent>
      <TabsContent value="presets" className="pt-3"><PresetsPanel {...props} /></TabsContent>
      <TabsContent value="obs" className="pt-3"><ObsHelpPanel /></TabsContent>
    </Tabs>
  );
}
