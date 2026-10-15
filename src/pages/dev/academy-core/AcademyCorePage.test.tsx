/**
 * Academy Core V1 — navigation contracts, rendered.
 *
 * The page is mounted in a MemoryRouter beside probe routes for every
 * destination, so each assertion is about where a REAL click lands (and with
 * what router state), not about an href string.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { hasDailyStartIntent } from "@/lib/daily-challenge/run/entry";
import { hasVisitedHub } from "@/lib/quiz/onboarding-gate";
import { UNKNOWN_DAILY_STATUS, type DailyStatusView } from "@/lib/daily-challenge/status";

const track = vi.fn();
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, track: (...args: unknown[]) => track(...args) };
});
vi.mock("@/lib/funnel-analytics", () => ({
  trackFunnelEvent: (name: string, payload?: Record<string, unknown>) => track(name, payload),
}));

const dailyStatus: { current: DailyStatusView } = { current: UNKNOWN_DAILY_STATUS };
vi.mock("@/lib/daily-challenge/useDailyChallengeStatus", () => ({
  useDailyChallengeStatus: () => dailyStatus.current,
}));

import { INITIAL_BROADCAST_FEED, type BroadcastFeed } from "@/components/lol/broadcast/broadcast-content";
const feed: { current: BroadcastFeed } = { current: INITIAL_BROADCAST_FEED };
vi.mock("@/components/lol/broadcast/usePatchBriefFeed", () => ({
  usePatchBriefFeed: () => feed.current,
}));
// The warm is observed, never run (no Image loads in jsdom); it resolves with
// no manifest icons so the projections render their reserved plates only.
const warm = vi.fn(() => Promise.resolve({ inquiryIcon: null, observeIcon: null }));
vi.mock("./academy-core-warm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./academy-core-warm")>()),
  warmAcademyCore: (...args: unknown[]) => warm(...args),
}));
vi.mock("@/lib/audio/academy-radio", () => ({
  useAcademyRadio: () => ({ isPlaying: false, isTransmitting: false, title: "", subtitle: "", volume: 0.15, tune: vi.fn(), next: vi.fn(), setVolume: vi.fn(), status: "idle" }),
}));
vi.mock("@/components/audio/AcademyRadioDock", () => ({
  default: ({ variant }: { variant: string }) => <div data-testid={`academy-radio-${variant === "desktop" ? "dock" : "dock-mobile"}`} />,
}));
/** Per-test control of window.matchMedia (the setup file answers false to everything). */
const matchMediaMatches: { current: (q: string) => boolean } = { current: () => false };

const sfxPlay = vi.fn();
vi.mock("@/lib/audio/useSfx", () => ({
  useSfx: () => ({ play: sfxPlay, stop: vi.fn(), preload: vi.fn() }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));

import { HUB_GUIDE_MODES } from "@/components/lol/hub-guide";
import AcademyCorePage from "./AcademyCorePage";
import { CORE_DESTINATIONS } from "./academy-core-destinations";

function Probe({ name }: { name: string }) {
  const location = useLocation();
  return (
    <div data-testid="probe">
      {name}|{location.pathname}|{location.search}|{hasDailyStartIntent(location.state) ? "daily-intent" : "no-intent"}
    </div>
  );
}

function mount(initial = "/lol/dev/academy-core") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/lol/dev/academy-core" element={<AcademyCorePage />} />
          <Route path="/quiz/daily-challenge" element={<Probe name="daily" />} />
          <Route path="/quiz" element={<Probe name="quiz" />} />
          <Route path="/quiz/ranked" element={<Probe name="ranked-host" />} />
          <Route path="/combat-lab" element={<Probe name="combat" />} />
          <Route path="/lol/docs" element={<Probe name="docs" />} />
          <Route path="/lol/pro-play" element={<Probe name="pro-play" />} />
          <Route path="/lol/patch-reports" element={<Probe name="patch-reports" />} />
          <Route path="/lol" element={<Probe name="hall" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  track.mockReset();
  sfxPlay.mockReset();
  warm.mockClear();
  feed.current = INITIAL_BROADCAST_FEED;
  matchMediaMatches.current = () => false;
  window.matchMedia = ((query: string) => ({
    matches: matchMediaMatches.current(query), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  dailyStatus.current = UNKNOWN_DAILY_STATUS;
  sessionStorage.clear();
  // jsdom: no layout. The setup file's matchMedia answers `false` to every
  // query, so the page renders its stacked (row) composition here.
});

describe("branding and hierarchy", () => {
  it("names the Academy and makes Daily the primary action", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Mogzy Academy" })).toBeInTheDocument();
    const daily = screen.getByTestId("academy-core-daily");
    expect(daily).toHaveAccessibleName("Play Daily Challenge");
    expect(daily.className).toContain("acore-cta-primary");
    const ranked = screen.getByTestId("academy-core-ranked");
    expect(ranked).toHaveAccessibleName("Ranked");
    expect(ranked.className).toContain("acore-cta-secondary");
  });

  it("shows no Daily status line until the service has answered", () => {
    mount();
    expect(screen.queryByTestId("academy-core-daily-status")).not.toBeInTheDocument();
  });

  it("offers resume only for a known, open, incomplete run", () => {
    dailyStatus.current = { ...UNKNOWN_DAILY_STATUS, known: true, resumable: true, completed: false };
    mount();
    expect(screen.getByTestId("academy-core-daily")).toHaveAccessibleName("Resume Daily Challenge");
    expect(screen.getByTestId("academy-core-daily-status")).toHaveTextContent("A run is in progress");
  });

  it("reports a completed Daily without changing the destination", () => {
    dailyStatus.current = { ...UNKNOWN_DAILY_STATUS, known: true, resumable: false, completed: true };
    mount();
    expect(screen.getByTestId("academy-core-daily")).toHaveAccessibleName("Play Daily Challenge");
    expect(screen.getByTestId("academy-core-daily-status")).toHaveTextContent("Today's Daily is complete.");
  });
});

describe("the Daily CTA", () => {
  it("opens /quiz/daily-challenge carrying the existing start-or-resume intent", () => {
    mount();
    fireEvent.click(screen.getByTestId("academy-core-daily"));
    expect(screen.getByTestId("probe")).toHaveTextContent("daily|/quiz/daily-challenge||daily-intent");
  });
});

describe("the lobby's hub gate", () => {
  it("counts a visit here as a hub visit, so /quiz does not bounce back to /lol", () => {
    expect(hasVisitedHub()).toBe(false);
    mount();
    expect(hasVisitedHub()).toBe(true);
  });
});

describe("the Ranked CTA", () => {
  it("enters the Leaguecraft Play record (/quiz?play=1), never the live-match host", () => {
    mount();
    fireEvent.click(screen.getByTestId("academy-core-ranked"));
    expect(screen.getByTestId("probe")).toHaveTextContent("quiz|/quiz|?play=1|no-intent");
    expect(screen.queryByText(/ranked-host/)).not.toBeInTheDocument();
  });

  it("records the door diagnostically, not as a Leaguecraft open", () => {
    mount();
    fireEvent.click(screen.getByTestId("academy-core-ranked"));
    expect(track).toHaveBeenCalledWith("leaguecraft_cta_clicked", { cta: "academy_core_ranked" });
    expect(track).not.toHaveBeenCalledWith("leaguecraft_opened", expect.anything());
    expect(track).not.toHaveBeenCalledWith("hub_entered", expect.anything());
  });
});

describe("the four room entrances", () => {
  const expected: Record<string, string> = {
    leaguecraft: "quiz|/quiz||",
    "combat-lab": "combat|/combat-lab||",
    archives: "docs|/lol/docs||",
    "pro-play": "pro-play|/lol/pro-play||",
  };

  for (const d of CORE_DESTINATIONS) {
    it(`${d.title} routes on the first click`, () => {
      mount();
      const link = screen.getByTestId(`academy-core-bay-${d.id}`);
      expect(link).toHaveAccessibleName(d.title);
      expect(link).toHaveAccessibleDescription(d.preview);
      fireEvent.click(link);
      expect(screen.getByTestId("probe")).toHaveTextContent(expected[d.id]);
    });
  }

  it("are exactly four, labelled, inside a named navigation landmark", () => {
    mount();
    const nav = screen.getByRole("navigation", { name: "Academy rooms" });
    const links = nav.querySelectorAll("a[data-bay]");
    expect(links).toHaveLength(4);
    expect(Array.from(links).map((l) => l.getAttribute("data-bay"))).toEqual([
      "leaguecraft", "combat-lab", "archives", "pro-play",
    ]);
  });

  it("only the Leaguecraft door emits the diagnostic CTA click", () => {
    mount();
    fireEvent.click(screen.getByTestId("academy-core-bay-combat-lab"));
    expect(track).not.toHaveBeenCalled();
    mount();
    fireEvent.click(screen.getByTestId("academy-core-bay-leaguecraft"));
    expect(track).toHaveBeenCalledWith("leaguecraft_cta_clicked", { cta: "academy_core_bay" });
  });
});

describe("focus states", () => {
  it("keyboard focus engages the matching Core state and the readout; blur returns to idle", () => {
    vi.useFakeTimers();
    try {
      mount();
      const stage = screen.getByTestId("academy-core-stage");
      expect(stage).toHaveAttribute("data-focus", "idle");
      expect(screen.getByTestId("academy-core-readout")).toHaveTextContent("Pick a room");

      const link = screen.getByTestId("academy-core-bay-combat-lab");
      act(() => { link.focus(); });
      expect(stage).toHaveAttribute("data-focus", "combat-lab");
      expect(link).toHaveAttribute("data-active", "true");
      expect(screen.getByTestId("academy-core-readout")).toHaveTextContent(HUB_GUIDE_MODES["combat-lab"].description);
      expect(screen.getByTestId("academy-core-mogzy")).toHaveAttribute("data-pose", "raisingHand");

      act(() => { link.blur(); });
      // The release is graced, like the guide's hover clear.
      expect(stage).toHaveAttribute("data-focus", "combat-lab");
      act(() => { vi.advanceTimersByTime(200); });
      expect(stage).toHaveAttribute("data-focus", "idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a touch press engages the state immediately (no hover required)", () => {
    mount();
    const link = screen.getByTestId("academy-core-bay-archives");
    fireEvent.pointerDown(link, { pointerType: "touch" });
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "archives");
  });

  it("the instrument reflects the focused room", () => {
    mount();
    const svg = screen.getByRole("img", { name: "The Academy Core instrument" });
    expect(svg).toHaveAttribute("data-focus", "idle");
    act(() => { screen.getByTestId("academy-core-bay-pro-play").focus(); });
    expect(svg).toHaveAttribute("data-focus", "pro-play");
    expect(svg.querySelector(".acore-readout-value")?.textContent).toContain("OBSERVE");
  });
});

describe("the Patch Report book and the second screen", () => {
  it("mounts the existing mobile book variant below the rooms in the stacked composition", () => {
    mount();
    // jsdom answers false to every media query → stacked composition.
    const book = screen.getByTestId("academy-core-book-mobile");
    expect(within(book).getByTestId("academy-broadcast-surface-mobile")).toBeInTheDocument();
    expect(screen.queryByTestId("academy-broadcast-surface")).not.toBeInTheDocument();
    const rooms = screen.getByRole("navigation", { name: "Academy rooms" });
    expect(rooms.compareDocumentPosition(book) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("mounts the real desktop book with its radio dock beside the Core in the full composition", () => {
    matchMediaMatches.current = (q) => q.includes("min-width: 1024px");
    mount();
    const book = screen.getByTestId("academy-core-book");
    expect(within(book).getByTestId("academy-broadcast-surface")).toBeInTheDocument();
    expect(within(book).getByTestId("academy-radio-dock")).toBeInTheDocument();
    expect(screen.queryByTestId("academy-broadcast-surface-mobile")).not.toBeInTheDocument();
    // and the rooms are mounted on the instrument, not as rows
    expect(screen.getByTestId("academy-core-bay-leaguecraft").className).toContain("acore-bay-link-mounted");
  });

  it("shows the live Patch Brief in the book and carries its icons into the Archives projection", async () => {
    feed.current = {
      status: "ready",
      index: 0,
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
    expect(svg.querySelector(".acore-strata-label")?.textContent).toBe("PATCH 26.20");
  });

  it("keeps Academy Commons and the Hall reachable", () => {
    mount();
    expect(screen.getByTestId("academy-core-commons-link")).toHaveAttribute("href", "/lol#academy-commons");
    fireEvent.click(screen.getByTestId("academy-core-hall-link"));
    expect(screen.getByTestId("probe")).toHaveTextContent("hall|/lol||");
  });
});
