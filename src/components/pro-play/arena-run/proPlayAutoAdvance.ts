/**
 * W26Q-UX — how long a graded Pro Play reveal holds before the run moves on
 * by itself (the Worlds 2026 Quiz's one-screen presentation; the general Pro
 * Play Quiz keeps its Next control and never calls this).
 *
 * The hold is pure presentation. It starts only from a reveal the SERVER
 * graded (`projection.reveal` exists only after a received grade), so nothing
 * advances while a grade is pending or after a failed submit. What "advance"
 * means — the delivered next question, the end summary, or a resync — stays
 * the controller's `next`, which refuses while a request is in flight.
 *
 * Two parts, because the reveal is staged:
 *  - STAGING: the tablets' values and the footer fade in over
 *    `REVEAL_VALUE_DELAY_MS + stagger + REVEAL_VALUE_DURATION_MS`
 *    (`ProPlayRevealFooter`'s own timing); the player cannot read what has not
 *    appeared, so the clock starts after it. Nil under reduced motion.
 *  - READING: Practice's rule — the evidence beat as a floor, then a reading
 *    allowance for the sentence — so a long explanation is never cut short.
 * The upper bound keeps one stuck-open reveal from stalling a run, and
 * `usePracticeRevealPause` (focus / press inside the footer, an open dialog or
 * dock panel, a hidden tab) holds the clock without losing its place.
 */
import { REVEAL_HOLD_EVIDENCE_MS } from "@/lib/ranked-core/pacing";
import type { ProPlayRevealData } from "@/lib/pro-play/arena";
import {
  REVEAL_VALUE_DELAY_MS,
  REVEAL_VALUE_DURATION_MS,
  REVEAL_VALUE_STAGGER_MS,
  splitExplanation,
} from "@/components/pro-play/arena/reveal";

export const PRO_PLAY_READ_BASE_MS = 1200;
export const PRO_PLAY_READ_MS_PER_CHAR = 45;
export const PRO_PLAY_READ_MAX_MS = 12_000;

/** Time before a graded reveal has finished drawing itself. */
export function proPlayRevealStagingMs(optionCount: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return REVEAL_VALUE_DELAY_MS
    + Math.max(0, optionCount - 1) * REVEAL_VALUE_STAGGER_MS
    + 80
    + REVEAL_VALUE_DURATION_MS;
}

/**
 * The reveal's hold in ms, or null when there is no graded reveal on stage
 * (nothing is ever advanced without one).
 */
export function proPlayRevealHoldMs(
  reveal: ProPlayRevealData | null,
  optionCount: number,
  reducedMotion: boolean,
): number | null {
  if (!reveal) return null;
  const text = splitExplanation(reveal.explanation).primary ?? "";
  const reading = Math.min(
    PRO_PLAY_READ_MAX_MS,
    Math.max(REVEAL_HOLD_EVIDENCE_MS, PRO_PLAY_READ_BASE_MS + text.length * PRO_PLAY_READ_MS_PER_CHAR),
  );
  return proPlayRevealStagingMs(optionCount, reducedMotion) + reading;
}

/**
 * The explanation's type tier on a phone, from its length alone (before
 * layout), so the held reveal box tightens its text instead of growing. The
 * same tiers as Practice's `practiceExplanationDensity`.
 */
export type ProPlayExplanationDensity = "normal" | "medium" | "long" | "dense";

export function proPlayExplanationDensity(text: string | null | undefined): ProPlayExplanationDensity {
  const n = (text ?? "").trim().length;
  if (n <= 100) return "normal";
  if (n <= 150) return "medium";
  if (n <= 220) return "long";
  return "dense";
}
