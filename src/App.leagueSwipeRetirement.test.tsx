/**
 * LS-RETIRE1 — the standalone League Swipe surface (the old standalone "Meta
 * Reflex") is retired. Its three public URLs survive only as legacy-bookmark
 * redirects to /quiz. Meta Reflex itself lives on inside Ranked and Daily.
 *
 * Pinned against the REAL registered routes (`appRouter.routes`), not a copy:
 *   · each URL is claimed by its own explicit redirect route — the bare
 *     `/league-swipe` must never fall through to the root `/:slug` invite-link
 *     resolver (which would query `invite_links` and flash a loader first), and
 *     nothing may fall through to the `*` NotFound;
 *   · the redirect is a REPLACE to /quiz, so Back skips the retired URL;
 *   · rendering those exact route elements lands on /quiz in one hop.
 */
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import {
  createMemoryRouter,
  matchRoutes,
  Navigate,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { vi } from "vitest";

vi.mock("./components/audio/EntryMusicController", () => ({
  default: function MockAcademyRadioController() {
    return null;
  },
}));

import { appRouter } from "./App";

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

beforeAll(() => {
  globalThis.Request = RouterTestRequest as unknown as typeof Request;
});

afterAll(() => {
  globalThis.Request = NativeRequest;
});

function findRoute(routes: RouteObject[], path: string): RouteObject | undefined {
  for (const route of routes) {
    if (route.path === path) return route;
    const nested = route.children && findRoute(route.children, path);
    if (nested) return nested;
  }
  return undefined;
}

const LEGACY_ROUTES = ["/league-swipe", "/league-swipe/stats", "/league-swipe/:gameSlug"] as const;

describe("LS-RETIRE1 — legacy /league-swipe* URLs", () => {
  it.each([
    ["/league-swipe", "/league-swipe"],
    ["/league-swipe/", "/league-swipe"],
    ["/league-swipe/stats", "/league-swipe/stats"],
    ["/league-swipe/item-cost-duel", "/league-swipe/:gameSlug"],
    ["/league-swipe/favorite-champion?forcePair=a,b", "/league-swipe/:gameSlug"],
  ])("%s is claimed by its explicit redirect route, never /:slug or *", (url, expected) => {
    const matched = matchRoutes(appRouter.routes, url)?.at(-1)?.route.path;
    expect(matched).toBe(expected);
    expect(matched).not.toBe("/:slug");
    expect(matched).not.toBe("*");
  });

  it.each(LEGACY_ROUTES)("%s is a REPLACE redirect to /quiz and renders no page", (path) => {
    const route = findRoute(appRouter.routes, path);
    const element = route?.element as ReactElement<{ to: string; replace: boolean }>;
    expect(element.type).toBe(Navigate);
    expect(element.props.to).toBe("/quiz");
    expect(element.props.replace).toBe(true);
  });

  it.each([
    "/league-swipe",
    "/league-swipe/stats",
    "/league-swipe/item-cost-duel",
  ])("rendering the registered element for %s lands directly on /quiz", async (url) => {
    const slugResolver = vi.fn(() => <h1>invite link</h1>);
    function SlugResolver() {
      return slugResolver();
    }
    const router = createMemoryRouter(
      [
        ...LEGACY_ROUTES.map((path) => ({ path, element: findRoute(appRouter.routes, path)!.element })),
        { path: "/quiz", element: <h1>Leaguecraft</h1> },
        { path: "/:slug", element: <SlugResolver /> },
        { path: "*", element: <h1>not found</h1> },
      ],
      { initialEntries: ["/lol", url] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: "Leaguecraft" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/quiz");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(slugResolver).not.toHaveBeenCalled();
    expect(screen.queryByText("not found")).toBeNull();
  });

  it("registers no League Swipe page component under any route", () => {
    const offenders: string[] = [];
    (function walk(routes: RouteObject[]) {
      for (const route of routes) {
        if (route.path?.startsWith("/league-swipe")) {
          const element = route.element as ReactElement | undefined;
          if (!element || element.type !== Navigate) offenders.push(route.path);
        }
        if (route.children) walk(route.children);
      }
    })(appRouter.routes);
    expect(offenders).toEqual([]);
  });
});
