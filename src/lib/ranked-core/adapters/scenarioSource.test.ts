/**
 * F1 rich-metadata transport — Ranked scenario adapter. Verifies it produces the
 * correct neutral ScenarioSource and that the existing Broadcast/Quiz
 * `selectScenario` pipeline consumes it (champion / item / recipe / spoiler
 * gating) without any Broadcast logic copied into Ranked.
 */
import { describe, expect, it } from "vitest";
import { scenarioSourceFromPublicQuestion } from "./scenarioSource";
import type { PublicQuestionSource } from "./adaptToViews";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";

const q = (presentation?: Record<string, unknown> | null): PublicQuestionSource => ({
  questionId: "q1", prompt: "P?", options: ["a", "b", "c", "d"],
  category: "cat", presentation,
});

describe("scenarioSourceFromPublicQuestion", () => {
  it("returns null when the question carries no metadata (text fallback)", () => {
    expect(scenarioSourceFromPublicQuestion(q())).toBeNull();
    expect(scenarioSourceFromPublicQuestion(q(null))).toBeNull();
  });

  it("maps the transport shape into a neutral QuizQuestion ScenarioSource", () => {
    const src = scenarioSourceFromPublicQuestion(q({ assets: { subject: { type: "item", name: "X" } } }))!;
    expect(src.id).toBe("q1");
    expect(src.question_text).toBe("P?");
    expect(src.category).toBe("cat");
    expect(src.choices).toEqual(["a", "b", "c", "d"]);
    expect(src.format).toBe("multiple_choice");
    expect((src.metadata as Record<string, unknown>).assets).toBeTruthy();
  });

  it("produces a champion source that selectScenario renders as a champion card", () => {
    const src = scenarioSourceFromPublicQuestion(q({
      assets: { subject: { type: "champion", name: "Darius" } },
      presentation: { scenario_type: "champion_profile", role: "context", timing: "question" },
    }))!;
    expect(selectScenario(src, false, null).card).toBe("champion_profile");
  });

  it("produces an item source that selectScenario renders as an item card", () => {
    const src = scenarioSourceFromPublicQuestion(q({
      assets: { subject: { type: "item", name: "Doran's Shield", icon: "assets/items/1054.png" } },
      presentation: { scenario_type: "item", role: "context", timing: "question" },
    }))!;
    expect(selectScenario(src, false, null).card).toBe("item_analysis");
  });

  it("carries a recipe (known components) through to the item card", () => {
    const src = scenarioSourceFromPublicQuestion(q({
      assets: { subject: { type: "item", name: "Trinity Force" } },
      known_components: ["Sheen", "Phage"],
      presentation: { scenario_type: "item", role: "context", timing: "question" },
    }))!;
    const sel = selectScenario(src, false, null);
    expect(sel.card).toBe("item_analysis");
    if (sel.card === "item_analysis") {
      expect(sel.item.knownComponents.map((c) => c.name)).toEqual(["Sheen", "Phage"]);
      // The answer (missing component) is never present pre-reveal.
      expect(sel.item.missingComponent).toBeUndefined();
    }
  });

  it("hides an answer-subject pre-reveal and reveals it post-reveal (spoiler safety)", () => {
    const src = scenarioSourceFromPublicQuestion(q({
      assets: { subject: { type: "champion", name: "Ahri" } },
      presentation: { scenario_type: "champion_profile", role: "answer", timing: "reveal", spoiler: true },
    }))!;
    // Pre-reveal: subject is hidden -> placeholder card, no champion leak.
    expect(selectScenario(src, false, null).card).toBe("placeholder");
    // Post-reveal: the champion subject is revealed.
    const revealed = selectScenario(src, true, "Ahri");
    expect(revealed.card).toBe("champion_profile");
  });
});
