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

export type HubGuideModeId =
  | "leaguecraft"
  | "combat-lab"
  | "stat-check"
  | "archives"
  | "quiz-history"
  | "patch-reports";

export type HubGuideMode = {
  id: HubGuideModeId;
  title: string;
  /** One compact sentence; must fit the small bubble without truncation. */
  description: string;
  /**
   * Contextual glide in px, applied on a dedicated layer above the idle
   * float. Horizontal is the dominant signal (roughly ±85–100 — clearly
   * toward the hovered side, never all the way to the card); vertical is a
   * smaller row acknowledgement (about ∓30). Bottom-row X values are pulled
   * in slightly because those cards share Mogzy's vertical band (the top
   * rows sit entirely above him, so they tolerate more travel). Mogzy stays
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
   * The bottom row uses a smaller `y` (and quiz-history its shorter lean):
   * those rows sit close to their own card titles, and the hovered title
   * staying readable outranks lateral purity (see the collision priorities
   * in MogzyHubGuide). The tail counter-shifts by `-x`, so it keeps pointing
   * at the head from the bubble's inner corner. Both offsets are cancelled
   * under reduced motion along with the lean — a side bubble next to a
   * mascot that never moves would read as detached.
   *
   * `yNarrow` (optional) is the y calibrated for a 1024px-wide viewport.
   * When present, MogzyHubGuide interpolates linearly in vw between
   * (1024px → yNarrow) and (1440px → y), so a mode whose card title drifts
   * relative to Mogzy across the desktop range can stay attached at wide
   * widths and lift away only as the title actually closes in — instead of
   * paying the worst case everywhere with one fixed number.
   */
  bubble?: { x: number; y?: number; yNarrow?: number };
};

export const HUB_GUIDE_MODES: Record<HubGuideModeId, HubGuideMode> = {
  leaguecraft: {
    id: "leaguecraft",
    title: "Leaguecraft",
    description: "Quizzes and training to sharpen your League knowledge.",
    lean: { x: -95, y: -30 },
    bubble: { x: -88, y: 44 },
  },
  "stat-check": {
    id: "stat-check",
    title: "Stat Check",
    description: "Commit champions to stat lanes and win the board.",
    lean: { x: -100, y: 0 },
    bubble: { x: -90, y: 50 },
  },
  "quiz-history": {
    id: "quiz-history",
    title: "Quiz History",
    description: "Look back through your past quiz results.",
    // Shorter than its right-side twin ON PURPOSE: left cards print their
    // title beside the inner edge (ends ~x569 at 1440), so anything past
    // ~-62 floats Mogzy over the hovered card's own title. Right cards
    // print titles on the outer page, so patch-reports keeps the longer run.
    lean: { x: -62, y: 26 },
    // The only mode with a responsive y: this card's title climbs from 46px
    // BELOW the lean layer's top at 1440 to 14px ABOVE it at 1024, so no
    // fixed drop can both hug Mogzy at wide widths and clear the title at
    // narrow ones (a fixed -34 was title-safe everywhere but left the
    // bubble floating ~28px above his hat at 1440 — visibly detached next
    // to the other five). y=26 sits the bubble at his head like its
    // neighbours with ~14px title clearance at 1440; yNarrow=-36 lifts it
    // clear of the title (plus the few-px grid wobble the sign-up chrome
    // introduces) at 1024; between and below, the vw ramp tracks the title.
    bubble: { x: -85, y: 26, yNarrow: -36 },
  },
  "combat-lab": {
    id: "combat-lab",
    title: "Combat Lab",
    description: "Simulate fights with real champion and item math.",
    lean: { x: 95, y: -30 },
    bubble: { x: 88, y: 44 },
  },
  archives: {
    id: "archives",
    title: "Mogzy Archives",
    description: "Browse the Academy's library of League knowledge.",
    lean: { x: 100, y: 0 },
    bubble: { x: 90, y: 50 },
  },
  "patch-reports": {
    id: "patch-reports",
    title: "Patch Reports",
    description: "Track every gameplay change, patch by patch.",
    lean: { x: 85, y: 26 },
    bubble: { x: 85, y: 44 },
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
