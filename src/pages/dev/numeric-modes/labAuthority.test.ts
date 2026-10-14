import { describe, expect, it } from "vitest";
import { createLabAuthority, LAB_SOURCE, quantizeHalfUp } from "./labAuthority";

const auth = createLabAuthority();
const byId = (id: string) => auth.rounds.find((r) => r.id === id)!;

describe("NUM-LAB stand-in authority", () => {
  it("serves public rounds with no answer-shaped field", () => {
    expect(auth.rounds.length).toBeGreaterThanOrEqual(4);
    for (const r of auth.rounds) {
      const json = JSON.stringify(r);
      for (const key of ["value\"", "canonical", "answer", "evidence", "band", "decimals", "rule"]) {
        expect(json, `${r.id} ${key}`).not.toContain(key);
      }
    }
  });

  it("labels every fixture synthetic and names no real subject", () => {
    for (const r of auth.rounds) {
      expect(JSON.stringify(r)).toMatch(/synthetic|Fixture/i);
    }
    expect(LAB_SOURCE).toMatch(/not a game fact/);
    expect(LAB_SOURCE).toMatch(/not authoritatively graded/);
  });

  it("quantizes ROUND_HALF_UP like precision.py", () => {
    expect(quantizeHalfUp(2.5, 0)).toBe(3);
    expect(quantizeHalfUp(3.5, 0)).toBe(4);
    expect(quantizeHalfUp(12.45, 1)).toBe(12.5);
    expect(quantizeHalfUp(-2.5, 0)).toBe(-3);
  });

  it("grades exact, within and outside, and reports the baseline rule", () => {
    const r = byId("sd-health");
    const exact = auth.grade(r, { selected: 645 });
    expect(exact.reveal.verdict).toBe("exact");
    expect(exact.reveal.isCorrect).toBe(true);
    expect(exact.baseline.baselineCorrect).toBe(true);
    expect(exact.reveal.canonicalDisplay).toBe("645 HP");
    expect(exact.reveal.source).toBe(LAB_SOURCE);

    // ±5% of 645 = ±32.25 → 612.75–677.25.
    const within = auth.grade(r, { selected: 675 });
    expect(within.reveal.verdict).toBe("within");
    expect(within.reveal.isCorrect).toBe(true);
    expect(within.baseline.baselineCorrect).toBe(false);
    expect(within.baseline.summary).toMatch(/DISAGREE/);
    expect(within.reveal.deltaDisplay).toBe("+30 HP · +4.7%");

    const outside = auth.grade(r, { selected: 680 });
    expect(outside.reveal.verdict).toBe("outside");
    expect(outside.reveal.isCorrect).toBe(false);
    expect(outside.baseline.summary).not.toMatch(/DISAGREE/);
  });

  it("treats an exact-only round as exact-or-wrong", () => {
    const r = byId("sd-range");
    expect(auth.grade(r, { selected: 550 }).reveal.verdict).toBe("exact");
    const miss = auth.grade(r, { selected: 575 });
    expect(miss.reveal.verdict).toBe("outside");
    expect(miss.reveal.band).toBeNull();
  });

  it("checks the combat fixtures' own arithmetic", () => {
    // 320 × 100 / 180 = 177.78 → shown 178; 240 × 100 / 250 = 96.
    expect(auth.grade(byId("ce-ability"), { selected: 178 }).reveal.verdict).toBe("exact");
    expect(auth.grade(byId("ce-ability"), { selected: 177.78 }).reveal.verdict).toBe("exact");
    expect(auth.grade(byId("ce-auto"), { selected: 96 }).reveal.verdict).toBe("exact");
    expect(auth.grade(byId("ce-auto"), { selected: 104 }).reveal.verdict).toBe("within");
    expect(auth.grade(byId("ce-auto"), { selected: 120 }).reveal.verdict).toBe("outside");
  });

  it("produces capture guesses that land where they say", () => {
    for (const r of auth.rounds) {
      expect(auth.grade(r, { selected: auth.sampleGuess(r, "exact") }).reveal.verdict).toBe("exact");
      expect(auth.grade(r, { selected: auth.sampleGuess(r, "outside") }).reveal.verdict).toBe("outside");
      if (r.id !== "sd-range") {
        expect(auth.grade(r, { selected: auth.sampleGuess(r, "within") }).reveal.verdict).toBe("within");
      }
    }
  });
});
