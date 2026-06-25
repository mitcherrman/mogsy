import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { quizApi } from "@/lib/quiz/api";
import type { QuizQuestion } from "@/lib/quiz/api";
import { useBroadcastEngine } from "@/lib/quiz-broadcast/useBroadcastEngine";
import { MOCK_BROADCAST_QUESTIONS } from "@/lib/quiz-broadcast/mock-questions";
import {
  loadConfig,
  loadPlaylists,
  saveConfig,
  upsertPlaylist,
  deletePlaylist as removePlaylist,
} from "@/lib/quiz-broadcast/storage";
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
  const [items, setItems] = useState<QuizQuestion[]>([]);
  const [playlists, setPlaylists] = useState<BroadcastPlaylist[]>(() => loadPlaylists());
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const lastPhaseRef = useRef<string>(snapshot.phase);
  const lastPlayingRef = useRef<boolean>(snapshot.playing);
  const bcConnected = typeof BroadcastChannel !== "undefined";

  // Load saved config on mount.
  useEffect(() => {
    engine.setConfig(loadConfig());
  }, [engine]);
  useEffect(() => {
    saveConfig(snapshot.config);
  }, [snapshot.config]);

  // Sync local items into engine playlist on change.
  useEffect(() => {
    engine.setPlaylist(items, { id: snapshot.playlistId ?? undefined, name: snapshot.playlistName ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

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
  const { data: questions, isLoading, isError } = useQuery({
    queryKey: ["quiz-broadcast-pool"],
    queryFn: async () => {
      const sets = await quizApi.sets();
      const buckets = await Promise.all(
        sets.sets.map((s) => quizApi.questions(String(s.name), 200).catch(() => ({ questions: [] as QuizQuestion[] }))),
      );
      const seen = new Set<string | number>();
      const all: QuizQuestion[] = [];
      for (const b of buckets) {
        for (const q of b.questions) {
          if (seen.has(q.id)) continue;
          seen.add(q.id);
          all.push(q);
        }
      }
      return all;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

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
    setItems(p.questions);
    engine.setPlaylist(p.questions, { id: p.id, name: p.name });
    toast.success(`Loaded “${p.name}”`);
    devToolsRepository.appendEvent({ level: "info", source: "playlist", message: `Loaded playlist "${p.name}" (${p.questions.length})` });
  };
  const onDeletePlaylist = (id: string) => {
    setPlaylists(removePlaylist(id));
    devToolsRepository.appendEvent({ level: "warn", source: "playlist", message: `Deleted playlist ${id}` });
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
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}