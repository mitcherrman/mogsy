import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPlayerPage,
  fetchPlayerSummary,
  setPlayerState,
  type InboxMode,
  type PlayerAction,
  type PlayerInboxItem,
  type PlayerSummary,
  type PlayerView,
} from "./api";
import { announceNotificationsChanged, nextSurfaceId, onNotificationsChanged } from "./sync";
import type { LoadStatus } from "./useAdminInbox";

interface Options {
  enabled: boolean;
  userId: string | null;
  /** Auth signup time: the legacy path shows no broadcast older than the account. */
  signupAt?: string | null;
  view?: PlayerView;
  pageSize?: number;
  /** Called once per notification that newly arrives in the ACTIVE inbox. */
  onArrival?: (item: PlayerInboxItem) => void;
}

const deriveSummary = (items: PlayerInboxItem[]): PlayerSummary => ({
  unread: items.filter(i => !i.isRead).length,
  active: items.length,
  actionable: items.filter(i => i.type === "friend_request" && !i.resolvedAt).length,
  saved: items.filter(i => i.isSaved).length,
});

/**
 * One player's inbox. The server decides membership (active, not done, not
 * expired unless saved, not resolved, not muted, addressed to me) and the
 * badge count; this hook renders it and keeps it live.
 */
export function usePlayerInbox({
  enabled,
  userId,
  signupAt = null,
  view = "inbox",
  pageSize = 30,
  onArrival,
}: Options) {
  const [items, setItems] = useState<PlayerInboxItem[]>([]);
  const [summary, setSummary] = useState<PlayerSummary>({ unread: 0, active: 0, actionable: 0, saved: 0 });
  const [mode, setMode] = useState<InboxMode>("v2");
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const surface = useRef(nextSurfaceId("player-inbox")).current;
  const generation = useRef(0);
  const known = useRef<Set<string> | null>(null);
  const onArrivalRef = useRef(onArrival);
  onArrivalRef.current = onArrival;

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return;
    const gen = ++generation.current;
    try {
      const [page, s] = await Promise.all([
        fetchPlayerPage(userId, view, null, pageSize, signupAt),
        fetchPlayerSummary(),
      ]);
      if (gen !== generation.current) return;
      // Arrival = a row present now that was absent from the previous load.
      // The first load seeds `known` and announces nothing.
      if (view === "inbox") {
        if (known.current) {
          for (const item of page.items) {
            if (!known.current.has(item.id) && !item.isRead) onArrivalRef.current?.(item);
          }
        }
        known.current = new Set([...(known.current ?? []), ...page.items.map(i => i.id)]);
      }
      setItems(page.items);
      setHasMore(page.hasMore);
      setMode(page.mode);
      setSummary(s ?? deriveSummary(page.items));
      setStatus("ready");
    } catch {
      if (gen === generation.current) setStatus("error");
    }
  }, [enabled, userId, view, pageSize, signupAt]);

  // Post-action reconciliation always refreshes the CURRENT tab/view. An
  // action's own closure can be one render old (e.g. a permalink that marks
  // read and switches tab in the same effect); refreshing through it could
  // land after the new tab's load and overwrite the list with the old tab.
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;

  useEffect(() => {
    known.current = null;
    if (!enabled || !userId) {
      setItems([]);
      setStatus("loading");
      return;
    }
    setStatus("loading");
    void refresh();
  }, [enabled, userId, refresh]);

  const loadMore = useCallback(async () => {
    if (!enabled || !userId || !hasMore || loadingMore || items.length === 0) return;
    setLoadingMore(true);
    const gen = generation.current;
    try {
      const page = await fetchPlayerPage(userId, view, items[items.length - 1].cursor, pageSize, signupAt);
      if (gen !== generation.current) return;
      setItems(prev => {
        const seen = new Set(prev.map(i => i.id));
        return [...prev, ...page.items.filter(i => !seen.has(i.id))];
      });
      setHasMore(page.hasMore);
    } catch {
      setStatus("error");
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, userId, hasMore, loadingMore, items, view, pageSize, signupAt]);

  const timer = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void refresh();
    }, 250);
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const channel = supabase
      .channel(surface)
      // New rows and server-side lifecycle changes (a friend request becoming
      // non-actionable, a report update superseding the previous one). RLS
      // delivers only rows this account may read; the server RPC re-scopes.
      .on("postgres_changes", { event: "*", schema: "public", table: "user_notifications" }, scheduleRefresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notification_reads", filter: `user_id=eq.${userId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notification_states", filter: `user_id=eq.${userId}` },
        scheduleRefresh,
      )
      .subscribe(s => {
        if (s === "SUBSCRIBED") scheduleRefresh();
      });
    const off = onNotificationsChanged("player", surface, scheduleRefresh);
    return () => {
      off();
      if (timer.current != null) window.clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, surface, scheduleRefresh]);

  const act = useCallback(
    async (ids: string[] | null, action: PlayerAction) => {
      if (!userId) return 0;
      const target = ids ? new Set(ids) : null;
      const previous = { items, summary };
      const leaves = (action === "done" || action === "done_all") && view === "inbox";
      setItems(prev =>
        prev.flatMap(i => {
          if (target && !target.has(i.id)) return [i];
          if (leaves) return [];
          if (action === "read" || action === "read_all") return [{ ...i, isRead: true }];
          if (action === "save") return [{ ...i, isSaved: true }];
          if (action === "unsave") return view === "saved" ? [] : [{ ...i, isSaved: false }];
          if (action === "undone") return view === "history" ? [] : [{ ...i, isDone: false }];
          return [i];
        }),
      );
      if (action === "read_all" || action === "done_all") setSummary(s => ({ ...s, unread: 0 }));
      try {
        const ids2 = ids ?? (action === "read_all" ? items.map(i => i.id) : null);
        return await setPlayerState(userId, ids2, action);
      } catch (error) {
        // Never leave a row looking read or gone when nothing was written.
        setItems(previous.items);
        setSummary(previous.summary);
        throw error;
      } finally {
        announceNotificationsChanged("player", surface);
        void latestRefresh.current();
      }
    },
    [userId, items, summary, view, surface, refresh],
  );

  return { items, summary, mode, status, hasMore, loadingMore, refresh, loadMore, act };
}
