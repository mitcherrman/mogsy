/**
 * DCMOD-E — THE DAILY RUN CONTROLLER.
 *
 * Holds ONE authority — the parent run snapshot the server last sent — and a
 * few PRESENTATION latches that are explicitly not authority (see
 * `lib/daily-challenge/run/flow.ts`). It never decides which stage is current,
 * whether a stage is over, or what a stage scored: it asks, and shows.
 *
 * THE VERBS, and who triggers each:
 *   * start   — the player, once, from the entry screen;
 *   * launch  — this controller, when a stage's tag goes up and the stage has
 *               no child match yet. Idempotent server-side (B's `launch_id`),
 *               bounded here, so a retry never creates a second child;
 *   * sync    — this controller, when the child match is handed back by the
 *               arena (`MatchHost.onMatchSettled`). Bounded retries, because
 *               the parent may read the child a beat after it finished;
 *   * read    — on mount (recovery), and during a Time Trial / Survival stage
 *               whenever the arena's presented phase changes, so the bank and
 *               the strikes shown are the server's current numbers.
 *
 * RECOVERY IS A READ. A refresh anywhere in the day lands on the server's
 * current stage: an in-progress stage remounts its child match as a RECOVERY
 * (no tag replay, no duel intro), a pending one plays its tag and launches,
 * a finished day shows the completion. No beat this mount did not watch
 * begin is ever replayed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RankedPresentationPhase } from "@/lib/ranked-core/flow/rankedFlow";
import type { DailyRun } from "@/lib/daily-challenge/run/contracts";
import { currentStage } from "@/lib/daily-challenge/run/contracts";
import {
  DailyRunApiError, isDailyRunAborted, type DailyRunTransport,
} from "@/lib/daily-challenge/run/client";
import {
  DAILY_INTRO_MS, STAGE_INTRO_MIN_MS, STAGE_RESULT_MS,
  projectDailyFlow, stageCompletedBetween, type DailyFlowView,
} from "@/lib/daily-challenge/run/flow";
import { runSkewMs } from "@/lib/daily-challenge/run/timeBank";

export type DailyRunLoad = "loading" | "ready" | "run" | "unavailable";

/** Bounded retries — a server that keeps refusing is not turned into a poll. */
const MAX_LAUNCH_ATTEMPTS = 3;
const MAX_SYNC_ATTEMPTS = 6;
const SYNC_RETRY_MS = 1000;
/** Floor between live ruleset reads during a stage. */
const LIVE_READ_MIN_GAP_MS = 400;

export interface DailyRunState {
  load: DailyRunLoad;
  run: DailyRun | null;
  flow: DailyFlowView | null;
  busy: boolean;
  /** A human sentence, never a backend code. */
  error: string | null;
  skewMs: number;
  /** The arena's presented phase for the active child, as last reported. */
  childPhase: RankedPresentationPhase | null;
  /** Was the active child created by THIS mount (a fresh entry) or recovered? */
  childEntry: "fresh" | "recovered";
  start: () => void;
  /** Re-ask after a failure: re-launch or re-sync, whichever is owed. */
  retry: () => void;
  onChildSettled: (matchId: string) => void;
  onChildPhase: (phase: RankedPresentationPhase) => void;
}

function messageFor(e: unknown): string {
  if (e instanceof DailyRunApiError) {
    switch (e.code) {
      case "DAILY_RUN_NOT_WIRED":
        return "Today's challenge isn't ready yet. Try again in a moment.";
      case "DAILY_RUN_CHILD_UNAVAILABLE":
        return "This stage couldn't open. Try again.";
      case "SESSION_REQUIRED":
        return "We couldn't start a session. Check your connection and try again.";
      case "ACCOUNT_REQUIRED":
        // Every stage is a canonical Ranked match, which needs an account.
        return "Sign in to play today's Daily Challenge.";
      default:
        break;
    }
    if (e.kind === "network") return "Lost the connection. Your progress is saved.";
    if (e.kind === "invalid_response") return "This page is out of date. Refresh to update.";
  }
  return "Something went wrong. Your progress is saved.";
}

export function useDailyRun(transport: DailyRunTransport): DailyRunState {
  const [load, setLoad] = useState<DailyRunLoad>("loading");
  const [run, setRun] = useState<DailyRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [dailyIntroUp, setDailyIntroUp] = useState(false);
  const [stageIntroFor, setStageIntroFor] = useState<string | null>(null);
  const [settledChild, setSettledChild] = useState<string | null>(null);
  const [resultFor, setResultFor] = useState<string | null>(null);
  const [childPhase, setChildPhase] = useState<RankedPresentationPhase | null>(null);

  const mounted = useRef(true);
  const runRef = useRef<DailyRun | null>(null);
  const timers = useRef<number[]>([]);
  /** Stages whose tag has been decided on (played, or skipped as a recovery). */
  const introduced = useRef<Set<string>>(new Set());
  /** Child matches THIS mount created — the only fresh entries there are. */
  const freshChildren = useRef<Set<string>>(new Set());
  const launchAttempts = useRef<Map<string, number>>(new Map());
  const launching = useRef(false);
  const syncing = useRef(false);
  const lastLiveRead = useRef(0);

  useEffect(() => () => {
    mounted.current = false;
    timers.current.forEach((id) => window.clearTimeout(id));
  }, []);

  /** A timer that survives re-renders and dies with the mount. */
  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => { if (mounted.current) fn(); }, ms);
    timers.current.push(id);
  }, []);

  /** Adopt a snapshot as the truth, and notice a stage this mount watched finish. */
  const adopt = useCallback((next: DailyRun) => {
    if (!mounted.current) return;
    const prev = runRef.current;
    runRef.current = next;
    setRun(next);
    setLoad("run");
    setSkewMs(runSkewMs(next.serverNow, Date.now()));
    const done = stageCompletedBetween(prev, next);
    if (done) {
      setSettledChild(null);
      setChildPhase(null);
      // Review closes the day: it goes straight to the one final completion.
      if (done.kind !== "review") {
        setResultFor(done.id);
        after(STAGE_RESULT_MS, () => setResultFor((cur) => (cur === done.id ? null : cur)));
      }
    }
  }, [after]);

  const ask = useCallback(async (work: () => Promise<DailyRun>, quiet = false): Promise<DailyRun | null> => {
    if (!quiet) { setBusy(true); setError(null); }
    try {
      const next = await work();
      adopt(next);
      return next;
    } catch (e) {
      if (!mounted.current || isDailyRunAborted(e)) return null;
      if (!quiet) setError(messageFor(e));
      return null;
    } finally {
      if (!quiet && mounted.current) setBusy(false);
    }
  }, [adopt]);

  // ── entry: one read ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = await transport.readToday();
        if (cancelled || !mounted.current) return;
        if (!today) { setLoad("ready"); return; }
        // A run nobody has played a stage of yet is still an arrival.
        const untouched = today.status === "active" && today.currentStageIndex === 0
          && today.stages[0].status === "pending";
        if (untouched) {
          setDailyIntroUp(true);
          after(DAILY_INTRO_MS, () => setDailyIntroUp(false));
        }
        adopt(today);
      } catch (e) {
        if (cancelled || !mounted.current || isDailyRunAborted(e)) return;
        const code = e instanceof DailyRunApiError ? e.code : null;
        setLoad(code === "DAILY_RUN_NOT_WIRED" ? "unavailable" : "ready");
        setError(messageFor(e));
      }
    })();
    return () => { cancelled = true; };
  }, [transport, adopt, after]);

  const start = useCallback(() => {
    void (async () => {
      const next = await ask(() => transport.startToday());
      if (!next) return;
      setDailyIntroUp(true);
      after(DAILY_INTRO_MS, () => setDailyIntroUp(false));
    })();
  }, [ask, transport, after]);

  // ── the stage tag, and the launch it covers ───────────────────────────────
  const stage = run ? currentStage(run) : null;
  useEffect(() => {
    if (!stage || dailyIntroUp || resultFor || settledChild) return;
    if (introduced.current.has(stage.id)) return;
    introduced.current.add(stage.id);
    // A stage already in progress on arrival is a RECOVERY: no tag replay.
    if (stage.status === "in_progress" && !freshChildren.current.has(stage.childMatchId ?? "")) return;
    setStageIntroFor(stage.id);
    after(STAGE_INTRO_MIN_MS, () => setStageIntroFor((cur) => (cur === stage.id ? null : cur)));
  }, [stage, dailyIntroUp, resultFor, settledChild, after]);

  const launch = useCallback(async () => {
    const r = runRef.current;
    const s = r ? currentStage(r) : null;
    if (!r || !s || launching.current) return;
    if (s.status !== "pending" && s.status !== "launching") return;
    const attempts = launchAttempts.current.get(s.id) ?? 0;
    if (attempts >= MAX_LAUNCH_ATTEMPTS) return;
    launchAttempts.current.set(s.id, attempts + 1);
    launching.current = true;
    try {
      const next = await ask(() => transport.launchStage(r.runId, s.index));
      const child = next ? next.stages[s.index]?.childMatchId : null;
      if (child) freshChildren.current.add(child);
    } finally {
      launching.current = false;
    }
  }, [ask, transport]);

  // Launch while the tag is up — the tag is what covers the child's creation,
  // exactly as Ranked's duel card covers a bot match's. Never during the Daily
  // intro: a child's clock must not start behind a screen the player is reading.
  useEffect(() => {
    if (!stage || dailyIntroUp || resultFor || busy || error) return;
    if (stageIntroFor !== stage.id) return;
    void launch();
  }, [stage, dailyIntroUp, resultFor, stageIntroFor, busy, error, launch]);

  // ── the handback ──────────────────────────────────────────────────────────
  const sync = useCallback(async (childId: string) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS && mounted.current; attempt++) {
        const r = runRef.current;
        if (!r) return;
        const next = await ask(() => transport.syncRun(r.runId), true);
        const still = next ? currentStage(next) : null;
        if (next && !(still && still.childMatchId === childId && still.status === "in_progress")) return;
        await new Promise((res) => window.setTimeout(res, SYNC_RETRY_MS));
      }
      // The parent never saw the child finish. Say so, and offer the re-ask.
      if (mounted.current) setError("Scoring this stage is taking longer than expected.");
    } finally {
      syncing.current = false;
    }
  }, [ask, transport]);

  const onChildSettled = useCallback((matchId: string) => {
    setSettledChild(matchId);
    void sync(matchId);
  }, [sync]);

  // ── live ruleset reads during a governed stage ────────────────────────────
  const onChildPhase = useCallback((phase: RankedPresentationPhase) => {
    setChildPhase(phase);
    const r = runRef.current;
    const s = r ? currentStage(r) : null;
    if (!r || !s || !s.ruleset || s.ruleset.id === "standard") return;
    const now = Date.now();
    if (now - lastLiveRead.current < LIVE_READ_MIN_GAP_MS) return;
    lastLiveRead.current = now;
    void ask(() => transport.readRun(r.runId), true);
  }, [ask, transport]);

  const retry = useCallback(() => {
    setError(null);
    const r = runRef.current;
    const s = r ? currentStage(r) : null;
    if (!s) return;
    launchAttempts.current.delete(s.id);
    if (settledChild) void sync(settledChild);
    else void launch();
  }, [settledChild, sync, launch]);

  const flow = useMemo(() => (run ? projectDailyFlow(run, {
    dailyIntroUp, stageIntroFor, settledChild, resultFor,
  }) : null), [run, dailyIntroUp, stageIntroFor, settledChild, resultFor]);

  const childEntry = flow?.childMatchId && freshChildren.current.has(flow.childMatchId)
    ? "fresh" : "recovered";

  return {
    load, run, flow, busy, error, skewMs, childPhase, childEntry,
    start, retry, onChildSettled, onChildPhase,
  };
}
