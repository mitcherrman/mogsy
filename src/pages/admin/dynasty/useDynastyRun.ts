/**
 * ROG1-D1 — the Dynasty run controller: one snapshot from the server, one
 * action in flight at a time.
 *
 * The browser holds no authoritative state. It remembers only the run's
 * `start_key` (an idempotency key, in localStorage) so a reload can call the
 * idempotent `POST /runs` again and resume the same run; the server replays
 * its event log and answers with the current snapshot.
 *
 * Failure handling:
 *  - network: the SAME action (same `action_id`, same `expected_seq`) is
 *    retried automatically, then offered as "Retry". The backend applies an
 *    `action_id` at most once, so a retry after a lost response is safe.
 *  - STALE_SEQ / ACTION_ID_REUSED: another tab moved the run on. Re-read the
 *    run and ask the owner to choose again.
 *  - 422 engine codes: the choice was refused; nothing changed.
 *  - DYNASTY_DISABLED, 401/403, integrity, unreadable answers: stop.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChampionEntry, DynastyActionKind, DynastySnapshot } from "@/lib/dynasty/contracts";
import { DynastyApiError, newClientId, type DynastyActionRequest, type DynastyTransport } from "@/lib/dynasty/client";
import { mergeChampionCatalog } from "@/lib/dynasty/model";

export const DYNASTY_START_KEY_STORAGE = "mogzy.dynasty.v1.start_key";

export type DynastyFatal =
  | { kind: "disabled" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "integrity"; message: string }
  | { kind: "invalid"; message: string };

export interface DynastyNotice {
  tone: "error" | "warning" | "info";
  title: string;
  message: string;
  code?: string | null;
  /** The failed action can be resent unchanged. */
  retryable?: boolean;
}

export type DynastyLoad = "idle" | "loading" | "ready" | "unreachable";

const RETRY_DELAYS_MS = [400, 1200];

const REFUSALS: Record<string, string> = {
  NOT_OFFERED: "That card is not in the current offer.",
  WRONG_PHASE: "That move belongs to a different phase of the run.",
  BAD_PAYLOAD: "The server could not read that choice.",
  BAD_ROLE: "Pick a role for that relic first.",
  UNKNOWN_CHAMPION: "That champion is not in this catalog.",
  CHAMPION_TAKEN: "That champion is already locked for another role.",
  NOT_A_SUBSTITUTE: "Only a current substitute can be swapped in.",
  LINEUP_INCOMPLETE: "Every starter needs a champion before the match.",
  UNKNOWN_ACTION: "The server does not know that action.",
  ROSTER_INVALID: "That roster is not valid.",
  BAD_REQUEST: "The request was malformed.",
  FIXTURE_OFF_PATH: "This preview replays one recorded backend run; only its recorded choice applies.",
};

function readStoredKey(storageKey: string): string | null {
  try { return window.localStorage.getItem(storageKey); } catch { return null; }
}
function writeStoredKey(storageKey: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(storageKey, value);
    else window.localStorage.removeItem(storageKey);
  } catch { /* storage unavailable: the run still lives on the server */ }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface UseDynastyRunOptions {
  transport: DynastyTransport;
  storageKey?: string;
  /** Override the automatic retry backoff (tests). */
  retryDelaysMs?: number[];
}

export function useDynastyRun({ transport, storageKey = DYNASTY_START_KEY_STORAGE, retryDelaysMs = RETRY_DELAYS_MS }: UseDynastyRunOptions) {
  const [snapshot, setSnapshot] = useState<DynastySnapshot | null>(null);
  const [load, setLoad] = useState<DynastyLoad>("idle");
  const [busy, setBusy] = useState<DynastyActionKind | "start" | null>(null);
  const [notice, setNotice] = useState<DynastyNotice | null>(null);
  const [fatal, setFatal] = useState<DynastyFatal | null>(null);
  const [champions, setChampions] = useState<ChampionEntry[]>([]);
  /** Set once a `play_match` succeeds in THIS session, so only a fresh result animates. */
  const [freshMatch, setFreshMatch] = useState(false);
  const pending = useRef<{ runId: string; action: DynastyActionRequest } | null>(null);
  const alive = useRef(true);
  const inflight = useRef(false);
  const [hasStoredRun, setHasStoredRun] = useState(() => Boolean(readStoredKey(storageKey)));

  // Set on every mount, not only at construction: StrictMode (and HMR) run
  // the cleanup and then mount the same instance again.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const accept = useCallback((snap: DynastySnapshot) => {
    if (!alive.current) return;
    setSnapshot(snap);
    setChampions((known) => mergeChampionCatalog(known, snap));
    setLoad("ready");
  }, []);

  /** Map a failure onto fatal/notice. Returns true when it was handled as fatal. */
  const classify = useCallback((e: unknown, context: "load" | "act"): void => {
    if (!alive.current) return;
    if (!(e instanceof DynastyApiError)) {
      setFatal({ kind: "invalid", message: e instanceof Error ? e.message : "Unexpected error." });
      return;
    }
    if (e.kind === "aborted") return;
    if (e.kind === "invalid_response") { setFatal({ kind: "invalid", message: e.message }); return; }
    if (e.kind === "network") {
      if (context === "load") setLoad("unreachable");
      setNotice({
        tone: "error", title: "Backend unreachable",
        message: context === "act"
          ? "Your choice may or may not have reached the server. Retrying sends the same action again; the server applies it at most once."
          : "The Dynasty backend did not answer. Is it running locally?",
        retryable: context === "act",
      });
      return;
    }
    if (e.code === "DYNASTY_DISABLED") { setFatal({ kind: "disabled" }); return; }
    if (e.status === 401 || e.status === 403) { setFatal({ kind: "forbidden" }); return; }
    if (e.code === "DYNASTY_RUN_NOT_FOUND") { writeStoredKey(storageKey, null); setHasStoredRun(false); setFatal({ kind: "not_found" }); return; }
    // The owner-auth RPC can be temporarily unreachable (503). This is not
    // a corrupt run: preserve the saved start key and the exact pending action.
    if (e.status === 503) {
      if (context === "load") setLoad("idle");
      setNotice({
        tone: "warning", title: "Owner verification temporarily unavailable",
        message: context === "act"
          ? "The owner check could not complete. Retry sends the same choice again without risking a duplicate action."
          : "The owner check could not complete. Your saved run is preserved; try Resume again.",
        retryable: context === "act",
      });
      return;
    }
    if (e.code === "DYNASTY_RUN_INTEGRITY" || (e.status ?? 0) >= 500) {
      setFatal({ kind: "integrity", message: e.message }); return;
    }
    setNotice({
      tone: "warning", title: "Choice refused", code: e.code,
      message: (e.code && REFUSALS[e.code]) || e.message,
    });
  }, [storageKey]);

  const startWithKey = useCallback(async (startKey: string) => {
    setLoad("loading");
    setBusy("start");
    setNotice(null);
    setFatal(null);
    try {
      const snap = await transport.start(startKey);
      writeStoredKey(storageKey, startKey);
      setHasStoredRun(true);
      setFreshMatch(false);
      accept(snap);
    } catch (e) {
      classify(e, "load");
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [transport, storageKey, accept, classify]);

  /** Resume the stored run, or begin a new one. */
  const begin = useCallback(() => {
    const key = readStoredKey(storageKey) ?? newClientId("wd-start");
    return startWithKey(key);
  }, [storageKey, startWithKey]);

  const beginNew = useCallback(() => {
    writeStoredKey(storageKey, null);
    setSnapshot(null);
    setChampions([]);
    return startWithKey(newClientId("wd-start"));
  }, [storageKey, startWithKey]);

  const refresh = useCallback(async (runId: string) => {
    try { accept(await transport.read(runId)); } catch (e) { classify(e, "load"); }
  }, [transport, accept, classify]);

  const send = useCallback(async (runId: string, action: DynastyActionRequest) => {
    if (inflight.current) return;
    inflight.current = true;
    pending.current = { runId, action };
    setBusy(action.kind);
    setNotice(null);
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const snap = await transport.act(runId, action);
          pending.current = null;
          if (action.kind === "play_match" && snap.phase === "completed") setFreshMatch(true);
          accept(snap);
          if (snap.duplicate) {
            setNotice({ tone: "info", title: "Already applied", message: "The server had already applied this choice; showing the current run." });
          }
          return;
        } catch (e) {
          const network = e instanceof DynastyApiError && e.kind === "network";
          if (network && attempt < retryDelaysMs.length && alive.current) {
            await sleep(retryDelaysMs[attempt]);
            continue;
          }
          if (e instanceof DynastyApiError && (e.code === "STALE_SEQ" || e.code === "ACTION_ID_REUSED")) {
            pending.current = null;
            await refresh(runId);
            if (alive.current) {
              setNotice({
                tone: "warning", title: "Run changed elsewhere", code: e.code,
                message: "This run moved on (another tab or a retried request). It has been reloaded; check the board and choose again.",
              });
            }
            return;
          }
          // A 503 owner-verification outage is transient, like a network error.
          // Keep the identical action_id available for a deliberate retry.
          if (!network && !(e instanceof DynastyApiError && e.status === 503)) pending.current = null;
          classify(e, "act");
          return;
        }
      }
    } finally {
      inflight.current = false;
      if (alive.current) setBusy(null);
    }
  }, [transport, retryDelaysMs, accept, refresh, classify]);

  const act = useCallback((kind: DynastyActionKind, payload: Record<string, unknown> = {}) => {
    if (!snapshot || inflight.current) return Promise.resolve();
    const action: DynastyActionRequest = {
      expected_seq: snapshot.seq, action_id: newClientId(`wd-${kind}`), kind, payload,
    };
    return send(snapshot.run_id, action);
  }, [snapshot, send]);

  const retry = useCallback(() => {
    const p = pending.current;
    return p ? send(p.runId, p.action) : Promise.resolve();
  }, [send]);

  // Resume automatically when this browser already has a run.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (readStoredKey(storageKey)) void begin();
  }, [begin, storageKey]);

  return useMemo(() => ({
    snapshot, load, busy, notice, fatal, champions, freshMatch, hasStoredRun,
    begin, beginNew, act, retry, dismissNotice: () => setNotice(null),
    canRetry: Boolean(notice?.retryable && pending.current),
  }), [snapshot, load, busy, notice, fatal, champions, freshMatch, hasStoredRun, begin, beginNew, act, retry]);
}

export type DynastyRunController = ReturnType<typeof useDynastyRun>;
