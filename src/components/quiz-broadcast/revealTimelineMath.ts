/**
 * revealTimelineMath — the pure math behind the Broadcast Camera Timeline.
 *
 * Extracted verbatim from useRevealTimeline's RAF tick so BOTH consumers use
 * the exact same choreography:
 *   - useRevealTimeline (live broadcast): calls computeRevealPose /
 *     computeQuestionPose every animation frame with wall-clock time.
 *   - src/video (Remotion export): calls them with frame-derived time, giving
 *     a deterministic, frame-accurate copy of the live camera moves.
 *
 * Do not tune reveal timing here without checking both surfaces — this file
 * IS the broadcast's camera language.
 */
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";

export const B_LAUNCH = 0.15;
export const B_IMPACT = 0.28;
export const B_SETTLE = 0.55;
export const B_NAME   = 0.66;

export function easeIn3(t: number)    { return t * t * t; }
export function easeOut3(t: number)   { return 1 - (1 - t) ** 3; }
export function easeInOut3(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** All camera/layout drive values for one instant. Matches the MotionValue
 *  set exposed by useRevealTimeline. */
export interface RevealPose {
  sceneScale: number;
  sceneX: number;        // vw
  contentX: number;      // vw (16:9 exit)
  contentY: number;      // %  (9:16 exit)
  contentOpacity: number;
  qrX: number;           // vw
  qrY: number;           // %
  qrOpacity: number;
  subjectWidthPct: number;   // 28 → 88 (16:9)
  subjectHeightPct: number;  // 34 → 68 (9:16)
  subjectScale: number;
  darkness: number;
  nameOpacity: number;
  idleBreath: number;
}

export const NEUTRAL_POSE: RevealPose = {
  sceneScale: 1,
  sceneX: 0,
  contentX: 0,
  contentY: 0,
  contentOpacity: 1,
  qrX: 0,
  qrY: 0,
  qrOpacity: 1,
  subjectWidthPct: 28,
  subjectHeightPct: 34,
  subjectScale: 1,
  darkness: 0,
  nameOpacity: 0,
  idleBreath: 0,
};

/**
 * Pose during reveal / explanation / transition.
 * @param t      Reveal progress 0–1 (explanation/transition hold at 1).
 * @param nowMs  Clock used only for breathing oscillation (wall-clock live,
 *               frame-derived in the video export).
 */
export function computeRevealPose({
  t,
  nowMs,
  isSpoiler,
  isShorts,
}: {
  t: number;
  nowMs: number;
  isSpoiler: boolean;
  isShorts: boolean;
}): RevealPose {
  const pose = { ...NEUTRAL_POSE };

  const launchT = Math.min(1, t / B_LAUNCH);
  const impactT = Math.max(0, Math.min(1, (t - B_LAUNCH) / (B_IMPACT - B_LAUNCH)));
  const settleT = Math.max(0, Math.min(1, (t - B_IMPACT) / (B_SETTLE - B_IMPACT)));
  const nameT   = Math.max(0, Math.min(1, (t - B_NAME)   / (1 - B_NAME)));

  if (isSpoiler) {
    // ── Full cinematic sequence ─────────────────────────────
    const cExit = easeIn3(launchT);
    if (!isShorts) {
      pose.contentX = cExit * 52;
      pose.contentOpacity = Math.max(0, 1 - cExit * 1.25);
      pose.qrX = cExit * 36;
      pose.qrOpacity = Math.max(0, 1 - launchT * 2.8);
    } else {
      pose.contentY = cExit * 85;
      pose.contentOpacity = Math.max(0, 1 - cExit * 1.25);
      pose.qrY = cExit * 70;
      pose.qrOpacity = Math.max(0, 1 - launchT * 2.8);
    }

    // Scene push-in: build through launch, peak at impact, settle back
    const maxScale = 1.14;
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
    pose.sceneScale = scale;

    // Camera pan toward subject (16:9 only) + brief shake at impact
    const panTarget = isShorts ? 0 : 5.2;
    const panProgress = easeInOut3(Math.min(1, t / B_SETTLE));
    const shakeEnd = B_LAUNCH + 0.065;
    let shake = 0;
    if (t >= B_LAUNCH && t < shakeEnd) {
      const st = (t - B_LAUNCH) / (shakeEnd - B_LAUNCH);
      shake = Math.sin(st * Math.PI * 13) * (1 - st) * 0.4;
    }
    pose.sceneX = panTarget * panProgress + shake;

    // Subject panel size: expand to fill as camera pushes in
    const sizeT = easeOut3(Math.min(1, t / B_SETTLE));
    if (!isShorts) {
      pose.subjectWidthPct = 28 + sizeT * 60; // 28 → 88%
    } else {
      pose.subjectHeightPct = 34 + sizeT * 34; // 34 → 68%
    }

    // Subject card breathing after settle
    const breathAmp = t >= B_SETTLE ? 0.022 : 0;
    pose.subjectScale = 1 + Math.sin((nowMs / 4200) * Math.PI * 2) * breathAmp;

    // Darkness: build, peak at impact, soften at settle, hold ambient
    const darkPeak = 0.42;
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
    pose.darkness = dark;

    // Name card
    pose.nameOpacity = easeOut3(nameT);
  } else {
    // ── Non-spoiler: gentle highlight mode ─────────────────
    pose.qrOpacity = Math.max(0.6, 1 - easeIn3(launchT) * 0.4);
    pose.sceneScale = 1 + easeInOut3(Math.min(1, t / B_SETTLE)) * 0.018;
    pose.darkness = easeIn3(launchT) * 0.1;
  }

  return pose;
}

/**
 * Pose during the question phase: idle breathing + pre-launch tension in the
 * final 3 seconds of the countdown.
 * @param remainingMs Time left in the question phase (Infinity when unknown).
 */
export function computeQuestionPose({
  nowMs,
  remainingMs,
}: {
  nowMs: number;
  remainingMs: number;
}): RevealPose {
  const pose = { ...NEUTRAL_POSE };

  // Idle breath on subject
  const breath = Math.sin((nowMs / 5200) * Math.PI * 2) * 0.013;
  pose.idleBreath = breath;
  pose.subjectScale = 1 + breath;

  // Pre-launch tension: gentle scale build in the final 3 seconds.
  const WINDOW = 3000;
  if (remainingMs > 0 && remainingMs <= WINDOW) {
    const preT = easeIn3(1 - remainingMs / WINDOW);
    pose.sceneScale = 1 + preT * 0.024;
  }

  return pose;
}

/** Shared reveal progress → phase mapping used by both surfaces. */
export function revealTFor(phase: BroadcastPhase, elapsedMs: number, phaseDurationMs: number): number {
  return phase === "reveal" && phaseDurationMs > 0
    ? Math.min(1, Math.max(0, elapsedMs) / phaseDurationMs)
    : 1;
}
