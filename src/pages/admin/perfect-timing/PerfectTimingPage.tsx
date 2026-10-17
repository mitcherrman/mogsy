/**
 * PT4 — the owner-only Perfect Timing Lab. PT4.1: played from the Playtests hub
 * at `/admin/playtests/perfect-timing` (`OwnerPlaytestPage` passes `lead`, the
 * way back to Playtests); `/admin/perfect-timing` only redirects there.
 *
 * Orchestrates one five-round run: deal → arm → start → stop → lock → reveal →
 * next → results. The pieces it joins:
 *
 *   PT1 `PerfectTimingArena` / `PerfectTimingResults` — draws a `PtStageModel`
 *       and plays the three existing Ranked cues on its phase edges (this page
 *       plays no sound of its own).
 *   PT2 `useTimingEngine` — the monotonic start/stop machine. Its
 *       `onStopped(elapsedMs, roundId)` is the ONLY way a time reaches `lock`,
 *       and the round id it carries is checked against the current round so a
 *       stale stop can never be submitted for another round.
 *   PT4 `perfectTimingApi` — `/api/admin/perfect-timing/*` (backend PT3).
 *
 * WHAT PROTECTS IT. `AdminRoute` (UX only) and, server-side, `require_admin` +
 * `PERFECT_TIMING_LAB_ENABLED`. The page never holds a target before the
 * server releases it: the deal reader refuses a payload that carries one.
 *
 * PT5: the page is now a two-mode shell. It opens on a mode pick (or the
 * `?run=random|slice` it was linked with): RANDOM RUN is the PT4.4 five-round
 * game below, unchanged; MASTERY SLICE (`MasterySliceRun`) times one ability
 * through three connected stages. Results offer Play again (same mode) and
 * Change mode.
 *
 * WHAT IT CLAIMS. Elapsed time is measured in this browser and is NOT
 * tamper-proof; the server grades it and reports an upper-bound plausibility
 * verdict only. Scoring constants are playtest starting values. Nothing is
 * stored. Not part of Quiz, Daily or Ranked. None of this is printed on the
 * screen (PT4.4): the mode is a fixed, non-scrolling frame with no disclaimers.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PerfectTimingArena } from "@/components/perfect-timing/PerfectTimingArena";
import { PerfectTimingResults } from "@/components/perfect-timing/PerfectTimingResults";
import { PerfectTimingModeSelect, type PtMode } from "@/components/perfect-timing/PerfectTimingModeSelect";
import { PerfectTimingBar, PerfectTimingScreen } from "@/components/perfect-timing/PerfectTimingScreen";
import { PerfectTimingApiError, perfectTimingApi, type PerfectTimingApi } from "@/lib/perfect-timing/api";
import { toRevealView, type PtDeal, type PtDealRound } from "@/lib/perfect-timing/contract";
import { useSplashManifest } from "@/lib/perfect-timing/useSplashManifest";
import { useTimingEngine } from "@/lib/perfect-timing/useTimingEngine";
import type { PtPhase, PtRevealView, PtRunHud, PtRunSummary, PtStageModel, PtTier } from "@/lib/perfect-timing/viewModel";
import { MasterySliceRun } from "./MasterySliceRun";
import { toRoundView } from "./roundView";
import { ADVANCE_KEY_GUARD_MS, SUBMITTING_DELAY_MS, VOID_TEXT, dealErrorText } from "./runShared";

export const ROUNDS_PER_RUN = 5;

export { ADVANCE_KEY_GUARD_MS, SUBMITTING_DELAY_MS };

interface Slot {
  wire: PtDealRound;
  reveal: PtRevealView | null;
  outcome: PtTier | "voided" | null;
}

interface Run {
  dataLabel: PtDeal["data_label"];
  slots: Slot[];
}

type Stage =
  | { kind: "dealing"; message: string | null }
  | { kind: "deal-error"; message: string; status: number | null }
  | { kind: "play" }
  | { kind: "submitting"; roundId: string; elapsedMs: number }
  | { kind: "revealed" }
  | { kind: "voided"; message: string }
  | { kind: "lock-error"; roundId: string; elapsedMs: number; message: string; retryable: boolean }
  | { kind: "complete" };

const EXPIRED_TEXT = "Round expired — dealing a fresh one.";

const isExpired = (r: PtDealRound) => Date.parse(r.expires_at) <= Date.now();

/**
 * PGM2 — the public bonus game host (More Challenges). Absent on the owner
 * lab, which keeps every word and action it had. A public host plays the
 * Random Run directly: no mode pick, no slice runs.
 */
export interface PerfectTimingPublicHost {
  /** Player-facing copy for a failed deal (never a flag or an owner session). */
  dealErrorText: (status: number | null, message: string) => string;
  /** The results' way out, e.g. back to More Challenges. */
  exitLabel: string;
  onExit: () => void;
  /** The round on screen and its reveal (null until locked), for reports. */
  onRound?: (round: PtDealRound | null, reveal: PtRevealView | null, index: number) => void;
}

const RUN_PARAM = "run";
const isMode = (v: string | null): v is PtMode => v === "random" || v === "slice";

export default function PerfectTimingPage({ api: injected, exitTo = "/admin", lead, initialMode, publicHost }: {
  api?: PerfectTimingApi;
  exitTo?: string;
  /** PT4.1: launched from Ranked → Playtests; heads the top bar and replaces "Exit". */
  lead?: ReactNode;
  /** PT5: skip the mode pick (tests, links). `?run=random|slice` does the same. */
  initialMode?: PtMode;
  publicHost?: PerfectTimingPublicHost;
} = {}) {
  const api = useMemo(() => injected ?? perfectTimingApi(), [injected]);
  const [params, setParams] = useSearchParams();
  const linked = params.get(RUN_PARAM);
  const [mode, setMode] = useState<PtMode | null>(initialMode ?? (isMode(linked) ? linked : null));
  const pick = useCallback((m: PtMode | null) => {
    setMode(m);
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (m) next.set(RUN_PARAM, m); else next.delete(RUN_PARAM);
      return next;
    }, { replace: true });
  }, [setParams]);
  const changeMode = useCallback(() => pick(null), [pick]);
  const leadNode = lead ?? <Link to={exitTo} className="pt-back">Exit</Link>;

  if (publicHost) return <RandomRun api={api} lead={leadNode} onChangeMode={changeMode} publicHost={publicHost} />;

  if (mode === "random") return <RandomRun api={api} lead={leadNode} onChangeMode={changeMode} />;
  if (mode === "slice") return <MasterySliceRun api={api} lead={leadNode} onChangeMode={changeMode} />;
  return (
    <PerfectTimingScreen bar={<div className="pt-bar" data-testid="pt-chrome">{leadNode}</div>} stage="mode">
      <PerfectTimingModeSelect onPick={pick} />
    </PerfectTimingScreen>
  );
}

/** The PT4.4 Random Run: five distinct abilities, base cooldowns, one at a time. Unchanged by PT5. */
function RandomRun({ api, lead, onChangeMode, publicHost }: {
  api: PerfectTimingApi;
  lead: ReactNode;
  onChangeMode: () => void;
  publicHost?: PerfectTimingPublicHost;
}) {
  const publicHostRef = useRef(publicHost);
  publicHostRef.current = publicHost;
  const manifest = useSplashManifest();
  const [run, setRun] = useState<Run | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: "dealing", message: null });
  const [showSubmitting, setShowSubmitting] = useState(false);

  // Async guards: a response is applied only if the page is still mounted, the
  // run that asked is still the run, and (for a lock) its round is still current.
  const alive = useRef(true);
  const runToken = useRef(0);
  const runRef = useRef<Run | null>(null);
  const currentRoundId = useRef<string | null>(null);
  const submitted = useRef(new Set<string>());
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const commitRun = useCallback((next: Run | null) => { runRef.current = next; setRun(next); }, []);

  // ---------------------------------------------------------------- lock
  const submit = useCallback(async (roundId: string, elapsedMs: number) => {
    const token = runToken.current;
    setStage({ kind: "submitting", roundId, elapsedMs });
    setShowSubmitting(false);
    try {
      const release = await api.lock(roundId, elapsedMs);
      if (!alive.current || token !== runToken.current || currentRoundId.current !== roundId) return;
      const r = runRef.current;
      if (!r) return;
      const reveal = toRevealView(release);
      commitRun({ ...r, slots: r.slots.map((s) => (s.wire.round_id === roundId ? { ...s, reveal, outcome: reveal.tier } : s)) });
      setStage({ kind: "revealed" });
    } catch (err) {
      if (!alive.current || token !== runToken.current || currentRoundId.current !== roundId) return;
      const e = err instanceof PerfectTimingApiError ? err : null;
      if (e?.status === 404) { replaceRef.current(); return; }
      const message = e?.status === 409 ? "This round was already locked with a different time. It is voided."
        : e?.transient ? `${e.message} Your stop was kept — retry, or void the round.`
        : `${e?.message ?? "The round could not be recorded."} The round is voided.`;
      setStage({ kind: "lock-error", roundId, elapsedMs, message, retryable: Boolean(e?.transient) });
    }
  }, [api, commitRun]);

  const onStopped = useCallback((elapsedMs: number, roundId: string) => {
    // A stop that belongs to anything but the round on screen, or a second
    // stop for a round already sent, is dropped: never submitted elsewhere.
    if (roundId !== currentRoundId.current || submitted.current.has(roundId)) return;
    submitted.current.add(roundId);
    void submit(roundId, elapsedMs);
  }, [submit]);

  // PT4.3: Space/Enter work anywhere on the page while a round is in play,
  // not only with focus on the seal (owner report from production).
  const keyGuardUntil = useRef(0);
  const keyGuard = useCallback(() => performance.now() < keyGuardUntil.current, []);
  const engine = useTimingEngine({ onStopped, documentKeys: stage.kind === "play", keyGuard });
  const { arm, reset } = engine;

  // ---------------------------------------------------------------- rounds
  const beginRound = useCallback((i: number, r: Run) => {
    const slot = r.slots[i];
    setIndex(i);
    if (isExpired(slot.wire)) {
      currentRoundId.current = null;
      replaceRef.current(i);
      return;
    }
    currentRoundId.current = slot.wire.round_id;
    setStage({ kind: "play" });
    arm(slot.wire.round_id);
  }, [arm]);

  /** Swap the round at `i` (default: current) for a fresh single deal. */
  const replace = useCallback(async (at?: number) => {
    const token = runToken.current;
    const i = at ?? index;
    currentRoundId.current = null;
    reset();
    setStage({ kind: "dealing", message: EXPIRED_TEXT });
    try {
      const fresh = await api.deal(1);
      if (!alive.current || token !== runToken.current) return;
      const r = runRef.current;
      if (!r) return;
      const next: Run = { ...r, slots: r.slots.map((s, k) => (k === i ? { wire: fresh.rounds[0], reveal: null, outcome: null } : s)) };
      commitRun(next);
      beginRound(i, next);
    } catch (err) {
      if (!alive.current || token !== runToken.current) return;
      const e = err instanceof PerfectTimingApiError ? err : null;
      setStage({ kind: "deal-error", message: (publicHostRef.current?.dealErrorText ?? dealErrorText)(e?.status ?? null, e?.message ?? "Could not deal a fresh round."), status: e?.status ?? null });
    }
  }, [api, index, reset, commitRun, beginRound]);
  const replaceRef = useRef(replace);
  useEffect(() => { replaceRef.current = replace; });

  const startRun = useCallback(async () => {
    const token = ++runToken.current;
    currentRoundId.current = null;
    submitted.current = new Set();
    reset();
    commitRun(null);
    setIndex(0);
    setStage({ kind: "dealing", message: null });
    try {
      const deal = await api.deal(ROUNDS_PER_RUN);
      if (!alive.current || token !== runToken.current) return;
      const next: Run = { dataLabel: deal.data_label, slots: deal.rounds.map((wire) => ({ wire, reveal: null, outcome: null })) };
      commitRun(next);
      beginRound(0, next);
    } catch (err) {
      if (!alive.current || token !== runToken.current) return;
      const e = err instanceof PerfectTimingApiError ? err : null;
      setStage({ kind: "deal-error", message: (publicHostRef.current?.dealErrorText ?? dealErrorText)(e?.status ?? null, e?.message ?? "Could not deal rounds."), status: e?.status ?? null });
    }
  }, [api, reset, commitRun, beginRound]);

  useEffect(() => { void startRun(); }, [startRun]);

  // The engine voids a running attempt when the page is hidden or left.
  const enginePhase = engine.state.phase;
  const interruptReason = engine.state.interruptReason;
  useEffect(() => {
    if (stage.kind !== "play" || enginePhase !== "interrupted") return;
    const roundId = currentRoundId.current;
    const r = runRef.current;
    if (r && roundId) commitRun({ ...r, slots: r.slots.map((s) => (s.wire.round_id === roundId ? { ...s, outcome: "voided" } : s)) });
    setStage({ kind: "voided", message: VOID_TEXT[interruptReason ?? "hidden"] });
  }, [stage.kind, enginePhase, interruptReason, commitRun]);

  // "Locked" first (the lock cue's edge), then "checking the archive" if the
  // server is slow. Starts only after the stop, so nothing ticks while timing.
  useEffect(() => {
    if (stage.kind !== "submitting") return;
    const t = window.setTimeout(() => setShowSubmitting(true), SUBMITTING_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [stage]);

  const advance = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    if (index + 1 < r.slots.length) beginRound(index + 1, r);
    else { currentRoundId.current = null; setStage({ kind: "complete" }); }
  }, [index, beginRound]);

  const onReveal = useCallback((source?: "key") => {
    if (source === "key") keyGuardUntil.current = performance.now() + ADVANCE_KEY_GUARD_MS;
    advance();
  }, [advance]);

  const voidAndAdvance = useCallback(() => {
    const r = runRef.current;
    const roundId = r?.slots[index]?.wire.round_id;
    if (r && roundId) {
      const next: Run = { ...r, slots: r.slots.map((s) => (s.wire.round_id === roundId ? { ...s, outcome: "voided" } : s)) };
      commitRun(next);
    }
    advance();
  }, [index, commitRun, advance]);

  const retryLock = useCallback(() => {
    if (stage.kind === "lock-error" && stage.retryable) void submit(stage.roundId, stage.elapsedMs);
  }, [stage, submit]);

  // ---------------------------------------------------------------- views
  const slots = run?.slots ?? [];
  const total = slots.length || ROUNDS_PER_RUN;
  const slot = slots[index] ?? null;
  const roundView = useMemo(() => (slot ? toRoundView(slot.wire, index, total, manifest) : null), [slot, index, total, manifest]);

  const phase: PtPhase = (() => {
    switch (stage.kind) {
      case "dealing": return "loading";
      case "deal-error": case "lock-error": return "error";
      case "submitting": return showSubmitting ? "submitting" : "stopped";
      case "revealed": return "revealed";
      case "voided": return "interrupted";
      case "complete": return "complete";
      case "play": return enginePhase === "idle" ? "loading" : enginePhase;
    }
  })();

  const statusText = stage.kind === "dealing" ? stage.message
    : stage.kind === "deal-error" || stage.kind === "lock-error" || stage.kind === "voided" ? stage.message
    : null;

  const hud: PtRunHud | null = run ? {
    pointsSoFar: slots.some((s) => s.reveal) ? slots.reduce((n, s) => n + (s.reveal?.points ?? 0), 0) : null,
    outcomes: slots.map((s) => s.outcome),
    patchLabel: run.dataLabel.patch_label,
    patchSource: run.dataLabel.patch_source,
  } : null;

  const model: PtStageModel = {
    round: stage.kind === "dealing" || stage.kind === "deal-error" ? null : roundView,
    phase,
    press: engine.press,
    statusText,
    reveal: stage.kind === "revealed" ? slot?.reveal ?? null : null,
    onNext: onReveal,
    hud,
  };

  // PGM2 — tell a public host which round is on screen (and its reveal), so
  // the round can be reported. Keyed by value, not identity.
  const reportKey = `${slot?.wire.round_id ?? ""}:${slot?.reveal ? "r" : "o"}:${index}`;
  useEffect(() => {
    publicHostRef.current?.onRound?.(slot?.wire ?? null, slot?.reveal ?? null, index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);

  const summary: PtRunSummary | null = run && stage.kind === "complete" ? {
    rounds: slots.map((s, i) => ({ round: toRoundView(s.wire, i, slots.length, manifest), reveal: s.reveal })),
    totalPoints: slots.reduce((n, s) => n + (s.reveal?.points ?? 0), 0),
    patchLabel: run.dataLabel.patch_label,
    patchSource: run.dataLabel.patch_source,
  } : null;

  // Keyboard: when a recovery action appears, focus moves to it; the arena
  // moves focus back to the seal when the next round is armed.
  const actionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (stage.kind === "voided" || stage.kind === "lock-error" || stage.kind === "deal-error") actionRef.current?.focus({ preventScroll: true });
  }, [stage.kind]);

  const lastRound = index + 1 >= slots.length;
  const actions = stage.kind === "voided" ? (
    <button ref={actionRef} type="button" data-testid="pt-continue" onClick={advance} className="pt-btn">{lastRound ? "See results" : "Next round"}</button>
  ) : stage.kind === "lock-error" ? (
    <>
      {stage.retryable ? <button ref={actionRef} type="button" data-testid="pt-retry-lock" onClick={retryLock} className="pt-btn">Retry submission</button> : null}
      <button ref={stage.retryable ? undefined : actionRef} type="button" data-testid="pt-void-continue" onClick={voidAndAdvance} className="pt-btn">
        {stage.retryable ? "Void round" : lastRound ? "See results" : "Next round"}
      </button>
    </>
  ) : stage.kind === "deal-error" ? (
    <button ref={actionRef} type="button" data-testid="pt-retry-deal" onClick={() => (run ? void replace() : void startRun())} className="pt-btn">Try again</button>
  ) : null;

  const pointsSoFar = slots.reduce((n, s) => n + (s.reveal?.points ?? 0), 0);
  const bar = (
    <PerfectTimingBar
      lead={lead}
      index={stage.kind === "complete" ? total : slot ? index + 1 : 0}
      total={total}
      outcomes={hud?.outcomes}
      points={slots.some((s) => s.reveal) ? pointsSoFar : null}
    />
  );

  // The backdrop is the current champion; on the results it is the closest stop's champion.
  const art = summary
    ? summary.rounds.reduce<{ url: string | null; err: number }>((best, r) => (
        r.reveal && r.reveal.absErrorMs < best.err ? { url: r.round.splashUrl ?? null, err: r.reveal.absErrorMs } : best
      ), { url: null, err: Infinity }).url
    : roundView?.splashUrl ?? null;

  return (
    <PerfectTimingScreen bar={bar} art={art} stage={stage.kind}>
      {summary ? (
        <PerfectTimingResults summary={summary} onPlayAgain={() => void startRun()}
          onExit={publicHost ? publicHost.onExit : onChangeMode} exitLabel={publicHost ? publicHost.exitLabel : "Change mode"} />
      ) : (
        <PerfectTimingArena model={model} actions={actions} />
      )}
    </PerfectTimingScreen>
  );
}
