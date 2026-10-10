/**
 * PPQ2-C — premium Pro Play presentation pieces for the canonical arena.
 *
 * Composable, presentation-only. They own no transport, no selection state
 * and no reveal logic; the PPQ2-B controller supplies every value. See
 * `docs/handoffs/PPQ2-C.md` for the integration contract.
 */
export { default as ProPlayAnchorPlate, PlateScopeLine, TeamShield } from "./ProPlayAnchorPlate";
export type { ProPlayAnchorPlateProps } from "./ProPlayAnchorPlate";
export {
  ProPlayOptionContent,
  ProPlayVersusSeam,
  proPlayAnswerSlots,
  type ProPlayAnswerColumns,
  type ProPlayAnswerSlots,
  type ProPlayOptionContentProps,
} from "./ProPlayOptionContent";
export { default as ProPlayQuestionDossier } from "./ProPlayQuestionDossier";
export type { ProPlayQuestionDossierProps } from "./ProPlayQuestionDossier";
export { default as ProPlaySessionPanel } from "./ProPlaySessionPanel";
export type { ProPlaySessionPanelProps } from "./ProPlaySessionPanel";
export {
  alignTabletIdentities,
  anchorPlateKind,
  sessionHeadline,
  tabletLayout,
  type ProPlayOutcome,
  type TabletIdentities,
  type TabletLayout,
} from "./proPlayArenaModel";
