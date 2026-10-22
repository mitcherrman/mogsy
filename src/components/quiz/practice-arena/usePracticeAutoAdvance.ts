/**
 * PM2 — Practice advances by itself after a graded reveal. No Next button.
 *
 * Two hooks, both presentation-side. `Quiz.tsx` still owns what "advance"
 * MEANS (the next question, or the results on the last one) and guards it so a
 * question can only be left once; these only decide WHEN to ask.
 *
 * `usePracticeAutoAdvance` — one timer per reveal.
 *  - Armed only for a reveal that has a hold (`practiceRevealHoldMs`): a
 *    pending grade or a failed submit has none, so nothing advances while the
 *    backend has not answered, and an unverified answer waits for the player.
 *  - Keyed on the reveal's identity (run + position). A new key, a null key
 *    and unmount all clear the timer, so a replay, a new session, navigating
 *    away or an error can never be advanced by a stale callback.
 *  - Fires at most once per key, even across pauses and re-renders.
 *  - Pausable without losing its place: a pause banks the time left and a
 *    resume spends only that.
 *
 * `usePracticeRevealPause` — when the reveal must hold still. The player is
 * pressing or has focus inside the reveal (reading it, or tabbing to its
 * source link); a dialog is open over the page (the leave confirmation); a
 * Mogzy dock panel is open (the Report panel reports the question ON SCREEN —
 * moving on under it would report the wrong one); or the tab is hidden.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

export interface PracticeAutoAdvanceArgs {
  /** The reveal on stage (run + position), or null when nothing is revealed. */
  revealKey: string | null;
  /** How long this reveal holds, or null for "never by itself". */
  holdMs: number | null;
  /** True while the reveal must hold still. */
  paused: boolean;
  onAdvance: () => void;
}

interface HoldState {
  key: string | null;
  remainingMs: number;
  fired: boolean;
}

export function usePracticeAutoAdvance({ revealKey, holdMs, paused, onAdvance }: PracticeAutoAdvanceArgs): void {
  const onAdvanceRef = useRef(onAdvance);
  onAdvanceRef.current = onAdvance;
  const hold = useRef<HoldState>({ key: null, remainingMs: 0, fired: false });

  useEffect(() => {
    if (revealKey === null || holdMs === null) {
      hold.current = { key: null, remainingMs: 0, fired: false };
      return;
    }
    if (hold.current.key !== revealKey) {
      hold.current = { key: revealKey, remainingMs: holdMs, fired: false };
    }
    const state = hold.current;
    if (state.fired || paused) return;
    const startedAt = Date.now();
    const id = window.setTimeout(() => {
      // A later reveal replaced this one's state object: it is not ours to fire.
      if (hold.current !== state || state.fired) return;
      state.fired = true;
      onAdvanceRef.current();
    }, state.remainingMs);
    return () => {
      window.clearTimeout(id);
      if (!state.fired) {
        state.remainingMs = Math.max(0, state.remainingMs - (Date.now() - startedAt));
      }
    };
  }, [revealKey, holdMs, paused]);
}

/** Something over the page that the player is dealing with right now. */
const BLOCKING_OVERLAY =
  '[role="alertdialog"], [role="dialog"], [data-testid^="mogzy-dock-panels-"]:not(:empty)';

function overlayOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector(BLOCKING_OVERLAY) !== null;
}

function documentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * True while the reveal in `revealRef` must not advance. Listens only while
 * `active` (a reveal with a hold is on screen), so an unanswered question
 * costs nothing.
 */
export function usePracticeRevealPause(revealRef: RefObject<HTMLElement>, active: boolean): boolean {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!active) {
      setPressed(false);
      setFocused(false);
      setOverlay(false);
      setHidden(false);
      return;
    }
    const el = revealRef.current;
    const syncFocus = () => {
      const now = document.activeElement;
      setFocused(Boolean(el && now && now !== document.body && el.contains(now)));
    };
    const syncOverlay = () => setOverlay(overlayOpen());
    const syncHidden = () => setHidden(documentHidden());
    const press = () => setPressed(true);
    const release = () => setPressed(false);

    syncFocus();
    syncOverlay();
    syncHidden();
    el?.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    document.addEventListener("focusin", syncFocus);
    document.addEventListener("focusout", syncFocus);
    document.addEventListener("visibilitychange", syncHidden);
    const observer = typeof MutationObserver === "function" ? new MutationObserver(syncOverlay) : null;
    observer?.observe(document.body, { childList: true, subtree: true });
    return () => {
      el?.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      document.removeEventListener("focusin", syncFocus);
      document.removeEventListener("focusout", syncFocus);
      document.removeEventListener("visibilitychange", syncHidden);
      observer?.disconnect();
    };
  }, [revealRef, active]);

  return active && (pressed || focused || overlay || hidden);
}
