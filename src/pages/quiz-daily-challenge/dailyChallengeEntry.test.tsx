/**
 * DC1 Phase 5 — routing, entry, and the things that must NOT have moved.
 *
 * The Daily Challenge is one of three modes on a shared surface, and it sits
 * next to a differently-named mode (`/quiz/daily` is Time Trial) that has its
 * own players. So the route census and the PLAY handoff are pinned here rather
 * than assumed.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DailyAnswerGrid } from "./DailyAnswerGrid";

const APP = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
const QUIZ = readFileSync(resolve(__dirname, "../Quiz.tsx"), "utf8");

describe("routing", () => {
  it("registers the Daily Challenge at its own path", () => {
    expect(APP).toContain('path="/quiz/daily-challenge"');
    expect(APP).toContain("QuizDailyChallengePage");
  });

  it("leaves Time Trial at /quiz/daily exactly where it was", () => {
    // A DIFFERENT mode with a confusingly similar path. Renaming or reusing it
    // would silently move real players into the wrong game.
    expect(APP).toContain('path="/quiz/daily"');
    expect(APP).toContain("QuizDailyScoreAttack");
    // And the two are separate route entries, not one redirecting to the other.
    expect(APP).not.toMatch(/path="\/quiz\/daily"[^>]*Navigate/);
  });

  it("the two paths are distinct registrations", () => {
    const daily = APP.indexOf('path="/quiz/daily"');
    const challenge = APP.indexOf('path="/quiz/daily-challenge"');
    expect(daily).toBeGreaterThan(-1);
    expect(challenge).toBeGreaterThan(-1);
    expect(daily).not.toBe(challenge);
  });
});

describe("the PLAY handoff", () => {
  it("opens the new arena instead of the legacy in-page Daily", () => {
    expect(QUIZ).toContain('onPlayDailyChallenge={() => navigate("/quiz/daily-challenge")}');
    expect(QUIZ).not.toContain("onPlayDailyChallenge={() => void handlePlayDailyChallenge()}");
  });

  it("keeps the legacy Daily code in place rather than deleting it", () => {
    // Phase 5 replaces the entry, not the implementation: the new surface is
    // not certified in production yet, and removing the old one in the same
    // change would leave nothing to fall back to.
    expect(QUIZ).toContain("handlePlayDailyChallenge");
    expect(QUIZ).toContain("getDailyChallenge");
  });
});

describe("the answer grid, on its own", () => {
  const options = [0, 1, 2, 3].map((i) => ({
    id: String(i), index: i, label: `Option ${String.fromCharCode(65 + i)}`, media: null,
  }));

  const renderGrid = (props: Partial<Parameters<typeof DailyAnswerGrid>[0]> = {}) =>
    render(
      <MemoryRouter>
        <DailyAnswerGrid
          options={options}
          eliminated={[]}
          optionMedia={null}
          disabled={false}
          revealedCorrectIndex={null}
          onSelect={vi.fn()}
          {...props}
        />
      </MemoryRouter>,
    );

  it("submits the BACKEND index, not the position on screen", () => {
    const onSelect = vi.fn();
    renderGrid({ eliminated: [0, 1], onSelect });
    fireEvent.click(screen.getByRole("button", { name: /Option C/, hidden: true }));
    // Two options above it are struck out, and C is still index 2.
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("keeps an eliminated option visible, lettered, and out of the tab order", () => {
    renderGrid({ eliminated: [1] });
    const struck = screen.getByRole("button", { name: /Option B/, hidden: true });
    expect(struck).toBeInTheDocument();          // still readable
    expect(struck).toBeDisabled();               // not focusable
    expect(struck).toHaveAttribute("data-choice-state", "eliminated");
    expect(struck).toHaveTextContent("B.");      // letters do not renumber
    expect(struck).toHaveTextContent("Eliminated");
  });

  it("an eliminated option cannot be chosen even if something clicks it", () => {
    const onSelect = vi.fn();
    renderGrid({ eliminated: [1], onSelect });
    fireEvent.click(screen.getByRole("button", { name: /Option B/, hidden: true }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("carries no correctness at all before a reveal", () => {
    const { container } = renderGrid({ eliminated: [1] });
    const states = Array.from(container.querySelectorAll("[data-choice-state]"))
      .map((n) => n.getAttribute("data-choice-state"));
    expect(states).toEqual(["idle", "eliminated", "idle", "idle"]);
    expect(container.innerHTML).not.toContain("correct");
  });

  it("marks the correct option only when one is handed to it", () => {
    const { container } = renderGrid({ revealedCorrectIndex: 2 });
    expect(container.querySelector('[data-dc-choice="2"]'))
      .toHaveAttribute("data-choice-state", "correct");
    // And the whole grid is closed once an answer is on screen.
    expect(screen.getByTestId("dc-answer-grid"))
      .toHaveAttribute("data-answers-state", "revealed");
  });

  it("every live option is reachable by keyboard", () => {
    renderGrid({ eliminated: [2] });
    const live = screen.getAllByRole("button", { hidden: true })
      .filter((b) => b.getAttribute("data-choice-state") === "idle");
    expect(live).toHaveLength(3);
    live.forEach((button) => {
      button.focus();
      expect(document.activeElement).toBe(button);
    });
  });
});
