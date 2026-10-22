/**
 * Tournament Arena paths (admin-only beta).
 *
 * Players: `/quiz/arena/*` — under `/quiz` so the LoL theme is painted before
 * first frame (index.html), and registered before the `/:slug` catch-all.
 * There is no public directory and nothing in the product links here: a
 * player arrives through a join link or an invitation.
 *
 * Organizer: `/admin/tournament-arena/*`, inside `AdminRoute`; the backend
 * refuses every organizer call to anyone but the owner regardless.
 */
export const ARENA_PLAYER_BASE = "/quiz/arena";
export const ARENA_ADMIN_BASE = "/admin/tournament-arena";
export const ARENA_ADMIN_NEW = `${ARENA_ADMIN_BASE}/new`;

const enc = encodeURIComponent;

export function arenaEventHref(eventId: string, fromNode?: string | null): string {
  return `${ARENA_PLAYER_BASE}/e/${enc(eventId)}${fromNode ? `?from=${enc(fromNode)}` : ""}`;
}

export function arenaMatchHref(eventId: string, nodeId: string): string {
  return `${ARENA_PLAYER_BASE}/e/${enc(eventId)}/match/${enc(nodeId)}`;
}

export function arenaJoinHref(code: string): string {
  return `${ARENA_PLAYER_BASE}/join/${enc(code)}`;
}

export function arenaAdminEventHref(eventId: string): string {
  return `${ARENA_ADMIN_BASE}/event/${enc(eventId)}`;
}

/** The absolute join link the organizer shares. */
export function absoluteArenaJoinLink(code: string, origin = typeof window !== "undefined" ? window.location.origin : "https://mogzy.lol"): string {
  return `${origin}${arenaJoinHref(code)}`;
}

/** Paths that render as a full-bleed, fixed-viewport Arena frame (Layout). */
export function isTournamentArenaFrame(pathname: string): boolean {
  return pathname === ARENA_PLAYER_BASE || pathname.startsWith(`${ARENA_PLAYER_BASE}/`)
    || pathname === ARENA_ADMIN_NEW || pathname.startsWith(`${ARENA_ADMIN_BASE}/event/`);
}
