/**
 * POINT1 corrective — the per-card plate, in the arena's ONE result slot.
 *
 * The point of these is the vocabulary. Meta Reflex is an ACTIVE points-scored
 * module, and the plate it resolves in is the same one an hp round resolves in,
 * so the thing worth pinning is that nothing routes a card through the damage
 * branch: this component is handed no combatant, states the module's own +1/+0
 * rule applied to the SERVER's verdict, and says nothing about the opponent.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardResultBeat } from "./CardResultBeat";
import type { ArenaCardBeat } from "@/lib/ranked-core/cardBeat";

/** Every word an active points module's result surface must never say. */
export const COMBAT_VOCABULARY = [
  "DAMAGE", "DEALT", "TAKEN", "ABSORBED", "MITIGATED", "DMG", " HP",
];

const beat = (over: Partial<ArenaCardBeat> = {}): ArenaCardBeat => ({
  outcome: "correct", cardNumber: 1, challengeIndex: 0, roundNumber: 4, ...over,
});

function plate(over: Partial<ArenaCardBeat> = {}) {
  render(<CardResultBeat beat={beat(over)} />);
  return screen.getByTestId("ranked-card-beat");
}

describe("a correct card", () => {
  it("says CORRECT and +1 POINT", () => {
    const el = plate();
    expect(el).toHaveAttribute("data-outcome", "correct");
    expect(el).toHaveTextContent("CORRECT");
    expect(el).toHaveTextContent("+1 POINT");
  });

  it("takes the rewarding tone and names the card it describes", () => {
    const el = plate({ cardNumber: 3, challengeIndex: 2 });
    expect(el).toHaveAttribute("data-kind", "correct");
    expect(el).toHaveAttribute("data-challenge-index", "2");
    expect(el).toHaveTextContent("C3");
  });
});

describe("an incorrect card", () => {
  it("says INCORRECT and +0 POINTS", () => {
    const el = plate({ outcome: "incorrect" });
    expect(el).toHaveAttribute("data-outcome", "incorrect");
    expect(el).toHaveTextContent("INCORRECT");
    expect(el).toHaveTextContent("+0 POINTS");
  });

  /**
   * A Meta Reflex card is not zero-sum — both players can be right on the same
   * card — so there is no award to transfer and nothing to say about them.
   */
  it("never mentions the opponent", () => {
    expect(plate({ outcome: "incorrect" }).textContent ?? "")
      .not.toContain("OPPONENT");
  });
});

describe("a card that ran out of time", () => {
  it("reads as a clock expiry, not as a wrong answer", () => {
    const el = plate({ outcome: "timeout" });
    expect(el).toHaveAttribute("data-kind", "timed-out");
    expect(el).toHaveTextContent("TIMED OUT");
    expect(el).toHaveTextContent("+0 POINTS");
  });

  it("treats an unanswered card the same way", () => {
    expect(plate({ outcome: "unanswered" }))
      .toHaveAttribute("data-kind", "timed-out");
  });
});

describe("the vocabulary is points, never combat", () => {
  it.each(["correct", "incorrect", "timeout", "unanswered"] as const)(
    "says no damage word on a %s card", (outcome) => {
      const text = (plate({ outcome }).textContent ?? "").toUpperCase();
      for (const banned of COMBAT_VOCABULARY) {
        expect(text).not.toContain(banned);
      }
    });

  /**
   * The module's bonuses belong to the BLOCK and are stated by the block's own
   * beat. A card that happened to complete a perfect block must not claim them.
   */
  it("never states a module-level bonus, even on the fifth card", () => {
    const text = plate({ cardNumber: 5, challengeIndex: 4 }).textContent ?? "";
    for (const banned of ["+2", "PERFECT", "BONUS", "FIRST"]) {
      expect(text).not.toContain(banned);
    }
  });
});
