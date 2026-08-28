/**
 * Interaction dispatcher tests (Phase 4C1).
 *
 * Proves: legacy_combat dispatches to the unchanged two-champion renderer,
 * atomic_recall dispatches to the new one-champion renderer, and an
 * unsupported/future interaction kind fails EXPLICITLY rather than
 * silently mis-rendering.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseMasteryPlayerQuestion, parseMasteryPlayerReveal } from "../contracts/parsers";
import type { MasteryPlayerQuestion } from "../contracts/playerQuestion";
import { playerQuestionEnvelopes, playerRevealEnvelopes } from "../fixtures";
import { atomicRecallQuestionEnvelopes, atomicRecallRevealEnvelopes } from "./atomicRecallFixtures";
import {
  MasteryQuestionDispatch,
  MasteryRevealDispatch,
  MasteryUnsupportedInteractionError,
} from "./registry";

afterEach(() => cleanup());

const legacyQuestion = parseMasteryPlayerQuestion(playerQuestionEnvelopes()[0]);
const legacyReveal = parseMasteryPlayerReveal(playerRevealEnvelopes()[0]);
const recallQuestion = parseMasteryPlayerQuestion(atomicRecallQuestionEnvelopes()[0]);
const recallReveal = parseMasteryPlayerReveal(atomicRecallRevealEnvelopes()[0]);

describe("MasteryQuestionDispatch", () => {
  it("routes a legacy_combat question to the two-champion matchup header", () => {
    render(
      <MasteryQuestionDispatch question={legacyQuestion} total={6} submitting={false} onSubmit={vi.fn()} />,
    );
    expect(screen.getByTestId("mastery-matchup-header")).toBeTruthy();
    expect(screen.queryByTestId("mastery-atomic-recall-question")).toBeNull();
  });

  it("routes an atomic_recall question to the one-champion recall renderer", () => {
    render(
      <MasteryQuestionDispatch question={recallQuestion} total={4} submitting={false} onSubmit={vi.fn()} />,
    );
    expect(screen.getByTestId("mastery-atomic-recall-question")).toBeTruthy();
    expect(screen.queryByTestId("mastery-matchup-header")).toBeNull();
  });

  it("fails explicitly on an unsupported/future interaction kind", () => {
    const future = { ...recallQuestion, interactionKind: "comparison_left_right" } as unknown as MasteryPlayerQuestion;
    expect(() =>
      render(<MasteryQuestionDispatch question={future} total={4} submitting={false} onSubmit={vi.fn()} />),
    ).toThrow(MasteryUnsupportedInteractionError);
  });

  it("fails explicitly if a legacy_combat question is missing state (defensive)", () => {
    const broken = { ...legacyQuestion, state: null } as unknown as MasteryPlayerQuestion;
    expect(() =>
      render(<MasteryQuestionDispatch question={broken} total={6} submitting={false} onSubmit={vi.fn()} />),
    ).toThrow(MasteryUnsupportedInteractionError);
  });
});

describe("MasteryRevealDispatch", () => {
  it("routes a legacy_combat reveal to the before/after state panels", () => {
    render(
      <MasteryRevealDispatch
        question={legacyQuestion}
        reveal={legacyReveal}
        submittedAnswer={3}
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByText("Before")).toBeTruthy();
    expect(screen.getByText("After")).toBeTruthy();
    expect(screen.queryByTestId("mastery-atomic-recall-reveal")).toBeNull();
  });

  it("routes an atomic_recall reveal to the stateless reveal renderer (no Before/After panels)", () => {
    render(
      <MasteryRevealDispatch
        question={recallQuestion}
        reveal={recallReveal}
        submittedAnswer={8.4}
        isFinal={false}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByTestId("mastery-atomic-recall-reveal")).toBeTruthy();
    expect(screen.queryByText("Before")).toBeNull();
    expect(screen.queryByText("After")).toBeNull();
  });

  it("fails explicitly on an unsupported/future interaction kind", () => {
    const future = { ...recallQuestion, interactionKind: "comparison_left_right" } as unknown as MasteryPlayerQuestion;
    expect(() =>
      render(
        <MasteryRevealDispatch
          question={future}
          reveal={recallReveal}
          submittedAnswer={8.4}
          isFinal={false}
          onNext={vi.fn()}
        />,
      ),
    ).toThrow(MasteryUnsupportedInteractionError);
  });
});
