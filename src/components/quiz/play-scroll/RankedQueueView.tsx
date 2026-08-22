/**
 * PLAY1 — Ranked matchmaking, on the SAME sheet.
 *
 * Choosing Ranked does not open a second screen. The clause the player picked
 * is replaced, in place, by the match-entry itself: the queue's real state,
 * written out, with one action under it.
 *
 * THE STATES ARE THE CONTROLLER'S, NOT THIS FILE'S
 * ────────────────────────────────────────────────
 * Every beat below is a `QueueState` from `useRankedQueue`, which is the one
 * queue implementation and remains the authority for joining, polling,
 * cancelling and pairing. Nothing here starts a timer, guesses a wait, counts
 * an opponent, or decides that a match exists. In particular:
 *
 *   waiting   the server has the entry and is looking. Cancel is offered.
 *   pairing   the server has ALREADY committed a match for this entry. The
 *             cancel is gone because it can only be refused — see THE
 *             PAIRING WINDOW in `useRankedQueue.ts`. This is the
 *             opponent-found beat, and it is real: it is reached from the
 *             server's own `claimed` status or from a refused cancel, never
 *             from a local timer that decided it looked about right.
 *   matched   there is a match id. The host is handed it and the record
 *             closes behind the player.
 *
 * NO OPPONENT IDENTITY is shown at any point, because the public Ranked
 * contract deliberately does not serve one.
 *
 * ROLE HONESTY. The role is the account's stored role, read by the backend
 * inside the join transaction — the client sends no role and no class. What
 * is written here is what the server confirmed the entry carries, falling
 * back to the account's own role only for the frame before the first status
 * lands.
 */

import { Loader2, Swords } from "lucide-react";
import { RANKED_ROLE_LABELS, type RankedRole } from "@/lib/ranked-public/roles";
import type { QueueController } from "@/pages/quiz-ranked/useRankedQueue";
import { usePlaySfx } from "@/lib/audio/usePlaySfx";
import PlayModePlate from "./PlayModePlate";
import { PLAY_INK as INK } from "./ink";

/** The words for each beat. Held as data so the copy is checkable and so the
 *  reading order and the accessible status text are the same string. */
const BEAT: Record<string, { eyebrow: string; headline: string; note: string }> = {
  opening: {
    eyebrow: "Match entry",
    headline: "Opening the queue…",
    note: "Checking the academy's records for you.",
  },
  ready: {
    eyebrow: "Ranked duel",
    headline: "Ready to enter",
    note: "You'll be matched with another summoner. Rating is at stake.",
  },
  joining: {
    eyebrow: "Match entry",
    headline: "Sealing your entry…",
    note: "Sending your name to the matchmaker.",
  },
  waiting: {
    eyebrow: "Matchmaking",
    headline: "Searching for an opponent…",
    note: "The academy is pairing you with a summoner of similar standing.",
  },
  pairing: {
    eyebrow: "Opponent found",
    headline: "Preparing your match…",
    note: "Your duel is being written. This can no longer be cancelled.",
  },
  matched: {
    eyebrow: "Opponent found",
    headline: "Entering the arena…",
    note: "Your duel is ready.",
  },
};

export default function RankedQueueView({
  queue,
  role,
  onJoin,
  onBack,
}: {
  queue: QueueController;
  /** The account's stored role, used only until the server confirms one. */
  role: RankedRole | null;
  onJoin: () => void;
  /** Leave Ranked and go back to the record's three clauses. Only offered
   *  when leaving is actually safe — see `RankedPlayScroll`. */
  onBack: () => void;
}) {
  const state = queue.state;
  /**
   * PLAY1 SOUND — this view's controls are the flow's ORDINARY ones.
   *
   * None of them is a decision about how to play, so none of them takes the
   * seal: Enter the Queue, Cancel Queue and Back all get the quiet fallback
   * knock. What the queue itself does — opening, pairing, refusing — is the
   * RECORD's to announce, from the controller's own state transitions, and is
   * deliberately not duplicated here:
   *
   *   Enter the Queue   `buttonPress` on the press, then `queueStart` when the
   *                     SERVER accepts. Two separate events, and the press cue
   *                     is the quieter of the two on purpose — the news is the
   *                     queue opening, not the button being pushed.
   *   Cancel Queue      `buttonPress`. Leaving is not a refusal; the negative
   *                     cue belongs to things the player did not choose.
   *   Back              `buttonPress`.
   */
  const sfx = usePlaySfx();
  /** Leaving, with its knock. Named once so the notices below and the in-flow
   *  control cannot drift into one of them being silent. */
  const goBack = () => {
    sfx.play("buttonPress");
    onBack();
  };

  if (state === "unavailable") {
    return (
      <Notice
        testId="play-ranked-unavailable"
        eyebrow="Competitive"
        heading="Ranked is closed right now"
        body={queue.unavailableReason ?? "Ranked isn't available at the moment."}
        onBack={goBack}
      />
    );
  }

  if (state === "fatal") {
    return (
      <Notice
        testId="play-ranked-fatal"
        eyebrow="Competitive"
        heading="Ranked couldn't be reached"
        body={queue.error ?? "Something went wrong reaching the Ranked service."}
        onBack={goBack}
      />
    );
  }

  const beat =
    state === "recovering"
      ? BEAT.opening
      : state === "joining" || state === "cancelling"
        ? BEAT.joining
        : state === "waiting"
          ? BEAT.waiting
          : state === "pairing"
            ? BEAT.pairing
            : state === "matched"
              ? BEAT.matched
              : BEAT.ready;

  // The identity the entry carries: the server's confirmation first, the
  // account's stored role only as the pre-first-poll fallback.
  const entryRole = queue.status?.role ?? role;
  const inFlight = state === "waiting" || state === "pairing" || state === "matched";

  return (
    <div className="flex flex-col gap-3" data-testid="play-ranked" data-queue-state={state}>
      {/* THE RANKED CARD, EXPANDED. The same miniature in the same frame the
          player just pressed, one size up and centred — so choosing Ranked
          reads as that entry opening rather than as a screen change. It takes
          `is-live` from the moment the join is sent until the handoff, which
          is what breathes its rim in step with the searching mark below and
          holds the head of the view visibly LIVE while the server has an
          entry for this account. */}
      <div className="flex justify-center">
        <PlayModePlate
          mode="ranked"
          size="hero"
          className={inFlight || state === "joining" ? "is-live" : ""}
        />
      </div>

      <div role="status" aria-live="polite" className="text-center">
        <p
          className="text-[9.5px] font-bold uppercase tracking-[0.26em]"
          style={{ color: state === "pairing" || state === "matched" ? INK.rubric : INK.faint }}
        >
          {beat.eyebrow}
        </p>
        <h3
          data-testid="play-ranked-headline"
          className="mt-0.5 text-[18px] font-black leading-tight sm:text-[20px]"
          style={{ color: INK.strong, textShadow: INK.press }}
        >
          {beat.headline}
        </h3>
        <p
          className="mx-auto mt-1 max-w-[34ch] text-[12px] font-medium leading-snug"
          style={{ color: INK.body }}
        >
          {beat.note}
        </p>
      </div>

      {/* The searching mark. Decoration only — every state above is written
          out in words, so this carries nothing on its own. */}
      {(state === "waiting" || state === "pairing") && (
        <div className="play-scroll-search h-[3px] w-full" aria-hidden="true" />
      )}

      {/* What the ENTRY says, as a ruled line of the record — and only once
          there is an entry to describe. Before the join the banner above
          already reads "Entering as Jungle", so repeating it in the past
          tense claimed something that had not happened yet. */}
      {entryRole !== null && (inFlight || state === "joining" || state === "cancelling") && (
        <p
          data-testid="play-ranked-queued-as"
          className="text-center text-[11.5px] font-semibold"
          style={{ color: INK.faint }}
        >
          Entered as{" "}
          <span style={{ color: INK.brass }}>{RANKED_ROLE_LABELS[entryRole]}</span>
        </p>
      )}

      {queue.error && (
        <p
          data-testid="play-ranked-error"
          role="alert"
          className="text-center text-[11.5px] font-semibold leading-snug"
          style={{ color: INK.rubric }}
        >
          {queue.error}
        </p>
      )}

      <div className="mt-1 flex flex-col items-center gap-2">
        {(state === "selecting_class" || state === "recovering") && (
          <button
            type="button"
            data-testid="play-ranked-join"
            disabled={state === "recovering" || role === null}
            onClick={() => {
              sfx.play("buttonPress");
              onJoin();
            }}
            className="play-scroll-clause flex min-h-[46px] w-full items-center justify-center gap-2 px-4 text-[13px] font-black uppercase tracking-[0.2em] disabled:cursor-not-allowed disabled:opacity-60"
            data-emphasis="true"
            style={{ color: INK.strong }}
          >
            <Swords className="h-4 w-4" aria-hidden="true" />
            Enter the Queue
          </button>
        )}

        {state === "joining" && (
          <p
            className="flex min-h-[46px] items-center gap-2 text-[12.5px] font-bold"
            style={{ color: INK.body }}
          >
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Joining…
          </p>
        )}

        {role === null && (state === "selecting_class" || state === "recovering") && (
          <p
            data-testid="play-ranked-role-required"
            className="text-center text-[11.5px] font-semibold leading-snug"
            style={{ color: INK.rubric }}
          >
            Choose your role on the lobby's role scroll before entering Ranked.
          </p>
        )}

        {/* Cancel exists only while cancelling is a legal answer. During the
            pairing window the server has already committed the match, so
            offering a cancel would be offering something that can only fail. */}
        {(state === "waiting" || state === "cancelling") && (
          <button
            type="button"
            data-testid="play-ranked-cancel"
            disabled={!queue.canCancel}
            onClick={() => {
              sfx.play("buttonPress");
              queue.cancel();
            }}
            className="play-scroll-control disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === "cancelling" ? "Cancelling…" : "Cancel Queue"}
          </button>
        )}

        {/* Back to the three clauses. Withheld the moment the server has an
            entry for this account: leaving then would hide a live queue. */}
        {!inFlight && state !== "joining" && state !== "cancelling" && (
          <button
            type="button"
            data-testid="play-ranked-back"
            onClick={goBack}
            className="play-scroll-back"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A refusal, composed rather than centred in an empty page.
 *
 * The old shape was an alert triangle over a heading over a line of text over
 * a bare underlined word, adrift in the middle of a large sheet: administrative,
 * and with nothing on it that said which mode had refused. This one keeps the
 * Ranked miniature — muted, drained of its colour, so it cannot read as an
 * invitation — states the mode above the heading, and gives the way back a
 * real control instead of a link. The reason is still `role="alert"` and is
 * still the server's own sentence, never a rewritten one.
 */
function Notice({
  testId,
  eyebrow,
  heading,
  body,
  onBack,
}: {
  testId: string;
  eyebrow: string;
  heading: string;
  body: string;
  onBack: () => void;
}) {
  return (
    <div className="play-scroll-notice" data-testid={testId}>
      <PlayModePlate mode="ranked" size="notice" tone="muted" />
      <p
        className="text-[9.5px] font-bold uppercase tracking-[0.26em]"
        style={{ color: INK.faint }}
      >
        {eyebrow}
      </p>
      <h3
        className="text-[17px] font-black leading-tight sm:text-[19px]"
        style={{ color: INK.strong, textShadow: INK.press }}
      >
        {heading}
      </h3>
      <p
        role="alert"
        className="play-scroll-notice__reason"
        style={{ color: INK.body }}
      >
        {body}
      </p>
      <button
        type="button"
        data-testid="play-ranked-back"
        onClick={onBack}
        className="play-scroll-control mt-1"
      >
        Back to match entry
      </button>
    </div>
  );
}
