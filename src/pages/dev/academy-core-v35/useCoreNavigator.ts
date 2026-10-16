/**
 * Academy Core V3.5 — the destination / navigation behaviour, separated from
 * the orbital presentation.
 *
 * This is the V3 contract carried over unchanged (it is the same logic as
 * `AcademyCoreHome` in `src/pages/academy-core/AcademyCorePage.tsx`, lifted
 * into a hook so the new scene can render it any way it likes):
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
 * Phase 2 should replace the V3 page's inline copy with this hook (the V3
 * page is deliberately untouched by this branch).
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
  activating: CoreFocus | null;
  cancelRelease: () => void;
  cycle: () => void;
  bookHandlers: (d: CoreDestination) => {
    onPointerEnter: (e: React.PointerEvent) => void;
    onPointerLeave: () => void;
    onPointerDown: () => void;
    onFocus: (e: React.FocusEvent) => void;
    onBlur: () => void;
  };
  onBookClick: (d: CoreDestination, e: React.MouseEvent<HTMLAnchorElement>) => void;
}

export function useCoreNavigator(reduced: boolean): CoreNavigator {
  const sfx = useSfx();
  const playSfx = usePlaySfx();
  const navigate = useNavigate();

  const [pointerFocus, setPointerFocus] = useState<CoreFocus>("idle");
  const [keyboardFocus, setKeyboardFocus] = useState<CoreFocus>("idle");
  const [pinned, setPinned] = useState<CoreFocus>("idle");
  const focus: CoreFocus = pointerFocus !== "idle" ? pointerFocus : keyboardFocus !== "idle" ? keyboardFocus : pinned;

  const releaseTimer = useRef<number | null>(null);
  const cancelRelease = useCallback(() => {
    if (releaseTimer.current !== null) { window.clearTimeout(releaseTimer.current); releaseTimer.current = null; }
  }, []);
  const release = useCallback(() => {
    cancelRelease();
    releaseTimer.current = window.setTimeout(() => {
      releaseTimer.current = null;
      setPointerFocus("idle");
      setKeyboardFocus("idle");
    }, FOCUS_RELEASE_MS);
  }, [cancelRelease]);
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
  }, [navigate, playSfx, reduced]);

  /* ---------------- crystal: cycle previews, never navigate ---------------- */
  const cycle = useCallback(() => {
    setPinned((prev) => {
      const i = CORE_CYCLE_ORDER.indexOf(prev as (typeof CORE_CYCLE_ORDER)[number]);
      return i < 0 ? CORE_CYCLE_ORDER[0] : i === CORE_CYCLE_ORDER.length - 1 ? "idle" : CORE_CYCLE_ORDER[i + 1];
    });
    cancelRelease();
    setPointerFocus("idle");
    setKeyboardFocus("idle");
  }, [cancelRelease]);

  const bookHandlers = useCallback((d: CoreDestination) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      prefetchRoute(d.to, { intent: true });
      if (e.pointerType === "touch") return;
      cancelRelease();
      setPointerFocus(d.id);
      cue("pointer");
    },
    onPointerLeave: () => release(),
    onPointerDown: () => { prefetchRoute(d.to, { intent: true }); cancelRelease(); setPointerFocus(d.id); },
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
  }), [cancelRelease, cue, release]);

  return { focus, pointerFocus, keyboardFocus, pinned, activating, cancelRelease, cycle, bookHandlers, onBookClick };
}
