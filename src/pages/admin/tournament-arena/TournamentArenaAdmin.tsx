// ---------------------------------------------------------------------------
// Admin · Tournament Arena (admin-only beta).
//
//   /admin/tournament-arena                 dashboard: service state + every event
//   /admin/tournament-arena/new             Match Host Portal (create)
//   /admin/tournament-arena/event/:eventId  organizer console (the event page,
//                                           with organizer controls and tools)
//
// AUTHORITY: the routes sit inside <AdminRoute> + <AdminAuthGate>, but that
// only decides what renders. Every organizer call is decided server-side from
// the owner's own Supabase session (`ARENA_ORGANIZER_REQUIRED` otherwise), and
// goes through `ownerArenaCall` so a lapsed attestation re-verifies instead of
// failing. Players never come here: they use /quiz/arena/*.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ExternalLink, Loader2, Plus, RefreshCw, Settings2, Swords, Trophy, X } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import { useFriends } from "@/hooks/useFriends";
import { cn } from "@/lib/utils";

import {
  adminListArenaEvents, adminRemoveArenaEntrant, adminUpdateArenaEvent, arenaErrorCopy, cancelArenaEvent,
  getArenaCatalog, inviteToArenaEvent, isArenaApiError, newArenaActionId, withdrawArenaInvite,
  type ArenaCatalog,
} from "@/features/tournament-arena/api/arenaApi";
import { ownerArenaCall } from "@/features/tournament-arena/api/ownerArena";
import { useLiveArenaEvent } from "@/features/tournament-arena/api/useLiveArenaEvent";
import type { ArenaBestOf, ArenaEntrant, ArenaEvent } from "@/features/tournament-arena/contracts";
import { EventPage } from "@/features/tournament-arena/event/EventPage";
import { gameTypeById } from "@/features/tournament-arena/fixtures/catalog";
import { useHttpEventControls } from "@/features/tournament-arena/live/useHttpEventControls";
import { HostPortal } from "@/features/tournament-arena/portal/HostPortal";
import { httpPortalSource } from "@/features/tournament-arena/portal/portalSource";
import {
  ARENA_ADMIN_BASE, ARENA_ADMIN_NEW, absoluteArenaJoinLink, arenaAdminEventHref, arenaEventHref, arenaMatchHref,
} from "@/features/tournament-arena/routes";
import { Btn, Eyebrow, Pill } from "@/features/tournament-arena/ui/parts";
import { ArenaNotice, EventRow } from "@/pages/arena/ArenaPlayerPages";
import "@/features/tournament-arena/tournament-arena.css";

export const TOURNAMENT_ARENA_ADMIN_PATH = ARENA_ADMIN_BASE;

type CatalogState = { catalog: ArenaCatalog | null; error: unknown };

function useArenaCatalog(): CatalogState & { reload: () => void } {
  const [state, setState] = useState<CatalogState>({ catalog: null, error: null });
  const reload = useCallback(() => {
    getArenaCatalog().then((catalog) => setState({ catalog, error: null }), (error) => setState({ catalog: null, error }));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

/* ── dashboard (inside the Admin shell) ──────────────────────────────────── */

export default function TournamentArenaAdminPage() {
  const { catalog, error: catalogError, reload } = useArenaCatalog();
  const [events, setEvents] = useState<ArenaEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const arenaOff = isArenaApiError(catalogError) && catalogError.code === "ARENA_DISABLED";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await ownerArenaCall("Viewing Tournament Arena events", () => adminListArenaEvents());
    if (r.status === "done") setEvents(r.value);
    else setError(r.notice);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto w-full max-w-5xl px-1 py-2" data-testid="admin-tournament-arena">
      <SEOHead title="Mogzy Admin · Tournament Arena" description="Private administration." path={ARENA_ADMIN_BASE} noindex />
      <AdminAuthGate>
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="h-5 w-5 text-primary" aria-hidden /> Tournament Arena</h1>
            <p className="max-w-2xl text-xs text-muted-foreground">
              Create and run duels, custom matches and single-elimination tournaments on the Ranked engine. Admin-only beta:
              only you can create or manage events; players join through a join link or an invitation and play their own
              matches. Arena matches are unrated. There is no public directory.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { reload(); void load(); }} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
            </Button>
            {catalog ? (
              <Button size="sm" className="gap-1.5" asChild>
                <Link to={ARENA_ADMIN_NEW} data-testid="admin-arena-new"><Plus className="h-3.5 w-3.5" aria-hidden /> New event</Link>
              </Button>
            ) : (
              <Button size="sm" className="gap-1.5" disabled data-testid="admin-arena-new"><Plus className="h-3.5 w-3.5" aria-hidden /> New event</Button>
            )}
          </div>
        </header>

        <div className="space-y-4">
          <AdminPanel title="Service state" description="Read from the backend on every visit. The backend flag, not this page, decides whether anything works." testId="admin-arena-status">
            {catalog ? (
              <dl className="grid gap-2 text-xs sm:grid-cols-4">
                <Flag label="Arena (ARENA_ENABLED)" ok />
                <Flag label="New starts (queue_arena_enabled)" ok={catalog.new_starts_enabled} />
                <Flag label="Ranked engine (RANKED_PUBLIC_ENABLED)" ok={catalog.ranked_engine_enabled} />
                <Flag label={`Game types servable`} ok={catalog.game_types.some((g) => g.available !== false)} detail={`${catalog.game_types.filter((g) => g.available !== false).length}/${catalog.game_types.length}`} />
              </dl>
            ) : catalogError ? (
              <p className="text-xs text-muted-foreground" data-testid="admin-arena-off">
                {arenaOff ? "The Arena is OFF on the backend (ARENA_ENABLED is not set). Nothing can be created or played until the owner enables it in Railway." : arenaErrorCopy(catalogError)}
              </p>
            ) : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
            {catalog && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Limits: up to {catalog.limits.max_entrants} players · Bo{catalog.limits.best_of_options.join("/")} · ready check {Math.round(catalog.limits.ready_deadline_seconds / 60)} min · {catalog.limits.max_draw_replays} draw replays · invitations last {catalog.limits.invite_ttl_minutes} min.
              </p>
            )}
          </AdminPanel>

          <AdminPanel title="Events" description="Every Arena event, newest first. Open one to run it." testId="admin-arena-events">
            {error && <p className="mb-2 text-xs text-destructive" role="alert">{error}</p>}
            {!events ? (loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null)
              : events.length === 0 ? <p className="text-xs text-muted-foreground">No events yet. Create one with New event.</p>
              : (
                <div className="ta flex flex-col gap-2 rounded-lg bg-[#07111f] p-2">
                  {events.map((ev) => <EventRow key={ev.event_id} ev={ev} href={arenaAdminEventHref(ev.event_id)} />)}
                </div>
              )}
          </AdminPanel>
        </div>
      </AdminAuthGate>
    </div>
  );
}

function Flag({ label, ok = false, detail }: { label: string; ok?: boolean; detail?: string }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-semibold", ok ? "text-emerald-400" : "text-amber-300")}>{ok ? "On" : "Off"}{detail ? ` · ${detail}` : ""}</dd>
    </div>
  );
}

function friendEntrants(rows: ReturnType<typeof useFriends>["friends"]): ArenaEntrant[] {
  return rows.map((r) => ({
    profile_id: r.profile.id,
    display_name: r.profile.display_name ?? "Summoner",
    seed: null,
    status: "joined" as const,
    role: "player" as const,
    role_emblem: null,
    tier: null,
  }));
}

/* ── /admin/tournament-arena/new ─────────────────────────────────────────── */

export function TournamentArenaAdminCreate() {
  const navigate = useNavigate();
  const { catalog, error } = useArenaCatalog();
  const { friends } = useFriends();
  const source = useMemo(() => (catalog ? httpPortalSource(catalog, friendEntrants(friends)) : null), [catalog, friends]);
  if (!source) {
    return <div className="theme-lol"><ArenaNotice title="Create an event" error={error} text={error ? undefined : "Loading the Arena catalog…"} busy={!error} backHref={ARENA_ADMIN_BASE} /></div>;
  }
  return (
    <div className="theme-lol">
      <AdminAuthGate>
        <HostPortal source={source} backHref={ARENA_ADMIN_BASE} onLaunched={(id) => navigate(arenaAdminEventHref(id), { replace: true })} />
      </AdminAuthGate>
    </div>
  );
}

/* ── /admin/tournament-arena/event/:eventId ──────────────────────────────── */

export function TournamentArenaAdminConsole() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const live = useLiveArenaEvent(eventId, { admin: true });
  const openRoom = useCallback((nodeId: string) => navigate(arenaMatchHref(eventId, nodeId)), [navigate, eventId]);
  const controls = useHttpEventControls(live, { manage: true, openRoom });
  const [toolsOpen, setToolsOpen] = useState(false);
  const duelHref = useCallback((id: string, nodeId: string) => arenaMatchHref(id, nodeId), []);
  const ev = live.event;
  if (!ev) {
    return (
      <div className="theme-lol">
        <ArenaNotice title="Organizer console" error={live.error} text={live.error ? undefined : "Loading the event…"} busy={!live.error} backHref={ARENA_ADMIN_BASE} />
      </div>
    );
  }
  return (
    <div className="theme-lol" data-testid="admin-arena-console">
      <EventPage
        event={ev}
        controls={controls}
        viewerId={ev.viewer_profile_id}
        duelHref={duelHref}
        backHref={ARENA_ADMIN_BASE}
        joinHref={ev.join_code ? absoluteArenaJoinLink(ev.join_code) : null}
        tools={<Btn size="sm" onClick={() => setToolsOpen(true)} data-testid="admin-arena-tools-open"><Settings2 className="h-3.5 w-3.5" aria-hidden="true" />Organizer tools</Btn>}
      />
      {toolsOpen && <OrganizerTools event={ev} onClose={() => setToolsOpen(false)} onApplied={live.apply} onRefresh={live.refresh} />}
    </div>
  );
}

function OrganizerTools({ event, onClose, onApplied, onRefresh }: {
  event: ArenaEvent;
  onClose: () => void;
  onApplied: (ev: ArenaEvent) => void;
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const { friends } = useFriends();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState(event.title);
  const [bestOf, setBestOf] = useState<ArenaBestOf>(event.best_of);
  const [cap, setCap] = useState(event.max_entrants);
  const [modules, setModules] = useState(event.rules.modules);
  const open = event.status === "open";
  const seated = new Set(event.entrants.filter((e) => e.status !== "withdrawn").map((e) => e.profile_id));
  const invitedIds = new Set((event.invites ?? []).map((i) => i.recipient_profile_id));
  const name = (pid: string) => event.entrants.find((e) => e.profile_id === pid)?.display_name
    ?? friends.find((f) => f.profile.id === pid)?.profile.display_name ?? "A player";

  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Focus lands on Close when the drawer opens (once); Escape closes it.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const act = async (id: string, reason: string, call: () => Promise<ArenaEvent | void>) => {
    setBusy(id);
    setNotice(null);
    const r = await ownerArenaCall(reason, call);
    if (r.status === "done") {
      if (r.value) onApplied(r.value);
      else onRefresh();
    } else setNotice(r.notice);
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Organizer tools" data-testid="admin-arena-tools" onClick={onClose}>
      {/* pt-16: the global HUD floats over the top-right corner. */}
      <aside className="ta ta-stage ta-scroll flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto p-4 pt-16" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Eyebrow>Organizer tools</Eyebrow>
            <h2 className="ta-title truncate text-[18px] font-bold text-white">{event.title}</h2>
          </div>
          <button ref={closeRef} type="button" className="ta-btn ta-btn--sm" onClick={onClose} aria-label="Close organizer tools"><X className="h-4 w-4" /></button>
        </div>
        {notice && <p role="alert" className="text-[12px] text-[#f6c3cc]" data-testid="admin-arena-tools-notice">{notice}</p>}

        {event.join_code && (
          <section className="ta-plate flex flex-col gap-2 p-3">
            <Eyebrow tone="muted">Join link</Eyebrow>
            <code className="break-all text-[12px] text-[#f1dc9c]" data-testid="admin-arena-join-link">{absoluteArenaJoinLink(event.join_code)}</code>
            <p className="text-[11px] text-[rgba(215,205,180,0.6)]">Players open it signed in and press Join. Code {event.join_code}.</p>
          </section>
        )}

        {open && (
          <section className="ta-plate flex flex-col gap-2 p-3">
            <Eyebrow tone="muted">Invite friends</Eyebrow>
            {friends.length === 0 && <p className="text-[12px] text-[rgba(215,205,180,0.6)]">No accepted friends to invite. Use the join link.</p>}
            <ul className="flex flex-col gap-1">
              {friends.filter((f) => !seated.has(f.profile.id)).map((f) => (
                <li key={f.profile.id} className="flex items-center gap-2 text-[12.5px] text-white">
                  <span className="min-w-0 flex-1 truncate">{f.profile.display_name ?? "Summoner"}</span>
                  {invitedIds.has(f.profile.id) ? <Pill tone="muted">Invited</Pill> : (
                    <Btn size="sm" disabled={busy !== null} onClick={() => { const a = newArenaActionId("invite"); void act(`invite:${f.profile.id}`, "Inviting a friend to an Arena event", async () => { await inviteToArenaEvent(event.event_id, f.profile.id, a); }); }}>Invite</Btn>
                  )}
                </li>
              ))}
            </ul>
            {(event.invites ?? []).length > 0 && (
              <>
                <Eyebrow tone="muted" className="mt-2">Pending</Eyebrow>
                <ul className="flex flex-col gap-1">
                  {(event.invites ?? []).map((i) => (
                    <li key={i.invite_id} className="flex items-center gap-2 text-[12.5px] text-white">
                      <span className="min-w-0 flex-1 truncate">{name(i.recipient_profile_id)}</span>
                      <Btn size="sm" disabled={busy !== null} onClick={() => void act(`withdraw:${i.invite_id}`, "Withdrawing an Arena invitation", async () => { await withdrawArenaInvite(i.invite_id); })}>Withdraw</Btn>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {open && (
          <section className="ta-plate flex flex-col gap-2 p-3" data-testid="admin-arena-settings">
            <Eyebrow tone="muted">Settings (until the bracket locks)</Eyebrow>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.14em] text-[rgba(215,205,180,0.7)]">Title
              <input className="ta-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              {([1, 3, 5] as const).map((b) => <button key={b} type="button" aria-pressed={bestOf === b} className="ta-chip" onClick={() => setBestOf(b)}>Bo{b}</button>)}
            </div>
            {event.kind === "tournament" && (
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.14em] text-[rgba(215,205,180,0.7)]">Seats · {cap}
                <input type="range" className="ta-range" min={Math.max(2, seated.size)} max={32} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
              </label>
            )}
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.14em] text-[rgba(215,205,180,0.7)]">Length · {modules} {gameTypeById(event.game_type).unit}
              <input type="range" className="ta-range" min={1} max={20} value={modules} onChange={(e) => setModules(Number(e.target.value))} />
            </label>
            <Btn tone="primary" size="sm" disabled={busy !== null} data-testid="admin-arena-save" onClick={() => {
              const a = newArenaActionId("edit");
              void act("edit", "Editing an Arena event", () => adminUpdateArenaEvent(event.event_id, {
                title: title.trim() || event.title, best_of: bestOf,
                ...(event.kind === "tournament" ? { max_entrants: cap } : {}),
                rules: { ...event.rules, modules },
              }, a));
            }}>Save settings</Btn>
            <p className="text-[11px] text-[rgba(215,205,180,0.55)]">The server re-validates the format; an invalid length is refused, not clamped.</p>
          </section>
        )}

        {open && (
          <section className="ta-plate flex flex-col gap-1 p-3">
            <Eyebrow tone="muted">Players</Eyebrow>
            {event.entrants.filter((e) => e.status !== "withdrawn").map((e) => (
              <div key={e.profile_id} className="flex items-center gap-2 text-[12.5px] text-white">
                <span className="min-w-0 flex-1 truncate">{e.display_name}{e.role === "organizer" ? " · organizer" : ""}</span>
                {e.role !== "organizer" && (
                  <Btn size="sm" tone="danger" disabled={busy !== null} onClick={() => {
                    if (!window.confirm(`Remove ${e.display_name} from this event? They can rejoin with the link.`)) return;
                    const a = newArenaActionId("remove");
                    void act(`remove:${e.profile_id}`, "Removing a player from an Arena event", () => adminRemoveArenaEntrant(event.event_id, e.profile_id, a));
                  }}>Remove</Btn>
                )}
              </div>
            ))}
          </section>
        )}

        {event.viewer_profile_id && event.entrants.some((e) => e.profile_id === event.viewer_profile_id && e.status !== "withdrawn") && (
          <Btn size="sm" onClick={() => navigate(arenaEventHref(event.event_id))}><Swords className="h-3.5 w-3.5" aria-hidden="true" />Open your player view<ExternalLink className="h-3 w-3" aria-hidden="true" /></Btn>
        )}

        {(event.status === "open" || event.status === "locked" || event.status === "running") && (
          <Btn size="sm" tone="danger" disabled={busy !== null} data-testid="admin-arena-cancel" onClick={() => {
            const reason = window.prompt("Cancel this event for everyone? Give a short reason (shown in the audit trail):");
            if (reason === null) return;
            const a = newArenaActionId("cancel");
            void act("cancel", "Cancelling an Arena event", () => cancelArenaEvent(event.event_id, reason.trim() || null, a));
          }}>Cancel event</Btn>
        )}

        <section className="ta-plate flex flex-col gap-1 p-3" data-testid="admin-arena-audit">
          <Eyebrow tone="muted" className="inline-flex items-center gap-1.5"><Activity className="h-3 w-3" aria-hidden="true" />Audit trail</Eyebrow>
          <ol className="flex flex-col gap-1 text-[11.5px] text-[rgba(215,205,180,0.8)]">
            {(event.audit ?? []).slice(0, 60).map((a, i) => (
              <li key={`${a.at}:${i}`} className="flex gap-2">
                <span className="ta-num w-12 shrink-0 text-[rgba(215,205,180,0.5)]">r{a.revision ?? "–"}</span>
                <span className="min-w-0 flex-1"><b className="text-white">{a.kind.replace(/_/g, " ")}</b> · {a.system ? "system" : a.actor_profile_id ? name(a.actor_profile_id) : "unknown"}{a.payload && typeof a.payload.reason === "string" ? ` · ${a.payload.reason}` : ""}{a.payload && typeof a.payload.note === "string" ? ` · “${a.payload.note}”` : ""}</span>
                <time className="shrink-0 text-[rgba(215,205,180,0.45)]" dateTime={a.at}>{new Date(a.at).toLocaleTimeString()}</time>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
