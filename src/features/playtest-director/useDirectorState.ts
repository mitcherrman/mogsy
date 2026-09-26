/**
 * PLAY1 — keep a participant (or the host) converged on the authoritative
 * director row.
 *
 *   · explicit fetch on mount (and so on every refresh);
 *   · Realtime postgres_changes as an accelerator;
 *   · re-fetch whenever the channel reports SUBSCRIBED (initial join and every
 *     reconnect), when the tab becomes visible and when the browser comes back
 *     online;
 *   · a ~15 s fallback poll, so a client that never receives an event still
 *     converges;
 *   · clean unsubscribe.
 *
 * Every delivery goes through `applyDirectorState`, so duplicates and
 * out-of-order events can never move the view backwards or twice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { applyDirectorState, type DirectorState } from "./directorState";
import { supabaseDirectorStateSource, type ChannelStatus, type DirectorStateSource } from "./api";

export const DIRECTOR_POLL_MS = 15_000;

export interface DirectorStateHandle {
  state: DirectorState | null;
  error: string | null;
  channel: ChannelStatus | "CONNECTING";
  refresh: () => Promise<void>;
  /** Fold in a row the caller already holds (e.g. the host's own advance). */
  accept: (state: DirectorState) => void;
}

export function useDirectorState(
  cohortId: string | null,
  source: DirectorStateSource = supabaseDirectorStateSource,
  pollMs: number = DIRECTOR_POLL_MS,
): DirectorStateHandle {
  const [state, setState] = useState<DirectorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelStatus | "CONNECTING">("CONNECTING");
  const live = useRef(true);

  const accept = useCallback((incoming: DirectorState | null) => {
    if (!live.current) return;
    setState((current) => applyDirectorState(current, incoming));
  }, []);

  const refresh = useCallback(async () => {
    if (!cohortId) return;
    try {
      const row = await source.fetch(cohortId);
      accept(row);
      if (live.current) setError(null);
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [cohortId, source, accept]);

  useEffect(() => {
    live.current = true;
    setState(null);
    if (!cohortId) return;
    void refresh();
    const unsubscribe = source.subscribe(cohortId, accept, (status) => {
      if (!live.current) return;
      setChannel(status);
      if (status === "SUBSCRIBED") void refresh();
    });
    const poll = setInterval(() => { void refresh(); }, pollMs);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onOnline = () => { void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      live.current = false;
      unsubscribe();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [cohortId, source, pollMs, refresh, accept]);

  return { state, error, channel, refresh, accept };
}
