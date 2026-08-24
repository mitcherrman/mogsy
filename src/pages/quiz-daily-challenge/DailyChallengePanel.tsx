/**
 * TODAY'S CHALLENGE — the Daily's right flank (DC1 Phase 5, ARENA1 Step 5).
 *
 * The one piece of presentation this mode legitimately owns.
 *
 * Ranked puts a duelist in this column, and the whole premise of the Daily is
 * that there isn't one. Step 3 built `ArenaRail.panel` for exactly this case —
 * a flank a mode occupies with its own content — and this is its first caller.
 * The outer geometry, the column's share of the grid and its stretched height
 * all belong to `CanonicalArena`; what is inside belongs here.
 *
 * The frame deliberately MATCHES the duelist column opposite it: same card
 * chrome, same border weight, same inset ring, same padding — so the arena
 * reads as three columns rather than as a real panel beside an improvised one.
 * Its accent is the arena's brass rather than the opponent column's red,
 * because red means "the thing trying to beat you" and this is a day, not a
 * player.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ───────────────────────────
 * No name, no portrait, no crest, no rating, no ability tray, no "waiting for
 * opponent", no speed comparison, no rematch. Every one of those would be a
 * claim that somebody is on the other side, and a player who believes that
 * will read a missed card as losing to them.
 *
 * TWO METERS, BECAUSE THEY MEAN DIFFERENT THINGS
 * ──────────────────────────────────────────────
 * CARDS is progress and is the only thing that ends the day: it rises on every
 * solved card, including one solved after a miss, and the run finishes when it
 * fills. SCORE is the "damage" meter and moves only on first attempts — it can
 * finish well short of full with nothing wrong, which is exactly what a grade
 * is for.
 *
 * The score meter CANNOT end the run. It is drawn as ground taken, not as an
 * opponent's health, precisely so that reaching 100% early (impossible today,
 * but a bonus could get there) would read as "a perfect day so far" rather
 * than as a victory that leaves five cards still to play.
 */

import { CalendarDays, Flag, Swords } from "lucide-react";
import type { DcChallengeView } from "./dailyChallengeViews";

function Meter({
  label, valueLabel, fillBp, tone, testId,
}: {
  label: string; valueLabel: string; fillBp: number;
  tone: "score" | "cards"; testId: string;
}) {
  const percent = Math.max(0, Math.min(100, fillBp / 100));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          data-testid={`${testId}-value`}
          className="text-xs font-semibold tabular-nums"
        >
          {valueLabel}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        data-testid={testId}
        data-fill-bp={fillBp}
        className="h-2 w-full overflow-hidden rounded-full bg-black/35 ring-1 ring-white/10"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out
                      motion-reduce:transition-none ${
            tone === "score"
              ? "bg-gradient-to-r from-amber-500 to-amber-300"
              : "bg-gradient-to-r from-sky-600 to-sky-400"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function DailyChallengePanel({ challenge }: { challenge: DcChallengeView }) {
  const {
    resolved, total, remaining, progressBp, score, maxScore, theme,
    challengeDate, complete,
  } = challenge;
  const cardsBp = total > 0 ? Math.round((resolved * 10_000) / total) : 0;

  return (
    <section
      aria-label="Today's Challenge"
      data-testid="dc-challenge-panel"
      data-complete={complete ? "true" : "false"}
      /* The duelist column's own frame, in brass. See the note above: three
         columns of one kind, not two panels and a stranger. */
      className="relative flex h-full flex-col gap-3 rounded-xl border-2
                 border-[#b9934c]/50 bg-card p-3 ring-1 ring-inset ring-white/5
                 shadow-[0_0_24px_-12px_rgba(185,147,76,0.45)]"
    >
      <header className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
          Today's Challenge
        </p>
        {/* The DAY is the identity here. A name would be a summoner. */}
        <h2 className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
          <time dateTime={challengeDate}>{challengeDate}</time>
        </h2>
        {theme && (
          <p data-testid="dc-challenge-theme" className="text-xs text-muted-foreground">
            {theme}
          </p>
        )}
      </header>

      <Meter
        label="Ground taken"
        valueLabel={`${score} / ${maxScore}`}
        fillBp={progressBp}
        tone="score"
        testId="dc-score-meter"
      />
      <Meter
        label="Cards cleared"
        valueLabel={`${resolved} / ${total}`}
        fillBp={cardsBp}
        tone="cards"
        testId="dc-cards-meter"
      />

      <div className="mt-auto space-y-1.5 border-t border-white/10 pt-2.5">
        {complete ? (
          <p
            data-testid="dc-challenge-status"
            className="flex items-center gap-1.5 text-xs font-medium text-amber-300"
          >
            <Flag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Challenge complete
          </p>
        ) : (
          <p
            data-testid="dc-challenge-status"
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Swords className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
            {/* Says what ENDS the day, so the score meter is never mistaken for
                a health bar that could finish it early. */}
            {remaining === 1 ? "1 card left" : `${remaining} cards left`}
          </p>
        )}
        <p className="text-[10px] leading-snug text-muted-foreground/80">
          Only your first answer on each card takes ground.
        </p>
      </div>
    </section>
  );
}
