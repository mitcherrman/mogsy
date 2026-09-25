/**
 * JOURNEY-UI1 — the transition beat, drawn ON the board, between children.
 *
 * A translucent scrim over the board (the updated board stays visible behind
 * it, its changed facts pulsing) with the transition's label as a stamp and
 * one short line per event, staged across the beat in the server's order:
 *
 *     FIRST BACK
 *     Jarvan IV recalls · Caulfield's Warhammer (1050g)
 *     Jarvan IV · Bonus AD 0 → 20
 *     Jarvan IV · AH 0 → 10
 *
 * Absolutely positioned inside the board's own box, so it adds no height and
 * moves nothing. Mounted only while the beat runs; the lasting delta chips on
 * the board carry the same information for the rest of the child. With reduced
 * motion the lines appear at once — the beat's LENGTH is still the server's.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { JourneyPublicState } from "@/lib/journey/contract";
import { journeySide } from "@/lib/journey/contract";
import { eventDelaysMs, eventLine } from "@/lib/journey/beat";

/** The stamp word: a recall, a level-up, or simply the next state. */
function stampFor(state: JourneyPublicState): string {
  const events = state.transition?.events ?? [];
  if (events.some((e) => e.kind === "purchase" && e.group === "recall")) return "Recall";
  if (events.some((e) => e.kind === "ability_unlock")) return "Ultimate unlocked";
  if (events.some((e) => e.kind === "level")) return "Level up";
  if (events.some((e) => e.kind === "purchase")) return "Purchase";
  return "State change";
}

export function JourneyTransitionBeat({ state }: { state: JourneyPublicState }) {
  const reduce = useReducedMotion();
  const t = state.transition;
  if (!t) return null;
  const delays = eventDelaysMs(t.events.length, t.beat.ms);
  const name = (side: "subject" | "opponent") => journeySide(state, side).championName;
  return (
    <div data-testid="journey-beat" role="status" aria-live="polite"
      className="journey-beat pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 px-3 text-center">
      <span aria-hidden className="absolute inset-0 bg-[#060d18]/88 backdrop-blur-[2px]" />
      <motion.span
        className="journey-beat__stamp relative rounded-md border border-[#d4b35a]/60 bg-black/60 px-2 font-black uppercase tracking-[0.3em] text-[#f3dca0]"
        initial={reduce ? false : { scale: 1.25, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}>
        {stampFor(state)}
      </motion.span>
      {t.label && (
        <span className="journey-beat__label relative font-semibold text-white/85">{t.label}</span>
      )}
      <ul className="journey-beat__lines relative flex max-h-[60%] flex-col items-center overflow-hidden">
        {t.events.map((e, i) => (
          <motion.li key={i} data-testid="journey-beat-line"
            className="journey-beat__line font-bold uppercase tracking-[0.1em] text-white"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : delays[i] / 1000, duration: 0.22 }}>
            {eventLine(e, name)}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
