/**
 * Frame → broadcast-phase mapping for the video export.
 *
 * The live broadcast drives FX from (phase, phaseStartedAt, phaseDurationMs)
 * wall-clock state; the video derives the equivalent values from the shared
 * deterministic timeline (../timing.ts). All FX ports consume this shape so
 * their formulas can stay byte-for-byte identical to the live components.
 */
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";
import type { QuestionTimeline } from "../timing";

export interface VideoPhaseState {
  phase: BroadcastPhase;
  /** ms since the current phase began. */
  phaseElapsedMs: number;
  /** Duration of the current phase in ms (0 when open-ended). */
  phaseDurationMs: number;
  /** ms until the reveal moment (Infinity once revealed). */
  remainingToRevealMs: number;
  /** ms since the reveal moment (negative before reveal). */
  sinceRevealMs: number;
  /** ms since this question's sequence started — continuous local clock. */
  localMs: number;
}

/** Map a frame (local to the question <Sequence>) onto broadcast phase state. */
export function videoPhaseAt(frame: number, fps: number, tl: QuestionTimeline): VideoPhaseState {
  const ms = (f: number) => (f / fps) * 1000;
  const choicesAt = tl.choicesFrame - tl.startFrame;
  const revealAt = tl.revealFrame - tl.startFrame;
  const explanationAt = tl.explanationFrame - tl.startFrame;
  const outAt = tl.outFrame - tl.startFrame;

  const localMs = ms(frame);

  if (frame < revealAt) {
    // Live "question" phase == choices visible + countdown running.
    return {
      phase: "question",
      phaseElapsedMs: ms(frame - choicesAt),
      phaseDurationMs: ms(revealAt - choicesAt),
      remainingToRevealMs: ms(revealAt - frame),
      sinceRevealMs: -ms(revealAt - frame),
      localMs,
    };
  }
  if (frame < explanationAt) {
    return {
      phase: "reveal",
      phaseElapsedMs: ms(frame - revealAt),
      phaseDurationMs: ms(explanationAt - revealAt),
      remainingToRevealMs: Infinity,
      sinceRevealMs: ms(frame - revealAt),
      localMs,
    };
  }
  if (frame < outAt) {
    return {
      phase: "explanation",
      phaseElapsedMs: ms(frame - explanationAt),
      phaseDurationMs: ms(outAt - explanationAt),
      remainingToRevealMs: Infinity,
      sinceRevealMs: ms(frame - revealAt),
      localMs,
    };
  }
  return {
    phase: "transition",
    phaseElapsedMs: ms(frame - outAt),
    phaseDurationMs: ms(tl.endFrame - tl.startFrame - outAt),
    remainingToRevealMs: Infinity,
    sinceRevealMs: ms(frame - revealAt),
    localMs,
  };
}

/**
 * The shared "pulse" curve every core/crystal effect keys off — ported 1:1
 * from BroadcastKnowledgeCore / SvgCrystalCore:
 *   question:    0→1 over the final 3 s of the countdown
 *   reveal:      1.0 held 550 ms, then decays over 1400 ms
 *   explanation/transition: starts 0.38, fades over 5 s
 */
export function corePulse(s: VideoPhaseState): number {
  if (s.phase === "question") {
    if (s.remainingToRevealMs < 3000) return 1 - s.remainingToRevealMs / 3000;
    return 0;
  }
  if (s.phase === "reveal") {
    const e = s.phaseElapsedMs;
    return e < 550 ? 1.0 : Math.max(0, 1 - (e - 550) / 1400);
  }
  // explanation / transition
  return Math.max(0, 0.38 - s.phaseElapsedMs / 5000);
}

/**
 * Overload curve (crest conduction + environment cracks) — ported 1:1 from
 * BroadcastKnowledgeCore / HextechOverloadFX:
 *   5s→3s before reveal: 0→0.35;  3s→0: 0.35→1
 *   reveal: flash 250 ms then dissipates over 700 ms
 */
export function coreOverload(s: VideoPhaseState): number {
  if (s.phase === "question") {
    const rem = s.remainingToRevealMs;
    if (rem < 3000) return 0.35 + (1 - rem / 3000) * 0.65;
    if (rem < 5000) return ((5000 - rem) / 2000) * 0.35;
    return 0;
  }
  if (s.phase === "reveal") {
    const e = s.phaseElapsedMs;
    return e < 250 ? 1 : Math.max(0, 1 - (e - 250) / 700);
  }
  return 0;
}
