/**
 * Hero-play choreography timings (1x). Deliberately over-exaggerated per the
 * animation-direction pass: this version overshoots the production target so
 * the staging is unmistakable; it will be tuned back later.
 */
export const STAT_CHECK_ANIMATION = {
  placement: {
    /** Card rises out of the fan, straightens, scales up. */
    pickupMs: 220,
    /** Anticipation pause: the card hovers above the fan. */
    holdMs: 260,
    /** Upward launch toward the board. */
    launchMs: 160,
    /** Main flight through the apex. */
    travelMs: 700,
    /** Controlled descent into the lane. */
    approachMs: 220,
    /** Strike: overshoot + compression, lane flash. */
    impactMs: 180,
    /** Rebound off the surface. */
    reboundMs: 180,
    /** Settle into exact board geometry. */
    settleMs: 220,
    /** Lane acceptance glow after the clone hands off. */
    acceptanceMs: 140,
  },
  returnPlay: {
    /** Card lifts off the board. */
    liftMs: 180,
    /** Brief pause before flying home. */
    holdMs: 120,
    /** Flight back to the fan. */
    travelMs: 500,
    /** Settle into the reserved fan gap. */
    settleMs: 200,
  },
  /** Fraction of the main travel after which the hand gap starts closing. */
  handGapHoldTravelRatio: 0.4,
  /** Hand re-fan transition duration (speed-scaled at the call site). */
  handReflowMs: 450,
  /** Peak scale of the travel clone at the apex, relative to hand-card size. */
  heroApexScale: 1.45,
  laneMoveMs: 420,
  opponentFlipMs: 420,
  opponentFlipStaggerMs: 260,
  laneResolveMs: 360,
  boardResultMs: 260,
  damageMs: 420,
  discardMs: 280,
  dealStaggerMs: 80,
  reducedMotionMs: 1,
  easing: [0.22, 1, 0.36, 1] as const,
  spring: {
    type: "spring",
    stiffness: 520,
    damping: 34,
    mass: 0.8,
  },
} as const;

/** Total clone flight time for a placement (excludes post-handoff acceptance glow). */
export function placementCloneTotalMs() {
  const p = STAT_CHECK_ANIMATION.placement;
  return p.pickupMs + p.holdMs + p.launchMs + p.travelMs + p.approachMs + p.impactMs + p.reboundMs + p.settleMs;
}

/** Total clone flight time for a return-to-hand. */
export function returnCloneTotalMs() {
  const r = STAT_CHECK_ANIMATION.returnPlay;
  return r.liftMs + r.holdMs + r.travelMs + r.settleMs;
}

/**
 * Arc height for the hero flight, derived from travel distance and viewport so
 * the apex is dramatic on desktop yet contained on mobile.
 */
export function heroArcLift(distancePx: number, viewportWidth: number, viewportHeight: number) {
  if (viewportWidth < 768) {
    return Math.min(170, Math.max(110, distancePx * 0.3, viewportHeight * 0.12));
  }
  return Math.min(260, Math.max(160, distancePx * 0.35));
}

export const STAT_CHECK_ANIMATION_SPEEDS = [0.25, 0.5, 1, 1.5] as const;
export type StatCheckAnimationSpeed = (typeof STAT_CHECK_ANIMATION_SPEEDS)[number];

export const REVEAL_TIMELINE = {
  opponentReveal1: 220,
  opponentReveal2: 520,
  opponentReveal3: 820,
  resolveLane1: 1_220,
  resolveLane2: 1_620,
  resolveLane3: 2_020,
  boardResult: 2_420,
  damage: 2_760,
  resolved: 3_180,
} as const;

export function durationAtSpeed(ms: number, speed: StatCheckAnimationSpeed) {
  return Math.round(ms / speed);
}

export function isStatCheckAnimationSpeed(value: number): value is StatCheckAnimationSpeed {
  return STAT_CHECK_ANIMATION_SPEEDS.includes(value as StatCheckAnimationSpeed);
}

export function animationDuration(ms: number, reducedMotion: boolean, speed: StatCheckAnimationSpeed = 1) {
  return reducedMotion ? STAT_CHECK_ANIMATION.reducedMotionMs : durationAtSpeed(ms, speed);
}
