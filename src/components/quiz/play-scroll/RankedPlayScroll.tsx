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
import { useCallback, useContext, useRef, useState } from "react";
import { UNSAFE_DataRouterContext } from "react-router-dom";
import { TransactionalLeaveDialog } from "@/components/navigation/TransactionalLeaveDialog";
import { useRankedBotAccess } from "@/hooks/useRankedBotAccess";
import { useTransactionalLeaveGuard } from "@/lib/navigation/useTransactionalLeaveGuard";
import {
  rankedQueueLeaveMode,
  RANKED_QUEUE_COMMITTED_COPY,
  RANKED_QUEUE_WAITING_COPY,
} from "@/lib/quiz/rankedQueueLeaveContract";
import { useRankedQueue, type QueueController } from "@/pages/quiz-ranked/useRankedQueue";
import PlayScrollRecord from "./PlayScrollRecord";

type RankedPlayScrollProps = Omit<
  React.ComponentProps<typeof PlayScrollRecord>,
  "queue" | "canPlayRankedBot"
>;

function GuardedRankedPlayScroll({
  queue,
  canPlayRankedBot,
  ...props
}: RankedPlayScrollProps & {
  queue: QueueController;
  canPlayRankedBot: boolean;
}) {
  const mode = rankedQueueLeaveMode(queue.state);
  const copy = mode === "committed"
    ? RANKED_QUEUE_COMMITTED_COPY
    : RANKED_QUEUE_WAITING_COPY;
  const [cancellingForLeave, setCancellingForLeave] = useState(false);
  const guard = useTransactionalLeaveGuard({
    active: mode !== null,
    kind: "ranked_queue",
    copy,
    shouldBlock: ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search ||
      currentLocation.hash !== nextLocation.hash,
  });
  const runWithBypass = guard.runWithBypass;
  const proceedLeave = guard.leave;
  const onEnterMatch = props.onEnterMatch;
  const runWithBypassRef = useRef(runWithBypass);
  const onEnterMatchRef = useRef(onEnterMatch);
  runWithBypassRef.current = runWithBypass;
  onEnterMatchRef.current = onEnterMatch;

  const enterMatch = useCallback((matchId: string) => {
    runWithBypassRef.current("MATCH_HANDOFF", () => onEnterMatchRef.current(matchId));
  }, []);

  const leave = useCallback(async () => {
    // Re-read the current render's authoritative classification at the click.
    // If pairing won while the dialog was open, leaving is non-destructive.
    const currentMode = rankedQueueLeaveMode(queue.state);
    if (currentMode === "committed") {
      proceedLeave();
      return;
    }
    if (currentMode !== "cancellable" || cancellingForLeave) return;

    setCancellingForLeave(true);
    const result = await queue.cancelAndWait();
    if (result === "cancelled") proceedLeave();
    setCancellingForLeave(false);
  }, [cancellingForLeave, proceedLeave, queue]);

  return <>
    <PlayScrollRecord
      {...props}
      queue={queue}
      canPlayRankedBot={canPlayRankedBot}
      onEnterMatch={enterMatch}
    />
    <TransactionalLeaveDialog
      open={guard.confirmationOpen}
      title={copy.title}
      body={copy.body}
      stayLabel={copy.stayLabel}
      leaveLabel={copy.leaveLabel}
      onStay={guard.stay}
      onLeave={() => void leave()}
      busy={cancellingForLeave || guard.state === "proceeding"}
    />
  </>;
}

export default function RankedPlayScroll(
  props: RankedPlayScrollProps,
) {
  const queue = useRankedQueue();
  const dataRouter = useContext(UNSAFE_DataRouterContext);
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
  if (!dataRouter) {
    return <PlayScrollRecord {...props} queue={queue} canPlayRankedBot={canPlayRankedBot} />;
  }
  return <GuardedRankedPlayScroll
    {...props}
    queue={queue}
    canPlayRankedBot={canPlayRankedBot}
  />;
}
