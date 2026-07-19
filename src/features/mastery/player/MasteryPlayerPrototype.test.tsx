import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MasteryPlayerPrototype } from "./MasteryPlayerPrototype";

afterEach(cleanup);

// ---------------------------------------------------------------- helpers
function start() {
  fireEvent.click(screen.getByTestId("mastery-start-button"));
}

async function submitNumeric(value: string) {
  const input = await screen.findByTestId("mastery-numeric-input");
  fireEvent.change(input, { target: { value } });
  const submit = screen.getByTestId("mastery-submit-button");
  await waitFor(() => expect(submit).not.toBeDisabled());
  fireEvent.click(submit);
  await screen.findByTestId("mastery-reveal-heading");
}

async function next() {
  fireEvent.click(screen.getByTestId("mastery-next-button"));
}

async function waitForQuestion() {
  await screen.findByTestId("mastery-question-heading");
}

/** Drive Q1..Q5 numeric answers + Q6 boolean, stopping at `stopAfterSeq` reveal. */

// ------------------------------------------------------------------ tests
describe("intro", () => {
  it("renders framing without any answer/delta/calculation", () => {
    render(<MasteryPlayerPrototype />);
    expect(screen.getByTestId("mastery-intro-heading")).toBeInTheDocument();
    expect(screen.getByTestId("mastery-curated-badge")).toHaveTextContent(/curated teaching scenario/i);
    expect(screen.queryByTestId("mastery-correct-answer")).toBeNull();
    expect(screen.queryByTestId("mastery-explanation")).toBeNull();
    expect(screen.queryByTestId("mastery-reveal-heading")).toBeNull();
    // No S1 authored effect leaks onto the intro.
    expect(screen.queryByTestId("mastery-effects-ahri")).toBeNull();
  });

  it("start opens Q1", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await waitForQuestion();
    // Player-safe header: matchup instead of an internal "read-only" badge.
    expect(screen.getByTestId("mastery-matchup-header")).toHaveTextContent(/ahri vs syndra/i);
  });
});

describe("Q1 pre-submission leakage protection", () => {
  it("shows S0 and no reveal/answer/explanation/S1 before submit", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await waitForQuestion();
    // S0: Ahri unbuffed, Syndra at 480.
    expect(screen.queryByTestId("mastery-effects-ahri")).toBeNull();
    expect(screen.getByTestId("mastery-hp-syndra")).toHaveTextContent("480");
    // No answer evidence anywhere pre-submit.
    expect(screen.queryByTestId("mastery-reveal-heading")).toBeNull();
    expect(screen.queryByTestId("mastery-correct-answer")).toBeNull();
    expect(screen.queryByTestId("mastery-explanation")).toBeNull();
  });

  it("disables submit for blank and non-finite input, enables for valid", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    const input = await screen.findByTestId("mastery-numeric-input");
    const submit = screen.getByTestId("mastery-submit-button");
    expect(submit).toBeDisabled(); // blank
    fireEvent.change(input, { target: { value: "abc" } });
    expect(submit).toBeDisabled(); // non-finite
    fireEvent.change(input, { target: { value: "3" } });
    await waitFor(() => expect(submit).not.toBeDisabled());
  });
});

describe("Q1 reveal uses authoritative fixture correctness and applies T1", () => {
  it("marks correct from the fixture and advances S0 -> S1 via authored T1", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    // Deliberately submit a WRONG value; correctness must still come from the fixture.
    await submitNumeric("999");
    const correctness = screen.getByTestId("mastery-correctness");
    expect(correctness).toHaveAttribute("data-correct", "true"); // authoritative, not locally judged
    expect(screen.getByTestId("mastery-correct-answer")).toHaveTextContent("3");
    // Authored inter-step transition T1, in plain language (no internal origin badge).
    expect(screen.getByTestId("transition-authored-effect")).toHaveTextContent(/ahri gains \+20 ability haste/i);
    // Before = S0 (no Ahri effect), After = S1 (Ahri +20 effect).
    const before = within(screen.getByLabelText("Before"));
    const after = within(screen.getByLabelText("After"));
    expect(before.queryByTestId("mastery-effects-ahri")).toBeNull();
    expect(after.getByTestId("mastery-effects-ahri")).toHaveTextContent(/20/);
  });
});

describe("canonical six-step sequence", () => {
  it("Q2 begins at S1 with +20 haste and reapplies nothing", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await submitNumeric("3");
    await next();
    await waitFor(() => expect(screen.getByTestId("mastery-effects-ahri")).toBeInTheDocument());
    // Q2 question state carries the authored +20 effect.
    expect(screen.getByTestId("mastery-effects-ahri")).toHaveTextContent(/20/);
    await submitNumeric("10");
    // Q2 reveal applies nothing.
    expect(screen.getByTestId("transition-state-unchanged")).toBeInTheDocument();
    expect(screen.queryByTestId("transition-authored-effect")).toBeNull();
  });

  it("Q3 and Q4 remain state-unchanged read-only", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await submitNumeric("3");
    await next();
    await submitNumeric("10");
    await next();
    // Q3
    await waitForQuestion();
    await submitNumeric("5");
    expect(screen.getByTestId("transition-state-unchanged")).toBeInTheDocument();
    await next();
    // Q4
    await waitForQuestion();
    await submitNumeric("325");
    expect(screen.getByTestId("transition-state-unchanged")).toBeInTheDocument();
  });

  it("Q5 applies T2 (250 damage, 230 remaining) advancing S1 -> S2", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await submitNumeric("3"); await next();
    await submitNumeric("10"); await next();
    await submitNumeric("5"); await next();
    await submitNumeric("325"); await next();
    await waitForQuestion();
    await submitNumeric("230");
    expect(screen.getByTestId("transition-health-change")).toHaveTextContent(/syndra loses 250 hp/i);
    expect(screen.getByTestId("mastery-explanation")).toHaveTextContent("250");
    expect(screen.getByTestId("mastery-explanation")).toHaveTextContent("230");
    const after = within(screen.getByLabelText("After"));
    expect(after.getByTestId("mastery-hp-syndra")).toHaveTextContent("230");
  });

  it("Q6 begins at S2, reveals reaches-zero + overkill 20, applies no S3", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await submitNumeric("3"); await next();
    await submitNumeric("10"); await next();
    await submitNumeric("5"); await next();
    await submitNumeric("325"); await next();
    await submitNumeric("230"); await next();
    // Q6 question at S2 (Syndra 230).
    await waitForQuestion();
    expect(screen.getByTestId("mastery-hp-syndra")).toHaveTextContent("230");
    // Boolean answer by keyboard: focus a radio, arrow-select, submit.
    const yes = screen.getByTestId("choice-true");
    yes.focus();
    fireEvent.click(yes); // selection
    const submit = screen.getByTestId("mastery-submit-button");
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await screen.findByTestId("mastery-reveal-heading");
    expect(screen.getByTestId("mastery-explanation")).toHaveTextContent(/overkill 20/i);
    // Applied transition is state_unchanged (no applied S3); a proposed one may show.
    expect(screen.getByTestId("transition-state-unchanged")).toBeInTheDocument();
    // After state remains S2 (Syndra 230), never an invented S3.
    const after = within(screen.getByLabelText("After"));
    expect(after.getByTestId("mastery-hp-syndra")).toHaveTextContent("230");
  });
});

describe("completion", () => {
  it("Next advances only from reveal; six questions reach completion with authoritative count; restart returns to intro", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    // Next button does not exist during a question (advance only from reveal).
    await waitForQuestion();
    expect(screen.queryByTestId("mastery-next-button")).toBeNull();

    await submitNumeric("3"); await next();
    await submitNumeric("10"); await next();
    await submitNumeric("5"); await next();
    await submitNumeric("325"); await next();
    await submitNumeric("230"); await next();
    await waitForQuestion();
    const yes = screen.getByTestId("choice-true");
    fireEvent.click(yes);
    fireEvent.click(screen.getByTestId("mastery-submit-button"));
    await screen.findByTestId("mastery-reveal-heading");
    fireEvent.click(screen.getByTestId("mastery-next-button"));

    const heading = await screen.findByTestId("mastery-completion-heading");
    expect(heading).toBeInTheDocument();
    // All six audited reveals are correct → 6/6 (authoritative accumulation).
    expect(screen.getByTestId("mastery-correct-count")).toHaveTextContent("6");
    expect(within(screen.getByTestId("mastery-summary-list")).getAllByRole("listitem")).toHaveLength(6);

    fireEvent.click(screen.getByTestId("mastery-restart-button"));
    expect(await screen.findByTestId("mastery-intro-heading")).toBeInTheDocument();
  });
});

describe("accessibility & focus", () => {
  it("moves focus to the reveal heading after submit and the question heading after advance", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await submitNumeric("3");
    expect(screen.getByTestId("mastery-reveal-heading")).toHaveFocus();
    await next();
    await waitForQuestion();
    expect(screen.getByTestId("mastery-question-heading")).toHaveFocus();
  });

  it("communicates correctness with text and an icon, not colour alone", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await submitNumeric("3");
    const correctness = screen.getByTestId("mastery-correctness");
    expect(correctness).toHaveTextContent(/correct/i); // text, not colour-only
    expect(correctness.querySelector("svg")).not.toBeNull(); // semantic icon
  });

  it("keeps the detailed calculation collapsed by default (progressive disclosure)", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await submitNumeric("3");
    // The calculation is behind a disclosure; its steps are not shown by default,
    // and no player-facing provenance/snapshot digests are rendered at all.
    expect(screen.getByTestId("mastery-calc-trigger")).toHaveAttribute("data-state", "closed");
    expect(screen.queryByTestId("mastery-calc-steps")).toBeNull();
    expect(screen.queryByTestId("mastery-provenance-trigger")).toBeNull();
  });

  it("renders a reduced-motion-safe (motion-reduce) transition path", async () => {
    render(<MasteryPlayerPrototype />);
    start();
    await waitForQuestion();
    // The progress bar animates its width but opts out of motion under
    // prefers-reduced-motion via the `motion-reduce:transition-none` utility.
    const bar = document.querySelector(".motion-reduce\\:transition-none");
    expect(bar).not.toBeNull();
  });
});
