/**
 * Modern Mastery per-question reveal — the shared state, timing and styling
 * vocabulary.
 *
 * ONE reveal duration for every modern Mastery question, standalone and
 * Ranked alike. It is deliberately not a per-question-type table: the reveal
 * is feedback pacing, not a property of the question. The backend freezes the
 * same number into a Ranked segment (`segment_state.reveal_window_ms`) so the
 * competitive clock and the block deadline can be compensated for it; a client
 * that is told a window prefers the server's number over this constant, and
 * falls back to it when the server states none (an older segment, or the
 * standalone player, which has no competitive clock to protect).
 *
 * Nothing here computes correctness. `MasteryChoiceReveal` is a description of
 * an ALREADY-GRADED result handed down from the server — which option was
 * correct, and which one the player picked — and the components that consume
 * it only choose colours from it.
 */
import { useEffect, useRef } from "react";

/** The single shared reveal interval, in milliseconds. */
export const MASTERY_REVEAL_DURATION_MS = 1750;

/**
 * The reveal state of one answer-choice group.
 *
 * `correctValue` is the option value the SERVER states is correct;
 * `selectedValue` is the option value the player submitted. Both are wire
 * values (never labels), so a renderer compares what the server compared.
 */
export interface MasteryChoiceReveal {
  readonly correctValue: string | null;
  readonly selectedValue: string | null;
}

/** How one option should be painted during a reveal. */
export type MasteryChoiceTone =
  | "neutral"
  | "correct"
  | "chosen-wrong"
  | "muted";

/**
 * The tone for one option — the whole styling rule, in one testable function.
 *
 * A chosen-AND-correct option reads as `correct`: it stays visually selected
 * and gains the green treatment, rather than being given a third colour that
 * would say the same thing twice.
 */
export function choiceTone(
  optionValue: string,
  reveal: MasteryChoiceReveal | null | undefined,
): MasteryChoiceTone {
  if (!reveal) return "neutral";
  if (reveal.correctValue !== null && optionValue === reveal.correctValue) {
    return "correct";
  }
  if (reveal.selectedValue !== null && optionValue === reveal.selectedValue) {
    return "chosen-wrong";
  }
  return "muted";
}

/**
 * Reveal styling, in the app's existing token vocabulary.
 *
 * Outline + soft glow only: no background flash, no size or spacing change, so
 * the row occupies the identical box it did while it was answerable and the
 * card never jumps as the reveal lands.
 */
export const CHOICE_TONE_CLASS: Record<MasteryChoiceTone, string> = {
  neutral: "border-border",
  correct:
    "border-emerald-500 ring-1 ring-emerald-500/60 shadow-[0_0_12px_-2px_rgba(16,185,129,0.55)] bg-emerald-500/5",
  "chosen-wrong":
    "border-destructive ring-1 ring-destructive/60 shadow-[0_0_12px_-2px_hsl(var(--destructive)/0.5)] bg-destructive/5",
  muted: "border-border opacity-50",
};

/**
 * Run `onElapsed` once, `delayMs` after this reveal appears.
 *
 * `key` identifies the reveal being watched — the question's sequence index in
 * standalone, the challenge index in Ranked. Four properties matter and all
 * three of the task's timer hazards fall out of them:
 *
 * * ONE timer per reveal — the effect is keyed on `key`, so a re-render, a
 *   duplicate poll or a duplicate state update cannot stack a second timer;
 * * cleanup on unmount and on question change — the effect's teardown clears
 *   it, so navigating away or advancing early cancels the pending fire;
 * * a stale timer cannot advance a newer question — the fired callback is
 *   re-checked against the key the timer was armed for before it runs;
 * * a null `key` disarms entirely, which is how "not in a reveal" is spelled.
 */
export function useRevealAutoAdvance(
  key: string | number | null,
  onElapsed: () => void,
  delayMs: number = MASTERY_REVEAL_DURATION_MS,
): void {
  const callbackRef = useRef(onElapsed);
  callbackRef.current = onElapsed;
  const firedFor = useRef<string | number | null>(null);

  useEffect(() => {
    if (key === null) return;
    // Already advanced for this exact reveal: never schedule a second one.
    if (firedFor.current === key) return;
    const armedFor = key;
    const handle = window.setTimeout(() => {
      if (firedFor.current === armedFor) return;
      firedFor.current = armedFor;
      callbackRef.current();
    }, delayMs);
    return () => window.clearTimeout(handle);
  }, [key, delayMs]);
}

/**
 * The reveal duration a surface should actually use.
 *
 * The server's frozen window wins wherever one exists, because that is the
 * number its deadline compensation and its response-time arithmetic were
 * computed against — a client that paused for longer would spend competitive
 * time it was not given.
 */
export function revealDurationMs(serverWindowMs?: number | null): number {
  return typeof serverWindowMs === "number" && serverWindowMs > 0
    ? serverWindowMs
    : MASTERY_REVEAL_DURATION_MS;
}

/**
 * Everything a modern Mastery question view needs to render its own in-place
 * reveal — the graded result, the option tinting, and the factual line below.
 *
 * Assembled by whichever surface owns the server payload (the standalone
 * player from `MasteryPlayerReveal`, the Ranked adapter from
 * `own_challenge_reveals`), so the two renderers stay thin and identical in
 * behaviour no matter which surface they are mounted on.
 */
export interface MasteryQuestionReveal extends MasteryChoiceReveal {
  /** Server-authoritative correctness. Never computed client-side. */
  readonly correct: boolean;
  /** The correct answer as the player should read it, backend-formatted. */
  readonly answerLabel: string | null;
  /** The backend's concise explanation, or null when it states none. */
  readonly explanation: string | null;
}
