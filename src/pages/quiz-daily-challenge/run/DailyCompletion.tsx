/**
 * DCMOD-E — THE DAILY'S ONE CLOSE.
 *
 * The only full closing state in the whole challenge. Every stage before it
 * handed its match back without an outro; this is where the day is summed up:
 * each stage with its mode tag and the server's own numbers, Review read as
 * the recap that closed the day — or, on a perfect day, as the stage that was
 * never needed.
 *
 * Numbers are the server's per-stage results, listed, never added up into a
 * grade this client invented. A finished day offers no replay: the backend
 * holds one official run per player per day.
 */
import { Link } from "react-router-dom";
import type { DailyRun } from "@/lib/daily-challenge/run/contracts";
import { isPerfect, reviewStage } from "@/lib/daily-challenge/run/contracts";
import { stageContentLine } from "@/lib/daily-challenge/run/stageIdentity";
import { StageTag } from "./StageTag";

const ENDED_BY: Record<string, string> = {
  time_bank_exhausted: "bank ran out",
  strikes_exhausted: "out of mistakes",
};

export function DailyCompletion({ run }: { run: DailyRun }) {
  const perfect = isPerfect(run);
  const review = reviewStage(run);
  return (
    <section data-testid="daily-run-complete" data-perfect={perfect ? "true" : "false"}
      aria-live="polite"
      className="ranked-beat ranked-beat--major rounded-md py-10"
      style={{ minHeight: "min(70vh, 38rem)" }}>
      <span aria-hidden className="ranked-beat__scrim rounded-md" />
      <div className="ranked-beat__inner px-4">
        <p className="ranked-beat__meta">{run.planDate}</p>
        <h2 className="ranked-title ranked-beat__title">Daily Challenge Complete</h2>
        <span aria-hidden className="ranked-beat__rule" />
        {perfect && (
          <p data-testid="daily-run-perfect"
            className="rounded-sm border border-amber-300/70 bg-amber-300/15 px-3 py-1 text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">
            Perfect day — nothing to review
          </p>
        )}
        <ol className="flex w-full max-w-xl flex-col gap-2 pt-2" data-testid="daily-run-recap">
          {run.stages.map((s) => {
            const r = s.result;
            const skipped = s.status === "skipped";
            const closing = s.id === review.id;
            return (
              <li key={s.id} data-testid={`daily-recap-${s.index}`} data-stage-kind={s.kind}
                data-closing={closing ? "true" : undefined}
                className={`flex items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left ${
                  closing ? "border-amber-300/50 bg-amber-300/5" : "border-white/10 bg-black/20"}`}>
                <span className="flex min-w-0 flex-col gap-1">
                  <StageTag stage={s} />
                  {stageContentLine(s) && (
                    <span className="truncate text-xs text-[var(--ranked-muted,#a8a29e)]">
                      {stageContentLine(s)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums" data-testid={`daily-recap-${s.index}-result`}>
                  {skipped ? "Not needed"
                    : r ? (
                      <>
                        {r.correct} / {r.answered}
                        {ENDED_BY[r.endedBy] && (
                          <span className="block text-[0.6875rem] opacity-70">{ENDED_BY[r.endedBy]}</span>
                        )}
                      </>
                    ) : "—"}
                </span>
              </li>
            );
          })}
        </ol>
        <Link to="/quiz" data-testid="daily-run-home"
          className="pt-3 text-sm text-muted-foreground underline">
          Back to Leaguecraft
        </Link>
      </div>
    </section>
  );
}
