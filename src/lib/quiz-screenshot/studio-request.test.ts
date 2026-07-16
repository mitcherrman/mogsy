import { describe, expect, it } from "vitest";
import { validateStudioJob } from "./studio-request";

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(100 + i));

function expectErrors(body: unknown, pattern: RegExp) {
  const v = validateStudioJob(body);
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.errors.join(" | ")).toMatch(pattern);
}

describe("validateStudioJob", () => {
  it("accepts a minimal single-question job with defaults", () => {
    const v = validateStudioJob({ mode: "single-question", questionIds: ["123"] });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.request.formats).toEqual(["mobile-social"]);
      expect(v.request.platform).toBe("generic");
      expect(v.request.overwrite).toBe(false);
      expect(v.request.difficulty).toBeNull();
    }
  });

  it("rejects unknown modes, difficulties, platforms, and formats", () => {
    expectErrors({ mode: "banner", questionIds: ["1"] }, /Unknown mode/);
    expectErrors({ mode: "classic", questionIds: ["1"], difficulty: "silver" }, /difficulty/);
    expectErrors({ mode: "classic", questionIds: ["1"], platform: "myspace" }, /platform/);
    expectErrors({ mode: "classic", questionIds: ["1"], formats: ["gigantic"] }, /format/);
  });

  it("rejects path-traversal shaped run ids and question ids", () => {
    expectErrors({ mode: "classic", questionIds: ["1"], runId: "../../etc" }, /run id/i);
    expectErrors({ mode: "classic", questionIds: ["1"], runId: "a/b" }, /run id/i);
    expectErrors({ mode: "classic", questionIds: ["../1"] }, /question id/i);
    expectErrors({ mode: "classic", questionIds: ["a b"] }, /question id/i);
  });

  it("enforces the multi-question 2-10 count and duplicates rule", () => {
    expectErrors({ mode: "multi-question", questionIds: ["1"] }, /2-10/);
    expectErrors({ mode: "multi-question", questionIds: ids(11) }, /2-10/);
    expectErrors({ mode: "multi-question", questionIds: ["1", "1"] }, /duplicates/);
    expect(validateStudioJob({ mode: "multi-question", questionIds: ids(5) }).ok).toBe(true);
  });

  it("restricts states to classic mode and validates them", () => {
    expectErrors(
      { mode: "single-question", questionIds: ["1"], states: ["question"] },
      /classic/,
    );
    expectErrors({ mode: "classic", questionIds: ["1"], states: ["bogus"] }, /Unknown state/);
    const v = validateStudioJob({ mode: "classic", questionIds: ["1"], states: ["question", "correct"] });
    expect(v.ok).toBe(true);
  });

  it("validates per-question difficulty overrides", () => {
    expectErrors(
      { mode: "classic", questionIds: ["1"], difficultyOverrides: { "1": "silver" } },
      /tier/,
    );
    const v = validateStudioJob({
      mode: "classic",
      questionIds: ["1"],
      difficultyOverrides: { "1": "diamond" },
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.request.difficultyOverrides).toEqual({ "1": "diamond" });
  });

  it("validates challenge copy variants", () => {
    expectErrors(
      { mode: "multi-question", questionIds: ids(3), challenge: { repeatVariant: 7 } },
      /repeatVariant/,
    );
    expectErrors(
      { mode: "multi-question", questionIds: ids(3), challenge: { midCtaVariant: 7 } },
      /midCtaVariant/,
    );
  });

  it("daily-package: requires featured question and a valid combined count", () => {
    expectErrors({ mode: "daily-package", questionIds: ids(4) }, /daily/);
    expectErrors(
      {
        mode: "daily-package",
        questionIds: ids(4),
        daily: { featuredQuestionId: "100", reuseFeaturedAsOpener: true },
      },
      /must not also appear/,
    );
    // 4 challenge + reused featured = 5 → ok.
    const v = validateStudioJob({
      mode: "daily-package",
      questionIds: ["201", "202", "203", "204"],
      daily: { featuredQuestionId: "100", reuseFeaturedAsOpener: true },
    });
    expect(v.ok).toBe(true);
    // 0 challenge + no reuse = 0 → too few.
    expectErrors(
      {
        mode: "daily-package",
        questionIds: [],
        daily: { featuredQuestionId: "100", reuseFeaturedAsOpener: false },
      },
      /2-10/,
    );
    // daily options outside daily mode are rejected.
    expectErrors(
      { mode: "classic", questionIds: ["1"], daily: { featuredQuestionId: "1" } },
      /daily/,
    );
  });

  it("rejects non-object bodies and missing questionIds", () => {
    expectErrors(null, /JSON object/);
    expectErrors({ mode: "classic" }, /questionIds/);
    expectErrors({ mode: "classic", questionIds: [] }, /at least one/);
  });
});
