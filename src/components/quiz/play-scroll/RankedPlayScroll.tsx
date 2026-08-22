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
import { useRankedQueue } from "@/pages/quiz-ranked/useRankedQueue";
import PlayScrollRecord from "./PlayScrollRecord";

export default function RankedPlayScroll(
  props: Omit<React.ComponentProps<typeof PlayScrollRecord>, "queue">,
) {
  const queue = useRankedQueue();
  return <PlayScrollRecord {...props} queue={queue} />;
}
