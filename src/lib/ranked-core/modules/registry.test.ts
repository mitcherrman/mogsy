import { describe, expect, it } from "vitest";

import { LEGACY_SEGMENT, readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import {
  getModuleRenderer,
  itemCostDuelModule,
  metaReflexModule,
  registeredModuleIds,
  rendererForSegment,
  quizModule,
} from "./registry";

describe("ranked module renderer registry", () => {
  it("registers the quiz and Item Cost Duel renderers", () => {
    expect(registeredModuleIds()).toEqual(["item_cost_duel", "quiz"]);
  });

  it("resolves each renderer by id", () => {
    expect(getModuleRenderer("quiz")).toBe(quizModule);
    expect(getModuleRenderer("item_cost_duel")).toBe(itemCostDuelModule);
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

  it("resolves an Item Cost Duel segment from a parsed payload", () => {
    const body = publicRoundV2();
    (body.payload as Record<string, unknown>).segment = {
      module_id: "item_cost_duel", module_version: 1,
      challenge_count: 5, challenge_index: 0, phase: "ability",
    };
    const parsed = readPublicRound(body);
    expect(rendererForSegment(parsed.segment)).toBe(itemCostDuelModule);
  });

  it("fails closed on an unknown module instead of rendering a quiz input", () => {
    // The invariant Phase A pinned with `item_cost_duel` — now that the module
    // is registered, it is pinned with a module that genuinely does not exist.
    const renderer = rendererForSegment({
      ...LEGACY_SEGMENT, moduleId: "not_a_real_module", challengeCount: 5,
    });
    // Null, NOT quizModule: a mismatched input shape must never be submitted
    // into a rated match.
    expect(renderer).toBeNull();
    expect(getModuleRenderer("not_a_real_module")).toBeNull();
  });

  it("exposes a stable renderer identity", () => {
    expect(quizModule.moduleId).toBe("quiz");
    expect(quizModule.moduleVersion).toBe(1);
    expect(itemCostDuelModule.moduleId).toBe("item_cost_duel");
    expect(itemCostDuelModule.moduleVersion).toBe(1);
  });

  it("declares which module owns its own submission flow", () => {
    // The shell reads this instead of branching on the module id.
    expect(quizModule.ownsSubmission).toBe(false);
    expect(itemCostDuelModule.ownsSubmission).toBe(true);
    expect(metaReflexModule.ownsSubmission).toBe(true);
  });

  // ------------------------------------------------ version dispatch (P7)

  it("splits item_cost_duel by VERSION, because the id spans two contracts", () => {
    // v1–v3: five item pairs answered with an item_id.
    expect(getModuleRenderer("item_cost_duel", 1)).toBe(itemCostDuelModule);
    expect(getModuleRenderer("item_cost_duel", 3)).toBe(itemCostDuelModule);
    // v4+: five mixed Meta Reflex cards answered with a positional card_id.
    expect(getModuleRenderer("item_cost_duel", 4)).toBe(metaReflexModule);
    expect(getModuleRenderer("item_cost_duel", 5)).toBe(metaReflexModule);
  });

  it("resolves a v4 segment from a parsed payload to the Meta Reflex renderer", () => {
    const body = publicRoundV2();
    (body.payload as Record<string, unknown>).segment = {
      module_id: "item_cost_duel", module_version: 4,
      challenge_count: 5, challenge_index: 0, phase: "challenges",
    };
    const parsed = readPublicRound(body);
    expect(rendererForSegment(parsed.segment)).toBe(metaReflexModule);
    // The regression this guards: resolving v4 to the item renderer would put
    // clickable cards on screen whose answer the server refuses outright.
    expect(rendererForSegment(parsed.segment)).not.toBe(itemCostDuelModule);
  });

  it("keeps serving every version of a module whose contract never forked", () => {
    expect(getModuleRenderer("quiz", 1)).toBe(quizModule);
    expect(getModuleRenderer("quiz", 9)).toBe(quizModule);
  });
});
