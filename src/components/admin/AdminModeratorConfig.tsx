import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Trash2, Check, X, RefreshCw, User, Clock } from "lucide-react";

interface Moderator {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at: string | null;
}

/**
 * The one place where admin_notifications.is_read still means something.
 *
 * Everywhere else it used to mean "an admin has seen this", which is per admin
 * and now lives in admin_notification_reads. Here it means the request has been
 * APPROVED or DENIED — and that is genuinely global: the approve path already
 * executed the delete, so a second admin must not be offered the buttons again
 * for a target that no longer exists. It is aliased to `isDispositioned` on the
 * way in so nothing in this file reads like read state.
 */
interface ModNotification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  metadata: any;
  /** admin_notifications.is_read — moderator-request disposition, NOT read state. */
  isDispositioned: boolean;
  created_at: string;
}

export default function AdminModeratorConfig() {
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [notifications, setNotifications] = useState<ModNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);

    // Get moderator user_ids
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "moderator" as any);

    if (roleData && roleData.length > 0) {
      const userIds = roleData.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, last_seen_at")
        .in("user_id", userIds);
      setModerators((profiles as Moderator[]) || []);
    } else {
      setModerators([]);
    }

    // Get mod-related notifications
    const { data: notifs } = await supabase
      .from("admin_notifications")
      .select("id, type, title, message, metadata, created_at, is_read")
      .in("type", ["mod_delete_request", "mod_action"])
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications(
      (notifs || []).map(({ is_read, ...rest }) => ({ ...rest, isDispositioned: is_read })),
    );

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  /**
   * Disposition + the acting admin's read receipt, in one round trip.
   *
   * These are two writes to two tables, and doing them as two independent
   * client calls leaves a real failure window: a request marked APPROVED but
   * still unread, or read but still showing Approve/Deny. `admin_resolve_mod_request`
   * does both in one transaction and derives the reader from auth.uid(), so
   * there is no admin id for this component to pass or get wrong.
   *
   * Only the ACTING admin gets a receipt. Other admins keep their own unread
   * state for this row, which is honest — they have not seen it — while the
   * disposition itself is global and stops them re-approving the same request.
   */
  const resolveRequest = async (notif: ModNotification, approved: boolean) => {
    const { data, error } = await supabase.rpc("admin_resolve_mod_request", {
      _notification_id: notif.id,
      _approved: approved,
    });
    if (error) return false;
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notif.id
          ? { ...n, isDispositioned: true, message: data ?? n.message }
          : n,
      ),
    );
    return true;
  };

  const handleApprove = async (notif: ModNotification) => {
    setActionLoading(notif.id);
    const meta = notif.metadata || {};

    try {
      // Execute the deletion based on target type
      if (meta.target_type === "item") {
        await supabase.from("preset_items").delete().eq("id", meta.target_id);
      } else if (meta.target_type === "league") {
        await supabase.from("leagues").delete().eq("id", meta.target_id);
      }

      if (!(await resolveRequest(notif, true))) {
        // The delete already happened, so say what actually failed rather than
        // leaving the row looking unhandled with no explanation.
        toast.error("Deleted, but the request could not be marked approved");
      } else {
        toast.success("Delete approved and executed");
      }
    } catch {
      toast.error("Failed to execute delete");
    }
    setActionLoading(null);
  };

  const handleDeny = async (notif: ModNotification) => {
    setActionLoading(notif.id);
    if (await resolveRequest(notif, false)) {
      toast.success("Request denied");
    } else {
      toast.error("Could not deny that request");
    }
    setActionLoading(null);
  };

  const timeAgo = (d: string | null) => {
    if (!d) return "Never";
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Moderator Configuration
        </h3>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Moderators List */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Active Moderators ({moderators.length})
        </h4>
        {moderators.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moderators assigned.</p>
        ) : (
          <div className="space-y-1">
            {moderators.map((mod) => (
              <div
                key={mod.user_id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  {mod.avatar_url ? (
                    <img src={mod.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{mod.display_name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Last seen {timeAgo(mod.last_seen_at)}
                  </p>
                </div>
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/30 text-[10px]">
                  <ShieldCheck className="h-3 w-3 mr-1" /> Moderator
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mod Action Notifications */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Moderator Requests ({notifications.filter((n) => !n.isDispositioned).length} pending)
        </h4>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moderator requests yet.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const meta = notif.metadata || {};
              // Disposition, not read state: an approved request is handled
              // for every admin, whether or not they have personally seen it.
              const isHandled = notif.isDispositioned;

              return (
                <div
                  key={notif.id}
                  className={`rounded-xl border p-4 space-y-2 ${
                    isHandled
                      ? "border-border/50 bg-muted/30 opacity-60"
                      : "border-primary/30 bg-primary/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{notif.title}</p>
                      {notif.message && (
                        <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {meta.mod_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {meta.mod_name}
                          </span>
                        )}
                        {meta.target_name && (
                          <span>
                            <Trash2 className="h-3 w-3 inline mr-0.5" />
                            {meta.target_type}: {meta.target_name}
                          </span>
                        )}
                        <span>{timeAgo(notif.created_at)}</span>
                      </div>
                    </div>
                    {!isHandled && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs gap-1"
                          disabled={actionLoading === notif.id}
                          onClick={() => handleApprove(notif)}
                        >
                          <Check className="h-3 w-3" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={actionLoading === notif.id}
                          onClick={() => handleDeny(notif)}
                        >
                          <X className="h-3 w-3" /> Deny
                        </Button>
                      </div>
                    )}
                    {isHandled && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {notif.message?.includes("[APPROVED]") ? "Approved" : "Denied"}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
