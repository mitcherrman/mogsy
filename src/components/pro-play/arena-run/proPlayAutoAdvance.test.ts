/**
 * W26Q-UX — the auto-advance hold: pure rules.
 */
import { describe, expect, it } from "vitest";
import { REVEAL_HOLD_EVIDENCE_MS } from "@/lib/ranked-core/pacing";
import type { ProPlayRevealData } from "@/lib/pro-play/arena";
import {
  PRO_PLAY_READ_BASE_MS,
  PRO_PLAY_READ_MAX_MS,
  PRO_PLAY_READ_MS_PER_CHAR,
  proPlayExplanationDensity,
  proPlayRevealHoldMs,
  proPlayRevealStagingMs,
} from "./proPlayAutoAdvance";

const reveal = (explanation: string): ProPlayRevealData => ({
  isCorrect: true,
  replayed: false,
  selectedAnswer: "A",
  correctAnswer: "A",
  selectedOptionId: "0",
  correctOptionId: "0",
  explanation,
  evidence: null,
});

describe("proPlayRevealHoldMs", () => {
  it("is null with no graded reveal: nothing advances without one", () => {
    expect(proPlayRevealHoldMs(null, 4, false)).toBeNull();
    expect(proPlayRevealHoldMs(null, 4, true)).toBeNull();
  });

  it("starts the reading clock after the staged reveal has drawn", () => {
    const text = "x".repeat(60);
    const reading = Math.max(REVEAL_HOLD_EVIDENCE_MS, PRO_PLAY_READ_BASE_MS + 60 * PRO_PLAY_READ_MS_PER_CHAR);
    expect(proPlayRevealHoldMs(reveal(text), 4, false)).toBe(proPlayRevealStagingMs(4, false) + reading);
    expect(proPlayRevealHoldMs(reveal(text), 4, true)).toBe(reading);
  });

  it("never gives less than the evidence beat, and is bounded above", () => {
    expect(proPlayRevealHoldMs(reveal(""), 4, true)).toBe(REVEAL_HOLD_EVIDENCE_MS);
    expect(proPlayRevealHoldMs(reveal("x".repeat(5000)), 4, true)).toBe(PRO_PLAY_READ_MAX_MS);
  });

  it("reads the sentence, not the provenance tail the footer moves into Source", () => {
    const sentence = "Karmine Corp beat MVK Esports 3–0 in the Worlds 2026 Play-In final.";
    const withTail = `${sentence} (authority revision 12; policy v3)`;
    expect(proPlayRevealHoldMs(reveal(withTail), 4, true)).toBe(proPlayRevealHoldMs(reveal(sentence), 4, true));
  });

  it("scales the staging with the number of options, and drops it under reduced motion", () => {
    expect(proPlayRevealStagingMs(4, false)).toBeGreaterThan(proPlayRevealStagingMs(2, false));
    expect(proPlayRevealStagingMs(4, true)).toBe(0);
  });
});

describe("proPlayExplanationDensity", () => {
  it("tiers by length", () => {
    expect(proPlayExplanationDensity("x".repeat(100))).toBe("normal");
    expect(proPlayExplanationDensity("x".repeat(101))).toBe("medium");
    expect(proPlayExplanationDensity("x".repeat(151))).toBe("long");
    expect(proPlayExplanationDensity("x".repeat(221))).toBe("dense");
    expect(proPlayExplanationDensity(null)).toBe("normal");
  });
});
