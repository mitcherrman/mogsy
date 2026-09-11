/**
 * THE RULES SCROLL CANNOT TOUCH THE MATCH.
 *
 * The scroll is mounted next to a LIVE Ranked arena on a server clock, and a
 * first-time player meets it with a round already running. That makes one
 * question the important one, and it is not "does it look right": can reading
 * the rules change the duel? So this file mounts the real `QuizRankedMatch`
 * against backend-shaped payloads — the same harness `QuizRankedMatch.points`
 * uses — opens and closes the scroll on a live round, and asserts that nothing
 * the match owns moved:
 *
 *   * neither score,
 *   * the module number,
 *   * the timer,
 *   * the question surface, and the identity of its DOM node (a remount would
 *     replace it, and a remount of a timed question is the one failure that
 *     would cost a player the round),
 *   * the answer selection, and the fact that nothing was submitted.
 *
 * The last is checked at the transport: opening the scroll must issue no
 * request at all, so it cannot answer, forfeit, or nudge presence.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installLocalStorageStub } from "@/test/localStorageStub";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import { privatePlayerV2, publicRoundV2, withPointsScoring } from "@/lib/ranked-public/fixtures";
import { markRankedRulesSeen, RANKED_RULES_VERSION } from "@/lib/ranked/ranked-rules-seen";

const resetStorage = installLocalStorageStub();

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
});

/** A mid-match points round: Module 5 of 10, 11 – 8, with a live question. */
const POINTS = {
  moduleNumber: 5, matchLength: 10, modulesCompleted: 4,
  scores: { userA: 11, userB: 8 },
};

function shape<T extends { payload: Record<string, unknown> }>(env: T): T {
  env.payload.progression_enabled = false;
  for (const p of env.payload.players as Record<string, unknown>[]) p.role = "top";
  return withPointsScoring(env, POINTS) as T;
}
const publicBody = () => shape(publicRoundV2());
const privateBody = () => shape(privatePlayerV2("userA"));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStorage();
  fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-07-18T12:00:00+00:00",
        payload: {
          match_status: "active", match_over: false, progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null, result: null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (/\/matches\/m1$/.test(u)) return json(publicBody());
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); resetStorage(); });

async function mount() {
  const view = render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
  await screen.findByTestId("ranked-match");
  await waitFor(() =>
    expect(screen.getByTestId("score-userA")).toHaveAttribute("data-score", "11"));
  return view;
}

/** Everything the match owns that a floating panel must not be able to move. */
function matchState() {
  // The answer grid IS the live surface on a points module: the question
  // prompt and its tablets are rendered by the module's own renderer inside
  // it, so this node is what a remount would replace.
  const surface = screen.getByTestId("answer-grid");
  return {
    you: screen.getByTestId("score-userA").getAttribute("data-score"),
    them: screen.getByTestId("score-userB").getAttribute("data-score"),
    module: screen.getByTestId("ranked-header-title").textContent,
    timer: screen.queryByTestId("timer-value")?.textContent ?? null,
    prompt: surface.textContent,
    // Node IDENTITY, not its text: a remount produces an equal-looking node
    // that is a different object, and that is exactly the failure to catch.
    surfaceNode: surface,
  };
}

describe("the scroll sits beside the arena, and only beside it", () => {
  it("a first-time player meets a live round with the rules already open", async () => {
    await mount();
    expect(screen.getByTestId("ranked-rules-panel")).toBeInTheDocument();
    // And the match is drawn underneath it, untouched.
    expect(screen.getByTestId("ranked-header-title")).toHaveTextContent("Module 5 / 10");
  });

  it("a returning player meets the same round with only the tab", async () => {
    markRankedRulesSeen(RANKED_RULES_VERSION);
    await mount();
    expect(screen.queryByTestId("ranked-rules-panel")).toBeNull();
    expect(screen.getByTestId("ranked-rules-tab")).toBeInTheDocument();
  });

  it("opening and closing it mid-round moves nothing the match owns", async () => {
    markRankedRulesSeen(RANKED_RULES_VERSION);
    await mount();
    const before = matchState();

    fireEvent.click(screen.getByTestId("ranked-rules-tab"));
    expect(screen.getByTestId("ranked-rules-panel")).toBeInTheDocument();
    expect(matchState()).toEqual(before);

    fireEvent.click(screen.getByTestId("ranked-rules-acknowledge"));
    expect(screen.queryByTestId("ranked-rules-panel")).toBeNull();
    expect(matchState()).toEqual(before);
  });

  it("issues no request of its own — it cannot answer, forfeit or ping", async () => {
    markRankedRulesSeen(RANKED_RULES_VERSION);
    await mount();

    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByTestId("ranked-rules-tab"));
    fireEvent.click(screen.getByTestId("ranked-rules-acknowledge"));

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("leaves the answer selection exactly where the player left it", async () => {
    markRankedRulesSeen(RANKED_RULES_VERSION);
    await mount();

    // The grid's own state attribute plus every tablet's — the whole of what
    // "which answer is chosen" looks like in the DOM.
    const grid = screen.getByTestId("answer-grid");
    const selectedState = () => [
      grid.getAttribute("data-answers-state"),
      ...Array.from(grid.querySelectorAll("[data-quiz-choice]")).map(
        (c) => `${c.getAttribute("data-choice-state")}:${c.getAttribute("aria-pressed")}`),
    ];
    const before = selectedState();
    expect(before.length).toBeGreaterThan(1);

    fireEvent.click(screen.getByTestId("ranked-rules-tab"));
    expect(selectedState()).toEqual(before);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(selectedState()).toEqual(before);
  });
});
