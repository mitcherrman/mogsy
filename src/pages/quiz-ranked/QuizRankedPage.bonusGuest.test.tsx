/**
 * PGM2 — `/quiz/ranked` and a bonus game handed over by More Challenges.
 *
 * Bonus games are open to verified guests (owner decision). The route lets a
 * guest in for EXACTLY a `bonus_game` hand-off (match id + origin), which the
 * backend guards again (host-scoped, membership-checked). Every other Ranked
 * entry keeps the account gate, which now also points a guest back to More
 * Challenges.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { ReactNode } from "react";

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

const h = vi.hoisted(() => ({
  getActiveMatch: vi.fn(),
  user: { id: "guest-uuid", is_anonymous: true } as { id: string; is_anonymous: boolean } | null,
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("@/hooks/useProfileIdentity", () => ({ useProfileIdentity: () => ({ displayName: null }) }));
vi.mock("./QuizRankedMatch", () => ({
  QuizRankedMatch: ({ matchId, viewerUserId, origin, chrome }: {
    matchId: string; viewerUserId: string; origin?: { id: string; href: string } | null; chrome?: ReactNode;
  }) => (
    <div data-testid="match-view" data-viewer={viewerUserId} data-origin={origin?.id ?? "none"}
      data-origin-href={origin?.href ?? ""}>{matchId}{chrome}</div>
  ),
}));
vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: h.getActiveMatch,
  getMatchResult: vi.fn(),
  isAborted: () => false,
  RankedApiError: class extends Error {},
}));

import QuizRankedPage, { isBonusHandoff } from "./QuizRankedPage";

beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });
afterEach(() => {
  vi.clearAllMocks();
  h.user = { id: "guest-uuid", is_anonymous: true };
});

function renderRoute(state?: unknown) {
  const router = createMemoryRouter([
    { path: "/quiz/ranked", element: <QuizRankedPage /> },
    { path: "/quiz/more-challenges", element: <div data-testid="more-challenges" /> },
    { path: "/quiz", element: <div data-testid="lobby" /> },
  ], { initialEntries: [{ pathname: "/quiz/ranked", state }] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("PGM2 — a guest on /quiz/ranked", () => {
  it("plays a bonus game More Challenges handed over, and goes back there", async () => {
    renderRoute({ matchId: "rbg_1", origin: "bonus_game" });
    const view = await screen.findByTestId("match-view");
    expect(view).toHaveTextContent("rbg_1");
    expect(view.dataset.viewer).toBe("guest-uuid");
    expect(view.dataset.origin).toBe("bonus_game");
    expect(view.dataset.originHref).toBe("/quiz/more-challenges");
    expect(screen.queryByTestId("ranked-account-required")).toBeNull();
  });

  it("is still asked for an account for any other Ranked entry, with a way back to bonus games", () => {
    for (const state of [undefined, { matchId: "m-plain" }, { matchId: "rkb_j", origin: "journey_library" },
      { origin: "bonus_game" }]) {
      const { unmount } = render(<RouterProvider router={createMemoryRouter([
        { path: "/quiz/ranked", element: <QuizRankedPage /> },
      ], { initialEntries: [{ pathname: "/quiz/ranked", state }] })} />);
      expect(screen.getByTestId("ranked-account-required")).toBeInTheDocument();
      expect(screen.getByTestId("ranked-bonus-return")).toHaveAttribute("href", "/quiz/more-challenges");
      expect(screen.queryByTestId("match-view")).toBeNull();
      unmount();
    }
  });

  it("a signed-out visitor (no session at all) is never let in, even with a bonus hand-off", () => {
    h.user = null;
    renderRoute({ matchId: "rbg_1", origin: "bonus_game" });
    expect(screen.getByTestId("ranked-account-required")).toBeInTheDocument();
  });

  it("an account plays exactly as before", async () => {
    h.user = { id: "acct", is_anonymous: false };
    renderRoute({ matchId: "rbg_2", origin: "bonus_game" });
    expect((await screen.findByTestId("match-view")).dataset.viewer).toBe("acct");
  });

  it("recognises only a complete bonus hand-off", () => {
    expect(isBonusHandoff({ matchId: "x", origin: "bonus_game" })).toBe(true);
    expect(isBonusHandoff({ matchId: "", origin: "bonus_game" })).toBe(false);
    expect(isBonusHandoff({ matchId: "x", origin: "journey_library" })).toBe(false);
    expect(isBonusHandoff(null)).toBe(false);
  });
});
