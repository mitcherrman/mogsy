import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Bookmark, BookmarkCheck, Lock, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { fetchMutedCategories, saveMutedCategories, type PlayerInboxItem, type PlayerView } from "@/lib/notifications/api";
import {
  LOCKED_PLAYER_CATEGORIES,
  MUTABLE_PLAYER_CATEGORIES,
  formatRelative,
  resolutionLabel,
  type PlayerCategory,
} from "@/lib/notifications/policy";
import { usePlayerInbox } from "@/lib/notifications/usePlayerInbox";
import { cn } from "@/lib/utils";

/**
 * The player's notification home (Notifications 2.0, #92): the full inbox,
 * what they saved, the history of everything that left the inbox (dismissed,
 * expired, or no longer actionable), and which OPTIONAL categories they want.
 * Account and security notices are listed as always-on: no client can mute
 * them, and the database refuses it too.
 */
const VIEWS: ReadonlyArray<{ id: PlayerView; label: string; empty: string }> = [
  { id: "inbox", label: "Inbox", empty: "You’re all caught up." },
  { id: "saved", label: "Saved", empty: "Nothing saved yet." },
  { id: "history", label: "History", empty: "Nothing here yet." },
];

const stateLabel = (item: PlayerInboxItem): string | null => {
  if (item.state === "resolved") return resolutionLabel(item.resolution);
  if (item.state === "done") return "Dismissed";
  if (item.state === "expired") return "Expired";
  return null;
};

function Preferences({ userId }: { userId: string }) {
  const [muted, setMuted] = useState<Set<PlayerCategory> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMutedCategories(userId).then(
      m => !cancelled && setMuted(new Set(m)),
      () => !cancelled && setMuted(new Set()),
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = async (id: PlayerCategory, on: boolean) => {
    if (!muted) return;
    const next = new Set(muted);
    if (on) next.delete(id);
    else next.add(id);
    const previous = muted;
    setMuted(next);
    setSaving(true);
    try {
      await saveMutedCategories([...next]);
    } catch {
      setMuted(previous);
      toast.error("Couldn’t save your notification settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="notif-prefs-heading" className="rounded-2xl border border-border bg-card/60 p-4" data-testid="notification-preferences">
      <h2 id="notif-prefs-heading" className="text-sm font-bold text-foreground">What to notify me about</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Turning a category off hides it from your inbox and badge. You can still find it in History.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {MUTABLE_PLAYER_CATEGORIES.map(c => {
          const on = muted ? !muted.has(c.id) : true;
          return (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <label htmlFor={`notif-pref-${c.id}`} className="text-sm font-medium text-foreground">
                  {c.label}
                </label>
                <p className="text-xs text-muted-foreground">{c.description}</p>
              </div>
              <Switch
                id={`notif-pref-${c.id}`}
                checked={on}
                disabled={!muted || saving}
                onCheckedChange={v => void toggle(c.id, v)}
                data-testid={`notification-pref-${c.id}`}
              />
            </li>
          );
        })}
        {LOCKED_PLAYER_CATEGORIES.map(c => (
          <li key={c.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{c.label}</p>
              <p className="text-xs text-muted-foreground">Always on — these protect your account.</p>
            </div>
            <Lock className="h-4 w-4 text-muted-foreground" aria-label="Always on" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<PlayerView>("inbox");
  const isAccount = Boolean(user && !user.is_anonymous);
  const inbox = usePlayerInbox({
    enabled: isAccount,
    userId: user?.id ?? null,
    signupAt: user?.created_at ?? null,
    view,
    pageSize: 30,
  });
  const lifecycle = inbox.mode === "v2";

  const act = async (ids: string[] | null, action: Parameters<typeof inbox.act>[1], failure: string) => {
    try {
      await inbox.act(ids, action);
    } catch {
      toast.error(failure);
    }
  };

  const open = (n: PlayerInboxItem) => {
    if (!n.isRead) void act([n.id], "read", "Couldn’t mark that as read");
    if (n.type === "friend_request" && n.state === "active") {
      window.dispatchEvent(new Event("open-friends-panel"));
      return;
    }
    if (n.type === "friend_accepted" && n.metadata?.addressee_profile_id) {
      navigate(`/user/${n.metadata.addressee_profile_id}`);
      return;
    }
    if (n.actionUrl?.startsWith("/")) navigate(n.actionUrl);
  };

  const current = VIEWS.find(v => v.id === view)!;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <SEOHead title="Notifications — Mogzy" description="Your Mogzy notifications." path="/notifications" noindex />

      <header className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </Button>
        <h1 className="flex w-full items-center gap-2 text-xl font-bold text-foreground">
          <Bell className="h-5 w-5" aria-hidden="true" /> Notifications
        </h1>
      </header>

      {!isAccount ? (
        <p className="text-sm text-muted-foreground">Sign in to see your notifications.</p>
      ) : (
        <div className="space-y-6">
          <section aria-label="Notification list">
            <div role="tablist" aria-label="Notification views" className="flex gap-1 border-b border-border">
              {VIEWS.map(v => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  data-testid={`notifications-view-${v.id}`}
                  onClick={() => setView(v.id)}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    view === v.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v.label}
                  {v.id === "inbox" && inbox.summary.unread > 0 && view !== "inbox" && (
                    <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                      {inbox.summary.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {view === "inbox" && lifecycle && inbox.items.length > 0 && (
              <div className="flex justify-end gap-3 py-2">
                {inbox.summary.unread > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void act(null, "read_all", "Couldn’t mark those as read")}>
                    Mark all read
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void act(null, "done_all", "Couldn’t clear your inbox")}>
                  Clear all
                </Button>
              </div>
            )}

            {inbox.status === "loading" && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
            {inbox.status === "error" && (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">Couldn’t load your notifications.</p>
                <Button size="sm" variant="link" onClick={() => void inbox.refresh()}>
                  Try again
                </Button>
              </div>
            )}
            {inbox.status === "ready" && inbox.items.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground" data-testid="notifications-empty">
                {current.empty}
              </p>
            )}

            {inbox.status === "ready" && inbox.items.length > 0 && (
              <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-card">
                {inbox.items.map(n => {
                  const label = stateLabel(n);
                  return (
                    <li key={n.id} data-testid={`notifications-item-${n.id}`} className={cn("flex items-start gap-2 p-3", !n.isRead && "bg-primary/5")}>
                      <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                        {n.type === "friend_request" && n.state === "active" && (
                          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Needs your response</p>
                        )}
                        <p className={cn("text-sm font-medium", n.isRead ? "text-muted-foreground" : "text-foreground")}>{n.title}</p>
                        {n.message && <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>}
                        <p className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                          <time dateTime={n.activityAt} title={new Date(n.activityAt).toLocaleString()}>
                            {formatRelative(n.activityAt)}
                          </time>
                          {label && <span>· {label}</span>}
                        </p>
                      </button>
                      {lifecycle && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            aria-pressed={n.isSaved}
                            aria-label={n.isSaved ? `Unsave: ${n.title}` : `Save: ${n.title}`}
                            onClick={() => void act([n.id], n.isSaved ? "unsave" : "save", "Couldn’t update that")}
                          >
                            {n.isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                          </Button>
                          {n.state === "done" ? (
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Move back to inbox: ${n.title}`} onClick={() => void act([n.id], "undone", "Couldn’t restore that")}>
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          ) : n.state === "active" ? (
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Dismiss: ${n.title}`} onClick={() => void act([n.id], "done", "Couldn’t dismiss that")}>
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {inbox.hasMore && (
              <div className="pt-3 text-center">
                <Button size="sm" variant="outline" disabled={inbox.loadingMore} onClick={() => void inbox.loadMore()}>
                  {inbox.loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </section>

          {lifecycle && user && <Preferences userId={user.id} />}
        </div>
      )}
    </div>
  );
}
