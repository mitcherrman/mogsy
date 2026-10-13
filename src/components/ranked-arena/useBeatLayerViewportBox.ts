/**
 * RECONSTRUCT-R3C — the beat layer covers the VISIBLE part of the shell.
 *
 * The presentation overlay (Final Round warning, match outro) is a direct
 * child of `.ranked-shell`, `absolute inset-0`: it covers the shell. On a phone
 * whose round cannot fit one screen (the phone arena grows the page and
 * scrolls it, by design) that put the outro's scrim 82px below the fold at
 * 360x640, growing with the page.
 *
 * While a beat is up this hook publishes the shell's box CLIPPED TO THE
 * VIEWPORT as four CSS properties on the layer (`--beat-top/right/bottom/
 * left`, viewport insets in px). The phone arena's CSS pins the layer to them
 * (`position: fixed`). When the shell fits the screen the clipped box IS the
 * shell's box, so nothing about the intro-axis composition changes; when it
 * cannot fit, the beat covers exactly what the player can see, at any scroll
 * offset, and adds nothing below the fold. Desktop CSS ignores the properties.
 *
 * Reads layout, writes only these custom properties; no state, no re-render.
 */
import { useLayoutEffect, type RefObject } from "react";

export function useBeatLayerViewportBox(layerRef: RefObject<HTMLElement>, active: boolean): void {
  useLayoutEffect(() => {
    const layer = layerRef.current;
    const shell = layer?.parentElement;
    if (!active || !layer || !shell) return;
    const place = () => {
      const r = shell.getBoundingClientRect();
      // The box `position: fixed` resolves against: the layout viewport, which
      // `innerWidth/innerHeight` report (a zoomed-out mobile page widens it
      // past `clientWidth/clientHeight`, the initial containing block).
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      layer.style.setProperty("--beat-top", `${Math.max(0, r.top)}px`);
      layer.style.setProperty("--beat-right", `${Math.max(0, vw - r.right)}px`);
      layer.style.setProperty("--beat-bottom", `${Math.max(0, vh - r.bottom)}px`);
      layer.style.setProperty("--beat-left", `${Math.max(0, r.left)}px`);
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    ro?.observe(shell);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      ro?.disconnect();
    };
  }, [layerRef, active]);
}
