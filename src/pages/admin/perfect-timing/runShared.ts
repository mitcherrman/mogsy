/**
 * PT5 — what the Random Run and the Mastery Slice orchestrators share: the
 * input guards' timings and the recovery copy. One definition, so the two
 * modes cannot drift on what "voided" or "the lab is off" means.
 */
import type { InterruptReason } from "@/lib/perfect-timing/timingEngine";

/** PT4.4: after a KEY advances the reveal, Space/Enter are ignored this long, so a double-tap cannot also start the round it armed. */
export const ADVANCE_KEY_GUARD_MS = 250;

/** How long the stop reads "Locked" before it reads "checking the archive". */
export const SUBMITTING_DELAY_MS = 250;

export const VOID_TEXT: Record<InterruptReason, string> = {
  hidden: "Run interrupted — round voided. The tab was hidden while timing.",
  pagehide: "Run interrupted — round voided. The page was left while timing.",
  clock: "Run interrupted — round voided. The browser clock jumped.",
  timeout: "Run interrupted — round voided. Over ten minutes passed.",
};

export function dealErrorText(status: number | null, message: string): string {
  if (status === 404) return "The Perfect Timing lab is not enabled on this backend (PERFECT_TIMING_LAB_ENABLED).";
  if (status === 401 || status === 403) return "This backend did not accept an owner session for the Perfect Timing lab.";
  return message;
}
