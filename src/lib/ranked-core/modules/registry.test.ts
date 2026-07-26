import { describe, expect, it } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import {
  getModuleRenderer,
  registeredModuleIds,
  rendererForSegment,
  quizModule,
} from "./registry";

describe("ranked module renderer registry (Phase A)", () => {
  it("registers only the quiz renderer", () => {
    expect(registeredModuleIds()).toEqual(["quiz"]);
  });

  it("has no Item Cost Duel renderer yet", () => {
    expect(getModuleRenderer("item_cost_duel")).toBeNull();
    expect(registeredModuleIds()).not.toContain("item_cost_duel");
  });

  it("resolves the quiz renderer by id", () => {
    expect(getModuleRenderer("quiz")).toBe(quizModule);
  });

  it("falls back to quiz when no segment discriminator is present", () => {
    // v2 payloads and legacy rounds carry no `segment` block.
    expect(rendererForSegment(null)).toBe(quizModule);
    expect(rendererForSegment(undefined)).toBe(quizModule);
    expect(getModuleRenderer(null)).toBe(quizModule);
    expect(getModuleRenderer(undefined)).toBe(quizModule);
  });

  it("resolves a quiz segment from a parsed payload", () => {
    const body = publicRoundV2();
    (body.payload as Record<string, unknown>).segment = {
      module_id: "quiz", module_version: 1,
      challenge_count: 1, challenge_index: 0,
    };
    const parsed = readPublicRound(body);
    expect(rendererForSegment(parsed.segment)).toBe(quizModule);
  });

  it("fails closed on an unknown module instead of rendering a quiz input", () => {
    const renderer = rendererForSegment({
      moduleId: "item_cost_duel", moduleVersion: 1,
      challengeCount: 5, challengeIndex: 0,
    });
    // Null, NOT quizModule: a mismatched input shape must never be submitted
    // into a rated match.
    expect(renderer).toBeNull();
  });

  it("exposes a stable renderer identity", () => {
    expect(quizModule.moduleId).toBe("quiz");
    expect(quizModule.moduleVersion).toBe(1);
  });
});
