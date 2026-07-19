/**
 * Read-only Mastery player prototype (G5.2B) — public surface.
 *
 * Fixture-driven and non-authoritative: no live backend, no routing, no
 * persistence, no formula logic. Not wired into production routing; render
 * `MasteryPlayerPrototype` directly (see README.md) to inspect it.
 */
export { MasteryPlayerPrototype } from "./MasteryPlayerPrototype";
export { useMasteryFixtureSession } from "./useMasteryFixtureSession";
export type {
  MasteryFixtureSession,
  MasteryResultRow,
  PlayerAnswer,
  PlayerFlowPhase,
} from "./useMasteryFixtureSession";
export { MasteryIntro } from "./MasteryIntro";
export { MasteryQuestionView } from "./MasteryQuestionView";
export { MasteryRevealView } from "./MasteryRevealView";
export { MasteryCompletion } from "./MasteryCompletion";
export { MasteryStatePanel } from "./MasteryStatePanel";
export { MasteryTransitionPanel } from "./MasteryTransitionPanel";
export { MasteryNumericInput, validateNumeric } from "./MasteryNumericInput";
export { MasteryChoiceInput, booleanOptions } from "./MasteryBooleanInput";
export { MasteryPatchBadge } from "./MasteryPatchBadge";
export { MasteryProgress } from "./MasteryProgress";
