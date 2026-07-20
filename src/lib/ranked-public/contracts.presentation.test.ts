/**
 * F1 rich-metadata transport — contract reader for the OPTIONAL, question-safe
 * presentation field on the public question. Missing → null; unsafe/malformed →
 * dropped to null (text fallback), never a thrown round-payload rejection.
 */
import { describe, expect, it } from "vitest";
import { readPublicRound } from "./contracts";
import { publicRoundV2 } from "./fixtures";

function withPresentation(presentation: unknown) {
  const env = publicRoundV2();
  (env.payload.question as Record<string, unknown>).presentation = presentation;
  return env;
}

describe("public question presentation (optional rich metadata)", () => {
  it("parses a round with NO presentation (null)", () => {
    const view = readPublicRound(publicRoundV2());
    expect(view.question?.presentation ?? null).toBeNull();
  });

  it("parses champion / item / ability / rune / recipe / comparison metadata", () => {
    const families: Record<string, unknown>[] = [
      { assets: { subject: { type: "champion", name: "Darius" } }, presentation: { scenario_type: "champion_profile" } },
      { assets: { subject: { type: "item", name: "Doran's Shield", icon: "assets/items/1054.png" } } },
      { assets: { subject: { type: "ability", name: "Decimate", champion: "Darius" } } },
      { assets: { subject: { type: "rune", name: "Conqueror", icon: "assets/runes/Conqueror.png" } } },
      { assets: { subject: { type: "item", name: "Trinity Force" } }, known_components: ["Sheen", "Phage"] },
      { assets: { subject: { type: "comparison", subjects: [{ name: "A" }, { name: "B" }] } } },
    ];
    for (const p of families) {
      const view = readPublicRound(withPresentation(p));
      expect(view.question?.presentation).toEqual(p);
    }
  });

  it("drops unsafe presentation (names correctness) to null", () => {
    expect(readPublicRound(withPresentation({ correct_index: 2 })).question?.presentation).toBeNull();
    expect(readPublicRound(withPresentation(
      { assets: { subject: { correct_answer: "X" } } })).question?.presentation).toBeNull();
    expect(readPublicRound(withPresentation(
      { explanation: "the answer is X" })).question?.presentation).toBeNull();
  });

  it("drops malformed presentation (non-object / empty) to null", () => {
    expect(readPublicRound(withPresentation("nope")).question?.presentation).toBeNull();
    expect(readPublicRound(withPresentation([1, 2, 3])).question?.presentation).toBeNull();
    expect(readPublicRound(withPresentation({})).question?.presentation).toBeNull();
  });

  it("does not reject the whole round for a malformed optional field", () => {
    // The round still parses; only the optional field degrades.
    const view = readPublicRound(withPresentation({ correct_index: 1 }));
    expect(view.question?.options).toHaveLength(4);
  });
});
