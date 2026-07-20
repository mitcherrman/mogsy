/**
 * F1 rich-metadata transport — Ranked controller projection seam. The live
 * match projects an optional ScenarioSource from the public round; null when the
 * question is text-only, populated (question-safe) when it carries metadata.
 */
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { projectQuestion, projectScenarioSource } from "./rankedViews";

function roundWith(presentation?: unknown) {
  const env = publicRoundV2();
  if (presentation !== undefined) {
    (env.payload.question as Record<string, unknown>).presentation = presentation;
  }
  return readPublicRound(env);
}

describe("projectScenarioSource (controller seam)", () => {
  it("returns null for a text-only question (unchanged behaviour)", () => {
    const pub = roundWith();
    expect(projectScenarioSource(pub)).toBeNull();
    // The neutral question view is still projected as before.
    expect(projectQuestion(pub)?.options).toHaveLength(4);
  });

  it("projects a question-safe ScenarioSource when metadata is present", () => {
    const pub = roundWith({ assets: { subject: { type: "champion", name: "Darius" } } });
    const src = projectScenarioSource(pub);
    expect(src).not.toBeNull();
    expect(JSON.stringify(src)).not.toMatch(/correct/i);
  });

  it("returns null when a completed round carries no question", () => {
    const over = readPublicRound(publicRoundV2(true));
    expect(projectScenarioSource(over)).toBeNull();
  });
});
