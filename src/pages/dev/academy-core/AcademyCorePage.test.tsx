/**
 * Academy Core V1 — navigation contracts, rendered.
 *
 * The page is mounted in a MemoryRouter beside probe routes for every
 * destination, so each assertion is about where a REAL click lands (and with
 * what router state), not about an href string.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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

const fetchPatchReports = vi.fn();
vi.mock("@/lib/patch-reports/api", () => ({
  fetchPatchReports: () => fetchPatchReports(),
}));

const sfxPlay = vi.fn();
vi.mock("@/lib/audio/useSfx", () => ({
  useSfx: () => ({ play: sfxPlay, stop: vi.fn(), preload: vi.fn() }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));

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
  fetchPatchReports.mockReset();
  fetchPatchReports.mockResolvedValue({ patches: [] });
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
      expect(screen.getByTestId("academy-core-readout")).toHaveTextContent("STANDBY");

      const link = screen.getByTestId("academy-core-bay-combat-lab");
      act(() => { link.focus(); });
      expect(stage).toHaveAttribute("data-focus", "combat-lab");
      expect(link).toHaveAttribute("data-active", "true");
      expect(screen.getByTestId("academy-core-readout")).toHaveTextContent("BAY 02 · MEASURE");

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

describe("broadcast gateway and the second screen", () => {
  it("links Patch Reports generically until the list has loaded", () => {
    mount();
    const link = screen.getByTestId("academy-core-patch-link");
    expect(link).toHaveAttribute("href", "/lol/patch-reports");
    expect(link).toHaveTextContent("Patch Reports");
  });

  it("names the latest real patch once the shared list query resolves", async () => {
    fetchPatchReports.mockResolvedValue({
      patches: [{ patch_version: "25.19", change_count: 41, card_count: 17, section_titles: [], built_at: "", source_url: "", cards_by_type: {}, cards_by_status: {} }],
    });
    mount();
    expect(await screen.findByText("Patch 25.19 brief")).toBeInTheDocument();
    expect(screen.getByTestId("academy-core-patch-link")).toHaveAttribute("href", "/lol/patch-reports?patch=25.19");
    expect(screen.getByText("41 changes · 17 cards")).toBeInTheDocument();
  });

  it("keeps Academy Commons and the Hall reachable", () => {
    mount();
    expect(screen.getByTestId("academy-core-commons-link")).toHaveAttribute("href", "/lol#academy-commons");
    fireEvent.click(screen.getByTestId("academy-core-hall-link"));
    expect(screen.getByTestId("probe")).toHaveTextContent("hall|/lol||");
  });
});
