/**
 * PERFECT TIMING — DEMO VIEW MODELS. Fake, clearly labelled, and kept out of
 * production bundles: import this only from tests or the DEV demo page.
 *
 * NOT DATA. Every champion, ability, cooldown and rank below is a demo value
 * chosen to exercise the presentation (a long name, a rank-invariant ability,
 * an early stop, a late stop, an exact stop, a miss, a voided round, an
 * unverified window). None of it is read from the archive and none of it
 * states a fact about the game. The names carry "(demo)" so a screenshot can
 * never be mistaken for a capture.
 */
import type { PtPressSurfaceProps, PtRevealView, PtRoundView, PtRunHud, PtRunSummary } from "@/lib/perfect-timing/viewModel";

export const DEMO_LABEL = "demo";

const round = (over: Partial<PtRoundView> & Pick<PtRoundView, "index">): PtRoundView => ({
  roundId: `pt_demo_${String(over.index).padStart(2, "0")}`,
  championName: "Demo Champion",
  abilityName: "Demo Ability",
  slot: "Q",
  rank: 2,
  rankCount: 5,
  iconUrl: null,
  total: 5,
  ...over,
});

/** A five-round demo run. The icon is null (slot monogram) unless a host supplies one. */
export const DEMO_ROUNDS: PtRoundView[] = [
  round({ index: 1, championName: "Vessel (demo)", abilityName: "Lantern Toss", slot: "Q", rank: 3, rankCount: 5 }),
  round({ index: 2, championName: "Archivist (demo)", abilityName: "Sealed Verdict of the Twelfth Hall", slot: "R", rank: 2, rankCount: 3 }),
  round({ index: 3, championName: "Warden (demo)", abilityName: "Bulwark", slot: "W", rank: null, rankCount: 5 }),
  round({ index: 4, championName: "Courier (demo)", abilityName: "Quickstep", slot: "E", rank: 5, rankCount: 5 }),
  round({ index: 5, championName: "Oracle (demo)", abilityName: "Foretold", slot: "R", rank: 1, rankCount: 3 }),
];

const reveal = (over: Partial<PtRevealView> & Pick<PtRevealView, "elapsedMs" | "targetMs">): PtRevealView => {
  const errorMs = over.elapsedMs - over.targetMs;
  const absErrorMs = Math.abs(errorMs);
  return {
    errorMs,
    absErrorMs,
    relativeError: Number((absErrorMs / over.targetMs).toFixed(4)),
    tier: "good",
    points: 50,
    plausible: true,
    cooldownRaw: "9 / 8 / 7 / 6 / 5",
    rank: 3,
    ...over,
  };
};

/** Demo reveals, one per shape the reveal must draw. Tiers and points are demo values, not graded. */
export const DEMO_REVEALS = {
  early: reveal({ elapsedMs: 6830, targetMs: 7000, tier: "perfect", points: 90, cooldownRaw: "9 / 8 / 7 / 6 / 5", rank: 3 }),
  late: reveal({ elapsedMs: 118400, targetMs: 110000, tier: "great", points: 70, cooldownRaw: "130 / 120 / 110", rank: 2 }),
  exact: reveal({ elapsedMs: 12000, targetMs: 12000, tier: "perfect", points: 100, cooldownRaw: "12", rank: null }),
  miss: reveal({ elapsedMs: 3100, targetMs: 5000, tier: "miss", points: 0, cooldownRaw: "9 / 8 / 7 / 6 / 5", rank: 5 }),
  unverified: reveal({ elapsedMs: 41200, targetMs: 40000, tier: "perfect", points: 88, plausible: false, cooldownRaw: "60 / 50 / 40", rank: 3 }),
  farLate: reveal({ elapsedMs: 9800, targetMs: 4000, tier: "miss", points: 0, cooldownRaw: "4", rank: null }),
} satisfies Record<string, PtRevealView>;

/** An inert press surface for static states; the demo page swaps in a live one. */
export function demoPress(label: string, disabled = false): PtPressSurfaceProps {
  return {
    onPointerDown: () => {},
    onKeyDown: () => {},
    tabIndex: 0,
    role: "button",
    "aria-label": label,
    "aria-disabled": disabled,
  };
}

export const DEMO_SUMMARY: PtRunSummary = {
  rounds: [
    { round: DEMO_ROUNDS[0], reveal: DEMO_REVEALS.early },
    { round: DEMO_ROUNDS[1], reveal: DEMO_REVEALS.late },
    { round: DEMO_ROUNDS[2], reveal: DEMO_REVEALS.exact },
    { round: DEMO_ROUNDS[3], reveal: null },
    { round: DEMO_ROUNDS[4], reveal: DEMO_REVEALS.miss },
  ],
  totalPoints: 260,
  patchLabel: "0.0 (demo)",
  patchSource: "patch_notes_ingestion_fallback",
};

export const DEMO_HUD: PtRunHud = {
  pointsSoFar: 160,
  outcomes: ["perfect", "great", null, null, null],
  patchLabel: "0.0 (demo)",
  patchSource: "patch_notes_ingestion_fallback",
};
