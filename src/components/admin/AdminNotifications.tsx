import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Bookmark,
  BookmarkCheck,
  Bug,
  Check,
  CheckCheck,
  ExternalLink,
  Flag,
  HelpCircle,
  Image as ImageIcon,
  Inbox,
  Lightbulb,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { fetchAdminNotification, type AdminInboxItem } from "@/lib/notifications/api";
import { supabase } from "@/integrations/supabase/client";
import { focusHighlight } from "@/lib/notifications/focus";
import {
  ADMIN_EXPIRY_DAYS,
  ADMIN_TABS,
  PRIORITY_LABELS,
  adminRecordLink,
  canMarkDone,
  canResolveFromInbox,
  feedbackReasonLabel,
  feedbackStatusLabel,
  formatRelative,
  resolutionLabel,
  type AdminCategory,
  type AdminTab,
} from "@/lib/notifications/policy";
import { useAdminInbox } from "@/lib/notifications/useAdminInbox";
import { cn } from "@/lib/utils";

/**
 * The admin notification inbox (Notifications 2.0, #92).
 *
 * Four questions, four tabs: what needs me (Action required), what are players
 * saying (Community), what happened on the platform (Platform), and what is
 * already settled (Completed — resolved, done and expired; nothing is deleted).
 *
 * Three states never get confused here:
 *   read      I have seen it (per admin, admin_notification_reads)
 *   done      I have cleared it from MY inbox (per admin)
 *   resolved  the underlying report / feedback / request was handled (shared,
 *             set by the workflow that owns it — never by opening a row)
 *
 * Unresolved Action Required work cannot be marked done and never expires:
 * it leaves only by being resolved where it lives, which every row links to.
 */

const typeIcon = (item: AdminInboxItem) => {
  if (item.type === "feedback") {
    const intent = item.feedback?.entry_intent;
    if (intent === "question_report") return HelpCircle;
    if (intent === "page_report" || item.feedback?.type === "bug") return Bug;
    return Lightbulb;
  }
  switch (item.type) {
    case "image_report":
    case "image_report_critical":
      return ImageIcon;
    case "comment_report":
      return MessageSquare;
    case "user_report":
      return Flag;
    case "mod_delete_request":
    case "mod_action":
      return ShieldAlert;
    default:
      return Bell;
  }
};

const intentLabel = (item: AdminInboxItem): string | null => {
  switch (item.feedback?.entry_intent) {
    case "question_report":
      return "Question report";
    case "page_report":
      return "Page report";
    case "bug":
      return "Bug";
    case "feature":
      return "Suggestion";
    case "gameplay":
      return "Gameplay feedback";
    default:
      return item.type === "feedback" ? "Feedback" : null;
  }
};

const daysLeft = (iso: string | null, nowMs: number) => {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - nowMs) / 86_400_000);
  return d > 0 ? d : null;
};

function FeedbackDigestBlock({ item }: { item: AdminInboxItem }) {
  const f = item.feedback;
  if (!f) return null;
  const reason = feedbackReasonLabel(f.reason);
  return (
    <div
      data-testid="admin-notification-feedback"
      className="mt-1.5 space-y-1 rounded-md border border-border bg-muted/30 p-2 text-[11px] leading-snug"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {intentLabel(item) && <span className="font-semibold text-foreground">{intentLabel(item)}</span>}
        {reason && <span className="text-foreground">· {reason}</span>}
        {f.severity && <span className="text-muted-foreground">· severity {f.severity}</span>}
        <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
          Review: {feedbackStatusLabel(f.status)}
        </span>
      </p>
      {f.question_prompt && (
        <p className="text-foreground">
          <span className="text-muted-foreground">Question: </span>
          {f.question_prompt}
        </p>
      )}
      {(f.selected_answer || f.canonical_answer) && (
        <p className="text-muted-foreground">
          {f.selected_answer && <>Player answered <span className="text-foreground">{f.selected_answer}</span></>}
          {f.selected_answer && f.canonical_answer && " · "}
          {f.canonical_answer && <>Expected <span className="text-foreground">{f.canonical_answer}</span></>}
        </p>
      )}
      {f.has_evidence && <p className="text-muted-foreground">Evidence attached — open the record to review it.</p>}
      {f.page_url && !f.question_prompt && <p className="truncate text-muted-foreground">Page: {f.page_url}</p>}
    </div>
  );
}

/**
 * The record behind an image report. The legacy item-image product has no
 * admin page, so the notification's permalink IS the record view: the image,
 * its item, its report count and the hide/restore control. Hiding or restoring
 * here (an admin action) resolves the report through the database trigger.
 */
function ImageSubjectDetail({ imageId, onChanged }: { imageId: string; onChanged?: () => void }) {
  type ImageRow = { id: string; image_url: string; is_hidden: boolean; report_count: number; preset_item_id: string };
  const [state, setState] = useState<{ status: "loading" | "ready" | "missing"; image?: ImageRow; itemName?: string | null }>({
    status: "loading",
  });
  const [busy, setBusy] = useState(false);
  // preset_item_images / preset_items are legacy tables read by id only here.
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> } };
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => PromiseLike<{ error: unknown }> };
    };
  };

  const load = async () => {
    const { data } = await db
      .from("preset_item_images")
      .select("id, image_url, is_hidden, report_count, preset_item_id")
      .eq("id", imageId)
      .maybeSingle();
    const image = data as ImageRow | null;
    if (!image) {
      setState({ status: "missing" });
      return;
    }
    const { data: item } = await db.from("preset_items").select("name").eq("id", image.preset_item_id).maybeSingle();
    setState({ status: "ready", image, itemName: (item as { name?: string } | null)?.name ?? null });
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId]);

  const setHidden = async (hidden: boolean) => {
    setBusy(true);
    const { error } = await db.from("preset_item_images").update({ is_hidden: hidden }).eq("id", imageId);
    setBusy(false);
    if (error) {
      toast.error("Could not update the image");
      return;
    }
    toast.success(hidden ? "Image hidden - report resolved" : "Image restored - report resolved");
    await load();
    onChanged?.();
  };

  if (state.status === "loading") return <p className="mt-1.5 text-[11px] text-muted-foreground">Loading image…</p>;
  if (state.status === "missing") {
    return (
      <p role="status" data-testid="admin-image-missing" className="mt-1.5 text-[11px] text-muted-foreground">
        The reported image no longer exists.
      </p>
    );
  }
  const image = state.image!;
  return (
    <div data-testid="admin-image-detail" className="mt-1.5 flex items-start gap-3 rounded-md border border-border bg-muted/30 p-2">
      <img src={image.image_url} alt={`Reported image for ${state.itemName ?? "an item"}`} className="h-20 w-20 shrink-0 rounded object-cover" />
      <div className="min-w-0 flex-1 space-y-1 text-[11px]">
        <p className="font-semibold text-foreground">{state.itemName ?? "Unknown item"}</p>
        <p className="text-muted-foreground">
          {image.report_count} report{image.report_count === 1 ? "" : "s"} · {image.is_hidden ? "Hidden from players" : "Visible to players"}
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void setHidden(!image.is_hidden)}>
          {image.is_hidden ? "Restore image" : "Hide image"}
        </Button>
      </div>
    </div>
  );
}

interface RowProps {
  item: AdminInboxItem;
  /** False before the v2 migration: only read state exists server-side. */
  lifecycle: boolean;
  selected: boolean;
  nowMs: number;
  onSelect: (checked: boolean) => void;
  onAct: (action: "read" | "done" | "undone" | "save" | "unsave") => void;
  onResolve: (resolution: "dismissed" | "actioned") => void;
  onReopen: () => void;
  /** Rendered as the permalink's detail card (shows the record itself). */
  linked?: boolean;
  /** The list row the current permalink points at. */
  highlighted?: boolean;
  onSubjectChanged?: () => void;
}

function NotificationRow({ item, lifecycle, selected, nowMs, onSelect, onAct, onResolve, onReopen, linked = false, highlighted = false, onSubjectChanged }: RowProps) {
  const [confirming, setConfirming] = useState(false);
  const Icon = typeIcon(item);
  const link = adminRecordLink(item);
  const doneAllowed = canMarkDone(item);
  const critical = item.priority === "critical";
  const left = item.state === "active" && !item.isSaved ? daysLeft(item.expiresAt, nowMs) : null;

  return (
    <li
      data-testid={linked ? "admin-notification-linked-row" : `admin-notification-${item.id}`}
      data-read={item.isRead ? "true" : "false"}
      data-state={item.state}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        highlighted && focusHighlight,
        item.isRead ? "border-border bg-card" : "border-primary/30 bg-primary/5",
        critical && item.state === "active" && "border-destructive/50 bg-destructive/5",
      )}
    >
      <div className="flex items-start gap-2.5">
        {lifecycle && (
          <input
            type="checkbox"
            checked={selected}
            onChange={e => onSelect(e.target.checked)}
            aria-label={`Select ${item.title}`}
            className="mt-1 h-4 w-4 shrink-0 accent-primary"
          />
        )}
        <Icon
          className={cn("mt-0.5 h-4 w-4 shrink-0", critical ? "text-destructive" : "text-muted-foreground")}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {!item.isRead && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
            {(item.priority === "critical" || item.priority === "high") && item.state === "active" && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                  critical ? "bg-destructive/15 text-destructive" : "bg-orange-500/15 text-orange-500",
                )}
              >
                {PRIORITY_LABELS[item.priority]}
              </span>
            )}
            <p className={cn("text-sm font-medium", item.isRead ? "text-muted-foreground" : "text-foreground")}>
              {item.title}
            </p>
            {item.occurrenceCount > 1 && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                ×{item.occurrenceCount} reports
              </span>
            )}
          </div>
          {item.message && <p className="mt-0.5 text-xs text-muted-foreground">{item.message}</p>}
          <FeedbackDigestBlock item={item} />
          {linked && item.subjectType === "image" && item.subjectId && (
            <ImageSubjectDetail imageId={item.subjectId} onChanged={onSubjectChanged} />
          )}
          <p className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
            <time dateTime={item.activityAt} title={new Date(item.activityAt).toLocaleString()}>
              {formatRelative(item.activityAt, nowMs)}
            </time>
            {item.state === "resolved" && (
              <span className="font-medium text-emerald-600 dark:text-emerald-400">✓ {resolutionLabel(item.resolution)}</span>
            )}
            {item.state === "done" && <span>Done</span>}
            {item.state === "expired" && <span>Expired</span>}
            {item.isSaved && <span>Saved</span>}
            {left != null && <span>Leaves inbox in {left}d</span>}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* The destination marks this read once the record has actually
                opened (see src/lib/notifications/focus.ts) - never on click,
                and opening never resolves anything. */}
            {!(linked && link.kind === "notification") && (
              <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
                <Link to={link.href} data-testid="admin-notification-open">
                  <ExternalLink className="h-3 w-3" aria-hidden="true" /> {link.label}
                </Link>
              </Button>
            )}
            {!item.isRead && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onAct("read")}>
                <Check className="h-3 w-3" aria-hidden="true" /> Mark read
              </Button>
            )}
            {lifecycle && (<>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              aria-pressed={item.isSaved}
              onClick={() => onAct(item.isSaved ? "unsave" : "save")}
            >
              {item.isSaved ? (
                <BookmarkCheck className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Bookmark className="h-3 w-3" aria-hidden="true" />
              )}
              {item.isSaved ? "Saved" : "Save"}
            </Button>
            {item.state === "done" ? (
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onAct("undone")}>
                <Undo2 className="h-3 w-3" aria-hidden="true" /> Move to inbox
              </Button>
            ) : item.state === "active" ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                disabled={!doneAllowed}
                title={doneAllowed ? "Remove from your inbox" : "Resolve the underlying item first — open the record"}
                onClick={() => onAct("done")}
              >
                <CheckCheck className="h-3 w-3" aria-hidden="true" /> Done
              </Button>
            ) : null}
            {canResolveFromInbox(item) && !confirming && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirming(true)}
              >
                Resolve…
              </Button>
            )}
            {confirming && (
              <span role="group" aria-label="Resolve for every admin" className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">For every admin:</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setConfirming(false); onResolve("actioned"); }}>
                  Actioned
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setConfirming(false); onResolve("dismissed"); }}>
                  Dismiss
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </span>
            )}
            {(item.resolution === "dismissed" || item.resolution === "actioned") && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onReopen}>
                <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reopen
              </Button>
            )}
            </>)}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function AdminNotifications({ onReadChange }: { onReadChange?: (unread: number) => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>("action");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inbox = useAdminInbox({ enabled: Boolean(user), userId: user?.id ?? null, tab });
  const { items, counts, mode, status } = inbox;

  /**
   * Notification permalink: `?…&notification=<id>`. Opens exactly that item by
   * its stable id — whatever tab it now lives in, including Completed — shows
   * it as a detail card with its record, switches to its tab, and marks it
   * read once it has actually loaded. Driven by the URL, so a direct link,
   * refresh and browser Back/Forward all land on the same item.
   */
  const location = useLocation();
  const linkedId = useMemo(() => {
    const v = new URLSearchParams(location.search).get("notification");
    return v && /^[0-9a-zA-Z-]{1,64}$/.test(v) ? v : null;
  }, [location.search]);
  const closeLinkedHref = useMemo(() => {
    const next = new URLSearchParams(location.search);
    next.delete("notification");
    const q = next.toString();
    return `${location.pathname}${q ? `?${q}` : ""}`;
  }, [location.pathname, location.search]);
  const [linked, setLinked] = useState<
    { id: string; status: "loading" | "found" | "missing"; item?: AdminInboxItem; tab?: AdminTab } | null
  >(null);
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!linkedId || !user) {
      setLinked(null);
      openedRef.current = null;
      return;
    }
    let cancelled = false;
    setLinked(prev => (prev?.id === linkedId ? prev : { id: linkedId, status: "loading" }));
    fetchAdminNotification(user.id, linkedId).then(
      r => {
        if (cancelled) return;
        setLinked(r ? { id: linkedId, status: "found", item: r.item, tab: r.tab } : { id: linkedId, status: "missing" });
      },
      () => {
        if (!cancelled) setLinked({ id: linkedId, status: "missing" });
      },
    );
    return () => {
      cancelled = true;
    };
    // `counts` changes after every action and realtime refresh, so the card
    // reflects a resolution made anywhere.
  }, [linkedId, user, counts]);

  const actRef = useRef(inbox.act);
  actRef.current = inbox.act;
  useEffect(() => {
    if (linked?.status !== "found" || !linked.item || openedRef.current === linked.id) return;
    openedRef.current = linked.id;
    if (linked.tab) setTab(linked.tab);
    if (!linked.item.isRead) void actRef.current([linked.id], "read").catch(() => undefined);
  }, [linked]);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => setSelected(new Set()), [tab]);

  // The parent's badge must be told the count; held in a ref so an inline
  // arrow prop does not re-run the effect on every render.
  const onReadChangeRef = useRef(onReadChange);
  onReadChangeRef.current = onReadChange;
  const unreadTotal = counts?.unread_total ?? 0;
  useEffect(() => {
    onReadChangeRef.current?.(unreadTotal);
  }, [unreadTotal]);

  const tabCount = (id: AdminTab): number | null => {
    if (!counts) return null;
    switch (id) {
      case "action":
        return counts.action_unresolved;
      case "community":
        return counts.community_active;
      case "platform":
        return counts.platform_active;
      case "saved":
        return counts.saved;
      default:
        return null;
    }
  };
  const tabUnread = (id: AdminTab): number =>
    !counts ? 0 : id === "action" ? counts.action_unread : id === "community" ? counts.community_unread : id === "platform" ? counts.platform_unread : 0;

  const selectedItems = useMemo(() => items.filter(i => selected.has(i.id)), [items, selected]);
  const selectionBlocksDone = selectedItems.some(i => !canMarkDone(i));
  const lifecycle = mode === "v2";

  const run = async (label: string, work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      toast.error(`Could not ${label}`);
    }
  };

  const bulk = (action: "read" | "done" | "save") =>
    run(action === "read" ? "mark those read" : action === "done" ? "clear those" : "save those", async () => {
      const r = await inbox.act([...selected], action);
      setSelected(new Set());
      if (action === "done" && r.skipped > 0) {
        toast.info(`${r.skipped} unresolved action item${r.skipped === 1 ? "" : "s"} kept — resolve ${r.skipped === 1 ? "it" : "them"} first.`);
      }
    });

  const activeTabMeta = ADMIN_TABS.find(t => t.id === tab)!;
  const tabIsInboxCategory = tab === "action" || tab === "community" || tab === "platform";
  const expiry = tabIsInboxCategory ? ADMIN_EXPIRY_DAYS[tab as AdminCategory] : null;

  return (
    <section className="space-y-3" aria-labelledby="admin-notifications-heading" data-testid="admin-notifications">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="admin-notifications-heading" className="flex items-center gap-2 font-bold text-foreground">
          <Inbox className="h-4 w-4" aria-hidden="true" /> Notifications
        </h3>
        {counts && (
          <p className="text-xs text-muted-foreground" data-testid="admin-notification-summary">
            <span className={cn(counts.action_unresolved > 0 && "font-semibold text-foreground")}>
              {counts.action_unresolved} unresolved
            </span>
            {counts.action_critical > 0 && (
              <span className="font-semibold text-destructive"> · {counts.action_critical} critical</span>
            )}
            {" · "}
            {counts.unread_total} unread
          </p>
        )}
      </div>

      {mode === "legacy" && (
        <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground">
          Showing the 50 most recent notifications. Done, Save, history and resolution sync turn on once the
          Notifications 2.0 database migration is applied.
        </p>
      )}

      {linkedId && (
        <section aria-label="Linked notification" data-testid="admin-notification-linked" className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Opened from a link</p>
            <Link to={closeLinkedHref} data-testid="admin-notification-linked-close" className="text-xs text-primary hover:underline">
              Close
            </Link>
          </div>
          {(!linked || linked.status === "loading") && <p className="text-xs text-muted-foreground">Loading…</p>}
          {linked?.status === "missing" && (
            <p
              role="status"
              data-testid="admin-notification-linked-missing"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground"
            >
              This notification no longer exists, or this session can’t access it.
            </p>
          )}
          {linked?.status === "found" && linked.item && (
            <ul>
              <NotificationRow
                item={linked.item}
                linked
                lifecycle={lifecycle}
                nowMs={nowMs}
                selected={false}
                onSelect={() => undefined}
                onAct={action =>
                  void run("update that notification", async () => {
                    if (!lifecycle && action !== "read") return;
                    await inbox.act([linked.id], action);
                  })
                }
                onResolve={resolution =>
                  void run("resolve that item", async () => {
                    const r = await inbox.resolve([linked.id], resolution);
                    if (r.refused > 0) toast.info("Resolve this in its own workflow — use the record link.");
                  })
                }
                onReopen={() => void run("reopen that item", () => inbox.reopen(linked.id))}
                onSubjectChanged={() => void inbox.refresh()}
              />
            </ul>
          )}
        </section>
      )}

      <div role="tablist" aria-label="Notification categories" className="flex flex-wrap gap-1 border-b border-border">
        {ADMIN_TABS.map(t => {
          const count = tabCount(t.id);
          const unread = tabUnread(t.id);
          const selectedTab = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`admin-notif-tab-${t.id}`}
              aria-selected={selectedTab}
              aria-controls="admin-notif-panel"
              data-testid={`admin-notif-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedTab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.id === "action" && (counts?.action_critical ?? 0) > 0 && (
                <AlertTriangle className="h-3 w-3 text-destructive" aria-hidden="true" />
              )}
              {t.label}
              {count != null && count > 0 && (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                    t.id === "action" ? "bg-destructive text-destructive-foreground" : "bg-secondary text-secondary-foreground",
                  )}
                  aria-label={`${count} ${t.id === "action" ? "unresolved" : "items"}${unread ? `, ${unread} unread` : ""}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div id="admin-notif-panel" role="tabpanel" aria-labelledby={`admin-notif-tab-${tab}`} className="space-y-2">
        <p className="text-[11px] text-muted-foreground">{activeTabMeta.description}</p>

        {lifecycle && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="admin-notification-toolbar">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={selected.size > 0 && selected.size === items.length}
                ref={el => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < items.length;
                }}
                onChange={e => setSelected(e.target.checked ? new Set(items.map(i => i.id)) : new Set())}
                aria-label="Select all shown"
              />
              {selected.size > 0 ? `${selected.size} selected` : "Select"}
            </label>
            {selected.size > 0 ? (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulk("read")}>
                  Mark read
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => bulk("done")}
                  title={selectionBlocksDone ? "Unresolved action items in the selection will be kept" : undefined}
                >
                  Done
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulk("save")}>
                  Save
                </Button>
              </>
            ) : (
              tabIsInboxCategory && (
                <>
                  {tabUnread(tab) > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => run("mark the tab read", () => inbox.act(null, "read", tab as AdminCategory))}
                    >
                      <Check className="h-3 w-3" aria-hidden="true" /> Mark all read
                    </Button>
                  )}
                  {tab !== "action" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      onClick={() => run("clear the tab", () => inbox.act(null, "done", tab as AdminCategory))}
                    >
                      <CheckCheck className="h-3 w-3" aria-hidden="true" /> Clear all
                    </Button>
                  )}
                </>
              )
            )}
            {expiry != null && (
              <span className="ml-auto text-[10px] text-muted-foreground">Unsaved items leave after {expiry} days</span>
            )}
          </div>
        )}

        {mode === "legacy" && tabIsInboxCategory && items.some(i => !i.isRead) && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={() => run("mark those read", () => inbox.act(items.filter(i => !i.isRead).map(i => i.id), "read"))}
          >
            <Check className="h-3 w-3" aria-hidden="true" /> Mark all read
          </Button>
        )}

        {status === "loading" && (
          <p className="py-6 text-center text-sm text-muted-foreground" data-testid="admin-notifications-loading">
            Loading…
          </p>
        )}
        {status === "error" && (
          <div className="py-6 text-center" data-testid="admin-notifications-error">
            <p className="text-sm text-muted-foreground">Couldn’t load notifications.</p>
            <Button size="sm" variant="link" onClick={() => void inbox.refresh()}>
              Try again
            </Button>
          </div>
        )}
        {status === "ready" && items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground" data-testid="admin-notifications-empty">
            {tab === "action"
              ? "Nothing needs action. Every report and request is resolved."
              : tab === "completed"
                ? "No history yet."
                : tab === "saved"
                  ? "Nothing saved."
                  : "You’re all caught up."}
          </p>
        )}

        {status === "ready" && items.length > 0 && (
          <ul className="space-y-2">
            {items.map(item => (
              <NotificationRow
                key={item.id}
                item={item}
                lifecycle={lifecycle}
                highlighted={item.id === linkedId}
                nowMs={nowMs}
                selected={selected.has(item.id)}
                onSelect={checked =>
                  setSelected(prev => {
                    const next = new Set(prev);
                    if (checked) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  })
                }
                onAct={action =>
                  void run("update that notification", async () => {
                    if (!lifecycle && action !== "read") return;
                    await inbox.act([item.id], action);
                  })
                }
                onResolve={resolution =>
                  void run("resolve that item", async () => {
                    const r = await inbox.resolve([item.id], resolution);
                    if (r.refused > 0) toast.info("Resolve this in its own workflow — use the record link.");
                  })
                }
                onReopen={() => void run("reopen that item", () => inbox.reopen(item.id))}
              />
            ))}
          </ul>
        )}

        {inbox.hasMore && (
          <div className="pt-1 text-center">
            <Button size="sm" variant="outline" disabled={inbox.loadingMore} onClick={() => void inbox.loadMore()}>
              {inbox.loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
