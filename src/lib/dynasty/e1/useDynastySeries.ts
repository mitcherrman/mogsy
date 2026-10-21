/**
 * UX-3 — the only place the BO5 UI touches its authority.
 *
 *  - one request in flight at a time: duplicate clicks are dropped, not queued;
 *  - stale responses are rejected: an envelope older (lower `rev`) than the one
 *    already shown never replaces it;
 *  - a lost response (NETWORK) keeps the exact request (same rev, same
 *    requestId) for Retry, so the server can recognise the replay and never
 *    applies the action twice;
 *  - STALE_REVISION adopts the server's fresh envelope instead of guessing;
 *  - live discovery never picks among several unfinished series: `choices`
 *    holds them (from resume, or from a refused create) until the owner picks
 *    one or explicitly starts a new series;
 *  - nothing here derives a game result: the UI renders `env` as served.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { TransportError, type BetweenGameDecisionId, type E1Role, type SeriesChoice, type SeriesEnvelope, type TransportErrorCode } from "./contracts";
import type { E2Lineup } from "./e2contracts";
import type { E3aActivity, E3aTacticChoice } from "./e3acontracts";
import { isChoices, newRequestId, type DynastySeriesTransport } from "./transport";

export interface SeriesError { code: TransportErrorCode; message: string; retryable: boolean; action: string }

/** Beats the "Continue" control stops on; the rest are chained through one transition at a time. */
export const PAUSE_BEATS = new Set(["stage_open", "event_revealed", "stage_tally", "objective_prompt", "objective_result", "settlement"]);
/** Beats "Skip ahead" stops on. */
export const SKIP_BEATS = new Set(["stage_tally", "objective_prompt", "objective_result", "settlement"]);

export function useDynastySeries(transport: DynastySeriesTransport) {
  const [env, setEnv] = useState<SeriesEnvelope | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<SeriesError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choices, setChoices] = useState<SeriesChoice[] | null>(null);
  const envRef = useRef<SeriesEnvelope | null>(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const retryRef = useRef<(() => Promise<void>) | null>(null);

  const accept = useCallback((e: SeriesEnvelope | null) => {
    const cur = envRef.current;
    if (e && cur && e.series.series_id === cur.series.series_id && e.series.rev < cur.series.rev) return false; // stale response
    envRef.current = e;
    if (alive.current) setEnv(e);
    return true;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await transport.resume();
      if (isChoices(r)) { accept(null); if (alive.current) setChoices(r.choices); }
      else { accept(r); if (alive.current) setChoices(null); }
    }
    catch (e) {
      const t = e instanceof TransportError ? e : new TransportError("SERVER", String(e));
      retryRef.current = load;
      if (alive.current) setError({ code: t.code, message: t.message, retryable: true, action: "resume" });
    } finally { if (alive.current) setLoading(false); }
  }, [transport, accept]);

  useEffect(() => {
    alive.current = true; // StrictMode: set in the effect body, not only at init
    void load();
    return () => { alive.current = false; };
  }, [load]);

  /** Run one mutation. `make` receives the rev/requestId to quote; a Retry resends the same pair. */
  const run = useCallback(async (action: string, make: (rev: number, requestId: string) => Promise<SeriesEnvelope>): Promise<SeriesEnvelope | null> => {
    if (busyRef.current) return null;
    const rev = envRef.current?.series.rev ?? 0;
    const requestId = newRequestId(action);
    const attempt = async (): Promise<SeriesEnvelope | null> => {
      busyRef.current = true; setBusy(action); setError(null);
      try {
        const out = await make(rev, requestId);
        retryRef.current = null;
        accept(out);
        if (alive.current) setChoices(null);
        return out;
      } catch (e) {
        const t = e instanceof TransportError ? e : new TransportError("SERVER", String(e));
        if (t.fresh) accept(t.fresh);
        const retryable = t.code === "NETWORK" || t.code === "SERVER";
        retryRef.current = retryable ? async () => { await attempt(); } : null;
        if (alive.current) {
          if (t.code === "UNFINISHED_SERIES" && t.choices) setChoices(t.choices);
          else if (t.code === "STALE_REVISION") setNotice("The server had moved on; showing its latest state.");
          else setError({ code: t.code, message: t.message, retryable, action });
        }
        return null;
      } finally { busyRef.current = false; if (alive.current) setBusy(null); }
    };
    return attempt();
  }, [accept]);

  const retry = useCallback(async () => { const r = retryRef.current; if (r) await r(); }, []);

  const api = {
    /** Automatic entry: refused (→ `choices`) when an unfinished series exists. */
    create: () => run("create", (_rev, requestId) => transport.create({ requestId }, "refuse")),
    /** Explicit "New series": always starts one (E2 has no abandon route). */
    createNew: () => run("create", (_rev, requestId) => transport.create({ requestId }, "create")),
    /** Resume the series the owner picked. A read: no rev/requestId to quote. */
    pick: (seriesId: string) => run("resume", () => transport.resumeSeries(seriesId)),
    dismissChoices: () => setChoices(null),
    choosePlan: (lineupId: string) => run("choosePlan", (rev, requestId) => transport.choosePlan({ rev, requestId }, lineupId)),
    lockLineup: (lineupId: string) => run("lockLineup", (rev, requestId) => transport.lockLineup({ rev, requestId }, lineupId)),
    advanceOnce: () => { const s = envRef.current?.game; return s ? run("advance", (rev, requestId) => transport.advance({ rev, requestId }, s.seq)) : Promise.resolve(null); },
    openObjective: (enc: string) => run("openObjective", (rev, requestId) => transport.openObjective({ rev, requestId }, enc)),
    answer: (enc: string, index: number, option: number) => run("answer", (rev, requestId) => transport.answerQuestion({ rev, requestId }, enc, index, option)),
    settleObjective: (enc: string) => run("settleObjective", (rev, requestId) => transport.settleObjective({ rev, requestId }, enc)),
    decide: (d: BetweenGameDecisionId, lineupId: string) => run("decide", (rev, requestId) => transport.decide({ rev, requestId }, d, lineupId)),
    /** UX-6 (E3A): one request each; a Retry resends the identical body, which the server answers `duplicate: true`. */
    commitPreparation: (activities: E3aActivity[]) => run("commitPreparation", (rev, requestId) => transport.commitPreparation({ rev, requestId }, activities)),
    lockSquad: (champions: E2Lineup, players: Record<E1Role, string>) => run("lockSquad", (rev, requestId) => transport.lockSquad({ rev, requestId }, champions, players)),
    chooseTactic: (game: number, choice: E3aTacticChoice) => run("chooseTactic", (rev, requestId) => transport.chooseTactic({ rev, requestId }, game, choice)),
    abandon: async () => { await transport.abandon(); envRef.current = null; setEnv(null); setError(null); setChoices(null); },
  };

  /** Advance one transition at a time until a beat in `stops` (or a pause/needs). Each step is its own request. */
  const advanceTo = useCallback(async (stops: Set<string>) => {
    for (let i = 0; i < 64; i++) {
      const s = envRef.current?.game;
      if (!s || !s.next.can_advance) return;
      const out = await run("advance", (rev, requestId) => transport.advance({ rev, requestId }, s.seq));
      if (!out?.game) return;
      const last = out.game.beats[out.game.beats.length - 1]?.beat;
      if (!out.game.next.can_advance || (last && stops.has(last))) return;
    }
  }, [run, transport]);

  return { kind: transport.kind, env, loading, busy, error, notice, choices, clearNotice: () => setNotice(null), retry, reload: load, advanceTo, ...api };
}
export type DynastySeries = ReturnType<typeof useDynastySeries>;
