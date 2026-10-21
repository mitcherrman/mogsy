/**
 * W26Q — the Worlds 2026 quiz page.
 *
 * Driven by a REAL backend session: `worlds2026PresetSession.json` was
 * captured from the W26Q backend's own HTTP routes (preset `worlds_2026`,
 * production's Worlds 2026 feed of 2026-10-20), so the context, evidence and
 * session shapes here are the server's, not hand-written. The page is
 * responsible for asking for the preset, branding the arena, the way back to
 * Worlds, and showing the honest unavailable state; grading and reveal are the
 * Pro Play arena's own and are covered by its suites.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Worlds2026Quiz from "./Worlds2026Quiz";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReportableQuestionProvider } from "@/lib/feedback/reportable-question";
import { startProPlayQuiz } from "@/lib/pro-play/api";
import { proPlayModeLabel, INITIAL_PRO_PLAY_ARENA_STATE, optionIdForLabel } from "@/lib/pro-play/arena";
import { asEvidence } from "@/lib/pro-play/contract";
import { proPlayReportIdentity, projectProPlayReportable, projectProPlayArena } from "@/lib/pro-play/arena/projectProPlayArena";
import { buildProPlayRevealModel } from "@/components/pro-play/arena/reveal/proPlayRevealModel";
import { PRO_PLAY_WORLDS_QUIZ_ROUTE } from "@/lib/pro-play/routes";
import { WORLDS_EXPERIENCE_BASE } from "@/lib/pro-play/worldsExperience/productionGate";
import captured from "@/lib/pro-play/__fixtures__/worlds2026PresetSession.json";

type Json = Record<string, unknown>;
const START = captured.start as Json;
const ANSWERS = captured.answers as Json[];

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

function installServer(opts: { unavailable?: boolean } = {}) {
  let i = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.includes("/quiz/sessions?preset=") && init?.method === "POST") {
      if (opts.unavailable) {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            detail: {
              code: "PP_PRESET_UNAVAILABLE",
              message: "There aren't enough verified Worlds 2026 questions for a full quiz yet.",
            },
          }),
        } as unknown as Response;
      }
      i = 0;
      return ok(START);
    }
    if (path.includes("/answer")) return ok(ANSWERS[i++]);
    throw new Error(`unexpected fetch: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <ReportableQuestionProvider>
          <MemoryRouter initialEntries={[PRO_PLAY_WORLDS_QUIZ_ROUTE]}>
            <Worlds2026Quiz />
          </MemoryRouter>
        </ReportableQuestionProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );

async function answerFirstEnabled() {
  const choice = await waitFor(() => {
    const el = document.querySelector<HTMLElement>("[data-quiz-choice]:not([disabled])");
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

describe("Worlds2026Quiz", () => {
  it("asks the server for the worlds_2026 preset and brands the arena", async () => {
    const fetchMock = installServer();
    renderPage();
    const first = (START.question as Json).question_text as string;
    expect(await screen.findByText(first)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/pro-play\/quiz\/sessions\?preset=worlds_2026$/);
    expect((init as RequestInit).method).toBe("POST");
    expect(screen.getByRole("heading", { level: 1, name: "Worlds 2026 Quiz" })).toBeTruthy();
    // The arena header names the mode from the server's session preset.
    expect(screen.getByTestId("ranked-header").textContent).toContain("Worlds 2026 Quiz");
    const back = screen.getByTestId("pro-play-back");
    expect(back.textContent).toBe("Back to Worlds");
    expect(back.getAttribute("href")).toBe(WORLDS_EXPERIENCE_BASE);
  });

  it("plays the captured real session to the server's score", async () => {
    installServer();
    renderPage();
    await screen.findByText((START.question as Json).question_text as string);
    for (let n = 1; n <= ANSWERS.length; n += 1) {
      await answerFirstEnabled();
      // The reveal is the server's; the page only renders it.
      await waitFor(() => expect(document.querySelector("[data-pp-reveal-footer]")).toBeTruthy());
      fireEvent.click(await screen.findByRole("button", { name: n === ANSWERS.length ? "See results" : "Next" }));
    }
    const summary = await screen.findByTestId("pro-play-summary");
    const final = ANSWERS[ANSWERS.length - 1].session as Json;
    expect(within(summary).getByTestId("pro-play-final-score").textContent).toBe(`${final.score} / ${final.total}`);
    expect(summary.textContent).toContain("Worlds 2026 Quiz");
    expect(within(summary).getByRole("link", { name: "Back to Worlds" }).getAttribute("href"))
      .toBe(WORLDS_EXPERIENCE_BASE);
  });

  it("shows the honest unavailable state instead of a quiz", async () => {
    installServer({ unavailable: true });
    renderPage();
    const panel = await screen.findByTestId("pro-play-unavailable");
    expect(panel.textContent).toContain("There aren't enough verified Worlds 2026 questions");
    expect(within(panel).getByTestId("pro-play-unavailable-note").textContent)
      .toContain("never from earlier Worlds");
    expect(screen.queryByTestId("pro-play-error")).toBeNull();
    expect(screen.queryByTestId("ranked-question")).toBeNull();
    expect(panel.textContent).toContain("Worlds 2026 Quiz");
  });
});

describe("W26Q contract pieces", () => {
  it("files Worlds reports under its own mode, preserving the Leaguecraft category", () => {
    const base = INITIAL_PRO_PLAY_ARENA_STATE;
    const worlds = { ...base, session: START.session as never, question: START.question as never };
    const general = { ...worlds, session: { session_id: "s", total: 10, answered: 0, score: 0, complete: false } as never };
    expect(proPlayReportIdentity(worlds)).toEqual({ mode: "Worlds 2026 Quiz", category: "Leaguecraft" });
    expect(projectProPlayArena(worlds).report.mode).toBe("Worlds 2026 Quiz");
    expect(projectProPlayReportable(worlds)?.mode).toBe("Worlds 2026 Quiz");
    expect(projectProPlayReportable(worlds)?.category).toBe("Leaguecraft");
    expect(proPlayReportIdentity(general)).toEqual({ mode: "Pro Play Quiz", category: "Leaguecraft" });
    expect(projectProPlayReportable(general)?.mode).toBe("Pro Play Quiz");
  });

  it("names the mode from the session preset, else the caller, else Pro Play", () => {
    const base = INITIAL_PRO_PLAY_ARENA_STATE;
    expect(proPlayModeLabel(base)).toBe("Pro Play Quiz");
    expect(proPlayModeLabel(base, { modeLabel: "Worlds 2026 Quiz" })).toBe("Worlds 2026 Quiz");
    const withPreset = { ...base, session: START.session as never };
    expect(proPlayModeLabel(withPreset)).toBe("Worlds 2026 Quiz");
    const general = { ...base, session: { session_id: "s", total: 10, answered: 0, score: 0, complete: false } };
    expect(proPlayModeLabel(general)).toBe("Pro Play Quiz");
  });

  it("starts the general quiz without a preset and the preset quiz with one", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ok(START));
    vi.stubGlobal("fetch", fetchMock);
    await startProPlayQuiz();
    await startProPlayQuiz("worlds_2026");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/quiz\/sessions$/);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/quiz\/sessions\?preset=worlds_2026$/);
  });

  it("the arena's reveal model reads the server's tournament-fact evidence", () => {
    const questions = [START.question, ...ANSWERS.map((a) => a.question)] as Json[];
    ANSWERS.forEach((turn, i) => {
      const q = questions[i];
      const result = turn.result as Json;
      const choices = q.choices as string[];
      const options = choices.map((label, index) => ({ id: String(index), index, label }));
      const model = buildProPlayRevealModel(options, {
        isCorrect: result.is_correct as boolean,
        selectedOptionId: optionIdForLabel(q as never, result.selected_answer as string),
        correctOptionId: optionIdForLabel(q as never, result.correct_answer as string),
        explanation: result.explanation as string,
        evidence: asEvidence(result.evidence),
      })!;
      expect(model.evidenceState).not.toBe("absent");
      expect(model.metric?.label).toBeTruthy();
      expect(model.scopeLabel).toMatch(/^Worlds 2026/);
      const correct = model.candidates.find((c) => c.correct)!;
      expect(correct.label).toBe(result.correct_answer);
      expect(correct.value?.display).toBeTruthy();
    });
  });

  it("every captured question carries a Worlds 2026 scope tag and no answer before grading", () => {
    const questions = [START.question, ...ANSWERS.map((a) => a.question)].filter(Boolean) as Json[];
    expect(questions).toHaveLength(10);
    for (const q of questions) {
      const ctx = q.context as Json;
      const tags = ctx.scope_tags as Json[];
      expect(tags[0].label).toBe("Worlds 2026");
      const text = JSON.stringify(q);
      expect(text).not.toMatch(/"(answer|correct_answer|explanation|evidence|reveal)"/);
    }
  });
});
