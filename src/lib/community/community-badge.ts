// ---------------------------------------------------------------------------
// COM1-2B — what the Community button's badge counts.
//
// Pure, and deliberately in lib rather than beside the component: the
// definition of "actionable" is a product decision COM1-3 will extend when it
// hoists the Stat Check invite count, and it should be readable and testable
// without mounting a drawer.
// ---------------------------------------------------------------------------

/**
 * COM1-2B — the Community badge counts ACTIONABLE social state, and nothing
 * else.
 *
 * COUNTED
 *   incoming pending friend requests — the only social item in this phase that
 *   is resolved by a decision (accept or decline) rather than by reading.
 *
 * NOT COUNTED, deliberately
 *   accepted friends            — a total, not a task
 *   outgoing requests           — the other person's move, not yours
 *   read/unread notifications   — the HUD bell's semantics, not this button's
 *   blocked users               — already resolved
 *   Stat Check invites          — genuinely actionable, but the only count
 *     available is `useStatCheckInvites`, which POLLS a flag-gated backend
 *     route every 30s. The HUD bell already mounts it; mounting it a second
 *     time here would be a parallel poller for one number. Left for COM1-3,
 *     which can hoist that hook once and share it. The bell keeps showing them
 *     meanwhile, so nothing is currently unreachable.
 *
 * Bell and Community are therefore NOT the same number and are not meant to be:
 * the bell says "there is something to read", this says "there is something to
 * decide".
 */
export function communityBadge(pendingRequestCount: number): {
  count: number;
  display: string;
  label: string;
} | null {
  const count = Math.max(0, pendingRequestCount);
  if (count === 0) return null;
  return {
    count,
    // Matches the HUD bell's cap so one visual grammar covers both badges.
    display: count > 99 ? "99+" : String(count),
    label: `${count} pending friend request${count === 1 ? "" : "s"}`,
  };
}
