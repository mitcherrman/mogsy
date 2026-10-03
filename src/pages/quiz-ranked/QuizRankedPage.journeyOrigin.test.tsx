/**
 * JLIB-FE — a match the Journey Library started enters `/quiz/ranked` like
 * any handoff, and carries its way back to the Library.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { useEffect, type ReactNode } from "react";

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
  /** JLIB-HOST — the host the stub arena's snapshot "reports"; `undefined`
   *  stands for a snapshot that has not reported one. */
  persistedHost: undefined as string | null | undefined,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "owner-uuid", is_anonymous: false } }),
}));
vi.mock("@/hooks/useProfileIdentity", () => ({
  useProfileIdentity: () => ({ displayName: null }),
}));
vi.mock("./QuizRankedMatch", async () => {
  // The real precedence rule, so the stub resolves exactly as the arena does.
  const { resolveMatchOrigin } = await import("./matchOrigin");
  type Origin = import("./matchOrigin").RankedMatchOrigin;
  return {
    QuizRankedMatch: ({ matchId, origin, chrome, onOriginChange }: {
      matchId: string; origin?: Origin | null; chrome?: ReactNode;
      onOriginChange?: (o: Origin | null) => void;
    }) => {
      const resolved = resolveMatchOrigin(h.persistedHost, origin ?? null);
      useEffect(() => { onOriginChange?.(resolved); }, [resolved, onOriginChange]);
      return (
        <div data-testid="match-view" data-origin={origin?.id ?? "none"}
          data-origin-href={origin?.href ?? ""}
          data-resolved={resolved?.id ?? "none"}>{matchId}{chrome}</div>
      );
    },
  };
});
vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: h.getActiveMatch,
  isAborted: () => false,
  RankedApiError: class extends Error {},
}));

import QuizRankedPage from "./QuizRankedPage";
import { readMatchOrigin } from "./matchOrigin";

beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });
afterEach(() => { vi.clearAllMocks(); h.persistedHost = undefined; });

function renderRoute(state?: unknown) {
  const router = createMemoryRouter([
    { path: "/quiz/ranked", element: <QuizRankedPage /> },
    { path: "/quiz/daily-challenge", element: <div data-testid="daily-page" /> },
    { path: "/quiz", element: <div data-testid="lobby" /> },
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

describe("JLIB-HOST — the persisted host identifies a recovered Journey match", () => {
  it("recovers a journey_library match with no router state: Library origin and back link", async () => {
    h.getActiveMatch.mockResolvedValue({
      matchId: "rkb_j2", isBotMatch: true, reconnectDeadline: null,
      withinReconnectWindow: true, host: "journey_library",
    });
    renderRoute();
    const view = await screen.findByTestId("match-view");
    expect(view).toHaveTextContent("rkb_j2");
    expect(view.dataset.origin).toBe("journey_library");
    const back = screen.getByTestId("ranked-back-to-quiz");
    expect(back).toHaveTextContent("Leave Match");
    expect(back.getAttribute("href")).toBe("/quiz/journeys");
    // The raw host id is never on the page.
    expect(document.body.textContent).not.toContain("journey_library");
  });

  it("recovers an ordinary null-host match exactly as before", async () => {
    h.getActiveMatch.mockResolvedValue({
      matchId: "m-null", isBotMatch: true, reconnectDeadline: null,
      withinReconnectWindow: true, host: null,
    });
    renderRoute();
    const view = await screen.findByTestId("match-view");
    expect(view.dataset.origin).toBe("none");
    expect(screen.getByTestId("ranked-back-to-quiz").getAttribute("href")).toBe("/quiz");
  });

  it.each(["study_hall", "playtest", "direct"])(
    "does not reinterpret a %s host as a Journey", async (host) => {
      h.getActiveMatch.mockResolvedValue({
        matchId: "m-other", isBotMatch: true, reconnectDeadline: null,
        withinReconnectWindow: true, host,
      });
      renderRoute();
      const view = await screen.findByTestId("match-view");
      expect(view.dataset.origin).toBe("none");
      expect(screen.getByTestId("ranked-back-to-quiz").getAttribute("href")).toBe("/quiz");
    });

  it("still sends a Daily-hosted stage to the Daily page", async () => {
    h.getActiveMatch.mockResolvedValue({
      matchId: "m-daily", isBotMatch: true, reconnectDeadline: null,
      withinReconnectWindow: true, host: "daily_challenge",
    });
    const router = renderRoute();
    await screen.findByTestId("daily-page");
    expect(router.state.location.pathname).toBe("/quiz/daily-challenge");
    expect(screen.queryByTestId("match-view")).toBeNull();
  });

  it("lets a persisted null host overrule a stale Journey router hint", async () => {
    h.persistedHost = null;
    renderRoute({ matchId: "rkb_stale", origin: "journey_library" });
    const view = await screen.findByTestId("match-view");
    expect(view.dataset.resolved).toBe("none");
    await waitFor(() => expect(
      screen.getByTestId("ranked-back-to-quiz").getAttribute("href")).toBe("/quiz"));
  });

  it("lets a persisted Journey host win over a handoff with no origin", async () => {
    h.persistedHost = "journey_library";
    renderRoute({ matchId: "rkb_plain" });
    const view = await screen.findByTestId("match-view");
    expect(view.dataset.resolved).toBe("journey_library");
    await waitFor(() => expect(
      screen.getByTestId("ranked-back-to-quiz").getAttribute("href")).toBe("/quiz/journeys"));
  });
});

describe("resolveMatchOrigin precedence", () => {
  it("the hint stands only while no host is reported", async () => {
    const { resolveMatchOrigin, RANKED_MATCH_ORIGINS } = await import("./matchOrigin");
    const journey = RANKED_MATCH_ORIGINS.journey_library;
    expect(resolveMatchOrigin(undefined, journey)).toBe(journey);
    expect(resolveMatchOrigin(undefined, null)).toBeNull();
    expect(resolveMatchOrigin("journey_library", null)).toBe(journey);
    expect(resolveMatchOrigin(null, journey)).toBeNull();
    expect(resolveMatchOrigin("daily_challenge", journey)).toBeNull();
    expect(resolveMatchOrigin("study_hall", journey)).toBeNull();
  });
});
