/**
 * KnowledgeCoreConfig — visual constants and cycle logic for BroadcastKnowledgeCore.
 *
 * The Knowledge Core grows through 3 glow cycles as questions are answered:
 *   Cycle 1  Q 1–10   Low Glow    — ancient, stable, quietly waiting
 *   Cycle 2  Q 11–20  Medium Glow — awake, charging, energetic
 *   Cycle 3  Q 21+    Max Glow    — overcharged, intense, barely contained
 *
 * All visual parameters are continuous floats. lerpCycleVisuals() smoothly
 * interpolates across the full progression so there are no hard visual jumps.
 */

export type KnowledgeProgression = "longform" | "shorts" | "manual";
export type CycleNumber = 1 | 2 | 3;

export interface CycleVisuals {
  /** Overall glow brightness 0–1. Drives aura opacity + crystal brightness. */
  glowStrength: number;
  /** Aura size scale multiplier applied to the aura div. */
  auraScale: number;
  /** Number of active orbital particles (float — boundary particle fades). */
  particleCount: number;
  /** Particle orbit speed multiplier 0–1. */
  particleSpeed: number;
  /** Particle brightness/opacity 0–1. */
  particleBrightness: number;
  /** Orbit irregularity 0–1 — how much particles drift off perfect circles. */
  erraticMotion: number;
  /** Crystal inner brightness 0–1. */
  crystalBrightness: number;
  /** Ring rotation speed multiplier. */
  ringSpeed: number;
}

export const CYCLE_VISUALS: Record<CycleNumber, CycleVisuals> = {
  1: {
    glowStrength:      0.28,
    auraScale:         0.72,
    particleCount:     4,
    particleSpeed:     0.22,
    particleBrightness:0.32,
    erraticMotion:     0.0,
    crystalBrightness: 0.32,
    ringSpeed:         0.55,
  },
  2: {
    glowStrength:      0.62,
    auraScale:         1.05,
    particleCount:     9,
    particleSpeed:     0.52,
    particleBrightness:0.64,
    erraticMotion:     0.32,
    crystalBrightness: 0.65,
    ringSpeed:         1.0,
  },
  3: {
    glowStrength:      1.0,
    auraScale:         1.45,
    particleCount:     16,
    particleSpeed:     0.88,
    particleBrightness:1.0,
    erraticMotion:     0.82,
    crystalBrightness: 1.0,
    ringSpeed:         1.7,
  },
};

function blendVisuals(a: CycleVisuals, b: CycleVisuals, t: number): CycleVisuals {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    glowStrength:      lerp(a.glowStrength,      b.glowStrength),
    auraScale:         lerp(a.auraScale,          b.auraScale),
    particleCount:     lerp(a.particleCount,      b.particleCount),
    particleSpeed:     lerp(a.particleSpeed,      b.particleSpeed),
    particleBrightness:lerp(a.particleBrightness, b.particleBrightness),
    erraticMotion:     lerp(a.erraticMotion,      b.erraticMotion),
    crystalBrightness: lerp(a.crystalBrightness,  b.crystalBrightness),
    ringSpeed:         lerp(a.ringSpeed,           b.ringSpeed),
  };
}

/**
 * Returns smoothly interpolated CycleVisuals for any question index.
 * Uses a continuous energy curve across all 3 cycles — no hard boundaries.
 */
export function lerpCycleVisuals(questionIndex: number): CycleVisuals {
  const qi = Math.max(1, questionIndex);

  if (qi <= 10) {
    // energy 0→1 across cycle 1, blending toward cycle 2
    const t = (qi - 1) / 9;
    return blendVisuals(CYCLE_VISUALS[1], CYCLE_VISUALS[2], t);
  }
  if (qi <= 20) {
    const t = (qi - 11) / 9;
    return blendVisuals(CYCLE_VISUALS[2], CYCLE_VISUALS[3], t);
  }
  // Cycle 3 — saturated, slowly approaches full power over next ~14 questions
  const t = Math.min(1, (qi - 21) / 14);
  return blendVisuals(CYCLE_VISUALS[3], CYCLE_VISUALS[3], t);
}
