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
 * PPQ0C — the question-bound answer contract (PPQ0A) through the PAGE.
 *
 * A stateful fake of the backend state machine: each served question is
 * PENDING until graded once, then SETTLED; an identical repeat replays the
 * recorded result (`replayed: true`) without grading, scoring or drawing; a
 * different answer is PP_ANSWER_CONFLICT; an unknown id PP_QUESTION_MISMATCH.
 * Faults are injected AFTER the server has done its work, which is exactly a
 * lost response.
 */
describe("ProPlayQuiz — question-bound answers (PPQ0A)", () => {
  type Served = { id: string; n: number; answered: boolean; selected?: string; result?: unknown };
  type Fault = "lose-response" | "draw-503" | "omit-next-question";

  function installIdempotentServer(opts: { total?: number } = {}) {
    const total = opts.total ?? TOTAL;
    const state = {
      sessionId: "s1",
      sessions: 0,
      served: [] as Served[],
      score: 0,
      grades: 0,
      expired: false,
      faults: [] as Fault[],
      answerBodies: [] as Array<Record<string, unknown>>,
      responses: [] as Array<Record<string, unknown>>,
      gets: 0,
    };
    const q = (n: number) => ({ ...question(n), total, question_id: `qid-${state.sessions}-${n}` });
    const answered = () => state.served.filter((s) => s.answered).length;
    const summary = () => ({
      session_id: state.sessionId,
      total,
      answered: answered(),
      score: state.score,
      complete: answered() >= total,
    });
    const current = () => state.served.find((s) => !s.answered) ?? null;
    const draw = () => {
      const n = state.served.length + 1;
      const s: Served = { id: q(n).question_id, n, answered: false };
      state.served.push(s);
      return s;
    };
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    const fail = (status: number, code: string, message = code) =>
      ({ ok: false, status, json: async () => ({ detail: { code, message } }) }) as unknown as Response;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/quiz/sessions") && init?.method === "POST") {
        state.sessions += 1;
        state.sessionId = `s${state.sessions}`;
        state.served = [];
        state.score = 0;
        state.expired = false;
        const s = draw();
        return ok({ schema_version: 1, session: summary(), question: q(s.n) });
      }
      if (state.expired) return fail(404, "PP_SESSION_NOT_FOUND", "This quiz session has expired.");
      if (path.endsWith(`/quiz/sessions/${state.sessionId}`) && !init?.method) {
        state.gets += 1;
        if (summary().complete) return ok({ schema_version: 1, session: summary(), question: null });
        const s = current() ?? draw();
        return ok({ schema_version: 1, session: summary(), question: q(s.n) });
      }
      if (path.endsWith("/answer")) {
        const body = JSON.parse(String(init?.body));
        state.answerBodies.push(body);
        const target = state.served.find((s) => s.id === body.question_id);
        if (!target) return fail(409, "PP_QUESTION_MISMATCH");
        let replayed = false;
        if (target.answered) {
          if (target.selected !== body.selected_answer) return fail(409, "PP_ANSWER_CONFLICT");
          replayed = true;
        } else {
          state.grades += 1;
          target.answered = true;
          target.selected = body.selected_answer;
          const isCorrect = body.selected_answer === `A${target.n}`;
          if (isCorrect) state.score += 1;
          target.result = {
            is_correct: isCorrect,
            selected_answer: body.selected_answer,
            correct_answer: `A${target.n}`,
            explanation: `Because ${target.n}.`,
            reveal: {},
          };
        }
        const fault = state.faults.shift();
        const payload: Record<string, unknown> = {
          schema_version: 1,
          result: target.result,
          replayed,
          session: summary(),
          question: null,
        };
        if (!summary().complete) {
          if (fault === "draw-503") return fail(503, "PP_AUTHORITY_UNAVAILABLE", "Pro Play is down.");
          const next = current() ?? draw();
          if (fault !== "omit-next-question") payload.question = q(next.n);
        }
        if (fault === "lose-response") throw new TypeError("Failed to fetch");
        state.responses.push(payload);
        return ok(payload);
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return { state, fetchMock };
  }

  const RETRY_WAIT = { timeout: 4000 };

  async function choose(label: string) {
    const btn = await waitFor(() => {
      const el = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-quiz-answer-options] button"),
      ).find((b) => b.textContent?.includes(label));
      expect(el).toBeTruthy();
      return el!;
    });
    fireEvent.click(btn);
    return btn;
  }

  it("answers with the served question_id and reveals the server's result", async () => {
    const { state } = installIdempotentServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    await choose("A1");
    expect(await screen.findByText("Because 1.")).toBeTruthy();
    expect(state.answerBodies).toEqual([{ question_id: "qid-1-1", selected_answer: "A1" }]);
    expect(state.responses[0].replayed).toBe(false);
    expect(state.grades).toBe(1);
  });

  it("recovers a lost response by resending the identical request; Q2 is never graded", async () => {
    const { state } = installIdempotentServer();
    state.faults.push("lose-response");
    renderQuiz();
    await screen.findByText("Question 1?");
    await choose("A1");

    expect(await screen.findByText("Because 1.", {}, RETRY_WAIT)).toBeTruthy();
    expect(state.answerBodies).toEqual([
      { question_id: "qid-1-1", selected_answer: "A1" },
      { question_id: "qid-1-1", selected_answer: "A1" },
    ]);
    expect(state.responses.map((r) => r.replayed)).toEqual([true]);
    expect(state.grades).toBe(1);
    expect(state.score).toBe(1);
    expect(document.querySelector("[data-pro-play-error]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    expect(screen.getByText("2 / 10")).toBeTruthy();
    // Q2 is still PENDING on the server: the retry did not grade it.
    expect(state.served[1]).toMatchObject({ n: 2, answered: false });
  });

  it("after resends run out, Try again replays the SAME answer — kept selected, scored once", async () => {
    const { state } = installIdempotentServer();
    state.faults.push("lose-response", "lose-response", "lose-response");
    renderQuiz();
    await screen.findByText("Question 1?");
    await choose("A1");

    const error = await waitFor(() => {
      const el = document.querySelector("[data-pro-play-error]");
      expect(el).toBeTruthy();
      return el!;
    }, RETRY_WAIT);
    expect(error.textContent).not.toMatch(/TypeError|Failed to fetch/);
    expect(state.answerBodies).toHaveLength(3);
    expect(state.grades).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Because 1.")).toBeTruthy();
    expect(state.sessions).toBe(1); // no restart
    expect(state.answerBodies).toHaveLength(4);
    for (const b of state.answerBodies) expect(b).toEqual({ question_id: "qid-1-1", selected_answer: "A1" });
    expect(state.responses.map((r) => r.replayed)).toEqual([true]);
    expect(state.grades).toBe(1);
    // The reveal paints the player's own pick, not a different one.
    expect(
      document.querySelector('[data-quiz-choice][data-choice-state="correct"]')?.textContent,
    ).toContain("A1");
  });

  it("resynchronizes with GET on a conflicting submission and shows no foreign reveal", async () => {
    const { state } = installIdempotentServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    // Q1 was already settled with a DIFFERENT choice (e.g. another tab).
    Object.assign(state.served[0], { answered: true, selected: "B1", result: { is_correct: false } });

    await choose("A1");
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    expect(state.gets).toBe(1);
    expect(state.answerBodies).toHaveLength(1); // a conflict is never resent
    expect(document.querySelector("[data-quiz-answer-feedback]")).toBeNull();
    expect(document.querySelector("[data-pro-play-evidence]")).toBeNull();
    expect(document.querySelector("[data-pro-play-error]")).toBeNull();
    expect(screen.getByText("2 / 10")).toBeTruthy();
  });

  it("offers a restart when the session has expired", async () => {
    const { state } = installIdempotentServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    state.expired = true;
    await choose("A1");

    const error = await waitFor(() => {
      const el = document.querySelector("[data-pro-play-error]");
      expect(el).toBeTruthy();
      return el!;
    });
    expect(error.textContent).toContain("This quiz session has expired.");
    expect(state.answerBodies).toHaveLength(0); // refused before reaching the grader

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    expect(state.sessions).toBe(2);
    expect(screen.getByText("1 / 10")).toBeTruthy();
  });

  it("recovers the next question when the draw after grading fails (503)", async () => {
    const { state } = installIdempotentServer();
    state.faults.push("draw-503");
    renderQuiz();
    await screen.findByText("Question 1?");
    await choose("A1");

    expect(await screen.findByText("Because 1.", {}, RETRY_WAIT)).toBeTruthy();
    expect(state.grades).toBe(1);
    expect(state.responses.map((r) => r.replayed)).toEqual([true]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Question 2?")).toBeTruthy();
  });

  it("asks the server for its current question if an answered turn omits the next one", async () => {
    const { state } = installIdempotentServer();
    state.faults.push("omit-next-question");
    renderQuiz();
    await screen.findByText("Question 1?");
    await choose("A1");
    await screen.findByText("Because 1.");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    expect(state.gets).toBe(1);
    expect(state.grades).toBe(1);
  });

  it("replays a lost FINAL answer to the same complete summary", async () => {
    const { state } = installIdempotentServer({ total: 2 });
    renderQuiz();
    await screen.findByText("Question 1?");
    await choose("A1");
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await screen.findByText("Question 2?");

    state.faults.push("lose-response");
    await choose("B2"); // wrong on purpose: the score must stay 1
    expect(await screen.findByText("Because 2.", {}, RETRY_WAIT)).toBeTruthy();
    const final = state.responses[state.responses.length - 1];
    expect(final).toMatchObject({ replayed: true, question: null, session: { complete: true, score: 1 } });

    fireEvent.click(screen.getByRole("button", { name: "See results" }));
    await waitFor(() => expect(document.querySelector("[data-pro-play-summary]")).toBeTruthy());
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(state.grades).toBe(2);
  });

  it("submits once per question however many clicks land while the request is in flight", async () => {
    const { state, fetchMock } = installIdempotentServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    const a = await choose("A1");
    fireEvent.click(a);
    await choose("B1");
    fireEvent.click(a);

    await screen.findByText("Because 1.");
    expect(state.answerBodies).toEqual([{ question_id: "qid-1-1", selected_answer: "A1" }]);
    expect(state.grades).toBe(1);
    expect(state.score).toBe(1);
    // And after the reveal, the locked card accepts nothing either.
    await choose("B1");
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/answer"))).toHaveLength(1);
  });

  it("leaks no reveal or evidence while an answer is in flight or being resent", async () => {
    const { state } = installIdempotentServer();
    state.faults.push("lose-response");
    renderQuiz();
    await screen.findByText("Question 1?");
    await choose("A1");

    // Between the click and the replay, the card is locked but unrevealed.
    expect(document.querySelector("[data-quiz-answer-feedback]")).toBeNull();
    expect(document.querySelector("[data-pro-play-evidence]")).toBeNull();
    expect(document.body.textContent).not.toContain("Because 1.");
    expect(document.querySelector('[data-choice-state="correct"]')).toBeNull();

    await screen.findByText("Because 1.", {}, RETRY_WAIT);
    // The request only ever carried the question's id and the choice.
    for (const b of state.answerBodies) expect(Object.keys(b).sort()).toEqual(["question_id", "selected_answer"]);
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
