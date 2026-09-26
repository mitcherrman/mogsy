/**
 * PLAY1 — the Daily ADAPTER: a pass-through observing transport.
 *
 * `DailyRunPage` accepts a swappable `DailyRunTransport`. Playtest wraps the
 * canonical transport so that every method forwards the SAME arguments to the
 * inner transport and resolves (or rejects) with the SAME value, the same
 * object, in the same order — and, on the way past, hands each returned run to
 * an observer. The observer derives a tiny Playtest projection; it never
 * mutates a response, never alters a request, never selects content, never
 * skips a stage, never scores and never manufactures completion.
 *
 * An observer that throws is contained: Daily must never fail because
 * Playtest did.
 */
import type { DailyRunTransport } from "@/lib/daily-challenge/run/client";
import type { DailyRun } from "@/lib/daily-challenge/run/contracts";
import type { GameplayReturnCondition } from "./manifest";

export type DailySnapshotObserver = (run: DailyRun) => void;

export function observeDailyTransport(
  inner: DailyRunTransport,
  observe: DailySnapshotObserver,
): DailyRunTransport {
  const see = <T extends DailyRun | null>(run: T): T => {
    if (run) {
      try { observe(run); } catch { /* observation must never break Daily */ }
    }
    return run;
  };
  return {
    readToday: (signal) => inner.readToday(signal).then(see),
    startToday: (signal) => inner.startToday(signal).then(see),
    readRun: (runId, signal) => inner.readRun(runId, signal).then(see),
    launchStage: (runId, stageIndex, signal) => inner.launchStage(runId, stageIndex, signal).then(see),
    syncRun: (runId, signal) => inner.syncRun(runId, signal).then(see),
  };
}

/** The only Daily facts Playtest reads. */
export interface DailyProjection {
  runId: string;
  planDate: string;
  runStatus: DailyRun["status"];
  currentStageIndex: number | null;
  /** The stage the host should see: current, else the last one. */
  focusStageIndex: number | null;
  focusStageStatus: string | null;
  stageStatuses: readonly string[];
}

export function projectDaily(run: DailyRun): DailyProjection {
  const focus = run.currentStageIndex ?? (run.stages.length ? run.stages.length - 1 : null);
  return {
    runId: run.runId,
    planDate: run.planDate,
    runStatus: run.status,
    currentStageIndex: run.currentStageIndex,
    focusStageIndex: focus,
    focusStageStatus: focus === null ? null : run.stages[focus]?.status ?? null,
    stageStatuses: run.stages.map((s) => s.status),
  };
}

const TERMINAL_STAGE = new Set(["completed", "skipped"]);

export function isStageTerminal(p: DailyProjection, stageIndex: number): boolean {
  const status = p.stageStatuses[stageIndex];
  return status !== undefined && TERMINAL_STAGE.has(status);
}

export function isDailyTerminal(p: DailyProjection): boolean {
  return p.runStatus === "completed";
}

/** Has the manifest's configured return point been reached? */
export function returnConditionMet(condition: GameplayReturnCondition, p: DailyProjection): boolean {
  switch (condition.type) {
    case "stage_terminal":
      // A completed Daily has no live stage left to play; it always returns.
      return isStageTerminal(p, condition.stageIndex) || isDailyTerminal(p);
    case "daily_terminal":
      return isDailyTerminal(p);
  }
}
