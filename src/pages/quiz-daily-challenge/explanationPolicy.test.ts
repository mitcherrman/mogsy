/**
 * THE EXPLANATION DISPLAY POLICY (ARENA1 Phase 2 §6).
 *
 * Every fixture below is a REAL row shape from the live question bank — the
 * template restatements the generators produce, and the derivations the
 * cooldown family produces — because the policy exists to separate exactly
 * those two populations and a hand-invented sentence would not test that.
 */

import { describe, expect, it } from "vitest";
import { displayExplanation, explanationIsInformative } from "./explanationPolicy";

const shown = (explanation: string, prompt: string, answer: string | null) =>
  expect(explanationIsInformative(explanation, prompt, answer)).toBe(true);
const hidden = (explanation: string, prompt: string, answer: string | null) =>
  expect(explanationIsInformative(explanation, prompt, answer)).toBe(false);

describe("a restatement of the question and the answer is not worth a beat", () => {
  it("hides an item stat that simply repeats the revealed value", () => {
    hidden("Zhonya's Hourglass gives 105 Ability Power.",
      "How much Ability Power does Zhonya's Hourglass give?", "105");
  });

  it("hides a recognition card naming the thing that was just revealed", () => {
    hidden("This W icon belongs to Malzahar.", "Which champion owns this W ability?",
      "Malzahar");
  });

  it("hides a cooldown lookup with no working shown", () => {
    hidden("Yasuo W - Wind Wall has a rank 1 cooldown of 25 seconds.",
      "What is the rank 1 cooldown of Yasuo W - Wind Wall?", "25 seconds");
  });

  it("hides a component restatement, even a two-sentence one", () => {
    hidden("Duskblade of Draktharr builds from Caulfield's Warhammer and Serrated Dirk. "
      + "The missing component here is Serrated Dirk.",
    "Duskblade of Draktharr builds from Caulfield's Warhammer, and what other component?",
    "Serrated Dirk");
  });

  it("hides a stat list that repeats the answer verbatim", () => {
    hidden("Shurelya's Battlesong gives Ability Haste, Ability Power, Move Speed, Mana Regen.",
      "What stats does Shurelya's Battlesong give?",
      "Ability Haste, Ability Power, Move Speed, Mana Regen");
  });

  it("hides an empty, blank or absent explanation without inventing one", () => {
    hidden("", "Anything?", "Anything");
    hidden("   ", "Anything?", "Anything");
    expect(explanationIsInformative(null, "Anything?", "Anything")).toBe(false);
    expect(explanationIsInformative(undefined, "Anything?", "Anything")).toBe(false);
  });
});

describe("an explanation that adds objective information earns its place", () => {
  it("shows a worked formula", () => {
    shown("Thresh R - The Box has a base cooldown of 80 seconds at rank 3. Spirit "
      + "Visage grants 10 ability haste, so the cooldown is 80 × 100 / (100 + 10) "
      + "= 72.73s, displayed as 72.7 seconds.",
    "What is the cooldown of Thresh R - The Box at level 16 with rank 3 R and "
      + "Spirit Visage?", "72.7 seconds");
  });

  it("shows a supporting quantity the question and answer never state", () => {
    shown("Senna is ranged with 600 attack range.", "What attack type is Senna?",
      "Ranged");
  });

  it("shows an explicit causal or exception clause", () => {
    shown("Grievous Wounds does not reduce shields, only healing.",
      "What does Grievous Wounds reduce?", "Healing");
    shown("Ability haste caps at 500 for a single ability.",
      "Is there a limit on ability haste?", "Yes");
  });

  it("does not count a connective the PROMPT itself used", () => {
    // "does not" is the question's own word here, so its reappearance is not
    // evidence the explanation added anything.
    hidden("Doran's Ring does not build into anything.",
      "Which starter item does not build into anything?", "Doran's Ring");
  });
});

describe("the policy is a filter and never a writer", () => {
  it("returns the server's sentence byte-for-byte, or null", () => {
    const derivation = "The cooldown is 80 × 100 / (100 + 10) = 72.73s.";
    expect(displayExplanation(derivation, "q", "a")).toBe(derivation);
    expect(displayExplanation("Rod of Ages gives 45 Ability Power.",
      "How much Ability Power does Rod of Ages give?", "45")).toBeNull();
  });

  it("trims surrounding whitespace and nothing else", () => {
    expect(displayExplanation("  Senna is ranged with 600 attack range.  ",
      "What attack type is Senna?", "Ranged"))
      .toBe("Senna is ranged with 600 attack range.");
  });

  it("survives a card with no revealed label at all", () => {
    // A Meta Reflex recognition side carries no label; the policy must still
    // decide, and must not throw reaching for one.
    expect(() => explanationIsInformative("This icon belongs to Elise.",
      "Which champion owns this ultimate ability?", null)).not.toThrow();
    hidden("This icon belongs to Elise.", "Which champion owns this ultimate ability?",
      null);
  });
});
