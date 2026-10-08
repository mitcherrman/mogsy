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
 *
 * DV2-P2A — a load onto a v5 day whose MAIN Daily is already complete and
 * whose next optional stage has not started lands on `optional-entry`: no
 * main result replay, and no optional child launched until the player asks
 * (`enterOptional`). A live optional child still recovers as above.
 *
 * DV2-P2A.1 — once the player COMMITS to an optional stage (leaves
 * `optional-entry`, presses Continue into it, or Try again), the stage's id is
 * latched (`optionalLaunchFor`) until the launch reaches a known outcome: a
 * child is bound (the live-child guard takes over), or a failed launch is
 * confirmed childless by a re-read. While it holds, `optionalLaunchPending`
 * keeps leaving guarded. It is mount-local: a reload never invents it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RankedPresentationPhase } from "@/lib/ranked-core/flow/rankedFlow";
import type { DailyRun } from "@/lib/daily-challenge/run/contracts";
import type { SurvivalStatus } from "@/lib/ranked-core/survivalFinish";
import { currentStage } from "@/lib/daily-challenge/run/contracts";
import {
  DailyRunApiError, isDailyRunAborted, type DailyRunTransport,
} from "@/lib/daily-challenge/run/client";
import { newInteractionId } from "@/lib/analytics/correlation";
import {
  DAILY_INTRO_MS, STAGE_INTRO_MIN_MS,
  arrivesAtOptionalEntry, optionalLaunchInFlight, optionalLaunchTarget,
  projectDailyFlow, stageCompletedBetween, type DailyFlowView,
} from "@/lib/daily-challenge/run/flow";
import { runSkewMs } from "@/lib/daily-challenge/run/timeBank";
import { useSfx } from "@/lib/audio/useSfx";

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
  /** DC-SURV-UX — the active child's player is done (Survival's third strike). */
  onChildPlayerFinished: (matchId: string) => void;
  onChildSurvivalStatus: (status: SurvivalStatus) => void;
  /** The active Survival child's status as its match last reported it. */
  survival: SurvivalStatus | null;
  /**
   * B7 — per stage id, the highest strike count the SERVER has reported for
   * it (the Daily's `live.strikes` or the child's relayed status). Strikes
   * never go down within a stage, so this is the stage's last known terminal
   * reading once its `live` block and the child's status are gone.
   */
  strikesSeen: Readonly<Record<string, number>>;
  /** DC-LANE-C — the stage result's Continue. Presentation only. */
  continueFromResult: () => void;
  /**
   * DV2-P2A — leave `optional-entry` for the next optional stage's tag (and so
   * its launch). Presentation only: the server already points at that stage.
   */
  enterOptional: () => void;
  /**
   * DV2-P2A.1 — the player committed to the current optional stage and its
   * launch has not reached a known outcome (no child bound yet, no confirmed
   * failure). Presentation fact for the leave guard; not a live child.
   */
  optionalLaunchPending: boolean;
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
      default:
        break;
    }
    if (e.kind === "network") return "Lost the connection. Your progress is saved.";
    if (e.kind === "invalid_response") return "This page is out of date. Refresh to update.";
  }
  return "Something went wrong. Your progress is saved.";
}

/**
 * `autoStart` — the player already pressed Play on the Ranked Hub, so a day
 * with no run is started here, on arrival, instead of behind a Begin screen.
 * Without it (a bare URL load) nothing is created: `startToday` is a POST that
 * may mint an identity, and USERS1 forbids a page load doing that.
 */
export function useDailyRun(transport: DailyRunTransport, autoStart = false): DailyRunState {
  const { play: playSfx } = useSfx();
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
  const [finishedChild, setFinishedChild] = useState<string | null>(null);
  const [survival, setSurvival] = useState<SurvivalStatus | null>(null);
  const [strikesSeen, setStrikesSeen] = useState<Readonly<Record<string, number>>>({});
  const [optionalEntryUp, setOptionalEntryUp] = useState(false);
  const [optionalLaunchFor, setOptionalLaunchFor] = useState<string | null>(null);
  const optionalLaunchRef = useRef<string | null>(null);

  const mounted = useRef(true);
  const runRef = useRef<DailyRun | null>(null);
  const timers = useRef<number[]>([]);
  /** Stages whose tag has been decided on (played, or skipped as a recovery). */
  const introduced = useRef<Set<string>>(new Set());
  /** Child matches THIS mount created — the only fresh entries there are. */
  const freshChildren = useRef<Set<string>>(new Set());
  const launchAttempts = useRef<Map<string, number>>(new Map());
  /**
   * USERS2.3C-Daily — one browser interaction id per stage launch. The bounded
   * automatic retries and the player's Retry are the SAME logical launch (the
   * server's `launch_id` is per stage too), so they reuse it rather than each
   * minting a meaningless new interaction. The server freezes the first one.
   */
  const launchInteractions = useRef<Map<string, string>>(new Map());
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

  /**
   * B7 — latch a server-reported strike count for a stage (monotone). The
   * completed stage's snapshot carries no `live` block and the child's relayed
   * status is dropped when the parent advances, which used to leave the chrome
   * reading 0/3 over "Out of strikes". Nothing is counted here: only numbers
   * the server sent are kept.
   */
  const noteStrikes = useCallback((stageId: string, used: number | null | undefined) => {
    if (used === null || used === undefined) return;
    setStrikesSeen((cur) => (cur[stageId] !== undefined && cur[stageId] >= used
      ? cur : { ...cur, [stageId]: used }));
  }, []);

  /** Adopt a snapshot as the truth, and notice a stage this mount watched finish. */
  const adopt = useCallback((next: DailyRun) => {
    if (!mounted.current) return;
    const prev = runRef.current;
    runRef.current = next;
    for (const st of next.stages) {
      const k = st.live?.strikes;
      if (st.ruleset?.id === "survival" && k) noteStrikes(st.id, Math.max(k.used, k.live ?? 0));
    }
    setRun(next);
    setLoad("run");
    setSkewMs(runSkewMs(next.serverNow, Date.now()));
    const done = stageCompletedBetween(prev, next);
    if (done) {
      setSettledChild(null);
      setFinishedChild(null);
      setSurvival(null);
      setChildPhase(null);
      // DC-LANE-C — every finished stage, Review included, gets its result
      // screen; the player leaves it with Continue (`continueFromResult`).
      setResultFor(done.id);
      // SFX2 — only a stage this mount WATCHED finish sounds; a reload onto a
      // finished stage has no `prev` and stays silent. Skips are not earned.
      if (done.status === "completed") {
        playSfx("daily.stage.complete", { eventId: `daily:${next.runId}:stage:${done.id}:complete` });
      }
    }
  }, [noteStrikes, playSfx]);

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
        if (!today) {
          if (!autoStart) { setLoad("ready"); return; }
          const next = await ask(() => transport.startToday());
          if (cancelled || !mounted.current) return;
          if (!next) { setLoad("ready"); return; }
          setDailyIntroUp(true);
          after(DAILY_INTRO_MS, () => setDailyIntroUp(false));
          return;
        }
        // A run nobody has played a stage of yet is still an arrival.
        const untouched = today.status === "active" && today.currentStageIndex === 0
          && today.stages[0].status === "pending";
        if (untouched) {
          setDailyIntroUp(true);
          after(DAILY_INTRO_MS, () => setDailyIntroUp(false));
        }
        // DV2-P2A — the main Daily is done; optional content waits for a choice.
        if (arrivesAtOptionalEntry(today)) setOptionalEntryUp(true);
        adopt(today);
      } catch (e) {
        if (cancelled || !mounted.current || isDailyRunAborted(e)) return;
        const code = e instanceof DailyRunApiError ? e.code : null;
        setLoad(code === "DAILY_RUN_NOT_WIRED" ? "unavailable" : "ready");
        setError(messageFor(e));
      }
    })();
    return () => { cancelled = true; };
  // `autoStart` is read once, on arrival — it is an intent, not a mode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, adopt, after, ask]);

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
    if (!stage || dailyIntroUp || resultFor || settledChild || optionalEntryUp) return;
    if (introduced.current.has(stage.id)) return;
    introduced.current.add(stage.id);
    // A stage already in progress on arrival is a RECOVERY: no tag replay.
    if (stage.status === "in_progress" && !freshChildren.current.has(stage.childMatchId ?? "")) return;
    setStageIntroFor(stage.id);
    after(STAGE_INTRO_MIN_MS, () => setStageIntroFor((cur) => (cur === stage.id ? null : cur)));
  }, [stage, dailyIntroUp, resultFor, settledChild, optionalEntryUp, after]);

  /** DV2-P2A.1 — latch (or clear) the optional stage this mount committed to. */
  const latchOptionalLaunch = useCallback((stageId: string | null) => {
    optionalLaunchRef.current = stageId;
    setOptionalLaunchFor(stageId);
  }, []);
  /** The player's commit: latch the current optional stage, if there is one. */
  const commitOptionalLaunch = useCallback(() => {
    const r = runRef.current;
    const target = r ? optionalLaunchTarget(r) : null;
    if (target) latchOptionalLaunch(target);
  }, [latchOptionalLaunch]);

  const launch = useCallback(async () => {
    const r = runRef.current;
    const s = r ? currentStage(r) : null;
    if (!r || !s || launching.current) return;
    if (s.status !== "pending" && s.status !== "launching") return;
    const attempts = launchAttempts.current.get(s.id) ?? 0;
    if (attempts >= MAX_LAUNCH_ATTEMPTS) return;
    launchAttempts.current.set(s.id, attempts + 1);
    let interactionId = launchInteractions.current.get(s.id);
    if (!interactionId) {
      interactionId = newInteractionId();
      launchInteractions.current.set(s.id, interactionId);
    }
    launching.current = true;
    try {
      const next = await ask(() => transport.launchStage(r.runId, s.index, undefined, interactionId));
      const child = next ? next.stages[s.index]?.childMatchId : null;
      if (child) freshChildren.current.add(child);
      // DV2-P2A.1 — a failed launch the player committed to is not yet a SAFE
      // outcome: the request may have reached the server. Ask what it holds.
      // No child → the latch drops and leaving is free again; a child → it was
      // ours, so it plays as a fresh entry and the live-child guard holds.
      // Unknown (the read failed too) → the latch stays. v1–v4 never latch.
      if (!next && mounted.current && optionalLaunchRef.current === s.id) {
        const truth = await ask(() => transport.readRun(r.runId), true);
        const bound = truth ? truth.stages[s.index]?.childMatchId ?? null : null;
        if (bound) {
          freshChildren.current.add(bound);
          setError(null);
        } else if (truth && optionalLaunchRef.current === s.id) {
          latchOptionalLaunch(null);
        }
      }
    } finally {
      launching.current = false;
    }
  }, [ask, transport, latchOptionalLaunch]);

  // Launch while the tag is up — the tag is what covers the child's creation,
  // exactly as Ranked's duel card covers a bot match's. Never during the Daily
  // intro: a child's clock must not start behind a screen the player is reading.
  useEffect(() => {
    if (!stage || dailyIntroUp || resultFor || optionalEntryUp || busy || error) return;
    if (stageIntroFor !== stage.id) return;
    void launch();
  }, [stage, dailyIntroUp, resultFor, optionalEntryUp, stageIntroFor, busy, error, launch]);

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

  // DC-SURV-UX — the player is out; the match is still settling server-side.
  // Only the presentation moves. The parent advances on the ordinary handback.
  const onChildPlayerFinished = useCallback((matchId: string) => {
    setFinishedChild(matchId);
  }, []);
  const onChildSurvivalStatus = useCallback((status: SurvivalStatus) => {
    setSurvival(status);
    const r = runRef.current;
    const s = r ? currentStage(r) : null;
    if (s?.ruleset?.id === "survival") noteStrikes(s.id, status.strikesUsed);
  }, [noteStrikes]);

  // DC-LANE-C — leave the stage result. The parent has ALREADY advanced (the
  // result only exists after it did), so this moves presentation only: the
  // next stage's tag, or the day's completion.
  const continueFromResult = useCallback(() => {
    setResultFor(null);
    commitOptionalLaunch();
  }, [commitOptionalLaunch]);

  const enterOptional = useCallback(() => {
    setOptionalEntryUp(false);
    commitOptionalLaunch();
  }, [commitOptionalLaunch]);

  const retry = useCallback(() => {
    setError(null);
    const r = runRef.current;
    const s = r ? currentStage(r) : null;
    if (!s) return;
    launchAttempts.current.delete(s.id);
    if (settledChild) void sync(settledChild);
    else {
      commitOptionalLaunch();
      void launch();
    }
  }, [settledChild, sync, launch, commitOptionalLaunch]);

  const flow = useMemo(() => (run ? projectDailyFlow(run, {
    dailyIntroUp, stageIntroFor, settledChild, resultFor, finishedChild, optionalEntryUp,
  }) : null), [run, dailyIntroUp, stageIntroFor, settledChild, resultFor, finishedChild, optionalEntryUp]);

  const optionalLaunchPending = run ? optionalLaunchInFlight(run, optionalLaunchFor) : false;

  const activeChild = flow?.childMatchId ?? flow?.settlingChildMatchId ?? null;
  const childEntry = activeChild && freshChildren.current.has(activeChild)
    ? "fresh" : "recovered";

  return {
    load, run, flow, busy, error, skewMs, childPhase, childEntry,
    start, retry, onChildSettled, onChildPhase,
    onChildPlayerFinished, onChildSurvivalStatus, survival, strikesSeen, continueFromResult,
    enterOptional, optionalLaunchPending,
  };
}
