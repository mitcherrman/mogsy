/**
 * JLIB-FE — `/quiz/journeys`, the public Journey Library.
 *
 * Driven through a real router and React Query, with only the two API calls
 * and the auth hook replaced. The list is the captured backend answer.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  user: { id: "free-user", is_anonymous: false } as { id: string; is_anonymous?: boolean } | null,
  listJourneys: vi.fn(),
  launchJourney: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: h.user, loading: false }),
}));
vi.mock("@/hooks/useChampionAssets", async (importActual) => ({
  ...(await importActual<typeof import("@/hooks/useChampionAssets")>()),
  useChampionAssets: () => ({ data: null }),
}));
vi.mock("@/lib/ranked-public/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ranked-public/client")>();
  return { ...actual, listJourneys: h.listJourneys, launchJourney: h.launchJourney };
});

import JourneyLibraryPage from "./JourneyLibraryPage";
import { RankedApiError } from "@/lib/ranked-public/client";
import { readJourneyLibrary } from "@/lib/journey-library/contracts";
import { readQueueStatus } from "@/lib/ranked-public/contracts";
import { journeyLaunchMatched, journeyLibraryList } from "@/lib/journey-library/__fixtures__/journeyLibrary";

beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });

const list = (patch = {}) => readJourneyLibrary(journeyLibraryList(patch));

beforeEach(() => {
  h.user = { id: "free-user", is_anonymous: false };
  h.listJourneys.mockResolvedValue(list());
  h.launchJourney.mockResolvedValue(readQueueStatus(journeyLaunchMatched()));
});
afterEach(() => vi.clearAllMocks());

function RankedProbe() {
  const location = useLocation();
  return <pre data-testid="ranked-route">{JSON.stringify(location.state)}</pre>;
}
function AuthProbe() {
  const location = useLocation();
  return <div data-testid="auth-route">{location.pathname + location.search}</div>;
}

function renderLibrary() {
  const router = createMemoryRouter([
    { path: "/quiz/journeys", element: <JourneyLibraryPage /> },
    { path: "/quiz/ranked", element: <RankedProbe /> },
    { path: "/auth", element: <AuthProbe /> },
  ], { initialEntries: ["/quiz/journeys"] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

const card = (key: string) =>
  document.querySelector(`[data-testid="journey-card"][data-journey-key="${key}"]`) as HTMLElement;
const visibleKeys = () =>
  Array.from(document.querySelectorAll('[data-testid="journey-card"]'))
    .map((el) => (el as HTMLElement).dataset.journeyKey);

async function ready() {
  await screen.findByTestId("journey-library-grid");
}

describe("route and list", () => {
  it("renders the Library from one list request, with role, title, champions and question count", async () => {
    renderLibrary();
    expect(screen.getByRole("heading", { name: "Journey Library" })).toBeTruthy();
    await ready();
    expect(h.listJourneys).toHaveBeenCalledTimes(1);
    expect(visibleKeys()).toHaveLength(14);
    const zed = card("mid.zed_vs_ahri@1");
    expect(within(zed).getByTestId("journey-card-title")).toHaveTextContent("Zed vs Ahri");
    expect(within(zed).getByTestId("journey-card-role")).toHaveTextContent("Mid");
    expect(within(zed).getByTestId("journey-card-questions")).toHaveTextContent("5 questions");
    expect(within(zed).getAllByTestId("journey-card-champion").map((b) => b.textContent))
      .toEqual(["Zed", "Ahri"]);
    // Nothing private, and no planner vocabulary, reaches the page.
    const text = document.body.textContent ?? "";
    for (const word of ["standard", "daily", "digest", "seed", "superseded", "recipe"]) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });

  it("is public: a signed-out visitor browses the list", async () => {
    h.user = null;
    renderLibrary();
    await ready();
    expect(visibleKeys()).toHaveLength(14);
    expect(screen.getByTestId("journey-library-signed-out-hint")).toBeTruthy();
  });
});

describe("filters", () => {
  it("filters by role, and All roles restores the list", async () => {
    renderLibrary();
    await ready();
    fireEvent.click(screen.getByTestId("journey-role-bot"));
    expect(screen.getByTestId("journey-role-bot").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("journey-role-bot")).toHaveTextContent("Bot");
    expect(visibleKeys()).toEqual(["bot.ashe_vs_jinx@1", "bot.lucian_vs_caitlyn@1"]);
    fireEvent.click(screen.getByTestId("journey-role-all"));
    expect(visibleKeys()).toHaveLength(14);
  });

  it("filters by champion search, combines with role, and by clicking a champion", async () => {
    renderLibrary();
    await ready();
    fireEvent.change(screen.getByTestId("journey-champion-search"), { target: { value: "ahri" } });
    expect(visibleKeys()).toEqual(["mid.ahri_vs_syndra@1", "mid.pantheon_vs_ahri@1", "mid.zed_vs_ahri@1"]);
    expect(screen.getByTestId("journey-library-count")).toHaveTextContent("3 of 14 Journeys");
    fireEvent.click(screen.getByTestId("journey-role-top"));
    expect(screen.getByTestId("journey-library-no-match")).toBeTruthy();
    fireEvent.click(screen.getByTestId("journey-filters-clear"));
    expect(visibleKeys()).toHaveLength(14);

    const olaf = within(card("jungle.olaf_vs_jarvan@1")).getAllByTestId("journey-card-champion")[0];
    fireEvent.click(olaf);
    expect(visibleKeys()).toEqual(["jungle.olaf_vs_jarvan@1", "top.olaf_vs_sett@1"]);
  });
});

describe("unavailable", () => {
  it("shows an unavailable Journey with no Start, and never launches it", async () => {
    h.listJourneys.mockResolvedValue(list({
      "top.olaf_vs_sett": { available: false, unavailable_code: "JOURNEY_UNAVAILABLE" },
    }));
    renderLibrary();
    await ready();
    const olaf = card("top.olaf_vs_sett@1");
    expect(olaf.dataset.available).toBe("false");
    expect(within(olaf).getByTestId("journey-card-unavailable")).toHaveTextContent("Unavailable");
    expect(within(olaf).queryByTestId("journey-card-start")).toBeNull();
    expect(h.launchJourney).not.toHaveBeenCalled();
  });
});

describe("launch", () => {
  it("sends the exact recipe id and version, and hands `matched` to the Ranked arena", async () => {
    h.listJourneys.mockResolvedValue(list({ "mid.zed_vs_ahri": { recipe_version: 2 } }));
    h.launchJourney.mockResolvedValue(readQueueStatus(journeyLaunchMatched("rkb_zed2", "mid.zed_vs_ahri", 2)));
    renderLibrary();
    await ready();
    fireEvent.click(within(card("mid.zed_vs_ahri@2")).getByTestId("journey-card-start"));
    await screen.findByTestId("ranked-route");
    expect(h.launchJourney).toHaveBeenCalledTimes(1);
    expect(h.launchJourney).toHaveBeenCalledWith("mid.zed_vs_ahri", 2);
    expect(JSON.parse(screen.getByTestId("ranked-route").textContent!))
      .toEqual({ matchId: "rkb_zed2", origin: "journey_library" });
  });

  it("lets a Free signed-in account launch: no Premium gate on the client", async () => {
    // A plain account with no entitlement of any kind.
    h.user = { id: "free-user", is_anonymous: false };
    renderLibrary();
    await ready();
    fireEvent.click(within(card("bot.ashe_vs_jinx@1")).getByTestId("journey-card-start"));
    await screen.findByTestId("ranked-route");
    expect(h.launchJourney).toHaveBeenCalledWith("bot.ashe_vs_jinx", 1);
    const source = readFileSync(resolve(__dirname, "JourneyLibraryPage.tsx"), "utf8");
    expect(source).not.toMatch(/usePremium|entitlement|isPremium|Premium only/i);
  });

  it.each([
    ["signed out", null],
    ["a guest", { id: "guest", is_anonymous: true }],
  ])("asks %s to sign in, returning here, and sends nothing", async (_who, user) => {
    h.user = user;
    renderLibrary();
    await ready();
    fireEvent.click(within(card("mid.zed_vs_ahri@1")).getByTestId("journey-card-start"));
    const gate = await screen.findByTestId("journey-account-required");
    expect(gate).toHaveTextContent("Sign in to start Zed vs Ahri");
    expect(h.launchJourney).not.toHaveBeenCalled();
    const signin = screen.getByTestId("journey-signin-link").getAttribute("href")!;
    expect(decodeURIComponent(signin)).toContain("returnTo=/quiz/journeys");
  });

  it("shows the same account gate when the server answers 403 ACCOUNT_REQUIRED", async () => {
    h.launchJourney.mockRejectedValue(new RankedApiError("backend", 403, "account", "ACCOUNT_REQUIRED"));
    renderLibrary();
    await ready();
    fireEvent.click(within(card("mid.zed_vs_ahri@1")).getByTestId("journey-card-start"));
    expect(await screen.findByTestId("journey-account-required")).toBeTruthy();
  });

  it("on 409 JOURNEY_VERSION_NOT_ACTIVE refetches the Library and never retries the stale version", async () => {
    h.launchJourney.mockRejectedValue(
      new RankedApiError("backend", 409, "stale", "JOURNEY_VERSION_NOT_ACTIVE"));
    renderLibrary();
    await ready();
    h.listJourneys.mockResolvedValue(list({ "mid.zed_vs_ahri": { recipe_version: 2 } }));
    fireEvent.click(within(card("mid.zed_vs_ahri@1")).getByTestId("journey-card-start"));
    expect(await screen.findByTestId("journey-notice-stale")).toBeTruthy();
    await waitFor(() => expect(h.listJourneys).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(card("mid.zed_vs_ahri@2")).toBeTruthy());
    expect(card("mid.zed_vs_ahri@1")).toBeNull();
    expect(h.launchJourney).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("ranked-route")).toBeNull();
  });

  it("on 503 JOURNEY_UNAVAILABLE stays in the Library and marks that card unavailable", async () => {
    h.launchJourney.mockRejectedValue(
      new RankedApiError("backend", 503, "unavailable", "JOURNEY_UNAVAILABLE"));
    renderLibrary();
    await ready();
    fireEvent.click(within(card("mid.zed_vs_ahri@1")).getByTestId("journey-card-start"));
    expect(await screen.findByTestId("journey-notice-unavailable")).toHaveTextContent("Zed vs Ahri");
    const zed = card("mid.zed_vs_ahri@1");
    expect(zed.dataset.available).toBe("false");
    expect(within(zed).queryByTestId("journey-card-start")).toBeNull();
    expect(screen.queryByTestId("ranked-route")).toBeNull();
    // No refetch, and no other version is substituted.
    expect(h.listJourneys).toHaveBeenCalledTimes(1);
    expect(card("mid.ahri_vs_syndra@1").dataset.available).toBe("true");
  });

  it("points an account already in a match back to it", async () => {
    h.launchJourney.mockRejectedValue(
      new RankedApiError("backend", 409, "busy", "RANKED_ACTIVE_MATCH_EXISTS"));
    renderLibrary();
    await ready();
    fireEvent.click(within(card("mid.zed_vs_ahri@1")).getByTestId("journey-card-start"));
    await screen.findByTestId("journey-notice-active_match");
    expect(screen.getByTestId("journey-notice-resume").getAttribute("href")).toBe("/quiz/ranked");
    expect(h.listJourneys).toHaveBeenCalledTimes(1);
  });
});
