import { useEffect, useState } from "react";
import type { EngineSnapshot } from "@/lib/quiz-broadcast/types";

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function BroadcastStats({ snapshot }: { snapshot: EngineSnapshot }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const runtime = snapshot.startedAt ? now - snapshot.startedAt : 0;
  const remaining = Math.max(0, snapshot.playlistLength - (snapshot.currentIndex + 1));
  const cycle =
    snapshot.config.timing.questionMs +
    snapshot.config.timing.revealMs +
    snapshot.config.timing.explanationMs +
    snapshot.config.timing.transitionMs +
    snapshot.config.timing.delayBeforeNextMs;

  const items: [string, string][] = [
    ["Playlist", snapshot.playlistName ?? "(unsaved)"],
    ["Question #", `${Math.min(snapshot.currentIndex + 1, snapshot.playlistLength)} / ${snapshot.playlistLength}`],
    ["Questions played", String(snapshot.questionsPlayed)],
    ["Questions remaining", String(remaining)],
    ["Elapsed runtime", fmtDuration(runtime)],
    ["Current phase", snapshot.phase],
    ["Avg cycle", `${(cycle / 1000).toFixed(1)}s`],
    ["Playback", snapshot.config.playback],
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
          <div className="truncate text-sm font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}