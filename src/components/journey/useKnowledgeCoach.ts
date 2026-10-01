/**
 * JP4 — TEACH THE `!` ONCE (JP5: the portrait's `!`).
 *
 * A champion's stats are reviewed in its champion portrait popup, which wears
 * the `!` once it holds any established or stated stat. So the first time a
 * portrait BECOMES reviewable while the learner watches, a short coach says so
 * — "Tap champion portraits to review stats." It leaves by itself (or on the
 * first tap), and it does not come back: seen once per browser (a per-viewer
 * convenience, so plain storage; if storage is unavailable, once per page load).
 *
 * The key is the instruction's own: it replaced JP4's board-based "Learned facts
 * live on the board" coach (`mogzy.journey.knowledgeCoach.v1`), so a viewer who
 * saw that one still gets this one once.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const KNOWLEDGE_COACH_KEY = "mogzy.journey.portraitCoach.v1";
/** How long the coach stays up by itself. */
export const KNOWLEDGE_COACH_MS = 5200;

let seenThisLoad = false;

function seen(): boolean {
  if (seenThisLoad) return true;
  try { return window.localStorage.getItem(KNOWLEDGE_COACH_KEY) === "seen"; } catch { return false; }
}

function markSeen() {
  seenThisLoad = true;
  try { window.localStorage.setItem(KNOWLEDGE_COACH_KEY, "seen"); } catch { /* per-load only */ }
}

/** Test seam: forget that the coach was shown. */
export function resetKnowledgeCoach() {
  seenThisLoad = false;
  try { window.localStorage.removeItem(KNOWLEDGE_COACH_KEY); } catch { /* nothing to reset */ }
}

/** `learnedNow`: a champion portrait became reviewable just now (it gained its `!`). */
export function useKnowledgeCoach(learnedNow: boolean) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setVisible(false);
  }, []);
  useEffect(() => {
    if (!learnedNow || seen()) return;
    markSeen();
    setVisible(true);
    timer.current = setTimeout(() => { timer.current = null; setVisible(false); }, KNOWLEDGE_COACH_MS);
  }, [learnedNow]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { visible, dismiss };
}
