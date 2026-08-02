/**
 * /lol homepage navigation structure: the academy library hub renders every
 * approved destination (desktop book cards + mobile panels), the League Swipe
 * subsection stays hidden, and landing analytics stay wired.
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
  // Global tutorial policy. Both default ON = current production behaviour, so
  // every pre-existing expectation in this file is unchanged.
  settingsLoading: false,
  autoPopupEnabled: true,
  completionRequiredForNewUsers: true,
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
  default: ({ dismissible }: { dismissible?: boolean }) => (
    <div data-testid="lol-welcome-popup" data-dismissible={String(!!dismissible)} />
  ),
}));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({
    loading: mocks.settingsLoading,
    settings: {
      policy: {
        combatSim: { tokensRequiredForNonPro: true },
        tutorial: {
          autoPopupEnabled: mocks.autoPopupEnabled,
          completionRequiredForNewUsers: mocks.completionRequiredForNewUsers,
        },
      },
    },
  }),
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
  mocks.settingsLoading = false;
  mocks.autoPopupEnabled = true;
  mocks.completionRequiredForNewUsers = true;
  try {
    sessionStorage.clear();
  } catch {
    /* jsdom sessionStorage always present; guard for safety */
  }
});
afterEach(cleanup);

const HUB_DESTINATIONS = [
  { title: "Leaguecraft", to: "/quiz" },
  { title: "Combat Lab", to: "/combat-lab" },
  { title: "Stat Check", to: "/quiz/stat-check" },
  { title: "Mogzy Archives", to: "/lol/docs" },
  { title: "Quiz History", to: "/lol/history" },
  { title: "Patch Reports", to: "/lol/patch-reports" },
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

  it("renders each destination twice: desktop book card + mobile panel", () => {
    renderHub();
    for (const d of HUB_DESTINATIONS) {
      const links = screen
        .getAllByRole("link", { name: new RegExp(d.title) })
        .filter((l) => l.getAttribute("href") === d.to);
      expect(links.length, `${d.title} → ${d.to}`).toBe(2);
    }
  });

  it("uses the academy names — no stale League Quiz / League Docs labels", () => {
    renderHub();
    expect(screen.queryByRole("link", { name: /League Quiz/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /League Docs/ })).toBeNull();
  });

  it("sends Stat Check to the mode-selection screen, never straight into a mode", () => {
    renderHub();
    const links = screen
      .getAllByRole("link", { name: /Stat Check/ })
      .map((l) => l.getAttribute("href"));
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const href of links) expect(href).toBe("/quiz/stat-check");
  });

  it("hides the League Swipe subsection while Meta Reflex lives inside Leaguecraft", () => {
    renderHub();
    // No top-level League Swipe destination and no swipe game cards.
    expect(screen.queryByRole("link", { name: /League Swipe/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Favorite Champion/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Item Cost Duel/ })).toBeNull();
  });

  it("does not render the old hero mode selector", () => {
    const { container } = renderHub();
    // The Academy Radio surfaces legitimately use aria-pressed toggles; the
    // guard is against mode-selector toggles anywhere OUTSIDE the radio.
    const pressed = Array.from(container.querySelectorAll("button[aria-pressed]")).filter(
      (b) => !b.closest('[data-testid^="academy-radio"]'),
    );
    expect(pressed).toHaveLength(0);
    expect(screen.queryByText("Train Your League Knowledge")).toBeNull();
  });

  it("renders the academy heading and welcome copy", () => {
    renderHub();
    expect(screen.getByText("Mogzy’s Academy of")).toBeTruthy();
    expect(screen.getByText("Leaguecraft and Technology")).toBeTruthy();
    expect(screen.getByText(/Welcome back, Summoner/i)).toBeTruthy();
    expect(screen.getByText("Chart your path. Sharpen your edge.")).toBeTruthy();
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

describe("LolHub — Academy Radio", () => {
  it("renders the prominent console (desktop lane) and the compact bar (mobile)", () => {
    renderHub();
    expect(screen.getByTestId("academy-radio-hub")).toBeTruthy();
    expect(screen.getByTestId("academy-radio-hub-bar")).toBeTruthy();
    // Both surfaces read the same store and name the real runtime track.
    expect(screen.getByTestId("academy-radio-hub")).toHaveTextContent("Tidecaller");
    expect(screen.getByTestId("academy-radio-hub-bar")).toHaveTextContent("Tidecaller");
  });

  it("mounting the hub never starts playback or creates an audio element", () => {
    const created: string[] = [];
    const nativeCreate = document.createElement.bind(document);
    const spy = vi
      .spyOn(document, "createElement")
      .mockImplementation(((tag: string, options?: ElementCreationOptions) => {
        created.push(tag);
        return nativeCreate(tag, options);
      }) as typeof document.createElement);

    renderHub();

    expect(created.filter((t) => t === "audio")).toHaveLength(0);
    spy.mockRestore();
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

describe("LolHub — automatic tutorial popup under the global policies", () => {
  const newGuest = () => {
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: false, completed: false };
  };

  it("popup ON + forced ON → popup appears and is not dismissible", () => {
    newGuest();
    renderHub();
    const popup = screen.getByTestId("lol-welcome-popup");
    expect(popup.getAttribute("data-dismissible")).toBe("false");
  });

  it("popup ON + forced OFF → popup appears and IS dismissible", () => {
    newGuest();
    mocks.completionRequiredForNewUsers = false;
    renderHub();
    const popup = screen.getByTestId("lol-welcome-popup");
    expect(popup.getAttribute("data-dismissible")).toBe("true");
  });

  it("popup OFF + forced ON → no popup (the route guard still forces entry)", () => {
    newGuest();
    mocks.autoPopupEnabled = false;
    renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
  });

  it("popup OFF + forced OFF → no popup at all", () => {
    newGuest();
    mocks.autoPopupEnabled = false;
    mocks.completionRequiredForNewUsers = false;
    renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
  });

  it("never shows the popup to a completed user, whatever the policy", () => {
    for (const autoPopupEnabled of [true, false]) {
      for (const completionRequiredForNewUsers of [true, false]) {
        mocks.authUser = { id: "anon1", is_anonymous: true };
        mocks.tutorial = { loading: false, error: false, completed: true };
        mocks.autoPopupEnabled = autoPopupEnabled;
        mocks.completionRequiredForNewUsers = completionRequiredForNewUsers;
        const view = renderHub();
        expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
        view.unmount();
      }
    }
  });

  it("does not flash the popup while the settings read is still loading", () => {
    newGuest();
    mocks.settingsLoading = true;
    renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
  });

  it("re-enabling the auto-popup restores it for the same incomplete guest", () => {
    newGuest();
    mocks.autoPopupEnabled = false;
    const first = renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
    first.unmount();

    mocks.autoPopupEnabled = true;
    renderHub();
    expect(screen.getByTestId("lol-welcome-popup")).toBeTruthy();
  });
});
