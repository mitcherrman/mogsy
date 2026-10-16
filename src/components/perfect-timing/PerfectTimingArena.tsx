/**
 * PERFECT TIMING — THE ARENA: the stage or the reveal inside the fixed screen.
 *
 * The page owns every value in the model; this component reads it, draws it,
 * and plays the three existing Ranked cues on the phase edges: the module-start
 * cue when a round is armed, the lock cue on stop, and the correct / incorrect
 * verdict by tier on reveal. Nothing sounds while running.
 *
 * PT4.4: it no longer mounts Ranked's `CanonicalArena` (whose header, flanks and
 * round rail made the page taller than the viewport). The frame is
 * `PerfectTimingScreen`; this draws what goes in it.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { useSfx } from "@/lib/audio/useSfx";
import type { PtStageModel } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingReveal } from "./PerfectTimingReveal";
import { PerfectTimingHero, PerfectTimingStage } from "./PerfectTimingStage";
import { tierSfx } from "./presentation";
import "./perfectTiming.css";

/** The three existing cues, edge-triggered on the phase. Nothing sounds while running. */
function usePerfectTimingSfx(model: PtStageModel) {
  const sfx = useSfx();
  const last = useRef<{ phase: PtStageModel["phase"]; roundId: string | null }>({ phase: model.phase, roundId: null });
  useEffect(() => {
    const prev = last.current;
    const roundId = model.round?.roundId ?? null;
    last.current = { phase: model.phase, roundId };
    if (prev.phase === model.phase && prev.roundId === roundId) return;
    if (model.phase === "armed" && (prev.phase !== "armed" || prev.roundId !== roundId)) {
      sfx.play("ranked.module.start", { eventId: `perfect-timing:${roundId ?? "round"}:start` });
    } else if (model.phase === "stopped" && prev.phase === "running") {
      sfx.play("ranked.answer.lock", { eventId: `perfect-timing:${roundId ?? "round"}:lock` });
    } else if (model.phase === "revealed" && prev.phase !== "revealed" && model.reveal) {
      sfx.play(tierSfx(model.reveal.tier), { eventId: `perfect-timing:${roundId ?? "round"}:verdict` });
    }
  }, [model.phase, model.round?.roundId, model.reveal, sfx]);
}

export function PerfectTimingArena({ model, actions }: {
  model: PtStageModel;
  /** Recovery buttons for a voided or failed round, drawn under the status line. */
  actions?: ReactNode;
}) {
  usePerfectTimingSfx(model);
  // The phase drawn last: a round armed straight after a reveal (or a voided
  // round) has just taken the player's focused control away.
  const prevPhase = useRef<PtStageModel["phase"] | null>(null);
  const cameFrom = prevPhase.current;
  useEffect(() => { prevPhase.current = model.phase; });

  const focusSeal = model.phase === "armed" && (cameFrom === "revealed" || cameFrom === "interrupted" || cameFrom === "error");
  const lastRound = model.round !== null && model.round.index >= model.round.total;

  if (model.phase === "revealed" && model.reveal) {
    return (
      <div className="pt-stage" data-testid="pt-reveal-stage" data-phase="revealed" data-tier={model.reveal.tier}>
        <PerfectTimingHero round={model.round} compact />
        <div className="pt-column">
          <PerfectTimingReveal key={model.round?.roundId ?? "reveal"} reveal={model.reveal} onNext={model.onNext}
            nextLabel={lastRound ? "See results" : "Next round"} />
        </div>
      </div>
    );
  }
  return (
    <PerfectTimingStage key={model.round?.roundId ?? "stage"} round={model.round} phase={model.phase} press={model.press}
      statusText={model.statusText ?? null} actions={actions} autoFocusSeal={focusSeal} />
  );
}
