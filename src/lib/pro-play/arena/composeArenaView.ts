/**
 * PPQ2-B — the projection, bound into the Arena's own view model shape.
 *
 * The only things the projection cannot supply are the ones that are not
 * data: the two flank panels and the Next control (PPQ2-C's components) and
 * the select callback (the controller's). The caller passes those in; this
 * fills every other `ArenaViewModel` member with the solo-mode answer — no
 * round, segment or card beat, no ability HUD, no reveal hold, no progression.
 *
 * `ProPlayArenaViewModel` IS an `ArenaViewModel`. The intersection only
 * records which member of the surface union this mode always produces (the
 * question member), so a caller can read `surface.onSelectOption` without a
 * `kind` guard; it is passed to `CanonicalArena` as it stands.
 */
import type { ReactNode } from "react";
import type {
  ArenaQuestionSurface,
  ArenaRail,
  ArenaViewModel,
} from "@/lib/ranked-core/arenaView";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import type { ProPlayArenaProjection, ProPlayArenaSurfaceData } from "./types";

export type ProPlayArenaViewModel = ArenaViewModel & { surface: ArenaQuestionSurface };

export function bindProPlayArenaSurface(
  data: ProPlayArenaSurfaceData,
  onSelectOption: (option: AnswerOptionView) => void,
): ArenaQuestionSurface {
  return { ...data, onSelectOption };
}

export interface ProPlayArenaSlots {
  left: ArenaRail;
  right: ArenaRail;
  /** The Next / See results control, drawn only while a reveal shows. */
  hudAction: ReactNode | null;
  onSelectOption: (option: AnswerOptionView) => void;
}

/** Null when there is no question on the stage (loading, error-only, complete). */
export function composeProPlayArenaView(
  projection: ProPlayArenaProjection,
  slots: ProPlayArenaSlots,
): ProPlayArenaViewModel | null {
  if (!projection.surface) return null;
  return {
    report: projection.report,
    header: projection.header,
    roundBeat: null,
    segmentBeat: null,
    cardBeat: null,
    left: slots.left,
    right: slots.right,
    surface: bindProPlayArenaSurface(projection.surface, slots.onSelectOption),
    abilityHud: null,
    status: projection.status,
    hudAction: projection.reveal ? slots.hudAction : null,
    timeline: projection.timeline,
    revealHold: false,
    progressionEnabled: false,
  };
}
