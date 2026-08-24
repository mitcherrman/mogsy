/**
 * RG1 — FORFEIT MATCH. The only way a player ends a Ranked duel on purpose.
 *
 * WHY IT HAS TO EXIST. Ranked treats every unexplained disappearance as a
 * disconnect and gives it a 45-second reconnect window, because a closed tab,
 * a crashed browser, a dead network, a sleeping laptop and a deliberate
 * walk-away are indistinguishable from the server — `beforeunload` and friends
 * cannot tell them apart either, and acting on them would forfeit players who
 * were coming right back. That is the correct default, and it leaves exactly
 * one gap: a player who genuinely wants out has no way to say so. This is it.
 *
 * WHY IT LOOKS LIKE THIS. It is deliberately the quietest thing in the arena —
 * a small text control in the strip's corner, no plate, no colour, no icon
 * competing with the answers. A duel is lost by pressing it, so it must be
 * possible to find and hard to hit; the confirmation is what actually protects
 * it, and the styling is what keeps it from being reached for absentmindedly.
 *
 * THE CONFIRMATION SAYS THE CONSEQUENCE. Not "are you sure" — what happens:
 * the opponent wins, it counts, it cannot be undone. Cancel is the default
 * position and does nothing at all.
 *
 * IT OWNS NO SETTLEMENT. The press calls the host's `onForfeit`, which sends
 * `POST /api/ranked/matches/{id}/forfeit`; the backend applies the same
 * terminal path a timed-out forfeit takes, and the arena learns the outcome
 * from the next snapshot like any other ending. There is no local "you lost"
 * state here to disagree with the server.
 */
import { useState } from "react";

export function ForfeitControl({
  onForfeit,
  disabled = false,
  className = "",
}: {
  /** Sends the authoritative command. The backend settles; this does not. */
  onForfeit: () => void;
  /** Held while another action is in flight, so one press cannot double-send. */
  disabled?: boolean;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        data-testid="ranked-forfeit"
        onClick={() => setConfirming(true)}
        disabled={disabled}
        className={`text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70
          underline-offset-4 transition-colors hover:text-destructive hover:underline
          disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        Forfeit Match
      </button>
    );
  }

  return (
    <div
      data-testid="ranked-forfeit-confirm"
      role="alertdialog"
      aria-label="Forfeit this Ranked match?"
      className={`flex flex-wrap items-center justify-end gap-2 text-[11px] ${className}`}
    >
      {/* The consequence, in the words that are actually true of it. */}
      <span className="text-muted-foreground">
        Forfeit? Your opponent wins this match and it counts.
      </span>
      {/* Cancel FIRST in the reading and tab order: the safe action is the one
          a hurried reader reaches, and it is the one this control defaults to. */}
      <button
        type="button"
        data-testid="ranked-forfeit-cancel"
        onClick={() => setConfirming(false)}
        className="rounded border border-white/15 px-2 py-0.5 font-semibold
          uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
      <button
        type="button"
        data-testid="ranked-forfeit-confirm-action"
        onClick={() => { setConfirming(false); onForfeit(); }}
        disabled={disabled}
        className="rounded border border-destructive/60 px-2 py-0.5 font-semibold
          uppercase tracking-[0.12em] text-destructive hover:bg-destructive/10
          disabled:cursor-not-allowed disabled:opacity-50"
      >
        Forfeit
      </button>
    </div>
  );
}
