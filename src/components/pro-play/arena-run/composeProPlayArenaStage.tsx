/**
 * PPQ2-INT — the ONE place Pro Play's data meets its presentation.
 *
 * PPQ2-B's controller produces typed data (`state` + `projection`); PPQ2-C's
 * pieces draw it. This function binds the two into the Arena's own view model
 * and adds nothing of its own:
 *
 *  - the SURFACE is `composeProPlayArenaView`'s, unchanged, plus the optional
 *    `regions` seam (anchor plate in the media region, identity content INSIDE
 *    the canonical tablets, the column strategy and the VS seam). Selection,
 *    gating, tablet states and the reveal stay the canonical grid's;
 *  - the FLANKS are the dossier (left) and the session panel (right), both
 *    desktop-only by the arena's own rule;
 *  - the HEADER title is `Question n / N`; below `lg`, where the session panel
 *    is hidden, it also carries the server score (`titleDetail`);
 *  - the HUD ACTION is whatever the caller passes, on EVERY frame: Next / See
 *    results while a reveal shows, Try again while an error stands over a
 *    question, otherwise an invisible reserve of the same size. The HUD row is
 *    as tall as its control, so a slot filled only on reveal would take its
 *    height out of the stage at that moment.
 *
 * It decides nothing the server has not: every number is `session.*`, every
 * verdict a received grade, and the reveal is only ever the projection's.
 * Report publishing is NOT here: the Arena publishes from `view.report` +
 * `surface.reportRef`, and nothing in this directory may publish a second time.
 */
import type { ReactNode } from "react";

import { asQuestionContext } from "@/lib/pro-play/contract";
import {
  composeProPlayArenaView,
  type ProPlayArenaProjection,
  type ProPlayArenaState,
  type ProPlayArenaViewModel,
} from "@/lib/pro-play/arena";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import {
  ProPlayAnchorPlate,
  ProPlayQuestionDossier,
  ProPlaySessionPanel,
  proPlayAnswerSlots,
  type ProPlayOutcome,
} from "@/components/pro-play/arena";

export interface ProPlayArenaStageInput {
  state: ProPlayArenaState;
  projection: ProPlayArenaProjection;
  onSelectOption: (option: AnswerOptionView) => void;
  /** The HUD row's control (Next, See results, Try again or a reserve). */
  hudAction: ReactNode | null;
  /**
   * PPQ2-D — positional reveal content for the tablets. Ignored until the
   * server has graded the question on the stage (the projection's `reveal`).
   */
  revealSlots?: ReadonlyArray<ReactNode | null>;
}

/** Received verdicts only, keyed by question number (never inferred). */
export function receivedOutcomes(state: ProPlayArenaState): Map<number, ProPlayOutcome> {
  const map = new Map<number, ProPlayOutcome>();
  for (const [n, v] of Object.entries(state.outcomes)) map.set(Number(n), v);
  return map;
}

/** The Arena view for the question on the stage, or null when there is none. */
export function composeProPlayArenaStage({
  state,
  projection,
  onSelectOption,
  hudAction,
  revealSlots,
}: ProPlayArenaStageInput): ProPlayArenaViewModel | null {
  const question = state.question;
  const session = state.session;
  if (!question || !session || !projection.surface) return null;

  const context = asQuestionContext(question.context);
  const revealed = projection.reveal !== null;
  const slots = proPlayAnswerSlots({
    options: projection.surface.question.options,
    context,
    revealed,
    revealSlots: revealed ? revealSlots : undefined,
  });
  const outcomes = receivedOutcomes(state);

  const view = composeProPlayArenaView(projection, {
    left: { kind: "panel", node: <ProPlayQuestionDossier context={context} topic={question.topic} /> },
    right: {
      kind: "panel",
      node: (
        <ProPlaySessionPanel number={question.number} total={session.total} score={session.score}
          answered={session.answered} outcomes={outcomes} complete={session.complete} />
      ),
    },
    hudAction: null,
    onSelectOption,
  });
  if (!view) return null;

  return {
    ...view,
    header: {
      ...view.header,
      title: `Question ${question.number} / ${session.total}`,
      titleDetail: session.answered > 0 ? `${session.score} correct` : null,
    },
    surface: {
      ...view.surface,
      regions: {
        media: <ProPlayAnchorPlate context={context} fallbackTitle={question.topic} />,
        optionContent: slots.optionContent,
        answerColumns: slots.columns,
        pairDivider: slots.pairDivider,
      },
    },
    // composeProPlayArenaView only carries a control while a reveal shows; the
    // slot is held on every frame instead (see the header note).
    hudAction,
  };
}
