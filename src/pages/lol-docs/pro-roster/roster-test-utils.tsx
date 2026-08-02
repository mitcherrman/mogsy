/**
 * Shared harness for the roster page tests: a fresh QueryClient per render, a
 * MemoryRouter with the real route paths mounted (so :lpPage parsing is
 * exercised rather than stubbed), and a fetch router keyed on the endpoint.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";

export type Handler = { status?: number; body: unknown };

/** Requests the component tree actually issued, in order. */
export const requestLog: string[] = [];

/**
 * Install a fetch stub that resolves the first matching predicate. Matching is
 * done on the full URL so tests can assert on query strings and encoding.
 */
export function installFetch(routes: Array<[(url: string) => boolean, Handler]>) {
  requestLog.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestLog.push(url);
      const match = routes.find(([test]) => test(url));
      const handler: Handler = match?.[1] ?? { status: 404, body: { detail: "Not found." } };
      const status = handler.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        json: async () => handler.body,
      } as Response;
    }),
  );
}

/** A fetch stub that never settles — for asserting loading states. */
export function installPendingFetch() {
  requestLog.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      requestLog.push(String(input));
      return new Promise<Response>(() => undefined);
    }),
  );
}

export let lastLocation = { pathname: "", search: "" };

function LocationProbe() {
  const loc = useLocation();
  lastLocation = { pathname: loc.pathname, search: loc.search };
  return null;
}

/**
 * Render `element` at `initialPath` under `routePath`. Both are passed
 * verbatim, so a test can navigate to an encoded identifier and verify the
 * component decodes it back to the exact original string.
 */
export function renderRoute({
  element,
  routePath,
  initialPath,
}: {
  element: ReactNode;
  routePath: string;
  initialPath: string;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LocationProbe />
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** True when no request in the log asked for Level C data. */
export function neverRequestedLevelC(): boolean {
  return requestLog.every((url) => !/eligibility=[^&]*C/.test(url));
}
