import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_TIERS,
  isDifficultyTier,
  resolveDifficulty,
  resolveQuestionDifficulty,
} from "./difficulty";

describe("difficulty tiers", () => {
  it("exposes exactly iron/gold/diamond", () => {
    expect([...DIFFICULTY_TIERS]).toEqual(["iron", "gold", "diamond"]);
  });

  it("maps tiers to the correct difficulty words and emblem paths", () => {
    expect(resolveDifficulty("iron")).toMatchObject({
      rankLabel: "Iron",
      difficultyLabel: "Easy",
      emblemPath: "assets/ranks/large/iron.png",
      smallEmblemPath: "assets/ranks/small/iron.png",
    });
    expect(resolveDifficulty("gold")).toMatchObject({ rankLabel: "Gold", difficultyLabel: "Medium" });
    expect(resolveDifficulty("diamond")).toMatchObject({ rankLabel: "Diamond", difficultyLabel: "Hard" });
  });

  it("is case-insensitive and trims", () => {
    expect(resolveDifficulty("  GOLD ")?.tier).toBe("gold");
  });

  it("returns null for unknown/absent tokens", () => {
    for (const bad of ["", "silver", "platinum", undefined, null, 3]) {
      expect(resolveDifficulty(bad as unknown)).toBeNull();
    }
  });

  it("isDifficultyTier is a strict guard", () => {
    expect(isDifficultyTier("gold")).toBe(true);
    expect(isDifficultyTier("Gold")).toBe(false); // guard is exact; resolve normalizes
    expect(isDifficultyTier("bronze")).toBe(false);
  });
});

describe("resolveQuestionDifficulty precedence", () => {
  it("uses the explicit override first", () => {
    expect(resolveQuestionDifficulty({ content_difficulty: "iron" }, "diamond")?.tier).toBe("diamond");
  });
  it("falls back to per-question metadata", () => {
    expect(resolveQuestionDifficulty({ content_difficulty: "gold" })?.tier).toBe("gold");
  });
  it("returns null when neither is present (no implicit assignment)", () => {
    expect(resolveQuestionDifficulty({})).toBeNull();
    expect(resolveQuestionDifficulty(undefined)).toBeNull();
  });
  it("returns null for an invalid override rather than guessing", () => {
    expect(resolveQuestionDifficulty({ content_difficulty: "gold" }, "bogus")).toBeNull();
  });
});
