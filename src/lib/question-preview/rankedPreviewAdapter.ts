/**
 * Ranked candidate preview adapter (RA9) — PURE, React-free.
 *
 * Turns the admin preview payload
 * (`GET /api/admin/ranked-duel/questions/candidates/{id}/public-view`) into
 * exactly what `InteractiveScenarioSurface` consumes, by running it through the
 * SAME production adapters a live round uses:
 *
 *   payload -> readPublicQuestion        (ranked-public transport normalization)
 *           -> questionViewFromPublicQuestion   (interaction view + option media)
 *           -> scenarioSourceFromPublicQuestion (premium scenario art source)
 *
 * Nothing about presentation, option media, family selection, or scenario
 * classification is re-implemented here — that is the whole point. If the
 * preview and a real round ever disagreed, this file would be the reason, so it
 * deliberately contains no visual logic of its own.
 *
 * Hidden information: the endpoint carries no correct answer, and this adapter
 * has no parameter that could introduce one. The reveal treatment is applied
 * separately by the admin-only interaction state (usePreviewInteractionState),
 * which reads the correct index from the protected candidate-detail response.
 */

import {
  questionViewFromPublicQuestion,
  type PublicQuestionSource,
} from "@/lib/ranked-core/adapters/adaptToViews";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import { readPublicQuestion } from "@/lib/ranked-public/contracts";
import type { QuestionView, ScenarioSource } from "@/lib/question-surface/contract";

/** Module whose questions this static preview can render end to end. */
export const PREVIEWABLE_MODULE_ID = "quiz";

/**
 * Modules whose rounds are driven by live per-segment state (item_cost_duel's
 * ability phase, challenge index, opponent progress). A static candidate has
 * none of that, and fabricating it would show the operator a round that cannot
 * happen — so those preview as an explicit unsupported notice instead.
 */
export const UNSUPPORTED_MODULE_MESSAGE =
  "This module requires live segment state and is not available in static candidate preview yet.";

export class PreviewAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewAdapterError";
  }
}

export interface RankedPreviewModel {
  /** Neutral interaction view (prompt/options/category, + option media). */
  question: QuestionView;
  /** Premium scenario art source, or null for the surface's text fallback. */
  scenarioSource: ScenarioSource | null;
  /** Backend module identity; drives the unsupported notice. */
  moduleId: string;
  /** False when the module needs live segment state this preview cannot hold. */
  supported: boolean;
  /** Review status echoed by the endpoint, for the operator's orientation. */
  derivedStatus: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Adapt one preview payload. Throws `PreviewAdapterError` when the payload is
 * not a readable public question — an operator seeing a typed error is better
 * served than one seeing a blank surface.
 */
export function adaptCandidatePreview(payload: unknown): RankedPreviewModel {
  if (!isRecord(payload)) {
    throw new PreviewAdapterError("Preview payload was not an object.");
  }

  let source: PublicQuestionSource | null;
  try {
    source = readPublicQuestion(payload);
  } catch (err) {
    throw new PreviewAdapterError(
      err instanceof Error ? err.message : "Preview payload could not be read.",
    );
  }
  if (!source) throw new PreviewAdapterError("Preview payload was empty.");

  const moduleId =
    typeof payload.module_id === "string" && payload.module_id
      ? payload.module_id
      : PREVIEWABLE_MODULE_ID;

  return {
    question: questionViewFromPublicQuestion(source),
    scenarioSource: scenarioSourceFromPublicQuestion(source),
    moduleId,
    supported: moduleId === PREVIEWABLE_MODULE_ID,
    derivedStatus:
      typeof payload.derived_status === "string" ? payload.derived_status : null,
  };
}
