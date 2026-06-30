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
 *   transition  — reset to neutral; SceneSlider owns this transition
 *   idle        — reset to neutral
 *   questionId Δ — hard reset before new phase RAF starts
 */

import { useEffect } from "react";
import { useMotionValue } from "framer-motion";
import type { MotionValue } from "framer-motion";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";

const B_LAUNCH = 0.15;
const B_IMPACT = 0.28;
const B_SETTLE = 0.55;
const B_NAME   = 0.58;

function easeIn3(t: number)    { return t * t * t; }
function easeOut3(t: number)   { return 1 - (1 - t) ** 3; }
function easeInOut3(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

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

  // MotionValues are stable refs and intentionally excluded from deps.
  // questionId is included so a question change immediately resets all values
  // before the new phase RAF starts — prevents stale reveal state from one
  // question bleeding into the next question's first frame.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // ── REVEAL / EXPLANATION ──────────────────────────────────────────────
    // transition is intentionally excluded: SceneSlider owns question-to-question
    // movement; the timeline must be neutral so old reveal state does not bleed
    // into the new question's first frame.
    if (phase === "reveal" || phase === "explanation") {
      const tick = () => {
        const now = Date.now();
        const elapsed = Math.max(0, now - phaseStartedAt);

        // During explanation hold the reveal at its fully-settled state (t=1).
        const t =
          phase === "reveal" && phaseDurationMs > 0
            ? Math.min(1, elapsed / phaseDurationMs)
            : 1;

        const launchT = Math.min(1, t / B_LAUNCH);
        const impactT = Math.max(0, Math.min(1, (t - B_LAUNCH) / (B_IMPACT - B_LAUNCH)));
        const settleT = Math.max(0, Math.min(1, (t - B_IMPACT) / (B_SETTLE - B_IMPACT)));
        const nameT   = Math.max(0, Math.min(1, (t - B_NAME)   / (1 - B_NAME)));

        if (isSpoiler) {
          // ── Full cinematic sequence ─────────────────────────────

          // Content exit
          const cExit = easeIn3(launchT);
          if (!isShorts) {
            contentX.set(cExit * 52);
            contentOpacity.set(Math.max(0, 1 - cExit * 1.25));
            qrX.set(cExit * 36);
            qrOpacity.set(Math.max(0, 1 - launchT * 2));
          } else {
            contentY.set(cExit * 85);
            contentOpacity.set(Math.max(0, 1 - cExit * 1.25));
            qrY.set(cExit * 70);
            qrOpacity.set(Math.max(0, 1 - launchT * 2));
          }

          // Scene push-in: build through launch, peak at impact, settle back
          const maxScale = 1.08;
          let scale: number;
          if (t < B_LAUNCH) {
            scale = 1 + easeIn3(launchT) * (maxScale - 1) * 0.55;
          } else if (t < B_IMPACT) {
            scale = 1 + (maxScale - 1) * (0.55 + impactT * 0.45);
          } else if (t < B_SETTLE) {
            scale = maxScale - easeOut3(settleT) * (maxScale - 1);
          } else {
            scale = 1;
          }
          sceneScale.set(scale);

          // Camera pan toward subject (16:9 only) + brief shake at impact
          const panTarget = isShorts ? 0 : 5.2;
          const panProgress = easeInOut3(Math.min(1, t / B_SETTLE));
          const shakeEnd = B_LAUNCH + 0.065;
          let shake = 0;
          if (t >= B_LAUNCH && t < shakeEnd) {
            const st = (t - B_LAUNCH) / (shakeEnd - B_LAUNCH);
            shake = Math.sin(st * Math.PI * 13) * (1 - st) * 0.4;
          }
          sceneX.set(panTarget * panProgress + shake);

          // Subject panel size: expand to fill as camera pushes in
          const sizeT = easeOut3(Math.min(1, t / B_SETTLE));
          if (!isShorts) {
            subjectWidthPct.set(28 + sizeT * 54); // 28 → 82%
          } else {
            subjectHeightPct.set(34 + sizeT * 28); // 34 → 62%
          }

          // Subject card breathing after settle
          const breathAmp = t >= B_SETTLE ? 0.016 : 0;
          const breathScale = 1 + Math.sin((now / 4200) * Math.PI * 2) * breathAmp;
          subjectScale.set(breathScale);

          // Darkness: build, peak at impact, soften at settle, hold ambient
          const darkPeak = 0.52;
          let dark: number;
          if (t < B_LAUNCH) {
            dark = easeIn3(launchT) * darkPeak;
          } else if (t < B_IMPACT) {
            dark = darkPeak;
          } else if (t < B_SETTLE) {
            dark = darkPeak - easeOut3(settleT) * darkPeak * 0.55;
          } else {
            dark = darkPeak * 0.42;
          }
          darkness.set(dark);

          // Name card
          nameOpacity.set(easeOut3(nameT));

        } else {
          // ── Non-spoiler: gentle highlight mode ─────────────────
          // Content stays visible, only a subtle scale + dim.
          contentX.set(0);
          contentY.set(0);
          contentOpacity.set(1);
          qrX.set(0);
          qrY.set(0);
          qrOpacity.set(Math.max(0.6, 1 - easeIn3(launchT) * 0.4));
          subjectWidthPct.set(28);
          subjectHeightPct.set(34);
          subjectScale.set(1);
          sceneScale.set(1 + easeInOut3(Math.min(1, t / B_SETTLE)) * 0.018);
          sceneX.set(0);
          darkness.set(easeIn3(launchT) * 0.1);
          nameOpacity.set(0);
        }

        // reveal: tick until t=1; explanation: keep ticking for subject breathing
        if (phase === "reveal" && t < 1) raf = requestAnimationFrame(tick);
        else if (phase === "explanation") raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);

    // ── QUESTION ────────────────────────────────────────────────────────
    } else if (phase === "question") {
      reset();

      const tick = () => {
        const now = Date.now();
        const elapsed = Math.max(0, now - phaseStartedAt);
        const remaining = phaseDurationMs > 0 ? phaseDurationMs - elapsed : Infinity;

        // Idle breath on subject
        const breath = Math.sin((now / 5200) * Math.PI * 2) * 0.013;
        idleBreath.set(breath);
        subjectScale.set(1 + breath);

        // Pre-launch tension: build very gently in the final 3 seconds
        const WINDOW = 3000;
        if (remaining > 0 && remaining <= WINDOW) {
          const preT = easeIn3(1 - remaining / WINDOW);
          sceneScale.set(1 + preT * 0.024);
          darkness.set(preT * 0.14);
        } else if (remaining > 0) {
          sceneScale.set(1);
          darkness.set(0);
        }

        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);

    // ── TRANSITION / IDLE / OTHER ────────────────────────────────────────
    // transition: SceneSlider owns this; reset to neutral so old reveal state
    // does not appear on the incoming question's first frame.
    } else {
      reset();
    }

    return () => cancelAnimationFrame(raf);
  }, [phase, phaseStartedAt, phaseDurationMs, isSpoiler, isShorts, questionId]);

  return {
    sceneScale, sceneX,
    contentX, contentY, contentOpacity,
    qrX, qrY, qrOpacity,
    subjectWidthPct, subjectHeightPct, subjectScale,
    darkness, nameOpacity, idleBreath,
  };
}
