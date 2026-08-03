// ---------------------------------------------------------------------------
// Community friends invalidation signal.
//
// An admin action can create a friendship from a surface that is nowhere near
// the friends drawer. The drawer's `useFriends` hook has no way to know, and
// the friendships realtime subscription is not dependable enough to be the only
// path — so this module carries an explicit in-page signal instead.
//
// Deliberately tiny and dependency-free, mirroring the existing
// `subscribeAdminCredential` pattern in lib/admin-auth/adminCredentials.ts.
// It is a NOTIFICATION, not state: it says "your friends list may be stale",
// and the listener re-reads from the server. It never carries friendship data,
// so it cannot desynchronise a view or leak anything.
// ---------------------------------------------------------------------------

type Listener = () => void;

const listeners = new Set<Listener>();

/** Tell every mounted friends view to re-read from the server. */
export function notifyFriendsChanged(): void {
  // Copy first: a listener that unsubscribes during iteration must not skip a peer.
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A broken listener must never prevent the others from refreshing.
    }
  }
}

/** Subscribe; returns the unsubscribe function. */
export function subscribeFriendsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
