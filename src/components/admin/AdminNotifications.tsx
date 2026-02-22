import { useEffect, useState } from "react";
import { Bell, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  metadata: any;
  created_at: string;
}

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    const { data } = await supabase
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setNotifications(data as Notification[]);
    setLoading(false);
  };

  const markRead = async (id: string) => {
    await supabase.from("admin_notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unread.length === 0) return;
    await supabase.from("admin_notifications").update({ is_read: true }).in("id", unread);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success("All marked as read");
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

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
        {notifications.map(n => (
          <div
            key={n.id}
            className={`rounded-xl border p-3 transition-colors ${
              n.is_read ? "border-border bg-card" : "border-primary/30 bg-primary/5"
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
              {!n.is_read && (
                <Button size="sm" variant="ghost" onClick={() => markRead(n.id)} className="h-7 text-xs">
                  Read
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
