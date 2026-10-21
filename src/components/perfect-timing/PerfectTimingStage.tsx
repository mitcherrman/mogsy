/**
 * PERFECT TIMING — THE STAGE: the champion over the casting seal.
 *
 * The HERO states the public premise with the champion's own art — splash crop,
 * ability icon, spell letter, champion, ability, rank — and nothing else. No
 * number on it is a duration: the only digits the stage ever prints are the
 * rank. Progress through the run lives in the top bar, not here.
 *
 * THE SEAL IS THE ONE INPUT. A brass-rimmed instrument with the ability's own
 * icon set in it, sized for a thumb, and it is the single element that
 * receives PT2's press-surface props. Pressing it casts; the icon goes dark the
 * way an in-game slot does; pressing again says "it is back".
 *
 * PT5.2 (owner-approved): the seal's face is now the ARCANE CHRONOMETER, a
 * visible stopwatch that counts UP from the cast (`ArcaneChronometer`). It is
 * drawn from the timing engine's own readings and never measures anything; it
 * knows nothing of the target, so it cannot count down to it or hint at it.
 *
 * NOTHING HERE MEASURES OR GRADES. The phase, the handlers and the status
 * line arrive through props; this component draws them.
 *
 * PT5.3 BLIND FLOW (owner lab, `flow` present). The game counts the round in
 * and starts it; the seal is the BLIND chronometer (no elapsed time while it
 * runs) and the one input is the STOP. During the count-in the hint line offers
 * Hold (between attempts only); a held count-in offers Resume, which counts in
 * again from 3. Absent `flow`, everything is PT5.2.
 *
 * PT5 MASTERY SLICE. When the round carries `slice`, the hero also draws the
 * three-stage track (Foundation › Rank up › Equipped) over the art, and the
 * one input that changed since the last stage is marked: the rank on Rank up,
 * the item chip (icon, name, its ability haste) on Equipped. The mark's entry
 * is a single finite flourish shown only while ARMED — it is gone the moment
 * the timer runs, so nothing moves on a period while timing.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SubjectArt } from "@/components/interaction-grammar/shared";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { PtBlindFlowView, PtPhase, PtPressSurfaceProps, PtRoundView, PtSliceItemView, PtSliceStageView } from "@/lib/perfect-timing/viewModel";
import type { PtClockReading, SecondBeat } from "@/lib/perfect-timing/chronometer";
import { ArcaneChronometer, BlindChronometer } from "./ArcaneChronometer";
import { BLIND_FACE, CAST_WORD, HELD_FACE, PHASE_FACE, SLICE_STAGE_WORD, hasteText, lockedStatusText, rankText } from "./presentation";
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
  /** PT5.2: the engine's readings, drawn by the chronometer. */
  clock?: PtClockReading | null;
  /** PT5.2: each whole elapsed second (the host plays the tick). */
  onClockBeat?: (beat: SecondBeat) => void;
  /** PT5.3: the blind automatic flow. Absent: the PT5.2 visible stopwatch. */
  flow?: PtBlindFlowView | null;
}

/** The champion's splash, cropped to the hero; a failure leaves the dark card. */
export function HeroArt({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <span className="pt-hero-art" aria-hidden data-art="none" />;
  return (
    <span className="pt-hero-art" aria-hidden data-art="splash">
      <img key={src} src={src} alt="" draggable={false} onError={() => setFailed(src)} />
    </span>
  );
}

/** The slice's three stages as a track over the hero art: done, current, upcoming. */
function SliceTrack({ slice }: { slice: PtSliceStageView }) {
  const kinds = ["foundation", "rank_up", "equipped"] as const;
  return (
    <ol className="pt-slice-track" data-testid="pt-slice-track" aria-label={`Stage ${slice.stage} of ${slice.total}: ${SLICE_STAGE_WORD[slice.kind]}`}>
      {kinds.slice(0, slice.total).map((kind, i) => (
        <li key={kind} data-state={i + 1 < slice.stage ? "done" : i + 1 === slice.stage ? "current" : "upcoming"}
          data-testid={`pt-slice-step-${kind}`} aria-hidden>
          {SLICE_STAGE_WORD[kind]}
        </li>
      ))}
    </ol>
  );
}

/** The equipped item: its icon, its name, and the ability haste it brings. */
export function SliceItemChip({ item, changed = false, short = false }: { item: PtSliceItemView; changed?: boolean; short?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="pt-item-chip" data-testid="pt-item-chip" data-changed={changed ? "true" : undefined}>
      <span className="pt-item-icon" aria-hidden>
        {item.iconUrl && !failed ? <img src={item.iconUrl} alt="" draggable={false} onError={() => setFailed(true)} data-testid="pt-item-icon" /> : null}
      </span>
      <span className="pt-item-text">
        <span className="pt-item-name" data-testid="pt-item-name">{item.name}</span>
        <span className="pt-item-haste" data-testid="pt-item-haste">{hasteText(item.abilityHaste, short)}</span>
      </span>
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
  const slice = round.slice ?? null;
  const rankChanged = slice?.kind === "rank_up" && slice.previous !== null && slice.previous.rank !== round.rank;
  const itemChanged = slice?.kind === "equipped" && slice.item !== null;
  return (
    <header className="pt-hero" data-testid="pt-round-plate" data-compact={compact ? "true" : undefined}
      data-slice={slice ? slice.kind : undefined} aria-labelledby={headingId}>
      <HeroArt src={round.splashUrl} />
      {slice ? <SliceTrack slice={slice} /> : null}
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
          {slice ? (
            <p className="pt-rank pt-rank--slice" data-testid="pt-rank">
              {rankChanged ? <span className="pt-stage-badge" data-testid="pt-stage-badge">Rank up</span> : null}
              <span className="pt-rank-value" data-changed={rankChanged ? "true" : undefined} data-testid="pt-rank-value">
                {rankText(round.rank, round.rankCount)}
              </span>
              {rankChanged && slice.previous ? (
                <span className="pt-rank-from" data-testid="pt-rank-from">from {slice.previous.rank}</span>
              ) : null}
              {slice.item ? (
                <SliceItemChip item={slice.item} changed={itemChanged} short={compact} />
              ) : (
                <span className="pt-rank-base"><span className="pt-rank-dot" aria-hidden>·</span>no ability haste</span>
              )}
            </p>
          ) : (
            <p className="pt-rank" data-testid="pt-rank">
              {rankText(round.rank, round.rankCount)}
              {!compact && (
                <>
                  <span className="pt-rank-base"><span className="pt-rank-dot" aria-hidden>·</span>base cooldown</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

export function PerfectTimingStage({ round, phase, press, statusText, actions, autoFocusSeal = false, clock = null, onClockBeat, flow = null }: PerfectTimingStageProps) {
  const reducedMotion = useReducedMotionPreference();
  const coarse = useCoarsePointer();
  const sealRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocusSeal) sealRef.current?.focus({ preventScroll: true });
  }, [autoFocusSeal]);
  const held = flow !== null && flow.held && phase === "countdown";
  const face = held ? HELD_FACE : flow ? BLIND_FACE[phase] ?? PHASE_FACE[phase] : PHASE_FACE[phase];
  // The lock is announced once, at the phase edge, with the time the player
  // stopped on (the engine's submitted value); the running digits never are.
  const lockedAt = (phase === "stopped" || phase === "submitting") && clock?.elapsedMs != null ? clock.elapsedMs : null;
  const status = statusText ?? (lockedAt !== null ? lockedStatusText(lockedAt) : face.status);
  const monogram = round?.slot ?? "?";
  const sealIcon = <SubjectArt media={round?.iconUrl ? { src: round.iconUrl, alt: "" } : null} monogram={monogram} className="h-full w-full" />;
  // The hint line: the stop keys while a round can be stopped; during a blind count-in, the hold.
  const hintLive = phase === "armed" || phase === "running" || (flow !== null && phase === "countdown");
  const resume = () => {
    flow?.onResume();
    sealRef.current?.focus({ preventScroll: true });
  };

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
              {flow ? (
                <BlindChronometer phase={phase} clock={clock} countIn={flow.countIn} countInId={flow.countInId} held={held}
                  slot={monogram} icon={sealIcon} word={face.word} castWord={CAST_WORD} reducedMotion={reducedMotion} />
              ) : (
                <ArcaneChronometer phase={phase} roundId={round?.roundId ?? null} clock={clock}
                  reducedMotion={reducedMotion} word={face.word} onBeat={onClockBeat} icon={sealIcon} />
              )}
            </span>
          </div>
        </div>

        <p className="pt-status" data-testid="pt-status" data-tone={face.tone} role="status" aria-live="polite">
          {status}
        </p>

        {actions ? <div className="pt-actions" data-testid="pt-actions">{actions}</div> : null}

        <p className="pt-hint" data-testid="pt-hint" data-live={hintLive ? "true" : "false"}
          data-mode={flow && phase === "countdown" ? (held ? "held" : "count-in") : "keys"}>
          {flow && phase === "countdown" ? (
            held ? (
              <button type="button" className="pt-hold" data-testid="pt-resume" data-primary="true" onClick={resume}>Resume</button>
            ) : (
              <>
                <span>Not ready?</span>
                <button type="button" className="pt-hold" data-testid="pt-hold" onClick={flow.onHold}>Hold</button>
              </>
            )
          ) : (
            <>
              <kbd className="pt-kbd">Space</kbd>
              <span>or</span>
              <kbd className="pt-kbd">Enter</kbd>
              <span>{coarse ? "· or tap the clock" : "· or click the clock"}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
