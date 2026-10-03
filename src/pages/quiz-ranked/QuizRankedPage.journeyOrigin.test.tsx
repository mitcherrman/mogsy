/**
 * JLIB-FE — a match the Journey Library started enters `/quiz/ranked` like
 * any handoff, and carries its way back to the Library.
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

const h = vi.hoisted(() => ({ getActiveMatch: vi.fn() }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "owner-uuid", is_anonymous: false } }),
}));
vi.mock("@/hooks/useProfileIdentity", () => ({
  useProfileIdentity: () => ({ displayName: null }),
}));
vi.mock("./QuizRankedMatch", () => ({
  QuizRankedMatch: ({ matchId, origin, chrome }:
  { matchId: string; origin?: { id: string; href: string } | null; chrome?: ReactNode }) => (
    <div data-testid="match-view" data-origin={origin?.id ?? "none"}
      data-origin-href={origin?.href ?? ""}>{matchId}{chrome}</div>
  ),
}));
vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: h.getActiveMatch,
  isAborted: () => false,
  RankedApiError: class extends Error {},
}));

import QuizRankedPage from "./QuizRankedPage";
import { readMatchOrigin } from "./matchOrigin";

beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });
afterEach(() => vi.clearAllMocks());

function renderRoute(state?: unknown) {
  const router = createMemoryRouter([
    { path: "/quiz/ranked", element: <QuizRankedPage /> },
  ], { initialEntries: [{ pathname: "/quiz/ranked", state }] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("readMatchOrigin", () => {
  it("maps the journey_library host to its user-facing label and route", () => {
    expect(readMatchOrigin({ matchId: "m", origin: "journey_library" })).toMatchObject({
      label: "Journey Library", href: "/quiz/journeys", returnLabel: "Back to Journey Library",
    });
    expect(readMatchOrigin({ origin: "something_else" })).toBeNull();
    expect(readMatchOrigin(null)).toBeNull();
  });
});

describe("/quiz/ranked with a Journey Library handoff", () => {
  it("enters the handed-over match and passes the Library origin and back link", async () => {
    const router = renderRoute({ matchId: "rkb_j1", origin: "journey_library" });
    const view = await screen.findByTestId("match-view");
    expect(view).toHaveTextContent("rkb_j1");
    expect(view.dataset.origin).toBe("journey_library");
    expect(view.dataset.originHref).toBe("/quiz/journeys");
    expect(h.getActiveMatch).not.toHaveBeenCalled();
    // The active-match link still reads Leave Match, and leads to the Library.
    const back = screen.getByTestId("ranked-back-to-quiz");
    expect(back).toHaveTextContent("Leave Match");
    expect(back.getAttribute("href")).toBe("/quiz/journeys");
    // The freshness replace keeps the origin, so a reload still knows it.
    expect((router.state.location.state as { origin?: string }).origin).toBe("journey_library");
  });

  it("leaves an ordinary lobby handoff exactly as it was", async () => {
    renderRoute({ matchId: "m-plain" });
    const view = await screen.findByTestId("match-view");
    expect(view.dataset.origin).toBe("none");
    expect(screen.getByTestId("ranked-back-to-quiz").getAttribute("href")).toBe("/quiz");
  });
});
