/**
 * /lol homepage navigation structure: the academy library hub renders every
 * approved destination (desktop book cards + mobile panels), the League Swipe
 * subsection stays hidden, and landing analytics stay wired.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LolHub from "./LolHub";
import { markAcademyWelcomeHandled } from "@/lib/welcome/academy-welcome";
import { HUB_GUIDE_MODES, type HubGuideModeId } from "@/components/lol/hub-guide";
import { installLocalStorageStub } from "@/test/localStorageStub";

// The pinned jsdom does not provide a working Storage — see localStorageStub.
// Only localStorage is stubbed: the legacy popup's dismissal flag lives in
// sessionStorage and is left exactly as the existing expectations found it.
const resetLocalStorage = installLocalStorageStub();

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
// The Patch Brief provider fetches the live Patch Reports API; this file is
// about hub navigation structure, so it stays on the neutral placeholder feed.
vi.mock("@/components/lol/broadcast/usePatchBriefFeed", async () => {
  const { INITIAL_BROADCAST_FEED } = await vi.importActual<
    typeof import("@/components/lol/broadcast/broadcast-content")
  >("@/components/lol/broadcast/broadcast-content");
  return { usePatchBriefFeed: () => INITIAL_BROADCAST_FEED };
});
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

  // This test previously asserted the OPPOSITE — that the subsection stayed
  // hidden "while Meta Reflex lives inside Leaguecraft". That premise was
  // false: the Leaguecraft entry point it referred to was never built, so the
  // feature had no front door anywhere. Both surfaces now exist and are
  // complementary; see Quiz.tsx §2d for the Leaguecraft half.
  it("shows the Meta Reflex subsection with all four game cards", () => {
    renderHub();
    expect(screen.getByTestId("lol-hub-meta-reflex-section")).toBeTruthy();
    for (const game of ["Favorite Champion", "Most Annoying Champion", "Stat Duel", "Item Cost Duel"]) {
      expect(screen.getByRole("link", { name: new RegExp(game) })).toBeTruthy();
    }
    // "All games" and "Stats" both point into the preserved public URLs.
    const hrefs = screen
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"))
      .filter((h): h is string => !!h?.startsWith("/league-swipe"));
    expect(hrefs).toContain("/league-swipe");
    expect(hrefs).toContain("/league-swipe/stats");
  });

  it("brands the subsection Meta Reflex and never the retired name", () => {
    const { container } = renderHub();
    expect(screen.getByText("Meta Reflex")).toBeTruthy();
    expect(container.textContent).not.toMatch(/League Swipe/);
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

describe("LolHub — Academy Broadcast centerpiece", () => {
  it("renders the centerpiece in the desktop lane and as a mobile stack", () => {
    renderHub();
    expect(screen.getByTestId("academy-broadcast-centerpiece")).toBeTruthy();
    expect(screen.getByTestId("academy-broadcast-centerpiece-mobile")).toBeTruthy();
    // The tome shows the honest placeholder; both docks read the same store
    // and name the real runtime track.
    expect(screen.getByTestId("academy-broadcast-surface")).toHaveTextContent(
      "Transmission systems online",
    );
    expect(screen.getByTestId("academy-radio-dock")).toHaveTextContent("Tidecaller");
    expect(screen.getByTestId("academy-radio-dock-mobile")).toHaveTextContent("Tidecaller");
  });

  it("keeps the radio dock below the broadcast surface, on desktop and mobile", () => {
    renderHub();
    for (const [surfaceId, dockId] of [
      ["academy-broadcast-surface", "academy-radio-dock"],
      ["academy-broadcast-surface-mobile", "academy-radio-dock-mobile"],
    ] as const) {
      const surface = screen.getByTestId(surfaceId);
      const dock = screen.getByTestId(dockId);
      expect(
        surface.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING,
        `${dockId} below ${surfaceId}`,
      ).toBeTruthy();
      expect(surface.contains(dock)).toBe(false);
    }
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

describe("LolHub — Mogzy contextual guide", () => {
  const GUIDE_MODES: { guideId: HubGuideModeId; to: string }[] = [
    { guideId: "leaguecraft", to: "/quiz" },
    { guideId: "stat-check", to: "/quiz/stat-check" },
    { guideId: "quiz-history", to: "/lol/history" },
    { guideId: "combat-lab", to: "/combat-lab" },
    { guideId: "archives", to: "/lol/docs" },
    { guideId: "patch-reports", to: "/lol/patch-reports" },
  ];

  const card = (container: HTMLElement, id: HubGuideModeId) => {
    const el = container.querySelector<HTMLElement>(`[data-guide-mode="${id}"]`);
    expect(el, `desktop card wrapper for ${id}`).toBeTruthy();
    return el!;
  };
  const bubble = () => screen.getByTestId("mogzy-guide-bubble");

  it("starts idle: bubble hidden, Mogzy not leaning", () => {
    const { container } = renderHub();
    expect(bubble().getAttribute("data-visible")).toBe("false");
    const lean = container.querySelector<HTMLElement>('[data-testid="mogzy-guide-lean"]')!;
    expect(lean.style.getPropertyValue("--guide-lean-x")).toBe("0px");
    expect(lean.style.getPropertyValue("--guide-lean-y")).toBe("0px");
  });

  it("hovering each desktop card shows that mode's name and description", () => {
    const { container } = renderHub();
    for (const { guideId } of GUIDE_MODES) {
      fireEvent.mouseOver(card(container, guideId));
      const b = bubble();
      expect(b.getAttribute("data-visible")).toBe("true");
      expect(b.getAttribute("data-active-mode")).toBe(guideId);
      const mode = HUB_GUIDE_MODES[guideId];
      expect(b.textContent).toContain(mode.title);
      expect(b.textContent).toContain(mode.description);
      fireEvent.mouseOut(card(container, guideId));
    }
  });

  it("every hub destination participates with a bounded, subtle lean", () => {
    // Config coverage: six cards, six guide entries, movement stays small.
    const { container } = renderHub();
    expect(container.querySelectorAll("[data-guide-mode]")).toHaveLength(GUIDE_MODES.length);
    for (const { guideId } of GUIDE_MODES) {
      const mode = HUB_GUIDE_MODES[guideId];
      expect(mode.title.length).toBeGreaterThan(0);
      expect(mode.description.length).toBeGreaterThan(0);
      expect(Math.abs(mode.lean.x)).toBeLessThanOrEqual(20);
      expect(Math.abs(mode.lean.y)).toBeLessThanOrEqual(20);
    }
  });

  it("moving directly between two cards swaps the bubble without an idle flash", () => {
    const { container } = renderHub();
    fireEvent.mouseOver(card(container, "leaguecraft"));
    expect(bubble().getAttribute("data-active-mode")).toBe("leaguecraft");
    // Leave A then enter B, as a real pointer move fires them — the grace
    // delay must keep the bubble visible across the gap.
    fireEvent.mouseOut(card(container, "leaguecraft"));
    fireEvent.mouseOver(card(container, "combat-lab"));
    const b = bubble();
    expect(b.getAttribute("data-visible")).toBe("true");
    expect(b.getAttribute("data-active-mode")).toBe("combat-lab");
    expect(b.textContent).toContain("Combat Lab");
  });

  it("leaving the cards returns Mogzy to idle after the grace delay", async () => {
    const { container } = renderHub();
    fireEvent.mouseOver(card(container, "archives"));
    expect(bubble().getAttribute("data-visible")).toBe("true");
    fireEvent.mouseOut(card(container, "archives"));
    await waitFor(() => expect(bubble().getAttribute("data-visible")).toBe("false"));
    const lean = container.querySelector<HTMLElement>('[data-testid="mogzy-guide-lean"]')!;
    expect(lean.style.getPropertyValue("--guide-lean-x")).toBe("0px");
  });

  it("keyboard focus on a card link activates the guide; blur clears it", async () => {
    const { container } = renderHub();
    const link = within(card(container, "stat-check")).getByRole("link");
    fireEvent.focusIn(link);
    const b = bubble();
    expect(b.getAttribute("data-visible")).toBe("true");
    expect(b.getAttribute("data-active-mode")).toBe("stat-check");
    fireEvent.focusOut(link);
    await waitFor(() => expect(bubble().getAttribute("data-visible")).toBe("false"));
  });

  it("tabbing from one card to the next keeps the bubble up (no collapse between steps)", () => {
    const { container } = renderHub();
    const first = within(card(container, "leaguecraft")).getByRole("link");
    const second = within(card(container, "stat-check")).getByRole("link");
    fireEvent.focusIn(first);
    fireEvent.focusOut(first);
    fireEvent.focusIn(second);
    const b = bubble();
    expect(b.getAttribute("data-visible")).toBe("true");
    expect(b.getAttribute("data-active-mode")).toBe("stat-check");
  });

  it("each desktop card link is described (aria-describedby) by its mode's guide text", () => {
    const { container } = renderHub();
    for (const { guideId } of GUIDE_MODES) {
      const link = within(card(container, guideId)).getByRole("link");
      const descId = link.getAttribute("aria-describedby");
      expect(descId, `${guideId} aria-describedby`).toBeTruthy();
      const desc = container.querySelector(`#${descId}`);
      expect(desc, `${guideId} description element`).toBeTruthy();
      expect(desc!.textContent).toBe(HUB_GUIDE_MODES[guideId].description);
      // The description must live OUTSIDE the aria-hidden mascot lane.
      expect(desc!.closest('[aria-hidden="true"]'), `${guideId} desc not aria-hidden`).toBeNull();
      // Accessible name stays the card title — description does not replace it.
      expect(link.getAttribute("aria-label")).toBe(HUB_GUIDE_MODES[guideId].title);
    }
  });

  it("keeps the visual speech bubble decorative (inside the aria-hidden lane), with no live region", () => {
    const { container } = renderHub();
    const b = bubble();
    expect(b.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("guide wiring leaves card navigation untouched", () => {
    const { container } = renderHub();
    for (const { guideId, to } of GUIDE_MODES) {
      fireEvent.mouseOver(card(container, guideId));
      const link = within(card(container, guideId)).getByRole("link");
      expect(link.getAttribute("href")).toBe(to);
    }
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

describe("LolHub — the legacy popup never stacks on the HI1 introduction", () => {
  afterEach(() => {
    resetLocalStorage();
  });

  // A guest who has just been through /welcome arrives here already onboarded.
  // Handing them the legacy popup would be two first-run experiences back to
  // back — the one thing HI1 must not allow while both exist.
  it("stays hidden for a guest who chose Start Exploring", () => {
    markAcademyWelcomeHandled("explored");
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: false, completed: false };
    renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
  });

  it("stays hidden for a guest who chose the tutorial but has not finished it", () => {
    markAcademyWelcomeHandled("tutorial");
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: false, completed: false };
    renderHub();
    expect(screen.queryByTestId("lol-welcome-popup")).toBeNull();
  });

  it("still shows for a guest who has never seen the introduction", () => {
    // The suppression must be driven by real HI1 state, not by HI1 merely
    // existing — otherwise this would silently retire the popup everywhere.
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: false, completed: false };
    renderHub();
    expect(screen.getByTestId("lol-welcome-popup")).toBeTruthy();
  });

  it("still shows when HI1 state is corrupt (treated as never seen)", () => {
    localStorage.setItem("mogsy.academyWelcome.v1", "{{{");
    mocks.authUser = { id: "anon1", is_anonymous: true };
    mocks.tutorial = { loading: false, error: false, completed: false };
    renderHub();
    expect(screen.getByTestId("lol-welcome-popup")).toBeTruthy();
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
