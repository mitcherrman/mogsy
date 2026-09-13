// ---------------------------------------------------------------------------
// GR1 product readiness — the two confirmed presentation-plumbing defects,
// asserted at the adapter that caused them.
//
// `toPlayerQuestion` is the whole of the slice path's translation from the
// wire into what the shared Mastery renderers draw. It hardcoded
// `patchDisplay: ""` (which the badge renders as the literal string "Fixed
// scenario") and synthesized an all-empty `inputConstraints` (which renders a
// bare "Your answer" box while the grader holds a rounded value). Both fields
// now cross the wire; these are the tests that they are USED, and that a
// segment frozen before they existed still renders exactly as it did.
// ---------------------------------------------------------------------------
import { describe, expect, it } from "vitest";
import { toPlayerQuestion } from "./MasterySliceChallengeSurface";
import { patchLabel } from "@/features/mastery/player/playerFormat";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";

const SEMANTICS = {
  template: "champion_stat_at_level",
  champion_display: "Aatrox",
  metric: "base_health_regen",
  subject_ref: "",
  ability_name: "",
  resource: "",
  context: { ability_rank: null, champion_level: 11, form: null },
};

const CONSTRAINTS = {
  unit: "per_5_seconds",
  min: 0,
  max: null,
  step: 0.1,
  integer_only: false,
  decimal_places: 1,
  rounding_mode: "half_up",
  precision_instruction: "Round to 1 decimal place.",
  precision_contract_version: "mastery.precision.v1",
};

function challenge(over: Partial<MasterySliceChallengeView> = {}): MasterySliceChallengeView {
  return {
    challengeIndex: 0,
    interactionKind: "atomic_recall",
    questionFamily: "champion_level_stat",
    prompt: "Aatrox — base_health_regen",
    answerType: "numeric",
    answerOptions: [],
    promptSemantics: SEMANTICS,
    comparisonSemantics: null,
    presentation: null,
    patchDisplay: "League 26.16",
    inputConstraints: CONSTRAINTS,
    ...over,
  };
}

describe("the patch badge shows the patch the question was generated from", () => {
  it("carries the wire value through, not an empty string", () => {
    const q = toPlayerQuestion(challenge(), 3, "atomic_recall");
    expect(q.patchDisplay).toBe("League 26.16");
  });

  // The defect in its own terms: this is the string a player actually read.
  it("no longer badges a live-patch question as a fixed scenario", () => {
    const q = toPlayerQuestion(challenge(), 3, "atomic_recall");
    expect(patchLabel(q.patchDisplay)).toBe("Patch 26.16");
    expect(patchLabel(q.patchDisplay)).not.toBe("Fixed scenario");
  });

  // Absent means unknown. A segment frozen before the field existed has to
  // keep rendering the badge it already rendered.
  it.each([null, undefined])("a segment without the field is unchanged (%s)", (value) => {
    const q = toPlayerQuestion(
      challenge({ patchDisplay: value as string | null }), 3, "atomic_recall");
    expect(q.patchDisplay).toBe("");
    expect(patchLabel(q.patchDisplay)).toBe("Fixed scenario");
  });
});

describe("a free-input question states its own input contract", () => {
  it("passes the real unit and precision instruction through", () => {
    const q = toPlayerQuestion(challenge(), 3, "atomic_recall");
    expect(q.answerType).toBe("numeric");
    expect(q.inputConstraints).toMatchObject({
      unit: "per_5_seconds",
      decimalPlaces: 1,
      roundingMode: "half_up",
      precisionInstruction: "Round to 1 decimal place.",
      step: 0.1,
    });
  });

  it.each([null, undefined])(
    "falls back to the pre-phase empty contract when absent (%s)", (value) => {
      const q = toPlayerQuestion(
        challenge({ inputConstraints: value as null }), 3, "atomic_recall");
      expect(q.inputConstraints).toMatchObject({
        unit: "", decimalPlaces: null, roundingMode: null, precisionInstruction: null,
      });
    });

  // An input hint is never worth a round: a malformed block degrades rather
  // than throwing inside a live match.
  it("degrades to the empty contract on a malformed block", () => {
    const q = toPlayerQuestion(
      challenge({ inputConstraints: { unit: 17 } as Record<string, unknown> }),
      3, "atomic_recall");
    expect(q.inputConstraints).toMatchObject({ unit: "" });
  });

  it("a single-choice challenge still carries no constraints", () => {
    const q = toPlayerQuestion(
      challenge({ answerType: "single_choice", answerOptions: ["1", "2", "3", "4"] }),
      3, "atomic_recall");
    expect(q.inputConstraints).toBeNull();
  });
});
