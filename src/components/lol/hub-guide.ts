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
   * Subtle acknowledgement shift in px, applied on a dedicated layer above
   * the idle float. Keep within roughly ±8–20px — Mogzy leans, he does not
   * travel.
   */
  lean: { x: number; y: number };
};

export const HUB_GUIDE_MODES: Record<HubGuideModeId, HubGuideMode> = {
  leaguecraft: {
    id: "leaguecraft",
    title: "Leaguecraft",
    description: "Quizzes and training to sharpen your League knowledge.",
    lean: { x: -14, y: -8 },
  },
  "stat-check": {
    id: "stat-check",
    title: "Stat Check",
    description: "Commit champions to stat lanes and win the board.",
    lean: { x: -14, y: 0 },
  },
  "quiz-history": {
    id: "quiz-history",
    title: "Quiz History",
    description: "Look back through your past quiz results.",
    lean: { x: -12, y: 6 },
  },
  "combat-lab": {
    id: "combat-lab",
    title: "Combat Lab",
    description: "Simulate fights with real champion and item math.",
    lean: { x: 14, y: -8 },
  },
  archives: {
    id: "archives",
    title: "Mogzy Archives",
    description: "Browse the Academy's library of League knowledge.",
    lean: { x: 14, y: 0 },
  },
  "patch-reports": {
    id: "patch-reports",
    title: "Patch Reports",
    description: "Track every gameplay change, patch by patch.",
    lean: { x: 12, y: 6 },
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
