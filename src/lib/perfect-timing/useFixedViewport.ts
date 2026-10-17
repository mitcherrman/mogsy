/**
 * PT4.4 — a fixed-screen mode owns the viewport while it is mounted.
 *
 * There is no scrolling in Perfect Timing: not the page, not the keyboard, not
 * an overscroll. While mounted this hook
 *   - sets `overflow: hidden` and `overscroll-behavior: none` on <html> and
 *     <body>, and puts them back EXACTLY as found on unmount, so the page the
 *     player returns to scrolls normally;
 *   - swallows the keys that scroll a page (Space, PageUp/Down, Home/End,
 *     arrows) unless they are aimed at something that owns them — a text field,
 *     a button, a link — so Space on a focused "Next round" still presses it.
 *
 *   - hides the app root (`#root`: `display: none` and `inert`) while mounted, so
 *     the document is exactly one viewport tall, Tab, clicks and screen readers
 *     cannot reach the header and footer the screen sits over, and the scroll
 *     position the player left is put back on unmount;
 *   - cancels a one-finger drag on the screen, so a touch can never chain into a
 *     page scroll (a two-finger pinch is left alone).
 *
 * The key guard is on `window`, in the bubble phase: every document-level
 * handler (the timer's Space/Enter, the reveal's way on) runs first and sees an
 * un-prevented event; this is the backstop for everything they leave alone.
 */
import { useEffect } from "react";
import { OWNS_KEYS_SELECTOR } from "./useTimingEngine";

const SCROLL_KEYS: ReadonlySet<string> = new Set([
  " ", "Spacebar", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

/** True when a scroll key at this event should be swallowed. */
export function scrollKeyIsSwallowed(e: KeyboardEvent): boolean {
  if (!SCROLL_KEYS.has(e.key)) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const target = e.target;
  if (target instanceof Element) {
    if ((target as HTMLElement).isContentEditable) return false;
    if (target.closest(OWNS_KEYS_SELECTOR)) return false;
  }
  return true;
}

function restore(el: HTMLElement, value: string): void {
  if (value) el.style.setProperty("overscroll-behavior", value);
  else el.style.removeProperty("overscroll-behavior");
}

export function useFixedViewport(): void {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const saved = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.getPropertyValue("overscroll-behavior"),
      bodyOverscroll: body.style.getPropertyValue("overscroll-behavior"),
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.setProperty("overscroll-behavior", "none");
    body.style.setProperty("overscroll-behavior", "none");
    html.setAttribute("data-pt-fixed-viewport", "true");
    const appRoot = document.getElementById("root");
    const wasInert = appRoot?.hasAttribute("inert") ?? false;
    const savedDisplay = appRoot?.style.display ?? "";
    const savedScrollY = window.scrollY;
    appRoot?.setAttribute("inert", "");
    if (appRoot) appRoot.style.display = "none";

    const onKeyDown = (e: KeyboardEvent) => {
      if (scrollKeyIsSwallowed(e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1 || !(e.target instanceof Element) || !e.target.closest(".pt-screen")) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("touchmove", onTouchMove);
      html.removeAttribute("data-pt-fixed-viewport");
      if (appRoot && !wasInert) appRoot.removeAttribute("inert");
      if (appRoot) appRoot.style.display = savedDisplay;
      html.style.overflow = saved.htmlOverflow;
      body.style.overflow = saved.bodyOverflow;
      if (savedScrollY > 0) window.scrollTo(0, savedScrollY);
      restore(html, saved.htmlOverscroll);
      restore(body, saved.bodyOverscroll);
    };
  }, []);
}
