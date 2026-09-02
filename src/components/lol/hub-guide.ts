import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Centralized metadata + state for Mogzy's contextual hub guide (Phase 1).
 *
 * The /lol academy hub owns a single `activeMode` id; book cards report
 * hover/focus upward through `useHubGuideState` and `MogzyHubGuide` renders
 * the reaction. Keeping the config here (not on the cards) is what makes
 * Phase 2 cheap: per-mode `pose`, expression, or animation hints extend
 * `HubGuideMode` without touching the cards.
 */

/**
 * The four primary hub destinations (2026-09-02 IA cleanup). `combat-lab` is
 * kept as the id for the destination now titled "Combat Simulation" — the
 * route, guide id and components stay `combat-lab`; only the label changed.
 * `stat-check`, `quiz-history` and `patch-reports` were retired as primary
 * destinations; their routes and pages are untouched.
 */
export type HubGuideModeId =
  | "leaguecraft"
  | "combat-lab"
  | "archives"
  | "pro-play";

export type HubGuideMode = {
  id: HubGuideModeId;
  title: string;
  /** One compact sentence; must fit the small bubble without truncation. */
  description: string;
  /**
   * Contextual glide in px, applied on a dedicated layer above the idle
   * float. Horizontal is the dominant signal (roughly ±85–100 — clearly
   * toward the hovered side, never all the way to the card); vertical is a
   * smaller row acknowledgement (about ∓30). Under the four-destination
   * quadrant both rows sit above Mogzy's own band, so both tolerate the full
   * travel and the pairs are exact mirrors. Mogzy stays
   * anchored to the central lane: at the 200px lane minimum these values
   * overlap a book's inner edge by at most a few dozen px of mostly
   * transparent PNG margin.
   */
  lean: { x: number; y: number };
  /**
   * Optional speech-bubble placement in px, relative to the bubble's default
   * spot centered above Mogzy's hat (the bubble always rides the lean layer,
   * so it inherits `lean` for free).
   *
   * `x` pushes the bubble laterally toward the hovered side — sized so the
   * bubble sits predominantly BESIDE Mogzy's head rather than overhead
   * (roughly ±85–90: with the ~216px bubble that puts its far edge well past
   * his silhouette while its near edge still brushes his shoulder, keeping
   * it visually attached). `y` drops it from hat-height down to head/shoulder
   * height. Together they move the bubble out of the Academy Radio dock's
   * vertical territory entirely — beside the head it sits below the dock, so
   * the old transient dock-corner overlap cannot happen at all.
   *
   * The bottom row uses a slightly larger `y`: it sits closer to its own
   * card title, and the hovered title staying readable outranks lateral
   * purity (see the collision priorities in MogzyHubGuide). The tail
   * counter-shifts by `-x`, so it keeps pointing
   * at the head from the bubble's inner corner. Both offsets are cancelled
   * under reduced motion along with the lean — a side bubble next to a
   * mascot that never moves would read as detached.
   *
   * `yNarrow` (optional) is the y calibrated for a 1024px-wide viewport. No
   * mode needs it under the current quadrant; kept for the visual pass.
   * When present, MogzyHubGuide interpolates linearly in vw between
   * (1024px → yNarrow) and (1440px → y), so a mode whose card title drifts
   * relative to Mogzy across the desktop range can stay attached at wide
   * widths and lift away only as the title actually closes in — instead of
   * paying the worst case everywhere with one fixed number.
   */
  bubble?: { x: number; y?: number; yNarrow?: number };
};

export const HUB_GUIDE_MODES: Record<HubGuideModeId, HubGuideMode> = {
  // Top row (left / right). Unchanged from the six-book calibration: with two
  // rows per vertically-centred column the top card sits where row 1 sat.
  leaguecraft: {
    id: "leaguecraft",
    title: "Leaguecraft",
    description: "Quizzes and training to sharpen your League knowledge.",
    lean: { x: -95, y: -30 },
    bubble: { x: -88, y: 44 },
  },
  "combat-lab": {
    id: "combat-lab",
    title: "Combat Simulation",
    description: "Simulate fights with real champion and item math.",
    lean: { x: 95, y: -30 },
    bubble: { x: 88, y: 44 },
  },
  // Bottom row (left / right). Two rows centre where the old rows 1 and 2 sat,
  // so the bottom pair inherits the old middle-row calibration — a mirrored
  // pair, symmetric by construction. No mode shares Mogzy's own vertical band
  // any more (that was the old third row), so the `yNarrow` vw-interpolation
  // that quiz-history needed is not required by any surviving mode.
  archives: {
    id: "archives",
    title: "Mogzy Archives",
    description: "Browse the Academy's library of League knowledge.",
    lean: { x: -100, y: 0 },
    bubble: { x: -90, y: 50 },
  },
  "pro-play": {
    id: "pro-play",
    title: "Pro Play",
    description: "Test yourself on the pro scene, match by match.",
    lean: { x: 100, y: 0 },
    bubble: { x: 90, y: 50 },
  },
};

/**
 * DOM id of the visually-hidden description element for a mode. Each hub card
 * link points at its mode's element via `aria-describedby`, so assistive
 * technology reads the contextual description on keyboard focus while the
 * visual speech bubble stays decorative (aria-hidden) — no duplicate or
 * live-region announcements.
 */
export function hubGuideDescriptionId(id: HubGuideModeId): string {
  return `lol-hub-guide-desc-${id}`;
}

/**
 * Delay before a leave/blur actually clears the active mode. Moving between
 * sibling cards fires leave-then-enter as separate events; without this grace
 * window the bubble would flash to idle between every pair of cards (and
 * between every Tab step).
 */
export const GUIDE_CLEAR_DELAY_MS = 140;

/**
 * Hub-level guide state. `activate` wins immediately (cancelling any pending
 * clear); `deactivate` only clears after the grace delay.
 */
export function useHubGuideState() {
  const [activeModeId, setActiveModeId] = useState<HubGuideModeId | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingClear = () => {
    if (clearTimer.current !== null) {
      clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  };

  const activate = useCallback((id: HubGuideModeId) => {
    cancelPendingClear();
    setActiveModeId(id);
  }, []);

  const deactivate = useCallback(() => {
    cancelPendingClear();
    clearTimer.current = setTimeout(() => {
      clearTimer.current = null;
      setActiveModeId(null);
    }, GUIDE_CLEAR_DELAY_MS);
  }, []);

  useEffect(() => cancelPendingClear, []);

  return { activeModeId, activate, deactivate };
}
