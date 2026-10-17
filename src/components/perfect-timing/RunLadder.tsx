/**
 * PERFECT TIMING — THE RUN LADDER: every round of the run as a row — the
 * ability's icon, who and which, what the stop was against the truth — with its
 * signed error drawn against ONE shared millisecond scale: early reaching left
 * in cyan, late reaching right in ember, a voided round hatched. The shape of
 * the run is readable at a glance, and the whole ladder fits one screen.
 *
 * Every figure is the server's reveal; the ladder only places it.
 *
 * PT5: a Mastery Slice's rows are the three stages of ONE ability, so a row
 * names its stage and inputs (rank, item) instead of the champion, and its
 * line carries the change from the previous stage's true cooldown.
 */
import type { CSSProperties } from "react";
import { SubjectArt } from "@/components/interaction-grammar/shared";
import type { PtRunSummary } from "@/lib/perfect-timing/viewModel";
import {
  SLICE_STAGE_WORD, TIER_WORD, deltaSecondsText, errorDirection, formatMs, formatSeconds, formatSliceSeconds, hasteText, ladderScaleMs, rankText,
  signedErrorText,
} from "./presentation";
import "./perfectTiming.css";

export function RunLadder({ summary }: { summary: PtRunSummary }) {
  const scale = ladderScaleMs(summary);
  return (
    <section aria-label="Run ladder" data-testid="pt-ladder" className="pt-ladder-wrap">
      <ol className="pt-ladder" style={{ "--pt-rows": summary.rounds.length } as CSSProperties}>
        {summary.rounds.map(({ round, reveal }, i) => {
          const direction = reveal ? errorDirection(reveal.errorMs) : null;
          const slice = round.slice ?? null;
          // The previous stage's truth, only if it was revealed (a voided stage stays unknown).
          const prevTrue = slice && i > 0 ? summary.rounds[i - 1].reveal?.targetMs ?? null : null;
          const width = reveal ? `${Math.min(50, (reveal.absErrorMs / scale) * 50)}%` : "0%";
          return (
            <li key={round.roundId} className="pt-ladder-row" data-testid={`pt-ladder-row-${round.index}`}
              data-tier={reveal?.tier ?? "voided"} data-slice={slice ? "true" : undefined}>
              <span className="pt-ladder-icon" aria-hidden>
                <SubjectArt media={round.iconUrl ? { src: round.iconUrl, alt: "" } : null} monogram={round.slot} className="h-full w-full" />
                {slice?.item?.iconUrl
                  ? <img className="pt-ladder-item" src={slice.item.iconUrl} alt="" draggable={false} data-testid="pt-ladder-item" />
                  : <i>{round.slot}</i>}
              </span>
              <div className="pt-ladder-name">
                {slice ? (
                  <p className="pt-ladder-title" data-testid={`pt-ladder-stage-${slice.kind}`}>
                    <b>{SLICE_STAGE_WORD[slice.kind]}</b>{" "}
                    <span>{slice.item ? `${slice.item.name} ${hasteText(slice.item.abilityHaste, true)}` : `Rank ${round.rank}`}</span>
                  </p>
                ) : (
                  <p className="pt-ladder-title">
                    <b>{round.championName}</b> <span>{round.abilityName}</span>
                  </p>
                )}
                <p className="pt-ladder-sub">
                  {reveal ? (
                    <>
                      <span className="pt-ladder-times">{slice
                        ? `${formatSliceSeconds(reveal.elapsedMs)} vs ${formatSliceSeconds(reveal.targetMs)} · `
                        : `${formatSeconds(reveal.elapsedMs)} vs ${formatSeconds(reveal.targetMs)} · `}</span>
                      <span>{signedErrorText(reveal.errorMs)}</span>
                      {slice && prevTrue !== null ? (
                        <span className="pt-ladder-delta" data-testid={`pt-ladder-delta-${slice.kind}`}>{" · "}<span className="pt-nw">{`true ${deltaSecondsText(prevTrue, reveal.targetMs)}`}</span></span>
                      ) : null}
                    </>
                  ) : `${rankText(round.rank, round.rankCount)} · voided`}
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
      <p className="pt-ladder-scale">error scale ±{formatMs(scale)}</p>
    </section>
  );
}
