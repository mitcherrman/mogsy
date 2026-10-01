/**
 * JP4 — TEACH THE `!` ONCE.
 *
 * Learned history lives on the board's objects: a learned value is NOT
 * reprinted on later steps, and a champion's stats are reviewed in its champion
 * portrait popup. So the first time a `!` arrives (a reveal establishing a
 * fact), a short coach says so — "Tap champion portraits to review stats." —
 * and the fresh `!` pulses. It leaves by itself (or on the first tap), and it does
 * not come back: seen once per browser (a per-viewer convenience, so plain
 * storage; if storage is unavailable, once per page load).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const KNOWLEDGE_COACH_KEY = "mogzy.journey.knowledgeCoach.v1";
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

/** `learnedNow`: a fact was established just now (the board's one-shot glow). */
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
