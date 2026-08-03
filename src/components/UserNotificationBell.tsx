import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Megaphone, Zap, AlertTriangle, Info, Star, Trophy, UserPlus, UserCheck, ShieldAlert, MessageSquare, Flag, Swords, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useStatCheckInvites, type StatCheckInvite } from "@/hooks/useStatCheckInvites";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Types the bell is allowed to render, stated explicitly.
 *
 * This replaces the previous LEAGUE_ONLY_MODE-derived allowlist, which was
 * opaque about *why* a type was hidden and — because it listed only LoL product
 * types — silently discarded every automatically generated notification. All
 * four database triggers write into user_notifications, and none of the four
 * types they produce was on that list, so the rows accumulated unread and
 * unseen. The bell showed "No notifications yet" no matter what happened.
 *
 * The list is now a deny-by-default allowlist with a documented reason per
 * group. Anything absent — including a type introduced later by a migration the
 * client has not caught up with — is suppressed rather than rendered blind.
 */
const SUPPORTED_NOTIFICATION_TYPES = new Set([
  // Social, produced by notify_on_friendship_change() (20260523081658).
  "friend_request",
  "friend_accepted",
  // Admin-authored announcements. `general` is the historical default type and
  // is a legitimate site-wide announcement.
  "general",
  "update",
  "warning",
  "lol_quiz",
  "quiz_broadcast",
  "combat_lab",
  "lol_patch",
  "esports_quiz",
  "lol_site_notice",
]);

/**
 * Suppressed on purpose, so an unrecognised type and a deliberately hidden one
 * stay distinguishable when debugging. Kept as documentation — behaviour comes
 * from SUPPORTED_NOTIFICATION_TYPES alone, so nothing breaks if a type appears
 * in neither set.
 *
 *   comment_reply / comment_reaction — comment notifications are not activated
 *     yet; the triggers keep writing rows for when they are.
 *   new_item / elo_milestone / new_league / promotion / spotlight — legacy
 *     Mogsy social product, not part of the League experience.
 */
const INTENTIONALLY_SUPPRESSED_TYPES = new Set([
  "comment_reply",
  "comment_reaction",
  "new_item",
  "elo_milestone",
  "new_league",
  "promotion",
  "spotlight",
]);

export const isSupportedNotificationType = (type: string | null | undefined): boolean =>
  typeof type === "string" && SUPPORTED_NOTIFICATION_TYPES.has(type);

export const isIntentionallySuppressedType = (type: string | null | undefined): boolean =>
  typeof type === "string" && INTENTIONALLY_SUPPRESSED_TYPES.has(type);

interface UserNotification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  image_url: string | null;
  created_at: string;
  target_type: string;
  profile_id: string | null;
  metadata: any;
  action_url: string | null;
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
  update: Zap,
  warning: AlertTriangle,
  friend_request: UserPlus,
  friend_accepted: UserCheck,
  lol_quiz: Star,
  quiz_broadcast: Megaphone,
  combat_lab: Zap,
  lol_patch: Info,
  esports_quiz: Trophy,
  lol_site_notice: Bell,
};

const adminTypeIcons: Record<string, typeof Bell> = {
  image_report: ShieldAlert,
  image_report_critical: ShieldAlert,
  comment_report: MessageSquare,
  user_report: Flag,
  feedback: MessageSquare,
  mod_delete_request: ShieldAlert,
};

/** Live invites only. The backend drops expired rows from the inbox, but the
 *  poll is 30s wide — filtering here means a dead invite is never actionable. */
const isLiveInvite = (invite: StatCheckInvite, nowMs: number) => {
  const expiry = new Date(invite.expiresAt).getTime();
  return Number.isNaN(expiry) || expiry > nowMs;
};

export default function UserNotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Anonymous sessions are authenticated as far as Supabase is concerned, so
  // `user` alone is not enough of a gate — an anonymous visitor was being shown
  // a bell they can never receive anything in.
  const isAccount = Boolean(user && !user.is_anonymous);

  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [adminNotifs, setAdminNotifs] = useState<AdminNotif[]>([]);
  const [readAdminIds, setReadAdminIds] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const myProfileIdRef = useRef<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const {
    invites: statCheckInvites,
    accept: acceptInvite,
    acceptSwitch: acceptInviteSwitch,
    decline: declineInvite,
    refresh: refreshInvites,
    busyToken,
  } = useStatCheckInvites();

  // Ticks only while invites are on screen, so an invite that ages out
  // disappears without waiting for the next 30s poll.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (statCheckInvites.length === 0) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [statCheckInvites.length]);

  const liveInvites = useMemo(
    () => statCheckInvites.filter(invite => isLiveInvite(invite, nowMs)),
    [statCheckInvites, nowMs],
  );

  const [roomConflict, setRoomConflict] = useState<
    { invite: StatCheckInvite; mode: "empty" | "occupied" | "blocked"; message: string } | null
  >(null);

  const loadNotifications = useCallback(async () => {
    if (!user) return;

    // Only notifications created at or after the user's signup time.
    const signupCutoff = user.created_at ?? new Date(0).toISOString();

    const [notifRes, readRes] = await Promise.all([
      supabase
        .from("user_notifications")
        .select("*")
        .gte("created_at", signupCutoff)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("user_notification_reads").select("notification_id").eq("user_id", user.id),
    ]);

    // A failed read of either table means we genuinely do not know the state.
    // Surfacing that beats rendering a confidently empty bell.
    if (notifRes.error) throw notifRes.error;
    if (readRes.error) throw readRes.error;

    const myProfileId = myProfileIdRef.current;
    const rows = ((notifRes.data as UserNotification[]) || []).filter(n => {
      if (!isSupportedNotificationType(n.type)) return false;
      // The RLS policy grants admins every row, including other users' targeted
      // notifications. Without this the admin bell listed strangers' friend
      // requests. Recipient scoping belongs in the client too, not only in RLS.
      return n.target_type === "all" || (n.profile_id != null && n.profile_id === myProfileId);
    });

    setNotifications(rows);
    setReadIds(new Set((readRes.data || []).map((r: any) => r.notification_id)));
  }, [user]);

  const loadAdminNotifs = useCallback(async () => {
    const { data, error } = await supabase
      .from("admin_notifications")
      .select("id, type, title, message, created_at, metadata, is_read")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    const items = (data || []) as any[];
    setAdminNotifs(items.map(({ is_read, ...rest }) => rest));
    setReadAdminIds(new Set(items.filter((n: any) => n.is_read).map((n: any) => n.id)));
  }, []);

  useEffect(() => {
    if (!isAccount || !user) {
      setStatus("loading");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
        if (cancelled) return;
        myProfileIdRef.current = profile?.id ?? null;

        const { data: roles } = await supabase
          .from("user_roles").select("role").eq("user_id", user.id);
        if (cancelled) return;
        const admin = (roles || []).some((r: any) => r.role === "admin" || r.role === "master_admin");
        setIsAdmin(admin);

        await loadNotifications();
        if (admin) await loadAdminNotifs();
        if (!cancelled) setStatus("ready");
      } catch {
        // Never leave the bell stuck in "loading" — that is what made a failed
        // query indistinguishable from a slow one and hid the bell entirely.
        if (!cancelled) setStatus("error");
      }
    })();

    const channel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_notifications" },
        (payload) => {
          const notif = payload.new as UserNotification;
          const isForMe =
            notif.target_type === "all" ||
            (notif.profile_id != null && notif.profile_id === myProfileIdRef.current);
          if (!isForMe) return;
          if (!isSupportedNotificationType(notif.type)) return;
          const signedUpAt = user.created_at ? new Date(user.created_at).getTime() : 0;
          if (signedUpAt && new Date(notif.created_at).getTime() < signedUpAt) return;
          setNotifications(prev =>
            prev.some(n => n.id === notif.id) ? prev : [notif, ...prev]
          );
          toast(notif.title, {
            description: notif.message || undefined,
            icon: notif.image_url ? undefined : "🔔",
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isAccount, user, loadNotifications, loadAdminNotifs]);

  // Admin-only realtime stream of admin_notifications
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("bell-admin-notifs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        (payload) => {
          const n = payload.new as AdminNotif;
          setAdminNotifs(prev =>
            prev.some(x => x.id === n.id) ? prev : [n, ...prev].slice(0, 30)
          );
          toast(n.title, { description: n.message || undefined, icon: "🛡️" });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin]);

  const closePanel = useCallback(() => {
    setOpen(false);
    // Keyboard users must not be dropped at the top of the document.
    triggerRef.current?.focus();
  }, []);

  // Outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape closes and returns focus.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePanel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, closePanel]);

  /**
   * Persist read state, then reconcile. The previous version committed the
   * optimistic update and discarded the Supabase response entirely, so a failed
   * write left the row looking read until the next reload silently undid it.
   *
   * `ignoreDuplicates` makes this safe against the mark-one / mark-all race:
   * the table has UNIQUE(notification_id, user_id), and a plain insert raised
   * 23505 when both paths touched the same row.
   */
  const persistReads = async (ids: string[]): Promise<boolean> => {
    if (!user || ids.length === 0) return true;
    const { error } = await supabase
      .from("user_notification_reads")
      .upsert(
        ids.map(id => ({ notification_id: id, user_id: user.id })),
        { onConflict: "notification_id,user_id", ignoreDuplicates: true },
      );
    return !error;
  };

  const markRead = async (id: string) => {
    if (!user || readIds.has(id)) return;
    setReadIds(prev => new Set(prev).add(id));
    const ok = await persistReads([id]);
    if (!ok) {
      // Roll back so the badge keeps telling the truth.
      setReadIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const markAllRead = async () => {
    if (!user) return;
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
    }
  };

  /** Where a notification should take the user. Trigger-generated social rows
   *  carry no action_url, so their destination comes from the type. */
  const openNotification = (n: UserNotification) => {
    void markRead(n.id);
    if (n.type === "friend_request") {
      closePanel();
      window.dispatchEvent(new Event("open-friends-panel"));
      return;
    }
    if (n.type === "friend_accepted") {
      const target = n.metadata?.addressee_profile_id;
      if (target) {
        closePanel();
        navigate(`/user/${target}`);
        return;
      }
    }
    // Only in-app paths are navigable; an absolute URL would be treated as a
    // route and dead-end the user.
    if (n.action_url && n.action_url.startsWith("/")) {
      closePanel();
      navigate(n.action_url);
    }
  };

  const handleAcceptOutcome = (
    invite: StatCheckInvite,
    outcome: Awaited<ReturnType<typeof acceptInvite>>,
  ) => {
    if (outcome.ok) {
      setRoomConflict(null);
      setOpen(false);
      navigate(outcome.joinPath);
      return;
    }
    if (outcome.code === "SC_ACTIVE_ROOM_EXISTS" || outcome.code === "SC_SWITCH_CONFIRM_REQUIRED") {
      const details = outcome.details;
      // An active match is never auto-closed, and a room the user does not own
      // is not theirs to close. Both are dead ends, not confirmations.
      if (details?.room_state === "active") {
        setRoomConflict({
          invite,
          mode: "blocked",
          message: "Finish or leave your current match before joining this invite.",
        });
      } else if (details?.can_close === false) {
        setRoomConflict({ invite, mode: "blocked", message: outcome.message });
      } else if (details?.other_player_present) {
        setRoomConflict({ invite, mode: "occupied", message: outcome.message });
      } else {
        setRoomConflict({ invite, mode: "empty", message: outcome.message });
      }
      return;
    }
    if (outcome.code === "SC_SWITCH_ROOM_ACTIVE") {
      setRoomConflict({
        invite,
        mode: "blocked",
        message: "Finish or leave your current match before joining this invite.",
      });
      return;
    }
    // Everything else: show what the backend actually said, never a guess.
    setRoomConflict(null);
    toast.error(outcome.message || "Could not join that room");
  };

  /**
   * Two counts, deliberately not merged.
   *
   * `unreadCount` is informational and is what "Mark all read" clears.
   * `actionableCount` is pending Stat Check invites, which are resolved by
   * accepting or declining — never by reading. Folding invites into the unread
   * total made "Mark all read" look broken, because the badge could not reach
   * zero while an invite was still open.
   */
  const unreadCount =
    notifications.filter(n => !readIds.has(n.id)).length +
    adminNotifs.filter(n => !readAdminIds.has(n.id)).length;
  const actionableCount = liveInvites.length;
  const badgeCount = unreadCount + actionableCount;

  const badgeLabel = [
    unreadCount > 0 ? `${unreadCount} unread` : null,
    actionableCount > 0
      ? `${actionableCount} pending invitation${actionableCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean).join(", ");

  if (!isAccount) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={badgeLabel ? `Notifications: ${badgeLabel}` : "Notifications: none"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const next = !open;
          setOpen(next);
          // Opening the bell refetches now rather than showing whatever the
          // 30s poll last saw.
          if (next) void refreshInvites();
        }}
        className="relative flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {badgeCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold"
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          data-testid="notification-panel"
          className="absolute right-0 top-10 w-[calc(100vw-1.5rem)] max-w-80 max-h-96 overflow-y-auto rounded-xl border border-border bg-card shadow-xl z-50"
        >
          <div className="sticky top-0 bg-card border-b border-border px-3 py-2 flex items-center justify-between">
            <p className="text-xs font-bold text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-[10px] text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {status === "loading" && (
            <p data-testid="notification-loading" className="text-center text-muted-foreground text-xs py-6">
              Loading notifications…
            </p>
          )}

          {status === "error" && (
            <div data-testid="notification-error" className="px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">Couldn’t load your notifications.</p>
              <button
                type="button"
                onClick={() => {
                  setStatus("loading");
                  loadNotifications()
                    .then(() => setStatus("ready"))
                    .catch(() => setStatus("error"));
                }}
                className="mt-1 text-[10px] text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {status === "ready" &&
          notifications.length === 0 && adminNotifs.length === 0 && liveInvites.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-6">No notifications yet</p>
          ) : (
            <>
              {/* Admin notifications (admins only) */}
              {isAdmin && adminNotifs.map(an => {
                const Icon = adminTypeIcons[an.type] || ShieldAlert;
                const isRead = readAdminIds.has(an.id);
                return (
                  <button
                    type="button"
                    key={`adm-${an.id}`}
                    onClick={async () => {
                      if (!isRead) {
                        setReadAdminIds(prev => new Set(prev).add(an.id));
                        const { error } = await supabase
                          .from("admin_notifications").update({ is_read: true }).eq("id", an.id);
                        if (error) {
                          setReadAdminIds(prev => {
                            const next = new Set(prev);
                            next.delete(an.id);
                            return next;
                          });
                        }
                      }
                      closePanel();
                      navigate("/admin");
                    }}
                    className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 transition-colors ${
                      isRead ? "bg-card" : "bg-destructive/5"
                    } hover:bg-secondary`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
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
                      {!isRead && <span className="h-2 w-2 rounded-full bg-destructive shrink-0 mt-1" aria-hidden="true" />}
                    </div>
                  </button>
                );
              })}

              {/*
                * Stat Check invites — the actionable section. Backend-owned and
                * resolved by accepting or declining, never by being read, so they
                * are labelled as requiring action and are excluded from the
                * unread count that "Mark all read" clears.
                */}
              {liveInvites.map(invite => {
                const busy = busyToken === invite.inviteToken;
                return (
                  <div
                    key={invite.inviteToken}
                    data-testid="sc-invite-notification"
                    className="w-full px-3 py-2.5 border-b border-border last:border-0 bg-primary/5"
                  >
                    <div className="flex items-start gap-2">
                      {invite.avatarUrl ? (
                        <img src={invite.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <Swords className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] uppercase tracking-wider font-bold text-primary">
                          Needs your response
                        </p>
                        <p className="text-xs font-medium text-foreground">
                          {invite.displayName} invited you to Stat Check
                        </p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(invite.createdAt).toLocaleString()}
                        </p>
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            type="button"
                            data-testid="sc-invite-accept"
                            disabled={busy}
                            onClick={async () => {
                              handleAcceptOutcome(invite, await acceptInvite(invite.inviteToken));
                            }}
                            className="h-7 px-3 rounded-md bg-primary text-primary-foreground text-[11px] font-bold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                          >
                            {busy ? "Joining…" : "Accept"}
                          </button>
                          <button
                            type="button"
                            data-testid="sc-invite-decline"
                            aria-label="Decline invite"
                            disabled={busy}
                            onClick={() => void declineInvite(invite.inviteToken)}
                            className="h-7 px-2 rounded-md text-muted-foreground text-[11px] disabled:opacity-50 hover:text-destructive transition-colors"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" aria-hidden="true" />
                    </div>
                  </div>
                );
              })}

              {/*
                * System + social notifications. Friend requests and acceptances
                * are rendered from their persisted user_notifications rows. The
                * bell used to ALSO query `friendships` directly and render a
                * second copy of the same event; that duplicate section is gone.
                * The friends drawer still reads friendships directly and is
                * unchanged.
                */}
              {notifications.map(n => {
                const Icon = typeIcons[n.type] || Bell;
                const isRead = readIds.has(n.id);
                return (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 transition-colors ${
                      isRead ? "bg-card" : "bg-primary/5"
                    } hover:bg-secondary`}
                  >
                    <div className="flex items-start gap-2">
                      {n.image_url ? (
                        <img src={n.image_url} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />
                      ) : (
                        <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
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
                      {!isRead && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" aria-hidden="true" />}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/*
        * Room-conflict confirmation. Closing a room is destructive — it can
        * evict another player — so it is never silent and never a fallback
        * inside the ordinary Accept. "Switch and Join" calls the single atomic
        * backend endpoint; there is no client-side cancel-then-accept pair that
        * could strand the user half-way.
        */}
      <Dialog
        open={roomConflict !== null}
        onOpenChange={(next) => {
          if (!next) setRoomConflict(null);
        }}
      >
        <DialogContent className="max-w-sm" data-testid="sc-room-conflict-dialog">
          <DialogHeader>
            <DialogTitle>
              {roomConflict?.mode === "blocked"
                ? "You're already in a match"
                : "Switch Stat Check rooms?"}
            </DialogTitle>
            <DialogDescription data-testid="sc-room-conflict-body">
              {roomConflict?.mode === "blocked"
                ? roomConflict.message
                : roomConflict?.mode === "occupied"
                  ? "Another player is already waiting in your current room. Switching will close that room for everyone."
                  : "You already have a Stat Check room open. Leave it and join your friend's room?"}
            </DialogDescription>
          </DialogHeader>
          {roomConflict?.mode === "blocked" ? (
            <Button
              data-testid="sc-conflict-dismiss"
              onClick={() => setRoomConflict(null)}
              className="w-full"
            >
              OK
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                data-testid="sc-conflict-keep"
                onClick={() => setRoomConflict(null)}
                className="flex-1"
              >
                {roomConflict?.mode === "occupied" ? "Keep Current Room" : "Keep My Room"}
              </Button>
              <Button
                data-testid="sc-conflict-switch"
                disabled={busyToken === roomConflict?.invite.inviteToken}
                onClick={async () => {
                  if (!roomConflict) return;
                  const invite = roomConflict.invite;
                  handleAcceptOutcome(
                    invite,
                    // The confirmation flag is only true when the user was
                    // actually shown the eviction warning.
                    await acceptInviteSwitch(
                      invite.inviteToken,
                      roomConflict.mode === "occupied",
                    ),
                  );
                }}
                className="flex-1"
              >
                {roomConflict?.mode === "occupied" ? "Close Room and Join" : "Switch and Join"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
