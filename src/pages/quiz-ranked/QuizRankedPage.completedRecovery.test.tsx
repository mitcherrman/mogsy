/**
 * RECONSTRUCT-R3C — a reload during the final reveal, the outro or the end
 * screen keeps the player's result.
 *
 * The final round completes the match in the lock transaction, so from then on
 * account discovery (`/active-match`) rightly reports nothing to play, and a
 * reload without router state used to drop the player on the lobby. The route
 * now falls back to the match this TAB was presenting (`presentedMatchHint`),
 * and mounts it only once the server's participant-gated, terminal-only
 * `/result` read answers for it. Pinned here:
 *
 *   * hint + no active match + served result -> the same match, as a recovery;
 *   * a refused result (403 not a participant, 409 still live, 404) -> lobby,
 *     and the hint is retired so it can never loop;
 *   * another account's hint, or a stale one, is never consulted;
 *   * an active match from discovery always wins over the hint;
 *   * the hint is written when a match mounts, kept across a reload, and
 *     retired when the player leaves a finished match on purpose.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import type { MatchPhase } from "./useRankedMatch";

const NativeRequest = globalThis.Request;
class RouterTestRequest {
  readonly url: string;
  readonly method: string;
  readonly signal: AbortSignal | null;
  readonly headers: Headers;
  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = String(input);
    this.method = init.method ?? "GET";
    this.signal = init.signal ?? null;
    this.headers = new Headers(init.headers);
  }
}

const h = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    kind = "backend";
    code: string | null;
    constructor(status: number, code: string | null = null) { super(`HTTP ${status}`); this.status = status; this.code = code; }
  }
  return { getActiveMatch: vi.fn(), getMatchResult: vi.fn(), ApiError };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "viewer-uuid", is_anonymous: false } }),
}));

// The live view is stubbed: these tests are about WHICH match the route enters
// and how it treats the hint. The stub exposes the two callbacks the real
// controller drives (phase changes and the end screen's terminal actions).
vi.mock("./QuizRankedMatch", () => ({
  QuizRankedMatch: ({ matchId, entry, onPhaseChange, onTerminalNavigate }: {
    matchId: string; entry?: string;
    onPhaseChange?: (p: MatchPhase) => void; onTerminalNavigate?: (d: string) => void;
  }) => (
    <div data-testid="match-view" data-entry={entry}>
      {matchId}
      <button type="button" data-testid="phase-over" onClick={() => onPhaseChange?.("match_over")}>over</button>
      <button type="button" data-testid="phase-active" onClick={() => onPhaseChange?.("active")}>active</button>
      <button type="button" data-testid="to-lobby" onClick={() => onTerminalNavigate?.("/quiz")}>lobby</button>
    </div>
  ),
}));

vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: h.getActiveMatch,
  getMatchResult: h.getMatchResult,
  isAborted: (e: unknown) => (e as { name?: string })?.name === "AbortError",
  RankedApiError: h.ApiError,
}));

import QuizRankedPage from "./QuizRankedPage";
import { MAX_AGE_MS, rememberPresentedMatch } from "./presentedMatchHint";

const KEY = "mogzy.ranked.presentedMatch.v1";
const hint = () => {
  const raw = window.sessionStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as { matchId: string; viewer: string }) : null;
};

beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });
beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { vi.clearAllMocks(); window.sessionStorage.clear(); });

function LobbyProbe() {
  const location = useLocation();
  return <div data-testid="lobby">{location.pathname}</div>;
}

function renderPage(initial: { pathname: string; state?: unknown } = { pathname: "/quiz/ranked" }) {
  const router = createMemoryRouter([
    { path: "/quiz/ranked", element: <QuizRankedPage /> },
    { path: "/quiz", element: <LobbyProbe /> },
    { path: "/elsewhere", element: <div data-testid="elsewhere" /> },
  ], { initialEntries: [initial] });
  return { router, ...render(<RouterProvider router={router} />) };
}

describe("RECONSTRUCT-R3C — reload into a match that has just completed", () => {
  it("no active match, a hint, and a served result: the same match, entered as a recovery", async () => {
    rememberPresentedMatch("viewer-uuid", "rkb_done");
    h.getActiveMatch.mockResolvedValue(null);
    h.getMatchResult.mockResolvedValue({ matchId: "rkb_done" });
    renderPage();
    const view = await screen.findByTestId("match-view");
    expect(view).toHaveTextContent("rkb_done");
    expect(view).toHaveAttribute("data-entry", "recovered");
    expect(h.getMatchResult).toHaveBeenCalledWith("rkb_done", expect.anything());
    expect(screen.queryByTestId("lobby")).toBeNull();
  });

  it.each([
    [403, "RANKED_NOT_A_PARTICIPANT"],
    [409, "RANKED_MATCH_NOT_COMPLETE"],
    [404, null],
  ])("a refused result (%i) sends the player to the lobby and retires the hint", async (status, code) => {
    rememberPresentedMatch("viewer-uuid", "rkb_x");
    h.getActiveMatch.mockResolvedValue(null);
    h.getMatchResult.mockRejectedValue(new h.ApiError(status, code));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("lobby")).toHaveTextContent("/quiz"));
    expect(screen.queryByTestId("match-view")).toBeNull();
    expect(hint()).toBeNull();
  });

  it("a network failure on the result read goes to the lobby but keeps the hint for a later reload", async () => {
    rememberPresentedMatch("viewer-uuid", "rkb_net");
    h.getActiveMatch.mockResolvedValue(null);
    h.getMatchResult.mockRejectedValue(new TypeError("Failed to fetch"));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("lobby")).toBeInTheDocument());
    expect(hint()?.matchId).toBe("rkb_net");
  });

  it("another account's hint is never consulted", async () => {
    rememberPresentedMatch("someone-else", "rkb_theirs");
    h.getActiveMatch.mockResolvedValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("lobby")).toBeInTheDocument());
    expect(h.getMatchResult).not.toHaveBeenCalled();
  });

  it("a stale hint is ignored and removed", async () => {
    rememberPresentedMatch("viewer-uuid", "rkb_old", Date.now() - MAX_AGE_MS - 1);
    h.getActiveMatch.mockResolvedValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("lobby")).toBeInTheDocument());
    expect(h.getMatchResult).not.toHaveBeenCalled();
    expect(hint()).toBeNull();
  });

  it("an ACTIVE match from discovery always wins: a completed match is never treated as active", async () => {
    rememberPresentedMatch("viewer-uuid", "rkb_done");
    h.getActiveMatch.mockResolvedValue({ matchId: "rkb_live", isBotMatch: true, host: null });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("match-view")).toHaveTextContent("rkb_live"));
    expect(h.getMatchResult).not.toHaveBeenCalled();
  });

  it("with no hint and no active match the route still returns to the lobby (unchanged)", async () => {
    h.getActiveMatch.mockResolvedValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("lobby")).toBeInTheDocument());
    expect(h.getMatchResult).not.toHaveBeenCalled();
  });
});

describe("RECONSTRUCT-R3C — the hint's lifetime", () => {
  it("is written when a match mounts (handoff) and survives the page going away mid-match", async () => {
    const { unmount } = renderPage({ pathname: "/quiz/ranked", state: { matchId: "rkb_handoff" } });
    await screen.findByTestId("match-view");
    expect(hint()).toEqual(expect.objectContaining({ matchId: "rkb_handoff", viewer: "viewer-uuid" }));
    expect(h.getActiveMatch).not.toHaveBeenCalled();
    // A live match left behind keeps it: discovery finds that one anyway.
    fireEvent.click(screen.getByTestId("phase-active"));
    unmount();
    expect(hint()?.matchId).toBe("rkb_handoff");
  });

  it("an end-screen action retires it, so the next visit cannot reopen the old result", async () => {
    renderPage({ pathname: "/quiz/ranked", state: { matchId: "rkb_end" } });
    await screen.findByTestId("match-view");
    fireEvent.click(screen.getByTestId("phase-over"));
    fireEvent.click(screen.getByTestId("to-lobby"));
    await waitFor(() => expect(screen.getByTestId("lobby")).toBeInTheDocument());
    expect(hint()).toBeNull();
  });

  it("navigating away from a FINISHED match retires it", async () => {
    const { router } = renderPage({ pathname: "/quiz/ranked", state: { matchId: "rkb_away" } });
    await screen.findByTestId("match-view");
    fireEvent.click(screen.getByTestId("phase-over"));
    await act(async () => { await router.navigate("/elsewhere"); });
    expect(screen.getByTestId("elsewhere")).toBeInTheDocument();
    expect(hint()).toBeNull();
  });
});
