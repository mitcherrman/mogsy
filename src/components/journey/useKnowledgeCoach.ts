/**
 * JATTN1 — THE BOARD COACH: teach the board once, the first time it SAVES a
 * fact (any fact — an ability's cooldown or raw damage, a champion's stat —
 * not only a portrait stat, which is all JP4/JP5's portrait coach waited for).
 *
 *   "The board saves facts as you go. Hover or click highlighted parts for context."
 *   (coarse pointer: "… Tap highlighted parts for context.")
 *
 * It is a Mogzy Guide message (`useMogzyGuide`: the guide's priority, its
 * once-per-browser storage under a new Journey key, its TTL-as-dismissal), drawn
 * as a compact, Mogzy-faced, NON-MODAL pill beside the board — never the full
 * `MogzyGuide` panel over it.
 *
 * NEVER ON THE CLOCK. It shows only while the Journey is clock-free: the reveal
 * hold after a result has landed and the transition beat that follows it
 * (`clockFreeUntil`: the client instant the next answer window opens; Infinity
 * once the viewer's Journey is finished). It leaves by that instant whatever
 * its TTL says, and when too little clock-free time is left for it to be read
 * (`BOARD_COACH_MIN_MS`) it waits, latched, for the next clock-free window — so
 * it can never take a Survival child's time.
 *
 * It also waits while a board popover is open, and leaves on a tap/click
 * anywhere on it or on the board, on a keyboard interaction with the board, on
 * Escape, and by itself. A reload never fires it: the latch arms only on a
 * fact saved while the viewer watches (`useSavedNow`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  createGuideStorage, guideStorageKey, useMogzyGuide, type GuideMessage, type GuideStorage, type MogzyGuideController,
} from "@/components/mogzy-guide";

/** The Mogzy Guide surface + message id: storage key `mogzy-guide:v1:journey-board:board-saves-v1`. */
export const BOARD_COACH_SURFACE = "journey-board";
export const BOARD_COACH_ID = "board-saves-v1";
export const BOARD_COACH_KEY = guideStorageKey(BOARD_COACH_SURFACE, BOARD_COACH_ID);
/** How long the coach stays up by itself, at most. */
export const BOARD_COACH_TTL_MS = 7000;
/** The least clock-free time worth starting it in; less defers it to the next window. */
export const BOARD_COACH_MIN_MS = 2000;

export const BOARD_COACH_COPY = {
  fine: "The board saves facts as you go. Hover or click highlighted parts for context.",
  coarse: "The board saves facts as you go. Tap highlighted parts for context.",
} as const;

/**
 * One storage for every board in this page load (the guide's own convention:
 * localStorage, with an in-memory fallback when it is unavailable).
 */
let storage: GuideStorage = createGuideStorage();

/** Test seam: forget that the coach was shown (and its in-memory fallback). */
export function resetKnowledgeCoach() {
  storage.clear(BOARD_COACH_KEY);
  storage = createGuideStorage();
}

/** Is any board popover (a `!` card, a portrait / item / shard sheet) open? Radix marks its trigger. */
function boardPopoverOpen(board: HTMLElement | null): boolean {
  return Boolean(board?.querySelector('[aria-haspopup="dialog"][data-state="open"]'));
}

export interface BoardCoach {
  visible: boolean;
  text: string;
  dismiss: () => void;
}

/**
 * `savedNow`: a fact was saved on the board just now (a live reveal, never a
 * reload). `clockFreeUntil`: the client-clock ms the next answer window opens
 * (null = an answer window is open now; Infinity = no answer window follows).
 */
export function useBoardCoach({ savedNow, clockFreeUntil, coarse, boardRef }: {
  savedNow: boolean;
  clockFreeUntil: number | null;
  coarse: boolean;
  boardRef: RefObject<HTMLElement>;
}): BoardCoach {
  const text = coarse ? BOARD_COACH_COPY.coarse : BOARD_COACH_COPY.fine;
  // The latch: armed by the first live save, kept until the coach has shown.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (savedNow && !storage.has(BOARD_COACH_KEY)) setArmed(true);
  }, [savedNow]);

  // Re-render when the board's popovers open or close, so a coach that is
  // waiting for one to close can start.
  const [popoverTick, setPopoverTick] = useState(0);
  useEffect(() => {
    const board = boardRef.current;
    if (!armed || !board || typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(() => setPopoverTick((n) => n + 1));
    mo.observe(board, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
    return () => mo.disconnect();
  }, [armed, boardRef]);

  const left = clockFreeUntil === null ? 0 : clockFreeUntil - Date.now();
  const canStart = armed && left >= BOARD_COACH_MIN_MS && !boardPopoverOpen(boardRef.current);
  // `canStart` gates the START; once shown, it ends by the rules below.
  const [showing, setShowing] = useState<{ ttl: number } | null>(null);
  useEffect(() => {
    if (!showing && canStart) setShowing({ ttl: Math.min(BOARD_COACH_TTL_MS, left) });
    // `left` is read at the moment it starts; `popoverTick` re-evaluates `canStart`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStart, popoverTick]);

  const messages = useMemo<GuideMessage[]>(() => (showing ? [{
    id: BOARD_COACH_ID, priority: "first-use", text, once: "show", dismissible: true, ttlMs: showing.ttl,
  }] : []), [showing, text]);
  const guide = useMogzyGuide({ surface: BOARD_COACH_SURFACE, messages, storage, enabled: showing !== null });
  const guideRef = useRef<MogzyGuideController>(guide);
  guideRef.current = guide;
  const visible = showing !== null && guide.message?.id === BOARD_COACH_ID;

  const dismiss = useCallback(() => {
    guideRef.current.dismiss(BOARD_COACH_ID);
    setArmed(false);
    setShowing(null);
  }, []);

  // The guide's own TTL dismissal ends it too (the message leaves `guide.message`).
  const wasVisible = useRef(false);
  useEffect(() => {
    if (wasVisible.current && !visible) dismiss();
    wasVisible.current = visible;
  }, [visible, dismiss]);

  // Never on the clock: gone by the instant the next answer window opens.
  useEffect(() => {
    if (!visible) return;
    if (clockFreeUntil === null) { dismiss(); return; }
    if (!Number.isFinite(clockFreeUntil)) return;
    const t = setTimeout(dismiss, Math.max(0, clockFreeUntil - Date.now()));
    return () => clearTimeout(t);
  }, [visible, clockFreeUntil, dismiss]);

  // Escape anywhere; any pointer / Enter / Space interaction with the board.
  useEffect(() => {
    if (!visible) return;
    const board = boardRef.current;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    const onBoardKey = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") dismiss(); };
    document.addEventListener("keydown", onKey);
    board?.addEventListener("pointerdown", dismiss, true);
    board?.addEventListener("keydown", onBoardKey, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      board?.removeEventListener("pointerdown", dismiss, true);
      board?.removeEventListener("keydown", onBoardKey, true);
    };
  }, [visible, dismiss, boardRef]);

  return { visible, text, dismiss };
}
