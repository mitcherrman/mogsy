/**
 * Academy Core V3.5 — the Living Hextech Orrery, the `/lol` home, rendered.
 *
 * Two families of assertion. (1) The V3 navigation contracts survive the new
 * presentation: where a REAL click lands, with what timing, and that the
 * crystal cycles without navigating. (2) The brief's structural promises:
 * no chassis / cradles / bench, four independent floating books, an engine
 * that actually moves them over time, a floating Patch Report, a phone
 * composition that does not orbit, and reduced motion that does not loop.
 *
 * jsdom has no layout, so POSITIONS are asserted from the transforms the
 * engine writes (they are the single source of truth for the books' place);
 * the real-browser measurements live in e2e/academy-core-v35.spec.ts.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import path from "node:path";

import { hasDailyStartIntent } from "@/lib/daily-challenge/run/entry";
import { UNKNOWN_DAILY_STATUS, type DailyStatusView } from "@/lib/daily-challenge/status";
import { INITIAL_BROADCAST_FEED, type BroadcastFeed } from "@/components/lol/broadcast/broadcast-content";

const track = vi.fn();
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, track: (...args: unknown[]) => track(...args), useSurfaceEvent: (name: string) => { track("surface", name); } };
});
const playSfx = vi.fn();
vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: playSfx }) }));
vi.mock("@/lib/funnel-analytics", () => ({
  trackFunnelEvent: (name: string, payload?: Record<string, unknown>) => track(name, payload),
}));

const dailyStatus: { current: DailyStatusView } = { current: UNKNOWN_DAILY_STATUS };
const auth: { user: { id: string } | null } = { user: { id: "test-user" } };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock("@/lib/daily-challenge/useDailyChallengeStatus", () => ({
  useDailyChallengeStatus: () => dailyStatus.current,
}));

const feed: { current: BroadcastFeed } = { current: INITIAL_BROADCAST_FEED };
vi.mock("@/components/lol/broadcast/usePatchBriefFeed", () => ({ usePatchBriefFeed: () => feed.current }));

const MANIFEST = { champions: Object.fromEntries(["Ryze", "Ahri", "Akali", "Viktor",
  // the Pro Play crystal's 5 v 5 lineup (orrery-projections-data.ts)
  "Gnar", "Lee Sin", "Azir", "Jinx", "Thresh", "K'Sante", "Vi", "Orianna", "Kai'Sa", "Nautilus",
  // the Leaguecraft crystal's mystery champion
  "Lux"].map((n) => [n, {
  icon: `assets/champions/${n}/icon.png`, splash: `assets/champions/${n}/splash/0_default.jpg`, loading: "", cutout: "",
}])) };
// RC2: undefined = still loading, null = the manifest failed
const assets: { current: unknown } = { current: MANIFEST };
vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return { ...actual, useChampionAssets: () => ({ data: assets.current }) };
});

const warm = vi.fn(() => Promise.resolve({ leaguecraft: null, "pro-play": null, "combat-lab": null, archives: null }));
// The first-screen art's real settle (ACADEMY STARTUP S3): resolved unless a test holds it.
const settledGate = vi.hoisted(() => ({ promise: Promise.resolve() as Promise<void> }));
vi.mock("@/pages/academy-core/academy-core-warm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pages/academy-core/academy-core-warm")>()),
  warmAcademyCore: () => warm(),
  academyCoreSettled: () => settledGate.promise,
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
// ACADEMY STARTUP RC1: which images the page asks for, and how urgently (jsdom never loads them).
const prepared = vi.hoisted(() => ({ calls: [] as Array<{ url: string; priority?: string }> }));
vi.mock("@/lib/ranked-core/media/prepareImage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ranked-core/media/prepareImage")>()),
  prepareImage: (url: string, opts: { priority?: string } = {}) => {
    prepared.calls.push({ url, priority: opts.priority });
    return Promise.resolve("ok");
  },
}));
const reduced = { current: false };
vi.mock("@/hooks/useReducedMotionPreference", () => ({
  useReducedMotionPreference: () => reduced.current,
  readReducedMotionPreference: () => reduced.current,
}));

const matchMediaMatches: { current: (q: string) => boolean } = { current: () => false };

import AcademyCorePage from "./AcademyCorePage";
import { BOOK_ACTIVATION_MS, CORE_DESTINATIONS } from "@/pages/academy-core/academy-core-destinations";
import { FLOW_FRAMES } from "@/lib/academy-startup/readiness";
import {
  DIRECT_CAP_AFTER_MOUNT_MS, ENTRANCE_CAP_MS, __resetAcademyStartupForTests, getAcademyStartup, holdAcademyVeil,
} from "@/lib/academy-startup/veil-store";

function Probe({ name }: { name: string }) {
  const location = useLocation();
  return (
    <div data-testid="probe">
      {name}|{location.pathname}|{location.search}|{hasDailyStartIntent(location.state) ? "daily-intent" : "no-intent"}
    </div>
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
          <Route path="/combat-lab" element={<Probe name="combat" />} />
          <Route path="/lol/docs" element={<Probe name="docs" />} />
          <Route path="/lol/pro-play" element={<Probe name="pro-play" />} />
          <Route path="/lol/hall" element={<Probe name="hall" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const slot = (id: string) => screen.getByTestId(`academy-core-slot-${id}`);
const book = (id: string) => within(slot(id)).getByRole("link");
const bookBox = (id: string) => document.querySelector<HTMLElement>(`.o35-book[data-bay="${id}"]`)!;
const IDS = ["leaguecraft", "pro-play", "combat-lab", "archives"] as const;

/** x,y (px) the engine wrote for a book. */
function translateOf(id: string): [number, number] {
  const m = /translate3d\(([-\d.]+)px,([-\d.]+)px/.exec(bookBox(id).style.transform);
  if (!m) throw new Error(`no transform on ${id}: "${bookBox(id).style.transform}"`);
  return [Number(m[1]), Number(m[2])];
}

function setLayout(full: boolean) {
  matchMediaMatches.current = (q) => (full && q.includes("min-width: 1024px")) || (q.includes("hover: hover") && q.includes("pointer: fine"));
}

beforeEach(() => {
  track.mockReset();
  playSfx.mockReset();
  sfxPlay.mockReset();
  prefetchRoute.mockReset();
  warm.mockClear();
  settledGate.promise = Promise.resolve();
  prepared.calls = [];
  assets.current = MANIFEST;
  feed.current = INITIAL_BROADCAST_FEED;
  reduced.current = false;
  auth.user = { id: "test-user" };
  dailyStatus.current = UNKNOWN_DAILY_STATUS;
  setLayout(true);
  window.matchMedia = ((query: string) => ({
    matches: matchMediaMatches.current(query), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  sessionStorage.clear();
  // jsdom has no PointerEvent: give React's pointer events their pointerType
  class PE extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) { super(type, init); this.pointerType = init.pointerType ?? "mouse"; }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PE;
});
afterEach(() => { vi.useRealTimers(); });

describe("structure: an open space, not a chassis", () => {
  it("renders four independent floating books and none of the V3 machinery", () => {
    const { container } = mount();
    expect(screen.getByTestId("academy-core-v35")).toHaveAttribute("data-layout", "full");
    for (const d of CORE_DESTINATIONS) {
      expect(book(d.id)).toHaveAttribute("href", d.to);
      expect(book(d.id)).toHaveAccessibleName(d.title);
    }
    expect(container.querySelectorAll(".o35-book")).toHaveLength(4);
    // the V3 chassis, cradles, clips, locking arms, bench and room are gone
    for (const sel of [".acore-chassis", ".acore-cradle", ".acore-cradle-clip", ".acore-arm", ".acore-room", ".acore-room-bench",
      ".acore-books-mounted", ".acore-island", ".acore-stagewrap"]) {
      expect(container.querySelector(sel), sel).toBeNull();
    }
    // The compact instrument still emits four fixed-angle channel stubs; the
    // V3.5 sheet must retire them (and the bezel cursor) so no arm is ever drawn.
    const css = readFileSync(path.resolve(__dirname, "orrery/academy-core-v35.css"), "utf8");
    expect(css).toMatch(/\.o35-root \.acore-cursor,\s*\.o35-root \.acore-compact-band\s*\{\s*display:\s*none;?\s*\}/);
  });

  it("keeps the Core's crystal, all four projections and the real Patch Report book", () => {
    const { container } = mount();
    expect(container.querySelector(".acore-crystal")).not.toBeNull();
    for (const cls of ["idle", "leaguecraft", "combat", "archives", "pro-play"]) {
      expect(container.querySelector(`.acore-mode-${cls}`), cls).not.toBeNull();
    }
    // the Core is layered: rings, comets, gyroscope, needle, halo
    for (const sel of [".o35-ring-scale", ".o35-ring-rune", ".o35-comet", ".o35-gyro-ring", ".o35-needle", ".o35-core-halo"]) {
      expect(container.querySelector(sel), sel).not.toBeNull();
    }
    const patch = screen.getByTestId("academy-core-book");
    expect(patch).toHaveClass("o35-patch");
    expect(within(patch).getByTestId("academy-broadcast-centerpiece")).toBeInTheDocument();
    expect(within(patch).getByTestId("academy-radio-dock")).toBeInTheDocument();
    // the Patch Report floats: halo, cast shadow and levitation wrapper
    expect(patch.querySelector(".o35-patch-float")).not.toBeNull();
    expect(patch.querySelector(".o35-patch-halo")).not.toBeNull();
    expect(patch.querySelector(".o35-patch-shadow")).not.toBeNull();
  });

  it("is the indexed home: the V3 home's SEO block, and it emits the funnel's hub_entered", () => {
    mount();
    expect(document.title).toBe("Mogzy LoL Quiz | League of Legends Trivia and Training");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "").not.toMatch(/noindex/);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toMatch(/\/lol$/);
    expect(track.mock.calls.filter((c) => c[0] === "surface" && c[1] === "hub_entered")).toHaveLength(1);
  });

  it("names the Academy and labels the shortcuts for what they do", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Mogzy Academy" })).toBeInTheDocument();
    expect(screen.getByTestId("academy-core-daily")).toHaveAccessibleName("Play Daily Challenge");
    expect(screen.getByTestId("academy-core-ranked")).toHaveTextContent(/opens mode selection/i);
  });
});

describe("motion: the engine really moves the books", () => {
  it("places every book at mount, then changes every book's position, size and stacking as time passes", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    mount();
    const read = () => IDS.map((id) => ({ id, xy: translateOf(id), z: Number(bookBox(id).style.zIndex) }));
    const first = read();
    expect(first.every((b) => Number.isFinite(b.xy[0]) && Number.isFinite(b.xy[1]))).toBe(true);
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
    act(() => { vi.advanceTimersByTime(4000); });
    const later = read();
    for (let i = 0; i < 4; i++) {
      const dx = later[i].xy[0] - first[i].xy[0];
      const dy = later[i].xy[1] - first[i].xy[1];
      expect(Math.hypot(dx, dy), `${first[i].id} moved`).toBeGreaterThan(5);
    }
    act(() => { vi.advanceTimersByTime(20000); });
    const much = read();
    // over 24 s the set of stacking orders must have changed for at least one book (depth changes)
    expect(much.map((b) => b.z)).not.toEqual(first.map((b) => b.z));
    expect(much.some((b, i) => Math.abs(b.xy[0] - first[i].xy[0]) > 100)).toBe(true);
  });

  it("the orbit slows while a book is hovered and resumes when the pointer leaves", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    mount();
    const travel = (ms: number) => {
      const a = translateOf("pro-play");
      act(() => { vi.advanceTimersByTime(ms); });
      const b = translateOf("pro-play");
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    };
    const free = travel(2000);
    fireEvent.pointerEnter(slot("leaguecraft"), { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(2500); }); // let the orbit ease down
    const held = travel(2000);
    expect(held).toBeLessThan(free * 0.2);
    fireEvent.pointerLeave(slot("leaguecraft"));
    act(() => { vi.advanceTimersByTime(2500); });
    const resumed = travel(2000);
    expect(resumed).toBeGreaterThan(held * 3);
  });

  it("emphasises the pointer's book in place, takes it to the top of the stack, and dims the others", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    mount();
    fireEvent.pointerEnter(slot("combat-lab"), { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(600); });
    expect(slot("combat-lab")).toHaveAttribute("data-active", "true");
    expect(Number(bookBox("combat-lab").style.zIndex)).toBeGreaterThanOrEqual(60);
    for (const id of ["leaguecraft", "pro-play", "archives"]) {
      expect(slot(id)).toHaveAttribute("data-support", "true");
      expect(slot(id)).toHaveAttribute("data-active", "false");
    }
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "combat-lab");
    // the V3 projection and Mogzy follow the focus, exactly as in V3
    expect(screen.getByTestId("academy-core-mogzy")).toHaveAttribute("data-pose", "raisingHand");
    expect(document.querySelector(".o35-tether[data-bay='combat-lab']")).toHaveAttribute("data-on", "true");
    fireEvent.pointerLeave(slot("combat-lab"));
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "idle");
  });

  it("writes live tether paths for all four books and rotates the bearing needle toward the focused book", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    mount();
    const d0 = IDS.map((id) => document.querySelector(`.o35-tether[data-bay='${id}']`)!.getAttribute("d"));
    expect(d0.every((d) => /^M[\d.-]+ [\d.-]+ Q/.test(d ?? ""))).toBe(true);
    act(() => { vi.advanceTimersByTime(3000); });
    const d1 = IDS.map((id) => document.querySelector(`.o35-tether[data-bay='${id}']`)!.getAttribute("d"));
    expect(d1).not.toEqual(d0);
    const needle = document.querySelector<HTMLElement>(".o35-needle")!;
    fireEvent.pointerEnter(slot("archives"), { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(1500); });
    const a1 = needle.style.transform;
    fireEvent.pointerLeave(slot("archives"));
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.pointerEnter(slot("pro-play"), { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(needle.style.transform).not.toBe(a1);
  });
});

describe("keyboard focus brings a book toward the viewer", () => {
  it("a focus-visible book takes the front position beside the crystal and the others settle", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    mount();
    const before = translateOf("pro-play");
    // jsdom's :focus-visible: stub matches() for the keyboard case
    const link = book("pro-play");
    const orig = link.matches.bind(link);
    vi.spyOn(link, "matches").mockImplementation((s: string) => (s === ":focus-visible" ? true : orig(s)));
    act(() => { link.focus(); });
    act(() => { vi.advanceTimersByTime(2500); });
    expect(slot("pro-play")).toHaveAttribute("data-active", "true");
    const after = translateOf("pro-play");
    // jsdom has no layout (scale clamps to 0.2), so this is a fifth of the stage-unit travel
    expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeGreaterThan(8);
    expect(Number(bookBox("pro-play").style.zIndex)).toBeGreaterThanOrEqual(60);
  });
});

describe("navigation contracts (carried over from V3)", () => {
  it("a plain click activates for 240 ms and then navigates, once", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    mount();
    fireEvent.click(book("combat-lab"));
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "combat-lab");
    expect(slot("combat-lab")).toHaveAttribute("data-activating", "true");
    expect(screen.queryByTestId("probe")).toBeNull();
    fireEvent.click(book("combat-lab")); // a second press changes nothing
    act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS - 5); });
    expect(screen.queryByTestId("probe")).toBeNull();
    act(() => { vi.advanceTimersByTime(10); });
    expect(screen.getByTestId("probe")).toHaveTextContent("combat|/combat-lab");
    expect(playSfx).toHaveBeenCalledWith("bookRuffle");
  });

  it("modified clicks are left to the browser, untouched", () => {
    mount();
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const notPrevented = fireEvent.click(book("archives"), init);
      expect(notPrevented, JSON.stringify(init)).toBe(true);
    }
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-activating", "");
  });

  it("reduced motion navigates at once, with no activation, and runs no animation loop", () => {
    reduced.current = true;
    const raf = vi.spyOn(window, "requestAnimationFrame");
    mount();
    expect(screen.getByTestId("academy-core-v35")).toHaveAttribute("data-reduced", "true");
    // books are still placed (a deliberate static composition) ...
    for (const id of IDS) expect(translateOf(id).every(Number.isFinite)).toBe(true);
    // ... and the engine never schedules a frame
    expect(raf).not.toHaveBeenCalled();
    fireEvent.click(book("pro-play"));
    expect(screen.getByTestId("probe")).toHaveTextContent("pro-play|/lol/pro-play");
    raf.mockRestore();
  });

  it("reduced motion applies focus at once (no easing) and does not move books under the pointer", () => {
    reduced.current = true;
    mount();
    const before = IDS.map(translateOf);
    fireEvent.pointerEnter(slot("leaguecraft"), { pointerType: "mouse" });
    expect(slot("leaguecraft")).toHaveAttribute("data-active", "true");
    const after = IDS.map(translateOf);
    expect(after).toEqual(before);
  });

  it("the crystal cycles the four previews and back to none, never navigating", () => {
    mount();
    const stage = screen.getByTestId("academy-core-stage");
    const crystal = screen.getByTestId("academy-core-crystal");
    expect(stage).toHaveAttribute("data-focus", "idle");
    for (const id of ["leaguecraft", "pro-play", "combat-lab", "archives", "idle"]) {
      fireEvent.click(crystal);
      expect(stage).toHaveAttribute("data-focus", id);
      expect(screen.queryByTestId("probe")).toBeNull();
    }
    expect(screen.getByTestId("academy-core-preview")).toHaveTextContent("No room previewed");
  });

  it("Daily and Ranked are immediate links with the V3 router state", () => {
    mount();
    fireEvent.click(screen.getByTestId("academy-core-daily"));
    expect(screen.getByTestId("probe")).toHaveTextContent("daily|/quiz/daily-challenge||daily-intent");
  });

  it("pressing Daily records which Home Hub control opened it, and nothing about a run", () => {
    mount();
    track.mockClear();
    fireEvent.click(screen.getByTestId("academy-core-daily"));
    expect(track).toHaveBeenCalledWith("daily_challenge_entry_clicked", {
      metadata: { entry_surface: "home_hub", control: "academy_core_daily_button" },
    });
  });

  it("Ranked opens mode selection", () => {
    mount();
    fireEvent.click(screen.getByTestId("academy-core-ranked"));
    expect(screen.getByTestId("probe")).toHaveTextContent("quiz|/quiz|?play=1");
  });

  it("only an authenticated visitor triggers the Daily read, and resume wording follows the status", () => {
    dailyStatus.current = { ...UNKNOWN_DAILY_STATUS, known: true, resumable: true, completed: false } as DailyStatusView;
    mount();
    expect(screen.getByTestId("academy-core-daily")).toHaveAccessibleName("Resume Daily Challenge");
  });
});

describe("phones: a composed floating arrangement, not a carousel", () => {
  it("does not orbit: one placement, no animation loop, tiers of books around the Core, floating Patch Report below", () => {
    setLayout(false);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { container } = mount();
    expect(screen.getByTestId("academy-core-v35")).toHaveAttribute("data-layout", "stacked");
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-mode", "composed");
    expect(raf).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".o35-orbit-path")).toHaveLength(0);
    const ys = IDS.map((id) => translateOf(id)[1]);
    // upper pair above lower pair, and each pair staggered
    expect(Math.max(ys[0], ys[1])).toBeLessThan(Math.min(ys[2], ys[3]));
    expect(ys[0]).not.toBe(ys[1]);
    expect(screen.queryByTestId("academy-core-book")).toBeNull();
    const mobilePatch = screen.getByTestId("academy-core-book-mobile");
    expect(mobilePatch.querySelector(".o35-patch-float")).not.toBeNull();
    // transforms are stable: nothing moves between two reads
    const again = IDS.map((id) => translateOf(id)[1]);
    expect(again).toEqual(ys);
    raf.mockRestore();
  });

  it("tapping a book still activates then navigates; focus is the pinned crystal / tap, not a hover", () => {
    setLayout(false);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    mount();
    // a touch pointerenter must not engage (V3 contract)
    fireEvent.pointerEnter(slot("leaguecraft"), { pointerType: "touch" });
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "idle");
    fireEvent.click(book("leaguecraft"));
    act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS + 10); });
    expect(screen.getByTestId("probe")).toHaveTextContent("quiz|/quiz");
  });
});

describe("hygiene", () => {
  it("prefetches a destination on intent and warms the Core's own art once", () => {
    mount();
    fireEvent.pointerEnter(slot("archives"), { pointerType: "mouse" });
    expect(prefetchRoute).toHaveBeenCalledWith("/lol/docs");
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it("forwards the legacy #academy-commons deep link to the Hall", () => {
    mount("/lol#academy-commons");
    expect(screen.getByTestId("probe")).toHaveTextContent("hall|/lol/hall");
  });
});

describe("phase 2: drag the orbit", () => {
  const fake = () => vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
  const stage = () => screen.getByTestId("academy-core-stage");
  const xs = () => IDS.map((id) => translateOf(id)[0]);

  it("dragging empty space moves the books with the pointer, a fling coasts, and the books settle symmetric", () => {
    fake();
    mount();
    act(() => { vi.advanceTimersByTime(500); });
    const before = xs();
    fireEvent.pointerDown(stage(), { pointerId: 1, clientX: 400, clientY: 600, button: 0, pointerType: "mouse" });
    expect(stage()).toHaveAttribute("data-dragging", "true");
    for (let i = 1; i <= 8; i++) fireEvent.pointerMove(stage(), { pointerId: 1, clientX: 400 + i * 40, clientY: 600, pointerType: "mouse" });
    expect(xs()).not.toEqual(before);
    const during = xs();
    fireEvent.pointerUp(stage(), { pointerId: 1, pointerType: "mouse" });
    expect(stage()).not.toHaveAttribute("data-dragging");
    act(() => { vi.advanceTimersByTime(300); });
    expect(xs()).not.toEqual(during); // momentum carries on after release
    // coast, then settle: advance until the books stop (the snap), within 8 s
    let prev = xs();
    let stopped = false;
    for (let i = 0; i < 80 && !stopped; i++) {
      act(() => { vi.advanceTimersByTime(100); });
      const now = xs();
      stopped = now.every((x, j) => Math.abs(x - prev[j]) < 0.05);
      prev = now;
    }
    expect(stopped, "the books come to rest on a composition").toBe(true);
    // and they hold there for a moment (the dwell) before the slow orbit resumes
    act(() => { vi.advanceTimersByTime(600); });
    expect(xs().every((x, i) => Math.abs(x - prev[i]) < 0.5)).toBe(true);
  });

  it("never starts from a book, a link or the crystal, so every click contract is untouched", () => {
    fake();
    mount();
    for (const el of [book("combat-lab"), screen.getByTestId("academy-core-crystal")]) {
      fireEvent.pointerDown(el, { pointerId: 2, clientX: 500, clientY: 400, button: 0, pointerType: "mouse" });
      expect(stage()).not.toHaveAttribute("data-dragging");
    }
    fireEvent.click(book("combat-lab"));
    act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS + 10); });
    expect(screen.getByTestId("probe")).toHaveTextContent("combat|/combat-lab");
  });

  it("is off under reduced motion and in the phone composition", () => {
    reduced.current = true;
    const { unmount } = mount();
    fireEvent.pointerDown(stage(), { pointerId: 3, clientX: 400, clientY: 600, button: 0, pointerType: "mouse" });
    expect(stage()).not.toHaveAttribute("data-dragging");
    unmount();
    reduced.current = false;
    setLayout(false);
    mount();
    fireEvent.pointerDown(stage(), { pointerId: 4, clientX: 200, clientY: 300, button: 0, pointerType: "touch" });
    expect(stage()).not.toHaveAttribute("data-dragging");
  });

  it("ignores secondary mouse buttons", () => {
    mount();
    fireEvent.pointerDown(stage(), { pointerId: 5, clientX: 400, clientY: 600, button: 2, pointerType: "mouse" });
    expect(stage()).not.toHaveAttribute("data-dragging");
  });
});

describe("phase 2: arrow keys, quality tiers", () => {
  it("arrow keys step focus through the books and wrap; other keys and other controls are untouched", () => {
    mount();
    const links = IDS.map((id) => book(id));
    act(() => { links[0].focus(); });
    fireEvent.keyDown(links[0], { key: "ArrowRight" });
    expect(links[1]).toHaveFocus();
    fireEvent.keyDown(links[1], { key: "ArrowLeft" });
    expect(links[0]).toHaveFocus();
    fireEvent.keyDown(links[0], { key: "ArrowLeft" });
    expect(links[3]).toHaveFocus();
    const notPrevented = fireEvent.keyDown(links[3], { key: "Enter" });
    expect(notPrevented).toBe(true);
    const prevented = fireEvent.keyDown(links[3], { key: "ArrowRight", ctrlKey: true });
    expect(prevented).toBe(true); // modified arrows are left alone
  });

  it("defaults to the full scene; ?quality=lite selects the lite tier; a forced tier is honoured", () => {
    const a = mount();
    expect(screen.getByTestId("academy-core-v35")).toHaveAttribute("data-quality", "full");
    a.unmount();
    window.history.pushState({}, "", "/?quality=lite");
    mount();
    expect(screen.getByTestId("academy-core-v35")).toHaveAttribute("data-quality", "lite");
    window.history.pushState({}, "", "/");
  });

  it("the lite tier keeps the orbit, the books and the Core's dial", () => {
    window.history.pushState({}, "", "/?quality=lite");
    const { container } = mount();
    expect(container.querySelectorAll(".o35-book")).toHaveLength(4);
    expect(container.querySelector(".acore-crystal")).not.toBeNull();
    for (const id of IDS) expect(book(id)).toHaveAttribute("href");
    window.history.pushState({}, "", "/");
  });

  it("focus moving from one book to another leaves only the new book focused (no stale emphasis)", () => {
    mount();
    const keyboard = (el: HTMLElement) => {
      const orig = el.matches.bind(el);
      vi.spyOn(el, "matches").mockImplementation((q: string) => (q === ":focus-visible" ? true : orig(q)));
    };
    const [a, b] = [book("leaguecraft"), book("pro-play")];
    keyboard(a);
    keyboard(b);
    // a hover first (the pointer channel), then keyboard focus A, then B
    fireEvent.pointerEnter(slot("leaguecraft"), { pointerType: "mouse" });
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "leaguecraft");
    act(() => { a.focus(); });
    act(() => { b.focus(); });
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "pro-play");
    expect(slot("leaguecraft")).toHaveAttribute("data-active", "false");
    expect(slot("pro-play")).toHaveAttribute("data-active", "true");
  });

  it("the focused book opens a crack: its page light is lit and its levitation wrapper is marked active", () => {
    mount();
    fireEvent.pointerEnter(slot("archives"), { pointerType: "mouse" });
    const lev = bookBox("archives").querySelector(".o35-lev")!;
    expect(lev).toHaveAttribute("data-active", "true");
    expect(lev.querySelector(".o35-pagelight")).not.toBeNull();
  });
});

describe("the arrow selector", () => {
  const fake = () => vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
  const stage = () => screen.getByTestId("academy-core-stage");
  const right = () => screen.getByTestId("academy-core-arrow-right");
  const left = () => screen.getByTestId("academy-core-arrow-left");
  const xy = () => IDS.map((id) => translateOf(id));

  it("is exactly two arrow buttons with accessible names and no visible text", () => {
    mount();
    const sel = screen.getByTestId("academy-core-selector");
    const buttons = within(sel).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(sel.children).toHaveLength(2);
    expect(sel.textContent?.trim()).toBe("");
    expect(right()).toHaveAccessibleName("Next book");
    expect(left()).toHaveAccessibleName("Previous book");
    for (const b of buttons) expect(b).toHaveAttribute("type", "button");
  });

  it("a press turns the whole orbit, previews the chosen book everywhere, holds it, and never navigates", () => {
    fake();
    mount();
    act(() => { vi.advanceTimersByTime(200); });
    const before = xy();
    fireEvent.click(right());
    expect(stage()).toHaveAttribute("data-focus", "leaguecraft"); // crystal, Mogzy, tether follow at once
    expect(screen.getByTestId("academy-core-mogzy")).toHaveAttribute("data-pose", "holdingBook");
    act(() => { vi.advanceTimersByTime(400); });
    const mid = xy();
    for (let i = 0; i < 4; i++) expect(mid[i], `${IDS[i]} moved with the orbit`).not.toEqual(before[i]);
    act(() => { vi.advanceTimersByTime(2000); });
    const held = xy();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(xy()).toEqual(held); // held at the front: no drift
    expect(Number(bookBox("leaguecraft").style.zIndex)).toBeGreaterThanOrEqual(60);
    expect(document.querySelector(".o35-tether[data-bay='leaguecraft']")).toHaveAttribute("data-on", "true");
    expect(screen.queryByTestId("probe")).toBeNull();
    expect(screen.getByTestId("academy-core-preview")).toHaveTextContent("Previewing Leaguecraft");
  });

  it("each press advances exactly one book; rapid presses all count; left reverses; it wraps", () => {
    fake();
    mount();
    fireEvent.click(right());
    fireEvent.click(right());
    fireEvent.click(right());
    expect(stage()).toHaveAttribute("data-focus", "combat-lab");
    act(() => { vi.advanceTimersByTime(3000); });
    fireEvent.click(right());
    fireEvent.click(right());
    expect(stage()).toHaveAttribute("data-focus", "leaguecraft"); // pro-play, then round to leaguecraft
    fireEvent.click(left());
    expect(stage()).toHaveAttribute("data-focus", "pro-play");
  });

  it("the selected book is one click from its room (the 240 ms activation, as ever)", () => {
    fake();
    mount();
    fireEvent.click(right());
    act(() => { vi.advanceTimersByTime(2500); });
    fireEvent.click(book("leaguecraft"));
    act(() => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS + 10); });
    expect(screen.getByTestId("probe")).toHaveTextContent("quiz|/quiz");
  });

  it("the crystal keeps its own cycle: it continues from the selected book and lets the orbit go", () => {
    fake();
    mount();
    fireEvent.click(right()); // leaguecraft
    act(() => { vi.advanceTimersByTime(2500); });
    const held = xy();
    fireEvent.click(screen.getByTestId("academy-core-crystal"));
    expect(stage()).toHaveAttribute("data-focus", "pro-play"); // the crystal's next after leaguecraft
    act(() => { vi.advanceTimersByTime(3000); });
    expect(xy()).not.toEqual(held); // the hold is released (pro-play comes beside the lens; the orbit drifts)
    expect(screen.queryByTestId("probe")).toBeNull();
  });

  it("a press on open space releases the selection (the orbit resumes)", () => {
    fake();
    mount();
    fireEvent.click(right());
    act(() => { vi.advanceTimersByTime(2500); });
    fireEvent.pointerDown(stage(), { pointerId: 9, clientX: 400, clientY: 600, button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(stage(), { pointerId: 9, pointerType: "mouse" });
    expect(stage()).toHaveAttribute("data-focus", "idle");
    const a = xy();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(xy()).not.toEqual(a);
  });

  it("hover and keyboard focus layer on top of the selection and give it back", () => {
    fake();
    mount();
    fireEvent.click(right()); // leaguecraft
    act(() => { vi.advanceTimersByTime(2500); });
    fireEvent.pointerEnter(slot("archives"), { pointerType: "mouse" });
    expect(stage()).toHaveAttribute("data-focus", "archives");
    expect(slot("leaguecraft")).toHaveAttribute("data-active", "false"); // one emphasised book at a time
    fireEvent.pointerLeave(slot("archives"));
    act(() => { vi.advanceTimersByTime(300); });
    expect(stage()).toHaveAttribute("data-focus", "leaguecraft");
    expect(slot("leaguecraft")).toHaveAttribute("data-active", "true");
  });

  it("reduced motion: the selection is placed at once, with no animation loop", () => {
    reduced.current = true;
    const raf = vi.spyOn(window, "requestAnimationFrame");
    mount();
    const before = xy();
    fireEvent.click(right());
    expect(xy()).not.toEqual(before);
    expect(stage()).toHaveAttribute("data-focus", "leaguecraft");
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });

  it("phones: no orbit; the arrows step the preview round the composed ring (right = clockwise)", () => {
    setLayout(false);
    fake();
    mount();
    const before = xy();
    const seq: string[] = [];
    for (let k = 0; k < 5; k++) { fireEvent.click(right()); seq.push(stage().getAttribute("data-focus")!); }
    expect(seq).toEqual(["leaguecraft", "pro-play", "archives", "combat-lab", "leaguecraft"]);
    fireEvent.click(left());
    expect(stage()).toHaveAttribute("data-focus", "combat-lab");
    // the books stay where they are (only the chosen one is lit, a little larger) ...
    const after = xy();
    for (let i = 0; i < 4; i++) expect(Math.hypot(after[i][0] - before[i][0], after[i][1] - before[i][1])).toBeLessThan(15);
    // ... and nothing orbits afterwards
    act(() => { vi.advanceTimersByTime(3000); });
    expect(xy()).toEqual(after);
  });
});

describe("the redesigned crystal projections, in the page", () => {
  it("Leaguecraft shows the five role icons around Lux behind the six-shutter iris; Pro Play shows the 5 v 5 lineup around the Rift", async () => {
    const { container } = mount();
    await act(async () => { await Promise.resolve(); }); // the (mocked) warm resolves -> the art is due
    // the projections' icons follow at idle once the first screen has settled (ACADEMY STARTUP S3)
    await waitFor(() => expect(container.querySelector("[data-testid='academy-core-v35-lux-portrait']")).not.toBeNull());
    const lc = container.querySelector(".acore-mode-leaguecraft")!;
    expect(lc).toHaveAttribute("data-projection", "override");
    expect(lc.querySelector("[data-testid='academy-core-v35-lux-portrait']")?.getAttribute("href")).toContain("assets/champions/Lux/icon.png");
    expect(lc.querySelectorAll("[data-testid^='academy-core-v35-shutter-']")).toHaveLength(6);
    expect(lc.querySelectorAll(".acore-role")).toHaveLength(5); // the five role icons around her
    expect(lc.querySelectorAll(".acore-reticle")).toHaveLength(0);
    expect(lc.querySelector("[data-testid='academy-core-v35-study-emblem']")).toBeNull();
    expect(lc.querySelector("image[href*='splash']")).toBeNull(); // the square icon, never the splash
    const pp = container.querySelector(".acore-mode-pro-play")!;
    expect(pp).toHaveAttribute("data-projection", "override");
    const hrefs = (side: string) => [...pp.querySelectorAll(`[data-testid='academy-core-v35-team-${side}'] .o35-team-icon`)].map((i) => i.getAttribute("href"));
    const want = (names: readonly string[]) => names.map((n) => expect.stringContaining(`assets/champions/${n}/icon.png`));
    expect(hrefs("top")).toEqual(want(["Gnar", "Lee Sin", "Azir", "Jinx", "Thresh"]));
    expect(hrefs("bottom")).toEqual(want(["K'Sante", "Vi", "Orianna", "Kai'Sa", "Nautilus"]));
    expect(pp.querySelector("[data-testid='academy-core-v35-rift'] image")?.getAttribute("href")).toMatch(/rift-lane-turret/);
    // Combat and Archives are the V3 originals
    expect(container.querySelector(".acore-mode-combat")).not.toHaveAttribute("data-projection");
    expect(container.querySelector(".acore-mode-archives")).not.toHaveAttribute("data-projection");
  });

  it("the crystal and the selector still agree on the room the crystal is projecting", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    mount();
    fireEvent.click(screen.getByTestId("academy-core-arrow-left")); // Pro Play from rest
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "pro-play");
    expect(document.querySelector(".acore-svg")).toHaveAttribute("data-focus", "pro-play");
    fireEvent.click(screen.getByTestId("academy-core-crystal"));
    expect(document.querySelector(".acore-svg")).toHaveAttribute("data-focus", "combat-lab");
  });
});


describe("what nobody sees on arrival waits (ACADEMY STARTUP S3)", () => {
  it("the destination pages, Mogzy's reaction poses and the projection icons wait for the first screen to settle, then follow at idle", async () => {
    let release!: () => void;
    settledGate.promise = new Promise<void>((r) => { release = r; });
    const { container } = mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(prefetchRoute.mock.calls.map((c) => c[0])).not.toEqual(expect.arrayContaining(["/quiz", "/combat-lab"]));
    expect(container.querySelector("[data-testid='academy-core-mogzy']")).toHaveAttribute("data-reactions", "pending");
    expect(container.querySelector("[data-testid='academy-core-v35-lux-portrait']")).toBeNull();
    expect(container.querySelectorAll("img[src*='icon.png'], image[href*='icon.png']")).toHaveLength(0);
    await act(async () => { release(); await Promise.resolve(); });
    await waitFor(() => expect(prefetchRoute.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(["/quiz", "/combat-lab", "/lol/docs", "/lol/pro-play"]),
    ));
    expect(container.querySelector("[data-testid='academy-core-mogzy']")).toHaveAttribute("data-reactions", "ready");
    expect(container.querySelector("[data-testid='academy-core-v35-lux-portrait']")).not.toBeNull();
  });
});

describe("an engaged book does not wait for the deferral (ACADEMY STARTUP RC1)", () => {
  // On a slow link the first screen can take many seconds to settle; the
  // deferral must never leave an interaction looking broken in the meantime.
  const holdSettle = () => { settledGate.promise = new Promise<void>(() => {}); };
  const lux = (c: HTMLElement) => c.querySelector("[data-testid='academy-core-v35-lux-portrait']");
  const flush = async () => {
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  };

  it("hovering Leaguecraft shows Lux at once, asks for her at high priority, and wakes Mogzy's reactions", async () => {
    holdSettle();
    const { container } = mount();
    await flush();
    expect(lux(container)).toBeNull();
    fireEvent.pointerEnter(slot("leaguecraft"), { pointerType: "mouse" });
    await act(async () => { await Promise.resolve(); });
    expect(lux(container)?.getAttribute("href")).toContain("assets/champions/Lux/icon.png");
    expect(prepared.calls).toContainEqual({ url: expect.stringContaining("assets/champions/Lux/icon.png"), priority: "high" });
    expect(container.querySelector("[data-testid='academy-core-mogzy']")).toHaveAttribute("data-reactions", "ready");
    // only what was engaged: the 5 v 5 still waits, and so do the destination pages' idle warm
    expect(container.querySelectorAll(".o35-team-icon")).toHaveLength(0);
    expect(prefetchRoute.mock.calls.map((c) => c[0])).not.toEqual(expect.arrayContaining(["/combat-lab", "/lol/docs"]));
    // the hovered book's own page is still fetched at once (intent)
    expect(prefetchRoute.mock.calls.map((c) => c[0])).toContain("/quiz");
  });

  it("the arrows or the crystal reaching Pro Play bring its 5 v 5 lineup and Rift at once", async () => {
    holdSettle();
    const { container } = mount();
    await flush();
    fireEvent.click(screen.getByTestId("academy-core-arrow-left")); // Pro Play from rest
    await act(async () => { await Promise.resolve(); });
    const pp = container.querySelector(".acore-mode-pro-play")!;
    expect(pp.querySelectorAll(".o35-team-icon")).toHaveLength(10);
    expect(prepared.calls.filter((c) => c.priority === "high" && /icon\.png|rift-lane-turret/.test(c.url))).toHaveLength(11);
    expect(lux(container)).toBeNull(); // Leaguecraft was not engaged
  });

  it("keyboard focus counts as engagement too", async () => {
    holdSettle();
    const { container } = mount();
    await flush();
    act(() => { book("leaguecraft").focus(); });
    await act(async () => { await Promise.resolve(); });
    expect(lux(container)).not.toBeNull();
  });
});


/* ------------------------------------------------------------------------ */
/* ACADEMY STARTUP RC2 — the held veil: the page lifts it on REAL readiness   */
/* ------------------------------------------------------------------------ */
describe("the held entrance veil (ACADEMY STARTUP RC2)", () => {
  // jsdom never loads an image: each test says which srcs are loaded, failed, and
  // whether decode() is still running.
  const img = {
    loaded: (_src: string) => false,
    failed: (_src: string) => false,
    decode: null as Promise<void> | null,
  };
  const srcOf = (el: HTMLImageElement) => el.getAttribute("src") ?? "";
  const saved: Record<string, PropertyDescriptor | undefined> = {};
  const store = () => getAcademyStartup();
  const root = () => screen.getByTestId("academy-core-v35");
  const frames = async (n: number) => {
    for (let i = 0; i < n; i++) await act(async () => { vi.advanceTimersByTime(16); });
  };
  /** The network answers: fire load / error on every <img> now settled. */
  const network = async () => {
    await act(async () => {
      for (const el of Array.from(document.querySelectorAll("img"))) {
        if (img.failed(srcOf(el))) el.dispatchEvent(new Event("error"));
        else if (img.loaded(srcOf(el))) el.dispatchEvent(new Event("load"));
      }
    });
  };
  const everything = () => true;
  const READY_FEED = { status: "unavailable" } as BroadcastFeed;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout"] });
    __resetAcademyStartupForTests();
    for (const k of ["complete", "naturalWidth", "decode"]) saved[k] = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, k);
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true, get(this: HTMLImageElement) { const s = srcOf(this); return img.loaded(s) || img.failed(s); },
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true, get(this: HTMLImageElement) { return img.loaded(srcOf(this)) && !img.failed(srcOf(this)) ? 100 : 0; },
    });
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true, writable: true, value() { return img.decode ?? Promise.resolve(); },
    });
    img.loaded = () => false;
    img.failed = () => false;
    img.decode = null;
    feed.current = READY_FEED;
  });
  afterEach(() => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(HTMLImageElement.prototype, k, d);
      else delete (HTMLImageElement.prototype as unknown as Record<string, unknown>)[k];
    }
    __resetAcademyStartupForTests();
  });

  it("an in-app visit (nothing held) behaves as before: no gate, the arrival cue at mount", async () => {
    mount();
    await frames(2);
    expect(root()).toHaveAttribute("data-startup", "none");
    expect(sfxPlay).toHaveBeenCalledWith("hub.application.enter");
  });

  it("resources ready before the hand-off: revealed as soon as frames flow (no extra wait), cue at the reveal", async () => {
    img.loaded = everything;
    holdAcademyVeil("entrance");
    mount();
    expect(root()).toHaveAttribute("data-startup", "pending");
    expect(sfxPlay).not.toHaveBeenCalledWith("hub.application.enter");
    await frames(FLOW_FRAMES + 2);
    expect(store()).toMatchObject({ phase: "revealing", reason: "ready", degraded: [] });
    expect(root()).toHaveAttribute("data-startup", "ready");
    expect(sfxPlay).toHaveBeenCalledWith("hub.application.enter");
    expect(store().revealedAt! - store().heldAt!).toBeLessThan(200);
  });

  it("resources completing after the normal entrance: the veil holds, then lifts the moment they are in", async () => {
    holdAcademyVeil("entrance");
    mount();
    await frames(30); // ~0.5 s, still downloading
    expect(store().phase).toBe("held");
    img.loaded = everything;
    await network();
    await frames(FLOW_FRAMES + 2);
    expect(store()).toMatchObject({ phase: "revealing", reason: "ready" });
  });

  it("slow image decoding: loaded bytes are not enough, the veil waits for decode()", async () => {
    let decoded!: () => void;
    img.decode = new Promise<void>((r) => { decoded = r; });
    img.loaded = everything;
    holdAcademyVeil("entrance");
    mount();
    await frames(20);
    expect(store().phase).toBe("held");
    await act(async () => { decoded(); });
    await frames(FLOW_FRAMES + 2);
    expect(store().reason).toBe("ready");
  });

  it("a failed image settles as degraded (bare leather) and never holds the veil", async () => {
    img.loaded = (s) => !/Akali/.test(s);
    img.failed = (s) => /Akali/.test(s);
    holdAcademyVeil("entrance");
    mount();
    await network();
    await frames(FLOW_FRAMES + 3);
    expect(store()).toMatchObject({ phase: "revealing", reason: "degraded" });
    expect(store().degraded).toContain("cover:combat-lab");
    expect(root()).toHaveAttribute("data-startup", "degraded");
  });

  it("a failed manifest: covers settle as errors at once (bare leather); the rest still has to be drawn", async () => {
    assets.current = null;
    img.loaded = everything;
    holdAcademyVeil("entrance");
    mount();
    await frames(FLOW_FRAMES + 2);
    expect(store().reason).toBe("degraded");
    expect(store().degraded).toEqual(expect.arrayContaining(["cover:leaguecraft", "cover:pro-play", "cover:combat-lab", "cover:archives"]));
    expect(store().degraded).not.toContain("frame:leaguecraft");
  });

  it("a manifest still loading keeps the covers pending (no bare-leather flash), and the cap still releases", async () => {
    assets.current = undefined;
    img.loaded = everything;
    holdAcademyVeil("entrance");
    mount();
    await frames(20);
    expect(store().phase).toBe("held");
    await act(async () => { vi.advanceTimersByTime(ENTRANCE_CAP_MS); });
    expect(store()).toMatchObject({ reason: "timeout" });
    expect(store().pending).toEqual(expect.arrayContaining(["cover:leaguecraft", "cover:archives"]));
  });

  it("timeout recovery: nothing arrives, the cap lifts the veil and the Orrery is fully usable", async () => {
    holdAcademyVeil("entrance");
    mount();
    await act(async () => { vi.advanceTimersByTime(ENTRANCE_CAP_MS); });
    expect(store()).toMatchObject({ phase: "revealing", reason: "timeout" });
    expect(store().pending).toEqual(expect.arrayContaining(["frame:leaguecraft", "mogzy"]));
    expect(root()).toHaveAttribute("data-startup", "timeout");
    expect(sfxPlay).toHaveBeenCalledWith("hub.application.enter");
    fireEvent.click(book("leaguecraft"));
    await act(async () => { vi.advanceTimersByTime(BOOK_ACTIVATION_MS + 50); });
    expect(screen.getByTestId("probe").textContent).toMatch(/^quiz\|\/quiz\|/);
  });

  it("the Patch Report is on the desktop first screen: a loading feed holds the veil", async () => {
    feed.current = { status: "loading" };
    img.loaded = everything;
    holdAcademyVeil("entrance");
    mount();
    await frames(20);
    expect(store().phase).toBe("held");
  });

  it("phones: the Patch Report is below the fold, so a loading feed does not hold the veil", async () => {
    setLayout(false);
    feed.current = { status: "loading" };
    img.loaded = everything;
    holdAcademyVeil("entrance");
    mount();
    await frames(FLOW_FRAMES + 2);
    expect(store().reason).toBe("ready");
  });

  it("display faces still loading hold the veil, so no font swap reflows the revealed scene", async () => {
    let fontsIn = false;
    const faces = ["Cinzel", "Space Mono", "Lora", "Inter"].map((family) => ({ family, status: "loading" }));
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { check: () => fontsIn, load: () => Promise.resolve([]), forEach: (cb: (f: unknown) => void) => faces.forEach(cb) },
    });
    try {
      img.loaded = everything;
      holdAcademyVeil("entrance");
      mount();
      await frames(20);
      expect(store().phase).toBe("held");
      fontsIn = true;
      await frames(FLOW_FRAMES + 2);
      expect(store().reason).toBe("ready");
    } finally {
      delete (document as unknown as Record<string, unknown>).fonts;
    }
  });

  it("a face that registers late and that nothing has used yet is asked for, not waited on until the cap", async () => {
    // Lora's stylesheet arrives after the gate started (its own first request found no face)
    const faces: { family: string; status: string }[] = ["Cinzel", "Space Mono", "Inter"].map((family) => ({ family, status: "loaded" }));
    const lora = () => faces.find((f) => f.family === "Lora");
    const asked: string[] = [];
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        check: (spec: string) => !/Lora/.test(spec) || lora()?.status === "loaded",
        load: (spec: string) => {
          asked.push(spec);
          const f = /Lora/.test(spec) ? lora() : undefined;
          if (f) f.status = "loaded";
          return Promise.resolve([]);
        },
        forEach: (cb: (f: unknown) => void) => faces.forEach(cb),
      },
    });
    try {
      img.loaded = everything;
      holdAcademyVeil("entrance");
      mount();
      await frames(5);
      expect(store().phase).toBe("held"); // no Lora face yet
      faces.push({ family: "Lora", status: "unloaded" });
      await frames(FLOW_FRAMES + 3);
      expect(store().reason).toBe("ready");
      expect(asked.filter((s) => /Lora/.test(s)).length).toBeGreaterThan(1);
    } finally {
      delete (document as unknown as Record<string, unknown>).fonts;
    }
  });

  it("direct /lol: the cap counts 1.8 s from the Orrery's mount", async () => {
    holdAcademyVeil("direct");
    await act(async () => { vi.advanceTimersByTime(3000); }); // the chunk took a while
    mount();
    await act(async () => { vi.advanceTimersByTime(DIRECT_CAP_AFTER_MOUNT_MS - 20); });
    expect(store().phase).toBe("held");
    await act(async () => { vi.advanceTimersByTime(40); });
    expect(store().reason).toBe("timeout");
  });

  it("direct /lol with everything ready: revealed on frames, like the entrance", async () => {
    img.loaded = everything;
    holdAcademyVeil("direct");
    mount();
    await frames(FLOW_FRAMES + 2);
    expect(store()).toMatchObject({ source: "direct", reason: "ready" });
  });

  it("rapid navigation: the page going away while held drops the veil (and stops probing)", async () => {
    holdAcademyVeil("entrance");
    const view = mount();
    await frames(3);
    view.unmount();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(store()).toMatchObject({ phase: "idle", reason: "cancelled" });
  });

  it("reduced motion: the same contract, revealed without a fade", async () => {
    reduced.current = true;
    document.documentElement.classList.add("reduce-motion");
    try {
      img.loaded = everything;
      holdAcademyVeil("entrance");
      mount();
      await frames(FLOW_FRAMES + 2);
      expect(store()).toMatchObject({ phase: "revealed", reason: "ready" });
    } finally {
      document.documentElement.classList.remove("reduce-motion");
    }
  });

  it("an early Lux hover under the veil still brings her art at once, and keyboard focus works while held", async () => {
    holdAcademyVeil("entrance");
    const { container } = mount();
    await frames(2);
    fireEvent.pointerEnter(slot("leaguecraft"), { pointerType: "mouse" });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector("[data-testid='academy-core-v35-lux-portrait']")).not.toBeNull();
    fireEvent.pointerLeave(slot("leaguecraft"));
    act(() => { book("archives").focus(); });
    await frames(2);
    expect(screen.getByTestId("academy-core-stage")).toHaveAttribute("data-focus", "archives");
    expect(store().phase).toBe("held");
  });
});
