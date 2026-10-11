/**
 * PPQ2-D — the premium Pro Play statistical reveal.
 *
 * Presentation only: built from the server's graded reveal (PPQ2-B
 * `projection.reveal`), drawn into PPQ2-C's positional reveal slots and an
 * answer footer. See `docs/handoffs/PPQ2-D.md` for the integration contract.
 */
export { buildProPlayReveal, revealValuesOnTablets, type ProPlayReveal } from "./buildProPlayReveal";
export { ProPlayRevealFooter, type ProPlayRevealFooterProps } from "./ProPlayRevealFooter";
export {
  ProPlayRevealValue,
  REVEAL_VALUE_DELAY_MS,
  REVEAL_VALUE_DURATION_MS,
  REVEAL_VALUE_STAGGER_MS,
  type ProPlayRevealValueProps,
} from "./ProPlayRevealValue";
export {
  REVEAL_EMPTY_VALUE,
  buildProPlayRevealModel,
  revealSupportLine,
  splitExplanation,
  verdictSentence,
  type ProPlayRevealInput,
  type ProPlayRevealModel,
  type RevealAuthority,
  type RevealCandidate,
  type RevealEvidenceState,
} from "./proPlayRevealModel";
