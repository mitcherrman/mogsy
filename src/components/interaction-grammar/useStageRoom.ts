/**
 * MIG — how much vertical room the arena's question stage gives a module.
 *
 * The CanonicalArena wraps a module's viewport in a content-sized, centred box
 * (`lg:my-auto`), so a primitive that wants to SPEND the stage rather than sit
 * in the middle of it has to be told the stage's inner height. Match Grid
 * (GM-M1 / P3) established the pattern: measure the nearest
 * `.ranked-question-stage` before paint, re-measure on resize, and hand the
 * primitive a definite `maxHeight`. Outside a stage (tests, a bare lab) it
 * reads `undefined` and the primitive keeps its natural height.
 *
 * The HOST calls this, never the primitive: the primitive knows nothing about
 * the arena's class names.
 */
import { useLayoutEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

export const STAGE_SLACK_PX = 2;

export function useStageRoom(ref: RefObject<HTMLElement | null>): number | undefined {
  const [room, setRoom] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    const stage = el?.closest<HTMLElement>(".ranked-question-stage");
    if (!el || !stage) return;
    const read = () => {
      const cs = getComputedStyle(stage);
      const inner = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const next = Math.floor(inner - STAGE_SLACK_PX);
      setRoom((r) => (r === next || next <= 0 ? r : next));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => flushSync(read));
    ro.observe(stage);
    return () => ro.disconnect();
  }, [ref]);
  return room;
}
