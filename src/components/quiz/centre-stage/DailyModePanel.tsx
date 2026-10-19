/**
 * PARCHMENT CONTINUITY — the Daily Challenge mode of the Quiz Hub's centre
 * sheet, composed in the same language as Ranked: a display title, a Mogzy
 * figure seated on the parchment, a short real record, and the red wax seal.
 *
 * READING ORDER — "Here is today's challenge. Your next attempt is waiting."
 *   title + one status line  →  Mogzy  →  today's record  →  the seal.
 *
 * DATA HONESTY
 * Every figure is read from today's Daily parent run (`DailyStatusView`), the
 * same server answer the seal's destination plays. The parent run keeps no
 * streak, so no streak is shown; a score and a correct count appear only once
 * the server has settled them. Anything not known is an em dash — never a 0.
 *
 * THE SEAL SAYS "PLAY" — so it is only used for an action that IS play:
 * starting, continuing, or (with More Challenges / Review still open)
 * carrying on after the main Daily. A day that is simply finished offers
 * "View Today's Results" as a plain button instead, because a PLAY seal
 * there would promise a game the Daily flow does not offer.
 */
import RankedPlayGem from "@/components/quiz/RankedPlayGem";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import type { DailyStatusView } from "@/lib/daily-challenge/status";

const INK = LEAGUECRAFT_INK;

export interface DailyModeCopy {
  status: string;
  action: string;
  /** Use the PLAY seal (a play action) rather than the plain results button. */
  seal: boolean;
  dayState: string;
  completed: boolean;
}

/** The panel's words for each Daily state. Pure, so it is tested directly. */
export function dailyModeCopy(daily: DailyStatusView | null): DailyModeCopy {
  const known = daily?.known === true;
  const completed = known && daily!.completed;
  const resumable = known && daily!.resumable;
  if (completed) {
    return daily!.optionalOpen
      ? {
          status: "Standard complete · More Challenges or Review available.",
          action: "Continue / Review",
          seal: true,
          dayState: "Complete",
          completed,
        }
      : {
          status: "Today's Standard challenge is complete.",
          action: "View Today's Results",
          seal: false,
          dayState: "Complete",
          completed,
        };
  }
  if (resumable) {
    return {
      status: "You have an unfinished Daily Challenge.",
      action: "Continue Daily",
      seal: true,
      dayState: "In progress",
      completed,
    };
  }
  return {
    status: "A fresh League knowledge challenge every day.",
    action: "Play Daily",
    seal: true,
    // An unread day is playable, but it is not a fact we can state.
    dayState: known ? "Ready" : "—",
    completed,
  };
}

export default function DailyModePanel({
  daily,
  onPlay,
  paused = false,
}: {
  daily: DailyStatusView | null;
  onPlay?: () => void;
  /** Owner queue pause; an existing run may still be resumed. */
  paused?: boolean;
}) {
  const copy = dailyModeCopy(daily);
  const displayCopy = paused
    ? { ...copy, status: "Daily Challenge is temporarily unavailable.", action: "Daily Paused" }
    : copy;
  const score = daily?.known && typeof daily.score === "number" ? daily.score : null;
  const correct = daily?.known && typeof daily.correct === "number" ? daily.correct : null;
  const answered = daily?.known && typeof daily.answered === "number" ? daily.answered : null;

  return (
    <div className="lc-daily-panel flex h-full min-h-0 w-full flex-col items-center text-center" data-testid="daily-mode-panel">
      {/* ── Header: the same display title every mode opens with ───────── */}
      <div className="lc-daily-panel__head w-full shrink-0">
        <h2
          className="lc-daily-panel__title lc-scroll-title whitespace-nowrap font-black uppercase leading-none tracking-[0.13em]"
          style={{ color: INK.strong, textShadow: INK.press }}
        >
          Today's Challenge
        </h2>
        <p
          className="lc-daily-panel__status mx-auto mt-1.5 max-w-[19rem] text-[12.5px] font-semibold leading-snug"
          style={{ color: INK.body }}
          data-testid="daily-mode-status"
        >
          {displayCopy.status}
        </p>
      </div>

      {/* ── The figure. The one flexible region of this mode: it takes the
             height the stage has left and Mogzy is drawn to fit it, so the
             sheet's box is never asked to grow. A finished day gets the
             cheering pose; every other state the scholar with his book. ── */}
      <div className="lc-daily-hero relative mt-1 w-full min-h-[5.5rem] flex-1" data-testid="daily-mode-hero">
        <span aria-hidden="true" className="lc-daily-hero__aura" />
        <span aria-hidden="true" className="lc-daily-hero__plinth" />
        <MogzyMascot
          pose={copy.completed ? "cheering" : "holdingBook"}
          scale="medium"
          decorative
          loading="eager"
          className="lc-daily-hero__art"
          data-testid="daily-mode-mascot"
        />
        {copy.completed ? (
          <span
            className="absolute right-0 top-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.16em]"
            style={{ border: `1px solid ${INK.rule}`, color: INK.brass, background: "rgba(255, 246, 222, 0.7)" }}
            data-testid="daily-mode-complete"
          >
            Complete
          </span>
        ) : null}
      </div>

      {/* ── Today's record: three ruled figures, the Ranked ledger rhythm ── */}
      <dl
        className="lc-daily-panel__stats grid w-full shrink-0 grid-cols-3 border-y py-1.5"
        style={{ borderColor: INK.rule }}
        data-testid="daily-mode-stats"
      >
        <DailyStat label="Today" value={copy.dayState} />
        <DailyStat label="Score" value={score === null ? "—" : score.toLocaleString()} divided />
        <DailyStat
          label="Correct"
          value={correct === null || answered === null ? "—" : `${correct}/${answered}`}
          divided
        />
      </dl>

      {/* ── The action. Protected: never shrinks, always last, always inside
             the sheet's safe area above the foot roller. ─────────────────── */}
      <div className="lc-daily-panel__cta mt-2 flex w-full shrink-0 flex-col items-center" data-testid="daily-mode-cta">
        {copy.seal ? (
          <>
            <RankedPlayGem
              onClick={() => onPlay?.()}
              disabled={!onPlay}
              label={displayCopy.action}
              testId="daily-play-seal"
            />
            {/* The seal's art says PLAY; this line says exactly which play. */}
            <span
              aria-hidden="true"
              className="lc-daily-panel__caption mt-0.5 text-[11px] font-extrabold uppercase tracking-[0.18em]"
              style={{ color: INK.accent, textShadow: INK.press }}
            >
              {displayCopy.action}
            </span>
          </>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            disabled={!onPlay}
            className="lc-daily-panel__results mb-1 rounded-lg px-8 py-3 text-sm font-black uppercase tracking-[0.12em] text-amber-50 shadow-sm disabled:opacity-50"
            style={{ background: "linear-gradient(180deg, #6b4510 0%, #3f2706 100%)", border: "1px solid #2a1a04" }}
            data-testid="daily-results-button"
          >
            {copy.action}
          </button>
        )}
      </div>
    </div>
  );
}

function DailyStat({ label, value, divided = false }: { label: string; value: string; divided?: boolean }) {
  return (
    <div
      className={`min-w-0 px-1 ${divided ? "border-l" : ""}`}
      style={divided ? { borderColor: INK.rule } : undefined}
      data-testid="daily-mode-stat"
    >
      <dt
        className="text-[9.5px] font-extrabold uppercase tracking-[0.18em]"
        style={{ color: INK.faint }}
      >
        {label}
      </dt>
      <dd
        className="mt-0.5 truncate text-[16px] font-black leading-tight tabular-nums"
        style={{ color: INK.strong, textShadow: INK.press }}
      >
        {value}
      </dd>
    </div>
  );
}
