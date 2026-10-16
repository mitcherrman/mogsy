/**
 * PT5 — the MASTERY SLICE run: one champion ability, three connected stages.
 *
 *   1 Foundation  rank 1, no ability haste
 *   2 Rank up     rank 3, no ability haste
 *   3 Equipped    rank 3 + Sheen (its canonical ability haste)
 *
 * Same machinery as the Random Run (PT2 engine, PT1 stage/reveal, the PT4.4
 * fixed screen); different wire: `dealSlice` / `lockSlice` (backend PT5,
 * `perfect_timing.slice_*.v1`). The server owns every target; the client never
 * holds one before its stage is locked, and a stage's reveal compares with the
 * previous stage only if THAT stage was revealed.
 *
 * RECOVERY (handoff PT5 §5).
 *  - Interrupted (hidden / pagehide / clock / timeout): the stage is voided and
 *    never sent; Next goes on to the next stage of the SAME ability. The server
 *    closes a passed stage when a later one locks.
 *  - Expired (the slice's TTL passed, a restart, or a lock answered 404): the
 *    SAME ability is re-dealt from the current stage (`resume`, carrying the
 *    revisions the slice was dealt with). Earlier results stay. If the ability
 *    or item data changed, the server refuses and the player is offered a new
 *    slice — a progression never mixes two data revisions, and it is never
 *    quietly swapped for another champion.
 *  - Lock 409 (stage closed / already locked): voided. Network / 5xx: retried
 *    by the client, then Retry submission or Void.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PerfectTimingArena } from "@/components/perfect-timing/PerfectTimingArena";
import { PerfectTimingResults } from "@/components/perfect-timing/PerfectTimingResults";
import { PerfectTimingBar, PerfectTimingScreen } from "@/components/perfect-timing/PerfectTimingScreen";
import { PerfectTimingApiError, type PerfectTimingApi } from "@/lib/perfect-timing/api";
import { SLICE_STAGES, type PtSliceDeal, type PtSliceRelease } from "@/lib/perfect-timing/sliceContract";
import { useSplashManifest } from "@/lib/perfect-timing/useSplashManifest";
import { useTimingEngine } from "@/lib/perfect-timing/useTimingEngine";
import type { PtPhase, PtRevealView, PtRunHud, PtRunSummary, PtStageModel, PtTier } from "@/lib/perfect-timing/viewModel";
import { ADVANCE_KEY_GUARD_MS, SUBMITTING_DELAY_MS, VOID_TEXT, dealErrorText } from "./runShared";
import { toSliceRevealView, toSliceRoundView } from "./sliceView";

interface StageSlot {
  release: PtSliceRelease | null;
  reveal: PtRevealView | null;
  outcome: PtTier | "voided" | null;
}

interface SliceRun {
  /** The slice currently dealt (a resume replaces it; the ability never changes). */
  deal: PtSliceDeal;
  /** Sliding: every release renews it. */
  expiresAt: string;
  slots: StageSlot[];
}

type Stage =
  | { kind: "dealing"; message: string | null }
  | { kind: "deal-error"; message: string; status: number | null; resumeFrom: number | null; fresh: boolean }
  | { kind: "play" }
  | { kind: "submitting"; roundId: string; elapsedMs: number }
  | { kind: "revealed" }
  | { kind: "voided"; message: string }
  | { kind: "lock-error"; roundId: string; elapsedMs: number; message: string; retryable: boolean }
  | { kind: "complete" };

const STAGE_NAME = ["Foundation", "Rank up", "Equipped"];
const expiredText = (deal: PtSliceDeal, i: number) =>
  `Slice expired — re-dealing ${deal.champion} ${deal.ability_name} from ${STAGE_NAME[i] ?? "this stage"}.`;
const CHANGED_TEXT = "This ability's data changed since the slice was dealt, so it cannot continue. Start a new slice.";

export function MasterySliceRun({ api, lead, onChangeMode }: {
  api: PerfectTimingApi;
  lead: ReactNode;
  onChangeMode: () => void;
}) {
  const manifest = useSplashManifest();
  const [run, setRun] = useState<SliceRun | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: "dealing", message: null });
  const [showSubmitting, setShowSubmitting] = useState(false);

  // The same async guards as the Random Run: mounted, same run, same round.
  const alive = useRef(true);
  const runToken = useRef(0);
  const runRef = useRef<SliceRun | null>(null);
  const currentRoundId = useRef<string | null>(null);
  const submitted = useRef(new Set<string>());
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const commitRun = useCallback((next: SliceRun | null) => { runRef.current = next; setRun(next); }, []);
  const setSlot = useCallback((i: number, patch: Partial<StageSlot>) => {
    const r = runRef.current;
    if (!r) return null;
    const next: SliceRun = { ...r, slots: r.slots.map((s, k) => (k === i ? { ...s, ...patch } : s)) };
    commitRun(next);
    return next;
  }, [commitRun]);

  const keyGuardUntil = useRef(0);
  const keyGuard = useCallback(() => performance.now() < keyGuardUntil.current, []);
  const resumeRef = useRef<(i: number) => void>(() => {});

  // ---------------------------------------------------------------- lock
  const submit = useCallback(async (roundId: string, elapsedMs: number) => {
    const token = runToken.current;
    const r0 = runRef.current;
    if (!r0) return;
    const i = r0.deal.stages.findIndex((s) => s.round_id === roundId);
    setStage({ kind: "submitting", roundId, elapsedMs });
    setShowSubmitting(false);
    try {
      const release = await api.lockSlice(r0.deal.slice_id, roundId, elapsedMs);
      if (!alive.current || token !== runToken.current || currentRoundId.current !== roundId) return;
      const r = runRef.current;
      if (!r) return;
      // The previous stage's truth, only if it was revealed.
      const previous = i > 0 ? r.slots[i - 1].release : null;
      const reveal = toSliceRevealView(release, r.deal.assumption, previous);
      commitRun({
        ...r,
        expiresAt: release.slice_expires_at,
        slots: r.slots.map((s, k) => (k === i ? { release, reveal, outcome: reveal.tier } : s)),
      });
      setStage({ kind: "revealed" });
    } catch (err) {
      if (!alive.current || token !== runToken.current || currentRoundId.current !== roundId) return;
      const e = err instanceof PerfectTimingApiError ? err : null;
      if (e?.status === 404) { resumeRef.current(i); return; }
      const message = e?.status === 409 ? "This stage was already closed on the server. It is voided."
        : e?.transient ? `${e.message} Your stop was kept — retry, or void the stage.`
        : `${e?.message ?? "The stage could not be recorded."} The stage is voided.`;
      setStage({ kind: "lock-error", roundId, elapsedMs, message, retryable: Boolean(e?.transient) });
    }
  }, [api, commitRun]);

  const onStopped = useCallback((elapsedMs: number, roundId: string) => {
    if (roundId !== currentRoundId.current || submitted.current.has(roundId)) return;
    submitted.current.add(roundId);
    void submit(roundId, elapsedMs);
  }, [submit]);

  const engine = useTimingEngine({ onStopped, documentKeys: stage.kind === "play", keyGuard });
  const { arm, reset } = engine;

  // ---------------------------------------------------------------- stages
  const beginStage = useCallback((i: number, r: SliceRun) => {
    setIndex(i);
    const roundId = r.deal.stages[i]?.round_id ?? null;
    if (!roundId || Date.parse(r.expiresAt) <= Date.now()) {
      currentRoundId.current = null;
      resumeRef.current(i);
      return;
    }
    currentRoundId.current = roundId;
    setStage({ kind: "play" });
    arm(roundId);
  }, [arm]);

  /** Re-deal the SAME ability from stage `i` (0-based); earlier results stay. */
  const resume = useCallback(async (i: number) => {
    const token = runToken.current;
    const r = runRef.current;
    if (!r) return;
    currentRoundId.current = null;
    reset();
    setIndex(i);
    setStage({ kind: "dealing", message: expiredText(r.deal, i) });
    try {
      const fresh = await api.dealSlice({
        champion: r.deal.champion,
        slot: r.deal.slot,
        from_stage: i + 1,
        ability_revision_id: r.deal.authority.ability_revision_id,
        item_source_revision: r.deal.authority.item_source_revision,
      });
      if (!alive.current || token !== runToken.current) return;
      const cur = runRef.current;
      if (!cur) return;
      const next: SliceRun = { ...cur, deal: fresh, expiresAt: fresh.expires_at };
      commitRun(next);
      beginStage(i, next);
    } catch (err) {
      if (!alive.current || token !== runToken.current) return;
      const e = err instanceof PerfectTimingApiError ? err : null;
      const changed = e?.status === 409;
      setStage({
        kind: "deal-error",
        message: changed ? CHANGED_TEXT : dealErrorText(e?.status ?? null, e?.message ?? "Could not re-deal this slice."),
        status: e?.status ?? null,
        resumeFrom: changed ? null : i,
        fresh: changed,
      });
    }
  }, [api, reset, commitRun, beginStage]);
  useEffect(() => { resumeRef.current = (i: number) => { void resume(i); }; });

  const startSlice = useCallback(async () => {
    const token = ++runToken.current;
    currentRoundId.current = null;
    submitted.current = new Set();
    reset();
    commitRun(null);
    setIndex(0);
    setStage({ kind: "dealing", message: null });
    try {
      const deal = await api.dealSlice();
      if (!alive.current || token !== runToken.current) return;
      const next: SliceRun = {
        deal,
        expiresAt: deal.expires_at,
        slots: deal.stages.map(() => ({ release: null, reveal: null, outcome: null })),
      };
      commitRun(next);
      beginStage(0, next);
    } catch (err) {
      if (!alive.current || token !== runToken.current) return;
      const e = err instanceof PerfectTimingApiError ? err : null;
      setStage({
        kind: "deal-error",
        message: dealErrorText(e?.status ?? null, e?.message ?? "Could not deal a slice."),
        status: e?.status ?? null,
        resumeFrom: null,
        fresh: true,
      });
    }
  }, [api, reset, commitRun, beginStage]);

  useEffect(() => { void startSlice(); }, [startSlice]);

  const enginePhase = engine.state.phase;
  const interruptReason = engine.state.interruptReason;
  useEffect(() => {
    if (stage.kind !== "play" || enginePhase !== "interrupted") return;
    setSlot(index, { outcome: "voided" });
    setStage({ kind: "voided", message: VOID_TEXT[interruptReason ?? "hidden"] });
  }, [stage.kind, enginePhase, interruptReason, index, setSlot]);

  useEffect(() => {
    if (stage.kind !== "submitting") return;
    const t = window.setTimeout(() => setShowSubmitting(true), SUBMITTING_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [stage]);

  const advance = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    if (index + 1 < SLICE_STAGES) beginStage(index + 1, r);
    else { currentRoundId.current = null; setStage({ kind: "complete" }); }
  }, [index, beginStage]);

  const onReveal = useCallback((source?: "key") => {
    if (source === "key") keyGuardUntil.current = performance.now() + ADVANCE_KEY_GUARD_MS;
    advance();
  }, [advance]);

  const voidAndAdvance = useCallback(() => {
    setSlot(index, { outcome: "voided" });
    advance();
  }, [index, setSlot, advance]);

  const retryLock = useCallback(() => {
    if (stage.kind === "lock-error" && stage.retryable) void submit(stage.roundId, stage.elapsedMs);
  }, [stage, submit]);

  // ---------------------------------------------------------------- views
  const slots = run?.slots ?? [];
  const total = SLICE_STAGES;
  const roundView = useMemo(() => (run ? toSliceRoundView(run.deal, index, manifest) : null), [run, index, manifest]);
  const slot = slots[index] ?? null;

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

  const pointsSoFar = slots.reduce((n, s) => n + (s.reveal?.points ?? 0), 0);
  const anyRevealed = slots.some((s) => s.reveal);
  const hud: PtRunHud | null = run ? {
    pointsSoFar: anyRevealed ? pointsSoFar : null,
    outcomes: slots.map((s) => s.outcome),
    patchLabel: run.deal.data_label.patch_label,
    patchSource: run.deal.data_label.patch_source,
  } : null;

  const model: PtStageModel = {
    // A resume keeps the ability on screen; only the first deal has nothing to show.
    round: stage.kind === "dealing" || stage.kind === "deal-error" ? (run ? roundView : null) : roundView,
    phase,
    press: engine.press,
    statusText,
    reveal: stage.kind === "revealed" ? slot?.reveal ?? null : null,
    onNext: onReveal,
    hud,
  };

  const summary: PtRunSummary | null = run && stage.kind === "complete" ? {
    rounds: slots.map((s, i) => ({ round: toSliceRoundView(run.deal, i, manifest), reveal: s.reveal })),
    totalPoints: pointsSoFar,
    patchLabel: run.deal.data_label.patch_label,
    patchSource: run.deal.data_label.patch_source,
  } : null;

  const actionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (stage.kind === "voided" || stage.kind === "lock-error" || stage.kind === "deal-error") actionRef.current?.focus({ preventScroll: true });
  }, [stage.kind]);

  const lastStage = index + 1 >= SLICE_STAGES;
  const nextLabel = lastStage ? "See results" : "Next stage";
  const actions = stage.kind === "voided" ? (
    <button ref={actionRef} type="button" data-testid="pt-continue" onClick={advance} className="pt-btn">{nextLabel}</button>
  ) : stage.kind === "lock-error" ? (
    <>
      {stage.retryable ? <button ref={actionRef} type="button" data-testid="pt-retry-lock" onClick={retryLock} className="pt-btn">Retry submission</button> : null}
      <button ref={stage.retryable ? undefined : actionRef} type="button" data-testid="pt-void-continue" onClick={voidAndAdvance} className="pt-btn">
        {stage.retryable ? "Void stage" : nextLabel}
      </button>
    </>
  ) : stage.kind === "deal-error" ? (
    stage.resumeFrom !== null && !stage.fresh ? (
      <button ref={actionRef} type="button" data-testid="pt-retry-deal" onClick={() => void resume(stage.resumeFrom ?? 0)} className="pt-btn">Try again</button>
    ) : (
      <button ref={actionRef} type="button" data-testid={run ? "pt-new-slice" : "pt-retry-deal"} onClick={() => void startSlice()} className="pt-btn">
        {run ? "New slice" : "Try again"}
      </button>
    )
  ) : null;

  const bar = (
    <PerfectTimingBar
      lead={lead}
      index={stage.kind === "complete" ? total : run ? index + 1 : 0}
      total={total}
      outcomes={hud?.outcomes}
      points={anyRevealed ? pointsSoFar : null}
    />
  );

  return (
    <PerfectTimingScreen bar={bar} art={roundView?.splashUrl ?? null} stage={stage.kind}>
      {summary ? (
        <PerfectTimingResults summary={summary} onPlayAgain={() => void startSlice()} onExit={onChangeMode} exitLabel="Change mode" />
      ) : (
        <PerfectTimingArena model={model} actions={actions} nextLabel={lastStage ? "See results" : "Next stage"} />
      )}
    </PerfectTimingScreen>
  );
}
