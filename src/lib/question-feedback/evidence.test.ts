/**
 * RG3 — the evidence selector.
 *
 * The claims worth pinning are the negative ones: that a question with no
 * reviewed rationale produces NO line at all, and that nothing rendered was
 * composed here rather than copied from the candidate.
 */
import { describe, expect, it } from "vitest";
import { conciseEvidence, optionalExplanationText } from "./evidence";

describe("conciseEvidence", () => {
  it("quotes the FINAL calculation step, which is the one the answer is defined by", () => {
    expect(
      conciseEvidence({
        calculation_steps: [
          { step: "base", value: 450 },
          { step: "plus long sword", value: 800 },
          { step: "total", value: 1600 },
        ],
      }),
    ).toEqual({ kind: "statement", text: "Total: 1,600" });
  });

  it("accepts a plain-string step, which some families freeze instead", () => {
    expect(conciseEvidence({ calculation_steps: ["450 + 50", "+ 1100", "+ 800"] }))
      .toEqual({ kind: "statement", text: "+ 800" });
  });

  it("falls back to the reviewed scenario note when there is no arithmetic", () => {
    expect(conciseEvidence({ scenario_note: "the full purchase history" }))
      .toEqual({ kind: "statement", text: "The full purchase history" });
  });

  it("returns nothing at all when the question froze no rationale", () => {
    expect(conciseEvidence(null)).toBeNull();
    expect(conciseEvidence(undefined)).toBeNull();
    expect(conciseEvidence({})).toBeNull();
    expect(conciseEvidence({ calculation_steps: [] })).toBeNull();
  });

  it("never invents a line out of the fields that are not evidence", () => {
    // formula_id is an internal identifier, rounding_rule is a policy name and
    // distractor_derivations explains the WRONG answers. None of the three is
    // a sentence a player should be shown in a 1.5s beat, and none of them may
    // be assembled into one here.
    expect(
      conciseEvidence({
        formula_id: "item_cost_total_v2",
        rounding_rule: "round_half_up_to_integer",
        distractor_derivations: { "1500": "forgot the Long Sword" },
      }),
    ).toBeNull();
  });

  it("drops an over-long note rather than truncating it", () => {
    const long = "x".repeat(200);
    expect(conciseEvidence({ scenario_note: long })).toBeNull();
  });

  it("ignores a malformed payload instead of throwing at the answer beat", () => {
    expect(conciseEvidence({ calculation_steps: "not a list" as unknown as [] })).toBeNull();
    expect(conciseEvidence({ calculation_steps: [null, undefined] })).toBeNull();
  });
});

describe("optionalExplanationText", () => {
  it("joins the reviewed material for a SECONDARY surface", () => {
    expect(
      optionalExplanationText({
        scenario_note: "full purchase history",
        calculation_steps: [{ step: "base", value: 450 }, { step: "total", value: 1600 }],
      }),
    ).toBe("full purchase history · base: 450 → total: 1,600");
  });

  it("is null when there is nothing to offer", () => {
    expect(optionalExplanationText({ formula_id: "x" })).toBeNull();
  });
});
