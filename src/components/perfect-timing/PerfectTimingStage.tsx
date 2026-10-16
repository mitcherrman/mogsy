/**
 * PERFECT TIMING — THE STAGE: the champion over the casting seal.
 *
 * The HERO states the public premise with the champion's own art — splash crop,
 * ability icon, spell letter, champion, ability, rank — and nothing else. No
 * number on it is a duration: the only digits the stage ever prints are the
 * rank. Progress through the run lives in the top bar, not here.
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
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SubjectArt } from "@/components/interaction-grammar/shared";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { PtPhase, PtPressSurfaceProps, PtRoundView } from "@/lib/perfect-timing/viewModel";
import { PHASE_FACE, rankText } from "./presentation";
import "./perfectTiming.css";

export interface PerfectTimingStageProps {
  /** Null while the first deal is in flight: the hero holds its box. */
  round: PtRoundView | null;
  phase: PtPhase;
  /** PT2's surface props, spread onto the seal and nothing else. */
  press: PtPressSurfaceProps;
  /** Replaces the phase's default status line. */
  statusText?: string | null;
  /** Recovery buttons (retry, continue) shown under the status line. */
  actions?: ReactNode;
  /**
   * Move focus to the seal when the stage mounts. The host asks for this when
   * the previous round's way-on button has just unmounted under the keyboard
   * player, so the same key that advanced the reveal casts the next round.
   */
  autoFocusSeal?: boolean;
}

/** The champion's splash, cropped to the hero; a failure leaves the dark card. */
function HeroArt({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <span className="pt-hero-art" aria-hidden data-art="none" />;
  return (
    <span className="pt-hero-art" aria-hidden data-art="splash">
      <img key={src} src={src} alt="" draggable={false} onError={() => setFailed(src)} />
    </span>
  );
}

/**
 * The hero: who, which ability, which rank — over the champion's art. Shared by
 * the stage and (compact) the reveal, so the ability the player timed is still
 * in front of them when its cooldown is disclosed.
 */
export function PerfectTimingHero({ round, compact = false }: { round: PtRoundView | null; compact?: boolean }) {
  const headingId = useId();
  if (!round) {
    return (
      <header className="pt-hero" data-testid="pt-round-plate" data-empty="true" aria-busy>
        <HeroArt src={null} />
        <div className="pt-hero-body">
          <span className="pt-hero-icon" data-skeleton="true" />
          <div className="pt-hero-text">
            <h2 className="pt-prompt" aria-hidden>{" "}</h2>
            <p className="pt-rank">{" "}</p>
          </div>
        </div>
      </header>
    );
  }
  return (
    <header className="pt-hero" data-testid="pt-round-plate" data-compact={compact ? "true" : undefined}
      aria-labelledby={headingId}>
      <HeroArt src={round.splashUrl} />
      <div className="pt-hero-body">
        <span className="pt-hero-icon" data-testid="pt-hero-icon">
          <SubjectArt media={round.iconUrl ? { src: round.iconUrl, alt: "" } : null} monogram={round.slot} className="h-full w-full" />
        </span>
        <div className="pt-hero-text">
          <h2 id={headingId} className="pt-prompt" tabIndex={-1} data-testid="pt-prompt">
            <span className="pt-champion" data-testid="pt-champion">{round.championName}</span>
            <span className="pt-ability-line">
              <span className="pt-slot" aria-label={`${round.slot} ability`}>{round.slot}</span>
              <span className="pt-prompt-ability" data-testid="pt-ability">{round.abilityName}</span>
            </span>
          </h2>
          <p className="pt-rank" data-testid="pt-rank">
            {rankText(round.rank, round.rankCount)}
            {!compact && (
              <>
                <span className="pt-rank-base"><span className="pt-rank-dot" aria-hidden>·</span>base cooldown</span>
              </>
            )}
          </p>
        </div>
      </div>
    </header>
  );
}

export function PerfectTimingStage({ round, phase, press, statusText, actions, autoFocusSeal = false }: PerfectTimingStageProps) {
  const reducedMotion = useReducedMotionPreference();
  const coarse = useCoarsePointer();
  const sealRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocusSeal) sealRef.current?.focus({ preventScroll: true });
  }, [autoFocusSeal]);
  const face = PHASE_FACE[phase];
  const status = statusText ?? face.status;
  const monogram = round?.slot ?? "?";

  return (
    <div className="pt-stage" data-testid="pt-stage" data-phase={phase} data-actions={actions ? "true" : undefined}>
      <PerfectTimingHero round={round} />

      <div className="pt-column">
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

        {actions ? <div className="pt-actions" data-testid="pt-actions">{actions}</div> : null}

        <p className="pt-hint" data-testid="pt-hint" data-live={phase === "armed" || phase === "running" ? "true" : "false"}>
          <kbd className="pt-kbd">Space</kbd>
          <span>or</span>
          <kbd className="pt-kbd">Enter</kbd>
          <span>{coarse ? "· or tap the seal" : "· or click the seal"}</span>
        </p>
      </div>
    </div>
  );
}
