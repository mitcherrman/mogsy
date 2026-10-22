import { useCallback, useEffect, useRef, useState } from "react";

import { ensureOwnerAuthorized } from "@/lib/admin-auth/ownerSession";

import type { ArenaEvent } from "../contracts";
import { adminGetArenaEvent, getArenaEvent, isArenaApiError, isTerminalArenaError, type ArenaEventRead } from "./arenaApi";

/**
 * How often to ask for a new revision (audit §5 cadence): a viewer waiting on
 * their opponent's ready press polls fast, a viewer with a live or ready node
 * (or an organizer watching live nodes) every 5 s, everyone else every 15 s.
 * The tab being hidden pauses polling altogether.
 */
export function arenaPollDelayMs(ev: ArenaEvent | null, opts: { manage?: boolean } = {}): number {
  if (!ev) return 5_000;
  if (ev.status === "complete" || ev.status === "cancelled") return 30_000;
  const me = ev.viewer_profile_id;
  const nodes = ev.bracket?.nodes ?? [];
  if (me) {
    const mine = nodes.filter((n) => n.slots.some((s) => s.profile_id === me));
    if (mine.some((n) => n.status === "ready" && (n.ready_profile_ids ?? []).includes(me))) return 2_000;
    if (mine.some((n) => n.status === "live" || n.status === "ready")) return 5_000;
  }
  if (opts.manage && nodes.some((n) => n.status === "live" || n.status === "ready")) return 5_000;
  if (ev.status === "open") return 8_000;
  return 15_000;
}

/** After an owner refusal on the admin read: re-attest, then try again. */
const OWNER_RETRY_MS = 10_000;

export interface LiveArenaEvent {
  event: ArenaEvent | null;
  /** The last read failure (the last good projection stays on screen). */
  error: unknown;
  loading: boolean;
  /** Read now (after a mutation, or on a manual refresh). */
  refresh: () => void;
  /** Put a projection a mutation answered with on screen at once. */
  apply: (ev: ArenaEvent) => void;
}

/**
 * The live projection of one REAL event: `since_revision` polling over the
 * participant read (`/api/arena/events/{id}`) or, with `admin`, the owner's
 * organizer read (`/api/arena/admin/events/{id}`). Revisions only move
 * forward, so a slow poll can never put an older bracket back on screen, and
 * an answer for a previous event id (the route changed) is dropped.
 *
 * Polling stops for good on a terminal answer (the Arena is off, the event is
 * gone, no account) and when the hook unmounts; `refresh` never restarts it
 * after either. On the admin read, an organizer refusal can mean the owner's
 * device attestation lapsed: the hook re-attests and keeps polling slowly
 * instead of freezing the console, and the error stays visible meanwhile.
 */
export function useLiveArenaEvent(eventId: string | null, opts: { admin?: boolean } = {}): LiveArenaEvent {
  const admin = opts.admin === true;
  const [event, setEvent] = useState<ArenaEvent | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const eventRef = useRef<ArenaEvent | null>(null);
  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const terminal = useRef(false);
  const unmounted = useRef(false);
  const generation = useRef(0);
  const needsFullRead = useRef(false);
  const tickRef = useRef<() => void>(() => undefined);

  const accept = useCallback((ev: ArenaEvent) => {
    const cur = eventRef.current;
    if (cur && cur.event_id === ev.event_id && ev.revision < cur.revision) return;
    eventRef.current = ev;
    setEvent(ev);
  }, []);

  const schedule = useCallback((ms: number) => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => tickRef.current(), ms);
  }, []);

  tickRef.current = () => {
    if (!eventId || terminal.current || unmounted.current) return;
    if (typeof document !== "undefined" && document.hidden) {
      schedule(2_000);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    const gen = generation.current;
    const full = needsFullRead.current;
    const since = !full && eventRef.current?.event_id === eventId ? eventRef.current.revision : null;
    const read: Promise<ArenaEventRead> = admin ? adminGetArenaEvent(eventId, since) : getArenaEvent(eventId, since);
    let nextDelay: number | null = null;
    read
      .then((r) => {
        if (gen !== generation.current) return;
        if (r.unchanged === false && r.event.event_id === eventId) accept(r.event);
        if (full) needsFullRead.current = false;
        setError(null);
      })
      .catch(async (e) => {
        if (gen !== generation.current) return;
        setError(e);
        if (admin && isArenaApiError(e) && e.code === "ARENA_ORGANIZER_REQUIRED") {
          // Possibly a lapsed owner attestation, not a lost owner: restore it
          // (no prompt here) and keep reading slowly.
          await ensureOwnerAuthorized().catch(() => false);
          nextDelay = OWNER_RETRY_MS;
          return;
        }
        if (isTerminalArenaError(e)) terminal.current = true;
      })
      .finally(() => {
        if (gen !== generation.current) return;
        inFlight.current = false;
        setLoading(false);
        if (!terminal.current && !unmounted.current) {
          schedule(nextDelay ?? arenaPollDelayMs(eventRef.current, { manage: admin }));
        }
      });
  };

  useEffect(() => {
    generation.current += 1;
    unmounted.current = false;
    terminal.current = false;
    inFlight.current = false;
    needsFullRead.current = false;
    eventRef.current = null;
    setEvent(null);
    setError(null);
    setLoading(true);
    tickRef.current();
    const onVisible = () => { if (!document.hidden) tickRef.current(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unmounted.current = true;
      generation.current += 1;
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [eventId, admin]);

  // Never revives a hook that stopped for good or unmounted.
  const refresh = useCallback(() => {
    tickRef.current();
  }, []);

  // A mutation answers with the organizer view but without the admin-only
  // audit trail: keep the last trail on screen and re-read the whole admin
  // projection once (a since_revision read would say "unchanged").
  const apply = useCallback((ev: ArenaEvent) => {
    if (unmounted.current) return;
    if (admin && ev.audit === undefined) {
      const cur = eventRef.current;
      accept(cur?.audit ? { ...ev, audit: cur.audit } : ev);
      needsFullRead.current = true;
      tickRef.current();
      return;
    }
    accept(ev);
  }, [admin, accept]);

  return { event, error, loading, refresh, apply };
}
