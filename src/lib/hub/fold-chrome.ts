import { useSyncExternalStore } from "react";

/**
 * Mobile Home Hub chrome follows the pager's authored two-state navigation.
 * This is deliberately an event-backed state seam rather than a scroll
 * observer: `navigateHubFold` changes it at the same instant it commits to a
 * destination, so floating controls retract before the 520ms page animation
 * starts and never wait for an arbitrary scroll threshold.
 */
export const HUB_FLOATING_CONTROLS_COLLAPSED_CLASS =
  "hub-floating-controls-collapsed";

const HUB_FLOATING_CONTROLS_EVENT = "hub-floating-controls-change";
const HUB_MOBILE_MEDIA = "(max-width: 767px)";

export function setHubFloatingControlsCollapsed(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.classList.contains(HUB_FLOATING_CONTROLS_COLLAPSED_CLASS) === collapsed) {
    return;
  }
  root.classList.toggle(HUB_FLOATING_CONTROLS_COLLAPSED_CLASS, collapsed);
  window.dispatchEvent(new Event(HUB_FLOATING_CONTROLS_EVENT));
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mobile = window.matchMedia?.(HUB_MOBILE_MEDIA);
  window.addEventListener(HUB_FLOATING_CONTROLS_EVENT, listener);
  mobile?.addEventListener?.("change", listener);
  return () => {
    window.removeEventListener(HUB_FLOATING_CONTROLS_EVENT, listener);
    mobile?.removeEventListener?.("change", listener);
  };
}

function snapshot(): boolean {
  return (
    typeof document !== "undefined" &&
    window.matchMedia?.(HUB_MOBILE_MEDIA).matches === true &&
    document.documentElement.classList.contains(HUB_FLOATING_CONTROLS_COLLAPSED_CLASS)
  );
}

export function useHubFloatingControlsCollapsed(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
