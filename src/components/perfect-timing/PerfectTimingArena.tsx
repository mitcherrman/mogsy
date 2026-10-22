/**
 * PERFECT TIMING — THE ARENA: the stage or the reveal inside the fixed screen.
 *
 * The page owns every value in the model; this component reads it, draws it,
 * and is the ONE owner of the mode's sound: the module-start cue when a round
 * is armed, the verdict by tier on reveal, and (PT5.2) the chronometer's own
 * voice — the cast, one restrained tick per whole elapsed second while it
 * runs (a brighter mark every fifth), and the lock.
 *
 * PT5.3 — the BLIND flow (`model.flow`): the count-in's voices (3 and 2, then
 * a stronger 1 — the quiz countdown's own voices), the cast as the game starts
 * the round, the lock and the verdict. Nothing at all sounds while the round
 * runs: no tick, no mark. The round's old start cue is replaced by the count-in.
 * The reveal moves on by itself after `REVEAL_DWELL_MS` unless the run is held.
 *
 * PT4.4: it no longer mounts Ranked's `CanonicalArena` (whose header, flanks and
 * round rail made the page taller than the viewport). The frame is
 * `PerfectTimingScreen`; this draws what goes in it.
 */
import { useCallback, useEffect, useReducer, useRef, type ReactNode } from "react";
import { mogzyAudio } from "@/lib/audio/engine";
import { useSfx } from "@/lib/audio/useSfx";
import type { SecondBeat } from "@/lib/perfect-timing/chronometer";
import { countInIsFinal } from "@/lib/perfect-timing/countIn";
import type { PtStageModel } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingReveal } from "./PerfectTimingReveal";
import { PerfectTimingHero, PerfectTimingStage } from "./PerfectTimingStage";
import { LOCK_HOLD_MS, REVEAL_DWELL_MS, tierSfx } from "./presentation";
import "./perfectTiming.css";

/**
 * A suspended context would RESUME and then render — late. A tick that lands
 * after its second is worse than none, so a tick is never queued (the quiz
 * countdown's rule, MISC W2D): skipped here when the engine reports a
 * suspended context, and dropped by the engine itself (`dropIfNotRunning`)
 * when the context is not running at the moment it would render. The cast and
 * the lock are the player's own gesture, which unlocks the context, so they
 * may resume it.
 */
function contextSuspended(): boolean {
  try {
    return mogzyAudio.getSfx()?.getSnapshot().contextState === "suspended";
  } catch {
    return false;
  }
}

/**
 * The phase-edge cues, and the chronometer's tick. Every cue carries an event
 * id unique to its round (and second), so the engine's dedupe — not this
 * component — is what makes a re-render, a StrictMode double effect or a
 * remount unable to replay one.
 */
function usePerfectTimingSfx(model: PtStageModel) {
  const sfx = useSfx();
  const last = useRef<{ phase: PtStageModel["phase"]; roundId: string | null }>({ phase: model.phase, roundId: null });
  useEffect(() => {
    const prev = last.current;
    const roundId = model.round?.roundId ?? null;
    last.current = { phase: model.phase, roundId };
    if (prev.phase === model.phase && prev.roundId === roundId) return;
    if (model.phase === "armed" && (prev.phase !== "armed" || prev.roundId !== roundId)) {
      sfx.play("ranked.module.start", { eventId: `perfect-timing:${roundId ?? "round"}:start` });
    } else if (model.phase === "running" && prev.phase === "armed" && prev.roundId === roundId) {
      sfx.play("perfect-timing.cast", { eventId: `perfect-timing:${roundId ?? "round"}:cast` });
    } else if (model.phase === "running" && prev.phase === "countdown" && prev.roundId === roundId) {
      // PT5.3: the GAME started it — the cast is the start cue itself, so it is
      // never played late (a suspended context drops it rather than resuming).
      if (!contextSuspended()) sfx.play("perfect-timing.cast", { eventId: `perfect-timing:${roundId ?? "round"}:cast`, dropIfNotRunning: true });
    } else if (model.phase === "stopped" && prev.phase === "running") {
      sfx.play("perfect-timing.lock", { eventId: `perfect-timing:${roundId ?? "round"}:lock` });
    } else if (model.phase === "revealed" && prev.phase !== "revealed" && model.reveal) {
      sfx.play(tierSfx(model.reveal.tier), { eventId: `perfect-timing:${roundId ?? "round"}:verdict` });
    }
  }, [model.phase, model.round?.roundId, model.reveal, sfx]);

  // PT5.3: the count-in. One voice per beat of each pass (a re-count after a
  // hold or a hidden tab is a new pass); pre-start only, and never late.
  const countIn = model.flow?.countIn ?? null;
  const countInId = model.flow?.countInId ?? null;
  const countingIn = model.phase === "countdown" && !model.flow?.held;
  const lastCountIn = useRef<string | null>(null);
  useEffect(() => {
    if (!countingIn || countIn === null || countInId === null) return;
    const eventId = `perfect-timing:${countInId}:countin:${countIn}`;
    // Each beat of each pass is answered once here (and once by the engine's own dedupe).
    if (lastCountIn.current === eventId) return;
    lastCountIn.current = eventId;
    if (contextSuspended()) return;
    sfx.play(countInIsFinal(countIn) ? "perfect-timing.countin.final" : "perfect-timing.countin", { eventId, dropIfNotRunning: true });
  }, [countingIn, countIn, countInId, sfx]);

  // The tick. Only a running round's beat sounds: the chronometer stops its
  // frame loop on every other phase, and this re-checks the phase it last saw.
  const phaseRef = useRef(model.phase);
  phaseRef.current = model.phase;
  return useCallback((beat: SecondBeat) => {
    if (phaseRef.current !== "running" || contextSuspended()) return;
    sfx.play(beat.mark ? "perfect-timing.clock.mark" : "perfect-timing.clock.tick", { eventId: beat.eventId, dropIfNotRunning: true });
  }, [sfx]);
}

/**
 * PT5.2: the frozen chronometer stays on screen for at least `LOCK_HOLD_MS`
 * after the stop, so the lock (and its flash) reads before the reveal takes
 * the stage — a fast server would otherwise swap it out within a frame or two.
 * Presentation only: the lock request went out at the stop, and the reveal's
 * own timing starts when it mounts. A round first seen already revealed is
 * never held.
 */
function useLockHold(model: PtStageModel): PtStageModel {
  const roundId = model.round?.roundId ?? null;
  const lockedAt = useRef<{ roundId: string | null; at: number } | null>(null);
  if ((model.phase === "stopped" || model.phase === "submitting") && lockedAt.current?.roundId !== roundId) {
    lockedAt.current = { roundId, at: performance.now() };
  }
  const since = lockedAt.current && lockedAt.current.roundId === roundId ? performance.now() - lockedAt.current.at : Infinity;
  const left = model.phase === "revealed" ? LOCK_HOLD_MS - since : 0;
  const holding = left > 0;
  const [woken, wake] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!holding) return;
    // +1 ms: a timer may fire a hair before `performance.now()` agrees the hold is over (the two
    // round differently). If it does, the wake finds the hold still on and this effect re-arms
    // (`woken` changed) — before PT5.3A it did not, and the reveal could stay hidden for good.
    const t = window.setTimeout(wake, Math.max(0, left) + 1);
    return () => window.clearTimeout(t);
    // `left` is read once per arming; a re-render for any other reason must not re-arm the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding, roundId, woken]);
  return holding ? { ...model, phase: "submitting", reveal: null } : model;
}

export function PerfectTimingArena({ model, actions, nextLabel, autoFocusSeal }: {
  model: PtStageModel;
  /** Recovery buttons for a voided or failed round, drawn under the status line. */
  actions?: ReactNode;
  /** The reveal's way-on label; default "Next round", or "See results" on the last round. */
  nextLabel?: string;
  /** Force the seal to take focus when the stage mounts (a Mastery Slice transition's Continue just unmounted under the keyboard). */
  autoFocusSeal?: boolean;
}) {
  const shown = useLockHold(model);
  const onClockBeat = usePerfectTimingSfx(shown);
  // The phase drawn last: a round armed straight after a reveal (or a voided
  // round) has just taken the player's focused control away.
  const prevPhase = useRef<PtStageModel["phase"] | null>(null);
  const cameFrom = prevPhase.current;
  useEffect(() => { prevPhase.current = model.phase; });

  const focusSeal = autoFocusSeal ?? ((model.phase === "armed" || model.phase === "countdown") && (cameFrom === "revealed" || cameFrom === "interrupted" || cameFrom === "error"));
  const lastRound = model.round !== null && model.round.index >= model.round.total;

  if (shown.phase === "revealed" && model.reveal) {
    return (
      <div className="pt-stage" data-testid="pt-reveal-stage" data-phase="revealed" data-tier={model.reveal.tier}>
        <PerfectTimingHero round={model.round} compact />
        <div className="pt-column">
          <PerfectTimingReveal key={model.round?.roundId ?? "reveal"} reveal={model.reveal} onNext={model.onNext}
            nextLabel={nextLabel ?? (lastRound ? "See results" : "Next round")}
            autoAdvanceMs={model.flow ? REVEAL_DWELL_MS : null} held={model.flow?.held ?? false} onHold={model.flow?.onHold} />
        </div>
      </div>
    );
  }
  return (
    <PerfectTimingStage key={model.round?.roundId ?? "stage"} round={model.round} phase={shown.phase} press={model.press}
      statusText={model.statusText ?? null} actions={actions} autoFocusSeal={focusSeal}
      clock={model.clock ?? null} onClockBeat={model.flow ? undefined : onClockBeat} flow={model.flow ?? null} />
  );
}
