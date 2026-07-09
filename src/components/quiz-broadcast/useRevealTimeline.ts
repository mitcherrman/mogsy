/**
 * useRevealTimeline — Broadcast Camera Timeline V1
 *
 * Single RAF loop that drives all reveal animation via framer-motion MotionValues.
 * Components read these values through `style={{ }}` props on motion.div — no
 * React re-renders happen during the animation sequence.
 *
 * Proportional beats (fraction of revealMs):
 *   Launch  0–15%   content exits, vignette builds, camera begins push
 *   Impact  15–28%  peak push, brief camera shake
 *   Settle  28–55%  camera eases back, splash fills frame
 *   Name    ~58%    name card fades in
 *   Hold    58–100% scene breathes
 *
 * Phase ownership:
 *   question    — idle breathing + pre-launch tension (final 3 s)
 *   reveal      — run cinematic sequence for current question
 *   explanation — hold at fully-revealed state, subject breathes
 *   transition  — same question: hold revealed state while SceneSlider exits
 *               new questionId: hard reset before new question enters
 *   idle        — reset to neutral
 *   questionId Δ — hard reset before new phase RAF starts
 */

import { useEffect, useRef } from "react";
import { useMotionValue } from "framer-motion";
import type { MotionValue } from "framer-motion";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";
// All camera math lives in revealTimelineMath so the Remotion video export
// runs the EXACT same choreography with frame-derived time.
import {
  computeQuestionPose,
  computeRevealPose,
  revealTFor,
  type RevealPose,
} from "./revealTimelineMath";

export interface RevealTimeline {
  /** Whole-scene push-in scale (camera zoom). Also carries pre-launch tension. */
  sceneScale: MotionValue<number>;
  /** Whole-scene X pan in vw units. Pans toward subject during reveal; includes shake impulse. */
  sceneX: MotionValue<number>;
  /** Question + answer panel: horizontal exit (vw, 16:9). */
  contentX: MotionValue<number>;
  /** Question + answer panel: vertical exit (%, 9:16). */
  contentY: MotionValue<number>;
  contentOpacity: MotionValue<number>;
  /** QR / CTA panel horizontal exit (vw, 16:9). */
  qrX: MotionValue<number>;
  /** QR / CTA panel vertical exit (%, 9:16). */
  qrY: MotionValue<number>;
  qrOpacity: MotionValue<number>;
  /** Subject column width in % — animates 28 → 82 on spoiler reveal (16:9). */
  subjectWidthPct: MotionValue<number>;
  /** Subject row height in % — animates 34 → 62 on spoiler reveal (9:16). */
  subjectHeightPct: MotionValue<number>;
  /** Scale applied to the subject panel wrapper. Expands during reveal, breathes during hold. */
  subjectScale: MotionValue<number>;
  /** Black overlay opacity for cinematic darkness / vignette. */
  darkness: MotionValue<number>;
  /** Name card opacity — 0 until the name stage of the reveal. */
  nameOpacity: MotionValue<number>;
  /** Slow breathing offset used during the question phase idle state. */
  idleBreath: MotionValue<number>;
}

export function useRevealTimeline({
  phase,
  phaseStartedAt,
  phaseDurationMs,
  isSpoiler,
  isShorts,
  questionId,
}: {
  phase: BroadcastPhase;
  phaseStartedAt: number;
  phaseDurationMs: number;
  /** True when the subject is a spoiler that should be hidden until reveal. */
  isSpoiler: boolean;
  isShorts: boolean;
  /** Scopes the timeline to a single question. When questionId changes, all
   *  MotionValues are immediately reset to neutral before the new phase starts. */
  questionId: string;
}): RevealTimeline {
  const sceneScale       = useMotionValue(1);
  const sceneX           = useMotionValue(0);
  const contentX         = useMotionValue(0);
  const contentY         = useMotionValue(0);
  const contentOpacity   = useMotionValue(1);
  const qrX              = useMotionValue(0);
  const qrY              = useMotionValue(0);
  const qrOpacity        = useMotionValue(1);
  const subjectWidthPct  = useMotionValue(28);
  const subjectHeightPct = useMotionValue(34);
  const subjectScale     = useMotionValue(1);
  const darkness         = useMotionValue(0);
  const nameOpacity      = useMotionValue(0);
  const idleBreath       = useMotionValue(0);

  // Tracks the questionId from the previous effect run so we can distinguish
  // "same question changing phase" from "new question mounted".
  const prevQuestionIdRef = useRef(questionId);

  // MotionValues are stable refs and intentionally excluded from deps.
  // questionId is included so that when the question changes the effect re-runs,
  // the ref mismatch is detected, and all MotionValues hard-reset to neutral
  // before the new question's phase RAF starts.
  useEffect(() => {
    let raf = 0;

    const reset = () => {
      sceneScale.set(1);
      sceneX.set(0);
      contentX.set(0);
      contentY.set(0);
      contentOpacity.set(1);
      qrX.set(0);
      qrY.set(0);
      qrOpacity.set(1);
      subjectWidthPct.set(28);
      subjectHeightPct.set(34);
      subjectScale.set(1);
      darkness.set(0);
      nameOpacity.set(0);
      idleBreath.set(0);
    };

    // Hard reset when the question changes. This fires before any phase RAF
    // starts, ensuring the new question always enters with neutral MotionValues.
    const questionChanged = questionId !== prevQuestionIdRef.current;
    prevQuestionIdRef.current = questionId;
    if (questionChanged) reset();

    // ── REVEAL / EXPLANATION / TRANSITION (same question) ─────────────────
    // transition with the same questionId = old question is still on screen
    // inside SceneSlider's exit animation; keep it in revealed/settled state
    // so it doesn't snap back to question layout mid-exit.
    // A new questionId already hard-reset above; the new question then enters
    // whichever phase the engine is in (typically "question" → idle breathing).
    const applyPose = (pose: RevealPose) => {
      sceneScale.set(pose.sceneScale);
      sceneX.set(pose.sceneX);
      contentX.set(pose.contentX);
      contentY.set(pose.contentY);
      contentOpacity.set(pose.contentOpacity);
      qrX.set(pose.qrX);
      qrY.set(pose.qrY);
      qrOpacity.set(pose.qrOpacity);
      subjectWidthPct.set(pose.subjectWidthPct);
      subjectHeightPct.set(pose.subjectHeightPct);
      subjectScale.set(pose.subjectScale);
      darkness.set(pose.darkness);
      nameOpacity.set(pose.nameOpacity);
      idleBreath.set(pose.idleBreath);
    };

    if (phase === "reveal" || phase === "explanation" || phase === "transition") {
      const tick = () => {
        const now = Date.now();
        const elapsed = Math.max(0, now - phaseStartedAt);

        // During explanation hold the reveal at its fully-settled state (t=1).
        const t = revealTFor(phase, elapsed, phaseDurationMs);
        applyPose(computeRevealPose({ t, nowMs: now, isSpoiler, isShorts }));

        // reveal: tick until t=1; explanation/transition: keep ticking for subject breathing
        if (phase === "reveal" && t < 1) raf = requestAnimationFrame(tick);
        else if (phase === "explanation" || phase === "transition") raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);

    // ── QUESTION ────────────────────────────────────────────────────────
    } else if (phase === "question") {
      reset();

      const tick = () => {
        const now = Date.now();
        const elapsed = Math.max(0, now - phaseStartedAt);
        const remaining = phaseDurationMs > 0 ? phaseDurationMs - elapsed : Infinity;

        // Idle breathing + pre-launch tension in the final 3 s. The old
        // full-screen darkness fade is gone — HextechOverloadFX provides a
        // localized vignette around the Knowledge Core instead.
        if (remaining > 0) {
          applyPose(computeQuestionPose({ nowMs: now, remainingMs: remaining }));
        } else {
          const breathPose = computeQuestionPose({ nowMs: now, remainingMs: Infinity });
          idleBreath.set(breathPose.idleBreath);
          subjectScale.set(breathPose.subjectScale);
        }

        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);

    // ── IDLE / OTHER ────────────────────────────────────────────────────
    } else {
      reset();
    }

    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, phaseStartedAt, phaseDurationMs, isSpoiler, isShorts, questionId]);

  return {
    sceneScale, sceneX,
    contentX, contentY, contentOpacity,
    qrX, qrY, qrOpacity,
    subjectWidthPct, subjectHeightPct, subjectScale,
    darkness, nameOpacity, idleBreath,
  };
}
