import { useEffect, useRef } from "react";

/**
 * Deep links from a notification to the record it is about:
 * `/admin/users?section=moderation&view=feedback&focus=<id>`.
 *
 * Read from window.location rather than a router hook so the moderation views
 * keep rendering outside a Router (their unit tests mount them bare). The
 * parent admin page re-renders on every search-param change, so a new focus
 * is picked up without remounting.
 */
const SAFE_ID = /^[0-9a-zA-Z-]{1,64}$/;

export function readFocusParam(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("focus");
  return value && SAFE_ID.test(value) ? value : null;
}

/**
 * Once `ready` (the list has loaded), runs `onFocus` for the focused id once
 * and scrolls its `[data-focus-id]` element into view. Returns the id so the
 * row can render a highlight.
 */
export function useFocusRecord(ready: boolean, onFocus?: (id: string) => void): string | null {
  const focus = readFocusParam();
  const handled = useRef<string | null>(null);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  useEffect(() => {
    if (!ready || !focus || handled.current === focus) return;
    handled.current = focus;
    onFocusRef.current?.(focus);
    const frame = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-focus-id="${focus}"]`);
      el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [ready, focus]);

  return focus;
}

export const focusHighlight = "ring-2 ring-primary ring-offset-2 ring-offset-background";
