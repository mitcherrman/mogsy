/**
 * Same-tab synchronisation between notification surfaces.
 *
 * The HUD menu and the admin notifications page can be mounted at once. Across
 * tabs and devices they converge through realtime (every lifecycle table is
 * published and RLS-filtered to its owner); inside ONE tab this event makes the
 * other surface refetch immediately instead of waiting for the realtime echo.
 */
export type NotificationScope = "admin" | "player";

const EVENT = "mogzy:notifications-changed";

export function announceNotificationsChanged(scope: NotificationScope, source: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { scope, source } }));
}

export function onNotificationsChanged(
  scope: NotificationScope,
  self: string,
  handler: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ scope: NotificationScope; source: string }>).detail;
    if (detail?.scope === scope && detail.source !== self) handler();
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

let seq = 0;
/** A unique id per mounted surface: realtime channel names and bus identity. */
export const nextSurfaceId = (prefix: string): string => `${prefix}-${++seq}-${Math.random().toString(36).slice(2, 8)}`;
