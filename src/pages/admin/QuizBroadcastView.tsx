import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import BroadcastRenderer from "@/components/quiz-broadcast/BroadcastRenderer";
import { useBroadcastSubscriber } from "@/lib/quiz-broadcast/useBroadcastEngine";
import { devToolsRepository } from "@/lib/quiz-broadcast/dev-tools/repository";

/**
 * Broadcast Window — completely clean, no chrome, no controls. Designed for
 * OBS Window Capture. Subscribes to snapshots from the Studio over
 * BroadcastChannel and renders them via the shared BroadcastRenderer.
 */
export default function QuizBroadcastView() {
  const { snapshot, diagnostics } = useBroadcastSubscriber();
  const [params] = useSearchParams();
  const debug = params.get("debug") === "1";

  // Log key lifecycle events to the shared DevToolsRepository so the Studio's
  // Event Log tab surfaces visibility / reconnect / restore activity even
  // though they originate in the popup window.
  useEffect(() => {
    if (diagnostics.lastVisibilityChangeAt) {
      devToolsRepository.appendEvent({
        level: "info", source: "broadcast-window",
        message: `Visibility change @ ${new Date(diagnostics.lastVisibilityChangeAt).toLocaleTimeString()}`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics.lastVisibilityChangeAt]);
  useEffect(() => {
    if (diagnostics.reconnectCount > 0) {
      devToolsRepository.appendEvent({
        level: "info", source: "broadcast-window",
        message: `BroadcastChannel reconnect (#${diagnostics.reconnectCount})`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics.reconnectCount]);
  useEffect(() => {
    if (diagnostics.lastRestoreAt) {
      devToolsRepository.appendEvent({
        level: "success", source: "broadcast-window",
        message: `Snapshot restored from cache @ ${new Date(diagnostics.lastRestoreAt).toLocaleTimeString()}`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnostics.lastRestoreAt]);

  useEffect(() => {
    document.title = "Mogsy Quiz Broadcast";
    // Hide scrollbars so OBS gets a pristine frame.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.background = "#000";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const synced = useMemo(() => {
    if (!diagnostics.lastMessageAt) return false;
    return Date.now() - diagnostics.lastMessageAt < 10_000;
  }, [diagnostics.lastMessageAt, snapshot]);

  return (
    <>
      <BroadcastRenderer snapshot={snapshot} />
      {debug && (
        <div className="pointer-events-none fixed bottom-2 right-2 z-50 rounded-md border border-white/15 bg-black/70 px-3 py-2 font-mono text-[10px] leading-tight text-white/80 shadow-lg">
          <div>sync: <span className={synced ? "text-emerald-300" : "text-amber-300"}>{synced ? "live" : "idle"}</span></div>
          <div>last msg: {diagnostics.lastMessageAt ? new Date(diagnostics.lastMessageAt).toLocaleTimeString() : "—"}</div>
          <div>last vis: {diagnostics.lastVisibilityChangeAt ? new Date(diagnostics.lastVisibilityChangeAt).toLocaleTimeString() : "—"}</div>
          <div>last restore: {diagnostics.lastRestoreAt ? new Date(diagnostics.lastRestoreAt).toLocaleTimeString() : "—"}</div>
          <div>reconnects: {diagnostics.reconnectCount}</div>
          <div>from-cache: {String(diagnostics.restoreFromCache)}</div>
        </div>
      )}
    </>
  );
}