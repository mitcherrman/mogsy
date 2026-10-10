/**
 * Live `(pointer: coarse)` — the PRIMARY pointer is a finger. A touch laptop
 * whose primary pointer is its trackpad reads as fine.
 *
 * Lifted out of `QuestionReviewHost` (HISTORY-D), which re-exports it, so a
 * surface that only needs the pointer question (the Journey board coach) does
 * not import the question inspector with it.
 */
import { useEffect, useState } from "react";

const COARSE_QUERY = "(pointer: coarse)";

export function readCoarsePointer(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(COARSE_QUERY)?.matches);
}

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(readCoarsePointer);
  useEffect(() => {
    const mq = window.matchMedia?.(COARSE_QUERY);
    const sync = () => setCoarse(readCoarsePointer());
    sync();
    mq?.addEventListener?.("change", sync);
    return () => mq?.removeEventListener?.("change", sync);
  }, []);
  return coarse;
}
