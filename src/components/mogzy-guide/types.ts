import type { MogzyMascotPose } from "@/components/mascot/mascot-assets";

/**
 * MG-A — Mogzy Guide substrate: the public contract.
 *
 * Mogzy CONSUMES product state; he never owns it. A surface derives its guide
 * messages from state it already has (Ranked entry, quiz progress, auth,
 * Premium, Daily…) and hands them over as plain `GuideMessage` data. Nothing in
 * this folder imports from a product module, calls a network, or decides
 * whether a product action is allowed.
 */

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Message priority, HIGHEST FIRST. Exactly one message is shown at a time and
 * the highest-priority eligible candidate wins:
 *
 *   1. `contextual` — something important about the surface's current state
 *   2. `first-use`  — a one-time introduction to the surface
 *   3. `hover`      — a reaction to pointer hover / keyboard focus
 *   4. `ambient`    — slow, optional chatter
 */
export const GUIDE_PRIORITIES = ["contextual", "first-use", "hover", "ambient"] as const;
export type GuidePriority = (typeof GUIDE_PRIORITIES)[number];

/** Compact-copy budget. Enforced by `isCompactGuideCopy`, not truncated at runtime. */
export const GUIDE_MAX_TITLE_LENGTH = 32;
export const GUIDE_MAX_TEXT_LENGTH = 100;

export type GuideDirection = "left" | "right" | "up" | "down";

/**
 * "Look/lean toward there." `near` ≈ a nudge, `far` ≈ a clear glide. The
 * substrate maps the two words to capped pixel travel; a surface never writes
 * a distance in px.
 */
export interface GuideTarget {
  direction: GuideDirection;
  distance?: "near" | "far";
}

/** One-shot motion played when a message becomes active. */
export type GuideCue = "hop";

/**
 * When a `once` message is recorded as consumed (persisted in localStorage):
 *   `"show"`    — the moment it is first displayed
 *   `"dismiss"` — when it is dismissed OR its `ttlMs` elapses
 */
export type GuideOnce = "show" | "dismiss";

export interface GuideMessage {
  /** Stable within a surface. Drives change detection and the persistence key. */
  id: string;
  priority: GuidePriority;
  /** One compact sentence, ≤ `GUIDE_MAX_TEXT_LENGTH` chars. */
  text: string;
  /** Optional heading, ≤ `GUIDE_MAX_TITLE_LENGTH` chars. */
  title?: string;
  /** Pose while this message is active. Falls back to the guide's rest pose. */
  pose?: MogzyMascotPose;
  /** Optional lean/look direction. Absent = Mogzy stays put. */
  target?: GuideTarget;
  /** Played once when the message becomes active. */
  cue?: GuideCue;
  /** Auto-hide after this many ms (counts as dismissal for `once: "dismiss"`). */
  ttlMs?: number;
  /**
   * Whether the user can dismiss it (Escape, or activating the guide when it is
   * `interactive`). Dismissal is session-memory unless `once` is also set.
   */
  dismissible?: boolean;
  /** Show at most once per browser, per surface. See `GuideOnce`. */
  once?: GuideOnce;
}

/** What a surface hands to `controller.hover()` — priority is forced to `hover`. */
export type GuideHoverMessage = Omit<GuideMessage, "priority" | "once">;

/* -------------------------------------------------------------------------- */
/* Placement                                                                  */
/* -------------------------------------------------------------------------- */

export type GuideLayout = "desktop" | "mobile";
export type GuideBubbleSide = "top" | "bottom" | "left" | "right";

/** CSS length strings (`"16px"`, `"4%"`, `"calc(…)"`). Omitted edges stay unset. */
export interface GuideAnchor {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  /** Center the guide horizontally inside the host (ignores left/right). */
  centerX?: boolean;
}

/**
 * Authored, deterministic placement. The surface owns a `position: relative`
 * host element; the guide is positioned inside it from `anchor` (or sits in
 * normal flow when `anchor` is omitted). There is no collision engine —
 * the author picks a spot that is free on that layout, and the only runtime
 * correction is shifting the BUBBLE back inside the viewport.
 */
export interface GuidePlacement {
  anchor?: GuideAnchor;
  /** Mascot width as a CSS length, e.g. `"clamp(84px, 24vw, 110px)"`. */
  size: string;
  /** Which side of Mogzy the bubble sits on. */
  bubbleSide: GuideBubbleSide;
  /** Bubble width as a CSS length. Default `"min(220px, 60vw)"`. */
  bubbleWidth?: string;
  /** Which way the artwork looks at rest. Default `"left"` (the base art's native facing). */
  restFacing?: "left" | "right";
}

export interface GuidePlacements {
  desktop: GuidePlacement;
  /** Falls back to `desktop` when omitted. Mobile = viewport < 768px. */
  mobile?: GuidePlacement;
}

export type { MogzyMascotPose };
