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
import { useRankedBotAccess } from "@/hooks/useRankedBotAccess";
import { useRankedQueue } from "@/pages/quiz-ranked/useRankedQueue";
import PlayScrollRecord from "./PlayScrollRecord";

export default function RankedPlayScroll(
  props: Omit<React.ComponentProps<typeof PlayScrollRecord>, "queue" | "canPlayRankedBot">,
) {
  const queue = useRankedQueue();
  /**
   * Whether to OFFER the Match-with-Bot control: staff admin OR effectively
   * Premium. It is a visibility signal and nothing more — the backend
   * re-decides authorization from the verified session on every request, and
   * an unresolved or failed lookup resolves to false, so the control is never
   * drawn on a guess.
   *
   * Held HERE, in the wired wrapper, for the same reason the queue is: it
   * keeps `PlayScrollRecord` a pure view, so `/dev/play-scroll` can still
   * drive the whole record without an auth read of its own.
   */
  const { canPlayRankedBot } = useRankedBotAccess();
  return <PlayScrollRecord {...props} queue={queue} canPlayRankedBot={canPlayRankedBot} />;
}
