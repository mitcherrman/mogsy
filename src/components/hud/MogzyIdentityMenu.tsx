import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronRight,
  Flag,
  Info,
  Megaphone,
  MessageSquare,
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
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useChampionCardDuelInvites, type ChampionCardDuelInvite } from "@/hooks/useChampionCardDuelInvites";
import { isFailure } from "@/lib/result-narrowing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useOwnerAuth } from "@/hooks/useOwnerAuth";
import { ADMIN_HOME_PATH } from "@/lib/admin/admin-registry";
import { prefetchRoute } from "@/lib/route-prefetch";
import { useSfx } from "@/lib/audio/useSfx";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { signupHrefFor } from "@/lib/hud/identity";
import { authHref } from "@/lib/auth/auth-destination";
import { queryClient } from "@/lib/query-client";
import { hudHitTarget, hudPopVisual } from "@/lib/hud/chrome";
import type { AdminInboxItem, PlayerInboxItem } from "@/lib/notifications/api";
import { adminRecordLink, formatRelative } from "@/lib/notifications/policy";
import { useAdminInbox } from "@/lib/notifications/useAdminInbox";
import { usePlayerInbox } from "@/lib/notifications/usePlayerInbox";
import { NotificationErrorDetail } from "@/components/notifications/NotificationErrorDetail";

/**
 * Notifications 2.0 (#92). What the bell lists is decided by the SERVER:
 * get_my_notifications() returns only this account's ACTIVE inbox — addressed
 * to them, not done, not expired (unless saved), not resolved, not muted, and
 * only categories a player may see (comment notifications, the retired Mogsy
 * types and any unknown type never render). The badge comes from
 * get_my_notification_summary(), so it can never count a suppressed, expired
 * or done row. src/lib/notifications/policy.ts states the same policy and a
 * test pins it to the SQL.
 */
const typeIcons: Record<string, typeof Bell> = {
  general: Bell,
  update: Zap,
  warning: AlertTriangle,
  security_notice: ShieldAlert,
  friend_request: UserPlus,
  friend_accepted: UserCheck,
  feedback_update: MessageSquare,
  achievement_unlocked: Trophy,
  progression_milestone: Trophy,
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

const ADMIN_NOTIFICATIONS_PATH = "/admin/operations?section=notifications";

/**
 * Interrupt only for what is personal or important. Routine announcements wait
 * quietly in the inbox instead of toasting every visitor at once.
 */
const shouldToast = (item: PlayerInboxItem): boolean =>
  item.category === "social" ||
  item.category === "feedback" ||
  item.category === "account" ||
  item.category === "security" ||
  (item.category === "announcement" && (item.priority === "high" || item.priority === "urgent"));

/** One row of the panel's utility footer — same target size and focus
 *  treatment whether it is a link or a button. */
const footerItemClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary";

/** Live invites only. The backend drops expired rows from the inbox, but the
 *  poll is 30s wide — filtering here means a dead invite is never actionable. */
const isLiveInvite = (invite: ChampionCardDuelInvite, nowMs: number) => {
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
 * point under the server-verified owner session (`useOwnerAuth`), and the theme
 * picker where a picker is actually mounted. Nothing that menu owned was
 * dropped — see the guest branch below for the signup CTA it also carried.
 *
 * Guests never had a notification inbox (`isAccount` gates the queries, and
 * always did), so their chevron opens the same panel shape carrying the guest
 * items only. Their portrait still links to /profile — exactly where the old
 * account menu's Profile item sent them.
 */
export default function MogzyIdentityMenu() {
  const sfx = useSfx();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  // OWN1.1: the canonical owner session (server-side owner_auth_state), never
  // the user object, user_roles or storage. The Admin entry shows for the
  // owner whether or not this session still needs MFA — /admin then asks for
  // it — and it stays put through token refreshes and background rechecks
  // (the shared owner session keeps its last proven answer). The admin
  // notification feed needs an authorized session (its RLS is is_owner()).
  const owner = useOwnerAuth();
  const showAdminEntry = owner.isOwner;
  const isAdmin = owner.isOwner && owner.authorized;

  // Anonymous sessions are authenticated as far as Supabase is concerned, so
  // `user` alone is not enough of a gate — an anonymous visitor was being shown
  // a bell they can never receive anything in.
  const isAccount = Boolean(user && !user.is_anonymous);

  // PT2E: the `Theme` footer item is gone. It dispatched `open-theme-picker`
  // at FloatingThemeSwitcher, the global FAB that recoloured the whole
  // application; both are retired. Themes are now the PROFILE's theme and are
  // chosen on the Profile page, which this menu already links to directly.
  const signupHref = signupHrefFor(pathname);

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const {
    invites: championCardDuelInvites,
    accept: acceptInvite,
    acceptSwitch: acceptInviteSwitch,
    decline: declineInvite,
    refresh: refreshInvites,
    busyToken,
  } = useChampionCardDuelInvites();

  // Ticks only while invites are on screen, so an invite that ages out
  // disappears without waiting for the next 30s poll.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (championCardDuelInvites.length === 0) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [championCardDuelInvites.length]);

  const liveInvites = useMemo(
    () => championCardDuelInvites.filter(invite => isLiveInvite(invite, nowMs)),
    [championCardDuelInvites, nowMs],
  );

  const [roomConflict, setRoomConflict] = useState<
    { invite: ChampionCardDuelInvite; mode: "empty" | "occupied" | "blocked"; message: string } | null
  >(null);

  const player = usePlayerInbox({
    enabled: isAccount,
    userId: user?.id ?? null,
    signupAt: user?.created_at ?? null,
    pageSize: 20,
    onArrival: item => {
      if (!shouldToast(item)) return;
      toast(item.title, { description: item.message || undefined, icon: item.imageUrl ? undefined : "🔔" });
    },
  });

  // OWN1.1: the owner feed loads when (and only when) the owner session is
  // authorized — its RLS needs a trusted session. The bell shows the top of
  // Action Required plus the counters; the full inbox is the admin page, and
  // both read the same per-admin state, so they agree without a reload.
  const admin = useAdminInbox({
    enabled: isAdmin,
    userId: user?.id ?? null,
    tab: "action",
    pageSize: 3,
    onArrival: n => toast(n.title, { description: n.message || undefined, icon: "🛡️" }),
  });

  // A failed read means that feed's state is genuinely unknown; an error with
  // a retry beats a confidently empty bell. The two feeds fail separately
  // (#146): a refused owner feed used to blank the owner's own player
  // notifications too, so the admin feed now reports inline, in its section.
  const panelStatus: "loading" | "ready" | "error" =
    player.status === "error" ? "error" : player.status === "loading" ? "loading" : "ready";
  const adminFailed = isAdmin && admin.status === "error";

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

  const actSafely = async (work: () => Promise<unknown>, failure: string) => {
    try {
      await work();
    } catch {
      toast.error(failure);
    }
  };

  /**
   * Clears unread in both sections the badge counts, for THIS account only:
   * the admin half writes receipts for auth.uid() on the server, so nothing
   * here can touch another admin's read state. Read is not resolved — an
   * unresolved report stays in Action Required.
   */
  const markAllRead = () =>
    actSafely(
      () =>
        Promise.all([
          player.summary.unread > 0 ? player.act(null, "read_all") : null,
          isAdmin && (admin.counts?.unread_total ?? 0) > 0 ? admin.act(null, "read", "all") : null,
        ]),
      "Could not mark those as read",
    );

  /** Done: leaves this player's inbox (never deleted for anyone else). */
  const clearAll = () => actSafely(() => player.act(null, "done_all"), "Could not clear your notifications");
  const dismiss = (n: PlayerInboxItem) => actSafely(() => player.act([n.id], "done"), "Could not dismiss that");

  /** Where a notification should take the user. Trigger-generated social rows
   *  carry no action_url, so their destination comes from the type. */
  const openNotification = (n: PlayerInboxItem) => {
    if (!n.isRead) void actSafely(() => player.act([n.id], "read"), "Could not mark that as read");
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
    if (n.actionUrl && n.actionUrl.startsWith("/")) {
      closePanel();
      navigate(n.actionUrl);
    }
  };

  /**
   * Admin rows open the exact record they are about — never a bare /admin.
   * The destination marks the notification read once the record has actually
   * opened (a deleted record shows an explanation and leaves it unread), and
   * opening never resolves anything.
   */
  const openAdminItem = (item: AdminInboxItem) => {
    closePanel();
    navigate(adminRecordLink(item).href);
  };

  const handleAcceptOutcome = (
    invite: ChampionCardDuelInvite,
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
   * `unreadCount` is informational and is what "Mark all read" clears. It is
   * the server's count of unread ACTIVE items — done, expired, muted and
   * resolved rows never hold it up.
   * `actionableCount` is pending Champion Card Duel invites, which are resolved by
   * accepting or declining — never by reading. Folding invites into the unread
   * total made "Mark all read" look broken, because the badge could not reach
   * zero while an invite was still open.
   */
  const adminUnread = isAdmin ? admin.counts?.unread_total ?? 0 : 0;
  const unreadCount = player.summary.unread + adminUnread;
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
      sfx.play("ui.navigation.activate");
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
    sfx.play("ui.identity.action");
    queryClient.clear();
    await signOut();
    navigate("/", { replace: true });
    setSigningOut(false);
  }, [signingOut, closePanel, signOut, navigate, sfx]);

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
      {/* COM1-2 / P1-2. The way into the Community drawer that is part of the
          navigation rather than a floating overlay. Before this, a phone whose
          viewport hid the floating trigger could reach the drawer only by
          receiving a friend-request notification: the other "Friends" entry was
          behind the retired product's flag and never rendered. LEGACY1 deleted
          that one, so this is the only navigation entry. */}
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

      {showAdminEntry && (
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

      {/* LEGACY1 deleted the dead branch that used to sit here: Play / Swipe /
          Shop / Friends entry points for the retired Mogsy product, held behind
          the retired product's flag so that flipping it would restore them.
          The product they pointed at is deleted, so there is nothing to
          restore. */}
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
        onClick={() => sfx.play("ui.identity.action")}
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
              /* RFX1 2B2 — the avatar draws this 75x112 inside a 36px circle.
                 A HUD-sized 240x360 WebP; the 1024x1536 source stays for the
                 hub guide and the welcome scenes. */
              src="/mascot/mogzy-mascot-base-v1-240.webp"
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
                sfx.play("ui.identity.action");
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
          className="absolute right-0 top-full z-50 mt-1 flex max-h-[min(34rem,calc(100dvh-5rem))] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <div className="shrink-0 bg-card border-b border-border px-3 py-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-foreground">Notifications</p>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button type="button" onClick={() => void markAllRead()} className="text-[10px] text-primary hover:underline">
                  Mark all read
                </button>
              )}
              {player.mode === "v2" && player.items.length > 0 && (
                <button
                  type="button"
                  data-testid="notification-clear-all"
                  onClick={() => void clearAll()}
                  className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Only the inbox scrolls. The footer below is a sibling, so Settings
              stays reachable no matter how long the list gets. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
          {panelStatus === "loading" && (
            <p data-testid="notification-loading" className="text-center text-muted-foreground text-xs py-6">
              Loading notifications…
            </p>
          )}

          {panelStatus === "error" && (
            <div data-testid="notification-error" className="px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">Couldn’t load your notifications.</p>
              <NotificationErrorDetail error={player.error} />
              <button
                type="button"
                onClick={() => {
                  void player.refresh();
                  if (isAdmin) void admin.refresh();
                }}
                className="mt-1 text-[10px] text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {panelStatus === "ready" && adminFailed && (
            <div data-testid="hud-admin-error" className="border-b border-border px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">Couldn’t load the admin inbox.</p>
              <NotificationErrorDetail error={admin.error} />
              <button
                type="button"
                onClick={() => void admin.refresh()}
                className="mt-1 text-[10px] text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {panelStatus === "ready" && (
            <>
              {/* Admin: the top of Action Required and the counters, linked to
                  the full inbox. Owner session only. */}
              {isAdmin && !adminFailed && admin.counts && (
                <div data-testid="hud-admin-section" className="border-b border-border">
                  <Link
                    to={ADMIN_NOTIFICATIONS_PATH}
                    data-testid="hud-admin-summary"
                    {...footerLinkProps(ADMIN_NOTIFICATIONS_PATH)}
                    className="flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary"
                  >
                    <Shield className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                    <span className="flex-1 text-[11px] text-foreground">
                      <span className="font-semibold">Admin inbox</span>
                      {" · "}
                      {admin.counts.action_unresolved} need{admin.counts.action_unresolved === 1 ? "s" : ""} action
                      {admin.counts.action_critical > 0 && (
                        <span className="font-semibold text-destructive"> · {admin.counts.action_critical} critical</span>
                      )}
                      {adminUnread > 0 && <span className="text-muted-foreground"> · {adminUnread} unread</span>}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  </Link>
                  {admin.items.map(an => {
                    const Icon = adminTypeIcons[an.type] || ShieldAlert;
                    return (
                      <button
                        type="button"
                        key={`adm-${an.id}`}
                        data-testid={`hud-admin-notification-${an.id}`}
                        data-read={an.isRead ? "true" : "false"}
                        onClick={() => openAdminItem(an)}
                        className={`w-full text-left px-3 py-2 border-t border-border transition-colors ${
                          an.isRead ? "bg-card" : "bg-destructive/5"
                        } hover:bg-secondary`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium ${an.isRead ? "text-muted-foreground" : "text-foreground"}`}>
                              {an.priority === "critical" && (
                                <span className="text-[9px] uppercase tracking-wider mr-1.5 px-1 py-0.5 rounded bg-destructive/15 text-destructive font-bold">
                                  Critical
                                </span>
                              )}
                              {an.title}
                              {an.occurrenceCount > 1 && <span className="text-muted-foreground"> ×{an.occurrenceCount}</span>}
                            </p>
                            <p className="text-[9px] text-muted-foreground mt-0.5" title={new Date(an.activityAt).toLocaleString()}>
                              {formatRelative(an.activityAt)}
                            </p>
                          </div>
                          {!an.isRead && <span className="h-2 w-2 rounded-full bg-destructive shrink-0 mt-1" aria-hidden="true" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/*
                * Champion Card Duel invites — the actionable section. Backend-owned and
                * resolved by accepting or declining, never by being read, so they
                * are labelled as requiring action and are excluded from the
                * unread count that "Mark all read" clears. Expired invites are
                * filtered out above and are never actionable.
                */}
              {liveInvites.map(invite => {
                const busy = busyToken === invite.inviteToken;
                return (
                  <div
                    key={invite.inviteToken}
                    data-testid="ccd-invite-notification"
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
                          {invite.displayName} invited you to Champion Card Duel
                        </p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(invite.createdAt).toLocaleString()}
                        </p>
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            type="button"
                            data-testid="ccd-invite-accept"
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
                            data-testid="ccd-invite-decline"
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
                * The player's own inbox. Friend requests and acceptances render
                * from their persisted rows (the friends drawer still reads
                * friendships directly); a friend request that was accepted,
                * declined or withdrawn is resolved on the server and leaves.
                */}
              {player.items.map(n => {
                const Icon = typeIcons[n.type] || Bell;
                const needsResponse = n.type === "friend_request";
                return (
                  <div
                    key={n.id}
                    data-testid={`hud-notification-${n.id}`}
                    data-read={n.isRead ? "true" : "false"}
                    className={`group relative flex border-b border-border last:border-0 transition-colors ${
                      n.isRead ? "bg-card" : "bg-primary/5"
                    } hover:bg-secondary`}
                  >
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:bg-secondary"
                    >
                      <div className="flex items-start gap-2">
                        {n.imageUrl ? (
                          <img src={n.imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />
                        ) : (
                          <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                        )}
                        <div className="flex-1 min-w-0">
                          {needsResponse && (
                            <p className="text-[9px] uppercase tracking-wider font-bold text-primary">Needs your response</p>
                          )}
                          <p className={`text-xs font-medium ${n.isRead ? "text-muted-foreground" : "text-foreground"}`}>
                            {n.title}
                          </p>
                          {n.message && (
                            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                          )}
                          <p className="text-[9px] text-muted-foreground mt-0.5" title={new Date(n.activityAt).toLocaleString()}>
                            {formatRelative(n.activityAt)}
                          </p>
                        </div>
                        {!n.isRead && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" aria-hidden="true" />}
                      </div>
                    </button>
                    {player.mode === "v2" && (
                      <button
                        type="button"
                        data-testid="notification-dismiss"
                        aria-label={`Dismiss: ${n.title}`}
                        title="Dismiss"
                        onClick={() => void dismiss(n)}
                        className="flex w-9 shrink-0 items-start justify-center pt-2.5 text-muted-foreground opacity-70 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}

              {player.items.length === 0 &&
                liveInvites.length === 0 &&
                !(isAdmin && (admin.counts?.action_unresolved ?? 0) > 0) && (
                  <p data-testid="notification-empty" className="text-center text-muted-foreground text-xs py-6">
                    You’re all caught up
                  </p>
                )}
            </>
          )}
          </div>

          <Link
            to="/notifications"
            data-testid="hud-notification-history"
            {...footerLinkProps("/notifications")}
            className="shrink-0 border-t border-border bg-card px-3 py-2 text-center text-[11px] font-medium text-primary hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary"
          >
            History, saved & notification settings
          </Link>

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
        <DialogContent className="max-w-sm" data-testid="ccd-room-conflict-dialog">
          <DialogHeader>
            <DialogTitle>
              {roomConflict?.mode === "blocked"
                ? "You're already in a match"
                : "Switch Champion Card Duel rooms?"}
            </DialogTitle>
            <DialogDescription data-testid="ccd-room-conflict-body">
              {roomConflict?.mode === "blocked"
                ? roomConflict.message
                : roomConflict?.mode === "occupied"
                  ? "Another player is already waiting in your current room. Switching will close that room for everyone."
                  : "You already have a Champion Card Duel room open. Leave it and join your friend's room?"}
            </DialogDescription>
          </DialogHeader>
          {roomConflict?.mode === "blocked" ? (
            <Button
              data-testid="ccd-conflict-dismiss"
              onClick={() => setRoomConflict(null)}
              className="w-full"
            >
              OK
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                data-testid="ccd-conflict-keep"
                onClick={() => setRoomConflict(null)}
                className="flex-1"
              >
                {roomConflict?.mode === "occupied" ? "Keep Current Room" : "Keep My Room"}
              </Button>
              <Button
                data-testid="ccd-conflict-switch"
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
