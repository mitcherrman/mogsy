import { useEffect, type ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  matchRoutes,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { vi } from "vitest";

const radioLifecycle = vi.hoisted(() => ({
  mounts: vi.fn(),
  unmounts: vi.fn(),
}));

vi.mock("./components/audio/EntryMusicController", () => ({
  default: function MockAcademyRadioController() {
    useEffect(() => {
      radioLifecycle.mounts();
      return () => radioLifecycle.unmounts();
    }, []);
    return null;
  },
}));

import { AppRouterRoot, appRouter } from "./App";

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

describe("App data-router migration", () => {
  it.each([
    "/",
    "/lol",
    "/quiz",
    "/quiz/ranked",
    "/quiz/daily-challenge",
    "/quiz/playtest",
    "/playtest/:slug",
    "/lol/docs/champions/:slug",
    "/lol/pro-play",
    "/profile",
    "/settings",
    "/lol/premium",
    "/auth",
    "*",
  ])("preserves the registered route %s", (path) => {
    expect(findRoute(appRouter.routes, path)).toBeDefined();
  });

  it.each([
    ["/quiz#history", "/quiz"],
    ["/quiz#review", "/quiz"],
    ["/lol/premium?origin=profile#plans", "/lol/premium"],
    ["/quiz?play=1", "/quiz"],
    ["/lol/pro-play/graphs?graph=gold#focus", "/lol/pro-play/graphs"],
  ])("preserves search/hash matching for %s", (url, expectedPath) => {
    const matches = matchRoutes(appRouter.routes, url);
    expect(matches?.at(-1)?.route.path).toBe(expectedPath);
  });

  it("preserves custom-link and wildcard handling for unknown URLs", () => {
    const customLink = matchRoutes(appRouter.routes, "/definitely-not-a-mogzy-route");
    const notFound = matchRoutes(appRouter.routes, "/definitely/not-a-mogzy-route");
    expect(customLink?.at(-1)?.route.path).toBe("/:slug");
    expect(notFound?.at(-1)?.route.path).toBe("*");
  });

  it("preserves Ranked matchId location.state handoffs", () => {
    const router = createMemoryRouter(appRouter.routes, {
      initialEntries: [{
        pathname: "/quiz/ranked",
        state: { matchId: "nav1-e1-match", source: "queue" },
      }],
    });

    expect(router.state.location.pathname).toBe("/quiz/ranked");
    expect(router.state.location.state).toEqual({
      matchId: "nav1-e1-match",
      source: "queue",
    });
  });

  it.each([
    ["/quiz/daily", "/quiz/daily-challenge"],
    ["analytics", "/admin/users"],
    ["ranked", "/admin/leaguecraft?section=ranked"],
  ])("preserves the REPLACE redirect from %s", (path, destination) => {
    const route = findRoute(appRouter.routes, path);
    const element = route?.element as ReactElement<{ to: string; replace: boolean }>;
    expect(element.props.to).toBe(destination);
    expect(element.props.replace).toBe(true);
  });

  it("keeps the Academy audio controller alive across ordinary route changes", async () => {
    radioLifecycle.mounts.mockClear();
    radioLifecycle.unmounts.mockClear();
    const router = createMemoryRouter([{
      element: <AppRouterRoot />,
      children: [
        { path: "/a", element: <><h1>A</h1><Link to="/b">to b</Link></> },
        { path: "/b", element: <><h1>B</h1><Link to="/a">to a</Link></> },
      ],
    }], { initialEntries: ["/a"] });

    render(<RouterProvider router={router} />);
    expect(radioLifecycle.mounts).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("link", { name: "to b" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "B" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("link", { name: "to a" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "A" })).toBeInTheDocument());

    expect(radioLifecycle.mounts).toHaveBeenCalledTimes(1);
    expect(radioLifecycle.unmounts).not.toHaveBeenCalled();
  });
});
