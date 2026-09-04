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

// The four primary destinations, in reading order (TL, TR, BL, BR).
const HUB_DESTINATIONS = [
  { title: "Leaguecraft", to: "/quiz" },
  { title: "Combat Simulation", to: "/combat-lab" },
  { title: "Mogzy Archives", to: "/lol/docs" },
  { title: "Pro Play", to: "/lol/pro-play" },
];

/** Retired from the primary hub (2026-09-02) — routes and pages preserved. */
const RETIRED_PRIMARY_DESTINATIONS = [
  { title: "Stat Check", to: "/quiz/stat-check" },
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

  it("renders exactly four primary destinations and nothing else", () => {
    const { container } = renderHub();
    // Desktop books are the guide-bearing objects: one per destination.
    expect(container.querySelectorAll("[data-guide-mode]")).toHaveLength(4);
    const guideIds = [...container.querySelectorAll("[data-guide-mode]")].map((el) =>
      el.getAttribute("data-guide-mode"),
    );
    expect(new Set(guideIds)).toEqual(
      new Set(["leaguecraft", "combat-lab", "archives", "pro-play"]),
    );
  });

  it("no longer links Stat Check, Quiz History or Patch Reports from the hub", () => {
    // The routes still exist (App.startupFallbacks.test.ts guards them) and
    // each keeps its own front door — Quiz.tsx, the Leaguecraft workspace
    // History pane / profile, and the Broadcast centerpiece respectively.
    // Only the primary hub destinations were removed.
    const { container } = renderHub();
    for (const d of RETIRED_PRIMARY_DESTINATIONS) {
      expect(
        container.querySelectorAll(`a[href="${d.to}"]`),
        `${d.title} must not be a primary hub destination`,
      ).toHaveLength(0);
    }
  });

  it("keeps the Broadcast centerpiece as the homepage Patch Report entry", () => {
    renderHub();
    // Desktop + mobile centerpiece; the tome, not a book, is the front door.
    expect(screen.getAllByTestId("academy-broadcast-centerpiece").length)
      .toBeGreaterThanOrEqual(1);
  });

  it("treats Pro Play as a peer destination, not a trailing panel", () => {
    // Pro Play shipped as a standalone gold panel below the book grid with no
    // guide mode at all. The IA cleanup promoted it into the quadrant: it is
    // now a book at each breakpoint like its three peers, and Mogzy can
    // describe it.
    const { container } = renderHub();
    const proPlay = container.querySelectorAll('a[href="/lol/pro-play"]');
    expect(proPlay).toHaveLength(2); // desktop book + mobile panel
    expect(container.querySelector('[data-guide-mode="pro-play"]')).toBeTruthy();
  });

  it("no longer carries the Meta Reflex subsection or any of its duels", () => {
    // Removed from the HOMEPAGE only. The feature keeps its own front doors at
    // /league-swipe and inside Leaguecraft; this asserts the hub stopped
    // competing with its own navigation, not that anything was deleted.
    const { container } = renderHub();
    expect(screen.queryByTestId("lol-hub-meta-reflex-section")).toBeNull();
    expect(container.textContent).not.toMatch(/Meta Reflex|League Swipe|Two options\. One tap\./);
    for (const game of [
      "Favorite Champion",
      "Most Annoying Champion",
      "Base HP Duel",
      "Base AD Duel",
      "Base Armor Duel",
      "Stat Duel",
      "Item Cost Duel",
    ]) {
      expect(container.textContent).not.toMatch(new RegExp(game));
    }
    const swipeHrefs = Array.from(container.querySelectorAll("a[href]"))
      .map((l) => l.getAttribute("href")!)
      .filter((h) => h.startsWith("/league-swipe"));
    expect(swipeHrefs).toEqual([]);
  });

  it("opens the lower page with the Academy community section", () => {
    renderHub();
    const community = screen.getByTestId("hub-community-section");
    expect(within(community).getByText("Join the Academy")).toBeTruthy();
    // No Mogzy-owned social URL is configured in this repo, so the section must
    // render the pending state and NOT a link to nowhere.
    expect(screen.queryByTestId("hub-community-discord")).toBeNull();
    expect(screen.getByTestId("hub-community-discord-pending")).toBeTruthy();
    for (const id of ["youtube", "tiktok", "instagram", "x"]) {
      expect(screen.queryByTestId(`hub-community-${id}`)).toBeNull();
    }
  });

  it("routes the lower utility band only at destinations that exist", () => {
    renderHub();
    expect(screen.getByTestId("hub-utility-section")).toBeTruthy();
    expect(screen.getByTestId("hub-feedback-give").getAttribute("href")).toBe("/feedback");
    expect(screen.getByTestId("hub-feedback-bug").getAttribute("href")).toBe(
      "/feedback?intent=bug",
    );
    const utility = screen.getByTestId("hub-about-block");
    expect(within(utility).getByRole("link", { name: /About Mogzy/ }).getAttribute("href")).toBe(
      "/about",
    );
    expect(within(utility).getByRole("link", { name: /Contact/ }).getAttribute("href")).toBe(
      "/contact",
    );
  });

  it("fades the painted library into the lower page instead of cutting it off", () => {
    const { container } = renderHub();
    // Both the painting and its readability scrim carry the ramp; masking only
    // the painting would leave the scrim as a dark band over the page below.
    const faded = container.querySelectorAll(".academy-hero-fade");
    expect(faded).toHaveLength(2);
    expect(
      container.querySelector('[data-testid="academy-library-background"]')?.className,
    ).toMatch(/academy-hero-fade/);
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

  it("renders no page-level signup banner for guests — the HUD owns guest conversion now", () => {
    mocks.authUser = { id: "anon1", is_anonymous: true };
    renderHub();
    // The retired full-width banner (mount-scoped dismissal, unmeasured CTA)
    // must not resurface on the hub; GlobalHud's chip and account-menu entry
    // replaced it. Its copy, CTA, and dismiss control are all gone.
    expect(screen.queryByText("Save XP and streaks across devices.")).toBeNull();
    expect(screen.queryByText(/Sign up to save your XP/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign up free" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
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
    { guideId: "combat-lab", to: "/combat-lab" },
    { guideId: "archives", to: "/lol/docs" },
    { guideId: "pro-play", to: "/lol/pro-play" },
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

  it("every hub destination participates with a bounded, directional glide", () => {
    // Config coverage: four cards, four guide entries. Horizontal is the
    // dominant signal but stays bounded — Mogzy glides toward the hovered
    // side without leaving his central stage (see hub-guide.ts for the
    // measured lane clearances behind the 110/40 caps).
    const { container } = renderHub();
    expect(container.querySelectorAll("[data-guide-mode]")).toHaveLength(GUIDE_MODES.length);
    const LEFT_MODES: HubGuideModeId[] = ["leaguecraft", "archives"];
    for (const { guideId } of GUIDE_MODES) {
      const mode = HUB_GUIDE_MODES[guideId];
      expect(mode.title.length).toBeGreaterThan(0);
      expect(mode.description.length).toBeGreaterThan(0);
      expect(Math.abs(mode.lean.x)).toBeLessThanOrEqual(110);
      expect(Math.abs(mode.lean.y)).toBeLessThanOrEqual(40);
      // Direction must match the card's side of the hub.
      expect(Math.sign(mode.lean.x)).toBe(LEFT_MODES.includes(guideId) ? -1 : 1);
      // The bubble sits BESIDE Mogzy on the hovered side: a real lateral
      // offset (past his ~70px half-width so it reads as "next to him",
      // bounded so it stays attached rather than making a second journey),
      // pointing the same way as the lean, plus a bounded vertical trim —
      // a drop from hat-height to head-height. Past ±~60 the bubble either
      // detaches upward or runs into the bottom row's own card titles.
      const bubble = mode.bubble ?? { x: 0, y: 0 };
      expect(Math.abs(bubble.x)).toBeGreaterThanOrEqual(50);
      expect(Math.abs(bubble.x)).toBeLessThanOrEqual(100);
      expect(Math.sign(bubble.x)).toBe(Math.sign(mode.lean.x));
      expect(Math.abs(bubble.y ?? 0)).toBeLessThanOrEqual(60);
      // Wide desktops must always show the attached, head-height placement:
      // a responsive narrow-desktop lift may only raise the bubble (more
      // negative), never push it further down than the wide value.
      if (bubble.yNarrow !== undefined) {
        expect(Math.abs(bubble.yNarrow)).toBeLessThanOrEqual(60);
        expect(bubble.yNarrow).toBeLessThanOrEqual(bubble.y ?? 0);
      }
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
    expect(b.textContent).toContain("Combat Simulation");
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
    const link = within(card(container, "archives")).getByRole("link");
    fireEvent.focusIn(link);
    const b = bubble();
    expect(b.getAttribute("data-visible")).toBe("true");
    expect(b.getAttribute("data-active-mode")).toBe("archives");
    fireEvent.focusOut(link);
    await waitFor(() => expect(bubble().getAttribute("data-visible")).toBe("false"));
  });

  it("tabbing from one card to the next keeps the bubble up (no collapse between steps)", () => {
    const { container } = renderHub();
    const first = within(card(container, "leaguecraft")).getByRole("link");
    const second = within(card(container, "combat-lab")).getByRole("link");
    fireEvent.focusIn(first);
    fireEvent.focusOut(first);
    fireEvent.focusIn(second);
    const b = bubble();
    expect(b.getAttribute("data-visible")).toBe("true");
    expect(b.getAttribute("data-active-mode")).toBe("combat-lab");
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

/**
 * Mascot animation prototype: directional facing + the click reaction.
 * Both live on their own transform layers inside MogzyHubGuide, above the
 * untouched idle-float root and contextual lean layer.
 */
describe("LolHub — Mogzy mascot animation prototype", () => {
  const facing = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-testid="mogzy-guide-facing"]')!;
  const react = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('[data-testid="mogzy-guide-react"]')!;
  const mascot = (container: HTMLElement) =>
    container.querySelector<HTMLImageElement>('img[src*="mogzy-mascot-base"]')!;
  const card = (container: HTMLElement, id: HubGuideModeId) =>
    container.querySelector<HTMLElement>(`[data-guide-mode="${id}"]`)!;

  it("idle sits at the unmirrored artwork, which already faces left", () => {
    const { container } = renderHub();
    expect(facing(container).style.getPropertyValue("--mogzy-facing")).toBe("1");
    expect(facing(container).getAttribute("data-facing")).toBe("left");
  });

  it("mirrors toward the hovered card's side, for every card", () => {
    const { container } = renderHub();
    for (const id of Object.keys(HUB_GUIDE_MODES) as HubGuideModeId[]) {
      fireEvent.mouseOver(card(container, id));
      // The facing must agree with the direction Mogzy is already gliding.
      const expected = HUB_GUIDE_MODES[id].lean.x > 0 ? "right" : "left";
      expect(facing(container).getAttribute("data-facing"), id).toBe(expected);
      expect(facing(container).style.getPropertyValue("--mogzy-facing")).toBe(
        expected === "right" ? "-1" : "1",
      );
      fireEvent.mouseOut(card(container, id));
    }
  });

  it("returns to the normal orientation once the cards go idle", async () => {
    const { container } = renderHub();
    // Archives moved to the LEFT column in the quadrant; pro-play is the
    // right-hand card that mirrors Mogzy.
    fireEvent.mouseOver(card(container, "pro-play"));
    expect(facing(container).getAttribute("data-facing")).toBe("right");
    fireEvent.mouseOut(card(container, "pro-play"));
    await waitFor(() =>
      expect(facing(container).getAttribute("data-facing")).toBe("left"),
    );
  });

  it("facing never touches the speech bubble (it must not read mirrored)", () => {
    const { container } = renderHub();
    fireEvent.mouseOver(card(container, "combat-lab"));
    expect(facing(container).contains(screen.getByTestId("mogzy-guide-bubble"))).toBe(
      false,
    );
    expect(facing(container).contains(mascot(container))).toBe(true);
  });

  it("clicking Mogzy plays the reaction without navigating", () => {
    const { container } = renderHub();
    expect(react(container).className).not.toContain("mogzy-click-react");
    fireEvent.click(mascot(container));
    expect(react(container).className).toContain("mogzy-click-react");
    // Decorative easter egg only: the mascot is not a link or a button.
    expect(mascot(container).closest("a")).toBeNull();
    expect(mascot(container).closest("button")).toBeNull();
  });

  it("rapid repeated clicks restart the reaction instead of sticking", () => {
    const { container } = renderHub();
    fireEvent.click(mascot(container));
    fireEvent.click(mascot(container));
    fireEvent.click(mascot(container));
    // Exactly one instance of the class — no accumulation, no stuck state.
    expect(react(container).className.split(/\s+/).filter((c) => c === "mogzy-click-react"))
      .toHaveLength(1);
    // And the animation is self-clearing when it completes.
    fireEvent.animationEnd(react(container));
    expect(react(container).className).not.toContain("mogzy-click-react");
  });

  it("clicking while a card is active leaves that card's state intact", () => {
    const { container } = renderHub();
    fireEvent.mouseOver(card(container, "archives"));
    fireEvent.click(mascot(container));
    const bubble = screen.getByTestId("mogzy-guide-bubble");
    expect(bubble.getAttribute("data-visible")).toBe("true");
    expect(bubble.getAttribute("data-active-mode")).toBe("archives");
    expect(facing(container).getAttribute("data-facing")).toBe("left");
    // The lean layer is untouched by the reaction — the hop composes on top.
    const lean = container.querySelector<HTMLElement>('[data-testid="mogzy-guide-lean"]')!;
    expect(lean.style.getPropertyValue("--guide-lean-x")).toContain(
      String(HUB_GUIDE_MODES["archives"].lean.x),
    );
  });

  // Regression guard for the bug this phase fixed: these timings used to be
  // Tailwind `duration-[…]`/`ease-[…]` utilities, which this build never
  // emits for arbitrary values — so the lean silently ran at the 150ms
  // default instead of its authored 340ms. jsdom does not load index.css, so
  // computed style cannot see it; asserting against the stylesheet source is
  // what keeps the shipped number equal to the intended number.
  it("keeps the mascot timings in authored CSS, not arbitrary Tailwind utilities", async () => {
    const { readFileSync } = await import("node:fs");
    // Repo-root relative: vitest runs from the project root.
    const css = readFileSync("src/index.css", "utf8");
    const rule = (selector: string) =>
      css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));

    // One gesture, one beat: mascot glide, bubble and tail must share it.
    expect(rule(".mogzy-lean-glide")).toContain("340ms");
    expect(rule(".mogzy-lean-bubble")).toContain("340ms");
    expect(rule(".mogzy-lean-bubble-tail")).toContain("340ms");
    // Approved prototype timings — do not drift.
    expect(rule(".mogzy-facing-turn")).toContain("280ms");
    expect(rule(".mogzy-click-react")).toContain("540ms");

    // The markup must carry the authored classes rather than re-introducing
    // a duration utility whose value never reaches the page.
    const { container } = renderHub();
    const lean = container.querySelector('[data-testid="mogzy-guide-lean"]')!;
    expect(lean.className).toContain("mogzy-lean-glide");
    expect(lean.className).not.toMatch(/duration-\[/);
    expect(facing(container).className).not.toMatch(/duration-\[/);
  });

  it("reduced motion suppresses the click reaction entirely", () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({
        matches: q.includes("prefers-reduced-motion"),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      const { container } = renderHub();
      fireEvent.click(mascot(container));
      expect(react(container).className).not.toContain("mogzy-click-react");
    } finally {
      window.matchMedia = original;
    }
  });
});

/**
 * Closed Academy volumes — the approved four-book quadrant (2026-09-02d).
 *
 * All four primary destinations render `AcademyHubBook`. These tests pin what
 * the conversion must not break — routes, accessible names, guide wiring, the
 * cover-title setting and the mirrored inward perspective.
 */
describe("LolHub — closed Academy volumes (four-book quadrant)", () => {
  const volumes = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLAnchorElement>("a.academy-hub-book")];

  it("renders all four destinations as closed volumes and no open cards", () => {
    const { container } = renderHub();
    expect(volumes(container).map((a) => a.getAttribute("href"))).toEqual([
      "/quiz",
      "/lol/docs",
      "/combat-lab",
      "/lol/pro-play",
    ]);
    expect(container.querySelectorAll("a.book-mode-card")).toHaveLength(0);
  });

  it("keeps every route, accessible name and guide description", () => {
    const { container } = renderHub();
    for (const link of volumes(container)) {
      const id = link.closest("[data-guide-mode]")!.getAttribute("data-guide-mode") as HubGuideModeId;
      // aria-label stays the REGISTRY title, never the cover's line setting.
      expect(link.getAttribute("aria-label")).toBe(HUB_GUIDE_MODES[id].title);
      const describedBy = link.getAttribute("aria-describedby")!;
      expect(document.getElementById(describedBy)?.textContent).toBe(
        HUB_GUIDE_MODES[id].description,
      );
    }
  });

  it("prints cover titles as split lines, never baked into the art", () => {
    const { container } = renderHub();
    const lines = (href: string) =>
      [
        ...container
          .querySelector(`a.academy-hub-book[href="${href}"] .academy-hub-book-title`)!
          .querySelectorAll("span"),
      ].map((s) => s.textContent);
    expect(lines("/quiz")).toEqual(["Leaguecraft", "Studies"]);
    expect(lines("/combat-lab")).toEqual(["Combat", "Simulation"]);
    expect(lines("/lol/docs")).toEqual(["Mogzy", "Archives"]);
    // Split is on "\n", never on spaces, so this stays one line.
    expect(lines("/lol/pro-play")).toEqual(["Pro Play"]);
  });

  it("no cover carries the registry subtitle — Mogzy narrates instead", () => {
    const { container } = renderHub();
    for (const link of volumes(container)) {
      expect(link.textContent).not.toMatch(/Study\.|Practice\.|Explore League|Quiz yourself/);
    }
  });

  it("still drives Mogzy's guide from every book, on hover and on focus", () => {
    const { container } = renderHub();
    for (const id of Object.keys(HUB_GUIDE_MODES) as HubGuideModeId[]) {
      const wrapper = container.querySelector(`[data-guide-mode="${id}"]`)!;
      expect(wrapper.querySelector("a.academy-hub-book")).not.toBeNull();
      fireEvent.mouseEnter(wrapper);
      expect(screen.getAllByText(HUB_GUIDE_MODES[id].description).length).toBeGreaterThan(0);
      fireEvent.mouseLeave(wrapper);
      fireEvent.focus(wrapper);
      expect(screen.getAllByText(HUB_GUIDE_MODES[id].description).length).toBeGreaterThan(0);
      fireEvent.blur(wrapper);
    }
  });

  it("presents every volume HEAD-ON — no resting rotation anywhere", () => {
    const { container } = renderHub();
    // The shelves explain where the books are, so the inward turn the volumes
    // used to carry (+/-11deg, halved on hover) is gone. Any inline transform
    // or rotation custom property here would be a regression to that.
    for (const link of volumes(container)) {
      for (const prop of [
        "--hub-book-rotate-y",
        "--hub-book-rotate-y-hover",
        "--hub-book-rotate-z",
      ]) {
        expect(link.style.getPropertyValue(prop)).toBe("");
      }
      expect(link.style.transform).toBe("");
      expect(link.querySelector<HTMLElement>(".academy-hub-book-body")!.style.transform).toBe("");
    }
  });

  it("gives both columns a shelf, and the volumes sit in front of it", () => {
    const { container } = renderHub();
    const shelves = container.querySelectorAll(".academy-hub-shelf");
    expect(shelves).toHaveLength(2);
    for (const shelf of shelves) {
      // Decorative only: it must never take a click, a focus stop or an
      // announcement away from a destination link.
      expect(shelf.getAttribute("aria-hidden")).toBe("true");
      expect(shelf.className).toContain("pointer-events-none");
      expect(shelf.className).toContain("z-0");
      // Each shelf is a sibling of the pair it stands behind.
      expect(shelf.parentElement!.querySelectorAll("a.academy-hub-book")).toHaveLength(2);
    }
    for (const link of volumes(container)) {
      expect(link.parentElement!.className).toContain("z-10");
    }
  });

  it("the mobile panel list is untouched by the conversion", () => {
    const { container } = renderHub();
    // Every destination still appears twice: desktop volume + mobile panel.
    for (const href of ["/quiz", "/combat-lab", "/lol/docs", "/lol/pro-play"]) {
      expect(container.querySelectorAll(`a[href="${href}"]`)).toHaveLength(2);
      expect(container.querySelector(`a.academy-hub-book[href="${href}"]`)).not.toBeNull();
    }
  });
});
