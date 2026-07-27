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

/**
 * Gameplay default. Every duration below is authored at 1x and divided by the
 * session speed, so raising the default shortens the whole sequence uniformly
 * rather than through per-timer edits. 1.5x is the reviewed gameplay tempo;
 * the slower settings stay in the selector for inspection, and an explicit
 * stored preference always wins over this default.
 */
export const STAT_CHECK_DEFAULT_ANIMATION_SPEED: StatCheckAnimationSpeed = 1.5;

/**
 * Lane plaque staging (1x). Each resolved lane runs its fixed-size plaque
 * through category → winner → threshold → bonus, separated by a mechanical
 * shutter blink. All values live here so the sequence is tuned in one place
 * rather than through timeouts scattered across components.
 */
/**
 * Lane reveal choreography (1x). Deliberately slow for visual review: one lane
 * runs start to finish before the next begins, so every scene can be
 * inspected. Shorten by editing these values — nothing else needs to move.
 */
export const LANE_PLAQUE_TIMELINE = {
  /** Full shutter cycle: the plate is already down, holds, then retracts. */
  blinkMs: 550,
  /** The swap happens while the plaque is fully covered. */
  blinkCoverRatio: 0.42,
  categoryHoldMs: 1_000,
  thresholdHoldMs: 1_000,
  valuesEnlargeMs: 650,
  valuesHoldMs: 900,
  winnerEmphasisMs: 650,
  sliceMs: 600,
  zeroHoldMs: 800,
  transferMs: 1_000,
  impactMs: 650,
  /**
   * How long a value badge takes to move between emphasis treatments (enlarge,
   * winner/loser, and the settle cleanup). Driven into the badge as a CSS
   * custom property so the transition scales with the speed control exactly
   * like the scheduled beats do.
   */
  valueTransitionMs: 500,
  /**
   * Trailing time a settled lane owns before the next lane begins. This is
   * cleanup, not a hold: the enlargement and slice unwind over
   * `valueTransitionMs`, and the extra 20ms is scheduler handoff slack. There
   * is deliberately no idle beat here — the previous 1,000ms value left ~480ms
   * of visible dead air between lanes.
   */
  settleMs: 520,
} as const;

/**
 * Offsets, relative to a lane's own start, at which that lane enters each
 * scene.
 *
 * The shape is identical for every lane; only its *length* depends on the
 * authoritative outcome. A lane that earns no decisive bonus has nothing to
 * wait for after the comparison — there is no losing number to cut, no energy
 * packet in flight and no impact to land — so those three beats collapse to
 * zero and the lane hands off as soon as `+0` has been read. The scenes still
 * all exist and still fire in order, so the plaque, the value badges and the
 * accessible label walk exactly the same path they always did; `+1` and the
 * slice stay gated on `result.decisive`, so a collapsed lane can never flash a
 * bonus it did not earn.
 *
 * Pass the lane's own `result.decisive` — which the engine already computes as
 * `winner !== "tie" && margin >= threshold`, so ties and failed thresholds are
 * both false. Nothing here decides an outcome; it only reads one.
 */
export function lanePlaqueStageOffsets(decisive = true) {
  const t = LANE_PLAQUE_TIMELINE;
  const sliceMs = decisive ? t.sliceMs : 0;
  const transferMs = decisive ? t.transferMs : 0;
  const impactMs = decisive ? t.impactMs : 0;
  const threshold = t.categoryHoldMs;
  const values = threshold + t.blinkMs + t.thresholdHoldMs;
  const winner = values + t.valuesEnlargeMs + t.valuesHoldMs;
  const slice = winner + t.winnerEmphasisMs;
  const zero = slice + sliceMs;
  const transfer = zero + t.blinkMs + t.zeroHoldMs;
  const bonus = transfer + transferMs;
  const settled = bonus + impactMs;
  return { category: 0, threshold, values, winner, slice, zero, transfer, bonus, settled } as const;
}

/** Total time one lane occupies, including its trailing settle. */
export function laneRevealTotalMs(decisive = true) {
  return lanePlaqueStageOffsets(decisive).settled + LANE_PLAQUE_TIMELINE.settleMs;
}

/**
 * Post-comparison duration: from the winner beat (the moment the values have
 * been compared) to the lane handing off. This is the figure the non-decisive
 * pacing pass targets, and the tests assert the reduction against it.
 */
export function lanePostComparisonMs(decisive = true) {
  const offsets = lanePlaqueStageOffsets(decisive);
  return laneRevealTotalMs(decisive) - offsets.winner;
}

/**
 * Start offsets for the three lanes: strictly sequential, no overlap. Each lane
 * begins only once the previous one has finished its own cleanup, so a lane
 * that resolves faster pulls every later lane forward rather than leaving a gap.
 */
export function laneStartOffsets(laneDecisive: readonly boolean[] = [true, true, true]) {
  const starts: number[] = [];
  let at = 0;
  for (let index = 0; index < 3; index += 1) {
    starts.push(at);
    at += laneRevealTotalMs(laneDecisive[index] ?? true);
  }
  return starts as readonly number[];
}

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
  /**
   * When the first lane starts. Lanes 2 and 3 are no longer fixed offsets: a
   * lane's length now depends on its own authoritative outcome, so the later
   * lanes and the board-damage beat are derived per round by
   * `laneResolveOffsets` / `boardResultOffset` below.
   */
  resolveLane1: 1_220,
  /**
   * Tail beats, measured from the END of the centre damage presentation (see
   * DAMAGE_REVEAL_TIMELINE). The presentation's length depends on which damage
   * components the round actually produced, so the scheduler adds
   * damageRevealPlanTotalMs() to `boardResult` and then these offsets. A round
   * that deals no damage has an empty plan, which reproduces the original
   * boardResult+340 / boardResult+760 timing exactly.
   */
  damageTailMs: 340,
  resolvedTailMs: 760,
} as const;

/**
 * Absolute offsets at which each of the three lanes begins, for a round whose
 * lanes carry the given authoritative decisive outcomes. Strictly increasing
 * and non-overlapping by construction.
 */
export function laneResolveOffsets(laneDecisive: readonly boolean[] = [true, true, true]) {
  return laneStartOffsets(laneDecisive).map((start) => REVEAL_TIMELINE.resolveLane1 + start);
}

/** Board damage waits until all three lanes have finished. */
export function boardResultOffset(laneDecisive: readonly boolean[] = [true, true, true]) {
  const starts = laneStartOffsets(laneDecisive);
  return REVEAL_TIMELINE.resolveLane1 + starts[2] + laneRevealTotalMs(laneDecisive[2] ?? true);
}

/**
 * Centre damage presentation (1x). After the third lane settles, the round's
 * already-computed damage components are added into a running total in the
 * middle of the arena, the total lands with an impact, and only then does the
 * health bar drain. Every value is authored here so the presentation scales
 * with the same speed control as the rest of the reveal.
 */
export const DAMAGE_REVEAL_TIMELINE = {
  /** The frame and the winner's identity establish themselves first. */
  enterMs: 420,
  /**
   * Hold on the board-result number — 2 for a normal board win, 3 for a sweep.
   * This is the starting subtotal, not a component added to one.
   */
  boardMs: 620,
  /**
   * Extra time the board result holds on a sweep, while the floating SWEEP
   * notification enters, holds and exits over the established `3`.
   */
  sweepNoticeMs: 900,
  /** Hold on a lane that awarded +1: the existing decisive visual language. */
  laneBonusMs: 460,
  /** A +0 lane is subordinate — it reads and moves on rather than landing. */
  laneZeroMs: 260,
  /** Hold on the completed total before it strikes. */
  totalHoldMs: 620,
  /** The impact frame itself: arena jolt + contained flash. */
  impactMs: 380,
  /** Health bar flash and drain to the authoritative value. */
  healthMs: 700,
  /** The presentation clears before anything else happens. */
  clearMs: 300,
  /** Gap between the two directions when both sides dealt damage. */
  betweenSidesMs: 320,
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
