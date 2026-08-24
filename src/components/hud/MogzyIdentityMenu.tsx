import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  Flag,
  Info,
  Megaphone,
  MessageSquare,
  Palette,
  LogIn,
  LogOut,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  Star,
  Swords,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useStatCheckInvites, type StatCheckInvite } from "@/hooks/useStatCheckInvites";
import { isFailure } from "@/lib/result-narrowing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/lib/admin-auth/AdminAuthProvider";
import { ADMIN_HOME_PATH } from "@/lib/admin/admin-registry";
import { useAppSettings } from "@/hooks/useAppSettings";
import { LEAGUE_ONLY_MODE } from "@/lib/site-config";
import { isLolSectionPath } from "@/lib/startup-shell";
import { prefetchRoute } from "@/lib/route-prefetch";
import { playUiSfx } from "@/lib/ui-sfx";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { signupHrefFor } from "@/lib/hud/identity";
import { authHref } from "@/lib/auth/auth-destination";
import { queryClient } from "@/lib/query-client";
import { hudHitTarget, hudPopVisual } from "@/lib/hud/chrome";

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

/**
 * The columns the bell reads, stated explicitly.
 *
 * COM1-1 / P0-1A. This was `select("*")`, which pulled `sent_by_user_id` — the
 * OTHER account's Supabase auth id on every trigger-generated social row — into
 * the recipient's browser. Migration 20260823120000 stops that id being written
 * at all, which is the actual fix; this list is the second half of it, and the
 * durable half: a `*` re-publishes whatever column is added to the table next,
 * to whoever can read the row. An allow-list cannot.
 *
 * Every name here backs a field of `UserNotification` below. Adding one means
 * deciding, deliberately, that a recipient may see it.
 */
const NOTIFICATION_COLUMNS =
  "id, title, message, type, image_url, created_at, target_type, profile_id, metadata, action_url";

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

/** One row of the panel's utility footer — same target size and focus
 *  treatment whether it is a link or a button. */
const footerItemClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary";

/** Live invites only. The backend drops expired rows from the inbox, but the
 *  poll is 30s wide — filtering here means a dead invite is never actionable. */
const isLiveInvite = (invite: StatCheckInvite, nowMs: number) => {
  const expiry = new Date(invite.expiresAt).getTime();
  return Number.isNaN(expiry) || expiry > nowMs;
};

/**
 * The HUD's compound Mogzy identity control — the top-right half of the global
 * chrome, and the surface that replaced BOTH the standalone bell and the
 * standalone account menu:
 *
 *     [ music ]  [ (Mogzy⁷) │ ▾ ]
 *
 * Two distinct targets under one piece of chrome, never one ambiguous capsule:
 *
 *  - the Mogzy portrait is a plain link to /profile. It carries identity and
 *    nothing else. AUTH1 moved the unread badge OFF it and onto the
 *    notifications control, because a count on a link to /profile reads as a
 *    fact about your account rather than about your inbox. The badge is
 *    decorative
 *    (aria-hidden, pointer-events-none, absolutely positioned) — the count's
 *    accessible home is the chevron's label, where it already lived;
 *  - the chevron opens this panel. It is a separate button with its own
 *    accessible name and its own tab stop.
 *
 * The panel keeps every notification behaviour the bell had, and gains the
 * utility footer that the retired account menu used to own: Settings (which is
 * where sign-out, password/email and account deletion live), the Admin entry
 * point under the same backend-verified `useAdminAuth` gate, and the theme
 * picker where a picker is actually mounted. Nothing that menu owned was
 * dropped — see the guest branch below for the signup CTA it also carried.
 *
 * Guests never had a notification inbox (`isAccount` gates the queries, and
 * always did), so their chevron opens the same panel shape carrying the guest
 * items only. Their portrait still links to /profile — exactly where the old
 * account menu's Profile item sent them.
 */
export default function MogzyIdentityMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const { settings } = useAppSettings();
  // Backend-verified admin authorization only; never inferred from the user
  // object, roles, or storage. The item exists in the DOM only after
  // authorization resolves positively — no placeholder, no reserved slot.
  // Note this can be authorized via the explicit admin key with no real
  // account at all, which is exactly why the footer has to render on the
  // guest branch too: otherwise a fallback-key operator loses the entry point.
  const { isAuthorized: isAdminAuthorized } = useAdminAuth();

  // Anonymous sessions are authenticated as far as Supabase is concerned, so
  // `user` alone is not enough of a gate — an anonymous visitor was being shown
  // a bell they can never receive anything in.
  const isAccount = Boolean(user && !user.is_anonymous);

  // The theme picker (FloatingThemeSwitcher) is only mounted outside the LoL
  // section; inside it the footer item would dispatch an event nobody hears.
  const canOpenThemePicker = !isLolSectionPath(pathname);
  const signupHref = signupHrefFor(pathname);

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
        .select(NOTIFICATION_COLUMNS)
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

  /**
   * Admin read state is per admin, and comes from admin_notification_reads.
   *
   * It used to come from admin_notifications.is_read, which is a single global
   * boolean: whichever admin opened a row first marked it read for every other
   * admin. `is_read` survives, but it now means only "this moderator delete
   * request has been approved or denied" and is deliberately not selected here.
   */
  const loadAdminNotifs = useCallback(async () => {
    if (!user) return;
    const [notifRes, readRes] = await Promise.all([
      supabase
        .from("admin_notifications")
        .select("id, type, title, message, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("admin_notification_reads")
        .select("notification_id")
        .eq("admin_user_id", user.id),
    ]);
    // A failed read of either table means the read state is genuinely unknown,
    // and the caller turns that into the panel's error state — the same
    // contract loadNotifications already keeps for the user-side inbox.
    if (notifRes.error) throw notifRes.error;
    if (readRes.error) throw readRes.error;
    setAdminNotifs((notifRes.data || []) as AdminNotif[]);
    setReadAdminIds(new Set((readRes.data || []).map((r: any) => r.notification_id)));
  }, [user]);

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

  // Admin-only realtime stream of admin_notifications.
  //
  // A newly arrived notification carries no receipt for anyone, so it starts
  // unread for every admin independently — there is nothing to seed into
  // readAdminIds here.
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

  /**
   * Own receipts, streamed. Reading something in one tab has to settle in the
   * others, and the admin notifications page writes the same receipts — without
   * this the two surfaces disagree until a reload.
   *
   * The filter is belt and braces: the SELECT policy on admin_notification_reads
   * is `auth.uid() = admin_user_id`, and realtime applies it, so another admin's
   * receipt can never arrive here and can never clear this admin's badge.
   */
  useEffect(() => {
    if (!isAdmin || !user) return;
    const channel = supabase
      .channel("hud-admin-notif-reads")
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
          setReadAdminIds(prev =>
            prev.has(receipt.notification_id)
              ? prev
              : new Set(prev).add(receipt.notification_id)
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, user]);

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

  /**
   * The admin equivalent of persistReads, against the per-admin receipt table.
   *
   * `admin_user_id` is always the current session's uid. It is sent because
   * PostgREST needs the column value, not because the client chooses it — the
   * INSERT policy independently requires `auth.uid() = admin_user_id`, so a
   * forged id is rejected by the database rather than trusted.
   *
   * `ignoreDuplicates` covers the same race the user-side table has, plus one
   * more: the admin notifications page and this panel can both record a read
   * for the same row, and the moderator approve/deny RPC writes a receipt too.
   */
  const persistAdminReads = async (ids: string[]): Promise<boolean> => {
    if (!user || ids.length === 0) return true;
    const { error } = await supabase
      .from("admin_notification_reads")
      .upsert(
        ids.map(id => ({ notification_id: id, admin_user_id: user.id })),
        { onConflict: "notification_id,admin_user_id", ignoreDuplicates: true },
      );
    return !error;
  };

  const markAdminRead = async (id: string) => {
    if (!user || readAdminIds.has(id)) return;
    setReadAdminIds(prev => new Set(prev).add(id));
    const ok = await persistAdminReads([id]);
    if (!ok) {
      // Roll back rather than leave a row looking read to this admin when
      // nothing was written.
      setReadAdminIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
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

  /**
   * Clears both sections the badge counts. It used to clear only the user
   * notifications, so an admin with an unread admin row could press "Mark all
   * read" and watch the badge refuse to reach zero.
   *
   * The two writes go to different tables and are rolled back independently:
   * a failure on one must not resurrect rows the other successfully cleared.
   * Both are scoped to this admin — the admin half writes receipts for
   * auth.uid() only, so nothing here can touch another admin's read state.
   */
  const markAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter(n => !readIds.has(n.id)).map(n => n.id);
    const unreadAdmin = isAdmin
      ? adminNotifs.filter(n => !readAdminIds.has(n.id)).map(n => n.id)
      : [];
    if (unread.length === 0 && unreadAdmin.length === 0) return;

    const previous = readIds;
    const previousAdmin = readAdminIds;
    if (unread.length > 0) {
      setReadIds(prev => {
        const next = new Set(prev);
        unread.forEach(id => next.add(id));
        return next;
      });
    }
    if (unreadAdmin.length > 0) {
      setReadAdminIds(prev => {
        const next = new Set(prev);
        unreadAdmin.forEach(id => next.add(id));
        return next;
      });
    }

    const [ok, adminOk] = await Promise.all([
      persistReads(unread),
      persistAdminReads(unreadAdmin),
    ]);
    if (!ok) setReadIds(previous);
    if (!adminOk) setReadAdminIds(previousAdmin);
    if (!ok || !adminOk) toast.error("Could not mark those as read");
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
    if (!isFailure(outcome)) {
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

  /**
   * Footer navigation closes the panel, so the dropdown is never left hanging
   * over the page the visitor just navigated to. `closePanel` also returns
   * focus to the chevron, which is where a keyboard user opened it from.
   */
  const footerLinkProps = (path: string) => ({
    onMouseEnter: () => prefetchRoute(path),
    onFocus: () => prefetchRoute(path),
    onTouchStart: () => prefetchRoute(path),
    onClick: () => {
      closePanel();
      playUiSfx("navClick");
    },
  });

  /**
   * The utility footer — everything the retired account menu owned that is not
   * Profile (which is the portrait) and not a notification.
   *
   * It is pinned OUTSIDE the scrolling body, so Settings can never be pushed
   * below a long inbox. Rendered on both the account and the guest branch:
   * Settings is guest-usable (it is where a guest signs in), and admin
   * authorization via the explicit fallback key does not require an account.
   */
  /**
   * Sign out from the menu (AUTH1 §8).
   *
   * Mirrors the Settings page's sign-out exactly rather than reimplementing
   * it: clear the query cache FIRST so no signed-in data can be re-read or
   * re-rendered from cache after the session goes, then end the session, then
   * land on "/". `replace` keeps the authenticated page out of the back stack,
   * so Back cannot return to a view that assumes a user.
   *
   * The panel closes before the await, so the menu is never left hanging over
   * a page that is mid-transition.
   */
  const handleSignOut = useCallback(async () => {
    if (signingOut) return; // duplicate-activation guard
    setSigningOut(true);
    closePanel();
    playUiSfx("navClick");
    queryClient.clear();
    await signOut();
    navigate("/", { replace: true });
    setSigningOut(false);
  }, [signingOut, closePanel, signOut, navigate]);

  /**
   * The account action that closes the footer — Sign Out for an account, Sign
   * In for a guest, never both and never the wrong one.
   *
   * Deliberately its OWN bordered section rather than another footer row: the
   * menu now carries notifications AND account utility, and ending the session
   * is the one item in it that is destructive. A rule plus its own padding is
   * the cheapest way to say "this is not another notification" without
   * renaming the menu or restructuring what it is for (AUTH1 §9).
   */
  const authAction = (
    <div className="shrink-0 border-t border-border bg-card p-1">
      {isAccount ? (
        <button
          type="button"
          data-testid="hud-sign-out"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className={`${footerItemClass} text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 disabled:opacity-60`}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign Out"}
        </button>
      ) : (
        <Link
          // Signing in from the account menu should not relocate the visitor:
          // the page they are on right now is the destination.
          to={authHref(`${pathname}${search}`)}
          data-testid="hud-sign-in"
          {...footerLinkProps("/auth")}
          className={footerItemClass}
        >
          <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sign In
        </Link>
      )}
    </div>
  );

  const utilityFooter = (
    <div className="shrink-0 border-t border-border bg-card p-1">
      {/* COM1-2 / P1-2. The SECOND way into the Community drawer, and in League
          mode the only one that is part of the navigation rather than a
          floating overlay. The legacy "Friends" entry further down sits inside
          `{!LEAGUE_ONLY_MODE && …}` — false in production — so before this,
          a phone whose viewport hid the floating trigger could reach the drawer
          only by receiving a friend-request notification. This entry is not
          gated: the drawer is a League surface now. */}
      <button
        type="button"
        data-testid="hud-community-item"
        onClick={() => {
          closePanel();
          window.dispatchEvent(new CustomEvent("open-friends-panel"));
        }}
        className={footerItemClass}
      >
        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
        Community
      </button>

      <Link
        to="/settings"
        data-testid="hud-settings-link"
        {...footerLinkProps("/settings")}
        className={footerItemClass}
      >
        <SettingsIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        Settings
      </Link>

      {isAdminAuthorized === true && (
        <Link
          to={ADMIN_HOME_PATH}
          data-testid="hud-admin-link"
          {...footerLinkProps(ADMIN_HOME_PATH)}
          className={footerItemClass}
        >
          <Shield className="h-4 w-4 shrink-0" aria-hidden="true" />
          Admin
        </Link>
      )}

      {canOpenThemePicker && (
        <button
          type="button"
          data-testid="hud-theme-item"
          onClick={() => {
            closePanel();
            window.dispatchEvent(new CustomEvent("open-theme-picker"));
          }}
          className={footerItemClass}
        >
          <Palette className="h-4 w-4 shrink-0" aria-hidden="true" />
          Theme
        </button>
      )}

      {/* Legacy full-Mogsy surfaces, carried over from the account menu under
          the same guard. LEAGUE_ONLY_MODE is true today, so none of this
          renders; it exists so flipping the flag back restores the same set of
          entry points the navbar and then the account menu exposed, rather
          than silently losing them in this refactor. */}
      {!LEAGUE_ONLY_MODE && (
        <>
          {settings.nav_tab_mode === "play" ? (
            <Link to="/play" {...footerLinkProps("/play")} className={footerItemClass}>
              Play
            </Link>
          ) : (
            <Link to="/swipe" {...footerLinkProps("/swipe")} className={footerItemClass}>
              Swipe
            </Link>
          )}
          <Link to="/lol" {...footerLinkProps("/lol")} className={footerItemClass}>
            League Hub
          </Link>
          <Link to="/shop" {...footerLinkProps("/shop")} className={footerItemClass}>
            Shop
          </Link>
          <button
            type="button"
            onClick={() => {
              closePanel();
              window.dispatchEvent(new CustomEvent("open-friends-panel"));
            }}
            className={footerItemClass}
          >
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            Friends
          </button>
        </>
      )}
    </div>
  );

  /**
   * Portrait + badge + chevron: one piece of chrome, two tab stops.
   *
   * Sizing follows the HUD rule that a hit target and the mark it carries are
   * two different boxes. Both controls take a 44px-tall target (44×44 for the
   * portrait, 40×44 for the chevron) while the marks inside stay small — 36px
   * of portrait, a 14px chevron — so the compound is easy to hit without the
   * pill growing heavy.
   */
  const identityCluster = (
    <div className="flex items-center rounded-full bg-white/[0.05] ring-1 ring-inset ring-[#c9a84c]/15">
      {/* Branded control: the wrapper is the fixed 44px hit target and never
          transforms; only `hudPopVisual` inside it scales. `z-10` puts the
          grown portrait over the divider and chevron rather than under them. */}
      <Link
        to="/profile"
        aria-label="Profile"
        title="Profile"
        data-testid="hud-profile"
        onMouseEnter={() => prefetchRoute("/profile")}
        onFocus={() => prefetchRoute("/profile")}
        onTouchStart={() => prefetchRoute("/profile")}
        onClick={() => playUiSfx("navClick")}
        className={`${hudHitTarget} z-10`}
      >
        {/* The portrait's transformed visual group. Nothing here is in the
            layout — the parent's 44px box is what the flex row measures.
            AUTH1 removed the unread badge from this group: it now lives on the
            notifications control below, so this mark carries identity only. */}
        <span aria-hidden="true" className={`relative block h-9 w-9 ${hudPopVisual}`}>
          {/* Face-forward crop of the full-body mascot (1024×1536). The window
              is 48% of the source width by 32% of its height, anchored at 22%
              down and centred on x=53% — that lands the eyes in the middle of
              the chip with the hat brim as a ribbon across the top. The
              previous top-anchored crop showed the hat and almost no face,
              which made the portrait read as a second copy of the home icon.
              Absolute offsets rather than object-position because the window is
              stated exactly here and can be checked against those numbers. */}
          {/* `relative` is load-bearing, not decoration: the <img> below is
              absolutely positioned, and an absolutely positioned box is only
              clipped by ancestors that sit BETWEEN it and its containing
              block. Without a containing block here the nearest positioned
              ancestor is the pop wrapper — one level too high — and this
              element's `overflow-hidden` would not clip the image at all,
              spilling the whole full-body mascot across the HUD. */}
          <span className="relative block h-9 w-9 overflow-hidden rounded-full ring-1 ring-inset ring-[#c9a84c]/25">
            <img
              src="/mascot/mogzy-mascot-base-v1.png"
              alt=""
              draggable={false}
              className="absolute -left-[60.4%] -top-[68.8%] h-auto w-[208.3%] max-w-none"
            />
          </span>
        </span>
      </Link>

      <span aria-hidden="true" className="h-6 w-px shrink-0 bg-[#c9a84c]/25" />

      {/* Utility control: same generous target, deliberately duller feedback —
          a ground tint and a 1.06 nudge on the glyph, never the mascot pop.
          The hierarchy is the point: branded marks play, utilities hold still. */}
      <button
        ref={triggerRef}
        type="button"
        data-testid="hud-notifications-trigger"
        aria-label={
          isAccount
            ? badgeLabel
              ? `Open notifications: ${badgeLabel}`
              : "Open notifications"
            : "Open account menu"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          const next = !open;
          setOpen(next);
          // Opening the panel refetches now rather than showing whatever the
          // 30s poll last saw.
          if (next && isAccount) void refreshInvites();
        }}
        className="group/chev relative z-0 flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 ease-out hover:bg-white/[0.07] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/70 motion-reduce:transition-none"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover/chev:scale-[1.06] group-focus-visible/chev:scale-[1.06] motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        {/* AUTH1: the unread badge belongs to NOTIFICATIONS, not to identity.
            It used to sit on the Mogzy portrait, which made the count read as
            "something about your account" and put a notification number on a
            link to /profile. The two symbols now mean exactly one thing each:
            the portrait is you, this control is your inbox.

            Still decorative — absolutely positioned (no layout effect),
            pointer-events-none, aria-hidden — because the count is already
            spoken in this button's own accessible name. Moving it here is
            therefore a pure relocation of a visual mark: it adds no second
            focus stop and no second reading of the number.

            `-top-0.5`/`-right-0.5` keeps it inside the 44px-tall target rather
            than overhanging into the header's 10px of headroom, so it cannot
            be clipped at the top of the viewport at any width. */}
        {badgeCount > 0 && (
          <span
            aria-hidden="true"
            data-testid="hud-unread-badge"
            className="pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold bg-destructive text-destructive-foreground ring-2 ring-[#0a1020]"
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>
    </div>
  );

  /**
   * Guests have no inbox — the queries above are gated on `isAccount` and
   * always were. Their panel carries exactly the two guest items the account
   * menu owned: the signup CTA (same route, same funnel event, same copy) and
   * the utility footer.
   */
  if (!isAccount) {
    return (
      <div className="relative" ref={dropdownRef}>
        {identityCluster}
        {open && (
          <div
            role="dialog"
            aria-label="Account"
            data-testid="hud-guest-panel"
            className="absolute right-0 top-full z-50 mt-1 flex w-[calc(100vw-1.5rem)] max-w-72 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          >
            <Link
              to={signupHref}
              data-testid="hud-signup-menu-item"
              onMouseEnter={() => prefetchRoute("/auth")}
              onFocus={() => prefetchRoute("/auth")}
              onClick={() => {
                closePanel();
                playUiSfx("navClick");
                trackFunnelEvent("hud_signup_menu_clicked", { returnTo: pathname });
              }}
              className="flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary"
            >
              <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a84c]" aria-hidden="true" />
              <span className="flex flex-col">
                <span className="text-xs font-semibold text-foreground">Sign up free</span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  Save your XP, streaks, and progress.
                </span>
              </span>
            </Link>
            {utilityFooter}
            {authAction}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {identityCluster}

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          data-testid="notification-panel"
          className="absolute right-0 top-full z-50 mt-1 flex max-h-96 w-[calc(100vw-1.5rem)] max-w-80 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <div className="shrink-0 bg-card border-b border-border px-3 py-2 flex items-center justify-between">
            <p className="text-xs font-bold text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead} className="text-[10px] text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {/* Only the inbox scrolls. The footer below is a sibling, so Settings
              stays reachable no matter how long the list gets. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
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
                  // Admin rows and their receipts are part of what failed, so
                  // the retry has to reload them too — otherwise a receipts
                  // failure resolves to "ready" with every admin row unread.
                  Promise.all([loadNotifications(), isAdmin ? loadAdminNotifs() : null])
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
                    data-testid={`hud-admin-notification-${an.id}`}
                    data-read={isRead ? "true" : "false"}
                    onClick={async () => {
                      // Records a receipt for THIS admin only. The old version
                      // flipped admin_notifications.is_read, which marked the
                      // row read for every admin at once.
                      await markAdminRead(an.id);
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

          {utilityFooter}
          {authAction}
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
