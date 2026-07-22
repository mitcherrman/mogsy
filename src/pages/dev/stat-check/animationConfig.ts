export const STAT_CHECK_ANIMATION = {
  handTravelMs: 380,
  handReturnMs: 320,
  laneMoveMs: 300,
  opponentFlipMs: 420,
  opponentFlipStaggerMs: 260,
  laneResolveMs: 360,
  boardResultMs: 260,
  damageMs: 420,
  discardMs: 280,
  dealStaggerMs: 80,
  reducedMotionMs: 1,
  arcLift: 72,
  easing: [0.22, 1, 0.36, 1] as const,
  spring: {
    type: "spring",
    stiffness: 520,
    damping: 34,
    mass: 0.8,
  },
} as const;

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

export function animationDuration(ms: number, reducedMotion: boolean) {
  return reducedMotion ? STAT_CHECK_ANIMATION.reducedMotionMs : ms;
}
