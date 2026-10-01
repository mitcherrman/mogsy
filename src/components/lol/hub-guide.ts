import type { GuideTarget } from "@/components/mogzy-guide";

/**
 * Hub guide DATA (MG-C). The rendering, hover state, priority and persistence
 * all live in the shared Mogzy Guide substrate (`@/components/mogzy-guide`);
 * this file keeps only what is specific to the Hub's four destinations: the
 * copy, the lean direction toward each book, and the DOM ids of the
 * visually-hidden descriptions that carry the hover/focus text to assistive
 * technology (the substrate never announces hover copy).
 *
 * `combat-lab` is the id for the destination titled "Combat Simulation" — the
 * route, guide id and components keep that id; only the label changed.
 */
export type HubGuideModeId =
  | "leaguecraft"
  | "combat-lab"
  | "archives"
  | "pro-play";

export type HubGuideMode = {
  id: HubGuideModeId;
  title: string;
  /** One compact sentence (<= GUIDE_MAX_TEXT_LENGTH); shown in the bubble and the sr-only description. */
  description: string;
  /** Mogzy leans toward the hovered book's side. Left cards left, right cards right. */
  target: GuideTarget;
};

export const HUB_GUIDE_MODES: Record<HubGuideModeId, HubGuideMode> = {
  // Top row (left / right). Unchanged from the six-book calibration: with two
  // rows per vertically-centred column the top card sits where row 1 sat.
  leaguecraft: {
    id: "leaguecraft",
    title: "Leaguecraft",
    description: "Quizzes and training to sharpen your League knowledge.",
    target: { direction: "left", distance: "far" },
  },
  "combat-lab": {
    id: "combat-lab",
    title: "Combat Simulation",
    description: "Simulate fights with real champion and item math.",
    target: { direction: "right", distance: "far" },
  },
  // Bottom row (left / right): a mirrored pair, symmetric by construction.
  archives: {
    id: "archives",
    title: "Mogzy Archives",
    description: "Browse the Academy's library of League knowledge.",
    target: { direction: "left", distance: "far" },
  },
  "pro-play": {
    id: "pro-play",
    title: "Pro Play",
    description: "Test yourself on the pro scene, match by match.",
    target: { direction: "right", distance: "far" },
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
