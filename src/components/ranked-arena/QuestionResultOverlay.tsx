/**
 * RFX1 Phase 2A — THE RESULT, ON THE CARD.
 *
 * One overlay layer inside the question stage. It is `position: absolute;
 * inset: 0` in a `.ranked-panel` (already `position: relative; overflow:
 * hidden`), with `pointer-events: none`, so it takes no height, cannot move a
 * tablet, cannot overflow and cannot scroll. The question and the answers stay
 * readable under it: the treatment is an edge glow and two stamps, never a
 * wash across the text.
 *
 * TWO BEATS, ONE FACT. The viewer's stamp lands immediately; the opponent's
 * lands ~400ms later from the RIGHT edge (the opponent's side of the arena).
 * Both come from the same settlement (`flow/rankedFlow`). The stagger is a CSS
 * `animation-delay` — no timer, no state — so it cannot outlive the reveal:
 * the overlay unmounts with the beat that owns it.
 *
 * Keyed on each cue's deterministic event id, so a poll or re-render never
 * restarts an animation, and a new round's cue always mounts fresh.
 *
 * REDUCED MOTION (OS or Mogzy's own setting — one signal): nothing moves and
 * nothing is delayed. Both stamps are simply present, with the same words and
 * icons. Movement is removed; information is not.
 */
import { Check, ListChecks, Timer, X } from "lucide-react";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  OpponentResultCue, RankedResultFeedback, RoundVerdict, ViewerResultCue,
} from "@/lib/ranked-core/flow/rankedFlow";

type Tone = "success" | "failure" | "neutral";

const VERDICT_LABEL: Record<RoundVerdict, string> = {
  correct: "CORRECT",
  incorrect: "INCORRECT",
  timed_out: "TIMED OUT",
};

function viewerFace(cue: ViewerResultCue): { tone: Tone; label: string; sub: string | null } {
  if (cue.kind === "block") {
    return {
      tone: cue.correct === cue.of ? "success" : cue.correct === 0 ? "failure" : "neutral",
      label: `${cue.correct} / ${cue.of} CORRECT`,
      sub: null,
    };
  }
  return {
    tone: cue.verdict === "correct" ? "success" : "failure",
    label: VERDICT_LABEL[cue.verdict],
    sub: cue.kind === "card" ? `Card ${cue.cardNumber}` : null,
  };
}

function opponentFace(cue: OpponentResultCue): { tone: Tone; label: string } {
  if (cue.kind === "block") {
    return { tone: "neutral", label: `OPPONENT ${cue.correct} / ${cue.of}` };
  }
  return cue.verdict === "correct"
    ? { tone: "success", label: "OPPONENT CORRECT" }
    : { tone: "failure", label: "OPPONENT MISSED" };
}

function Icon({ tone, block, timedOut }: { tone: Tone; block: boolean; timedOut: boolean }) {
  const cls = "h-[1.1em] w-[1.1em] shrink-0";
  if (block) return <ListChecks aria-hidden className={cls} strokeWidth={3} />;
  if (timedOut) return <Timer aria-hidden className={cls} strokeWidth={3} />;
  return tone === "success"
    ? <Check aria-hidden className={cls} strokeWidth={3.5} />
    : <X aria-hidden className={cls} strokeWidth={3.5} />;
}

export function QuestionResultOverlay({ feedback }: { feedback: RankedResultFeedback | null }) {
  const reduced = useReducedMotionPreference();
  const viewer = feedback?.viewer ?? null;
  const opponent = feedback?.opponent ?? null;
  if (!viewer && !opponent) return null;
  const vf = viewer ? viewerFace(viewer) : null;
  const of = opponent ? opponentFace(opponent) : null;
  return (
    <div data-testid="question-result-overlay"
      data-motion={reduced ? "reduced" : "full"}
      className={`ranked-result-overlay${reduced ? " ranked-result-overlay--still" : ""}`}>
      {viewer && vf && (
        <div key={`edge:${viewer.id}`} data-testid="result-edge"
          aria-hidden className={`ranked-result-edge ranked-result-edge--${vf.tone}`} />
      )}
      {viewer && vf && (
        <div key={viewer.id} data-testid="result-stamp-viewer" aria-hidden
          data-event-id={viewer.id} data-tone={vf.tone}
          className={`ranked-result-stamp ranked-result-stamp--${vf.tone}`}>
          <Icon tone={vf.tone} block={viewer.kind === "block"}
            timedOut={viewer.kind !== "block" && viewer.verdict === "timed_out"} />
          <span>{vf.label}</span>
          {vf.sub && <span className="ranked-result-stamp-sub">{vf.sub}</span>}
        </div>
      )}
      {opponent && of && (
        <div key={opponent.id} data-testid="result-stamp-opponent" aria-hidden
          data-event-id={opponent.id} data-tone={of.tone}
          className={`ranked-result-opponent ranked-result-opponent--${of.tone}`}>
          <Icon tone={of.tone} block={opponent.kind === "block"} timedOut={false} />
          <span>{of.label}</span>
        </div>
      )}
      {/* The announcement, once, in words — the stamps above are aria-hidden
          decoration of the same two facts. */}
      <span className="sr-only" role="status">
        {[vf?.label, of?.label].filter(Boolean).join(". ")}
      </span>
    </div>
  );
}
