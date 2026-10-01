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

const AUTO_HOLD_MS = 1800;
const AUTO_HOLD_REDUCED_MS = 450;
const ENTRY_DURATION_MS = 780;
const ENTRY_DURATION_REDUCED_MS = 220;

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  playLaunchChime: vi.fn(),
  startEntryMusic: vi.fn(() => Promise.resolve(true)),
  warmAcademyWelcomeScene: vi.fn(),
  prefetchRoute: vi.fn(),
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

  it("warms the Hub route during the hold", () => {
    render(<MogzyEntryV2 seo="root" autoEnter />);
    expect(mocks.prefetchRoute).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE);
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
    expect(AUTO_HOLD_REDUCED_MS + ENTRY_DURATION_REDUCED_MS).toBeLessThan(
      (AUTO_HOLD_MS + ENTRY_DURATION_MS) / 3,
    );
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
