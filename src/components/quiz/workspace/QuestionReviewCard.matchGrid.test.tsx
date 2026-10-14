// MG-P3 — Review Match for a `match` round, from a REAL P2 review payload
// (`GET /api/ranked/matches/{id}/review` against `match-grid/p2-module`,
// captured during the MG-P3 playtest: round 1 timed out, round 2 locked with
// one rune under the wrong tree, round 3 an exact board).
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import review from "@/lib/ranked-public/__fixtures__/matchGridP2ReviewCapture.json";
import { readMatchReview } from "@/lib/ranked-public/contracts";
import { questionOutcome } from "./questionIcons";
import QuestionReviewCard from "./QuestionReviewCard";
import { hasModuleSigil } from "./ModuleSigil";
import { moduleSubject, reviewRoundQuestionTally } from "@/pages/quiz-ranked/rankedResultsModel";

const rounds = () => readMatchReview(JSON.parse(JSON.stringify(review))).rounds;

describe("Match Grid review (real P2 payload)", () => {
  it("parses every frozen round as `match`", () => {
    const rs = rounds();
    expect(rs.map((r) => r.kind)).toEqual(["match", "match", "match"]);
    expect(rs.map((r) => r.match?.outcome)).toEqual(["timeout", "incorrect", "correct"]);
    expect(rs[1].match?.matched).toBe(7);
    expect(rs[1].match?.entities).toHaveLength(8);
  });

  it("renders the frozen board: own seal, canonical seal, mark and slot, with no lookup", () => {
    const round = rounds()[1];
    render(<QuestionReviewCard round={round} position={2} total={3} />);
    expect(screen.getByText(/Match Grid/)).toBeInTheDocument();
    expect(screen.getByTestId("review-match-count")).toHaveTextContent("7 of 8 relationships correct");
    const items = screen.getAllByTestId("review-match-entity");
    expect(items).toHaveLength(8);
    const wrong = items.filter((li) => li.getAttribute("data-mark") === "false");
    expect(wrong).toHaveLength(1);
    const m = round.match!;
    const id = wrong[0].getAttribute("data-entity")!;
    const label = m.entities.find((e) => e.entityId === id)!.label;
    const mine = m.groups.find((g) => g.groupId === m.viewerAssignments!.find((a) => a.entityId === id)!.groupId)!.label;
    const home = m.groups.find((g) => g.groupId === m.canonicalAssignments!.find((a) => a.entityId === id)!.groupId)!.label;
    expect(wrong[0]).toHaveTextContent(label);
    expect(within(wrong[0]).getByTestId("review-match-line")).toHaveTextContent(`You: ${mine} → ${home}`);
    // Every slot word comes from the frozen fact.
    for (const li of items) {
      const fact = m.entityFacts![li.getAttribute("data-entity")!];
      expect(li).toHaveTextContent(fact.runeType === "keystone" ? "Keystone" : "Minor rune");
    }
  });

  it("a timed-out round says so and shows no player board", () => {
    render(<QuestionReviewCard round={rounds()[0]} position={1} total={3} />);
    expect(screen.getByText("You did not lock in a board.")).toBeInTheDocument();
    for (const li of screen.getAllByTestId("review-match-entity")) {
      expect(within(li).getByTestId("review-match-line")).toHaveTextContent(/^Not seated →/);
    }
  });

  it("timeline / results seams use the backend's outcome, one question per board", () => {
    const [timeout, wrong, right] = rounds();
    expect([timeout, wrong, right].map(questionOutcome)).toEqual(["unanswered", "incorrect", "correct"]);
    expect(hasModuleSigil(wrong)).toBe(true);
    expect(moduleSubject(wrong)).toBe("Match Grid");
    expect(reviewRoundQuestionTally(wrong)).toEqual({ correct: 0, total: 1 });
    expect(reviewRoundQuestionTally(right)).toEqual({ correct: 1, total: 1 });
  });
});
