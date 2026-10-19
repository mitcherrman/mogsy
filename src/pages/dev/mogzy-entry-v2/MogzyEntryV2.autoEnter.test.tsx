/**
 * MG-B — the production root runs the entrance as a boot sequence.
 *
 * `/` no longer waits for "Enter Mogzy": after a short hold the existing
 * door/zoom transition runs on its own and hands off to the Academy Hub, for
 * every visitor. The Academy introduction (/welcome) is no longer part of this
 * path — but it is not removed, and the interactive /dev preview still routes
 * first-time visitors into it. Both halves are pinned here.
 *
 * Heavy children are mocked as in MogzyEntryV2.music.test.tsx; these assertions
 * are about the entry contract, not about rendering stone.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MogzyEntryV2 from "./MogzyEntryV2";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import { ACADEMY_WELCOME_ROUTE, markAcademyWelcomeHandled } from "@/lib/welcome/academy-welcome";
import { installLocalStorageStub } from "@/test/localStorageStub";
import { __resetAcademyStartupForTests, getAcademyStartup } from "@/lib/academy-startup/veil-store";

// PERF1: 1800 -> 1100, the title's own 1.1s entrance.
const AUTO_HOLD_MS = 1100;
const AUTO_HOLD_REDUCED_MS = 450;
const ENTRY_DURATION_MS = 780;
const ENTRY_DURATION_REDUCED_MS = 220;

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  playLaunchChime: vi.fn(),
  startEntryMusic: vi.fn(() => Promise.resolve(true)),
  warmAcademyWelcomeScene: vi.fn(),
  prefetchRoute: vi.fn(),
  warmAcademyCore: vi.fn(() => Promise.resolve()),
  // The Landing's own art; resolved by each test when it wants it "loaded".
  landingArt: null as null | { resolve: () => void },
  prepareImages: vi.fn(),
  reducedMotion: false,
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("./useLaunchChime", () => ({ useLaunchChime: () => mocks.playLaunchChime }));
vi.mock("@/components/audio/EntryMusicController", () => ({
  default: () => null,
  startEntryMusic: mocks.startEntryMusic,
}));
vi.mock("@/pages/welcome/sceneAssets", () => ({
  warmAcademyWelcomeScene: mocks.warmAcademyWelcomeScene,
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: mocks.prefetchRoute }));
// The Landing now hands off to the Academy Core (`/lol`), not the Hall.
vi.mock("@/pages/academy-core/academy-core-warm", () => ({
  CORE_MOGZY_REST_SRC: "/mascot/mogzy-mascot-base-v1-512.webp",
  warmAcademyCore: mocks.warmAcademyCore,
}));
vi.mock("@/lib/ranked-core/media/prepareImage", () => ({ prepareImages: mocks.prepareImages }));
const fontWarm = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/academy-startup/font-warm", () => ({ warmAcademyFonts: () => { fontWarm.calls += 1; } }));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/mascot/MogzyMascot", () => ({ MogzyMascot: () => null }));
vi.mock("./AcademyFacade", () => ({ default: () => null }));
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => mocks.reducedMotion };
});

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const resetStorage = installLocalStorageStub();

function setUserActivation(hasBeenActive: boolean | undefined) {
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: hasBeenActive === undefined ? undefined : { hasBeenActive, isActive: false },
  });
}

beforeEach(() => {
  mocks.reducedMotion = false;
  mocks.prepareImages.mockImplementation(
    () => new Promise<void>((resolve) => { mocks.landingArt = { resolve }; }),
  );
  mocks.startEntryMusic.mockImplementation(() => Promise.resolve(true));
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resetStorage();
  setUserActivation(false);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  resetStorage();
  setUserActivation(undefined);
});

describe("MogzyEntryV2 autoEnter — root boot sequence", () => {
  it("holds, runs the transition, then navigates to the Hub with no click", () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    const main = screen.getByTestId("mogzy-entry-v2");
    expect(main).toHaveAttribute("data-auto-enter", "true");
    expect(main).toHaveAttribute("data-entering", "false");

    act(() => {
      vi.advanceTimersByTime(AUTO_HOLD_MS - 1);
    });
    expect(main).toHaveAttribute("data-entering", "false");
    expect(mocks.navigate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(main).toHaveAttribute("data-entering", "true");
    expect(mocks.navigate).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(ENTRY_DURATION_MS);
    });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("sends a FIRST-TIME visitor to the Hub, never into /welcome", () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => {
      vi.advanceTimersByTime(AUTO_HOLD_MS + ENTRY_DURATION_MS);
    });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
    expect(mocks.navigate).not.toHaveBeenCalledWith(ACADEMY_WELCOME_ROUTE, expect.anything());
    expect(mocks.warmAcademyWelcomeScene).not.toHaveBeenCalled();
  });

  it("sends a returning visitor to the Hub on the same schedule", () => {
    markAcademyWelcomeHandled("explored");
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => {
      vi.advanceTimersByTime(AUTO_HOLD_MS + ENTRY_DURATION_MS);
    });
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("does not read or write the Welcome state", () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => {
      vi.advanceTimersByTime(AUTO_HOLD_MS + ENTRY_DURATION_MS);
    });
    // Analytics legitimately writes its own keys on a root render; the Welcome
    // key is the one that must stay untouched.
    expect(get).not.toHaveBeenCalledWith("mogsy.academyWelcome.v1");
    expect(set).not.toHaveBeenCalledWith("mogsy.academyWelcome.v1", expect.anything());
  });

  it("warms the home route during the hold — requested at once, not at idle (ACADEMY STARTUP S3)", () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    expect(mocks.prefetchRoute).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { intent: true });
  });

  it("attempts the entry music, and navigates on schedule if it is refused", () => {
    mocks.startEntryMusic.mockImplementation(() => Promise.resolve(false));
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => {
      vi.advanceTimersByTime(AUTO_HOLD_MS);
    });
    expect(mocks.startEntryMusic).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(ENTRY_DURATION_MS);
    });
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("navigates on schedule even when the music start never settles", () => {
    mocks.startEntryMusic.mockImplementation(() => new Promise<boolean>(() => undefined));
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => {
      vi.advanceTimersByTime(AUTO_HOLD_MS + ENTRY_DURATION_MS);
    });
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("skips the chime when the page has never been interacted with", () => {
    setUserActivation(false);
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => {
      vi.advanceTimersByTime(AUTO_HOLD_MS);
    });
    expect(mocks.playLaunchChime).not.toHaveBeenCalled();
  });

  it("plays the chime when the browser has seen the visitor act", () => {
    setUserActivation(true);
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => {
      vi.advanceTimersByTime(AUTO_HOLD_MS);
    });
    expect(mocks.playLaunchChime).toHaveBeenCalledTimes(1);
  });

  it("keeps the control as an optional skip — one transition, one navigation", () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    fireEvent.click(screen.getByRole("button", { name: "Enter Mogzy" }));
    expect(screen.getByTestId("mogzy-entry-v2")).toHaveAttribute("data-entering", "true");

    act(() => {
      // Past the original auto hold as well: the timer must not double-fire.
      vi.advanceTimersByTime(AUTO_HOLD_MS + ENTRY_DURATION_MS);
    });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
    expect(mocks.startEntryMusic).toHaveBeenCalledTimes(1);
  });

  it("no longer tells the visitor to tap", () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    expect(screen.queryByText(/tap to enter/i)).toBeNull();
    expect(screen.getByText(/opening the academy/i)).toBeInTheDocument();
  });

  it("cancels the whole sequence if the screen unmounts before the hold ends", () => {
    const { unmount } = render(<MogzyEntryV2 seo="root" autoEnter />);
    vi.advanceTimersByTime(AUTO_HOLD_MS - 100);
    unmount();
    vi.advanceTimersByTime(5000);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.startEntryMusic).not.toHaveBeenCalled();
  });

  it("cancels the pending hand-off if the screen unmounts mid-transition", () => {
    const { unmount } = render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => {
      vi.advanceTimersByTime(AUTO_HOLD_MS + 100);
    });
    unmount();
    vi.advanceTimersByTime(5000);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});

describe("MogzyEntryV2 autoEnter — reduced motion", () => {
  it("uses the shortened hold and the 220ms hand-off", () => {
    mocks.reducedMotion = true;
    render(<MogzyEntryV2 seo="root" autoEnter />);
    const main = screen.getByTestId("mogzy-entry-v2");

    vi.advanceTimersByTime(AUTO_HOLD_REDUCED_MS - 1);
    expect(main).toHaveAttribute("data-entering", "false");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(main).toHaveAttribute("data-entering", "true");

    vi.advanceTimersByTime(ENTRY_DURATION_REDUCED_MS - 1);
    expect(mocks.navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("is far shorter than the full-motion sequence", () => {
    // Under half (670ms vs 1880ms). PERF1 shortened the full-motion hold to
    // the title's own entrance; the reduced-motion timings are unchanged.
    expect(AUTO_HOLD_REDUCED_MS + ENTRY_DURATION_REDUCED_MS).toBeLessThan(
      (AUTO_HOLD_MS + ENTRY_DURATION_MS) / 2,
    );
  });
});

describe("MogzyEntryV2 autoEnter — PERF1 Core warm", () => {
  it("waits for the Landing's own Mogzy and skyline before warming the Core", async () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    expect(mocks.prepareImages).toHaveBeenCalledTimes(1);
    const [urls, opts] = mocks.prepareImages.mock.calls[0];
    expect(urls).toContain("/mascot/mogzy-mascot-base-v1-512.webp");
    expect(urls.some((u: string) => u.includes("academy-skyline"))).toBe(true);
    // The budget is the hold: once the visitor is leaving, the Core goes first.
    expect(opts).toMatchObject({ priority: "high", timeoutMs: AUTO_HOLD_MS });
    expect(mocks.warmAcademyCore).not.toHaveBeenCalled();
    await act(async () => {
      mocks.landingArt?.resolve();
    });
    expect(mocks.warmAcademyCore).toHaveBeenCalledTimes(1);
    // Nothing waits on the warm: the hand-off still fires on the hold.
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("does not warm after the screen has gone", async () => {
    const { unmount } = render(<MogzyEntryV2 seo="root" autoEnter />);
    unmount();
    await act(async () => {
      mocks.landingArt?.resolve();
    });
    expect(mocks.warmAcademyCore).not.toHaveBeenCalled();
  });

  it("warms the Core at once when the visitor clicks in before the art settles", () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    fireEvent.click(screen.getByRole("button", { name: "Enter Mogzy" }));
    expect(mocks.warmAcademyCore).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(ENTRY_DURATION_MS);
    });
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("the interactive preview never warms the Core on its own", () => {
    render(<MogzyEntryV2 />);
    vi.advanceTimersByTime(60_000);
    expect(mocks.prepareImages).not.toHaveBeenCalled();
    expect(mocks.warmAcademyCore).not.toHaveBeenCalled();
  });
});

describe("MogzyEntryV2 without autoEnter — the interactive /dev preview", () => {
  it("never navigates by itself", () => {
    render(<MogzyEntryV2 />);
    expect(screen.getByTestId("mogzy-entry-v2")).toHaveAttribute("data-auto-enter", "false");
    vi.advanceTimersByTime(60_000);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.prefetchRoute).not.toHaveBeenCalled();
    expect(screen.getByText(/tap to enter/i)).toBeInTheDocument();
  });

  it("still routes a first-time visitor into /welcome on click, so Welcome stays reusable", () => {
    render(<MogzyEntryV2 />);
    fireEvent.click(screen.getByRole("button", { name: "Enter Mogzy" }));
    act(() => {
      vi.advanceTimersByTime(ENTRY_DURATION_MS);
    });
    expect(mocks.navigate).toHaveBeenCalledWith(ACADEMY_WELCOME_ROUTE, { replace: true });
    expect(mocks.warmAcademyWelcomeScene).toHaveBeenCalledTimes(1);
  });

  it("still plays the chime on a click regardless of user activation", () => {
    setUserActivation(false);
    render(<MogzyEntryV2 />);
    fireEvent.click(screen.getByRole("button", { name: "Enter Mogzy" }));
    expect(mocks.playLaunchChime).toHaveBeenCalledTimes(1);
  });
});


/* ACADEMY STARTUP RC2 — the Landing hands its veil to the app at navigate(). */
describe("MogzyEntryV2 — the veil hand-off (ACADEMY STARTUP RC2)", () => {
  let phaseAtNavigate: string | null = null;
  beforeEach(() => {
    __resetAcademyStartupForTests();
    phaseAtNavigate = null;
    mocks.navigate.mockImplementation(() => { phaseAtNavigate = getAcademyStartup().phase; });
  });
  afterEach(() => { __resetAcademyStartupForTests(); });

  it("takes the hold at the very moment it navigates to the Academy (veil at its peak), not before", () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => { vi.advanceTimersByTime(AUTO_HOLD_MS + ENTRY_DURATION_MS - 1); });
    expect(getAcademyStartup().phase).toBe("idle"); // the Landing's own veil is still on screen
    act(() => { vi.advanceTimersByTime(1); });
    expect(phaseAtNavigate).toBe("held"); // held BEFORE the route changes
    expect(getAcademyStartup()).toMatchObject({ phase: "held", source: "entrance" });
  });

  it("an early click (user-initiated entry) hands over at its own navigate, once", () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.click(screen.getByRole("button", { name: "Enter Mogzy" }));
    act(() => { vi.advanceTimersByTime(ENTRY_DURATION_MS); });
    expect(phaseAtNavigate).toBe("held");
    act(() => { vi.advanceTimersByTime(AUTO_HOLD_MS * 2); });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("reduced motion: the same hand-off on the shortened schedule", () => {
    mocks.reducedMotion = true;
    render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => { vi.advanceTimersByTime(AUTO_HOLD_REDUCED_MS + ENTRY_DURATION_REDUCED_MS); });
    expect(phaseAtNavigate).toBe("held");
  });

  it("asks for the Orrery's late display faces during the hold, not at the hand-off (RC2.2)", () => {
    fontWarm.calls = 0;
    render(<MogzyEntryV2 seo="root" autoEnter />);
    expect(fontWarm.calls).toBe(1);
    act(() => { vi.advanceTimersByTime(AUTO_HOLD_MS + ENTRY_DURATION_MS); });
    expect(fontWarm.calls).toBe(1);
  });

  it("leaving before the hand-off takes no hold", () => {
    const { unmount } = render(<MogzyEntryV2 seo="root" autoEnter />);
    act(() => { vi.advanceTimersByTime(AUTO_HOLD_MS + 100); });
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(getAcademyStartup().phase).toBe("idle");
  });

  it("the /dev preview sending a first-time visitor to /welcome holds nothing (only the Academy home is gated)", () => {
    render(<MogzyEntryV2 />);
    fireEvent.click(screen.getByRole("button", { name: "Enter Mogzy" }));
    act(() => { vi.advanceTimersByTime(ENTRY_DURATION_MS); });
    expect(mocks.navigate).toHaveBeenCalledWith(ACADEMY_WELCOME_ROUTE, { replace: true });
    expect(getAcademyStartup().phase).toBe("idle");
  });
});
