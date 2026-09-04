/**
 * Pro Play Quiz page.
 *
 * The server owns the session, so these tests drive the page through a stubbed
 * `/api/pro-play/quiz/*` and assert what the PAGE is responsible for: showing
 * progress, locking a selection, revealing from the server's result, advancing,
 * scoring, playing again, and failing gracefully — never inventing an answer of
 * its own.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProPlayQuiz from "./ProPlayQuiz";
import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import { PRO_PLAY_ROUTE } from "./ProPlayHub";

const TOTAL = 10;

function question(n: number, topic = "Champion") {
  return {
    index: n - 1,
    number: n,
    total: TOTAL,
    topic,
    question_id: `q${n}`,
    question_text: `Question ${n}?`,
    choices: [`A${n}`, `B${n}`],
    presentation: {},
  };
}

/** A scripted server: each answer advances one question, all correct. */
function installServer(opts: { failStart?: boolean } = {}) {
  let answered = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/quiz/sessions") && init?.method === "POST") {
      if (opts.failStart) {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            detail: { code: "PP_AUTHORITY_UNAVAILABLE", message: "Pro Play is down." },
          }),
        } as unknown as Response;
      }
      answered = 0;
      return {
        ok: true,
        json: async () => ({
          session: { session_id: "s1", total: TOTAL, answered: 0, score: 0, complete: false },
          question: question(1),
        }),
      } as unknown as Response;
    }
    if (path.includes("/answer")) {
      answered += 1;
      const complete = answered >= TOTAL;
      return {
        ok: true,
        json: async () => ({
          result: {
            is_correct: true,
            selected_answer: `A${answered}`,
            correct_answer: `A${answered}`,
            explanation: `Because ${answered}.`,
            reveal: {},
          },
          session: {
            session_id: "s1",
            total: TOTAL,
            answered,
            score: answered,
            complete,
          },
          question: complete ? null : question(answered + 1),
        }),
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * Mounted the way the app mounts it. The champion anchor resolves media
 * through `useChampionAssets`, a react-query hook, so the page now needs the
 * QueryClientProvider that `App.tsx` already supplies at the root — the same
 * dependency every other query-backed page has.
 */
const renderQuiz = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/lol/pro-play/quiz"]}>
        <ProPlayQuiz />
      </MemoryRouter>
    </QueryClientProvider>,
  );

async function answerCurrent() {
  // data-quiz-choice is QuizAnswerOptions' own stable automation hook.
  const choice = await waitFor(() => {
    const el = document.querySelector<HTMLElement>("[data-quiz-choice]");
    expect(el).toBeTruthy();
    return el!;
  });
  fireEvent.click(choice);
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProPlayQuiz", () => {
  it("shows the title, the first question and 1 / 10 progress", async () => {
    installServer();
    renderQuiz();
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Pro Play Quiz" })).toBeTruthy();
    expect(screen.getByText("1 / 10")).toBeTruthy();
  });

  it("reveals the server's result after a locked selection", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    await answerCurrent();
    expect(await screen.findByText("Because 1.")).toBeTruthy();
    // The page never computes correctness itself — it renders what came back.
    expect(document.querySelector("[data-quiz-answer-feedback]")).toBeTruthy();
  });

  it("advances on Next and tracks progress", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    await answerCurrent();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    expect(screen.getByText("2 / 10")).toBeTruthy();
  });

  it("finishes after ten questions and shows the score", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    for (let i = 1; i <= TOTAL; i += 1) {
      await answerCurrent();
      const next = await screen.findByRole("button", {
        name: i === TOTAL ? "See results" : "Next",
      });
      fireEvent.click(next);
    }
    await waitFor(() => expect(document.querySelector("[data-pro-play-summary]")).toBeTruthy());
    expect(screen.getByText("10 / 10")).toBeTruthy();
  });

  it("plays again from the summary", async () => {
    const fetchMock = installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    for (let i = 1; i <= TOTAL; i += 1) {
      await answerCurrent();
      fireEvent.click(await screen.findByRole("button", {
        name: i === TOTAL ? "See results" : "Next",
      }));
    }
    await screen.findByText("10 / 10");
    const startCalls = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit)?.method === "POST" &&
        String(fetchMock.mock.calls[0][0]).endsWith("/quiz/sessions"),
    ).length;
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(startCalls);
  });

  it("returns to the Pro Play hub from the summary", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    for (let i = 1; i <= TOTAL; i += 1) {
      await answerCurrent();
      fireEvent.click(await screen.findByRole("button", {
        name: i === TOTAL ? "See results" : "Next",
      }));
    }
    await screen.findByText("10 / 10");
    const back = screen.getAllByRole("link", { name: /Back to Pro Play|Back to Pro Play/i });
    expect(back.some((a) => a.getAttribute("href") === PRO_PLAY_ROUTE)).toBe(true);
  });

  it("shows a plain message — never a stack trace — when Pro Play is down", async () => {
    installServer({ failStart: true });
    renderQuiz();
    const error = await waitFor(() => {
      const el = document.querySelector("[data-pro-play-error]");
      expect(el).toBeTruthy();
      return el!;
    });
    expect(error.textContent).toContain("Pro Play is down.");
    expect(error.textContent).not.toContain("Traceback");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("never receives or renders an answer key before the player answers", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    // The pre-answer payload the page is given carries choices only; nothing
    // in the DOM marks which one is correct.
    expect(document.body.innerHTML).not.toContain("correct_answer");
    expect(document.querySelector("[data-quiz-answer-feedback]")).toBeNull();
  });
});

/**
 * The presentation contract end to end through the PAGE, on a real captured
 * payload — the tests above deliberately use a context-free question, which
 * is what proves the fallback; this is what proves the wiring.
 */
describe("ProPlayQuiz — presentation contract", () => {
  const SAMPLE = PRO_PLAY_SAMPLES.nuguri_clear;

  function installContextServer() {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/quiz/sessions") && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            session: { session_id: "s1", total: TOTAL, answered: 0, score: 0, complete: false },
            question: SAMPLE.question,
          }),
        } as unknown as Response;
      }
      if (path.includes("/answer")) {
        return {
          ok: true,
          json: async () => ({
            session: { session_id: "s1", total: TOTAL, answered: 1, score: 1, complete: false },
            result: SAMPLE.result,
            question: null,
          }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  it("renders the context rail and subject cards, and no evidence yet", async () => {
    installContextServer();
    renderQuiz();
    await screen.findByText(SAMPLE.question.question_text);

    expect(screen.getByTestId("pro-play-relationship")).toHaveTextContent(
      "Champion → Player",
    );
    expect(
      screen.getAllByTestId("pro-play-scope-tag").map((e) => e.textContent),
    ).toEqual(["LCK", "ALL TIME"]);
    expect(screen.getByTestId("pro-play-metric-tag")).toHaveTextContent("WIN RATE");
    expect(screen.getByText("2018–2022")).toBeTruthy();
    expect(screen.getByText("2022–2026")).toBeTruthy();

    // The reveal half must not exist before an answer.
    expect(document.querySelector("[data-pro-play-evidence]")).toBeNull();
    expect(document.body.textContent).not.toContain("75.0%");
  });

  it("renders the evidence only after the player answers", async () => {
    installContextServer();
    renderQuiz();
    await screen.findByText(SAMPLE.question.question_text);
    // The subject cards legitimately name the same people, so the choice is
    // selected from the answer grid rather than by accessible name alone.
    const choice = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-quiz-answer-options] button"),
    ).find((b) => b.textContent?.includes(SAMPLE.question.choices[0]));
    fireEvent.click(choice ?? screen.getAllByText(SAMPLE.question.choices[0])[0]);

    await waitFor(() =>
      expect(document.querySelector("[data-pro-play-evidence]")).toBeTruthy(),
    );
    expect(screen.getByText("75.0%")).toBeTruthy();
    expect(screen.getByText("60.0%")).toBeTruthy();
    expect(screen.getByText(/12 games · 9W–3L/)).toBeTruthy();
  });

  it("keeps the stem exactly as the server wrote it — never expanded", async () => {
    installContextServer();
    renderQuiz();
    const stem = await screen.findByText(SAMPLE.question.question_text);
    expect(stem.textContent).toBe(
      "In LCK, who has the higher win rate on Kennen: Nuguri or Clear?",
    );
    expect(stem.textContent).not.toMatch(/Across their full/i);
  });
});
