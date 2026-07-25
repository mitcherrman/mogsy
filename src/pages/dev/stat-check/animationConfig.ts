/**
 * Hero-play choreography timings (1x). Deliberately over-exaggerated per the
 * animation-direction pass: this version overshoots the production target so
 * the staging is unmistakable; it will be tuned back later.
 */
export const STAT_CHECK_ANIMATION = {
  // Production polish pass on 275791f: same gesture and tempo, with the
  // theatrical beats trimmed (shorter anticipation, softer strike). Clone
  // total ~1.64s at 1x, handoff ~1.72s.
  placement: {
    /** Card rises out of the fan, straightens, scales up. */
    pickupMs: 180,
    /** Anticipation beat: brief, confident — no longer a theatrical hover. */
    holdMs: 150,
    /** Upward launch toward the board. */
    launchMs: 130,
    /** Main flight through the apex. */
    travelMs: 575,
    /** Controlled descent into the lane. */
    approachMs: 180,
    /** Strike: compact compression, restrained lane flash. */
    impactMs: 130,
    /** Rebound off the surface. */
    reboundMs: 120,
    /** Settle into exact board geometry. */
    settleMs: 170,
    /** Lane acceptance glow after the clone hands off. */
    acceptanceMs: 100,
  },
  returnPlay: {
    /** Card lifts off the board. */
    liftMs: 150,
    /** Brief pause before flying home. */
    holdMs: 80,
    /** Flight back to the fan. */
    travelMs: 410,
    /** Settle into the reserved fan gap. */
    settleMs: 165,
  },
  /** Fraction of the main travel after which the hand gap starts closing. */
  handGapHoldTravelRatio: 0.4,
  /** Hand re-fan transition duration (speed-scaled at the call site). */
  handReflowMs: 370,
  /** Peak scale of the travel clone at the apex, relative to hand-card size. */
  heroApexScale: 1.28,
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

/**
 * Compact reduced-motion choreography: placement still *communicates* (small
 * lift, short slide, soft settle over ~240ms) instead of teleporting, while
 * skipping the dramatic arc, hero scaling, and anticipation theatrics.
 * Arrays mirror the full phase lists so the same scheduling path is used.
 */
export const REDUCED_MOTION_CHOREO = {
  /** [pickup, hold, launch, travel, approach, impact, rebound, settle] */
  placement: [60, 0, 0, 90, 30, 20, 20, 20] as number[],
  placementAcceptanceMs: 40,
  /** [lift, hold, travel, settle] */
  return: [40, 0, 140, 60] as number[],
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
  // Low poker-style toss: a clear curve that stays close to the table, as if an
  // invisible hand lays the card onto the board.
  if (viewportWidth < 768) {
    return Math.min(70, Math.max(40, distancePx * 0.12, viewportHeight * 0.05));
  }
  return Math.min(100, Math.max(55, distancePx * 0.15));
}

export const STAT_CHECK_ANIMATION_SPEEDS = [0.25, 0.5, 1, 1.5] as const;
export type StatCheckAnimationSpeed = (typeof STAT_CHECK_ANIMATION_SPEEDS)[number];

export const REVEAL_TIMELINE = {
  opponentReveal1: 220,
  opponentReveal2: 520,
  opponentReveal3: 820,
  /** Item-reveal beat, inserted only on rounds where an item was played. */
  itemReveal: 1_140,
  /**
   * How much every step after the item beat shifts on item rounds, giving the
   * equipped item + bonus a readable moment before lane winners resolve.
   */
  itemRevealShiftMs: 520,
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
