/**
 * UX-7 — the only place the campaign UI touches the E3B campaign authority.
 *
 *  - discovery never auto-picks among several active runs: `choices` holds them;
 *  - one request in flight at a time: duplicate clicks are dropped, not queued;
 *  - a lost response keeps the exact request (same start_key / action_id) for Retry,
 *    so the server recognises the replay (`duplicate: true`) and never applies it twice;
 *  - an older snapshot (lower `seq`) never replaces a newer one;
 *  - "another device moved on" (STALE_SEQ / WRONG_SERIES), a settle before the series
 *    finished and CAMPAIGN_OVER adopt the server's fresh snapshot with a notice;
 *  - nothing here decides progression: settle sends the server's own `next.payload`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CampaignPolicy, CampaignRow, CampaignSnapshot } from "./campaignContracts";
import { CampaignError, abandonRequest, settleRequest, type LiveCampaignClient } from "./campaignTransport";
import { newRequestId } from "./transport";

export interface CampaignUiError { code: CampaignError["code"]; message: string; retryable: boolean }

export function useDynastyCampaign(client: LiveCampaignClient) {
  const [campaign, setCampaign] = useState<CampaignSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CampaignUiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choices, setChoices] = useState<CampaignRow[] | null>(null);
  /** finished runs, for the legacy shelf on the start screen */
  const [finished, setFinished] = useState<CampaignRow[]>([]);
  const ref = useRef<CampaignSnapshot | null>(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const retryRef = useRef<(() => Promise<unknown>) | null>(null);
  /** the start_key of a start whose response was lost: reused verbatim until it lands */
  const pendingKey = useRef<string | null>(null);

  const accept = useCallback((c: CampaignSnapshot | null) => {
    const cur = ref.current;
    if (c && cur && c.campaign_id === cur.campaign_id && c.seq < cur.seq) return false;
    ref.current = c;
    if (alive.current) setCampaign(c);
    return true;
  }, []);

  const fail = useCallback((e: unknown, retry: (() => Promise<unknown>) | null) => {
    const ce = e instanceof CampaignError ? e : new CampaignError("SERVER", String(e));
    if (ce.fresh) accept(ce.fresh);
    retryRef.current = ce.retryable ? retry : null;
    if (!alive.current) return;
    if (ce.code === "STALE") setNotice("The run had moved on (another tab or device); showing the server's latest state.");
    else if (ce.code === "SERIES_NOT_FINISHED") setNotice("The series is not finished yet; showing where it stands.");
    else if (ce.code === "OVER") setNotice("This run has already ended; showing its ending.");
    else setError({ code: ce.code, message: ce.code === "NETWORK" ? "Lost contact with the server. Retry resends the same request; it cannot apply twice." : ce.message, retryable: ce.retryable });
  }, [accept]);

  /** Run one request; drop it if another is in flight. */
  const run = useCallback(async <T,>(label: string, make: () => Promise<T>, onOk: (v: T) => void): Promise<T | null> => {
    if (busyRef.current) return null;
    const attempt = async (): Promise<T | null> => {
      busyRef.current = true; setBusy(label); setError(null);
      try {
        const v = await make();
        retryRef.current = null;
        onOk(v);
        return v;
      } catch (e) { fail(e, attempt); return null; }
      finally { busyRef.current = false; if (alive.current) setBusy(null); }
    };
    return attempt();
  }, [fail]);

  /** Discovery. `list`: show the active runs to choose from even when there is only one ("Other runs"). */
  const load = useCallback(async (list = false) => {
    setLoading(true); setError(null);
    busyRef.current = false;
    try {
      const [active, all] = await Promise.all([client.list(false), client.list(true).catch(() => null)]);
      if (alive.current) setFinished((all?.campaigns ?? []).filter((r) => r.status !== "active"));
      if (active.resume.reason === "single" && !list) { accept(await client.get(active.resume.campaign_id!)); setChoices(null); }
      else if (active.resume.reason !== "none") { accept(null); setChoices(active.campaigns); }
      else { accept(null); setChoices(null); }
    } catch (e) { fail(e, () => load(list)); }
    finally { if (alive.current) setLoading(false); }
  }, [client, accept, fail]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; };
  }, [load]);

  const api = {
    /** Re-read the open run (after a series completes, or to recover). A read: never a mutation. */
    refresh: () => { const c = ref.current; return c ? run("refresh", () => client.get(c.campaign_id), (v) => accept(v)) : load(); },
    /** Open one of several active runs. */
    pick: (campaignId: string) => run("pick", () => client.get(campaignId), (v) => { accept(v); setChoices(null); }),
    /** Start a run. `refuse` (automatic) returns the listing when another run is active; `create` (explicit "New run") always starts. */
    start: (policy: CampaignPolicy, when: "refuse" | "create") => {
      const key = pendingKey.current ?? (pendingKey.current = newRequestId("ux7-run"));
      return run("start", () => client.start(key, policy, when).catch((e) => {
        if (e instanceof CampaignError && e.code === "ACTIVE_EXISTS") { pendingKey.current = null; if (e.listing && alive.current) setChoices(e.listing.campaigns); }
        throw e;
      }), (v) => { pendingKey.current = null; accept(v); setChoices(null); });
    },
    /** Record the completed series. Built from `next` only; a Retry resends the identical body. */
    settle: async () => {
      let c = ref.current;
      if (!c) return null;
      if (c.phase !== "series_result") {
        // The series screen says "done"; the campaign may not have seen it yet: read, never assume.
        const fresh = await run("refresh", () => client.get(c!.campaign_id), (v) => accept(v));
        if (!fresh) return null;
        c = fresh;
      }
      const req = settleRequest(c, newRequestId("ux7-settle"));
      if (!req) return c;
      return run("settle", () => client.act(c!.campaign_id, req), (v) => accept(v));
    },
    /** End the run for good (the UI asks first). */
    abandon: () => {
      const c = ref.current;
      const req = c ? abandonRequest(c, newRequestId("ux7-abandon")) : null;
      return c && req ? run("abandon", () => client.act(c.campaign_id, req), (v) => accept(v)) : Promise.resolve(null);
    },
    /** Leave the open run on this screen (it stays on the server) and list the active runs (or offer a new one). */
    close: () => { ref.current = null; setCampaign(null); void load(true); },
    dismissChoices: () => setChoices(null),
    clearNotice: () => setNotice(null),
    retry: async () => { const r = retryRef.current; if (r) await r(); },
    reload: () => load(),
  };

  return { campaign, loading, busy, error, notice, choices, finished, ...api };
}
export type DynastyCampaign = ReturnType<typeof useDynastyCampaign>;
