/**
 * YOU — the left column (DC1 Phase 5).
 *
 * The Ranked arena puts a `CombatantPanel` here: HP, XP, level, armed ability,
 * submission status, mascot. Most of that describes a DUEL — there is no HP to
 * lose in a Daily, no ability to arm, and nobody whose submission you are
 * waiting on. What survives is the part that is still true of a solo run: who
 * you are, what you have scored, and how the day has gone so far.
 *
 * THE RECORD IS THE POINT
 * ───────────────────────
 * A row of marks, one per resolved card, in play order. It distinguishes SOLVED
 * FIRST TRY from SOLVED EVENTUALLY, because under retry-until-correct every
 * card ends solved and a strip that showed only "done" would say nothing at
 * all. The timeout mark is separate again: it is the one outcome the player did
 * not choose.
 */

import { Check, Clock, RotateCcw } from "lucide-react";
import type { DcPlayerView, DcRecordMark } from "./dailyChallengeViews";

const MARK: Record<DcRecordMark, {
  Icon: typeof Check; className: string; label: string;
}> = {
  correct: {
    Icon: Check,
    className: "bg-emerald-500/20 text-emerald-300 ring-emerald-400/40",
    label: "Solved first try",
  },
  learned: {
    Icon: RotateCcw,
    className: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
    label: "Solved after the scored attempt",
  },
  timeout: {
    Icon: Clock,
    className: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
    label: "Window closed, then solved",
  },
};

export function DailyPlayerPanel({
  player, displayName,
}: {
  player: DcPlayerView;
  displayName: string | null;
}) {
  const accuracy = player.accuracyBp === null
    ? null : (player.accuracyBp / 100).toFixed(player.accuracyBp % 100 === 0 ? 0 : 1);

  return (
    <section
      aria-label="Your run"
      data-testid="dc-player-panel"
      className="ranked-panel flex h-full flex-col gap-3 p-3 sm:p-4"
    >
      <header className="space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          You
        </p>
        <h2 className="truncate text-sm font-semibold leading-tight">
          {displayName ?? "Challenger"}
        </h2>
      </header>

      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Score
        </p>
        <p data-testid="dc-player-score" className="text-2xl font-bold tabular-nums leading-none">
          {player.score}
          <span className="ml-1 text-sm font-medium text-muted-foreground">
            / {player.maxScore}
          </span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            First try
          </dt>
          <dd data-testid="dc-player-first-try" className="font-semibold tabular-nums">
            {player.firstAttemptCorrect}
            <span className="text-muted-foreground"> / {player.settled}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Accuracy
          </dt>
          {/* null until a card settles: a player one card in is 100% so far,
              not 8%, and zero would be a lie in the other direction. */}
          <dd data-testid="dc-player-accuracy" className="font-semibold tabular-nums">
            {accuracy === null ? "—" : `${accuracy}%`}
          </dd>
        </div>
        {player.reflexTotal > 0 && (
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Meta Reflex
            </dt>
            <dd data-testid="dc-player-reflex" className="font-semibold tabular-nums">
              {player.reflexCorrect}
              <span className="text-muted-foreground"> / {player.reflexTotal}</span>
            </dd>
          </div>
        )}
        {player.timeouts > 0 && (
          <div>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Timed out
            </dt>
            <dd data-testid="dc-player-timeouts" className="font-semibold tabular-nums">
              {player.timeouts}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-auto space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Record
        </p>
        {/* Wraps rather than scrolls: a 15-card day must not put a scrollbar
            inside the arena, which has a standing no-inner-scroll rule. */}
        <ul
          data-testid="dc-player-record"
          className="flex flex-wrap gap-1"
          aria-label="Cards resolved so far"
        >
          {player.record.length === 0 && (
            <li className="text-[11px] text-muted-foreground">Nothing yet.</li>
          )}
          {player.record.map((mark, i) => {
            const { Icon, className, label } = MARK[mark];
            return (
              <li
                key={i}
                data-mark={mark}
                title={label}
                className={`inline-flex h-5 w-5 items-center justify-center rounded-sm
                            ring-1 ${className}`}
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                <span className="sr-only">{`Card ${i + 1}: ${label}`}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
