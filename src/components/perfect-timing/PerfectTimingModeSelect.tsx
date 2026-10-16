/**
 * PERFECT TIMING — THE MODE PICK (PT5): two ways to play, one choice, one
 * screen.
 *
 *   Random Run     five abilities, one at a time (the PT4.4 game, unchanged)
 *   Mastery Slice  one ability, three stages: rank 1, rank 3, rank 3 + an item
 *
 * Two plates and nothing else: no instructions, no badges. The first plate
 * takes focus, so Enter starts a Random Run and Tab/arrow then Enter picks the
 * other. It fits the fixed screen like every other state.
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import "./perfectTiming.css";

export type PtMode = "random" | "slice";

const MODES: readonly { mode: PtMode; title: string; line: string; steps: readonly string[] }[] = [
  { mode: "random", title: "Random Run", line: "Five abilities, one at a time.", steps: ["5 rounds"] },
  { mode: "slice", title: "Mastery Slice", line: "One ability. Rank it up, then equip it.", steps: ["Rank 1", "Rank 3", "+ Item"] },
];

export function PerfectTimingModeSelect({ onPick, autoFocus = true }: { onPick: (mode: PtMode) => void; autoFocus?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus({ preventScroll: true });
  }, [autoFocus]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const at = refs.current.findIndex((b) => b === document.activeElement);
    const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    refs.current[(Math.max(0, at) + step + MODES.length) % MODES.length]?.focus({ preventScroll: true });
  };

  return (
    <section className="pt-modes" data-testid="pt-mode-select" aria-label="Choose how to play">
      <p className="pt-modes-eyebrow">Perfect Timing</p>
      <div className="pt-modes-grid" role="group" onKeyDown={onKeyDown}>
        {MODES.map((m, i) => (
          <button key={m.mode} ref={(el) => { refs.current[i] = el; }} type="button" className="pt-mode"
            data-mode={m.mode} data-testid={`pt-mode-${m.mode}`} onClick={() => onPick(m.mode)}>
            <span className="pt-mode-glyph" aria-hidden>
              {m.mode === "random"
                ? Array.from({ length: 5 }, (_, k) => <i key={k} />)
                : [0, 1, 2].map((k) => <i key={k} data-step={k} />)}
            </span>
            <span className="pt-mode-title">{m.title}</span>
            <span className="pt-mode-line">{m.line}</span>
            <span className="pt-mode-steps" aria-hidden>
              {m.steps.map((s, k) => <span key={s}>{k > 0 ? <em>›</em> : null}{s}</span>)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
