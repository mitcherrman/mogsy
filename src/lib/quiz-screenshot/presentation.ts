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

import { asQuestionContext, type ProPlayQuestionContext } from "@/lib/pro-play/contract";
import { selectFamilyLayout, type FamilyLayout } from "@/lib/question-surface/familyLayout";
import {
  bandPresentsPayload,
  resolveBandProfile,
  type ScenarioBandProfile,
} from "@/lib/question-surface/bandProfile";
import { resolveSettings, type SurfaceVariant } from "@/lib/question-surface/contract";
import {
  adaptCandidatePreview,
  type RankedPreviewModel,
} from "@/lib/question-preview/rankedPreviewAdapter";
import { storedQuestionPreviewPayload } from "@/lib/question-preview/storedQuestionPreviewSource";
import type { RenderQuestion } from "./types";

/**
 * The surface variant the Content Factory renders scenario questions with.
 * Named here because the band profile depends on it (a variant with
 * `mediaScale: "none"` draws no band at all), and the gate must ask the layout
 * authority the same question the harness will ask it.
 */
export const HARNESS_SURFACE_VARIANT: SurfaceVariant = "competitive";

/**
 * What the presentation path did with one render question.
 *
 * The three "rendered" statuses are the PRODUCTION band profile
 * (`@/lib/question-surface/bandProfile`), not a second classification — this
 * module calls the same function the surface calls, on the same input.
 *
 * - `absent`      — the row carried no `presentation`. The correct, expected
 *                   outcome for a family with no premise contract and for a
 *                   form (e.g. Minion XP `wave`) whose contract declares none.
 *                   Renders text-only, by design, and is NOT a defect.
 * - `unreadable`  — a `presentation` was present but the payload could not be
 *                   read as a public question (too few options, no prompt, or
 *                   the adapter rejected it). A defect, not a design outcome.
 * - `no-scenario` — a `presentation` was present and readable, but produced no
 *                   scenario source at all.
 * - `text-only`   — a scenario source exists and the production band profile is
 *                   `compact` (or `none`). CompactScenarioBand receives ONLY
 *                   the category, so every field the backend projected is
 *                   dropped and the exported image is text. THIS is the state
 *                   Step 1D fails on.
 * - `cinematic`   — the band draws a real premium subject visual resolved FROM
 *                   the presentation (champion splash, item/recipe, combat
 *                   calc, collectible, spoiler placeholder). A rendered
 *                   presentation; valid.
 * - `family`      — the layout authority supports a family band. Valid.
 * - `pro-context`  — the question carries the Pro Play PRESENTATION CONTRACT
 *                   (`pro_authority.question_context.pre_answer`) and the
 *                   PRODUCTION narrower `asQuestionContext` accepts it, so the
 *                   shipped `ProPlayQuestionCard` draws the relationship, the
 *                   scope tags, the metric, the champion anchor and the
 *                   symmetric subject cards. A rendered presentation; valid.
 *
 * MEASURED, and the reason `cinematic` is named separately from `text-only`:
 * `ability_cooldown_haste` rows project {champion_name, slot, ability_name,
 * rank, ability_haste, base_cooldown}, which `selectFamilyLayout` declines and
 * `selectScenario` resolves to a champion_profile card. Collapsing "no family
 * layout" into "text-only" would have condemned every one of those captures
 * while a full champion band was on screen.
 */
export type ScenarioPresentationStatus =
  | "absent"
  | "unreadable"
  | "no-scenario"
  | "text-only"
  | "cinematic"
  | "family"
  | "pro-context";

/** Statuses in which the presentation actually reached the picture. */
export const RENDERED_PRESENTATION_STATUSES: readonly ScenarioPresentationStatus[] = [
  "family",
  "cinematic",
  "pro-context",
];

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
  /**
   * The PRODUCTION band profile for this payload — `family`, `cinematic`,
   * `compact` or `none` — or `null` when no surface renders at all.
   *
   * Same second-call-to-a-pure-function property as `familyLayout`: the
   * surface resolves it itself and that call is what renders. It is exposed
   * because the completeness gate must know whether the presentation reached
   * the picture, and `compact` is where it demonstrably does not.
   */
  band: ScenarioBandProfile | null;
  /**
   * The Pro Play presentation contract this question carries, narrowed by the
   * PRODUCTION narrower, or null. Non-null exactly when `status` is
   * `pro-context`; it is what the render page hands `ProPlayQuestionCard`.
   */
  proContext: ProPlayQuestionContext | null;
  /** Adapter message when `status` is `unreadable`, or `no-scenario`. */
  reason: string | null;
}

const ABSENT: ScenarioPresentationResult = {
  status: "absent",
  model: null,
  familyLayout: null,
  band: null,
  proContext: null,
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
  variant: SurfaceVariant = HARNESS_SURFACE_VARIANT,
): ScenarioPresentationResult {
  /**
   * CON1 Step 5 — the Pro Play path, asked FIRST, and why that is not a
   * special case.
   *
   * This function's job is to say what the PRODUCTION presentation system
   * does with a question. Until Step 5 there was one such system — the
   * scenario band — so "resolve the presentation" and "resolve the band" were
   * the same sentence. They are not: Pro Play questions have never rendered
   * through a scenario band in production. `ProPlayQuiz` composes
   * `ProPlayQuestionCard` from `question.context`, and `selectFamilyLayout`
   * has never had a Pro Play entry, because it was never meant to.
   *
   * So a Pro Play question routed down the band path resolves to `compact` and
   * reads `text-only` — which was the correct verdict about the WRONG path.
   * Asking the production narrower first routes each payload to the production
   * component that actually draws it, exactly as `resolveBandProfile` routes
   * on the scenario source's own shape.
   *
   * This is not a family list and not an allow-list: nothing here names a
   * family, a question key or a source kind. The question is only ever
   * "does the production narrower accept this payload's own `context`?", and
   * `asQuestionContext` — the shipped one, imported, not copied — answers it.
   * A payload whose context it rejects falls through to the band path below
   * and is judged there, so a malformed context cannot pass by being present.
   */
  const proContext = asQuestionContext(question?.context);
  if (proContext) {
    return {
      status: "pro-context",
      model: null,
      familyLayout: null,
      band: null,
      proContext,
      reason: null,
    };
  }
  if (!question?.presentation || typeof question.presentation !== "object") return ABSENT;

  const payload = storedQuestionPreviewPayload(question);
  if (!payload) {
    return {
      status: "unreadable",
      model: null,
      familyLayout: null,
      band: null,
      proContext: null,
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
      band: null,
      proContext: null,
      reason: err instanceof Error ? err.message : "Presentation could not be adapted.",
    };
  }

  if (!model.scenarioSource) {
    return {
      status: "no-scenario",
      model,
      familyLayout: null,
      band: null,
      proContext: null,
      reason: "Presentation was readable but produced no scenario source.",
    };
  }

  // The production chain, in the production order, with the production
  // variant's settings: family layout first, then the band profile that
  // decides which presentation of the band actually renders.
  const familyLayout = selectFamilyLayout(model.scenarioSource);
  const band = resolveBandProfile(
    model.scenarioSource,
    resolveSettings(variant).mediaScale,
    familyLayout,
  );
  const status: ScenarioPresentationStatus =
    band === "family" ? "family" : band === "cinematic" ? "cinematic" : "text-only";
  return {
    status,
    model,
    familyLayout,
    band,
    proContext: null,
    reason: bandPresentsPayload(band)
      ? null
      : band === "none"
        ? "The surface variant renders no media band."
        : "A safe presentation exists, but the layout authority draws no scenario " +
          "for it — the band falls back to the category-only compact strip.",
  };
}

/** True when the harness should render through the production scenario surface. */
export function rendersThroughScenarioSurface(
  result: ScenarioPresentationResult,
): boolean {
  return result.model !== null && result.model.scenarioSource !== null;
}

/** True when the harness should render through the production Pro Play card. */
export function rendersThroughProPlayCard(
  result: ScenarioPresentationResult,
): boolean {
  return result.proContext !== null;
}
