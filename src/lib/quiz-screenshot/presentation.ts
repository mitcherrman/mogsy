/**
 * CON1 Step 1C — the Content Factory's bridge onto the production presentation
 * path. PURE: no React, no fetch, no fs.
 *
 * The render harness used to hold the whole stored row and draw a plain
 * question card from it. Scenario questions therefore lost their premise: the
 * safe projection the backend builds was never asked for, and the only thing
 * left in the row that described the scenario was raw `metadata` — which is
 * answer-bearing and must never be read as a premise.
 *
 * This module does not solve that with a new mapping. It COMPOSES the two
 * pieces Step 1B already proved in Admin, in the same order:
 *
 *   RenderQuestion (carries `presentation` verbatim)
 *     -> storedQuestionPreviewPayload   (the SAME envelope Admin writes)
 *     -> adaptCandidatePreview          (the SAME adapter Ranked candidates use)
 *        -> readPublicQuestion / scenarioSourceFromPublicQuestion
 *     -> selectFamilyLayout             (the SINGLE layout authority)
 *
 * so the harness, Admin Review and a live Ranked round all reach the scenario
 * band through one chain. Nothing here classifies, projects or lays anything
 * out; every decision belongs to a module that already owned it.
 *
 * WHAT IT ADDS, and why: a named status for what happened. The render harness
 * captures images unattended, so "no band" has to be distinguishable from "no
 * premise" — Step 1D's fail-closed gate is exactly that distinction, and this
 * is the state it will read. The gate itself is NOT implemented here; this
 * only makes the fallback visible instead of silent.
 */

import { selectFamilyLayout, type FamilyLayout } from "@/lib/question-surface/familyLayout";
import {
  adaptCandidatePreview,
  type RankedPreviewModel,
} from "@/lib/question-preview/rankedPreviewAdapter";
import { storedQuestionPreviewPayload } from "@/lib/question-preview/storedQuestionPreviewSource";
import type { RenderQuestion } from "./types";

/**
 * What the presentation path did with one render question.
 *
 * - `absent`      — the row carried no `presentation`. The correct, expected
 *                   outcome for a family with no premise contract and for a
 *                   form (e.g. Minion XP `wave`) whose contract declares none.
 *                   Renders text-only, by design.
 * - `unreadable`  — a `presentation` was present but the payload could not be
 *                   read as a public question (too few options, no prompt, or
 *                   the adapter rejected it). A defect, not a design outcome.
 * - `no-scenario` — a `presentation` was present and readable, but produced no
 *                   scenario source at all.
 * - `text-only`   — a scenario source EXISTS and the layout authority supports
 *                   no family for it. Today this is the honest outcome for the
 *                   Minion XP `exact_minion` form, whose layout rule and band
 *                   are unmerged work; the surface falls back to its existing
 *                   compact/cinematic presentation. This is the silent fallback
 *                   Step 1D must be able to fail on.
 * - `family`      — the layout authority supports a family band for it.
 */
export type ScenarioPresentationStatus =
  | "absent"
  | "unreadable"
  | "no-scenario"
  | "text-only"
  | "family";

export interface ScenarioPresentationResult {
  status: ScenarioPresentationStatus;
  /** The adapted production model, or null when there is nothing to render. */
  model: RankedPreviewModel | null;
  /**
   * What `selectFamilyLayout` answers for this scenario source.
   *
   * Advisory and diagnostic ONLY — the surface calls the same authority itself
   * and that call is what renders. This is a second call to the same pure
   * function on the same input, so it cannot disagree; it exists because the
   * capture runner needs the answer BEFORE the page mounts.
   */
  familyLayout: FamilyLayout | null;
  /** Adapter message when `status` is `unreadable`. */
  reason: string | null;
}

const ABSENT: ScenarioPresentationResult = {
  status: "absent",
  model: null,
  familyLayout: null,
  reason: null,
};

/**
 * Resolve one render question against the production presentation path.
 *
 * Reads `question.presentation` and nothing else. A question with no
 * `presentation` returns `absent` immediately — it is not probed for a premise,
 * because the only other place a premise could come from is `metadata`, and
 * that blob holds the answer.
 */
export function resolveScenarioPresentation(
  question: RenderQuestion | null | undefined,
): ScenarioPresentationResult {
  if (!question?.presentation || typeof question.presentation !== "object") return ABSENT;

  const payload = storedQuestionPreviewPayload(question);
  if (!payload) {
    return {
      status: "unreadable",
      model: null,
      familyLayout: null,
      reason: "Question could not be shaped as a public question payload.",
    };
  }

  let model: RankedPreviewModel;
  try {
    model = adaptCandidatePreview(payload);
  } catch (err) {
    return {
      status: "unreadable",
      model: null,
      familyLayout: null,
      reason: err instanceof Error ? err.message : "Presentation could not be adapted.",
    };
  }

  if (!model.scenarioSource) {
    return { status: "no-scenario", model, familyLayout: null, reason: null };
  }

  const familyLayout = selectFamilyLayout(model.scenarioSource);
  return {
    status: familyLayout ? "family" : "text-only",
    model,
    familyLayout,
    reason: null,
  };
}

/** True when the harness should render through the production scenario surface. */
export function rendersThroughScenarioSurface(
  result: ScenarioPresentationResult,
): boolean {
  return result.model !== null && result.model.scenarioSource !== null;
}
