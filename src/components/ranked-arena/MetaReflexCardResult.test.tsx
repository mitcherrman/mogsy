/**
 * RG3 — the Meta Reflex per-card resolution.
 *
 * The claims here are the product ones: after every card, whatever ended it,
 * the player is told the verdict and BOTH compared values, and the winning side
 * is unmistakable. Plus the one architectural claim that makes it possible —
 * this strip never sits on top of the live card, because the live card's clock
 * is already running.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetaReflexCardResult } from "./MetaReflexCardResult";
import type { SettledCardReveal } from "@/lib/ranked-public/contracts";

const reveal = (over: Partial<SettledCardReveal> = {}): SettledCardReveal => ({
  challengeIndex: 1,
  kind: "magnitude",
  entityKind: "item",
  outcome: "correct",
  selectedCardId: "c1:left",
  correctCardId: "c1:left",
  left: { label: "Infinity Edge", valueDisplay: "3,450 gold" },
  right: { label: "Bloodthirster", valueDisplay: "3,400 gold" },
  ...over,
});

const show = (r: SettledCardReveal | null) =>
  render(<MetaReflexCardResult reveal={r} cardNumber={r ? r.challengeIndex + 1 : null} />);

describe("MetaReflexCardResult", () => {
  it("CORRECT: verdict, both values, and the picked side lit as the winner", () => {
    show(reveal());
    expect(screen.getByTestId("answer-verdict")).toHaveAttribute("data-verdict", "correct");
    expect(screen.getByTestId("evidence-left")).toHaveTextContent("Infinity Edge");
    expect(screen.getByTestId("evidence-left-value")).toHaveTextContent("3,450 gold");
    expect(screen.getByTestId("evidence-right-value")).toHaveTextContent("3,400 gold");
    expect(screen.getByTestId("evidence-left")).toHaveAttribute("data-state", "winner");
    expect(screen.getByTestId("mr-card-result-pick")).toHaveAttribute("data-picked-side", "left");
  });

  it("INCORRECT: the chosen side loses, the other wins, both values still show", () => {
    show(reveal({ outcome: "incorrect", selectedCardId: "c1:right" }));
    expect(screen.getByTestId("answer-verdict")).toHaveAttribute("data-verdict", "incorrect");
    expect(screen.getByTestId("evidence-right")).toHaveAttribute("data-state", "loser");
    expect(screen.getByTestId("evidence-left")).toHaveAttribute("data-state", "winner");
    expect(screen.getByTestId("mr-card-result-pick")).toHaveTextContent(/right/i);
    expect(screen.getByTestId("evidence-right-value")).toHaveTextContent("3,400 gold");
  });

  it("TIMEOUT: says Time, reveals the winner and both values, marks no pick", () => {
    show(reveal({ outcome: "timeout", selectedCardId: null }));
    expect(screen.getByTestId("answer-verdict")).toHaveTextContent("Time!");
    expect(screen.getByTestId("evidence-left")).toHaveAttribute("data-state", "winner");
    expect(screen.getByTestId("evidence-right-value")).toHaveTextContent("3,400 gold");
    expect(screen.queryByTestId("mr-card-result-pick")).toBeNull();
  });

  it("renders the values EXACTLY as the server formatted them", () => {
    show(reveal({
      left: { label: "Ahri", valueDisplay: "66 AD" },
      right: { label: "Garen", valueDisplay: "64 AD" },
    }));
    expect(screen.getByTestId("evidence-left-value").textContent).toBe("66 AD");
    expect(screen.getByTestId("evidence-right-value").textContent).toBe("64 AD");
  });

  it("names both sides of a recognition card, with no value to compare", () => {
    show(reveal({
      kind: "recognition",
      left: { label: "Ashe", valueDisplay: null },
      right: { label: "Vayne", valueDisplay: null },
      correctCardId: "c1:right",
      selectedCardId: "c1:right",
    }));
    expect(screen.getByTestId("evidence-right")).toHaveTextContent("Vayne");
    expect(screen.getByTestId("evidence-left-value").textContent).toBe("");
    expect(screen.getByTestId("evidence-right")).toHaveAttribute("data-state", "winner");
  });

  it("says a classification card's property out loud on both sides", () => {
    show(reveal({
      kind: "classification",
      left: { label: "Ahri", valueDisplay: "Ranged" },
      right: { label: "Garen", valueDisplay: "Melee" },
    }));
    expect(screen.getByTestId("evidence-left-value")).toHaveTextContent("Ranged");
    expect(screen.getByTestId("evidence-right-value")).toHaveTextContent("Melee");
  });

  it("draws nothing before the first card settles", () => {
    const { container } = show(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers no control, so the block's own clock stays the only pacing", () => {
    show(reveal());
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("does not cover the live card — it is an ordinary flow sibling", () => {
    show(reveal());
    const strip = screen.getByTestId("mr-card-result");
    // No fixed/absolute positioning and no overlay: the card above it is
    // already on its own six-second clock, and nothing here may sit on it.
    expect(strip.className).not.toMatch(/\b(fixed|absolute|inset-0)\b/);
  });
});
