import { describe, expect, it } from "vitest";
import {
  adaptCandidatePreview,
  PREVIEWABLE_MODULE_ID,
  PreviewAdapterError,
} from "./rankedPreviewAdapter";
import {
  CHAMPION_OPTION_QUESTION,
  ITEM_OPTION_QUESTION,
  NUMERIC_QUESTION,
} from "@/lib/ranked-core/adapters/optionMediaFixtures";
import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import { readPublicQuestion } from "@/lib/ranked-public/contracts";

// The fixtures are backend-DUMPED payloads (see optionMediaFixtures), so these
// assertions run against the real transport shape, not a hand-shaped stand-in.
const withModule = (
  payload: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({ ...payload, module_id: PREVIEWABLE_MODULE_ID, ...extra });

describe("rankedPreviewAdapter", () => {
  it("produces exactly what the production adapters produce", () => {
    // The whole contract of this module: it must ADD nothing. Building the
    // expected value through the same two production adapters means a bespoke
    // transform here would fail this test.
    const payload = withModule(ITEM_OPTION_QUESTION);
    const source = readPublicQuestion(payload)!;

    const model = adaptCandidatePreview(payload);

    expect(model.question).toEqual(questionViewFromPublicQuestion(source));
    expect(model.scenarioSource).toEqual(scenarioSourceFromPublicQuestion(source));
  });

  it("zips option media onto options positionally", () => {
    const model = adaptCandidatePreview(withModule(ITEM_OPTION_QUESTION));
    expect(model.question.options.map((o) => o.media?.name)).toEqual([
      "Kindlegem",
      "Ruby Crystal",
      "Cloth Armor",
      "Null-Magic Mantle",
    ]);
  });

  it("keeps premise media and option media as independent channels", () => {
    const numeric = adaptCandidatePreview(withModule(NUMERIC_QUESTION));
    expect(numeric.scenarioSource).not.toBeNull();
    expect(numeric.question.options.every((o) => o.media === null)).toBe(true);

    const champion = adaptCandidatePreview(withModule(CHAMPION_OPTION_QUESTION));
    expect(champion.scenarioSource).toBeNull();
    expect(champion.question.options.every((o) => o.media !== null)).toBe(true);
  });

  it("drops the whole option-media set when the length disagrees", () => {
    const model = adaptCandidatePreview(
      withModule({
        ...ITEM_OPTION_QUESTION,
        option_media: ITEM_OPTION_QUESTION.option_media!.slice(0, 3),
      }),
    );
    expect(model.question.options.every((o) => o.media === null)).toBe(true);
  });

  it("carries no correctness anywhere in the model", () => {
    const model = adaptCandidatePreview(withModule(ITEM_OPTION_QUESTION));
    const blob = JSON.stringify(model);
    expect(blob).not.toContain("correct");
    expect(Object.keys(model.question)).toEqual([
      "questionId",
      "prompt",
      "options",
      "category",
    ]);
  });

  it("refuses a payload that leaked a correct index", () => {
    expect(() =>
      adaptCandidatePreview(
        withModule(ITEM_OPTION_QUESTION, { correct_index: 2 }),
      ),
    ).toThrow(PreviewAdapterError);
  });

  it("treats a missing module_id as the previewable quiz module", () => {
    const model = adaptCandidatePreview({ ...ITEM_OPTION_QUESTION });
    expect(model.moduleId).toBe(PREVIEWABLE_MODULE_ID);
    expect(model.supported).toBe(true);
  });

  it("marks a live-segment module unsupported", () => {
    const model = adaptCandidatePreview(
      withModule(ITEM_OPTION_QUESTION, { module_id: "item_cost_duel" }),
    );
    expect(model.moduleId).toBe("item_cost_duel");
    expect(model.supported).toBe(false);
  });

  it("passes the review status through for operator orientation", () => {
    const model = adaptCandidatePreview(
      withModule(ITEM_OPTION_QUESTION, { derived_status: "rejected" }),
    );
    expect(model.derivedStatus).toBe("rejected");
  });

  it("falls back to text-only when there is no presentation", () => {
    const model = adaptCandidatePreview(
      withModule({ ...ITEM_OPTION_QUESTION, presentation: undefined }),
    );
    expect(model.scenarioSource).toBeNull();
    expect(model.question.prompt).toBe(ITEM_OPTION_QUESTION.prompt);
  });

  it("renders an incomplete payload rather than inventing content", () => {
    const model = adaptCandidatePreview({
      question_id: "c1",
      prompt: "",
      options: [],
      category: null,
    });
    expect(model.question.options).toEqual([]);
    expect(model.question.prompt).toBe("");
    expect(model.scenarioSource).toBeNull();
  });

  it.each([
    ["a non-object", "not an object"],
    ["null", null],
    ["an array", [1, 2, 3]],
  ])("throws a typed error for %s payload", (_label, payload) => {
    expect(() => adaptCandidatePreview(payload)).toThrow(PreviewAdapterError);
  });

  it("throws a typed error when a required field is malformed", () => {
    expect(() =>
      adaptCandidatePreview({ ...ITEM_OPTION_QUESTION, options: "nope" }),
    ).toThrow(PreviewAdapterError);
  });
});
