/**
 * PGM2 — the pieces every public specialized bonus game shares, so
 * Rangefinder, Glyph Press, Stat Drop and Combat Estimate read as one product
 * inside the real `CanonicalArena`: the way back to More Challenges at the
 * head of the arena's chrome row, the rails, the round bar, the session's
 * loading and failure states, the end-of-run results, and the report seam.
 *
 * Nothing here names an owner, a prototype, a flag or a build: these are the
 * player-facing counterparts of `pages/admin/playtests/ownerArena`.
 */
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { usePublishReportableQuestion } from "@/lib/feedback/reportable-question";
import { MORE_CHALLENGES_ROUTE } from "@/lib/public-modes/launch";
import { publicModeReportSnapshot, type PublicModeQuestion, type PublicModeReveal } from "@/lib/public-modes/report";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";

/** The arena header's honest one-liner for every public session game. */
export const BONUS_GAME_NOTE = "Bonus game · unrated";

export function GameLead({ title }: { title: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2" data-testid="bonus-game-lead">
      <Link to={MORE_CHALLENGES_ROUTE} data-testid="bonus-game-back"
        className="inline-flex min-h-[28px] items-center gap-1 rounded border border-[#d5b66f]/40 px-2 py-0.5 text-[11px] text-[#f6e6bb] hover:border-[#d5b66f]">
        <ArrowLeft className="h-3 w-3" aria-hidden /> More Challenges
      </Link>
      <span className="ranked-eyebrow shrink-0" data-testid="bonus-game-title">{title}</span>
    </span>
  );
}

export function GameRail({ title, testId, rows }: { title: string; testId: string; rows: [string, ReactNode][] }) {
  return (
    <aside data-testid={testId} className="ranked-panel hidden h-full flex-col gap-3 p-4 text-[#efe8d6] lg:flex">
      <p className="ranked-eyebrow">{title}</p>
      <dl className="flex flex-col gap-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-[#a9b3c1]">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

/** Loading / failure of a whole game, in the arena's own dark frame. */
export function GameState({ title, state, message, onRetry }: {
  title: string;
  state: "loading" | "error";
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div data-testid="bonus-game-state" data-state={state} className="min-h-screen w-full bg-[#050b15] px-4 pb-10 pt-20 text-[#efe8d6]">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <GameLead title={title} />
        {state === "loading" ? (
          <p data-testid="bonus-game-loading" aria-busy className="text-sm text-[#a9b3c1]">Dealing your game…</p>
        ) : (
          <>
            <p role="alert" data-testid="bonus-game-error" className="text-sm text-red-300">{message}</p>
            {onRetry ? (
              <button type="button" onClick={onRetry} data-testid="bonus-game-retry"
                className="min-h-[44px] rounded border border-[#d5b66f] bg-[#2a2110] px-4 text-xs uppercase tracking-[0.14em] text-[#f6e6bb]">
                Try again
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** The chrome row's right side: the round counter, then Next / See results. */
export function RoundBar({ index, total, revealed, onNext, onFinish }: {
  index: number;
  total: number;
  revealed: boolean;
  onNext: () => void;
  onFinish: () => void;
}) {
  const last = index >= total - 1;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      <span data-testid="bonus-game-counter" className="font-mono tabular-nums opacity-80">
        Round {index + 1} / {total}
      </span>
      <button type="button" data-testid={last ? "bonus-game-finish" : "bonus-game-next"}
        onClick={last ? onFinish : onNext} disabled={!revealed}
        className="min-h-[36px] whitespace-nowrap rounded border border-[#d5b66f] bg-[#2a2110] px-3 py-0.5 uppercase tracking-[0.14em] text-[#f6e6bb] hover:bg-[#3a2d14] disabled:opacity-40">
        {last ? "See results" : "Next"}
      </button>
    </span>
  );
}

/** The end of a run: what the player did, then play again or go back. */
export function GameResults({ title, headline, stats, rows, onPlayAgain }: {
  title: string;
  headline: string;
  stats: [string, string][];
  /** One line per round, in play order. */
  rows: { label: string; detail: string; tone?: "good" | "bad" | "neutral" }[];
  onPlayAgain: () => void;
}) {
  return (
    <div data-testid="bonus-game-results" className="min-h-screen w-full bg-[#050b15] px-4 pb-12 pt-16 text-[#efe8d6]">
      <section className="ranked-panel mx-auto flex max-w-2xl flex-col gap-4 p-5" aria-label={`${title} results`}>
        <p className="ranked-eyebrow">{title} · Unrated</p>
        <h1 className="ranked-title text-2xl font-bold" data-testid="bonus-game-results-headline">{headline}</h1>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="bonus-game-results-stats">
          {stats.map(([k, v]) => (
            <div key={k} className="ranked-subpanel flex flex-col gap-0.5 p-3">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-[#a9b3c1]">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <ol className="flex flex-col gap-1.5 text-sm" data-testid="bonus-game-results-rounds">
          {rows.map((r, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-1.5">
              <span className="min-w-0 truncate">{r.label}</span>
              <span className={r.tone === "good" ? "text-emerald-300" : r.tone === "bad" ? "text-rose-300" : "text-[#a9b3c1]"}>
                {r.detail}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-[#a9b3c1]">Bonus games never change your Daily score or your Ranked rating.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onPlayAgain} data-testid="bonus-game-play-again"
            className="min-h-[44px] flex-1 rounded border border-[#d5b66f] bg-[#2a2110] px-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#f6e6bb] hover:bg-[#3a2d14]">
            Play again
          </button>
          <Link to={MORE_CHALLENGES_ROUTE} data-testid="bonus-game-results-back"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded border border-[#d5b66f]/40 px-4 text-sm text-[#f6e6bb] hover:border-[#d5b66f]">
            Back to More Challenges
          </Link>
        </div>
      </section>
    </div>
  );
}

/**
 * Publish the round on screen to the one report control, through the
 * public-mode builder: the answer and its evidence travel ONLY with a reveal
 * the server already released to this player.
 */
export function useBonusRoundReport(entry: Pick<PublicModeEntry, "reportId" | "title"> | null,
                                    question: PublicModeQuestion | null, reveal: PublicModeReveal) {
  usePublishReportableQuestion(entry && question ? publicModeReportSnapshot(entry, question, reveal) : null);
}

/** A small error strip under the arena, with a way to start over when expired. */
export function GameError({ message, expired, onRestart }: { message: string; expired: boolean; onRestart: () => void }) {
  return (
    <div role="alert" data-testid="bonus-game-round-error"
      className="relative z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-2 text-sm text-red-300">
      <span>{message}</span>
      {expired ? (
        <button type="button" onClick={onRestart} className="min-h-[36px] rounded border border-[#d5b66f] px-3 text-xs text-[#f6e6bb]">
          Start a new game
        </button>
      ) : null}
    </div>
  );
}
