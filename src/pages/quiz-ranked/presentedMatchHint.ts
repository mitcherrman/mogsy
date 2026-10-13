/**
 * RECONSTRUCT-R3C — the match this TAB is presenting, kept across a reload.
 *
 * WHY. `/quiz/ranked` finds its match from router state (the lobby handoff) or,
 * failing that, from account discovery (`/api/ranked/active-match`). Discovery
 * answers "is there a match I can still PLAY?", so it rightly never returns a
 * finished one. But the final round settles the match in the lock transaction:
 * from that instant the player is still WATCHING it (the final reveal, the
 * outro, the end screen) while discovery already says there is nothing. A
 * reload without router state (a new history entry, a restored tab, a dev or
 * test entry) therefore lost the result and landed on the lobby.
 *
 * WHAT. One per-tab `sessionStorage` entry naming the match this tab mounted,
 * for this account. It is a HINT, never authorization: the route consults it
 * only after discovery found no active match, and mounts it only once the
 * server's own participant-gated, terminal-only `/result` read has answered for
 * it (403 for a non-participant, 409 while the match is still live). The arena
 * then loads it as a recovered entry, which goes straight to the end screen
 * without replaying the reveal or the outro.
 *
 * LIFETIME. Written when the route mounts a match. Removed when the player
 * leaves a finished match on purpose (an end-screen action, or navigating away
 * while it is complete), when the server refuses it, or when it is older than
 * `MAX_AGE_MS`. A reload runs no cleanup, so it is exactly what survives one.
 * Storage that is unavailable (private mode, blocked site data) simply means
 * no hint: the route behaves as it did before.
 */

const KEY = "mogzy.ranked.presentedMatch.v1";
/** A hint this old is a leftover, not a reload: ignored and removed. */
export const MAX_AGE_MS = 30 * 60 * 1000;

interface Stored { viewer: string; matchId: string; at: number }

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function rememberPresentedMatch(viewerUserId: string, matchId: string, now = Date.now()): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ viewer: viewerUserId, matchId, at: now } satisfies Stored));
  } catch { /* storage full or blocked: no hint */ }
}

/** The hinted match id for THIS account, or null (absent, foreign, stale or unreadable). */
export function readPresentedMatch(viewerUserId: string, now = Date.now()): string | null {
  let raw: string | null = null;
  try { raw = storage()?.getItem(KEY) ?? null; } catch { return null; }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Stored>;
    if (typeof v.matchId !== "string" || typeof v.viewer !== "string" || typeof v.at !== "number") {
      forgetPresentedMatch();
      return null;
    }
    if (v.viewer !== viewerUserId) return null;
    if (now - v.at > MAX_AGE_MS || v.at > now + 60_000) { forgetPresentedMatch(); return null; }
    return v.matchId;
  } catch {
    forgetPresentedMatch();
    return null;
  }
}

/** Remove the hint; with `matchId`, only when it names that match. */
export function forgetPresentedMatch(matchId?: string): void {
  const s = storage();
  if (!s) return;
  try {
    if (matchId !== undefined) {
      const raw = s.getItem(KEY);
      if (!raw || (JSON.parse(raw) as Partial<Stored>).matchId !== matchId) return;
    }
    s.removeItem(KEY);
  } catch { /* nothing to remove */ }
}
