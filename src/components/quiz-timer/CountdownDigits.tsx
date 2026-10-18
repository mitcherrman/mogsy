/**
 * MISC W2D (F11) — THE FINAL-SECONDS PULSE, for any presenter of an answer
 * clock.
 *
 * The clock element gets (from `countdownDataAttrs`) `data-countdown` (5…1) and
 * `data-countdown-intensity` (warn | strong | final); its digits are wrapped
 * in one span keyed by the second, so each beat REMOUNTS the span and replays
 * the one-shot `quiz-countdown-beat` keyframes in `index.css`. Transform and
 * text-shadow only — nothing lays out, so the clock's box, the header and
 * the answers below cannot move. Reduced motion (OS or the app's
 * `html.reduce-motion`) drops the motion and keeps a static, escalating glow.
 *
 * Pure presentation of a value the controller already projected: it decides
 * nothing and plays no sound (the controller owns that, once).
 */
import type { ReactNode } from "react";

import { countdownVisualBeat, type CountdownClockLike } from "@/lib/quiz-timer/countdownFeedback";

export function CountdownDigits({ timer, children }: { timer: CountdownClockLike; children: ReactNode }) {
  const beat = countdownVisualBeat(timer);
  return (
    <span key={beat === null ? "steady" : `beat-${beat}`} className="quiz-countdown-digits">
      {children}
    </span>
  );
}
