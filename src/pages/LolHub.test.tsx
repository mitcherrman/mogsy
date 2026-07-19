/**
 * /lol homepage navigation structure: mobile hub panels cover every hero
 * destination, swipe game cards keep their routes, the hero selector exists
 * once (desktop-only container), and landing analytics stay wired.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LolHub from "./LolHub";

const mocks = vi.hoisted(() => ({
  trackFunnelEvent: vi.fn(),
  authUser: { id: "u1", is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
  tutorial: { loading: false, error: false, completed: true },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.authUser, loading: false }),
}));
vi.mock("@/hooks/blog/useBlogPosts", () => ({
  useBlogList: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: null }),
  getChampionCutout: () => null,
  getChampionSplash: () => null,
  getChampionLoading: () => null,
}));
vi.mock("@/components/ads/AdSlot", () => ({
  default: ({ placement }: { placement: string }) => <div data-testid={`ad-${placement}`} />,
}));
vi.mock("@/components/lol/LolWelcomeIntro", () => ({
  default: () => <div data-testid="lol-welcome-popup" />,
}));
vi.mock("@/hooks/useRankedTutorialStatus", () => ({
  useRankedTutorialStatus: () => ({
    loading: mocks.tutorial.loading,
    error: mocks.tutorial.error,
    completed: mocks.tutorial.completed,
    required: !mocks.tutorial.completed,
    refresh: vi.fn(),
    completeTutorial: vi.fn(),
  }),
}));
vi.mock("@/components/lol/LolPopoutStyleToggle", () => ({ default: () => null }));
vi.mock("@/lib/funnel-analytics", () => ({
  trackFunnelEvent: mocks.trackFunnelEvent,
}));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    maybeSingle: () => b,
    then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: null }).then(fn),
  });
  return {
    supabase: {
      from: () => b,
      auth: { signInAnonymously: vi.fn() },
    },
  };
});

function renderHub() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/lol"]}>
        <LolHub />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authUser = { id: "u1", is_anonymous: false };
  mocks.tutorial = { loading: false, error: false, completed: true };
});
afterEach(cleanup);

const HUB_DESTINATIONS = [
  { title: "Combat Lab", to: "/combat-lab" },
  { title: "League Quiz", to: "/quiz" },
  { title: "League Swipe", to: "/league-swipe" },
  { title: "Quiz History", to: "/lol/history" },
  { title: "League Docs", to: "/lol/docs" },
];

const SWIPE_ROUTES = [
  { title: "Favorite Champion", to: "/league-swipe/favorite-champion" },
  { title: "Most Annoying Champion", to: "/league-swipe/most-annoying-champion" },
  { title: "Stat Duel", to: "/league-swipe/higher-base-stat" },
  { title: "Item Cost Duel", to: "/league-swipe/item-cost-duel" },
];

describe("LolHub — navigation structure", () => {
  it("renders every hub destination as a link with the correct route", () => {
    renderHub();
    for (const d of HUB_DESTINATIONS) {
      const links = screen
        .getAllByRole("link", { name: new RegExp(d.title) })
        .filter((l) => l.getAttribute("href") === d.to);
      expect(links.length, `${d.title} → ${d.to}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders all four League Swipe game cards with their routes", () => {
    renderHub();
    for (const g of SWIPE_ROUTES) {
      const link = screen.getByRole("link", { name: new RegExp(g.title) });
      expect(link.getAttribute("href")).toBe(g.to);
    }
  });

  it("keeps the hero mode selector as a single desktop-only control set", () => {
    const { container } = renderHub();
    // The tab buttons still exist (desktop behavior intact)…
    const tabs = screen.getAllByRole("button", { name: /^(Quiz|Combat Lab|League Swipe)$/ });
    expect(tabs).toHaveLength(3);
    // …inside one responsive container that is hidden below md. This asserts
    // the structural intent (one hidden-on-mobile wrapper), not styling detail.
    const tabRow = tabs[0].parentElement!;
    expect(tabRow.className).toContain("hidden");
    expect(tabRow.className).toContain("md:flex");
    // No second set of mode tabs was introduced anywhere.
    expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(3);
  });

  it("shows the guest signup banner with concise mobile copy and a dismiss control", () => {
    mocks.authUser = { id: "anon1", is_anonymous: true };
    renderHub();
    // Both responsive variants render in jsdom; assert the concise one exists.
    expect(screen.getByText("Save XP and streaks across devices.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign up free" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("fires the landing funnel event and keeps the ad slot mounted", () => {
    renderHub();
    expect(mocks.trackFunnelEvent).toHaveBeenCalledWith("lol_landing_viewed");
    expect(screen.getByTestId("ad-lol_hub_mid")).toBeTruthy();
  });
});

describe("LolHub — first-visit tutorial popup visibility", () => {
  const SEEN_KEY = "mogsy.lolWelcome.seen.v1";

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom localStorage always present, guard for safety */
    }
  });

  it("shows the popup to an anonymous user who has not completed the tutorial", () => {
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: false, completed: false };
    renderHub();
    expect(screen.getByTestId("lol-welcome-popup")).toBeTruthy();
  });

  it("still shows the popup even if the OLD popup was dismissed (localStorage ignored)", () => {
    // Correction 5: a guest who dismissed the legacy popup must still be gated.
    localStorage.setItem(SEEN_KEY, "1");
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: false, completed: false };
    renderHub();
    expect(screen.getByTestId("lol-welcome-popup")).toBeTruthy();
  });

  it("shows the popup again after abandoning the tutorial and returning to the hub", () => {
    // First visit: popup shown.
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: false, completed: false };
    const first = renderHub();
    expect(screen.getByTestId("lol-welcome-popup")).toBeTruthy();
    // Leave the hub (abandon tutorial) then come back with still-incomplete status.
    first.unmount();
    renderHub();
    expect(screen.getByTestId("lol-welcome-popup")).toBeTruthy();
  });

  it("hides the popup for an anonymous user who already completed the tutorial", () => {
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: false, completed: true };
    renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
  });

  it("hides the popup for a grandfathered / permanent completed account", () => {
    mocks.authUser = { id: "u1", is_anonymous: false };
    mocks.tutorial = { loading: false, error: false, completed: true };
    renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
  });

  it("does not flash the popup while auth/tutorial status is still loading", () => {
    mocks.authUser = null;
    mocks.tutorial = { loading: true, error: false, completed: false };
    renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
  });

  it("fails open (no popup) on a genuine profile-read error", () => {
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: true, completed: false };
    renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
  });
});
