/**
 * Comparison question renderer tests (Phase 4C2).
 *
 * Covers: rendering an Ahri-vs-Syndra ability comparison and a champion-stat
 * comparison from structured `comparison_semantics` (never `question.prompt`),
 * two-champion presentation with no combat-state panel, always-three-way
 * choice options (A / B / tie) with champion-name labels (not raw values),
 * and submission through the existing choice-input flow with no client-side
 * comparison of values anywhere in this file.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseMasteryPlayerQuestion } from "../contracts/parsers";
import { comparisonQuestionEnvelopes } from "./comparisonFixtures";
import { ComparisonQuestionView, MasteryComparisonContractError } from "./ComparisonQuestionView";

afterEach(() => cleanup());

const questions = comparisonQuestionEnvelopes().map(parseMasteryPlayerQuestion);

describe("ComparisonQuestionView — prompt rendering from structured semantics", () => {
  it("renders a decisive Ahri-vs-Syndra ability-cooldown comparison prompt built from comparison_semantics, not question.prompt", () => {
    const q = questions[0];
    render(<ComparisonQuestionView question={q} total={3} submitting={false} onSubmit={vi.fn()} />);
    const heading = screen.getByTestId("mastery-question-heading");
    expect(heading.textContent).toContain("Ahri E");
    expect(heading.textContent).toContain("Syndra E");
    expect(heading.textContent).toContain("shorter cooldown");
    // Proves the renderer never echoes the raw backend `prompt` string.
    expect(heading.textContent).not.toBe(q.prompt);
  });

  it("renders a champion-stat comparison with metric context", () => {
    render(<ComparisonQuestionView question={questions[1]} total={3} submitting={false} onSubmit={vi.fn()} />);
    const heading = screen.getByTestId("mastery-question-heading");
    expect(heading.textContent).toContain("Armor");
    expect(heading.textContent).toContain("Ahri");
    expect(heading.textContent).toContain("Syndra");
  });
});

describe("ComparisonQuestionView — two-champion presentation, no combat state", () => {
  it("shows both champion identities and no combat-state panel", () => {
    render(<ComparisonQuestionView question={questions[0]} total={3} submitting={false} onSubmit={vi.fn()} />);
    const header = screen.getByTestId("mastery-comparison-header");
    expect(header.textContent).toContain("Ahri");
    expect(header.textContent).toContain("Syndra");
    expect(screen.queryByTestId("mastery-matchup-header")).toBeNull();
  });

  it("does not crash when question.state and question.matchupIdentity are null", () => {
    const q = questions[0];
    expect(q.state).toBeNull();
    expect(q.matchupIdentity).toBeNull();
    expect(() =>
      render(<ComparisonQuestionView question={q} total={3} submitting={false} onSubmit={vi.fn()} />),
    ).not.toThrow();
  });
});

describe("ComparisonQuestionView — always-three-way choice with champion-name labels", () => {
  it("offers exactly three choices — champion A, champion B, and Tie — labeled by display name, not raw option values", () => {
    render(<ComparisonQuestionView question={questions[0]} total={3} submitting={false} onSubmit={vi.fn()} />);
    const buttons = screen.getAllByTestId(/^choice-/);
    expect(buttons).toHaveLength(3);
    expect(screen.getByText("Ahri")).toBeTruthy();
    expect(screen.getByText("Syndra")).toBeTruthy();
    expect(screen.getByText("Tie / Same")).toBeTruthy();
    // Raw wire values (champion ids / "tie") never appear as visible button text.
    expect(screen.queryByText("ahri")).toBeNull();
    expect(screen.queryByText("tie")).toBeNull();
  });

  it("offers the Tie/Same choice unconditionally, on a fixture that ends up decisive too — never suppressed", () => {
    // questions[0] resolves decisively (Ahri wins) per its paired reveal fixture,
    // yet the Tie choice is present because the wire always sends the canonical
    // three-way answer domain regardless of this instance's outcome.
    render(<ComparisonQuestionView question={questions[0]} total={3} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("choice-tie")).toBeTruthy();
    expect(screen.getByText("Tie / Same")).toBeTruthy();
  });
});

describe("ComparisonQuestionView — submission (existing choice-input flow, no client grading)", () => {
  it("submits the raw selected option value verbatim through onSubmit", () => {
    const onSubmit = vi.fn();
    render(<ComparisonQuestionView question={questions[0]} total={3} submitting={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId("choice-ahri"));
    fireEvent.click(screen.getByTestId("mastery-submit-button"));
    expect(onSubmit).toHaveBeenCalledWith("ahri");
  });

  it("submits the tie token when Tie/Same is selected", () => {
    const onSubmit = vi.fn();
    render(<ComparisonQuestionView question={questions[2]} total={3} submitting={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId("choice-tie"));
    fireEvent.click(screen.getByTestId("mastery-submit-button"));
    expect(onSubmit).toHaveBeenCalledWith("tie");
  });

  it("disables submit until a choice is made", () => {
    render(<ComparisonQuestionView question={questions[0]} total={3} submitting={false} onSubmit={vi.fn()} />);
    expect(screen.getByTestId("mastery-submit-button")).toBeDisabled();
  });
});

describe("ComparisonQuestionView — fail-closed guards", () => {
  it("throws when comparison_semantics is missing", () => {
    const broken = { ...questions[0], comparisonSemantics: null };
    expect(() =>
      render(<ComparisonQuestionView question={broken as never} total={3} submitting={false} onSubmit={vi.fn()} />),
    ).toThrow(MasteryComparisonContractError);
  });

  it("throws for a non-single_choice answer type", () => {
    const broken = { ...questions[0], answerType: "numeric", answerOptions: [] };
    expect(() =>
      render(<ComparisonQuestionView question={broken as never} total={3} submitting={false} onSubmit={vi.fn()} />),
    ).toThrow(MasteryComparisonContractError);
  });

  it("throws when answer_options is not the canonical [A, B, tie] triple", () => {
    const broken = { ...questions[0], answerOptions: ["ahri", "syndra"] };
    expect(() =>
      render(<ComparisonQuestionView question={broken as never} total={3} submitting={false} onSubmit={vi.fn()} />),
    ).toThrow(MasteryComparisonContractError);
  });
});
