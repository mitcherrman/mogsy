/**
 * Academy Core V3.5 — the destination / navigation behaviour, separated from
 * the orbital presentation.
 *
 * This is the V3 home's contract carried over unchanged (the same logic as the
 * V3 Core's `AcademyCoreHome`, which this home replaced; see git history of
 * `src/pages/academy-core/AcademyCorePage.tsx`), lifted into a hook so the
 * orrery can render it any way it likes:
 *
 *   · hover / keyboard focus engages a room (a 140 ms grace before a leave
 *     clears it); the crystal's pinned preview is the fallback focus;
 *   · a plain click runs the approved 240 ms activation and then navigates;
 *     modified clicks are the browser's own; reduced motion navigates at
 *     once; a second press during the activation is ignored; the latch is
 *     released again by popstate / pageshow or after a settle window;
 *   · the crystal cycles previews WITHOUT navigating.
 *
 * Added for the orrery: pointer focus and keyboard focus are kept apart. The
 * pointer's book is emphasised where it is (a book must not move out from
 * under the cursor that is on it); a keyboard-focused or pinned book has no
 * pointer to lose, so the scene may bring it toward the viewer.
 *
 * HOVER-TO-FRONT. A desktop hover that rests on a book for HOVER_INTENT_MS
 * becomes a selection: the page turns the whole orbit to bring that book front
 * and centre (the arrows' own turn and hold) and the hover is HELD. The orbit
 * then moves the book out from under a still cursor, and other books slide under
 * it, so the browser fires pointerenter / pointerleave for geometry that moved,
 * not for a hand that did. Only REAL pointer movement (the coordinates changed)
 * is read as intent:
 *   · a real move onto a book makes it the pointer's book (as before) and
 *     starts its dwell; a pass shorter than the dwell never selects;
 *   · while a hover is held, its book's leave events are ignored, and a switch
 *     to another book needs the hand to have travelled HOLD_SLOP_PX first;
 *   · the hold ends when the pointer really leaves the stage (the emphasis goes;
 *     the selection stays held at the front, as an arrow selection does), when an
 *     arrow or the crystal is used, or when open space is pressed or dragged;
 *   · a pass over another book shorter than the dwell is a temporary emphasis
 *     only: the held, arrow or crystal selection comes back when it ends.
 * Reduced motion, the phone composition and touch keep the in-place hover.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { trackFunnelEvent } from "@/lib/funnel-analytics";
import { prefetchRoute } from "@/lib/route-prefetch";
import { usePlaySfx } from "@/lib/audio/usePlaySfx";
import { useSfx } from "@/lib/audio/useSfx";
import {
  BOOK_ACTIVATION_MS,
  CORE_CYCLE_ORDER,
  type CoreDestination,
  type CoreFocus,
} from "@/pages/academy-core/academy-core-destinations";

/** Same grace the Mogzy guide uses before a leave clears a hover message. */
const FOCUS_RELEASE_MS = 140;
/** A hover must rest this long on a book before it turns the orbit (a pass across a book never does). */
export const HOVER_INTENT_MS = 180;
/** Distance (px) the pointer must really travel, once a hover is held, before another book can take it. */
export const HOLD_SLOP_PX = 6;
/** How long after navigating the activation state may stay on while the Core is still mounted. */
const ACTIVATION_SETTLE_MS = 1500;

/** A click the browser should keep (new tab, download, context): never delayed. */
export function isModifiedClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

export interface CoreNavigator {
  /** What the crystal, Mogzy and the scene show: pointer, else keyboard, else the pinned preview. */
  focus: CoreFocus;
  pointerFocus: CoreFocus;
  keyboardFocus: CoreFocus;
  pinned: CoreFocus;
  /**
   * Who set `pinned`: the crystal's preview cycle, or the arrow selector. There is
   * ONE previewed destination; the source only decides how the scene shows it
   * (the crystal brings the book beside the lens, the selector turns the orbit).
   */
  pinSource: "crystal" | "selector";
  activating: CoreFocus | null;
  cancelRelease: () => void;
  cycle: () => void;
  /** The arrow selector chose `id` (never navigates). */
  select: (id: CoreFocus) => void;
  /** Drop a selector choice (a grab of the orbit); a crystal preview is left alone. */
  clearSelection: () => void;
  /** The book a committed hover holds at the front ("idle" when none). */
  hoverHold: CoreFocus;
  /** The stage's own pointermove (outside a drag): real movement is the only hover intent. */
  onStagePointerMove: (e: React.PointerEvent) => void;
  /** The pointer really left the stage: the held hover (and any pointer emphasis) ends. */
  onStagePointerLeave: (e: React.PointerEvent) => void;
  /** End every pointer state at once (a press or drag on open space). */
  endHover: () => void;
  bookHandlers: (d: CoreDestination) => {
    onPointerEnter: (e: React.PointerEvent) => void;
    onPointerLeave: () => void;
    onPointerDown: () => void;
    onFocus: (e: React.FocusEvent) => void;
    onBlur: () => void;
  };
  onBookClick: (d: CoreDestination, e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * `onHoverCommit` is asked, when a hover's dwell completes, to bring that book to
 * the front; it returns false when there is nothing to turn (reduced motion, the
 * phone composition, a drag in progress), and the hover then stays in place.
 */
export function useCoreNavigator(reduced: boolean, onHoverCommit?: (id: Exclude<CoreFocus, "idle">) => boolean): CoreNavigator {
  const sfx = useSfx();
  const playSfx = usePlaySfx();
  const navigate = useNavigate();

  const [pointerFocus, setPointerFocusState] = useState<CoreFocus>("idle");
  const pointerRef = useRef<CoreFocus>("idle");
  const setPointerFocus = useCallback((v: CoreFocus) => { pointerRef.current = v; setPointerFocusState(v); }, []);
  const [hoverHold, setHoverHoldState] = useState<CoreFocus>("idle");
  const holdRef = useRef<CoreFocus>("idle");
  const setHoverHold = useCallback((v: CoreFocus) => { holdRef.current = v; setHoverHoldState(v); }, []);
  const commitRef = useRef(onHoverCommit);
  commitRef.current = onHoverCommit;
  const [keyboardFocus, setKeyboardFocus] = useState<CoreFocus>("idle");
  const [pinned, setPinned] = useState<CoreFocus>("idle");
  const [pinSource, setPinSource] = useState<"crystal" | "selector">("crystal");
  const focus: CoreFocus = pointerFocus !== "idle" ? pointerFocus : keyboardFocus !== "idle" ? keyboardFocus : pinned;

  const releaseTimer = useRef<number | null>(null);
  const cancelRelease = useCallback(() => {
    if (releaseTimer.current !== null) { window.clearTimeout(releaseTimer.current); releaseTimer.current = null; }
  }, []);
  const release = useCallback(() => {
    cancelRelease();
    releaseTimer.current = window.setTimeout(() => {
      releaseTimer.current = null;
      // a leave falls back to the held hover's book: a pass over another book gives it back
      setPointerFocus(holdRef.current);
      setKeyboardFocus("idle");
    }, FOCUS_RELEASE_MS);
  }, [cancelRelease, setPointerFocus]);
  useEffect(() => cancelRelease, [cancelRelease]);

  // The focus cue sounds only for authored interactions (fine pointer / Tab).
  const lastTabAt = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Tab") lastTabAt.current = Date.now(); };
    const onPointerDown = () => { lastTabAt.current = Number.NEGATIVE_INFINITY; };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
  const cue = useCallback((input: "pointer" | "keyboard") => {
    if (input === "pointer") {
      if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches !== true) return;
    } else if (Date.now() - lastTabAt.current > 1000) return;
    sfx.play("hub.destination.focus");
  }, [sfx]);

  /* ---------------- hover-to-front: real movement, a dwell, a held hover ---------------- */
  const commitTimer = useRef<number | null>(null);
  const pendingCommit = useRef<CoreFocus>("idle");
  const cancelCommit = useCallback(() => {
    if (commitTimer.current !== null) { window.clearTimeout(commitTimer.current); commitTimer.current = null; }
    pendingCommit.current = "idle";
  }, []);
  useEffect(() => cancelCommit, [cancelCommit]);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const travelSinceHold = useRef(0);
  /** True when the pointer itself moved since its last event here (not the geometry under it). */
  const realMove = useCallback((e: { clientX: number; clientY: number }) => {
    const prev = lastPoint.current;
    lastPoint.current = { x: e.clientX, y: e.clientY };
    if (!prev) return true;
    const d = Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
    travelSinceHold.current += d;
    return d >= 0.5;
  }, []);
  const dropHold = useCallback(() => {
    cancelCommit();
    setHoverHold("idle");
  }, [cancelCommit, setHoverHold]);
  const pointerOver = useCallback((id: Exclude<CoreFocus, "idle">) => {
    const held = holdRef.current;
    if (held !== "idle" && id !== held && travelSinceHold.current < HOLD_SLOP_PX) return; // a nudge, not a choice
    cancelRelease();
    if (pointerRef.current !== id) { setPointerFocus(id); cue("pointer"); }
    if (id === held) { cancelCommit(); return; }
    if (pendingCommit.current === id) return; // its dwell is already running
    cancelCommit();
    pendingCommit.current = id;
    commitTimer.current = window.setTimeout(() => {
      commitTimer.current = null;
      pendingCommit.current = "idle";
      if (pointerRef.current !== id || !commitRef.current?.(id)) return;
      travelSinceHold.current = 0;
      setHoverHold(id);
      setPinned(id);
      setPinSource("selector");
    }, HOVER_INTENT_MS);
  }, [cancelCommit, cancelRelease, cue, setHoverHold, setPointerFocus]);
  const endHover = useCallback(() => {
    cancelRelease();
    dropHold();
    setPointerFocus("idle");
  }, [cancelRelease, dropHold, setPointerFocus]);
  const onStagePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch" || !realMove(e)) return;
    const bay = (e.target as Element | null)?.closest?.<HTMLElement>(".o35-slot")?.dataset.bay as Exclude<CoreFocus, "idle"> | undefined;
    if (bay) {
      if (bay !== pointerRef.current) pointerOver(bay);
      return;
    }
    // open space: an unheld pointer book is let go (once: every move must not restart the grace)
    if (pendingCommit.current !== "idle") cancelCommit();
    if (pointerRef.current !== holdRef.current && releaseTimer.current === null) release();
  }, [cancelCommit, pointerOver, realMove, release]);
  const onStagePointerLeave = useCallback((e: React.PointerEvent) => {
    lastPoint.current = { x: e.clientX, y: e.clientY };
    dropHold();
    release();
  }, [dropHold, release]);

  /* ---------------- activation → navigation ---------------- */
  const [activating, setActivating] = useState<CoreFocus | null>(null);
  const activationTimer = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (activationTimer.current !== null) window.clearTimeout(activationTimer.current);
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);
  useEffect(() => {
    const releaseLatch = () => {
      if (settleTimer.current !== null) { window.clearTimeout(settleTimer.current); settleTimer.current = null; }
      setActivating(null);
    };
    window.addEventListener("popstate", releaseLatch);
    window.addEventListener("pageshow", releaseLatch);
    return () => {
      window.removeEventListener("popstate", releaseLatch);
      window.removeEventListener("pageshow", releaseLatch);
    };
  }, []);

  const onBookClick = useCallback((d: CoreDestination, e: React.MouseEvent<HTMLAnchorElement>) => {
    if (d.to === "/quiz") trackFunnelEvent("leaguecraft_cta_clicked", { cta: "academy_core_book" });
    if (isModifiedClick(e)) return; // the browser's own behaviour, untouched
    playSfx.play("bookRuffle"); // the Hall's own book-open cue, gated by the same per-cue setting
    if (reduced) return; // the Link navigates at once
    e.preventDefault();
    if (activationTimer.current !== null) return; // a second press changes nothing
    cancelCommit(); // a click is not a hover: the orbit does not start a turn under the activation
    setActivating(d.id);
    setPointerFocus(d.id);
    activationTimer.current = window.setTimeout(() => {
      activationTimer.current = null;
      navigate(d.to);
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        setActivating(null);
      }, ACTIVATION_SETTLE_MS);
    }, BOOK_ACTIVATION_MS);
  }, [cancelCommit, navigate, playSfx, reduced, setPointerFocus]);

  /* ---------------- crystal: cycle previews, never navigate ---------------- */
  const cycle = useCallback(() => {
    setPinned((prev) => {
      const i = CORE_CYCLE_ORDER.indexOf(prev as (typeof CORE_CYCLE_ORDER)[number]);
      return i < 0 ? CORE_CYCLE_ORDER[0] : i === CORE_CYCLE_ORDER.length - 1 ? "idle" : CORE_CYCLE_ORDER[i + 1];
    });
    setPinSource("crystal");
    cancelRelease();
    dropHold();
    setPointerFocus("idle");
    setKeyboardFocus("idle");
  }, [cancelRelease, dropHold, setPointerFocus]);

  /* ---------------- the arrow selector: the same preview, a different source ---------------- */
  const select = useCallback((id: CoreFocus) => {
    setPinned(id);
    setPinSource("selector");
    cancelRelease();
    dropHold();
    setPointerFocus("idle");
    setKeyboardFocus("idle");
  }, [cancelRelease, dropHold, setPointerFocus]);
  const clearSelection = useCallback(() => {
    if (pinSource !== "selector") return;
    setPinned("idle");
    setPinSource("crystal");
  }, [pinSource]);

  const bookHandlers = useCallback((d: CoreDestination) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      prefetchRoute(d.to, { intent: true });
      if (e.pointerType === "touch") return;
      // a book that slid under a still cursor is not a hover
      if (!realMove(e)) return;
      pointerOver(d.id);
    },
    // the held book moving away from a still cursor is not a departure
    onPointerLeave: () => {
      if (holdRef.current === d.id) return;
      if (pendingCommit.current === d.id) cancelCommit();
      release();
    },
    onPointerDown: () => { prefetchRoute(d.to, { intent: true }); cancelRelease(); cancelCommit(); setPointerFocus(d.id); },
    onFocus: (e: React.FocusEvent) => {
      prefetchRoute(d.to, { intent: true });
      cancelRelease();
      // `:focus-visible` = the keyboard (or an assistive tool) put it here.
      let visible = true;
      try { visible = (e.target as HTMLElement).matches(":focus-visible"); } catch { /* old engines: treat as keyboard */ }
      // Focus moving from one book to another blurs and focuses in one tick, which
      // cancels the blur's pending release: clear the other channel here, or the old
      // book would stay "focused" behind the new one.
      if (visible) { setPointerFocus("idle"); setKeyboardFocus(d.id); cue("keyboard"); }
      else { setKeyboardFocus("idle"); setPointerFocus(d.id); }
    },
    onBlur: () => release(),
  }), [cancelCommit, cancelRelease, cue, pointerOver, realMove, release, setPointerFocus]);

  return {
    focus, pointerFocus, keyboardFocus, pinned, pinSource, activating, hoverHold, cancelRelease, cycle, select, clearSelection,
    endHover, onStagePointerMove, onStagePointerLeave, bookHandlers, onBookClick,
  };
}
