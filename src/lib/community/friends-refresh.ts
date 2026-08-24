// ---------------------------------------------------------------------------
// Community social invalidation signal.
//
// WHAT THIS IS. A process-local "your social state may be stale" bus. It is a
// NOTIFICATION, not state: it never carries friendship, block or profile data,
// so it cannot desynchronise a view or leak anything. Every listener re-reads
// from the server, which stays the single authority.
//
// WHY IT EXISTS (COM1-2). An admin action could create a friendship from a
// surface nowhere near the friends drawer, and the drawer's `useFriends` had no
// way to know.
//
// WHY IT MATTERS MORE NOW (COM1-2B). `useFriends` is a per-instance hook, not a
// shared cache: FloatingFriendsButton, HomeFriendsSection, InvitePlayView and
// MultiplayerLobby each hold their own copy of the friends array, and
// `useBlocks` is instantiated separately again inside FriendActionMenu. A
// mutation that refreshed only the instance that issued it left every sibling
// showing the pre-mutation world until a full page reload — which is exactly
// the reported "blocked user stays in my Friends list" defect. Routing every
// mutation and every realtime event through this one signal makes all of them
// converge on the same server read.
//
// Deliberately tiny and dependency-free, mirroring the existing
// `subscribeAdminCredential` pattern in lib/admin-auth/adminCredentials.ts.
// ---------------------------------------------------------------------------

type Listener = () => void | Promise<void>;

const listeners = new Set<Listener>();

/**
 * Tell every mounted social view to re-read from the server.
 *
 * Returns a promise that settles once every listener's re-read has settled, so
 * a mutation can `await` convergence instead of racing it. Callers that do not
 * care (the admin surfaces) may ignore it: this never rejects.
 */
export function notifyFriendsChanged(): Promise<void> {
  // Copy first: a listener that unsubscribes during iteration must not skip a peer.
  const pending: Promise<void>[] = [];
  for (const listener of [...listeners]) {
    try {
      const result = listener();
      // A broken listener must never prevent the others from refreshing, and an
      // async one must never surface as an unhandled rejection.
      if (result) pending.push(Promise.resolve(result).catch(() => undefined));
    } catch {
      // Same contract for a synchronous throw.
    }
  }
  return Promise.all(pending).then(() => undefined);
}

/** Subscribe; returns the unsubscribe function. */
export function subscribeFriendsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
