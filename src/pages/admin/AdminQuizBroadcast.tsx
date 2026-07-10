import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { quizApi } from "@/lib/quiz/api";
import type { QuizQuestion } from "@/lib/quiz/api";
const DEFAULT_PER_SET_LIMIT = 200;

export type SetFetchEntry = {
  set_name: string;
  request_url: string;
  params: Record<string, string | number>;
  status: "ok" | "error";
  error?: string;
  returned: number;
  first_id?: string | number | null;
  last_id?: string | number | null;
  duration_ms: number;
};

export type FetchReport = {
  base_url: string;
  sets_endpoint: string;
  questions_endpoint_template: string;
  per_set_limit: number;
  sets_count: number | null;
  sets_request_url: string;
  sets_status: "ok" | "error" | "loading";
  sets_error?: string;
  per_set: SetFetchEntry[];
  raw_total_across_sets: number;
  duplicates_removed: number;
  unique_total: number;
  started_at: number | null;
  finished_at: number | null;
  duration_ms: number;
  pagination_metadata_available: boolean;
  pagination_note: string;
  data_source: "network" | "cache" | "fallback" | "unknown";
  from_cache: boolean;
  cached_at: number | null;
};

const EMPTY_FETCH_REPORT: FetchReport = {
  base_url: quizApi.baseUrl,
  sets_endpoint: "/api/quiz/sets",
  questions_endpoint_template: `/api/quiz/questions?set={set}&limit=${DEFAULT_PER_SET_LIMIT}`,
  per_set_limit: DEFAULT_PER_SET_LIMIT,
  sets_count: null,
  sets_request_url: `${quizApi.baseUrl}/api/quiz/sets`,
  sets_status: "loading",
  per_set: [],
  raw_total_across_sets: 0,
  duplicates_removed: 0,
  unique_total: 0,
  started_at: null,
  finished_at: null,
  duration_ms: 0,
  pagination_metadata_available: false,
  pagination_note: "Quiz API /api/quiz/questions does not expose total count or cursor metadata. Pagination support is unknown without a probe.",
  data_source: "unknown",
  from_cache: false,
  cached_at: null,
};

export type BrowserFilterState = {
  search: string;
  category: string;
  difficulty: string;
  totalBeforeFilters: number;
  totalAfterFilters: number;
};
import { useBroadcastEngine } from "@/lib/quiz-broadcast/useBroadcastEngine";
import { MOCK_BROADCAST_QUESTIONS } from "@/lib/quiz-broadcast/mock-questions";
import {
  loadConfig,
  loadPlaylists,
  saveConfig,
  upsertPlaylist,
  deletePlaylist as removePlaylist,
} from "@/lib/quiz-broadcast/storage";
import { loadActiveSession } from "@/lib/quiz-broadcast/session";
import type { BroadcastPlaylist } from "@/lib/quiz-broadcast/types";
import BroadcastRenderer from "@/components/quiz-broadcast/BroadcastRenderer";
import QuestionBrowser from "@/components/quiz-broadcast/QuestionBrowser";
import PlaylistBuilder from "@/components/quiz-broadcast/PlaylistBuilder";
import ControlPanel from "@/components/quiz-broadcast/ControlPanel";
import TimingSettings from "@/components/quiz-broadcast/TimingSettings";
import VisualSettings from "@/components/quiz-broadcast/VisualSettings";
import BroadcastStats from "@/components/quiz-broadcast/BroadcastStats";
import PlaylistLibrary from "@/components/quiz-broadcast/PlaylistLibrary";
import DeveloperTools from "@/components/quiz-broadcast/DeveloperTools";
import ShortsPanel from "@/components/quiz-broadcast/ShortsPanel";
import { devToolsRepository } from "@/lib/quiz-broadcast/dev-tools/repository";
import SEOHead from "@/components/SEOHead";

/**
 * Admin-only Broadcast Studio. Configures and controls the 24/7 quiz
 * broadcast. The actual viewer output lives at /admin/quiz-broadcast/view
 * and stays synced via BroadcastChannel.
 */
export default function AdminQuizBroadcast() {
  const { engine, snapshot } = useBroadcastEngine();
  const queryClient = useQueryClient();
  // Playlist is owned by the engine (durable, survives remount). The Studio
  // derives `items` from the engine snapshot and routes mutations back
  // through `engine.setPlaylist(...)` so persistence happens in one place.
  const items = snapshot.playlist;
  const setItems = (next: QuizQuestion[] | ((prev: QuizQuestion[]) => QuizQuestion[])) => {
    const value = typeof next === "function" ? (next as (p: QuizQuestion[]) => QuizQuestion[])(items) : next;
    engine.setPlaylist(value, { id: snapshot.playlistId ?? undefined, name: snapshot.playlistName ?? undefined });
  };
  const [playlists, setPlaylists] = useState<BroadcastPlaylist[]>(() => loadPlaylists());
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const lastPhaseRef = useRef<string>(snapshot.phase);
  const lastPlayingRef = useRef<boolean>(snapshot.playing);
  const bcConnected = typeof BroadcastChannel !== "undefined";
  const [filterState, setFilterState] = useState<BrowserFilterState>({
    search: "", category: "all", difficulty: "all", totalBeforeFilters: 0, totalAfterFilters: 0,
  });

  // Load saved standalone config on mount — but only when there's no durable
  // session driving the engine (a hydrated session brings its own config).
  useEffect(() => {
    if (!loadActiveSession()) {
      engine.setConfig(loadConfig());
    }
  }, [engine]);
  useEffect(() => {
    saveConfig(snapshot.config);
  }, [snapshot.config]);

  // Mirror engine snapshots into the dev-tools event log for traceability.
  useEffect(() => {
    setLastSyncAt(Date.now());
    if (snapshot.phase !== lastPhaseRef.current) {
      devToolsRepository.appendEvent({
        level: "info", source: "engine",
        message: `Phase ${lastPhaseRef.current} → ${snapshot.phase}`,
        data: { question_id: snapshot.currentQuestion?.id ?? null },
      });
      lastPhaseRef.current = snapshot.phase;
    }
    if (snapshot.playing !== lastPlayingRef.current) {
      devToolsRepository.appendEvent({
        level: snapshot.playing ? "success" : "warn",
        source: "engine",
        message: snapshot.playing ? "Broadcast started/resumed" : "Broadcast paused/stopped",
      });
      lastPlayingRef.current = snapshot.playing;
    }
  }, [snapshot]);

  // Fetch full question pool. Fall back to local mock data if the API is
  // unreachable or returns nothing so the studio remains usable offline.
  const { data, isLoading, isError, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["quiz-broadcast-pool"],
    queryFn: async (): Promise<{ questions: QuizQuestion[]; report: FetchReport }> => {
      const startedAt = Date.now();
      const report: FetchReport = { ...EMPTY_FETCH_REPORT, started_at: startedAt, sets_status: "loading", per_set: [] };
      let setsList: { name: string }[] = [];
      try {
        const sets = await quizApi.sets();
        setsList = sets.sets.map((s) => ({ name: String(s.name) }));
        report.sets_status = "ok";
        report.sets_count = setsList.length;
      } catch (err: any) {
        report.sets_status = "error";
        report.sets_error = err?.message || String(err);
      }
      const entries: SetFetchEntry[] = [];
      const buckets: { name: string; items: QuizQuestion[] }[] = [];
      await Promise.all(
        setsList.map(async (s) => {
          const params = { set: s.name, limit: DEFAULT_PER_SET_LIMIT };
          const url = `${quizApi.baseUrl}/api/quiz/questions?set=${encodeURIComponent(s.name)}&limit=${DEFAULT_PER_SET_LIMIT}`;
          const t0 = Date.now();
          try {
            const res = await quizApi.questions(s.name, DEFAULT_PER_SET_LIMIT);
            const items = res.questions ?? [];
            entries.push({
              set_name: s.name, request_url: url, params, status: "ok",
              returned: items.length,
              first_id: items[0]?.id ?? null,
              last_id: items[items.length - 1]?.id ?? null,
              duration_ms: Date.now() - t0,
            });
            buckets.push({ name: s.name, items });
          } catch (err: any) {
            entries.push({
              set_name: s.name, request_url: url, params, status: "error",
              error: err?.message || String(err), returned: 0, duration_ms: Date.now() - t0,
            });
            buckets.push({ name: s.name, items: [] });
          }
        }),
      );
      const seen = new Set<string | number>();
      const all: QuizQuestion[] = [];
      let raw = 0;
      for (const b of buckets) {
        for (const q of b.items) {
          raw++;
          if (seen.has(q.id)) continue;
          seen.add(q.id);
          all.push(q);
        }
      }
      const finishedAt = Date.now();
      const fullReport: FetchReport = {
        ...report,
        per_set: entries,
        raw_total_across_sets: raw,
        duplicates_removed: raw - all.length,
        unique_total: all.length,
        finished_at: finishedAt,
        duration_ms: finishedAt - startedAt,
        data_source: "network",
        from_cache: false,
        cached_at: finishedAt,
      };
      return { questions: all, report: fullReport };
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const questions = data?.questions;
  // When React Query serves from cache (no refetch in flight), surface that
  // distinction so the API Inspector stays internally consistent.
  const fetchReport: FetchReport = useMemo(() => {
    if (!data) return EMPTY_FETCH_REPORT;
    const servedFromCache = !isFetching && dataUpdatedAt !== data.report.cached_at;
    return {
      ...data.report,
      from_cache: servedFromCache || data.report.from_cache,
      data_source: servedFromCache ? "cache" : data.report.data_source,
    };
  }, [data, isFetching, dataUpdatedAt]);

  const pool = useMemo<QuizQuestion[]>(() => {
    if (questions && questions.length > 0) return questions;
    return MOCK_BROADCAST_QUESTIONS;
  }, [questions]);
  const usingFallback = !questions || questions.length === 0;

  useEffect(() => {
    if (isError) {
      toast.message("Quiz API unavailable — using fallback questions");
      devToolsRepository.appendEvent({ level: "error", source: "api", message: "Quiz API unreachable — fallback active" });
    }
  }, [isError]);

  useEffect(() => {
    if (questions) {
      devToolsRepository.appendEvent({
        level: "success", source: "api",
        message: `Loaded ${questions.length} questions from quiz API`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions?.length]);

  const openWindow = () => {
    const w = window.open("/admin/quiz-broadcast/view", "mogsy-broadcast", "popup=1,width=1280,height=720");
    if (!w) {
      toast.error("Popup blocked. Allow popups for this site.");
      devToolsRepository.appendEvent({ level: "error", source: "studio", message: "Broadcast Window popup blocked" });
    } else {
      devToolsRepository.appendEvent({ level: "info", source: "studio", message: "Opened Broadcast Window" });
    }
  };

  const onSavePlaylist = (name: string) => {
    const id = snapshot.playlistId ?? `pl_${Date.now()}`;
    const p: BroadcastPlaylist = { id, name, createdAt: Date.now(), questions: items };
    setPlaylists(upsertPlaylist(p));
    engine.setPlaylist(items, { id, name });
    toast.success(`Saved “${name}”`);
    devToolsRepository.appendEvent({ level: "success", source: "playlist", message: `Saved playlist "${name}" (${items.length})` });
  };
  const onLoadPlaylist = (p: BroadcastPlaylist) => {
    engine.setPlaylist(p.questions, { id: p.id, name: p.name });
    toast.success(`Loaded “${p.name}”`);
    devToolsRepository.appendEvent({ level: "info", source: "playlist", message: `Loaded playlist "${p.name}" (${p.questions.length})` });
  };
  const onDeletePlaylist = (id: string) => {
    setPlaylists(removePlaylist(id));
    devToolsRepository.appendEvent({ level: "warn", source: "playlist", message: `Deleted playlist ${id}` });
  };

  const onShortsGenerate = (questions: QuizQuestion[]) => {
    engine.setPlaylist(questions, { name: "3-Question Short" });
    devToolsRepository.appendEvent({
      level: "success",
      source: "shorts",
      message: `Shorts generated — ${questions.length} questions loaded`,
    });
  };

  const onToggleAspect = () => {
    const next = snapshot.config.visuals.aspect === "9:16" ? "16:9" : "9:16";
    engine.setConfig({ ...snapshot.config, visuals: { ...snapshot.config.visuals, aspect: next } });
    devToolsRepository.appendEvent({ level: "info", source: "shorts", message: `Switched aspect ratio to ${next}` });
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-4">
      <SEOHead title="Quiz Broadcast Studio · Admin" description="Configure and run the 24/7 Mogsy quiz broadcast." path="/admin/quiz-broadcast" />
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Quiz Broadcast Studio</CardTitle>
            <CardDescription>Configure, preview and control the 24/7 quiz livestream. Open the dedicated Broadcast Window for OBS capture.</CardDescription>
          </div>
          <Link
            to="/admin/quiz-review"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Review Questions
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          <ControlPanel engine={engine} snapshot={snapshot} onOpenWindow={openWindow} />
          <BroadcastStats snapshot={snapshot} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live Preview</CardTitle>
            <CardDescription>Mirrors the Broadcast Window in real time — same renderer.</CardDescription>
          </CardHeader>
          <CardContent>
            <BroadcastRenderer snapshot={snapshot} fitContainer />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Playlist</CardTitle>
            <CardDescription>Currently queued questions. Click a row to jump.</CardDescription>
          </CardHeader>
          <CardContent className="h-[480px]">
            <PlaylistBuilder
              items={items}
              currentIndex={snapshot.currentIndex}
              onChange={setItems}
              onJumpTo={(i) => engine.jumpTo(i)}
            />
          </CardContent>
        </Card>
      </div>

      <ShortsPanel
        onGenerate={onShortsGenerate}
        currentAspect={snapshot.config.visuals.aspect}
        onToggleAspect={onToggleAspect}
      />

      <Card>
        <CardContent className="p-4">
          <Tabs defaultValue="browse">
            <TabsList>
              <TabsTrigger value="browse">Question Browser</TabsTrigger>
              <TabsTrigger value="library">Saved Playlists</TabsTrigger>
              <TabsTrigger value="timing">Timing</TabsTrigger>
              <TabsTrigger value="visuals">Visuals</TabsTrigger>
              <TabsTrigger value="dev">Developer Tools</TabsTrigger>
            </TabsList>
            <TabsContent value="browse" className="h-[460px] pt-3">
              <QuestionBrowser
                questions={pool}
                loading={isLoading}
                usingFallback={usingFallback}
                onAdd={(q) => setItems((prev) => [...prev, q])}
                onFiltersChange={setFilterState}
              />
            </TabsContent>
            <TabsContent value="library" className="pt-3">
              <PlaylistLibrary
                playlists={playlists}
                currentItems={items}
                currentName={snapshot.playlistName}
                onSave={onSavePlaylist}
                onLoad={onLoadPlaylist}
                onDelete={onDeletePlaylist}
              />
            </TabsContent>
            <TabsContent value="timing" className="pt-3">
              <TimingSettings engine={engine} snapshot={snapshot} />
            </TabsContent>
            <TabsContent value="visuals" className="pt-3">
              <VisualSettings engine={engine} snapshot={snapshot} />
            </TabsContent>
            <TabsContent value="dev" className="pt-3">
              <DeveloperTools
                engine={engine}
                snapshot={snapshot}
                pool={pool}
                playlistItems={items}
                apiStatus={isLoading ? "loading" : isError ? "error" : "ok"}
                apiError={isError ? "Quiz API request failed" : null}
                usingFallback={usingFallback}
                apiRecordCount={questions?.length ?? 0}
                onRefetch={() => {
                  devToolsRepository.appendEvent({ level: "info", source: "api", message: "Manual refetch requested" });
                  void queryClient.invalidateQueries({ queryKey: ["quiz-broadcast-pool"] });
                }}
                bcConnected={bcConnected}
                lastSyncAt={lastSyncAt}
                fetchReport={fetchReport}
                filterState={filterState}
                mockFallbackCount={MOCK_BROADCAST_QUESTIONS.length}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}