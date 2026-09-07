/**
 * CON1 Step 1C — the Content Factory presentation bridge, on the pure path.
 *
 * What these prove: the harness reaches the scenario band through the SAME
 * chain Admin Review does, and through nothing else.
 *
 *   review row (`presentation` from the backend)
 *     -> adaptScreenshotQuestion        (harness source → RenderQuestion)
 *     -> storedQuestionPreviewPayload   (the SAME envelope Admin writes)
 *     -> adaptCandidatePreview          (the SAME adapter Ranked candidates use)
 *     -> selectFamilyLayout             (the SINGLE layout authority)
 *
 * And the negative that makes it safe: raw `metadata` — complete on the row,
 * solution fields and all — never feeds any of it.
 */

import { describe, expect, it } from "vitest";
import { adaptScreenshotQuestion, type ScreenshotSourceQuestion } from "./adapt";
import { resolveScenarioPresentation, rendersThroughScenarioSurface } from "./presentation";
import { selectFamilyLayout } from "@/lib/question-surface/familyLayout";
import {
  COMBAT_PRESENTATION,
  EXACT_MINION_METADATA,
  EXACT_MINION_PRESENTATION,
  MINION_EXACT,
  MINION_SOLUTION_FIELDS,
  MINION_WAVE,
  PLAIN_MCQ,
  COMBAT_SCENARIO,
} from "./presentationFixtures";

describe("`presentation` survives the screenshot source adaptation", () => {
  const sourceRow: ScreenshotSourceQuestion = {
    id: 4242,
    question_text: MINION_EXACT.question_text,
    format: "multiple_choice",
    category: "league_mechanics",
    choices: ["1st melee", "2nd melee", "3rd melee", "1st caster"],
    correct_answer: { type: "text", value: "3rd melee" },
    presentation: { ...EXACT_MINION_PRESENTATION },
    metadata: EXACT_MINION_METADATA,
  };

  it("carries the backend projection through verbatim", () => {
    const adapted = adaptScreenshotQuestion(sourceRow);
    expect(typeof adapted).not.toBe("string");
    expect((adapted as { presentation?: unknown }).presentation).toEqual(
      EXACT_MINION_PRESENTATION,
    );
  });

  it("leaves the raw metadata alone — complete, and separate", () => {
    const adapted = adaptScreenshotQuestion(sourceRow) as { metadata?: Record<string, unknown> };
    expect(adapted.metadata).toEqual(EXACT_MINION_METADATA);
  });

  it("invents no presentation for a row the backend projected none for", () => {
    const adapted = adaptScreenshotQuestion({
      ...sourceRow,
      presentation: undefined,
    }) as { presentation?: unknown };
    expect(adapted.presentation).toBeUndefined();
  });
});

describe("a plain MCQ takes no scenario path at all", () => {
  it("reports `absent` and yields no model", () => {
    const result = resolveScenarioPresentation(PLAIN_MCQ);
    expect(result.status).toBe("absent");
    expect(result.model).toBeNull();
    expect(rendersThroughScenarioSurface(result)).toBe(false);
  });
});

describe("a combat scenario reaches the production family band", () => {
  const result = resolveScenarioPresentation(COMBAT_SCENARIO);

  it("builds a scenario source that IS the backend presentation", () => {
    // scenarioSourceFromPublicQuestion maps `presentation` straight through as
    // the Quiz-shaped `metadata`. Equality is the proof that the scenario is
    // drawn from the safe projection and from nothing else.
    expect(result.model?.scenarioSource?.metadata).toEqual(COMBAT_PRESENTATION);
  });

  it("is resolved to the `combat` family by the single layout authority", () => {
    expect(result.status).toBe("family");
    expect(result.familyLayout?.kind).toBe("combat");
    // The advisory call and the surface's own call are the same pure function
    // on the same input; asserting that keeps the diagnostic honest.
    expect(selectFamilyLayout(result.model!.scenarioSource)?.kind).toBe("combat");
    expect(rendersThroughScenarioSurface(result)).toBe(true);
  });
});

describe("the Minion XP exact-minion premise reaches the layout selector", () => {
  const result = resolveScenarioPresentation(MINION_EXACT);

  it("hands the safe nine-field premise to the scenario source", () => {
    expect(result.model?.scenarioSource).not.toBeNull();
    expect(result.model!.scenarioSource!.metadata).toEqual(EXACT_MINION_PRESENTATION);
    expect(rendersThroughScenarioSurface(result)).toBe(true);
  });

  it("consults the layout authority, which declines on this branch", () => {
    /**
     * DEPENDENCY, recorded rather than patched around: the minion-XP layout
     * rule and `MinionXpBand.tsx` are unmerged work on
     * `hygiene/minion-xp-band-preserved` (`d613c672`). `selectFamilyLayout`
     * on this branch supports combat and lifecycle only, so it declines this
     * source and the surface falls back to its existing presentation.
     *
     * `text-only` is exactly that fallback, named. This assertion is what
     * CON1 Step 1D will invert into a fail-closed gate; it is deliberately NOT
     * a gate today, and nothing here reconstructs the band.
     */
    expect(selectFamilyLayout(result.model!.scenarioSource)).toBeNull();
    expect(result.status).toBe("text-only");
    expect(result.familyLayout).toBeNull();
  });

  it("carries no solution field anywhere the surface can see", () => {
    const seen = JSON.stringify(result.model);
    for (const field of MINION_SOLUTION_FIELDS) expect(seen).not.toContain(field);
  });
});

describe("raw metadata alone can never produce a scenario", () => {
  it("is `absent` for a row whose metadata describes the whole scenario", () => {
    // The exact-minion row minus the backend projection. Its metadata still
    // describes the premise in full — and is still, correctly, unusable.
    const result = resolveScenarioPresentation({ ...MINION_EXACT, presentation: undefined });
    expect(result.status).toBe("absent");
    expect(result.model).toBeNull();
  });

  it("fabricates nothing for the Minion XP `wave` form", () => {
    const result = resolveScenarioPresentation(MINION_WAVE);
    expect(result.status).toBe("absent");
    expect(result.model).toBeNull();
    expect(JSON.stringify(result)).not.toContain("2:05");
    expect(JSON.stringify(result)).not.toContain("3 melee, 3 caster");
  });
});

describe("the fallback is named, so Step 1D can act on it", () => {
  it("distinguishes no-premise from premise-without-a-band", () => {
    // The distinction the fail-closed gate is made of: one is the contract
    // working, the other is a scenario question about to export as text.
    expect(resolveScenarioPresentation(MINION_WAVE).status).toBe("absent");
    expect(resolveScenarioPresentation(MINION_EXACT).status).toBe("text-only");
    expect(resolveScenarioPresentation(COMBAT_SCENARIO).status).toBe("family");
  });

  it("names a presentation it cannot read rather than silently dropping it", () => {
    const result = resolveScenarioPresentation({
      ...COMBAT_SCENARIO,
      choices: [{ label: "only one" }],
    });
    expect(result.status).toBe("unreadable");
    expect(result.reason).toBeTruthy();
    expect(result.model).toBeNull();
  });
});
