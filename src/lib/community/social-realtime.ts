// ---------------------------------------------------------------------------
// COM1-2B — live social synchronisation.
//
// THE DEFECT THIS CLOSES. Nothing in the social stack was live. `friendships`
// and `user_blocks` were not in the `supabase_realtime` publication, and no
// client subscribed to them, so a mutation was visible only to the session that
// issued it. B accepting A's request left A's Friends list empty until A
// reloaded the page.
//
// THE MODEL. Realtime is a SIGNAL, never an authority:
//
//     postgres_changes event -> notifyFriendsChanged() -> every social view
//     re-reads from its canonical query/RPC -> React rerenders
//
// The row payload is deliberately discarded. `useFriends` re-reads
// `friendships` + `user_blocks`, `useFriendStatus` re-reads
// `get_relationship_state`, the Blocked tab re-reads `get_blocked_profiles`,
// Find Players re-runs `search_league_profiles`. A realtime frame can therefore
// be late, duplicated or dropped without ever producing a wrong relationship —
// the worst case is a stale view, which the next signal or the next drawer open
// repairs.
//
// AUTHORISATION. Realtime applies each table's RLS SELECT policy to the
// subscriber, so a subscription can only ever deliver rows that subscriber
// could already read:
//
//   friendships  — `is_friendship_party(requester_id) OR is_friendship_party(addressee_id)`
//   user_blocks  — `is_profile_owner(blocker_profile_id)`, i.e. your own blocks only
//
// The blocked party is deliberately NOT told about the block row (that would
// disclose the block). They converge anyway: `block_profile` deletes the
// friendship rows in the same transaction, and a friendship DELETE is visible
// to both parties.
//
// DELETE and REPLICA IDENTITY. With the default replica identity a DELETE frame
// carries only the primary key, which is not enough for realtime to evaluate
// RLS or a filter. Migration 20260824120000 sets REPLICA IDENTITY FULL on both
// tables for exactly that reason — without it, unfriend/decline/cancel/block
// would not arrive at all. See the migration header.
//
// FILTERS. postgres_changes takes one filter per listener, so "I am a party to
// this friendship" needs two listeners (requester_id, addressee_id) on the same
// channel rather than one OR. Both are idempotent, so a row matching both
// simply invalidates twice.
//
// user_notifications. Subscribed here as well, and NOT redundantly: it is the
// one social table that was already in the publication, so this listener keeps
// friend-request and friend-acceptance sync working even before the migration
// above is applied to production. It is scoped to the four social types and is
// otherwise the bell's business (MogzyIdentityMenu owns rendering them).
//
// ONE CHANNEL PER SIGNED-IN PROFILE. Reference-counted: repeated mounts share a
// single websocket topic, and the channel is removed when the last holder goes
// away — on unmount, on logout, and on an account switch (a different profile
// id is a different key, so the old channel is torn down before the new one is
// opened).
// ---------------------------------------------------------------------------

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { notifyFriendsChanged } from "@/lib/community/friends-refresh";

/** The notification types that mean a relationship changed. */
export const SOCIAL_NOTIFICATION_TYPES = new Set(["friend_request", "friend_accepted"]);

interface Holder {
  channel: RealtimeChannel;
  refs: number;
}

/** Keyed by profile id so an account switch can never reuse another's channel. */
const holders = new Map<string, Holder>();

/** Channel topic for a profile. Exported so a test can assert the naming. */
export const socialChannelName = (profileId: string) => `social:${profileId}`;

function buildChannel(profileId: string): RealtimeChannel {
  const invalidate = () => {
    void notifyFriendsChanged();
  };

  return supabase
    .channel(socialChannelName(profileId))
    // Friendship rows where I am the requester...
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `requester_id=eq.${profileId}`,
      },
      invalidate,
    )
    // ...and where I am the addressee. One filter per listener; see header.
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `addressee_id=eq.${profileId}`,
      },
      invalidate,
    )
    // My own blocks. RLS shows me nothing else on this table, and the filter
    // says the same thing a second time so an unfiltered frame is impossible.
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_blocks",
        filter: `blocker_profile_id=eq.${profileId}`,
      },
      invalidate,
    )
    // Social notifications addressed to me. Already-published table; this is
    // the path that works before the new migration is applied.
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_notifications",
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        const type = (payload.new as { type?: unknown } | null)?.type;
        if (typeof type === "string" && SOCIAL_NOTIFICATION_TYPES.has(type)) invalidate();
      },
    )
    .subscribe();
}

/**
 * Start (or join) the social realtime channel for one profile.
 *
 * Returns the release function. Releasing decrements the reference count and
 * removes the channel when it reaches zero — call it from an effect cleanup.
 */
export function startSocialRealtime(profileId: string): () => void {
  if (!profileId) return () => undefined;

  let holder = holders.get(profileId);
  if (!holder) {
    holder = { channel: buildChannel(profileId), refs: 0 };
    holders.set(profileId, holder);
  }
  holder.refs += 1;

  let released = false;
  return () => {
    // Idempotent: a double release must not free a channel a later mount holds.
    if (released) return;
    released = true;
    const current = holders.get(profileId);
    if (!current) return;
    current.refs -= 1;
    if (current.refs > 0) return;
    holders.delete(profileId);
    void supabase.removeChannel(current.channel);
  };
}

/** Test seam: how many distinct social channels are open right now. */
export function openSocialChannelCount(): number {
  return holders.size;
}
