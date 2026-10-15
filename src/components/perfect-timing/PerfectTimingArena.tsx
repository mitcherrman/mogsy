/**
 * PERFECT TIMING — THE LAB ARENA HOST.
 *
 * Mounts the REAL `CanonicalArena` with the lab's projected view (see
 * `arenaView.tsx`) and provides the stage model to the lab renderer's
 * Viewport. The page owns every value in the model; this component reads it,
 * draws it, and plays the three existing Ranked cues on the phase edges: the
 * module-start cue when a round is armed, the lock cue on stop, and the
 * correct / incorrect verdict by tier on reveal. Nothing sounds while running.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { useSfx } from "@/lib/audio/useSfx";
import type { PtStageModel } from "@/lib/perfect-timing/viewModel";
import type { ArenaViewModel } from "@/lib/ranked-core/arenaView";
import { perfectTimingArenaView, type PerfectTimingArenaHeader } from "./arenaView";
import { tierSfx } from "./presentation";
import { PerfectTimingStageContext } from "./stageContext";

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

/**
 * The arena with the stage in it. `chrome` is the host's control row. A
 * host that wants a different header passes `view`; otherwise the view is
 * projected from the stage model.
 */
export function PerfectTimingArena({ model, chrome, view, header }: {
  model: PtStageModel;
  chrome?: ReactNode;
  view?: ArenaViewModel;
  header?: PerfectTimingArenaHeader;
}) {
  usePerfectTimingSfx(model);
  const projected = useMemo(() => view ?? perfectTimingArenaView(model, header), [view, model, header]);
  return (
    <PerfectTimingStageContext.Provider value={model}>
      <CanonicalArena view={projected} chrome={chrome} />
    </PerfectTimingStageContext.Provider>
  );
}
