/**
 * Academy Core V3 — navigation contracts, rendered.
 *
 * The page is mounted in a MemoryRouter beside probe routes for every
 * destination, so each assertion is about where a REAL click lands (and with
 * what router state and timing), not about an href string.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { hasDailyStartIntent } from "@/lib/daily-challenge/run/entry";
import { hasVisitedHub } from "@/lib/quiz/onboarding-gate";
import { UNKNOWN_DAILY_STATUS, type DailyStatusView } from "@/lib/daily-challenge/status";
import { INITIAL_BROADCAST_FEED, type BroadcastFeed } from "@/components/lol/broadcast/broadcast-content";
import { HUB_GUIDE_MODES } from "@/components/lol/hub-guide";

const track = vi.fn();
const surfaceEvent = vi.fn();
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return {
    ...actual,
    track: (...args: unknown[]) => track(...args),
    // The once-per-session surface boundary is the hook's own contract; here
    // only that the home surface asks for `hub_entered` matters.
    useSurfaceEvent: (name: string) => { surfaceEvent(name); },
  };
});
const playSfx = vi.fn();
vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: playSfx }) }));
vi.mock("@/lib/funnel-analytics", () => ({
  trackFunnelEvent: (name: string, payload?: Record<string, unknown>) => track(name, payload),
}));

const dailyStatus: { current: DailyStatusView } = { current: UNKNOWN_DAILY_STATUS };
const dailyEnabled = vi.fn();
const auth: { user: { id: string } | null } = { user: { id: "test-user" } };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock("@/lib/daily-challenge/useDailyChallengeStatus", () => ({
  useDailyChallengeStatus: (opts?: { enabled?: boolean }) => { dailyEnabled(opts?.enabled); return dailyStatus.current; },
}));

const feed: { current: BroadcastFeed } = { current: INITIAL_BROADCAST_FEED };
vi.mock("@/components/lol/broadcast/usePatchBriefFeed", () => ({ usePatchBriefFeed: () => feed.current }));

const MANIFEST = { champions: Object.fromEntries(["Ryze", "Ahri", "Akali", "Viktor"].map((n) => [n, {
  icon: `assets/champions/${n}/icon.png`, splash: `assets/champions/${n}/splash/0_default.jpg`, loading: "", cutout: "",
}])) };
const manifest: { current: typeof MANIFEST | null } = { current: MANIFEST };
vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return { ...actual, useChampionAssets: () => ({ data: manifest.current }) };
});

// The warm is observed, never run (no Image loads in jsdom).
const warm = vi.fn(() => Promise.resolve({ leaguecraft: null, "pro-play": null, "combat-lab": null, archives: null }));
vi.mock("./academy-core-warm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./academy-core-warm")>()),
  warmAcademyCore: () => warm(),
}));
vi.mock("@/lib/audio/academy-radio", () => ({
  useAcademyRadio: () => ({ isPlaying: false, isTransmitting: false, title: "", subtitle: "", volume: 0.15, tune: vi.fn(), next: vi.fn(), setVolume: vi.fn(), status: "idle" }),
}));
vi.mock("@/components/audio/AcademyRadioDock", () => ({
  default: ({ variant }: { variant: string }) => <div data-testid={`academy-radio-${variant === "desktop" ? "dock" : "dock-mobile"}`} />,
}));
const sfxPlay = vi.fn();
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: sfxPlay, stop: vi.fn(), preload: vi.fn() }) }));
const prefetchRoute = vi.fn();
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: (p: string) => prefetchRoute(p) }));
const reduced = { current: false };
vi.mock("@/hooks/useReducedMotionPreference", () => ({ useReducedMotionPreference: () => reduced.current }));

/** Per-test control of window.matchMedia (the setup file answers false to everything). */
const matchMediaMatches: { current: (q: string) => boolean } = { current: () => false };

import AcademyCorePage from "./AcademyCorePage";
import { BOOK_ACTIVATION_MS, CORE_DESTINATIONS } from "./academy-core-destinations";

function Probe({ name }: { name: string }) {
  const location = useLocation();
  return (
    <>
      <div data-testid="probe">
        {name}|{location.pathname}|{location.search}|{hasDailyStartIntent(location.state) ? "daily-intent" : "no-intent"}
      </div>
      <div data-testid="probe-hash">{location.hash}</div>
    </>
  );
}

function mount(initial = "/lol") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/lol" element={<AcademyCorePage />} />
          <Route path="/quiz/daily-challenge" element={<Probe name="daily" />} />
          <Route path="/quiz" element={<Probe name="quiz" />} />
          <Route path="/quiz/ranked" element={<Probe name="ranked-host" />} />
          <Route path="/combat-lab" element={<Probe name="combat" />} />
          <Route path="/lol/docs" element={<Probe name="docs" />} />
          <Route path="/lol/pro-play" element={<Probe name="pro-play" />} />
          <Route path="/lol/patch-reports" element={<Probe name="patch-reports" />} />
          <Route path="/lol/hall" element={<Probe name="hall" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const book = (id: string) => within(screen.getByTestId(`academy-core-slot-${id}`)).getByRole("link");

beforeEach(() => {
  track.mockReset();
  surfaceEvent.mockReset();
  dailyEnabled.mockReset();
  auth.user = { id: "test-user" };
  playSfx.mockReset();
  sfxPlay.mockReset();
  prefetchRoute.mockReset();
  warm.mockClear();
  feed.current = INITIAL_BROADCAST_FEED;
  manifest.current = MANIFEST;
  reduced.current = false;
  matchMediaMatches.current = () => false;
  window.matchMedia = ((query: string) => ({
    matches: matchMediaMatches.current(query), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  dailyStatus.current = UNKNOWN_DAILY_STATUS;
  sessionStorage.clear();
});

describe("branding, shortcuts and the hub gate", () => {
  it("names the Academy, keeps Daily as the compact primary shortcut and labels Ranked for what it does", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Mogzy Academy" })).toBeInTheDocument();
    const daily = screen.getByTestId("academy-core-daily");
    expect(daily).toHaveAccessibleName("Play Daily Challenge");
    const ranked = screen.getByTestId("academy-core-ranked");
    expect(ranked).toHaveAccessibleName("Ranked");
    expect(ranked).toHaveTextContent(/opens mode selection/i);
    expect(ranked).not.toHaveTextContent(/queue/i);
  });

  it("offers resume only for a known, open, incomplete run", () => {
    dailyStatus.current = { ...UNKNOWN_DAILY_STATUS, known: true, resumable: true, completed: false };
    mount();
    expect(screen.getByTestId("academy-core-daily")).toHaveAccessibleName("Resume Daily Challenge");
  });

  it("counts a visit here as a hub visit, so /quiz does not bounce back to /lol", () => {
    expect(hasVisitedHub()).toBe(false);
    mount();
    expect(hasVisitedHub()).toBe(true);
  });

  it("Daily opens /quiz/daily-challenge immediately with the existing start-or-resume intent", () => {
    mount();
    fireEvent.click(screen.getByTestId("academy-core-daily"));
    expect(screen.getByTestId("probe")).toHaveTextContent("daily|/quiz/daily-challenge||daily-intent");
  });

  it("Ranked enters the Leaguecraft Play record (/quiz?play=1) immediately, never the live-match host", () => {
    mount();
    fireEvent.click(screen.getByTestId("academy-core-ranked"));
    expect(screen.getByTestId("probe")).toHaveTextContent("quiz|/quiz|?play=1|no-intent");
    expect(track).toHaveBeenCalledWith("leaguecraft_cta_clicked", { cta: "academy_core_ranked" });
    expect(track).not.toHaveBeenCalledWith("hub_entered", expect.anything());
  });
});

describe("the four books", () => {
  it("are the Hall's real covers: champion, crop, title lines, aria-label and description", () => {
    mount();
    for (const d of CORE_DESTINATIONS) {
      const link = book(d.id);
      expect(link).toHaveAccessibleName(d.title);
      expect(link).toHaveAccessibleDescription(d.preview);
      expect(link).toHaveAttribute("href", d.to);
      const img = link.querySelector("img[src*='/splash/']") as HTMLImageElement;
      expect(img.src).toMatch(new RegExp(`${d.championName}/splash`));
      expect(img.style.objectPosition).toBe(d.splashPosition);
      const lines = Array.from(link.querySelectorAll("h3 span")).map((s) => s.textContent);
      expect(lines).toEqual(d.coverTitle.split("\n"));
      // the shared frame, once per book
      expect(link.querySelectorAll("img[src*='academy-book-frame']")).toHaveLength(1);
    }
  });

  it("the upper pair is Leaguecraft and Pro Play, the lower pair Combat and Archives", () => {
    mount();
    const tier = (id: string) => screen.getByTestId(`academy-core-slot-${id}`).className;
    expect(tier("leaguecraft")).toContain("acore-slot-upper");
    expect(tier("pro-play")).toContain("acore-slot-upper");
    expect(tier("combat-lab")).toContain("acore-slot-lower");
    expect(tier("archives")).toContain("acore-slot-lower");
  });

  it("keeps the shell drawn when the manifest has not answered (bare leather, no broken image)", () => {
    manifest.current = null;
    mount();
    const link = book("leaguecraft");
    expect(link.querySelector("img[src*='/splash/']")).toBeNull();
    expect(link.querySelectorAll("img[src*='academy-book-frame']")).toHaveLength(1);
    expect(link).toHaveAccessibleName("Leaguecraft");
  });
});

describe("activation → navigation", () => {
  it("a click activates for BOOK_ACTIVATION_MS and then navigates itself", () => {
    vi.useFakeTimers();
    try {
      mount();
      fireEvent.click(book("combat-lab"));
      expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "combat-lab");
      expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS - 1); });
      expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(1); });
      expect(screen.getByTestId("probe")).toHaveTextContent("combat|/combat-lab||");
    } finally { vi.useRealTimers(); }
  });

  it("the activation is at most 350 ms", () => {
    expect(BOOK_ACTIVATION_MS).toBeLessThanOrEqual(350);
    expect(BOOK_ACTIVATION_MS).toBeGreaterThanOrEqual(180);
  });

  it("every room routes to its real destination", () => {
    vi.useFakeTimers();
    try {
      const expected: Record<string, string> = {
        leaguecraft: "quiz|/quiz||", "pro-play": "pro-play|/lol/pro-play||", "combat-lab": "combat|/combat-lab||", archives: "docs|/lol/docs||",
      };
      for (const d of CORE_DESTINATIONS) {
        const { unmount } = mount();
        fireEvent.click(book(d.id));
        act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS); });
        expect(screen.getByTestId("probe")).toHaveTextContent(expected[d.id]);
        unmount();
      }
    } finally { vi.useRealTimers(); }
  });

  it("rapid repeated presses navigate exactly once", () => {
    vi.useFakeTimers();
    try {
      mount();
      const link = book("archives");
      fireEvent.click(link); fireEvent.click(link); fireEvent.click(book("pro-play"));
      act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS + 50); });
      expect(screen.getByTestId("probe")).toHaveTextContent("docs|/lol/docs||");
    } finally { vi.useRealTimers(); }
  });

  it("a modified click (new tab) is left to the browser: no activation, no in-app navigation", () => {
    vi.useFakeTimers();
    try {
      mount();
      const link = book("pro-play");
      const ev = fireEvent.click(link, { ctrlKey: true });
      expect(ev, "default not prevented").toBe(true);
      expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "");
      act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS + 50); });
      expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it("reduced motion: the Link navigates at once, with no activation", () => {
    reduced.current = true;
    mount();
    fireEvent.click(book("leaguecraft"));
    expect(screen.getByTestId("probe")).toHaveTextContent("quiz|/quiz||");
    expect(track).toHaveBeenCalledWith("leaguecraft_cta_clicked", { cta: "academy_core_book" });
  });

  it("only the Leaguecraft door emits the diagnostic CTA click", () => {
    vi.useFakeTimers();
    try {
      mount();
      fireEvent.click(book("combat-lab"));
      expect(track).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("warms the route chunk on hover, focus and press before any click", () => {
    mount();
    const slot = screen.getByTestId("academy-core-slot-pro-play");
    fireEvent.pointerEnter(slot, { pointerType: "mouse" });
    fireEvent.focus(slot);
    fireEvent.pointerDown(slot);
    expect(prefetchRoute).toHaveBeenCalledWith("/lol/pro-play");
  });
});

describe("focus states and the crystal", () => {
  it("keyboard focus on a book engages the room, Mogzy reacts, blur returns to idle", () => {
    vi.useFakeTimers();
    try {
      mount();
      const stage = screen.getByTestId("academy-core-stage");
      expect(stage).toHaveAttribute("data-focus", "idle");
      act(() => { book("combat-lab").focus(); });
      expect(stage).toHaveAttribute("data-focus", "combat-lab");
      expect(screen.getByTestId("academy-core-mogzy")).toHaveAttribute("data-pose", "raisingHand");
      expect(screen.getByTestId("academy-core-readout")).toHaveTextContent(HUB_GUIDE_MODES["combat-lab"].description);
      act(() => { book("combat-lab").blur(); });
      act(() => { vi.advanceTimersByTime(200); });
      expect(stage).toHaveAttribute("data-focus", "idle");
    } finally { vi.useRealTimers(); }
  });

  it("the crystal is a labelled button that cycles the four previews without navigating, with a readout", () => {
    mount();
    const crystal = screen.getByRole("button", { name: /cycle the room preview/i });
    const stage = screen.getByTestId("academy-core-stage");
    const readout = screen.getByTestId("academy-core-preview");
    expect(readout).toHaveTextContent("No room previewed");
    const order = ["leaguecraft", "pro-play", "combat-lab", "archives", "idle"];
    const titles = ["Leaguecraft", "Pro Play", "Combat Simulation", "Mogzy Archives", null];
    order.forEach((id, i) => {
      fireEvent.click(crystal);
      expect(stage).toHaveAttribute("data-focus", id);
      expect(readout).toHaveTextContent(titles[i] ? `Previewing ${titles[i]}` : "No room previewed");
    });
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
  });

  it("a touch press engages the state immediately (no hover required)", () => {
    mount();
    fireEvent.pointerDown(screen.getByTestId("academy-core-slot-archives"), { pointerType: "touch" });
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "archives");
  });
});

describe("the Patch Report book and the second screen", () => {
  it("stacked: the upper pair, then the crystal band, then the lower pair, then the mobile book", () => {
    mount();
    const rooms = screen.getByRole("navigation", { name: "Academy rooms" });
    const upper = screen.getByTestId("academy-core-slot-leaguecraft");
    const stage = screen.getByTestId("academy-core-stage");
    const lower = screen.getByTestId("academy-core-slot-combat-lab");
    const bookM = screen.getByTestId("academy-core-book-mobile");
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(rooms.contains(upper) && rooms.contains(lower)).toBe(true);
    expect(follows(upper, stage)).toBe(true);
    expect(follows(stage, lower)).toBe(true);
    expect(follows(lower, bookM)).toBe(true);
    expect(within(bookM).getByTestId("academy-broadcast-surface-mobile")).toBeInTheDocument();
    expect(screen.queryByTestId("academy-broadcast-surface")).not.toBeInTheDocument();
    // no spine image, no second book variant
    expect(document.querySelector("img[src*='book-spine']")).toBeNull();
  });

  it("full composition: the real desktop book with its radio dock on the island, the books mounted on the instrument", () => {
    matchMediaMatches.current = (q) => q.includes("min-width: 1024px");
    mount();
    const island = screen.getByTestId("academy-core-book");
    expect(within(island).getByTestId("academy-broadcast-surface")).toBeInTheDocument();
    expect(within(island).getByTestId("academy-radio-dock")).toBeInTheDocument();
    expect(screen.queryByTestId("academy-broadcast-surface-mobile")).not.toBeInTheDocument();
    expect(screen.getByTestId("academy-core-slot-leaguecraft").className).toContain("acore-slot-mounted");
    expect(screen.getAllByRole("link", { name: /^(Leaguecraft|Pro Play|Combat Simulation|Mogzy Archives)$/ })).toHaveLength(4);
  });

  it("shows the live Patch Brief in the book and carries its icons into the Archives projection", () => {
    feed.current = {
      status: "ready", index: 0,
      transmissions: [{
        id: "patch-brief-26.20", channel: "patch-brief", eyebrow: "Patch Brief", headline: "Patch 26.20",
        primaryAction: { label: "Read full report", to: "/lol/patch-reports?patch=26.20" },
        brief: {
          patchVersion: "26.20", patchLabel: "Patch 26.20", fullReportHref: "/lol/patch-reports?patch=26.20",
          sections: [{ direction: "buff", title: "Buffs", entries: [
            { entityType: "champion", entityId: "ryze", iconUrl: "https://cdn.test/ryze.png", accessibleName: "Ryze" },
            { entityType: "champion", entityId: "ahri", iconUrl: "https://cdn.test/ahri.png", accessibleName: "Ahri" },
          ] }],
        },
      }],
    };
    mount();
    expect(screen.getByText("Patch 26.20")).toBeInTheDocument();
    const svg = screen.getByRole("img", { name: "The Academy Core instrument" });
    const hrefs = Array.from(svg.querySelectorAll(".acore-mode-archives image")).map((i) => i.getAttribute("href"));
    expect(hrefs).toEqual(["https://cdn.test/ryze.png", "https://cdn.test/ahri.png"]);
  });

  it("keeps Academy Commons and the Hall reachable, immediately, as client-side links", () => {
    mount();
    expect(screen.getByTestId("academy-core-commons-link")).toHaveAttribute("href", "/lol/hall#academy-commons");
    expect(screen.getByTestId("academy-core-hall-link")).toHaveAttribute("href", "/lol/hall");
    fireEvent.click(screen.getByTestId("academy-core-hall-link"));
    expect(screen.getByTestId("probe")).toHaveTextContent("hall|/lol/hall||");
  });

  it("the Commons link lands on the Hall with the fragment the Hall honours", () => {
    mount();
    fireEvent.click(screen.getByTestId("academy-core-commons-link"));
    expect(screen.getByTestId("probe")).toHaveTextContent("hall|/lol/hall||");
    expect(screen.getByTestId("probe-hash")).toHaveTextContent("#academy-commons");
  });

  it("forwards a legacy /lol#academy-commons deep link to the Hall's Commons (replace)", () => {
    mount("/lol#academy-commons");
    expect(screen.queryByTestId("academy-core")).toBeNull();
    expect(screen.getByTestId("probe")).toHaveTextContent("hall|/lol/hall||");
    expect(screen.getByTestId("probe-hash")).toHaveTextContent("#academy-commons");
  });

  it("any other fragment on /lol renders the Core", () => {
    mount("/lol#something-else");
    expect(screen.getByTestId("academy-core")).toBeInTheDocument();
  });
});

describe("activation does not latch", () => {
  function mountPersistent() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/lol"]}>
          <Routes>
            {/* a destination that keeps the Core mounted (slow chunk, redirect back, Back) */}
            <Route path="*" element={<AcademyCorePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("clears the activating state after the navigation window if the Core is still mounted", () => {
    vi.useFakeTimers();
    try {
      mountPersistent();
      fireEvent.click(within(screen.getByTestId("academy-core-slot-archives")).getByRole("link"));
      expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "archives");
      act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS + 10); });
      act(() => { vi.advanceTimersByTime(1600); });
      expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears it at once on a popstate (Back)", () => {
    vi.useFakeTimers();
    try {
      mountPersistent();
      fireEvent.click(within(screen.getByTestId("academy-core-slot-archives")).getByRole("link"));
      act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS + 10); });
      expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "archives");
      act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
      expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the home surface contract", () => {
  it("emits the funnel's hub_entered surface event and the Hall's arrival cue", () => {
    mount();
    expect(surfaceEvent).toHaveBeenCalledWith("hub_entered");
    expect(sfxPlay).toHaveBeenCalledWith("hub.application.enter");
  });

  it("reads the authenticated Daily status only when there is a session", () => {
    mount();
    expect(dailyEnabled).toHaveBeenLastCalledWith(true);
    dailyEnabled.mockReset();
    auth.user = null;
    mount();
    expect(dailyEnabled).toHaveBeenLastCalledWith(false);
    expect(screen.getAllByTestId("academy-core-daily").at(-1)).toHaveAccessibleName("Play Daily Challenge");
  });

  it("is indexable with the Hall's title, description and canonical /lol", () => {
    mount();
    expect(document.title).toBe("Mogzy LoL Quiz | League of Legends Trivia and Training");
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toMatch(/\/lol$/);
  });

  it("plays the Hall's book-open cue when a book is activated (never for a modified click)", () => {
    mount();
    fireEvent.click(book("archives"), { ctrlKey: true });
    expect(playSfx).not.toHaveBeenCalled();
    fireEvent.click(book("archives"));
    expect(playSfx).toHaveBeenCalledWith("bookRuffle");
  });
});
