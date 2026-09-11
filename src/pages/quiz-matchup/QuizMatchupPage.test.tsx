/**
 * Matchup Study page (Step 12).
 *
 * The server owns the session and every answer, so these tests drive the page
 * through a stubbed `/api/quiz/matchup/*` and assert what the PAGE is
 * responsible for: reading the pair from the URL, naming the pair it was
 * actually given, saying honestly which tier the session reached, reusing the
 * production answer grid, and failing safely on every malformed link rather
 * than falling back to a generic quiz.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuizMatchupPage from "./QuizMatchupPage";

const TOTAL = 4;

function question(n: number, champions: string[], tier = "pair_comparison") {
  return {
    index: n - 1,
    number: n,
    total: TOTAL,
    question_id: `q${n}`,
    question_text: `Question ${n} about ${champions.join(" and ")}?`,
    choices: [`A${n}`, `B${n}`],
    tier,
    champions,
    image_path: null,
  };
}

function sessionState(over: Record<string, unknown> = {}) {
  return {
    session_id: "s1",
    champion_a: "Olaf",
    champion_b: "K'Sante",
    tier: "pair_comparison",
    champion_a_icon: "assets/champions/Olaf/icon.png",
    champion_b_icon: "assets/champions/KSante/icon.png",
    total: TOTAL,
    answered: 0,
    score: 0,
    complete: false,
    ...over,
  };
}

function installServer(opts: { error?: { status: number; code: string; message: string };
                               tier?: string } = {}) {
  let answered = 0;
  const tier = opts.tier ?? "pair_comparison";
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url);
    if (path.endsWith("/api/quiz/matchup/sessions") && init?.method === "POST") {
      if (opts.error) {
        return {
          ok: false,
          status: opts.error.status,
          json: async () => ({ detail: { code: opts.error!.code, message: opts.error!.message } }),
        } as unknown as Response;
      }
      answered = 0;
      return {
        ok: true,
        json: async () => ({
          schema_version: 1,
          session: sessionState({ tier }),
          question: question(1, ["Olaf", "K'Sante"], tier),
        }),
      } as unknown as Response;
    }
    if (path.includes("/answer") && init?.method === "POST") {
      answered += 1;
      const complete = answered >= TOTAL;
      return {
        ok: true,
        json: async () => ({
          schema_version: 1,
          result: {
            is_correct: true,
            selected_answer: `A${answered}`,
            correct_answer: `A${answered}`,
            explanation: `Because of ${answered}.`,
          },
          session: sessionState({ tier, answered, score: answered, complete }),
          question: complete ? null : question(answered + 1, ["Olaf"], "paired_study"),
        }),
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/quiz/matchup${search}`]}>
      <Routes>
        <Route path="/quiz/matchup" element={<QuizMatchupPage />} />
        <Route path="/quiz" element={<div>Leaguecraft lobby</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the matchup study reads its pair from the URL", () => {
  it("starts a session for the two slugs in the query", async () => {
    const fetchMock = installServer();
    renderAt("?a=olaf&b=ksante");
    await screen.findByTestId("matchup-study-question");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ a: "olaf", b: "ksante" });
  });

  it("names the pair the SERVER confirmed, not the slugs in the link", async () => {
    installServer();
    renderAt("?a=olaf&b=ksante");
    expect(await screen.findByTestId("matchup-study-pair")).toHaveTextContent("Olaf vs K'Sante");
  });

  it("survives a reload of the same URL", async () => {
    installServer();
    const { unmount } = renderAt("?a=olaf&b=ksante");
    await screen.findByTestId("matchup-study-question");
    unmount();
    renderAt("?a=olaf&b=ksante");
    expect(await screen.findByTestId("matchup-study-pair")).toHaveTextContent("Olaf vs K'Sante");
  });

  it("opens a punctuation-heavy pair from a plain slug", async () => {
    const fetchMock = installServer();
    renderAt("?a=dr-mundo&b=chogath");
    await screen.findByTestId("matchup-study-question");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ a: "dr-mundo", b: "chogath" });
  });
});

describe("the study says what it actually is", () => {
  it("calls a session that reached true pair questions a Matchup Study", async () => {
    installServer();
    renderAt("?a=olaf&b=ksante");
    expect(await screen.findByTestId("matchup-study-tier")).toHaveTextContent("Matchup Study");
  });

  it("calls a fallback session a Two-Champion Study instead", async () => {
    // The honest label for a pair with no true comparison inventory. Calling
    // it a matchup would be the one claim this feature must never make.
    installServer({ tier: "paired_study" });
    renderAt("?a=gnar&b=jayce");
    expect(await screen.findByTestId("matchup-study-tier")).toHaveTextContent(
      "Two-Champion Study",
    );
  });

  it("shows both champions' media", async () => {
    installServer();
    renderAt("?a=olaf&b=ksante");
    const header = await screen.findByTestId("matchup-study-header");
    const icons = header.querySelectorAll("img");
    expect(icons).toHaveLength(2);
    expect(icons[0].getAttribute("src")).toContain("assets/champions/Olaf/icon.png");
    expect(icons[1].getAttribute("src")).toContain("assets/champions/KSante/icon.png");
  });
});

describe("it plays like a normal Leaguecraft question", () => {
  it("reveals from the server's result and advances", async () => {
    installServer();
    renderAt("?a=olaf&b=ksante");
    fireEvent.click(await screen.findByText("A1"));
    expect(await screen.findByText("Because of 1.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Next"));
    await waitFor(() =>
      expect(screen.getByTestId("matchup-study-question")).toHaveTextContent("Question 2"),
    );
  });

  it("tracks progress and finishes on a score", async () => {
    installServer();
    renderAt("?a=olaf&b=ksante");
    await screen.findByTestId("matchup-study-question");
    expect(screen.getByTestId("matchup-study-progress")).toHaveTextContent("1 / 4");
    for (let n = 1; n <= TOTAL; n += 1) {
      fireEvent.click(await screen.findByText(`A${n}`));
      await screen.findByText(`Because of ${n}.`);
      fireEvent.click(screen.getByText(n === TOTAL ? "See results" : "Next"));
    }
    const summary = await screen.findByTestId("matchup-study-summary");
    expect(within(summary).getByText("4 / 4")).toBeInTheDocument();
  });

  it("never invents an answer of its own", async () => {
    // Everything revealed comes from the server's graded result. The page
    // holds no answer key, which is why a mid-session bank change cannot make
    // the page and the server disagree.
    installServer();
    renderAt("?a=olaf&b=ksante");
    fireEvent.click(await screen.findByText("A1"));
    await screen.findByText("Because of 1.");
    expect(screen.queryByText(/correct answer/i)).toBeNull();
  });
});

describe("a broken link fails safely, and never becomes a generic quiz", () => {
  it("refuses a link with no opponent without calling the server", async () => {
    const fetchMock = installServer();
    renderAt("?a=olaf");
    expect(await screen.findByTestId("matchup-study-error")).toHaveTextContent(
      "needs two champions",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a link with no champions at all", async () => {
    const fetchMock = installServer();
    renderAt("");
    await screen.findByTestId("matchup-study-error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's own words for an unknown champion", async () => {
    installServer({
      error: { status: 404, code: "MATCHUP_UNKNOWN_CHAMPION",
               message: "That champion is not in the roster." },
    });
    renderAt("?a=olaf&b=not-a-champion");
    expect(await screen.findByTestId("matchup-study-error")).toHaveTextContent(
      "not in the roster",
    );
  });

  it("shows the server's own words for a mirror pair", async () => {
    installServer({
      error: { status: 400, code: "MATCHUP_SAME_CHAMPION",
               message: "A matchup needs two different champions." },
    });
    renderAt("?a=olaf&b=olaf");
    expect(await screen.findByTestId("matchup-study-error")).toHaveTextContent(
      "two different champions",
    );
  });

  it("says a pair has nothing to study rather than studying something else", async () => {
    installServer({
      error: { status: 404, code: "MATCHUP_NO_QUESTIONS",
               message: "There are no study questions for X vs Y yet." },
    });
    renderAt("?a=x&b=y");
    const error = await screen.findByTestId("matchup-study-error");
    expect(error).toHaveTextContent("no study questions");
    expect(screen.queryByTestId("matchup-study-question")).toBeNull();
  });
});
