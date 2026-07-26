// ---------------------------------------------------------------------------
// Ranked module renderer contract (Phase A).
//
// Vocabulary matches the backend: a MATCH contains SEGMENTS; a segment contains
// one or more CHALLENGES; a MODULE renders a segment. Today's Ranked question
// is a `quiz` segment with exactly one challenge.
//
// Ownership split (the reason this seam exists):
//   * The persistent Ranked SHELL owns combatant panels, HP, level/XP,
//     abilities, timer, connection state, segment status, damage transition,
//     level-up, and result. None of that is a module concern.
//   * A MODULE owns only what is inside the segment viewport: the prompt, the
//     input, the review summary, and its own reveal content.
//
// Deliberately NOT a mode-flag system: components receive data and permissions,
// never `isQuiz` / `isItemCostDuel` branches. Shared arena components are not
// forked and are not modified by this contract.
// ---------------------------------------------------------------------------

import type { ComponentType } from "react";
import type {
  InteractionPermissions,
  QuestionView,
} from "@/lib/ranked-core/viewTypes";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";

/** Props every module viewport receives from the shell. */
export interface ModuleViewportProps {
  /** The active segment's public data, already parsed and reveal-safe. */
  publicRound: PublicRoundView;
  /** The viewer's current in-progress selection, module-defined. */
  selection: unknown;
  /** Externally supplied gating; a viewport must never widen it. */
  permissions: InteractionPermissions;
  /** Report a selection change back to the shell controller. */
  onSelect: (selection: unknown) => void;
}

/**
 * What a module contributes. Phase A keeps the surface minimal: only the
 * members the shell actually consumes today are defined, so nothing here is
 * speculative or untested.
 */
export interface ModuleRenderer {
  moduleId: string;
  moduleVersion: number;
  /** The segment viewport rendered inside the arena's centre column. */
  Viewport: ComponentType<ModuleViewportProps>;
  /**
   * Project the segment's question-shaped view, when the module has one.
   * `quiz` returns today's `QuestionView`; a non-question module returns null
   * and drives its viewport from `publicRound` directly.
   */
  projectQuestion: (pub: PublicRoundView) => QuestionView | null;
  /** Short human summary of the pending selection, for the review panel. */
  summaryLabel: (pub: PublicRoundView, selection: unknown) => string | null;
}
