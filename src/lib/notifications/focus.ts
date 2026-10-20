import { useEffect, useRef, useState } from "react";
import { markAdminNotificationRead } from "./api";

/**
 * Exact-record deep links from a notification to the record it is about:
 *
 *   /admin/users?section=moderation&view=feedback&focus=<record id>&from_notification=<notification id>
 *
 * The destination view loads that record BY ID (so it opens even when it is
 * older than the view's list cap, archived, or hidden), then this hook:
 *   - expands / highlights it and scrolls it into view (`onFocus`);
 *   - marks the originating notification read — only now that the record has
 *     actually opened, and never as a resolution;
 *   - reports `missing` when the record is gone or this session cannot read
 *     it, so the view can say so instead of showing a silent list.
 *
 * Params are read from window.location rather than a router hook so the
 * moderation views keep rendering outside a Router (their unit tests mount them
 * bare). Their parent admin page re-renders on every search-param change, which
 * is what makes direct URLs, refresh and browser back/forward re-run this.
 */
const SAFE_ID = /^[0-9a-zA-Z-]{1,64}$/;

function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get(name);
  return value && SAFE_ID.test(value) ? value : null;
}

export const readFocusParam = (): string | null => readParam("focus");
export const readFromNotificationParam = (): string | null => readParam("from_notification");

export type FocusStatus = "none" | "found" | "missing";

interface Options {
  /** The view has finished loading (including its by-id fetch of the focus). */
  ready: boolean;
  /** Whether the loaded data contains this record id. */
  has: (id: string) => boolean;
  /** Open / expand the record, clear filters that would hide it. */
  onFocus?: (id: string) => void;
  /**
   * The view's loaded records. "Missing" is re-checked whenever this changes,
   * because after Back/Forward the hook can see the NEW focus a render before
   * the view has re-fetched for it; only a successful open is final.
   */
  data?: unknown;
}

export function useFocusRecord({ ready, has, onFocus, data }: Options): {
  focusId: string | null;
  status: FocusStatus;
  fromNotification: string | null;
} {
  const focus = readFocusParam();
  const from = readFromNotificationParam();
  const key = focus ? `${focus}|${from ?? ""}` : null;
  const [result, setResult] = useState<{ key: string; status: FocusStatus } | null>(null);
  const handled = useRef<string | null>(null);
  const hasRef = useRef(has);
  hasRef.current = has;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  useEffect(() => {
    // Leaving the focus (Back to the plain list) re-arms it, so Forward/Back
    // onto the same record opens it again.
    if (!key) handled.current = null;
  }, [key]);

  useEffect(() => {
    if (!ready || !key || !focus || handled.current === key) return;
    if (!hasRef.current(focus)) {
      setResult({ key, status: "missing" });
      return;
    }
    handled.current = key;
    setResult({ key, status: "found" });
    onFocusRef.current?.(focus);
    if (from) void markAdminNotificationRead(from);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-focus-id="${focus}"]`)?.scrollIntoView?.({
        block: "center",
        behavior: "smooth",
      });
    });
  }, [ready, key, focus, from, data]);

  const status: FocusStatus = !key ? "none" : result?.key === key ? result.status : "none";
  return { focusId: focus, status, fromNotification: from };
}

export const focusHighlight = "ring-2 ring-primary ring-offset-2 ring-offset-background";
