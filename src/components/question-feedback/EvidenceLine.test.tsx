/**
 * RG3 — the evidence surface, and the two things it must never become: a
 * paragraph, and a box that appears when there is nothing to say.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceLine } from "./EvidenceLine";
import { VerdictLine } from "./VerdictLine";

describe("EvidenceLine", () => {
  it("renders nothing at all when there is no evidence", () => {
    const { container } = render(<EvidenceLine evidence={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("answer-evidence")).toBeNull();
  });

  it("shows a normal question's one-line statement", () => {
    render(<EvidenceLine evidence={{ kind: "statement", text: "Total: 1,600" }} />);
    const line = screen.getByTestId("answer-evidence");
    expect(line).toHaveAttribute("data-evidence-kind", "statement");
    expect(line).toHaveTextContent("Total: 1,600");
  });

  it("shows BOTH sides of a comparison with their authoritative values", () => {
    render(
      <EvidenceLine
        evidence={{
          kind: "comparison",
          left: { label: "Infinity Edge", valueDisplay: "3,450 gold" },
          right: { label: "Bloodthirster", valueDisplay: "3,400 gold" },
          winner: "left",
        }}
      />,
    );
    expect(screen.getByTestId("evidence-left")).toHaveTextContent("Infinity Edge");
    expect(screen.getByTestId("evidence-left-value")).toHaveTextContent("3,450 gold");
    expect(screen.getByTestId("evidence-right")).toHaveTextContent("Bloodthirster");
    expect(screen.getByTestId("evidence-right-value")).toHaveTextContent("3,400 gold");
    // The winning side is visibly the winner, and the other visibly is not.
    expect(screen.getByTestId("evidence-left")).toHaveAttribute("data-state", "winner");
    expect(screen.getByTestId("evidence-right")).toHaveAttribute("data-state", "loser");
  });

  it("renders the values EXACTLY as supplied — no re-formatting", () => {
    render(
      <EvidenceLine
        evidence={{
          kind: "comparison",
          left: { label: "Ahri", valueDisplay: "66 AD" },
          right: { label: "Garen", valueDisplay: "64 AD" },
          winner: "left",
        }}
      />,
    );
    // Not "66", not "66.0", not "66 attack damage".
    expect(screen.getByTestId("evidence-left-value").textContent).toBe("66 AD");
    expect(screen.getByTestId("evidence-right-value").textContent).toBe("64 AD");
  });

  it("keeps both rows when a card compares nothing (recognition)", () => {
    render(
      <EvidenceLine
        evidence={{
          kind: "comparison",
          left: { label: "Ashe", valueDisplay: null },
          right: { label: "Vayne", valueDisplay: null },
          winner: "right",
        }}
      />,
    );
    // The value slot is mounted and empty rather than absent, so the strip is
    // the same shape whether the card compared a number or not.
    expect(screen.getByTestId("evidence-left-value").textContent).toBe("");
    expect(screen.getByTestId("evidence-right")).toHaveAttribute("data-state", "winner");
  });

  it("offers no control of any kind — no Next, no Continue, no toggle", () => {
    render(
      <EvidenceLine
        evidence={{
          kind: "comparison",
          left: { label: "A", valueDisplay: "1g" },
          right: { label: "B", valueDisplay: "2g" },
          winner: "right",
        }}
      />,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("VerdictLine", () => {
  it.each([
    ["correct", "Correct!"],
    ["incorrect", "Incorrect"],
    ["timeout", "Time!"],
  ] as const)("says %s as %s", (verdict, headline) => {
    render(<VerdictLine verdict={verdict} />);
    const line = screen.getByTestId("answer-verdict");
    expect(line).toHaveAttribute("data-verdict", verdict);
    expect(line).toHaveTextContent(headline);
  });

  it("draws nothing when the server made no ruling", () => {
    const { container } = render(<VerdictLine verdict={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("carries a short qualifier without wrapping the headline", () => {
    render(<VerdictLine verdict="incorrect" note="score locked for this question" />);
    expect(screen.getByTestId("answer-verdict-note"))
      .toHaveTextContent("score locked for this question");
  });
});
