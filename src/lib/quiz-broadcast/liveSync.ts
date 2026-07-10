import { supabase } from "@/integrations/supabase/client";
import type { EngineSnapshot } from "./types";

/**
 * Supabase mirror of the live broadcast scene.
 *
 * BroadcastChannel/localStorage sync (./channel.ts) only reaches windows of
 * the SAME browser profile — an OBS Browser Source is a separate embedded
 * browser, so it never receives those messages. The Studio therefore also
 * mirrors each snapshot into the singleton `broadcast_live_state` row
 * (admin-write, public-read via RLS), and the public /broadcast/live-view
 * route subscribes to it over Supabase Realtime.
 *
 * Publishing is best-effort and read-only for viewers: subscribers never
 * write anything.
 */

const ROW_ID = "live";
const MIN_PUBLISH_INTERVAL_MS = 250;

/** Strip fields the public renderer never reads (the full playlist can be
 * large and there is no reason to ship every queued question publicly). */
function toPublicSnapshot(s: EngineSnapshot): EngineSnapshot {
  return { ...s, playlist: [] };
}

let lastPublishAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: EngineSnapshot | null = null;

async function upsert(snapshot: EngineSnapshot) {
  const { error } = await supabase
    .from("broadcast_live_state")
    .upsert({ id: ROW_ID, snapshot: toPublicSnapshot(snapshot) as unknown as never, updated_at: new Date().toISOString() });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[broadcast-live] publish failed:", error.message);
  }
}

/**
 * Publish a snapshot to Supabase, trailing-edge throttled so bursts of engine
 * emissions collapse into one write while the final state always lands.
 */
export function publishLiveSnapshot(snapshot: EngineSnapshot) {
  const now = Date.now();
  const elapsed = now - lastPublishAt;
  if (elapsed >= MIN_PUBLISH_INTERVAL_MS) {
    lastPublishAt = now;
    void upsert(snapshot);
    return;
  }
  pendingSnapshot = snapshot;
  if (!pendingTimer) {
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      if (pendingSnapshot) {
        lastPublishAt = Date.now();
        void upsert(pendingSnapshot);
        pendingSnapshot = null;
      }
    }, MIN_PUBLISH_INTERVAL_MS - elapsed);
  }
}

/**
 * Subscribe to the live broadcast snapshot: initial fetch, then Realtime
 * updates, with a slow polling fallback in case Realtime is unavailable.
 * Returns an unsubscribe function.
 */
export function subscribeLiveSnapshot(onSnapshot: (s: EngineSnapshot | null) => void) {
  let disposed = false;

  const fetchOnce = async () => {
    const { data, error } = await supabase
      .from("broadcast_live_state")
      .select("snapshot")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (disposed) return;
    if (error) {
      // eslint-disable-next-line no-console
      console.warn("[broadcast-live] fetch failed:", error.message);
      return;
    }
    onSnapshot((data?.snapshot as unknown as EngineSnapshot) ?? null);
  };

  void fetchOnce();

  const channel = supabase
    .channel("broadcast-live-state")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "broadcast_live_state" },
      (payload) => {
        if (disposed) return;
        const row = payload.new as { snapshot?: unknown } | null;
        if (row?.snapshot) onSnapshot(row.snapshot as EngineSnapshot);
      },
    )
    .subscribe();

  // Safety net: OBS keeps the page alive for hours; if the websocket drops
  // silently, a slow poll keeps the scene from freezing forever.
  const poll = setInterval(() => void fetchOnce(), 15_000);

  return () => {
    disposed = true;
    clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}
