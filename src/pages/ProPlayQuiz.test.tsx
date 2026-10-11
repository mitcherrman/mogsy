/**
 * Pro Play Quiz page — now the canonical Pro Play Arena (PPQ2-E).
 *
 * The server owns the session, so these tests drive the page through a stubbed
 * `/api/pro-play/quiz/*` and assert what the PAGE is responsible for: showing
 * progress, locking a selection, revealing from the server's result, advancing,
 * scoring, playing again, and failing gracefully — never inventing an answer of
 * its own.
 *
 * PPQ2-E moved the page onto `ProPlayArenaRun` + `useProPlayArenaController`.
 * Every behavioural assertion of the PPQ0C page suite is kept; only the DOM it
 * reads changed, one for one:
 *
 *   old page                         arena
 *   ───────────────────────────────  ─────────────────────────────────────────
 *   `<h1>Pro Play Quiz</h1>`         the same heading (visually hidden)
 *   "n / 10" progress                header title "Question n / 10"
 *   `[data-quiz-answer-feedback]`    the reveal footer `[data-pp-reveal-footer]`
 *   `[data-pro-play-evidence]`       reveal values `[data-pp-reveal-value]`
 *   `[data-pro-play-error]`          the frame panel (`pro-play-error`) when no
 *                                    question is on stage; otherwise the HUD's
 *                                    Try again + `submission-status`
 *   `[data-pro-play-summary]`        the end panel (`pro-play-summary`)
 *   context rail / subject cards     the dossier, plate and identity tablets
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProPlayQuiz from "./ProPlayQuiz";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import {
  ReportableQuestionProvider,
  useReportableQuestion,
} from "@/lib/feedback/reportable-question";
import type { ReportableQuestionSnapshot } from "@/lib/feedback/report-context";
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
 * Mounted the way the app mounts it: `App.tsx` supplies the query client, the
 * tooltip provider and the report-context provider at the root. The sink
 * records every snapshot the report slot holds, so the tests can prove there
 * is exactly one publisher.
 */
let reports: Array<ReportableQuestionSnapshot | null> = [];
function ReportSink() {
  reports.push(useReportableQuestion());
  return null;
}
const renderQuiz = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider>
        <ReportableQuestionProvider>
          <MemoryRouter initialEntries={["/lol/pro-play/quiz"]}>
            <ProPlayQuiz />
          </MemoryRouter>
          <ReportSink />
        </ReportableQuestionProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );

/**
 * The arena header's plan position, e.g. "Question 2 / 10". Once a question
 * has been answered the title also carries the phone-only score detail
 * (" · 1 correct", hidden from `lg`), which is not the position.
 */
const progress = () => {
  const title = screen.getByTestId("ranked-header-title");
  const detail = title.querySelector('[data-testid="ranked-header-detail"]')?.textContent ?? "";
  return (title.textContent ?? "").replace(detail, "").replace(/\s*·\s*$/, "").trim();
};
const reveal = () => document.querySelector("[data-pp-reveal-footer]");
const tablets = () => Array.from(document.querySelectorAll<HTMLButtonElement>("[data-quiz-choice]"));

/**
 * The error the player is shown: the frame panel when no question is on the
 * stage, otherwise the status line beside the HUD's Try again.
 */
function shownError(): string | null {
  const frame = screen.queryByTestId("pro-play-error");
  if (frame) return frame.textContent;
  if (!screen.queryByTestId("pro-play-try-again")) return null;
  return screen.getByTestId("submission-status").textContent;
}
const waitForError = (opts?: { timeout: number }) =>
  waitFor(() => {
    const text = shownError();
    expect(text).toBeTruthy();
    return text!;
  }, opts);

async function answerCurrent() {
  // data-quiz-choice is QuizAnswerOptions' own stable automation hook.
  const choice = await waitFor(() => {
    const el = document.querySelector<HTMLElement>('[data-quiz-choice]:not([disabled])');
    expect(el).toBeTruthy();
    return el!;
  });
  fireEvent.click(choice);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  reports = [];
});
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
    expect(progress()).toBe("Question 1 / 10");
    // It is the arena, not the old reading column.
    expect(screen.getByTestId("pro-play-arena").dataset.proPlayPhase).toBe("question");
    expect(screen.getByTestId("ranked-question")).toBeTruthy();
  });

  it("reveals the server's result after a locked selection", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    await answerCurrent();
    expect(await screen.findByText("Because 1.")).toBeTruthy();
    // The page never computes correctness itself — it renders what came back.
    expect(reveal()).toBeTruthy();
    expect(reveal()!.getAttribute("data-pp-reveal-footer")).toBe("correct");
  });

  it("advances on Next and tracks progress", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    await answerCurrent();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    expect(progress()).toBe("Question 2 / 10");
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
    const summary = await screen.findByTestId("pro-play-summary");
    expect(within(summary).getByText("10 / 10")).toBeTruthy();
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
      ([u, init]) => (init as RequestInit)?.method === "POST" && String(u).endsWith("/quiz/sessions"),
    ).length;
    expect(startCalls).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    expect(progress()).toBe("Question 1 / 10");
    expect(fetchMock.mock.calls.filter(
      ([u, init]) => (init as RequestInit)?.method === "POST" && String(u).endsWith("/quiz/sessions"),
    )).toHaveLength(2);
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
    const summary = await screen.findByTestId("pro-play-summary");
    const back = within(summary).getByRole("link", { name: "Back to Pro Play" });
    expect(back.getAttribute("href")).toBe(PRO_PLAY_ROUTE);
  });

  it("shows a plain message — never a stack trace — when Pro Play is down", async () => {
    installServer({ failStart: true });
    renderQuiz();
    const error = await screen.findByTestId("pro-play-error");
    expect(error.textContent).toContain("Pro Play is down.");
    expect(error.textContent).not.toContain("Traceback");
    expect(within(error).getByRole("button", { name: "Try again" })).toBeTruthy();
    // The way back is offered there too.
    expect(within(error).getByRole("link", { name: "Back to Pro Play" }).getAttribute("href")).toBe(PRO_PLAY_ROUTE);
  });

  it("never receives or renders an answer key before the player answers", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    // The pre-answer payload the page is given carries choices only; nothing
    // in the DOM marks which one is correct.
    expect(document.body.innerHTML).not.toContain("correct_answer");
    expect(reveal()).toBeNull();
    expect(new Set(tablets().map((t) => t.dataset.choiceState))).toEqual(new Set(["idle"]));
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
    expect(shownError()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    expect(progress()).toBe("Question 2 / 10");
    // Q2 is still PENDING on the server: the retry did not grade it.
    expect(state.served[1]).toMatchObject({ n: 2, answered: false });
  });

  it("after resends run out, Try again replays the SAME answer — kept selected, scored once", async () => {
    const { state } = installIdempotentServer();
    state.faults.push("lose-response", "lose-response", "lose-response");
    renderQuiz();
    await screen.findByText("Question 1?");
    await choose("A1");

    const error = await waitForError(RETRY_WAIT);
    expect(error).not.toMatch(/TypeError|Failed to fetch/);
    expect(state.answerBodies).toHaveLength(3);
    expect(state.grades).toBe(1);
    // The pick stays locked on the stage while the error shows.
    expect(screen.getByText("Question 1?")).toBeTruthy();
    expect(reveal()).toBeNull();

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
    expect(reveal()).toBeNull();
    expect(document.querySelector("[data-pp-reveal-value]")).toBeNull();
    expect(shownError()).toBeNull();
    expect(progress()).toBe("Question 2 / 10");
  });

  it("offers a restart when the session has expired", async () => {
    const { state } = installIdempotentServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    state.expired = true;
    await choose("A1");

    const error = await waitForError();
    expect(error).toContain("This quiz session has expired.");
    expect(state.answerBodies).toHaveLength(0); // refused before reaching the grader

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    await waitFor(() => expect(state.sessions).toBe(2));
    expect(progress()).toBe("Question 1 / 10");
    expect(shownError()).toBeNull();
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
    const summary = await screen.findByTestId("pro-play-summary");
    expect(within(summary).getByText("1 / 2")).toBeTruthy();
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
    expect(reveal()).toBeNull();
    expect(document.querySelector("[data-pp-reveal-value]")).toBeNull();
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

  it("renders the context (dossier, plate, identity tablets), and no evidence yet", async () => {
    installContextServer();
    renderQuiz();
    await screen.findByText(SAMPLE.question.question_text);

    expect(screen.getByTestId("dossier-relationship")).toHaveTextContent("Champion → Player");
    expect(
      screen.getAllByTestId("dossier-scope").map((e) => e.querySelector("dt span")?.textContent),
    ).toEqual(["LCK", "ALL TIME"]);
    expect(screen.getByTestId("dossier-metric")).toHaveTextContent("WIN RATE");
    // The identity facts ride inside the canonical tablets.
    const [nuguri, clear] = tablets();
    expect(nuguri.querySelector("[data-pp-option-content]")).not.toBeNull();
    expect(nuguri.textContent).toContain("2018–2022");
    expect(clear.textContent).toContain("2022–2026");

    // The reveal half must not exist before an answer.
    expect(reveal()).toBeNull();
    expect(document.querySelector("[data-pp-reveal-value]")).toBeNull();
    expect(document.body.textContent).not.toContain("75.0%");
  });

  it("renders the evidence only after the player answers", async () => {
    installContextServer();
    renderQuiz();
    await screen.findByText(SAMPLE.question.question_text);
    // The plate and dossier legitimately name the same people, so the choice
    // is selected from the answer grid rather than by accessible name alone.
    const choice = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-quiz-answer-options] button"),
    ).find((b) => b.textContent?.includes(SAMPLE.question.choices[0]));
    fireEvent.click(choice ?? screen.getAllByText(SAMPLE.question.choices[0])[0]);

    await waitFor(() => expect(reveal()).toBeTruthy());
    // Each value is on its own tablet, in server option order.
    const values = tablets().map((t) => t.querySelector("[data-pp-reveal-value]")?.textContent ?? "");
    expect(values[0]).toContain("75.0%");
    expect(values[1]).toContain("60.0%");
    expect(screen.getAllByText(/12 games · 9W–3L/).length).toBeGreaterThan(0);
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

/**
 * PPQ2-E — the route conversion itself: the page is the Arena, the Arena is
 * the one report publisher, and the route keeps its way back and its frame.
 */
describe("ProPlayQuiz — the Arena route (PPQ2-E)", () => {
  const ROOT = resolve(process.cwd(), "src");
  const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
  const codeOnly = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("publishes the question once, from the Arena, with the server's identity; the answer only after grading", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    const pre = reports[reports.length - 1]!;
    expect(pre).toMatchObject({
      category: "Leaguecraft",
      mode: "Pro Play Quiz",
      runtimeQuestionId: "q1",
      prompt: "Question 1?",
      sessionId: "s1",
      roundNumber: 1,
    });
    expect(pre.canonicalAnswer ?? null).toBeNull();
    await answerCurrent();
    await screen.findByText("Because 1.");
    expect(reports[reports.length - 1]!.canonicalAnswer).toBe("A1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Question 2?");
    const second = reports[reports.length - 1]!;
    expect(second).toMatchObject({ runtimeQuestionId: "q2", roundNumber: 2 });
    expect(second.canonicalAnswer ?? null).toBeNull();
  });

  it("the page has no publisher of its own and no run state: it mounts the Arena on the controller", () => {
    const page = codeOnly(read("pages/ProPlayQuiz.tsx"));
    expect(page).not.toMatch(/usePublishReportableQuestion|ReportableQuestionProvider/);
    expect(page).toMatch(/useProPlayArenaController\(\)/);
    expect(page).toMatch(/<ProPlayArenaRun\b/);
    // The legacy page's own run machinery and renderers are gone from it.
    expect(page).not.toMatch(/useState|submitProPlayAnswer|startProPlayQuiz|QuizAnswerOptions|ProPlayQuestionCard|ProPlayEvidence/);
  });

  it("keeps the way back to Pro Play beside the HUD while a question is on stage", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    const back = screen.getByTestId("pro-play-back");
    expect(back.textContent).toBe("Back to Pro Play");
    expect(back.getAttribute("href")).toBe(PRO_PLAY_ROUTE);
    // In the HUD band: scrolls with the page below `lg` (the page scrolls
    // there), fixed from `lg` (the stage is locked to the viewport).
    expect(back.className).toMatch(/(^|\s)absolute(\s|$)/);
    expect(back.className).toContain("lg:fixed");
    // It is the arena's chrome, not a row of its own: a zero-height slot.
    expect(back.parentElement!.className).toContain("h-0");
  });

  it("clips the frame's glow bleed at the page edge on every frame (no 4px overflow)", async () => {
    installServer({ failStart: true });
    renderQuiz();
    await screen.findByTestId("pro-play-error");
    expect(screen.getByTestId("pro-play-arena").className).toContain("overflow-x-clip");
  });

  it("answers through a focused canonical tablet and hands focus to Next (real-browser keyboard run: handoff)", async () => {
    installServer();
    renderQuiz();
    await screen.findByText("Question 1?");
    const [first] = tablets();
    first.focus();
    expect(document.activeElement).toBe(first);
    // A native button: Enter/Space activate it as a click (jsdom does not
    // synthesise that; the real-browser Tab/Enter run is in the handoff).
    fireEvent.click(first);
    await screen.findByText("Because 1.");
    expect(document.activeElement).toBe(screen.getByTestId("pro-play-next"));
  });

  it("is registered at /lol/pro-play/quiz on the same lazy page, with the arena's full-bleed frame", () => {
    const app = read("App.tsx");
    expect(app).toMatch(/path="\/lol\/pro-play\/quiz" element=\{<Suspense fallback=\{<RouteFallback \/>\}><ProPlayQuiz \/>/);
    expect(read("lib/route-prefetch.ts")).toContain('ProPlayQuiz: lazyWithRetry(() => import("@/pages/ProPlayQuiz"))');
    expect(read("components/Layout.tsx")).toMatch(/\|\| pathname === PRO_PLAY_QUIZ_ROUTE/);
  });

  it("leaving mid-answer drops the late response: nothing paints, nothing is resent", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetchMock = installServer();
    const inner = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/answer")) await gate;
      return inner(url, init);
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderQuiz();
      await screen.findByText("Question 1?");
      fireEvent.click(tablets()[0]);
      cleanup(); // the player navigates away while the answer is in flight
      await act(async () => {
        release();
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(document.querySelector("[data-pp-reveal-footer]")).toBeNull();
      expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/answer"))).toHaveLength(1);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});
