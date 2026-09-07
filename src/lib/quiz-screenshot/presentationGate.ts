/**
 * CON1 Step 1D — the presentation-completeness gate. PURE: no React, no DOM,
 * no fetch, no fs.
 *
 * THE RULE
 * When the backend projects a safe `presentation` for a question, that premise
 * is part of the question. If the production presentation/layout system does
 * not draw it, the exported PNG is a text card that silently omits context the
 * reader was meant to have — and the Content Factory publishes unattended, so
 * "silently" is the whole problem. Such a capture FAILS by default.
 *
 * WHERE THE DECISION COMES FROM
 * Nothing here classifies a question. The two inputs are the production
 * outcomes the render page stamps on the card:
 *
 *   status — `resolveScenarioPresentation().status`
 *   band   — `resolveBandProfile()`, the ONE band rule the surface itself uses
 *
 * There is deliberately no family list, no question-key pattern and no field
 * inspection in this module: the moment a layout rule lands upstream for a
 * family, `band` changes on its own and that family's captures start passing
 * with nothing here edited. That is the intended way Minion XP recovers.
 *
 * WHAT IS AND IS NOT A FAILURE (each verified against the real corpus, see
 * CONTENT_FACTORY_HANDOFF.md):
 *
 *   absent      PASS  no presentation was projected. The contract working as
 *                     designed — an ordinary MCQ, or a form (Minion XP `wave`)
 *                     whose contract declares no safe premise. An absent
 *                     presentation is NEVER a failure.
 *   family      PASS  the family band drew the premise.
 *   cinematic   PASS  the band drew a real subject visual resolved FROM the
 *                     presentation. This is why the gate reads the band and not
 *                     `familyLayout`: `ability_cooldown_haste` (601 active rows
 *                     measured locally) has no family layout and renders a full
 *                     champion band.
 *   text-only   FAIL  a presentation exists and the band fell back to the
 *                     category-only compact strip (or to no band at all).
 *                     CompactScenarioBand receives ONLY `category`, so every
 *                     projected field was dropped.
 *   no-scenario FAIL  a readable presentation produced no scenario source.
 *   unreadable  FAIL  the presentation could not be adapted — a defect.
 */

import type { QaFinding } from "./metadata";
import type { ScenarioPresentationStatus } from "./presentation";

/** The QA code every finding from this gate carries. */
export const INCOMPLETE_PRESENTATION_CODE = "incomplete-presentation";

/** Statuses that mean the projected premise never reached the picture. */
const INCOMPLETE_STATUSES: ReadonlySet<string> = new Set([
  "text-only",
  "no-scenario",
  "unreadable",
]);

export type PresentationGateInput = {
  /** `data-quiz-presentation` — absent when the slide renders no question card. */
  status: string | null;
  /** `data-quiz-presentation-band` — absent when no scenario surface rendered. */
  band: string | null;
  /** Why the presentation is incomplete, as the resolver stated it. */
  reason?: string | null;
  questionId: number | string;
  /** Stored `question_key`, when the source row carried one. */
  questionKey?: string | null;
  format: string;
  state: string;
  /**
   * Diagnostic override (`--allow-incomplete-presentation`). false by default:
   * an incomplete presentation fails the capture. true downgrades the finding
   * to a warning so the image is still produced — for diagnosing an incomplete
   * layout, never for publishing.
   */
  allowIncomplete: boolean;
};

export type PresentationGateResult = {
  /** Findings to merge into the capture's QA — failures, or warnings under
   *  the override. Empty when the presentation is complete or absent. */
  findings: QaFinding[];
  /** True when this capture must not count as publishable. */
  failed: boolean;
  /** True when the override let an incomplete presentation through. */
  overridden: boolean;
};

const NONE: PresentationGateResult = { findings: [], failed: false, overridden: false };

/**
 * Decide whether one capture's presentation is complete.
 *
 * A slide with no `status` at all (an end slide, or a card that predates the
 * attribute) is not judged: absence of the marker is absence of evidence, and
 * inventing a failure from it would fail every non-quiz slide in a carousel.
 */
export function evaluatePresentationGate(
  input: PresentationGateInput,
): PresentationGateResult {
  const status = input.status?.trim();
  if (!status) return NONE;
  if (!INCOMPLETE_STATUSES.has(status)) return NONE;

  const identity = input.questionKey
    ? `question ${input.questionId} (${input.questionKey})`
    : `question ${input.questionId}`;
  const band = input.band?.trim() || "none";
  const why = input.reason?.trim() || "the layout authority drew no scenario for it";
  const message =
    `Incomplete presentation on ${identity}: the backend projected a safe ` +
    `presentation, but the production layout system did not render it ` +
    `(presentation=${status}, band=${band}, format=${input.format}, ` +
    `state=${input.state}). ${why}` +
    (input.allowIncomplete
      ? " Captured anyway because --allow-incomplete-presentation is set; " +
        "this image is a diagnostic, not a publishable capture."
      : " Pass --allow-incomplete-presentation to capture it anyway for diagnosis.");

  return {
    findings: [
      {
        severity: input.allowIncomplete ? "warning" : "failure",
        code: INCOMPLETE_PRESENTATION_CODE,
        message,
        format: input.format,
        state: input.state,
      },
    ],
    failed: !input.allowIncomplete,
    overridden: input.allowIncomplete,
  };
}

/** Typed form of the same predicate, for callers holding a resolver result
 *  rather than DOM strings. */
export function presentationIsIncomplete(status: ScenarioPresentationStatus): boolean {
  return INCOMPLETE_STATUSES.has(status);
}
