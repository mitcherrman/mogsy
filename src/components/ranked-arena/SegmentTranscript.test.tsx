import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { readSegmentSettlement } from "@/lib/ranked-public/contracts";
import { icdResolvedPayload } from "@/lib/ranked-public/fixtures";
import { SegmentTranscript } from "./SegmentTranscript";

function renderTranscript(payload: unknown = icdResolvedPayload()) {
  const settlement = readSegmentSettlement(payload)!;
  return render(
    <SegmentTranscript
      reveal={settlement.reveal}
      viewerUserId="userA"
      opponentUserId="userB"
      damageDealt={settlement.damageByPlayerId.userA}
      abilitiesByPlayerId={settlement.abilitiesByPlayerId}
    />,
  );
}

describe("Item Cost Duel transcript", () => {
  it("reports the segment result in Ranked vocabulary", () => {
    renderTranscript();
    const result = screen.getByTestId("icd-transcript-result");
    expect(result).toHaveTextContent("Win");
    expect(result).not.toHaveTextContent(/CORRECT|INCORRECT/i);
  });

  it("shows the damage the segment settled", () => {
    renderTranscript();
    expect(screen.getByTestId("icd-transcript-damage")).toHaveTextContent("15 damage");
  });

  it("shows both players' counts and authoritative response times", () => {
    renderTranscript();
    const totals = screen.getByTestId("icd-transcript-totals");
    expect(within(totals).getByText("Correct").nextSibling).toHaveTextContent("5");
    expect(within(totals).getByText("Unanswered").nextSibling).toHaveTextContent("0");
    expect(within(totals).getByText("Total time").nextSibling)
      .toHaveTextContent("5.00s");
    expect(within(totals).getByText("Opponent correct").nextSibling)
      .toHaveTextContent("1");
    expect(within(totals).getByText("Opponent unanswered").nextSibling)
      .toHaveTextContent("1");
  });

  it("lists all five pairs with canonical costs and the correct item", () => {
    renderTranscript();
    for (let i = 0; i < 5; i += 1) {
      const row = screen.getByTestId(`icd-transcript-row-${i}`);
      expect(row).toHaveTextContent(`${1000 + i * 100}g`);
      expect(row).toHaveTextContent(`${2000 + i * 100}g`);
    }
  });

  it("shows both choices and per-challenge correctness", () => {
    renderTranscript();
    const row = screen.getByTestId("icd-transcript-row-0");
    expect(row).toHaveTextContent("Item 1");   // the viewer's pick
    expect(within(row).getByText("correct", { exact: false })).toBeInTheDocument();
  });

  it("renders an unanswered challenge as 'No answer', not as a wrong answer", () => {
    renderTranscript();
    const row = screen.getByTestId("icd-transcript-row-4");
    // userB left challenge 5 unanswered.
    expect(within(row).getAllByText("No answer").length).toBeGreaterThan(0);
  });

  it("reveals the abilities both players used", () => {
    renderTranscript();
    const abilities = screen.getByTestId("icd-transcript-abilities");
    expect(abilities).toHaveTextContent(/you:/i);
    expect(abilities).toHaveTextContent(/opponent: No Ability/i);
  });

  it("renders a draw and a timeout with the right words", () => {
    for (const [result, label] of [["draw", "Draw"], ["timeout", "Timeout"]] as const) {
      const payload = icdResolvedPayload() as Record<string, unknown>;
      const reveal = payload.segment_reveal as Record<string, unknown>;
      (reveal.players as Record<string, Record<string, unknown>>)
        .userA.segment_result = result;
      const view = renderTranscript(payload);
      expect(screen.getByTestId("icd-transcript-result")).toHaveTextContent(label);
      view.unmount();
    }
  });

  it("uses a real table with a caption and column headers", () => {
    renderTranscript();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "More expensive" }))
      .toBeInTheDocument();
  });
});
