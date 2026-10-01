/**
 * MG-A — Mogzy Guide substrate. This barrel IS the frozen public API:
 * surfaces import from `@/components/mogzy-guide` and nothing deeper.
 * See docs/MOGZY_GUIDE_HANDOFF.md.
 */
export { MogzyGuide } from "./MogzyGuide";
export { useGuideLayout } from "./useGuideLayout";
export type { MogzyGuideProps } from "./MogzyGuide";

export {
  useMogzyGuide,
  GUIDE_AMBIENT_DEFAULTS,
  GUIDE_HOVER_CLEAR_DELAY_MS,
} from "./useMogzyGuide";
export type { MogzyGuideController, UseMogzyGuideOptions } from "./useMogzyGuide";

export {
  GUIDE_MAX_TEXT_LENGTH,
  GUIDE_MAX_TITLE_LENGTH,
  GUIDE_PRIORITIES,
} from "./types";
export type {
  GuideAnchor,
  GuideBubbleSide,
  GuideCue,
  GuideDirection,
  GuideHoverMessage,
  GuideLayout,
  GuideMessage,
  GuideOnce,
  GuidePlacement,
  GuidePlacements,
  GuidePriority,
  GuideTarget,
  MogzyMascotPose,
} from "./types";

export { isCompactGuideCopy, selectGuideMessage } from "./priority";
export { GUIDE_LEAN_PX, GUIDE_MOBILE_BREAKPOINT } from "./placement";
export { createGuideStorage, guideStorageKey } from "./storage";
export type { GuideStorage } from "./storage";
