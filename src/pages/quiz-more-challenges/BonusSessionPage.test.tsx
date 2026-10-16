/**
 * PGM2 — `/quiz/more-challenges/:mode` mounts a session game only for a mode
 * the server catalog opens as a session, with the mode's Rules beside it.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import wire from "@/lib/public-modes/__fixtures__/publicModeCatalog.json";

const NativeRequest = globalThis.Request;
class RouterTestRequest {
  readonly url: string; readonly method: string; readonly signal: AbortSignal | null; readonly headers: Headers;
  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = String(input); this.method = init.method ?? "GET"; this.signal = init.signal ?? null;
    this.headers = new Headers(init.headers);
  }
}

vi.mock("./games/RangefinderGame", () => ({ default: ({ entry }: { entry: { title: string } }) => <div data-testid="game-stub">{entry.title}</div> }));
vi.mock("./games/StatDropGame", () => ({ default: () => <div data-testid="game-stub">Stat Drop</div> }));

import BonusSessionPage from "./BonusSessionPage";
import { MogzyDockProvider } from "@/components/mogzy-dock/MogzyDock";

const h = vi.hoisted(() => ({ fetch: vi.fn() }));

beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });
beforeEach(() => {
  h.fetch.mockImplementation(async () => new Response(JSON.stringify(wire), { status: 200 }));
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function at(path: string, catalog: unknown = wire) {
  h.fetch.mockImplementation(async () => new Response(JSON.stringify(catalog), { status: 200 }));
  const router = createMemoryRouter([
    { path: "/quiz/more-challenges/:mode", element: <BonusSessionPage /> },
  ], { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MogzyDockProvider><RouterProvider router={router} /></MogzyDockProvider>
    </QueryClientProvider>);
}

describe("PGM2 — the session game page", () => {
  it("mounts an open session game with its Rules tab", async () => {
    at("/quiz/more-challenges/rangefinder");
    expect(await screen.findByTestId("game-stub")).toHaveTextContent("Rangefinder");
    expect(await screen.findByTestId("mode-rules-tab")).toBeInTheDocument();
  });

  it("never deals a mode that is not a session game", async () => {
    at("/quiz/more-challenges/match_grid");
    expect(await screen.findByTestId("bonus-session-closed")).toBeInTheDocument();
    expect(screen.getByTestId("bonus-session-back").getAttribute("href")).toBe("/quiz/more-challenges");
    expect(screen.queryByTestId("game-stub")).toBeNull();
  });

  it("an unknown mode is not here", async () => {
    at("/quiz/more-challenges/nope");
    expect(await screen.findByTestId("bonus-session-closed")).toHaveTextContent("That game isn't here.");
  });

  it("a paused mode says so and deals nothing", async () => {
    const paused = JSON.parse(JSON.stringify(wire));
    const sd = paused.modes.find((m: { id: string }) => m.id === "stat_drop");
    sd.launch = null;
    sd.availability = { status: "paused", reason_code: "BONUS_PAUSED", message: "New bonus games are paused for now. Please check back soon." };
    at("/quiz/more-challenges/stat_drop", paused);
    expect(await screen.findByTestId("bonus-session-closed")).toHaveTextContent("paused");
    expect(screen.queryByTestId("game-stub")).toBeNull();
  });
});
