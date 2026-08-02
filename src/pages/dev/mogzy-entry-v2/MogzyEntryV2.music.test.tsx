/**
 * Entrance -> entry music wiring.
 *
 * The music is allowed to start only from the same gesture that already drives
 * the entrance (click, Enter, Space), and it is fire-and-forget: the chime, the
 * visual transition and the hand-off to /lol must be bit-for-bit what they were
 * before the music existed, whether playback succeeds, fails, or hangs.
 *
 * Everything heavy on this screen (façade, mascot, SEO, chime) is mocked locally
 * so the assertions are about the entry contract, not about rendering stone.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MogzyEntryV2 from "./MogzyEntryV2";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";

const ENTRY_DURATION_MS = 780;
const ENTRY_DURATION_REDUCED_MS = 220;

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  playLaunchChime: vi.fn(),
  startEntryMusic: vi.fn(() => Promise.resolve(true)),
  reducedMotion: false,
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("./useLaunchChime", () => ({ useLaunchChime: () => mocks.playLaunchChime }));
vi.mock("@/components/audio/EntryMusicController", () => ({
  default: () => null,
  startEntryMusic: mocks.startEntryMusic,
}));
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

beforeEach(() => {
  mocks.reducedMotion = false;
  mocks.startEntryMusic.mockImplementation(() => Promise.resolve(true));
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function enterButton() {
  return screen.getByRole("button", { name: "Enter Mogzy" });
}

describe("MogzyEntryV2 — entry music trigger", () => {
  it("starts no music merely by rendering the entrance", () => {
    render(<MogzyEntryV2 />);
    expect(mocks.startEntryMusic).not.toHaveBeenCalled();
  });

  it("starts the music from the click path", () => {
    render(<MogzyEntryV2 />);
    fireEvent.click(enterButton());
    expect(mocks.startEntryMusic).toHaveBeenCalledTimes(1);
  });

  it("starts the music from the Enter key path", () => {
    render(<MogzyEntryV2 />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(mocks.startEntryMusic).toHaveBeenCalledTimes(1);
  });

  it("starts the music from the Space key path", () => {
    render(<MogzyEntryV2 />);
    fireEvent.keyDown(window, { key: " " });
    expect(mocks.startEntryMusic).toHaveBeenCalledTimes(1);
  });

  it("still plays the synthesized launch chime on entry", () => {
    render(<MogzyEntryV2 />);
    fireEvent.click(enterButton());
    expect(mocks.playLaunchChime).toHaveBeenCalledTimes(1);
  });

  it("honours the enteringRef guard — repeat activation starts nothing twice", () => {
    render(<MogzyEntryV2 />);
    const button = enterButton();

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(window, { key: "Enter" });

    expect(mocks.startEntryMusic).toHaveBeenCalledTimes(1);
    expect(mocks.playLaunchChime).toHaveBeenCalledTimes(1);
  });

  it("leaves the modifier-chord and text-field keyboard guards intact", () => {
    render(<MogzyEntryV2 />);

    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Enter", altKey: true });

    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "Enter" });
    input.remove();

    expect(mocks.startEntryMusic).not.toHaveBeenCalled();
    expect(mocks.playLaunchChime).not.toHaveBeenCalled();
  });
});

describe("MogzyEntryV2 — music never affects the hand-off to /lol", () => {
  it("navigates at 780ms, unchanged", () => {
    render(<MogzyEntryV2 />);
    fireEvent.click(enterButton());

    vi.advanceTimersByTime(ENTRY_DURATION_MS - 1);
    expect(mocks.navigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("navigates at 220ms under reduced motion, unchanged", () => {
    mocks.reducedMotion = true;
    render(<MogzyEntryV2 />);
    fireEvent.click(enterButton());

    vi.advanceTimersByTime(ENTRY_DURATION_REDUCED_MS - 1);
    expect(mocks.navigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("navigates on the same schedule when playback is refused", () => {
    mocks.startEntryMusic.mockImplementation(() => Promise.resolve(false));
    render(<MogzyEntryV2 />);
    fireEvent.click(enterButton());

    expect(mocks.playLaunchChime).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ENTRY_DURATION_MS);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });

  it("navigates on the same schedule when the music start never settles", () => {
    mocks.startEntryMusic.mockImplementation(() => new Promise<boolean>(() => undefined));
    render(<MogzyEntryV2 />);
    fireEvent.click(enterButton());

    // The transition is committed synchronously; nothing waits on the audio.
    expect(screen.getByTestId("mogzy-entry-v2")).toHaveAttribute("data-entering", "true");
    vi.advanceTimersByTime(ENTRY_DURATION_MS);
    expect(mocks.navigate).toHaveBeenCalledWith(LEAGUE_HOME_ROUTE, { replace: true });
  });
});
