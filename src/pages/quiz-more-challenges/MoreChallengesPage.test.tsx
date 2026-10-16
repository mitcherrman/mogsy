/**
 * PGM1 — `/quiz/more-challenges`, driven through a real router, React Query
 * and the real catalog reader. Only the network (the public catalog GET and
 * the Daily's `readToday`) and analytics are replaced. The catalog is the
 * backend's captured answer.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import wire from "@/lib/public-modes/__fixtures__/publicModeCatalog.json";

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
  readToday: vi.fn(),
  track: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/analytics/track", () => ({ track: h.track }));
vi.mock("@/lib/daily-challenge/run/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/daily-challenge/run/client")>();
  return { ...actual, httpDailyRunTransport: { ...actual.httpDailyRunTransport, readToday: h.readToday } };
});

import MoreChallengesPage from "./MoreChallengesPage";
import { MogzyDockProvider } from "@/components/mogzy-dock/MogzyDock";
import { V5_ELIGIBLE_DAY, fixtureV5Run, wireResult } from "@/lib/daily-challenge/run/fixtures";
import { moreChallengesState } from "@/lib/public-modes/launch";

beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200,
  headers: { "Content-Type": "application/json" } }));

const mainDone = () => fixtureV5Run(V5_ELIGIBLE_DAY,
  { main_completed_at: "2026-10-16T10:00:00Z", main_score: 1234, current_stage_index: 1 },
  { 0: { status: "completed", result: wireResult() } });

beforeEach(() => {
  h.fetch.mockImplementation(() => ok(wire));
  vi.stubGlobal("fetch", h.fetch);
  h.readToday.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function DailyProbe() {
  const location = useLocation();
  return <pre data-testid="daily-route">{JSON.stringify(location.state)}</pre>;
}

function renderPage(state: unknown = null) {
  const router = createMemoryRouter([
    { path: "/quiz/more-challenges", element: <MoreChallengesPage /> },
    { path: "/quiz/daily-challenge", element: <DailyProbe /> },
    { path: "/quiz", element: <h1>Leaguecraft</h1> },
  ], { initialEntries: [{ pathname: "/quiz/more-challenges", state }] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MogzyDockProvider><RouterProvider router={router} /></MogzyDockProvider>
    </QueryClientProvider>);
  return router;
}

const cards = () => screen.getAllByTestId("mode-card");
const card = (id: string) => cards().find((c) => c.getAttribute("data-mode-id") === id)!;

describe("PGM1 — More Challenges", () => {
  it("draws all thirteen modes, in the server's order, as the same card", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(13));
    expect(cards().map((c) => c.getAttribute("data-mode-id"))).toEqual(wire.modes.map((m) => m.id));
    expect(screen.getByTestId("more-challenges-count")).toHaveTextContent("13 bonus modes · 2 open now");
    for (const c of cards()) {
      expect(within(c).getByTestId("mode-card-title")).toBeInTheDocument();
      expect(within(c).getByTestId("mode-card-theme")).toBeInTheDocument();
      expect(within(c).getByTestId("mode-card-summary")).toBeInTheDocument();
      expect(within(c).getByTestId("mode-card-rules")).toBeInTheDocument();
    }
    // The catalog read is public: no bearer, no identity.
    const [url, init] = h.fetch.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/game-modes$/);
    expect((init as RequestInit).headers).toBeUndefined();
  });

  it("offers no Play button for a mode without a public launch", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(13));
    const comingSoon = cards().filter((c) => c.getAttribute("data-action") === "coming_soon");
    expect(comingSoon.map((c) => c.getAttribute("data-mode-id"))).toEqual(wire.modes.slice(2).map((m) => m.id));
    for (const c of comingSoon) {
      expect(within(c).queryByTestId("mode-card-play")).toBeNull();
      expect(within(c).getByTestId("mode-card-coming-soon")).toHaveTextContent("Coming soon");
      expect(within(c).getByTestId("mode-card-status")).toHaveTextContent("Coming soon");
    }
    expect(screen.getAllByTestId("mode-card-play")).toHaveLength(2);
  });

  it("with no Daily today, the bonus stages offer to start it and say why", async () => {
    renderPage();
    await waitFor(() => expect(within(card("time_trial")).getByTestId("mode-card-play")).toBeInTheDocument());
    for (const id of ["time_trial", "survival"]) {
      expect(within(card(id)).getByTestId("mode-card-play")).toHaveTextContent("Start Today's Daily");
      expect(within(card(id)).getByTestId("mode-card-note")).toHaveTextContent("Unlocks after today's Daily Challenge.");
    }
  });

  it("after the main Daily, Play continues the run into the current bonus stage", async () => {
    h.readToday.mockResolvedValue(mainDone());
    const router = renderPage(moreChallengesState("daily"));
    await waitFor(() => expect(within(card("time_trial")).getByTestId("mode-card-play")).toHaveTextContent("Play"));
    expect(within(card("survival")).queryByTestId("mode-card-play")).toBeNull();
    expect(within(card("survival")).getByTestId("mode-card-blocked")).toHaveTextContent("Up after Time Trial");
    expect(h.track).toHaveBeenCalledWith("more_challenges_viewed", { metadata: { source: "daily" } });

    fireEvent.click(within(card("time_trial")).getByTestId("mode-card-play"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz/daily-challenge"));
    expect(JSON.parse(screen.getByTestId("daily-route").textContent!)).toEqual({ continueDaily: true });
    expect(h.track).toHaveBeenCalledWith("more_challenges_mode_selected",
      { metadata: { game_mode_id: "time_trial", action: "play", source: "daily" } });
  });

  it("holds the Daily cards on a placeholder while the player's Daily is read", async () => {
    let resolve!: (v: null) => void;
    h.readToday.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(13));
    expect(within(card("time_trial")).getByTestId("mode-card-checking")).toBeInTheDocument();
    expect(screen.queryAllByTestId("mode-card-play")).toHaveLength(0);
    await act(async () => { resolve(null); });
    await waitFor(() => expect(screen.getAllByTestId("mode-card-play")).toHaveLength(2));
  });

  it("opens a mode's Rules in Mogzy's scroll, from the server's copy", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(13));
    fireEvent.click(within(card("match_grid")).getByTestId("mode-card-rules"));
    const rules = await screen.findByTestId("mode-rules-content-match_grid");
    expect(rules).toHaveTextContent("Seat each rune under the rune tree it belongs to.");
    expect(rules).toHaveTextContent("Scoring is published when this mode opens to everyone.");
    expect(rules).toHaveTextContent("Never changes your Daily score.");
    expect(h.track).toHaveBeenCalledWith("more_challenges_mode_selected",
      { metadata: { game_mode_id: "match_grid", action: "rules", source: "direct" } });
  });

  it("an unreadable catalog says so and can be retried", async () => {
    h.fetch.mockImplementation(() => Promise.resolve(new Response("{}", { status: 503 })));
    renderPage();
    expect(await screen.findByTestId("more-challenges-error", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryAllByTestId("mode-card")).toHaveLength(0);
    h.fetch.mockImplementation(() => ok(wire));
    fireEvent.click(screen.getByTestId("more-challenges-retry"));
    await waitFor(() => expect(cards()).toHaveLength(13));
  });

  it("lays out one column on a phone, two from sm, three from lg, with 44px Play targets", async () => {
    renderPage();
    await waitFor(() => expect(cards()).toHaveLength(13));
    expect(screen.getByTestId("more-challenges-grid").className)
      .toMatch(/grid-cols-1.*sm:grid-cols-2.*lg:grid-cols-3/);
    for (const b of screen.getAllByTestId("mode-card-play")) expect(b.className).toMatch(/min-h-\[44px\]/);
    expect(screen.getByTestId("more-challenges-back")).toHaveAttribute("href", "/quiz");
  });
});
