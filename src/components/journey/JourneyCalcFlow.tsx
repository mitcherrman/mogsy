/**
 * JP3 — a served explanation's display precision.
 *
 * (JP3's calculation cells were replaced by JP4's Reasoning Chain,
 * `JourneyReasoning.tsx` / `lib/journey/reasoning.ts`. What stays here is the
 * one explanation rule a chain-less reveal still needs.)
 */

/**
 * A served explanation that states a derived value AND its rounding
 * ("…: 24.024 armor, which rounds to 24 for this question.") reads with the
 * whole value only; the exact one moves to a hover note. Anything else is
 * returned verbatim — a sentence this does not recognise is never rewritten.
 */
export function displayExplanation(text: string): { text: string; exact: string | null } {
  const m = /^(.*): (-?\d+(?:\.\d+)?) ([a-z][a-z ]*), which rounds to (-?\d+) for this question\.$/i.exec(text.trim());
  if (!m) return { text, exact: null };
  const [, head, exact, unit, shown] = m;
  return {
    text: `${head}: ${shown} ${unit}.`,
    exact: `Exact value ${exact} · shown as ${shown}, rounded for display. Calculations use the exact value.`,
  };
}
