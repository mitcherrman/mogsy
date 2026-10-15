/**
 * PERFECT TIMING — THE RUN LADDER: every round of the run as a row, with its
 * signed error drawn against ONE shared millisecond scale — early reaching
 * left in cyan, late reaching right in ember, a voided round hatched — so the
 * shape of the run is readable at a glance on the results screen.
 *
 * Every figure is the server's reveal; the ladder only places it.
 */
import type { CSSProperties } from "react";
import type { PtRunSummary } from "@/lib/perfect-timing/viewModel";
import { TIER_WORD, errorDirection, formatMs, formatSeconds, ladderScaleMs, rankText, roundLabel, signedErrorText } from "./presentation";
import "./perfectTiming.css";

export function RunLadder({ summary }: { summary: PtRunSummary }) {
  const scale = ladderScaleMs(summary);
  return (
    <section aria-label="Run ladder" data-testid="pt-ladder" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="ranked-eyebrow ranked-eyebrow--cyan">Run ladder</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">scale ±{formatMs(scale)}</span>
      </div>
      <ol className="pt-ladder">
        {summary.rounds.map(({ round, reveal }) => {
          const direction = reveal ? errorDirection(reveal.errorMs) : null;
          const width = reveal ? `${Math.min(50, (reveal.absErrorMs / scale) * 50)}%` : "0%";
          return (
            <li key={round.roundId} className="pt-ladder-row" data-testid={`pt-ladder-row-${round.index}`}
              data-tier={reveal?.tier ?? "voided"}>
              <div className="pt-ladder-name">
                <p className="pt-ladder-title">{roundLabel(round)}</p>
                <p className="pt-ladder-sub">
                  {reveal
                    ? `${formatSeconds(reveal.elapsedMs)} vs ${formatSeconds(reveal.targetMs)} · ${signedErrorText(reveal.errorMs)}`
                    : `${rankText(round.rank, round.rankCount)} · voided`}
                </p>
              </div>
              <div className="pt-ladder-bar" data-voided={reveal ? "false" : "true"} aria-hidden>
                {reveal && direction && (
                  <span className="pt-ladder-fill" data-direction={direction} style={{ "--pt-w": width } as CSSProperties} />
                )}
              </div>
              <div className="pt-ladder-tier" data-tier={reveal?.tier ?? "voided"}>
                <b>{reveal ? TIER_WORD[reveal.tier] : "Voided"}</b>
                <span>{reveal ? `${reveal.points} pts` : "—"}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
