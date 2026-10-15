/**
 * PERFECT TIMING — THE STAGE: the round plate over the casting seal.
 *
 * The plate states the public premise — champion, slot, ability, rank — and
 * nothing else. No number on it is a duration: the only digits the stage ever
 * prints are the rank, and progress through the run is a row of pips.
 *
 * THE SEAL IS THE ONE INPUT. A brass-rimmed stone disc with the ability's own
 * icon set in it, sized for a thumb, and it is the single element that
 * receives PT2's press-surface props. Pressing it casts; the icon goes dark the
 * way an in-game slot does; pressing again says "it is back". Between those
 * two presses the seal is STILL: no digit, no bar, no pulse, no breathing
 * glow, no cadence of any kind. The one motion the running state owns is a
 * finite flash at the instant of the cast.
 *
 * NOTHING HERE MEASURES OR GRADES. The phase, the handlers and the status
 * line arrive through props; this component draws them.
 */
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { SubjectArt } from "@/components/interaction-grammar/shared";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { PtPhase, PtPressSurfaceProps, PtRoundView } from "@/lib/perfect-timing/viewModel";
import { PHASE_FACE, rankText } from "./presentation";
import "./perfectTiming.css";

export interface PerfectTimingStageProps {
  /** Null while the first deal is in flight: the plate holds its box. */
  round: PtRoundView | null;
  phase: PtPhase;
  /** PT2's surface props, spread onto the seal and nothing else. */
  press: PtPressSurfaceProps;
  /** Replaces the phase's default status line. */
  statusText?: string | null;
  /** The most height the stage may take, from the host that measured its room. */
  stageHeight?: number;
  /**
   * Move focus to the seal when the stage mounts. The host asks for this when
   * the previous round's way-on button has just unmounted under the keyboard
   * player, so the same key that advanced the reveal casts the next round.
   */
  autoFocusSeal?: boolean;
}

/** Progress through the run as pips, one per round. */
export function RunPips({ index, total }: { index: number; total: number }) {
  const count = Math.max(1, Math.min(total, 12));
  return (
    <span className="pt-pips" role="img" aria-label={`Round ${index} of ${total}`} data-testid="pt-pips">
      {Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        const state = n < index ? "done" : n === index ? "current" : "upcoming";
        return <span key={n} className="pt-pip" data-state={state} />;
      })}
    </span>
  );
}

/** The round plate: who, which ability, which rank. Shared by the stage and the reveal's recap. */
export function PerfectTimingRoundPlate({ round, compact = false }: { round: PtRoundView | null; compact?: boolean }) {
  const headingId = useId();
  if (!round) {
    return (
      <header className="pt-head" data-testid="pt-round-plate" data-empty="true" aria-busy>
        <p className="pt-eyebrow"><span>Perfect Timing</span></p>
        <h2 className="pt-prompt" aria-hidden>{" "}</h2>
        <p className="pt-rank">{" "}</p>
      </header>
    );
  }
  return (
    <header className="pt-head" data-testid="pt-round-plate" data-compact={compact ? "true" : undefined}
      aria-labelledby={headingId}>
      <p className="pt-eyebrow">
        <span>Perfect Timing</span>
        <RunPips index={round.index} total={round.total} />
      </p>
      <h2 id={headingId} className="pt-prompt" tabIndex={-1} data-testid="pt-prompt">
        <span data-testid="pt-champion">{round.championName}</span>
        <span className="pt-slot" aria-label={`${round.slot} ability`}>{round.slot}</span>
        <span className="pt-prompt-ability" data-testid="pt-ability">{round.abilityName}</span>
      </h2>
      <p className="pt-rank" data-testid="pt-rank">
        {rankText(round.rank, round.rankCount)}
        {!compact && (
          <>
            <span className="pt-rank-dot" aria-hidden>·</span>
            base cooldown
          </>
        )}
      </p>
    </header>
  );
}

export function PerfectTimingStage({ round, phase, press, statusText, stageHeight, autoFocusSeal = false }: PerfectTimingStageProps) {
  const reducedMotion = useReducedMotionPreference();
  const coarse = useCoarsePointer();
  const sealRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocusSeal) sealRef.current?.focus({ preventScroll: true });
  }, [autoFocusSeal]);
  const face = PHASE_FACE[phase];
  const status = statusText ?? face.status;
  const style: CSSProperties | undefined = stageHeight !== undefined ? { maxHeight: stageHeight } : undefined;
  const monogram = round?.slot ?? "?";

  return (
    <div className="pt-stage" data-testid="pt-stage" data-phase={phase} style={style}>
      <PerfectTimingRoundPlate round={round} />

      <div className="pt-seal-row">
        {/* THE PRESS SURFACE. Exactly one element carries PT2's props; every
            child is decoration (`aria-hidden`), so the accessible name is the
            hook's label and nothing else. `touch-action: manipulation` and
            the 44px+ box come from the stylesheet. */}
        <div
          {...press}
          ref={sealRef}
          className="pt-seal"
          data-testid="pt-press-surface"
          data-phase={phase}
          data-animate={reducedMotion ? "false" : "true"}
        >
          <span aria-hidden className="pt-seal-ring" />
          <span aria-hidden className="pt-seal-face">
            <span className="pt-seal-icon" data-testid="pt-seal-icon">
              <SubjectArt media={round?.iconUrl ? { src: round.iconUrl, alt: "" } : null} monogram={monogram}
                className="h-full w-full" />
            </span>
            <span className="pt-seal-word" data-testid="pt-seal-word">{face.word}</span>
            <span className="pt-seal-sub">{face.sub}</span>
          </span>
        </div>
      </div>

      <p className="pt-status" data-testid="pt-status" data-tone={face.tone} role="status" aria-live="polite">
        {status}
      </p>

      <p className="pt-hint" data-testid="pt-hint">
        <kbd className="pt-kbd">Space</kbd>
        <span>or</span>
        <kbd className="pt-kbd">Enter</kbd>
        <span>{coarse ? "· or tap the seal" : "· or click the seal"}</span>
      </p>
    </div>
  );
}
