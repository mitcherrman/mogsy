/**
 * TOURNAMENT ARENA — the player routes (admin-only beta).
 *
 *   /quiz/arena                       your events + your invitations
 *   /quiz/arena/join/:code            the join link an organizer shares
 *   /quiz/arena/e/:eventId            the event (lobby → bracket → champion)
 *   /quiz/arena/e/:eventId/match/:id  your match room (ready check → match)
 *
 * Minimal on purpose: no directory, no create button, no entry from any hub.
 * A player needs only a signed-in account; nothing here grants or asks for
 * organizer authority, and the event page never shows organizer controls
 * (the participant read never carries the organizer view).
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Swords, Trophy, X } from "lucide-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAuth } from "@/hooks/useAuth";
import { useProfileIdentity } from "@/hooks/useProfileIdentity";
import { authHref } from "@/lib/auth/auth-destination";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";

import {
  acceptArenaInvite, arenaErrorCopy, declineArenaInvite, isArenaApiError, joinArenaEvent, listArenaEvents,
  listArenaInvites, resolveArenaJoinCode, type ArenaInboxInvite,
} from "@/features/tournament-arena/api/arenaApi";
import { useLiveArenaEvent } from "@/features/tournament-arena/api/useLiveArenaEvent";
import type { ArenaEvent } from "@/features/tournament-arena/contracts";
import { EventPage } from "@/features/tournament-arena/event/EventPage";
import { gameTypeById } from "@/features/tournament-arena/fixtures/catalog";
import { ArenaMatchRoom } from "@/features/tournament-arena/live/ArenaMatchRoom";
import { useHttpEventControls } from "@/features/tournament-arena/live/useHttpEventControls";
import { ARENA_PLAYER_BASE, arenaEventHref, arenaMatchHref } from "@/features/tournament-arena/routes";
import { Btn, Eyebrow, Pill } from "@/features/tournament-arena/ui/parts";
import "@/features/tournament-arena/tournament-arena.css";

function needsAccount(e: unknown): boolean {
  return isArenaApiError(e) && (e.code === "ACCOUNT_REQUIRED" || e.code === "AUTH_REQUIRED");
}

/** A full-frame message in the Arena's own look. */
export function ArenaNotice({ title, text, error, backHref = ARENA_PLAYER_BASE, busy = false }: {
  title: string;
  text?: string;
  error?: unknown;
  backHref?: string | null;
  busy?: boolean;
}) {
  const motion = useMotionAllowed();
  const { pathname } = useLocation();
  const copy = text ?? (error ? arenaErrorCopy(error) : "");
  return (
    <div className={cn("ta ta-stage flex h-[var(--app-viewport-h)] flex-col items-center justify-center gap-3 px-4 text-center", motion && "ta--motion")} data-testid="ta-player-notice">
      {busy && <Loader2 className="h-6 w-6 animate-spin text-[#c9a84c]" aria-hidden="true" />}
      <Eyebrow>Tournament Arena</Eyebrow>
      <h1 className="ta-title ta-title--gold text-[22px] font-bold">{title}</h1>
      {copy && <p className="max-w-sm text-[13px] text-[rgba(215,205,180,0.8)]">{copy}</p>}
      {needsAccount(error) && <Link to={authHref(pathname)} className="ta-btn ta-btn--primary">Sign in</Link>}
      {backHref && <Link to={backHref} className="ta-btn ta-btn--sm">Back</Link>}
    </div>
  );
}

/* ── /quiz/arena ─────────────────────────────────────────────────────────── */

export function ArenaPlayerHome() {
  const motion = useMotionAllowed();
  const navigate = useNavigate();
  const [events, setEvents] = useState<ArenaEvent[] | null>(null);
  const [invites, setInvites] = useState<ArenaInboxInvite[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [joined, inbox] = await Promise.all([listArenaEvents("joined"), listArenaInvites()]);
      setEvents(joined);
      setInvites(inbox);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const answer = async (inv: ArenaInboxInvite, accept: boolean) => {
    setBusy(inv.invite_id);
    setNotice(null);
    try {
      if (accept) {
        const ev = await acceptArenaInvite(inv.token);
        navigate(arenaEventHref(ev.event_id));
        return;
      }
      await declineArenaInvite(inv.token);
      await load();
    } catch (e) {
      setNotice(arenaErrorCopy(e));
    } finally {
      setBusy(null);
    }
  };

  if (error && !events) return <ArenaNotice title="Your Arena" error={error} backHref="/quiz" />;
  return (
    <div className={cn("ta ta-stage flex min-h-[var(--app-viewport-h)] flex-col gap-5 px-4 py-5", motion && "ta--motion")} data-testid="ta-player-home">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3">
        <Link to="/quiz" className="ta-btn ta-btn--sm !px-2" aria-label="Back to Leaguecraft"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <Eyebrow>Tournament Arena</Eyebrow>
          <h1 className="ta-title ta-title--gold text-[22px] font-bold sm:text-[28px]">Your events</h1>
        </div>
      </header>
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-2" aria-label="Invitations">
        <Eyebrow tone="muted">Invitations · {invites.length}</Eyebrow>
        {notice && <p role="alert" className="text-[12px] text-[#f6c3cc]">{notice}</p>}
        {invites.length === 0 ? (
          <p className="text-[12.5px] text-[rgba(215,205,180,0.6)]">No invitations right now. An organizer can also send you a join link.</p>
        ) : invites.map((inv) => (
          <div key={inv.invite_id} className="ta-plate flex flex-wrap items-center gap-3 px-3 py-2.5" data-testid="ta-invite">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-white">{inv.event.title}</p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[rgba(215,205,180,0.6)]">{inv.sender_display_name ?? "The organizer"} · {gameTypeById(inv.event.game_type).title} · Bo{inv.event.best_of}</p>
            </div>
            <Btn size="sm" tone="primary" onClick={() => answer(inv, true)} disabled={busy === inv.invite_id} data-testid="ta-invite-accept"><Check className="h-3.5 w-3.5" aria-hidden="true" />Accept</Btn>
            <Btn size="sm" onClick={() => answer(inv, false)} disabled={busy === inv.invite_id}><X className="h-3.5 w-3.5" aria-hidden="true" />Decline</Btn>
          </div>
        ))}
      </section>
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-2" aria-label="Your events">
        <Eyebrow tone="muted">Events you are in</Eyebrow>
        {!events ? <Loader2 className="h-5 w-5 animate-spin text-[#c9a84c]" aria-hidden="true" />
          : events.length === 0 ? <p className="text-[12.5px] text-[rgba(215,205,180,0.6)]">You are not in any event yet.</p>
          : events.map((ev) => <EventRow key={ev.event_id} ev={ev} href={arenaEventHref(ev.event_id)} />)}
      </section>
    </div>
  );
}

export function EventRow({ ev, href, extra }: { ev: ArenaEvent; href: string; extra?: React.ReactNode }) {
  const me = ev.viewer_profile_id;
  const mine = me ? ev.bracket?.nodes.find((n) => (n.status === "ready" || n.status === "live") && n.slots.some((s) => s.profile_id === me)) : null;
  const champion = ev.champion_profile_id ? ev.entrants.find((e) => e.profile_id === ev.champion_profile_id) : null;
  return (
    <Link to={href} className="ta-plate flex flex-wrap items-center gap-3 px-3 py-2.5 outline-none hover:border-white/25 focus-visible:ring-2 focus-visible:ring-[#c9a84c]" data-testid="ta-event-row" data-status={ev.status}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-white">{ev.title}</p>
        <p className="text-[11px] uppercase tracking-[0.14em] text-[rgba(215,205,180,0.6)]">{ev.kind} · {gameTypeById(ev.game_type).title} · Bo{ev.best_of} · {ev.entrants.filter((e) => e.status !== "withdrawn").length}/{ev.max_entrants}</p>
      </div>
      {mine && <Pill tone="live"><Swords className="h-3 w-3" aria-hidden="true" />{mine.status === "live" ? "Your match is live" : "Your match is ready"}</Pill>}
      {champion && <Pill tone="gold"><Trophy className="h-3 w-3" aria-hidden="true" />{champion.display_name}</Pill>}
      <Pill tone={ev.status === "running" ? "live" : ev.status === "complete" ? "gold" : "muted"}>{ev.status}</Pill>
      {extra}
    </Link>
  );
}

/* ── /quiz/arena/join/:code ──────────────────────────────────────────────── */

export function ArenaJoinRoute() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [eventId, setEventId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    let live = true;
    resolveArenaJoinCode(code).then((id) => { if (live) setEventId(id); }, (e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [code]);
  const join = async () => {
    if (!eventId) return;
    setJoining(true);
    setError(null);
    try {
      const ev = await joinArenaEvent(eventId, code);
      navigate(arenaEventHref(ev.event_id), { replace: true });
    } catch (e) {
      if (isArenaApiError(e) && e.code === "ARENA_ALREADY_ENTRANT") {
        navigate(arenaEventHref(eventId), { replace: true });
        return;
      }
      setError(e);
    } finally {
      setJoining(false);
    }
  };
  if (error && !eventId) return <ArenaNotice title="Join an event" error={error} />;
  if (!eventId) return <ArenaNotice title="Join an event" text="Checking the join link…" busy backHref={null} />;
  return (
    <div className="ta ta-stage flex h-[var(--app-viewport-h)] flex-col items-center justify-center gap-4 px-4 text-center" data-testid="ta-join">
      <Eyebrow>Tournament Arena</Eyebrow>
      <h1 className="ta-title ta-title--gold text-[24px] font-bold">You have been invited to an event</h1>
      <p className="max-w-sm text-[13px] text-[rgba(215,205,180,0.8)]">Join with your Mogzy account. Matches are one-on-one on the Ranked engine and do not change your Ranked rating.</p>
      <code className="ta-title text-[18px] tracking-[0.16em] text-[#f1dc9c]">{code.toUpperCase()}</code>
      <Btn tone="primary" size="lg" onClick={join} disabled={joining} data-testid="ta-join-confirm"><Swords className="h-5 w-5" aria-hidden="true" />{joining ? "Joining…" : "Join the event"}</Btn>
      {error && <p role="alert" className="max-w-sm text-[12px] text-[#f6c3cc]">{arenaErrorCopy(error)}</p>}
      {needsAccount(error) && <Link to={authHref(pathname)} className="ta-btn">Sign in</Link>}
    </div>
  );
}

/* ── /quiz/arena/e/:eventId ──────────────────────────────────────────────── */

export function ArenaEventRoute() {
  const { eventId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const live = useLiveArenaEvent(eventId);
  const openRoom = useCallback((nodeId: string) => navigate(arenaMatchHref(eventId, nodeId)), [navigate, eventId]);
  const controls = useHttpEventControls(live, { manage: false, openRoom });
  const duelHref = useCallback((id: string, nodeId: string) => arenaMatchHref(id, nodeId), []);
  if (!live.event) {
    return live.error ? <ArenaNotice title="Tournament event" error={live.error} /> : <ArenaNotice title="Tournament event" text="Loading the bracket…" busy backHref={null} />;
  }
  return (
    <EventPage
      event={live.event}
      controls={controls}
      viewerId={live.event.viewer_profile_id}
      duelHref={duelHref}
      backHref={ARENA_PLAYER_BASE}
      returnedFromNode={params.get("from")}
    />
  );
}

/* ── /quiz/arena/e/:eventId/match/:nodeId ────────────────────────────────── */

export function ArenaMatchRoute() {
  const { eventId = "", nodeId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const identity = useProfileIdentity(user?.id ?? null);
  const live = useLiveArenaEvent(eventId);
  const back = useCallback(() => navigate(arenaEventHref(eventId, nodeId)), [navigate, eventId, nodeId]);
  if (!user) return <ArenaNotice title="Tournament match" text="Sign in to play your match." error={null} />;
  return (
    <ArenaMatchRoom
      live={live}
      nodeId={nodeId}
      viewerUserId={user.id}
      viewerDisplayName={identity.displayName}
      backHref={arenaEventHref(eventId, nodeId)}
      onBackToBracket={back}
    />
  );
}
