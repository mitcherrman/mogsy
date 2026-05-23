import { useEffect, useState, useRef } from "react";
import { Bell, Trophy, Star, Megaphone, Gift, Zap, AlertTriangle, Crown, Info, UserPlus, UserCheck, ShieldAlert, MessageSquare, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface UserNotification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  image_url: string | null;
  created_at: string;
  target_type: string;
  target_league_ids: string[] | null;
  target_categories: string[] | null;
  profile_id: string | null;
  metadata: any;
  action_url: string | null;
}

interface FriendNotif {
  id: string;
  type: "request" | "accepted";
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  friendship_id: string;
  created_at: string;
}

interface AdminNotif {
  id: string;
  type: string;
  title: string;
  message: string | null;
  created_at: string;
  metadata: any;
}

const typeIcons: Record<string, typeof Bell> = {
  general: Bell,
  new_item: Star,
  elo_milestone: Trophy,
  new_league: Megaphone,
  promotion: Gift,
  update: Zap,
  warning: AlertTriangle,
  spotlight: Crown,
  friend_request: UserPlus,
  friend_accepted: UserCheck,
  comment_reply: MessageSquare,
  comment_reaction: MessageSquare,
};

const adminTypeIcons: Record<string, typeof Bell> = {
  image_report: ShieldAlert,
  image_report_critical: ShieldAlert,
  comment_report: MessageSquare,
  user_report: Flag,
  feedback: MessageSquare,
  mod_delete_request: ShieldAlert,
};

export default function UserNotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [friendNotifs, setFriendNotifs] = useState<FriendNotif[]>([]);
  const [adminNotifs, setAdminNotifs] = useState<AdminNotif[]>([]);
  const [readAdminIds, setReadAdminIds] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [readFriendIds, setReadFriendIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const myProfileIdRef = useRef<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
      myProfileIdRef.current = data?.id ?? null;
      // Check admin/master_admin role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const admin = (roles || []).some((r: any) => r.role === "admin" || r.role === "master_admin");
      setIsAdmin(admin);
      loadNotifications();
      loadFriendNotifs();
      if (admin) loadAdminNotifs();
    })();

    // Real-time subscription for system notifications
    const channel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_notifications" },
        (payload) => {
          const notif = payload.new as UserNotification;
          // Defense-in-depth: ignore any row that isn't actually targeted at this user.
          const isForMe =
            notif.target_type === "all" ||
            (notif.profile_id != null && notif.profile_id === myProfileIdRef.current);
          if (!isForMe) return;
          setNotifications(prev => [notif, ...prev]);
          toast(notif.title, {
            description: notif.message || undefined,
            icon: notif.image_url ? undefined : "🔔",
          });
        }
      )
      .subscribe();

    // Real-time for friendships
    const friendChannel = supabase
      .channel("friend-notifs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => { loadFriendNotifs(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(friendChannel);
    };
  }, [user]);

  // Admin-only: realtime stream of admin_notifications with toast
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("bell-admin-notifs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const n = payload.new as AdminNotif;
          setAdminNotifs(prev => [n, ...prev].slice(0, 30));
          toast(n.title, { description: n.message || undefined, icon: "🛡️" });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const loadNotifications = async () => {
    if (!user) return;

    const [notifRes, readRes] = await Promise.all([
      supabase.from("user_notifications").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("user_notification_reads").select("notification_id").eq("user_id", user.id),
    ]);

    setNotifications((notifRes.data as UserNotification[]) || []);
    setReadIds(new Set((readRes.data || []).map((r: any) => r.notification_id)));
    setLoaded(true);
  };

  const loadAdminNotifs = async () => {
    const { data } = await supabase
      .from("admin_notifications")
      .select("id, type, title, message, created_at, metadata, is_read")
      .order("created_at", { ascending: false })
      .limit(30);
    const items = (data || []) as any[];
    setAdminNotifs(items.map(({ is_read, ...rest }) => rest));
    setReadAdminIds(new Set(items.filter((n: any) => n.is_read).map((n: any) => n.id)));
  };

  const loadFriendNotifs = async () => {
    if (!user) return;
    // Get my profile
    const { data: myProfile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
    if (!myProfile) return;

    // Pending requests TO me
    const { data: pendingRows } = await supabase
      .from("friendships")
      .select("id, requester_id, created_at")
      .eq("addressee_id", myProfile.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10);

    // Recently accepted (where I was the requester)
    const { data: acceptedRows } = await supabase
      .from("friendships")
      .select("id, addressee_id, created_at")
      .eq("requester_id", myProfile.id)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .limit(5);

    const otherIds = [
      ...(pendingRows || []).map((r) => r.requester_id),
      ...(acceptedRows || []).map((r) => r.addressee_id),
    ];

    let profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    if (otherIds.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", otherIds);
      (profiles || []).forEach((p) => {
        if (p.id) profileMap.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url });
      });
    }

    const items: FriendNotif[] = [
      ...(pendingRows || []).map((r) => ({
        id: `fr-${r.id}`,
        type: "request" as const,
        profile_id: r.requester_id,
        display_name: profileMap.get(r.requester_id)?.display_name || "Someone",
        avatar_url: profileMap.get(r.requester_id)?.avatar_url || null,
        friendship_id: r.id,
        created_at: r.created_at,
      })),
      ...(acceptedRows || []).map((r) => ({
        id: `fa-${r.id}`,
        type: "accepted" as const,
        profile_id: r.addressee_id,
        display_name: profileMap.get(r.addressee_id)?.display_name || "Someone",
        avatar_url: profileMap.get(r.addressee_id)?.avatar_url || null,
        friendship_id: r.id,
        created_at: r.created_at,
      })),
    ];

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setFriendNotifs(items);
  };

  const markRead = async (id: string) => {
    if (!user || readIds.has(id)) return;
    setReadIds(prev => new Set(prev).add(id));
    await supabase.from("user_notification_reads").insert({ notification_id: id, user_id: user.id });
  };

  const markAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter(n => !readIds.has(n.id));
    if (unread.length === 0) return;
    const newReadIds = new Set(readIds);
    const inserts = unread.map(n => {
      newReadIds.add(n.id);
      return { notification_id: n.id, user_id: user.id };
    });
    setReadIds(newReadIds);
    await supabase.from("user_notification_reads").insert(inserts);
  };

  const unreadFriendCount = friendNotifs.filter(n => !readFriendIds.has(n.id)).length;
  const unreadAdminCount = adminNotifs.filter(n => !readAdminIds.has(n.id)).length;
  const unreadCount =
    notifications.filter(n => !readIds.has(n.id)).length +
    unreadFriendCount +
    unreadAdminCount;

  if (!user || !loaded) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 max-h-96 overflow-y-auto rounded-xl border border-border bg-card shadow-xl z-50">
          <div className="sticky top-0 bg-card border-b border-border px-3 py-2 flex items-center justify-between">
            <p className="text-xs font-bold text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[10px] text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 && friendNotifs.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-6">No notifications yet</p>
          ) : (
            <>
              {/* Admin notifications (admins only) */}
              {isAdmin && adminNotifs.map(an => {
                const Icon = adminTypeIcons[an.type] || ShieldAlert;
                const isRead = readAdminIds.has(an.id);
                return (
                  <button
                    key={`adm-${an.id}`}
                    onClick={async () => {
                      if (!isRead) {
                        setReadAdminIds(prev => new Set(prev).add(an.id));
                        await supabase.from("admin_notifications").update({ is_read: true }).eq("id", an.id);
                      }
                      setOpen(false);
                      navigate("/admin");
                    }}
                    className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 transition-colors ${
                      isRead ? "bg-card" : "bg-destructive/5"
                    } hover:bg-secondary`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${isRead ? "text-muted-foreground" : "text-foreground"}`}>
                          <span className="text-[9px] uppercase tracking-wider mr-1.5 px-1 py-0.5 rounded bg-destructive/15 text-destructive font-bold">Admin</span>
                          {an.title}
                        </p>
                        {an.message && (
                          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{an.message}</p>
                        )}
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(an.created_at).toLocaleString()}
                        </p>
                      </div>
                      {!isRead && (
                        <span className="h-2 w-2 rounded-full bg-destructive shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Friend notifications */}
              {friendNotifs.map(fn => {
                const isRead = readFriendIds.has(fn.id);
                const Icon = fn.type === "request" ? UserPlus : UserCheck;
                return (
                  <button
                    key={fn.id}
                    onClick={() => {
                      setReadFriendIds(prev => new Set(prev).add(fn.id));
                      setOpen(false);
                      if (fn.type === "request") {
                        window.dispatchEvent(new Event("open-friends-panel"));
                      } else {
                        navigate(`/user/${fn.profile_id}`);
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 transition-colors ${
                      isRead ? "bg-card" : "bg-primary/5"
                    } hover:bg-secondary`}
                  >
                    <div className="flex items-start gap-2">
                      {fn.avatar_url ? (
                        <img src={fn.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${isRead ? "text-muted-foreground" : "text-foreground"}`}>
                          {fn.type === "request"
                            ? `${fn.display_name} sent you a friend request`
                            : `${fn.display_name} accepted your friend request`}
                        </p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(fn.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {!isRead && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                );
              })}

              {/* System notifications */}
              {notifications.map(n => {
                const Icon = typeIcons[n.type] || Bell;
                const isRead = readIds.has(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      if (n.action_url) {
                        setOpen(false);
                        navigate(n.action_url);
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 transition-colors ${
                      isRead ? "bg-card" : "bg-primary/5"
                    } hover:bg-secondary`}
                  >
                    <div className="flex items-start gap-2">
                      {n.image_url ? (
                        <img src={n.image_url} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${isRead ? "text-muted-foreground" : "text-foreground"}`}>
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                        )}
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(n.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {!isRead && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
