/**
 * PLAY1 — the match-entry scroll, wired to the live Ranked queue.
 *
 * This is the component the Leaguecraft lobby renders. It does exactly one
 * thing the record itself must not: it owns `useRankedQueue`, the ONE queue
 * implementation, and hands the controller to `PlayScrollRecord`.
 *
 * The split is not ceremony. It is what keeps the production component free
 * of any dev-only branch while `/dev/play-scroll` can still show every
 * matchmaking beat — searching, opponent found, preparing, unavailable — from
 * a fabricated controller. States that need two live players and a pairing
 * pass are otherwise unreviewable, and a state nobody can look at is a state
 * nobody has checked.
 *
 * It is mounted only while the record is open (see `LeaguecraftHub`), so the
 * queue is polled only while the player is looking at it.
 */
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useRankedQueue } from "@/pages/quiz-ranked/useRankedQueue";
import PlayScrollRecord from "./PlayScrollRecord";

export default function RankedPlayScroll(
  props: Omit<React.ComponentProps<typeof PlayScrollRecord>, "queue" | "isAdmin">,
) {
  const queue = useRankedQueue();
  /**
   * Whether to OFFER the admin's Match-with-Bot control. It is a visibility
   * signal and nothing more: `useAdminRoles` reads the viewer's own
   * `user_roles` rows, it grants nothing, and the backend re-decides
   * authorization from the verified session on every request. `loading` and a
   * failed read both resolve to false, so the control is never drawn on a
   * guess — it appears once the answer is known, or not at all.
   *
   * Held HERE, in the wired wrapper, for the same reason the queue is: it
   * keeps `PlayScrollRecord` a pure view, so `/dev/play-scroll` can still
   * drive the whole record without an auth read of its own.
   */
  const { isAdmin } = useAdminRoles();
  return <PlayScrollRecord {...props} queue={queue} isAdmin={isAdmin} />;
}
