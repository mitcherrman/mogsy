import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureOwnerAuthorized } from "@/lib/admin-auth/ownerSession";
import {
  describeNotificationError,
  fetchAdminCounts,
  fetchAdminPage,
  reopenAdminItem,
  resolveAdminItems,
  setAdminState,
  type AdminAction,
  type AdminCounts,
  type AdminInboxItem,
  type InboxMode,
  isOwnerRefusal,
  type NotificationLoadError,
} from "./api";
import type { AdminCategory, AdminTab } from "./policy";
import { announceNotificationsChanged, nextSurfaceId, onNotificationsChanged } from "./sync";

export type LoadStatus = "loading" | "ready" | "error";

/**
 * #146: run an owner-gated read; if the server's owner check refuses it (a
 * lapsed trusted-device attestation), re-attest through the shared owner
 * session and retry ONCE: the same recovery the Railway admin gate and
 * runOwnerAction use. Never a loop, and nothing is authorized client-side:
 * if re-attestation fails the refusal stands (the owner session then moves
 * to needs_mfa and the bell stops asking).
 */
export async function withOwnerRetry<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!isOwnerRefusal(error) || !(await ensureOwnerAuthorized())) throw error;
    return read();
  }
}

/** A fresh realtime topic per subscription (see the channel effect). */
let channelSeq = 0;
export const nextChannelTopic = (surface: string): string => `${surface}:${++channelSeq}`;

/** Sanitized and logged once per failure: enough to diagnose, nothing private. */
export function reportLoadError(scope: "admin" | "player", error: unknown): NotificationLoadError {
  const detail = describeNotificationError(error);
  console.warn(`[notifications:${scope}] load failed`, detail);
  return detail;
}

interface Options {
  /** False for non-admins: nothing is fetched or subscribed. */
  enabled: boolean;
  userId: string | null;
  tab: AdminTab;
  pageSize?: number;
  /** Called with each newly arrived notification (bell toasts). */
  onArrival?: (item: { title: string; message: string | null }) => void;
}

/**
 * One admin's inbox: a tab page (keyset-paginated on the server), the
 * per-tab counters, and the lifecycle actions. Every state change is scoped
 * to auth.uid() by the server; nothing here can touch another admin's state.
 */
export function useAdminInbox({ enabled, userId, tab, pageSize = 30, onArrival }: Options) {
  const [items, setItems] = useState<AdminInboxItem[]>([]);
  const [counts, setCounts] = useState<AdminCounts | null>(null);
  const [mode, setMode] = useState<InboxMode>("v2");
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<NotificationLoadError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const surface = useRef(nextSurfaceId("admin-inbox")).current;
  const onArrivalRef = useRef(onArrival);
  onArrivalRef.current = onArrival;
  // Discards a response that belongs to a tab the user has already left.
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return;
    const gen = ++generation.current;
    try {
      const [page, c] = await withOwnerRetry(() =>
        Promise.all([fetchAdminPage(userId, tab, null, pageSize), fetchAdminCounts(userId)]),
      );
      if (gen !== generation.current) return;
      setItems(page.items);
      setHasMore(page.hasMore);
      setMode(page.mode);
      setCounts(c.counts);
      setError(null);
      setStatus("ready");
    } catch (e) {
      if (gen !== generation.current) return;
      setError(reportLoadError("admin", e));
      setStatus("error");
    }
  }, [enabled, userId, tab, pageSize]);

  // Post-action reconciliation always refreshes the CURRENT tab/view. An
  // action's own closure can be one render old (e.g. a permalink that marks
  // read and switches tab in the same effect); refreshing through it could
  // land after the new tab's load and overwrite the list with the old tab.
  const latestRefresh = useRef(refresh);
  latestRefresh.current = refresh;

  useEffect(() => {
    if (!enabled || !userId) {
      setItems([]);
      setCounts(null);
      setError(null);
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
      const page = await withOwnerRetry(() => fetchAdminPage(userId, tab, items[items.length - 1].cursor, pageSize));
      if (gen !== generation.current) return;
      setItems(prev => {
        const seen = new Set(prev.map(i => i.id));
        return [...prev, ...page.items.filter(i => !seen.has(i.id))];
      });
      setHasMore(page.hasMore);
    } catch (e) {
      setError(reportLoadError("admin", e));
      setStatus("error");
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, userId, hasMore, loadingMore, items, tab, pageSize]);

  // Realtime: new or changed notifications (inserts, dedupe bumps,
  // resolutions) and this admin's own receipts and states, from any tab or
  // device. Debounced: a burst of reports is one refetch.
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
    // A new topic every time: removeChannel() is async, and until the old
    // channel has closed, supabase.channel(sameTopic) hands back THAT channel,
    // whose subscribe() is then a no-op. After a tab switch the inbox stopped
    // receiving live changes until a reload (#146).
    const channel = supabase
      .channel(nextChannelTopic(surface))
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, payload => {
        if (payload.eventType === "INSERT") {
          const n = payload.new as { title?: string; message?: string | null };
          if (n?.title) onArrivalRef.current?.({ title: n.title, message: n.message ?? null });
        }
        scheduleRefresh();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_notification_reads", filter: `admin_user_id=eq.${userId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_notification_states", filter: `admin_user_id=eq.${userId}` },
        scheduleRefresh,
      )
      // Realtime does not replay what was missed while disconnected.
      .subscribe(s => {
        if (s === "SUBSCRIBED") scheduleRefresh();
      });
    const off = onNotificationsChanged("admin", surface, scheduleRefresh);
    return () => {
      off();
      if (timer.current != null) window.clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, surface, scheduleRefresh]);

  /** Optimistic, then reconciled with the server either way. */
  const act = useCallback(
    async (ids: string[] | null, action: AdminAction, bulkTab: AdminCategory | "all" | null = null) => {
      if (!userId) return { applied: 0, skipped: 0 };
      const target = ids ? new Set(ids) : null;
      const touches = (i: AdminInboxItem) => (target ? target.has(i.id) : true);
      setItems(prev =>
        prev.flatMap(i => {
          if (!touches(i)) return [i];
          if (action === "read") return [{ ...i, isRead: true }];
          if (action === "save") return [{ ...i, isSaved: true }];
          if (action === "unsave") return tab === "saved" ? [] : [{ ...i, isSaved: false }];
          if (action === "done") {
            if (i.category === "action" && !i.resolvedAt) return [i];
            return tab === "completed" || tab === "saved" ? [{ ...i, isDone: true, isRead: true }] : [];
          }
          if (action === "undone") return tab === "completed" ? [] : [{ ...i, isDone: false }];
          return [i];
        }),
      );
      try {
        return await setAdminState(userId, ids, action, bulkTab);
      } finally {
        announceNotificationsChanged("admin", surface);
        await latestRefresh.current();
      }
    },
    [userId, tab, surface, refresh],
  );

  const resolve = useCallback(
    async (ids: string[], resolution: "dismissed" | "actioned") => {
      try {
        return await resolveAdminItems(ids, resolution);
      } finally {
        announceNotificationsChanged("admin", surface);
        await latestRefresh.current();
      }
    },
    [surface, refresh],
  );

  const reopen = useCallback(
    async (id: string) => {
      try {
        return await reopenAdminItem(id);
      } finally {
        announceNotificationsChanged("admin", surface);
        await latestRefresh.current();
      }
    },
    [surface, refresh],
  );

  return { items, counts, mode, status, error, hasMore, loadingMore, refresh, loadMore, act, resolve, reopen };
}
