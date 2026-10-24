/**
 * W26Q-UX — the Worlds 2026 Quiz's one-screen presentation, behaviourally.
 *
 * Driven by the same REAL captured session as `Worlds2026Quiz.test.tsx`. What
 * is pinned here is what the owner asked for and nothing the arena already
 * proves: the run advances by itself, only after a confirmed server grade;
 * there is no Next / See results control; the reveal and its accessibility
 * (live verdict, Source disclosure, focus handoff) are intact; and the header
 * row carries the way back, the position and `mogzy.lol` in every state.
 * Time is fake: `shouldAdvanceTime` keeps testing-library's polling alive
 * while `advanceTimersByTime` spends the hold.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Worlds2026Quiz from "./Worlds2026Quiz";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReportableQuestionProvider } from "@/lib/feedback/reportable-question";
import { PRO_PLAY_WORLDS_QUIZ_ROUTE } from "@/lib/pro-play/routes";
import { WORLDS_EXPERIENCE_BASE } from "@/lib/pro-play/worldsExperience/productionGate";
import captured from "@/lib/pro-play/__fixtures__/worlds2026PresetSession.json";

type Json = Record<string, unknown>;
const START = captured.start as Json;
const ANSWERS = captured.answers as Json[];
const STEM_1 = (START.question as Json).question_text as string;
const STEM_2 = (ANSWERS[0].question as Json).question_text as string;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/** `gate` holds the FIRST answer response until released (a pending grade). */
function installServer(opts: { gate?: Promise<void>; unavailable?: boolean } = {}) {
  let i = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.includes("/quiz/sessions?preset=") && init?.method === "POST") {
      if (opts.unavailable) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ detail: { code: "PP_PRESET_UNAVAILABLE", message: "Not enough verified questions yet." } }),
        } as unknown as Response;
      }
      i = 0;
      return ok(START);
    }
    if (path.includes("/answer")) {
      if (opts.gate && i === 0) await opts.gate;
      return ok(ANSWERS[i++]);
    }
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

const footer = () => document.querySelector<HTMLElement>("[data-pp-reveal-footer]");
const spend = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Worlds 2026 Quiz — auto-advance after a confirmed grade", () => {
  it("shows the graded reveal with no Next / See results control and a pending advance", async () => {
    installServer();
    renderPage();
    await screen.findByText(STEM_1);
    await answerFirstEnabled();
    await waitFor(() => expect(footer()).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^(Next|See results)$/ })).toBeNull();
    expect(screen.queryByTestId("pro-play-next")).toBeNull();
    // The reveal and its accessibility are intact: the live verdict sentence,
    // the explanation and the Source disclosure.
    expect(footer()!.querySelector("[data-pp-reveal-verdict]")?.getAttribute("role")).toBe("status");
    expect(footer()!.querySelector("[data-pp-reveal-explanation]")?.textContent).toBeTruthy();
    expect(footer()!.querySelector("[data-pp-reveal-source]")).toBeTruthy();
    expect(footer()!.getAttribute("data-auto-advance")).toBe("pending");
    expect(footer()!.getAttribute("data-advance-paused")).toBe("false");
    expect(screen.getByTestId("pro-play-advance-meter")).toBeTruthy();
  });

  it("holds the reveal for its reading time, then moves on exactly once", async () => {
    const fetchMock = installServer();
    renderPage();
    await screen.findByText(STEM_1);
    await answerFirstEnabled();
    await waitFor(() => expect(footer()).toBeTruthy());

    await spend(900);
    expect(footer()).toBeTruthy();
    expect(screen.queryByText(STEM_2)).toBeNull();

    await spend(30_000);
    expect(await screen.findByText(STEM_2)).toBeTruthy();
    expect(footer()).toBeNull();
    // One start and one answer: advancing used the delivered question, not the
    // network, and a later tick cannot advance again.
    await spend(60_000);
    expect(screen.getByText(STEM_2)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never advances while the grade is still pending", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    installServer({ gate });
    renderPage();
    await screen.findByText(STEM_1);
    await answerFirstEnabled();

    await spend(120_000);
    expect(footer()).toBeNull();
    expect(screen.getByText(STEM_1)).toBeTruthy();
    expect(screen.queryByText(STEM_2)).toBeNull();

    // Once the server grades, the hold starts from there and not before.
    await act(async () => { release(); });
    await waitFor(() => expect(footer()).toBeTruthy());
    await spend(500);
    expect(screen.getByText(STEM_1)).toBeTruthy();
    await spend(30_000);
    expect(await screen.findByText(STEM_2)).toBeTruthy();
  });

  it("holds still while the player is inside the reveal, and resumes when they leave", async () => {
    installServer();
    renderPage();
    await screen.findByText(STEM_1);
    await answerFirstEnabled();
    await waitFor(() => expect(footer()).toBeTruthy());

    const source = footer()!.querySelector<HTMLElement>("[data-pp-reveal-source]")!;
    await act(async () => { source.focus(); });
    await waitFor(() => expect(footer()!.getAttribute("data-advance-paused")).toBe("true"));
    await spend(120_000);
    expect(screen.getByText(STEM_1)).toBeTruthy();
    expect(footer()).toBeTruthy();

    await act(async () => { source.blur(); });
    await waitFor(() => expect(footer()!.getAttribute("data-advance-paused")).toBe("false"));
    await spend(30_000);
    expect(await screen.findByText(STEM_2)).toBeTruthy();
  });

  it("keeps the held reveal box one row: per-option statistics are read in Source, and stay for screen readers", async () => {
    installServer();
    renderPage();
    await screen.findByText(STEM_1);
    await answerFirstEnabled();
    await waitFor(() => expect(footer()).toBeTruthy());
    expect(footer()!.getAttribute("data-pp-reveal-dense")).toBe("true");
    // Not drawn under the sentence (that would grow the box by a row per option)...
    expect(footer()!.querySelector('[data-pp-reveal-readout="visible"]')).toBeNull();
    // ...but still in the footer for assistive technology.
    expect(footer()!.querySelector('[data-pp-reveal-readout="sr-only"] li')).toBeTruthy();
    // And one press away, with the same rows, in the Source disclosure.
    expect(document.querySelector('[data-pp-reveal-readout="source"]')).toBeNull();
    const source = footer()!.querySelector<HTMLElement>("[data-pp-reveal-source]")!;
    await act(async () => { fireEvent.click(source); });
    const rows = await waitFor(() => {
      const list = document.querySelector('[data-pp-reveal-readout="source"]');
      expect(list).toBeTruthy();
      return list!.querySelectorAll("li");
    });
    expect(rows.length).toBe(4);
  });

  it("draws the anchor plate on a tall screen and leaves it out on a compact one", async () => {
    installServer();
    const first = renderPage();
    await screen.findByText(STEM_1);
    expect(document.querySelector('[data-surface-region="media"]')?.textContent ?? "").toMatch(/qualifying region/i);
    first.unmount();

    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-height: 760px"), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }));
    installServer();
    renderPage();
    await screen.findByText(STEM_1);
    expect(document.querySelector('[data-surface-region="media"]')?.textContent ?? "").not.toMatch(/qualifying region/i);
    // The question is still fully on stage.
    expect(document.querySelectorAll("[data-quiz-choice]")).toHaveLength(4);
  });

  it("moves focus to the new question's stem after an automatic advance", async () => {
    installServer();
    renderPage();
    await screen.findByText(STEM_1);
    await answerFirstEnabled();
    await waitFor(() => expect(footer()).toBeTruthy());
    await spend(30_000);
    const stem = await screen.findByText(STEM_2);
    await waitFor(() => expect(document.activeElement).toBe(stem.closest("h2") ?? stem));
  });
});

describe("Worlds 2026 Quiz — header row", () => {
  it("carries the way back, the position and mogzy.lol on a question", async () => {
    installServer();
    renderPage();
    await screen.findByText(STEM_1);
    expect(screen.getByTestId("pro-play-brand").textContent).toBe("mogzy.lol");
    const back = screen.getByTestId("pro-play-back");
    expect(back.textContent).toBe("Back to Worlds");
    expect(back.getAttribute("href")).toBe(WORLDS_EXPERIENCE_BASE);
    expect(screen.getAllByTestId("pro-play-back")).toHaveLength(1);
    expect(screen.getByTestId("pro-play-position").textContent).toContain("1 / 10");
  });

  it("shows mogzy.lol while loading and when the quiz is unavailable", async () => {
    installServer({ unavailable: true });
    renderPage();
    expect(screen.getByTestId("pro-play-brand").textContent).toBe("mogzy.lol");
    await screen.findByTestId("pro-play-unavailable");
    expect(screen.getByTestId("pro-play-brand").textContent).toBe("mogzy.lol");
  });

  it("shows mogzy.lol on the end panel", async () => {
    installServer();
    renderPage();
    await screen.findByText(STEM_1);
    for (let n = 1; n <= ANSWERS.length; n += 1) {
      await answerFirstEnabled();
      await waitFor(() => expect(footer()).toBeTruthy());
      await spend(30_000);
    }
    await screen.findByTestId("pro-play-summary");
    expect(screen.getByTestId("pro-play-brand").textContent).toBe("mogzy.lol");
    expect(screen.queryByRole("button", { name: /^(Next|See results)$/ })).toBeNull();
  });
});
