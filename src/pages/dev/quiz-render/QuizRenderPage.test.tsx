/**
 * Render-harness validation: correct-answer leakage, state integrity,
 * invalid params, and the render-ready marker.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuizRenderPage from "./QuizRenderPage";
import { QUIZ_RENDER_WINDOW_KEY, type RenderQuestion } from "@/lib/quiz-screenshot/types";

const fixture: RenderQuestion = {
  id: "t1",
  question_text: "Which item grants the most armor?",
  choices: [{ label: "Sunfire Aegis" }, { label: "Thornmail" }, { label: "Dead Man's Plate" }],
  correct_index: 1,
  explanation: "Thornmail grants 70 armor.",
  category: "items",
};

function inject(questions: RenderQuestion[] | null) {
  const w = window as unknown as Record<string, unknown>;
  if (questions) w[QUIZ_RENDER_WINDOW_KEY] = { questions };
  else delete w[QUIZ_RENDER_WINDOW_KEY];
}

function renderHarness(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/dev/quiz-render${search}`]}>
      <QuizRenderPage />
    </MemoryRouter>,
  );
}

function choiceStates(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-quiz-choice]")).map(
    (b) => b.getAttribute("data-choice-state") ?? "missing",
  );
}

afterEach(() => {
  cleanup();
  inject(null);
});

describe("QuizRenderPage — question state (no leakage)", () => {
  it("shows no selection, no reveal styling, no explanation, no feedback", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=square");
    expect(choiceStates(container)).toEqual(["idle", "idle", "idle"]);
    expect(container.querySelector("[data-quiz-answer-feedback]")).toBeNull();
    expect(screen.queryByText(/Thornmail grants 70 armor/)).toBeNull();
    expect(screen.queryByText("Correct!")).toBeNull();
    // No visible check/x icons anywhere in the unanswered render.
    expect(container.querySelector("svg.lucide-circle-check-big, svg.lucide-check-circle-2")).toBeNull();
    // Answer order preserved exactly as provided.
    const labels = Array.from(container.querySelectorAll("[data-quiz-choice]")).map((b) =>
      b.textContent?.replace(/^[A-D]\./, "").trim(),
    );
    expect(labels).toEqual(["Sunfire Aegis", "Thornmail", "Dead Man's Plate"]);
  });

  it("stamps the render-ready marker on the stage", async () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=question&format=vertical");
    await waitFor(() => {
      expect(
        container.querySelector('[data-quiz-render-stage][data-quiz-render-ready="true"]'),
      ).not.toBeNull();
    });
  });
});

describe("QuizRenderPage — states", () => {
  it("selected: marks only the deterministic first choice, no correctness reveal", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=selected&format=square");
    expect(choiceStates(container)).toEqual(["selected", "idle", "idle"]);
    expect(container.querySelector("[data-quiz-answer-feedback]")).toBeNull();
  });

  it("selected: honors answerIndex override", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=selected&format=square&answerIndex=2");
    expect(choiceStates(container)).toEqual(["idle", "idle", "selected"]);
  });

  it("correct: reveals the actual correct answer with feedback", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=correct&format=square");
    expect(choiceStates(container)).toEqual(["idle", "correct", "idle"]);
    expect(screen.getByText("Correct!")).toBeTruthy();
    expect(screen.queryByText(/Thornmail grants 70 armor/)).toBeNull(); // no explanation yet
  });

  it("incorrect: wrong selection shown AND correct answer revealed", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=incorrect&format=square");
    expect(choiceStates(container)).toEqual(["incorrect-selected", "correct", "idle"]);
    expect(screen.getByText("Incorrect")).toBeTruthy();
    expect(screen.getByText(/Correct answer:/)).toBeTruthy();
  });

  it("explanation: shows the explanation text", () => {
    inject([fixture]);
    renderHarness("?q=t1&state=explanation&format=square");
    expect(screen.getByText(/Thornmail grants 70 armor/)).toBeTruthy();
  });

  it("explanation without explanation text: inert error, not fabricated content", () => {
    inject([{ ...fixture, id: "t2", explanation: undefined }]);
    const { container } = renderHarness("?q=t2&state=explanation&format=square");
    expect(container.querySelector("[data-quiz-render-error]")).not.toBeNull();
    expect(container.querySelector("[data-quiz-render-stage]")).toBeNull();
  });
});

describe("QuizRenderPage — invalid input", () => {
  it("rejects unknown state and unknown format", () => {
    inject([fixture]);
    const a = renderHarness("?q=t1&state=bogus&format=square");
    expect(a.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Unknown state/);
    cleanup();
    inject([fixture]);
    const b = renderHarness("?q=t1&state=question&format=gigantic");
    expect(b.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Unknown format/);
  });

  it("rejects missing and unknown question ids", () => {
    inject([fixture]);
    const a = renderHarness("?state=question&format=square");
    expect(a.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Missing \?q=/);
    cleanup();
    inject([fixture]);
    const b = renderHarness("?q=nope&state=question&format=square");
    expect(b.container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/not found/);
  });

  it("rejects a malformed answerIndex", () => {
    inject([fixture]);
    const { container } = renderHarness("?q=t1&state=selected&format=square&answerIndex=x");
    expect(container.querySelector("[data-quiz-render-error]")?.textContent).toMatch(/Invalid answerIndex/);
  });

  it("never renders the ready marker on an error panel", async () => {
    inject([fixture]);
    const { container } = renderHarness("?q=nope&state=question&format=square");
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('[data-quiz-render-ready="true"]')).toBeNull();
  });
});
