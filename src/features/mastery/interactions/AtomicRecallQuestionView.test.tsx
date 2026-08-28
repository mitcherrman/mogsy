/**
 * Atomic recall renderer tests (Phase 4C1).
 *
 * Covers: rendering the four supported recall shapes from structured
 * `prompt_semantics` (never backend prose), one-champion presentation with no
 * opponent panel, unit/precision metadata display, and the numeric input
 * submitting through the existing answer flow unchanged.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseMasteryPlayerQuestion } from "../contracts/parsers";
import { atomicRecallQuestionEnvelopes } from "./atomicRecallFixtures";
import { AtomicRecallQuestionView, MasteryAtomicRecallContractError } from "./AtomicRecallQuestionView";

afterEach(() => cleanup());

const questions = atomicRecallQuestionEnvelopes().map(parseMasteryPlayerQuestion);

describe("AtomicRecallQuestionView — prompt rendering from structured semantics", () => {
  it("renders an ability-cooldown-at-rank prompt built from prompt_semantics, not question.prompt", () => {
    const q = questions[0];
    render(<AtomicRecallQuestionView question={q} total={4} submitting={false} onSubmit={vi.fn()} />);
    const heading = screen.getByTestId("mastery-question-heading");
    expect(heading.textContent).toContain("rank 3");
    expect(heading.textContent).toContain("Ahri E");
    expect(heading.textContent).toContain("cooldown");
    // Proves the renderer never echoes the raw backend `prompt` string.
    expect(heading.textContent).not.toBe(q.prompt);
  });

  it("renders a resource-cost prompt", () => {
    render(<AtomicRecallQuestionView question={questions[1]} total={4} submitting={false} onSubmit={vi.fn()} />);
    const heading = screen.getByTestId("mastery-question-heading");
    expect(heading.textContent).toContain("Ahri Q");
    expect(heading.textContent).toContain("cost");
  });

  it("renders a champion base-stat prompt", () => {
    render(<AtomicRecallQuestionView question={questions[2]} total={4} submitting={false} onSubmit={vi.fn()} />);
    const heading = screen.getByTestId("mastery-question-heading");
    expect(heading.textContent).toContain("Ahri's base");
    expect(heading.textContent).toContain("Armor");
  });

  it("renders a champion level-stat prompt", () => {
    render(<AtomicRecallQuestionView question={questions[3]} total={4} submitting={false} onSubmit={vi.fn()} />);
    const heading = screen.getByTestId("mastery-question-heading");
    expect(heading.textContent).toContain("level 11");
    expect(heading.textContent).toContain("Health");
  });
});

describe("AtomicRecallQuestionView — one-champion presentation", () => {
  it("shows only championA's identity — no opponent, no matchup header, no state panel", () => {
    render(<AtomicRecallQuestionView question={questions[0]} total={4} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("mastery-recall-champion-header").textContent).toContain("Ahri");
    expect(screen.queryByTestId("mastery-matchup-header")).toBeNull();
    expect(screen.queryByText(/vs/i)).toBeNull();
    expect(screen.queryByTestId(/mastery-champion-/)).toBeNull();
  });

  it("does not crash when question.state and question.matchupIdentity are null", () => {
    const q = questions[0];
    expect(q.state).toBeNull();
    expect(q.matchupIdentity).toBeNull();
    expect(() =>
      render(<AtomicRecallQuestionView question={q} total={4} submitting={false} onSubmit={vi.fn()} />),
    ).not.toThrow();
  });
});

describe("AtomicRecallQuestionView — unit/precision metadata", () => {
  it("shows the unit label and the backend precision instruction", () => {
    render(<AtomicRecallQuestionView question={questions[0]} total={4} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getAllByText(/seconds/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("mastery-precision-hint").textContent).toContain("1 decimal place");
  });
});

describe("AtomicRecallQuestionView — numeric answer submission (existing flow, no client grading)", () => {
  it("submits the parsed numeric value verbatim through onSubmit", () => {
    const onSubmit = vi.fn();
    render(<AtomicRecallQuestionView question={questions[0]} total={4} submitting={false} onSubmit={onSubmit} />);
    const input = screen.getByTestId("mastery-numeric-input");
    fireEvent.change(input, { target: { value: "8.4" } });
    fireEvent.click(screen.getByTestId("mastery-submit-button"));
    expect(onSubmit).toHaveBeenCalledWith(8.4);
  });

  it("disables submit for an invalid/blank value", () => {
    render(<AtomicRecallQuestionView question={questions[0]} total={4} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("mastery-submit-button")).toBeDisabled();
  });
});

describe("AtomicRecallQuestionView — fail-closed guards", () => {
  it("throws when prompt_semantics is missing", () => {
    const broken = { ...questions[0], promptSemantics: null };
    expect(() =>
      render(<AtomicRecallQuestionView question={broken as never} total={4} submitting={false} onSubmit={vi.fn()} />),
    ).toThrow(MasteryAtomicRecallContractError);
  });

  it("throws for a non-numeric answer type (unsupported in this slice)", () => {
    const broken = { ...questions[0], answerType: "boolean", inputConstraints: null };
    expect(() =>
      render(<AtomicRecallQuestionView question={broken as never} total={4} submitting={false} onSubmit={vi.fn()} />),
    ).toThrow(MasteryAtomicRecallContractError);
  });
});
