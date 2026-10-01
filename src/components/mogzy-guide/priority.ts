import {
  GUIDE_MAX_TEXT_LENGTH,
  GUIDE_MAX_TITLE_LENGTH,
  GUIDE_PRIORITIES,
  type GuideMessage,
  type GuidePriority,
} from "./types";

/** Lower rank = higher priority. */
export function guidePriorityRank(priority: GuidePriority): number {
  return GUIDE_PRIORITIES.indexOf(priority);
}

/**
 * Pick the single message to show: highest priority wins; among equal
 * priorities the EARLIEST in the array wins (surfaces list their most
 * important contextual message first). Pure — callers filter out ineligible
 * candidates (seen / dismissed) before calling.
 */
export function selectGuideMessage(
  candidates: readonly GuideMessage[],
): GuideMessage | null {
  let best: GuideMessage | null = null;
  for (const c of candidates) {
    if (!best || guidePriorityRank(c.priority) < guidePriorityRank(best.priority)) {
      best = c;
    }
  }
  return best;
}

/** Contextual and first-use messages are announced to assistive tech; hover/ambient never are. */
export function isAnnouncedPriority(priority: GuidePriority): boolean {
  return priority === "contextual" || priority === "first-use";
}

/** True when the message's copy fits the compact budget. Used by tests and dev checks. */
export function isCompactGuideCopy(message: Pick<GuideMessage, "text" | "title">): boolean {
  return (
    message.text.length > 0 &&
    message.text.length <= GUIDE_MAX_TEXT_LENGTH &&
    (message.title === undefined || message.title.length <= GUIDE_MAX_TITLE_LENGTH)
  );
}
