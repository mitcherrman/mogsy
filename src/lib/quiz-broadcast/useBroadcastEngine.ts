import { useEffect, useState } from "react";
import type { EngineSnapshot } from "./types";
import { createPublisher, createSubscriber, type SubscriberDiagnostics } from "./channel";
import { getBroadcastEngine } from "./engineSingleton";
import { publishLiveSnapshot } from "./liveSync";

/**
 * Studio hook — owns one BroadcastEngine instance and republishes its
 * snapshots over BroadcastChannel so any open Broadcast Window stays in sync.
 */
export function useBroadcastEngine() {
  // Singleton — survives React component remounts (auth re-checks, layout
  // re-renders, route remounts). The hook only attaches; it never destroys.
  const engine = getBroadcastEngine();
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => engine.snapshot());

  useEffect(() => {
    const publisher = createPublisher();
    const unsub = engine.subscribe((s) => {
      setSnapshot(s);
      publisher.post(s);
      // Mirror to Supabase so the public OBS viewer (/broadcast/live-view)
      // stays in sync — BroadcastChannel can't reach a separate browser.
      publishLiveSnapshot(s);
    });
    const unsubReq = publisher.onRequest(() => publisher.post(engine.snapshot()));
    return () => {
      unsub();
      unsubReq();
      publisher.close();
      // NOTE: do NOT call engine.destroy() here. The engine is a process-
      // wide singleton; destroying it on unmount is what caused playback
      // state to vanish on remount.
    };
  }, [engine]);

  return { engine, snapshot };
}

/**
 * Broadcast Window hook — passive subscriber. Renders whatever the Studio
 * publishes. No engine instance, no controls.
 */
export function useBroadcastSubscriber() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [diagnostics, setDiagnostics] = useState<SubscriberDiagnostics>({
    lastMessageAt: null,
    lastVisibilityChangeAt: null,
    lastRestoreAt: null,
    reconnectCount: 0,
    restoreFromCache: false,
  });
  useEffect(() => {
    return createSubscriber({
      onSnapshot: setSnapshot,
      onDiagnostics: setDiagnostics,
      onLog: (level, msg) => {
        // eslint-disable-next-line no-console
        console[level === "warn" ? "warn" : "log"](`[broadcast-window] ${msg}`);
      },
    });
  }, []);
  return { snapshot, diagnostics };
}