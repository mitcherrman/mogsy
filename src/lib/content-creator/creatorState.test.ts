import { describe, expect, it } from "vitest";
import type { ReviewQuestion } from "@/lib/quiz/api";
import {
  buildCreatorRequest,
  CREATOR_FORMATS,
  DEFAULT_SETTINGS,
  describeItem,
  type CreatorItem,
  type CreatorSettings,
} from "./creatorState";

function row(id: number, over: Partial<ReviewQuestion> = {}): ReviewQuestion {
  return {
    id,
    question_text: `Which item is number ${id}?`,
    category: "items",
    difficulty: 2,
    format: "multiple_choice",
    choices: ["Alpha", "Beta", "Gamma", "Delta"],
    correct_answer: { type: "exact", value: "Gamma" },
    is_active: true,
    review_status: "approved",
    favorite_for_shorts: false,
    missing_asset: false,
    asset_status: { status: "not_required" } as never,
    metadata: id % 2 ? { content_difficulty: "gold" } : {},
    ...over,
  } as ReviewQuestion;
}

const items = (ids: number[]): CreatorItem[] => ids.map((id) => ({ id: String(id), row: row(id) }));
const settings = (over: Partial<CreatorSettings>): CreatorSettings => ({ ...DEFAULT_SETTINGS, ...over });
const NOW = new Date(2026, 9, 23, 9, 30, 0);

describe("describeItem", () => {
  it("shows the correct answer and the render readiness, without touching the row", () => {
    const r = row(7);
    const before = JSON.stringify(r);
    const info = describeItem(r);
    expect(info.correctLabel).toBe("Gamma");
    expect(info.readiness.blocking).toBe(false);
    expect(info.contentDifficulty).toBe("gold");
    expect(JSON.stringify(r)).toBe(before);
  });

  it("marks a row the Content Factory cannot render as blocked", () => {
    const info = describeItem(row(8, { choices: ["Only one"], correct_answer: { value: "Only one" } }));
    expect(typeof info.adapted).toBe("string");
  });
});

describe("buildCreatorRequest", () => {
  it("offers only the four social image sizes", () => {
    expect(CREATOR_FORMATS.map((f) => f.key).sort()).toEqual(["landscape", "mobile-social", "square", "vertical"]);
  });

  it("builds a single-question post for every selected question", () => {
    const built = buildCreatorRequest(settings({ mode: "single-question", formats: ["square"] }), items([1, 2]), NOW);
    expect(built.errors).toEqual([]);
    expect(built.request?.kind).toBe("run");
    expect(built.cardCount).toBe(4);
    expect(built.zipFileName).toBe("single-question-20261023-093000.zip");
  });

  it("classic needs at least one state and honours the run name", () => {
    expect(buildCreatorRequest(settings({ mode: "classic", states: [] }), items([1]), NOW).errors.join(" ")).toMatch(/card state/);
    const ok = buildCreatorRequest(settings({ mode: "classic", states: ["question", "correct"], runName: "my-run" }), items([1]), NOW);
    expect(ok.zipFileName).toBe("my-run.zip");
    expect(ok.cardCount).toBe(2);
  });

  it("a challenge needs 2–10 questions and carries the copy variants", () => {
    expect(buildCreatorRequest(settings({ mode: "multi-question" }), items([1]), NOW).request).toBeNull();
    const built = buildCreatorRequest(
      settings({ mode: "multi-question", repeatVariant: 1, midCtaVariant: 2, formats: ["mobile-social"] }),
      items([1, 2, 3]),
      NOW,
    );
    expect(built.errors).toEqual([]);
    const plan = built.request!.kind === "run" ? built.request!.plan : null;
    expect(plan?.cards.map((c) => c.slug)).toEqual(["opening", "q01", "q02", "q03", "answers", "ending"]);
    expect(plan?.cards.find((c) => c.slug === "q01")?.extraParams?.repeat).toBe("1");
  });

  it("a daily package needs a featured question, then plans three posts", () => {
    const missing = buildCreatorRequest(settings({ mode: "daily-package" }), items([1, 2, 3]), NOW);
    expect(missing.errors.join(" ")).toMatch(/featured/);
    const built = buildCreatorRequest(
      settings({ mode: "daily-package", featuredId: "2", runName: "day1", formats: ["square"] }),
      items([1, 2, 3]),
      NOW,
    );
    expect(built.errors).toEqual([]);
    expect(built.request?.kind).toBe("daily");
    const daily = built.request!.kind === "daily" ? built.request!.plan : null;
    expect(daily?.posts.map((p) => p.plan.questionIds)).toEqual([["2"], ["2"], ["2", "1", "3"]]);
    expect(built.zipFileName).toBe("day1-package.zip");
  });

  it("refuses blocked rows instead of generating around them", () => {
    const blocked: CreatorItem = {
      id: "9",
      row: row(9, {
        asset_status: {
          status: "unresolved",
          unresolved: [{ channel: "image_path", path: "assets/items/1.png", requirement: "required", resolution: "missing" }],
        } as never,
      }),
    };
    const built = buildCreatorRequest(settings({ mode: "single-question" }), [...items([1]), blocked], NOW);
    expect(built.request).toBeNull();
    expect(built.errors.join(" ")).toMatch(/#9/);
  });

  it("applies per-question badge overrides only to selected questions", () => {
    const built = buildCreatorRequest(
      settings({ mode: "single-question", formats: ["square"], overrides: { "2": "diamond", "99": "iron" } }),
      items([1, 2]),
      NOW,
    );
    const plan = built.request!.kind === "run" ? built.request!.plan : null;
    expect(plan?.difficultyOverrides).toEqual({ "2": "diamond" });
    expect(plan?.cards.filter((c) => c.slug === "question").map((c) => c.difficulty)).toEqual(["gold", "diamond"]);
  });
});
