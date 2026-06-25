import { useEffect, useMemo, useState } from "react";
import { BroadcastEngine } from "./engine";
import type { EngineSnapshot } from "./types";
import { createPublisher, createSubscriber } from "./channel";

/**
 * Studio hook — owns one BroadcastEngine instance and republishes its
 * snapshots over BroadcastChannel so any open Broadcast Window stays in sync.
 */
export function useBroadcastEngine() {
  const engine = useMemo(() => new BroadcastEngine(), []);
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => engine.snapshot());

  useEffect(() => {
    const publisher = createPublisher();
    const unsub = engine.subscribe((s) => {
      setSnapshot(s);
      publisher.post(s);
    });
    const unsubReq = publisher.onRequest(() => publisher.post(engine.snapshot()));
    return () => {
      unsub();
      unsubReq();
      publisher.close();
      engine.destroy();
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
  useEffect(() => {
    return createSubscriber(setSnapshot);
  }, []);
  return snapshot;
}