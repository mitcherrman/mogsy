import { describe, expect, it } from "vitest";

import { formatQuestionFamily } from "./formatQuestionFamily";

describe("formatQuestionFamily", () => {
  it("renders the OOM acronym in upper case, not 'Casts Before Oom'", () => {
    expect(formatQuestionFamily("casts_before_oom")).toBe("Casts before OOM");
    expect(formatQuestionFamily("casts_before_oom")).not.toBe("Casts Before Oom");
  });

  it("maps known families to curated labels", () => {
    expect(formatQuestionFamily("cooldown_with_haste")).toBe("Cooldown with haste");
    expect(formatQuestionFamily("post_mitigation_single_type_damage")).toBe(
      "Post-mitigation damage",
    );
    expect(formatQuestionFamily("health_remaining")).toBe("Health remaining");
    expect(formatQuestionFamily("gold_remaining_after_purchase")).toBe(
      "Gold remaining after purchase",
    );
  });

  it("humanizes unknown families acronym-aware", () => {
    expect(formatQuestionFamily("some_ap_thing")).toBe("Some AP thing");
    expect(formatQuestionFamily("mystery_family")).toBe("Mystery family");
  });

  it("returns empty string for empty/nullish input", () => {
    expect(formatQuestionFamily("")).toBe("");
    expect(formatQuestionFamily(null)).toBe("");
    expect(formatQuestionFamily(undefined)).toBe("");
  });
});
