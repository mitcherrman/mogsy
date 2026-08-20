import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Read state on this page is per admin.
 *
 * It used to be admin_notifications.is_read, a single global boolean: one admin
 * pressing "Read" cleared the row for every other admin, who then never saw the
 * report at all. Read state now lives in admin_notification_reads, keyed by the
 * reader's auth uid, so `is_read` is not selected or written here any more — it
 * survives only as the moderator-request disposition flag owned by
 * AdminModeratorConfig.
 */
interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  metadata: any;
  created_at: string;
}

export default function AdminNotifications({ onReadChange }: { onReadChange?: (unread: number) => void }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // The parent's badge must be told the count, but `onReadChange` is an inline
  // arrow in Admin.tsx and so is a new function on every render. Holding it in
  // a ref keeps it out of the effect dependencies and stops the reload loop.
  const onReadChangeRef = useRef(onReadChange);
  onReadChangeRef.current = onReadChange;

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const [notifRes, readRes] = await Promise.all([
      supabase
        .from("admin_notifications")
        .select("id, type, title, message, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("admin_notification_reads")
        .select("notification_id")
        .eq("admin_user_id", user.id),
    ]);
    setNotifications((notifRes.data as Notification[]) || []);
    setReadIds(new Set((readRes.data || []).map(r => r.notification_id)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // Realtime: a new admin notification carries no receipt for anybody, so it
  // arrives unread for this admin and for every other admin independently.
  useEffect(() => {
    const channel = supabase
      .channel("admin-notifications-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const n = payload.new as Notification;
          setNotifications(prev =>
            prev.some(x => x.id === n.id) ? prev : [n, ...prev].slice(0, 50)
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Own receipts, streamed, so this page and the bell agree without a reload.
  // RLS on admin_notification_reads means only this admin's own rows arrive.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("admin-notification-reads-stream")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notification_reads",
          filter: `admin_user_id=eq.${user.id}`,
        },
        (payload) => {
          const receipt = payload.new as { notification_id: string };
          setReadIds(prev =>
            prev.has(receipt.notification_id)
              ? prev
              : new Set(prev).add(receipt.notification_id)
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  /** One receipt per notification for the CURRENT admin. `admin_user_id` is
   *  supplied because PostgREST needs the value; the INSERT policy separately
   *  enforces `auth.uid() = admin_user_id`, so it cannot be forged. */
  const persistReads = async (ids: string[]): Promise<boolean> => {
    if (!user || ids.length === 0) return true;
    const { error } = await supabase
      .from("admin_notification_reads")
      .upsert(
        ids.map(id => ({ notification_id: id, admin_user_id: user.id })),
        { onConflict: "notification_id,admin_user_id", ignoreDuplicates: true },
      );
    return !error;
  };

  const markRead = async (id: string) => {
    if (!user || readIds.has(id)) return;
    setReadIds(prev => new Set(prev).add(id));
    const ok = await persistReads([id]);
    if (!ok) {
      setReadIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error("Could not mark that as read");
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !readIds.has(n.id)).map(n => n.id);
    if (unread.length === 0) return;
    const previous = readIds;
    setReadIds(prev => {
      const next = new Set(prev);
      unread.forEach(id => next.add(id));
      return next;
    });
    const ok = await persistReads(unread);
    if (!ok) {
      setReadIds(previous);
      toast.error("Could not mark those as read");
      return;
    }
    // Only this admin. Every other admin's unread count is untouched.
    toast.success("All marked as read for you");
  };

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  useEffect(() => {
    onReadChangeRef.current?.(unreadCount);
  }, [unreadCount]);

  if (loading) return <div className="text-center text-muted-foreground py-4">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Bell className="h-4 w-4" /> Notifications
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </h3>
        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={markAllRead} className="gap-1.5 text-xs">
            <Check className="h-3 w-3" /> Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 && (
        <p className="text-center text-muted-foreground text-sm py-8">No notifications yet.</p>
      )}

      <div className="space-y-2">
        {notifications.map(n => {
          const isRead = readIds.has(n.id);
          return (
          <div
            key={n.id}
            data-testid={`admin-notification-${n.id}`}
            data-read={isRead ? "true" : "false"}
            className={`rounded-xl border p-3 transition-colors ${
              isRead ? "border-border bg-card" : "border-primary/30 bg-primary/5"
            } ${n.type === "image_report_critical" ? "border-destructive/40" : ""}`}
          >
            <div className="flex items-start gap-2">
              {n.type === "image_report_critical" ? (
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              ) : (
                <Bell className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                {n.message && <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
              {!isRead && (
                <Button size="sm" variant="ghost" onClick={() => markRead(n.id)} className="h-7 text-xs">
                  Read
                </Button>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
