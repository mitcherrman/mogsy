/**
 * Scenario band profile — WHICH presentation of the premium band a payload
 * gets, and therefore whether a premise reaches the picture at all.
 *
 * WHY THIS IS ITS OWN MODULE (CON1 Step 1D)
 * This rule lived inside `InteractiveScenarioSurface` and was private to it.
 * That was fine while the only consumer was the component that renders — but
 * the Content Factory captures unattended, and its completeness gate has to
 * know what the surface WILL draw before it decides whether a PNG is
 * publishable. The alternatives were both wrong: re-deriving the rule in the
 * factory would fork the layout authority, and reading the rendered pixels
 * back would be a text/vision heuristic.
 *
 * So the rule moved here UNCHANGED and the surface imports it. There is still
 * exactly one band-profile decision in the codebase; it is now merely callable
 * from a pure module. Nothing about the rendered result changed.
 *
 * The function is pure and reveal-invariant: it reads only pre-reveal,
 * question-safe payload fields (`selectScenario` is called spoiler-safely with
 * revealActive=false / correctAnswer=null), so it cannot vary with the answer
 * and the band cannot resize when a round resolves.
 */

import type { QuizQuestion } from "@/lib/quiz/api";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";
import type { FamilyLayout } from "./familyLayout";
import type { SurfaceSettings } from "./contract";

/**
 * Presentation of the scenario band, chosen by CONTENT CAPABILITY (never mode
 * identity):
 *  - "family": the payload describes a premise the subject-shaped cards cannot
 *    express — a combat RELATION (attacker → ability → target, with the stated
 *    quantities) or an item TRANSACTION (started with / kept / bought / sold).
 *    Renders the absolute-sized family band (RA7). Chosen FIRST, and only when
 *    `selectFamilyLayout` can support the payload completely.
 *  - "cinematic": the source resolves to a real premium visual — champion
 *    splash, item/recipe, combat calc, a framed collectible, OR a spoiler-hidden
 *    subject (placeholder card) that will reveal into a rich subject. Keeps the
 *    tall container-query box the Broadcast cards were designed for.
 *  - "compact": no source, or a source that classifies to nothing worth a
 *    cinematic panel ("empty"). Renders the short absolute-sized
 *    CompactScenarioBand instead of reserving a large, mostly-empty cqmin
 *    panel. NOTE for any completeness gate: CompactScenarioBand receives ONLY
 *    the category — no subject, no prompt, no premise field — so a payload that
 *    lands here contributed nothing at all to the picture.
 *  - "none": the variant asked for no media band.
 *
 * Reusing selectScenario (the exact classifier the cinematic card itself uses)
 * keeps the decision consistent with what would actually render and avoids a
 * second capability heuristic.
 */
export type ScenarioBandProfile = "family" | "cinematic" | "compact" | "none";

export function resolveBandProfile(
  scenarioSource: QuizQuestion | null | undefined,
  mediaScale: SurfaceSettings["mediaScale"],
  familyLayout: FamilyLayout | null,
): ScenarioBandProfile {
  if (mediaScale === "none") return "none";
  if (familyLayout) return "family";
  if (!scenarioSource) return "compact";
  return selectScenario(scenarioSource, false, null).card === "empty" ? "compact" : "cinematic";
}

/**
 * True when this profile actually PRESENTS the payload it was given.
 *
 * `family` draws the premise structurally; `cinematic` draws a real subject
 * visual resolved FROM the payload. `compact` and `none` draw nothing of it —
 * `compact` renders the category strip alone, and `none` renders no band. This
 * is the single predicate a completeness gate needs, kept beside the rule it
 * reads rather than restated by each caller.
 */
export function bandPresentsPayload(profile: ScenarioBandProfile): boolean {
  return profile === "family" || profile === "cinematic";
}
