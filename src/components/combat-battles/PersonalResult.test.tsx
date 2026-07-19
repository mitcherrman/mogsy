import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PersonalResult from "./PersonalResult";
import type { MyPrediction, MyPredictionResult } from "@/lib/combat-battles/types";

afterEach(cleanup);

const pred: MyPrediction = { predicted_side: "left", created_at: "", updated_at: "", revision: 1 };
const result = (over: Partial<NonNullable<MyPredictionResult>> = {}): MyPredictionResult => ({
  predicted_side: "left", winner_side: "left", outcome: "correct", score_awarded: 100,
  scoring_version: "arena_score_v1", settled_at: "2026-01-01T00:00:00Z", ...over,
});

describe("PersonalResult", () => {
  it("shows correct outcome with awarded score (from backend, not computed)", () => {
    render(<PersonalResult status="revealed" myPrediction={pred} myResult={result()} leftName="Annie" rightName="Brand" />);
    expect(screen.getByText(/Correct/)).toBeTruthy();
    expect(screen.getAllByText(/\+100/).length).toBeGreaterThan(0);
  });

  it("incorrect awards zero and says no score lost", () => {
    render(<PersonalResult status="revealed" myPrediction={pred}
      myResult={result({ outcome: "incorrect", winner_side: "right", score_awarded: 0 })}
      leftName="Annie" rightName="Brand" />);
    expect(screen.getByText(/Incorrect/)).toBeTruthy();
  });

  it("push (draw) explains no score gained or lost", () => {
    render(<PersonalResult status="revealed" myPrediction={pred}
      myResult={result({ outcome: "push", winner_side: "draw", score_awarded: 0 })}
      leftName="Annie" rightName="Brand" />);
    expect(screen.getByText(/Push/)).toBeTruthy();
    expect(screen.getByText(/no Arena Score/i)).toBeTruthy();
  });

  it("void explains no score awarded", () => {
    render(<PersonalResult status="void" myPrediction={pred}
      myResult={result({ outcome: "void", winner_side: null, score_awarded: 0 })}
      leftName="Annie" rightName="Brand" />);
    expect(screen.getByText(/Void/)).toBeTruthy();
  });

  it("revealed but not yet settled shows pending — never derives correctness", () => {
    render(<PersonalResult status="revealed" myPrediction={pred} myResult={null} leftName="Annie" rightName="Brand" />);
    expect(screen.getByText(/Pending settlement/i)).toBeTruthy();
    expect(screen.queryByText(/Correct/)).toBeNull();
  });

  it("renders nothing before reveal", () => {
    const { container } = render(
      <PersonalResult status="open" myPrediction={pred} myResult={null} leftName="Annie" rightName="Brand" />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing for a user who didn't predict", () => {
    const { container } = render(
      <PersonalResult status="revealed" myPrediction={null} myResult={null} leftName="Annie" rightName="Brand" />);
    expect(container.textContent).toBe("");
  });
});
