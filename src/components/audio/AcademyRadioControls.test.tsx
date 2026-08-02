/**
 * Academy Radio — navbar player.
 *
 * The player is a view over the shared transport, so these specs drive the real
 * store rather than a mock of it: what is being checked is that the controls
 * report the truth (never an optimistic "playing"), that desktop and mobile move
 * the same state, and that a route remount leaves the radio exactly as it was.
 *
 * jsdom implements none of HTMLMediaElement's playback and Node 25's global
 * `localStorage` has no methods, so both are stubbed locally in this file only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import AcademyRadioControls from "./AcademyRadioControls";
import {
  DEFAULT_MUSIC_VOLUME,
  getRadioSnapshot,
  resetRadioForTests,
} from "@/lib/audio/academy-radio";

const mocks = vi.hoisted(() => ({ reducedMotion: false }));
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => mocks.reducedMotion };
});

/* -------------------------------------------------------------------------- */
/* Local stubs                                                                */
/* -------------------------------------------------------------------------- */

const nativeLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const nativeCreateElement = document.createElement.bind(document);
const nativePlay = HTMLMediaElement.prototype.play;
const nativePause = HTMLMediaElement.prototype.pause;
const nativeLoad = HTMLMediaElement.prototype.load;
const nativePausedDescriptor = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "paused",
);

let paused = true;
let audioCreations = 0;
let play: ReturnType<typeof vi.fn>;

function installLocalStorageStub() {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      get length() {
        return entries.size;
      },
      clear: () => entries.clear(),
      getItem: (key: string) => (entries.has(key) ? entries.get(key)! : null),
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      removeItem: (key: string) => void entries.delete(key),
      setItem: (key: string, value: string) => void entries.set(key, String(value)),
    } satisfies Storage,
  });
}

beforeEach(() => {
  installLocalStorageStub();
  resetRadioForTests();
  mocks.reducedMotion = false;

  paused = true;
  audioCreations = 0;
  play = vi.fn(async () => {
    paused = false;
  });

  vi.spyOn(document, "createElement").mockImplementation(((
    tag: string,
    options?: ElementCreationOptions,
  ) => {
    if (tag === "audio") audioCreations += 1;
    return nativeCreateElement(tag, options);
  }) as typeof document.createElement);

  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.pause = vi.fn(() => {
    paused = true;
  }) as unknown as HTMLMediaElement["pause"];
  HTMLMediaElement.prototype.load = vi.fn() as unknown as HTMLMediaElement["load"];
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get: () => paused,
  });
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  cleanup();
  resetRadioForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  HTMLMediaElement.prototype.play = nativePlay;
  HTMLMediaElement.prototype.pause = nativePause;
  HTMLMediaElement.prototype.load = nativeLoad;
  if (nativePausedDescriptor) {
    Object.defineProperty(HTMLMediaElement.prototype, "paused", nativePausedDescriptor);
  }
  if (nativeLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", nativeLocalStorage);
  }
});

/* -------------------------------------------------------------------------- */

const playPause = (variant = "desktop") =>
  screen.getByTestId(`academy-radio-playpause-${variant}`);
const mute = (variant = "desktop") => screen.getByTestId(`academy-radio-mute-${variant}`);
const next = (variant = "desktop") => screen.getByTestId(`academy-radio-next-${variant}`);

describe("Academy Radio controls — what they show", () => {
  it("names the current track", () => {
    render(<AcademyRadioControls />);
    expect(screen.getByTestId("academy-radio-title")).toHaveTextContent("Tidecaller");
  });

  it("does not create or own an audio element merely by rendering", () => {
    render(<AcademyRadioControls />);
    render(<AcademyRadioControls variant="mobile" />);

    expect(audioCreations).toBe(0);
    expect(play).not.toHaveBeenCalled();
  });

  it("does not claim to be playing before playback has actually started", () => {
    render(<AcademyRadioControls />);

    expect(playPause()).toHaveAttribute("aria-pressed", "false");
    expect(playPause()).toHaveAccessibleName("Play Academy Radio");
  });

  it("reflects real playback state once play() resolves", async () => {
    render(<AcademyRadioControls />);

    fireEvent.click(playPause());

    await waitFor(() => expect(playPause()).toHaveAttribute("aria-pressed", "true"));
    expect(playPause()).toHaveAccessibleName("Pause Academy Radio");
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });

  it("does not flip to playing when the browser refuses playback", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<AcademyRadioControls />);

    fireEvent.click(playPause());

    await waitFor(() => expect(getRadioSnapshot().status).toBe("blocked"));
    expect(playPause()).toHaveAttribute("aria-pressed", "false");
  });

  it("pauses back from playing", async () => {
    render(<AcademyRadioControls />);
    fireEvent.click(playPause());
    await waitFor(() => expect(playPause()).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(playPause());

    expect(playPause()).toHaveAttribute("aria-pressed", "false");
    expect(getRadioSnapshot().status).toBe("paused");
  });
});

describe("Academy Radio controls — mute", () => {
  it("reflects and drives the shared mute state", () => {
    render(<AcademyRadioControls />);

    expect(mute()).toHaveAttribute("aria-pressed", "false");
    expect(mute()).toHaveAccessibleName("Mute Academy Radio");

    fireEvent.click(mute());

    expect(mute()).toHaveAttribute("aria-pressed", "true");
    expect(mute()).toHaveAccessibleName("Unmute Academy Radio");
    expect(getRadioSnapshot().muted).toBe(true);
  });
});

describe("Academy Radio controls — Next with one available track", () => {
  it("is disabled and explains why, rather than pretending to advance", () => {
    render(<AcademyRadioControls />);

    expect(next()).toBeDisabled();
    expect(next()).toHaveAttribute("title", "Only one track is available right now");
  });

  it("carries the explanation as an accessible description, panel open or shut", () => {
    render(<AcademyRadioControls />);

    const describedBy = next().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Only one track is available right now.",
    );
  });
});

describe("Academy Radio controls — volume", () => {
  it("shows the default target and updates centralized state", () => {
    render(<AcademyRadioControls />);
    fireEvent.click(screen.getByTestId("academy-radio-title"));

    const slider = screen.getByTestId("academy-radio-volume-desktop") as HTMLInputElement;
    expect(Number(slider.value)).toBeCloseTo(DEFAULT_MUSIC_VOLUME, 5);

    fireEvent.change(slider, { target: { value: "0.55" } });

    expect(getRadioSnapshot().volume).toBeCloseTo(0.55, 5);
    expect(screen.getByText("55%")).toBeTruthy();
  });

  it("keeps the remembered volume through a mute round-trip", async () => {
    render(<AcademyRadioControls />);
    fireEvent.click(screen.getByTestId("academy-radio-title"));
    fireEvent.change(screen.getByTestId("academy-radio-volume-desktop"), {
      target: { value: "0.7" },
    });

    fireEvent.click(mute());
    // Unmuting is also a request to hear it again, so let that start settle.
    fireEvent.click(mute());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(getRadioSnapshot().muted).toBe(false);
    expect(getRadioSnapshot().volume).toBeCloseTo(0.7, 5);
  });
});

describe("Academy Radio controls — desktop and mobile share one transport", () => {
  it("a mobile mute is visible to the desktop row", () => {
    render(<AcademyRadioControls />);
    render(<AcademyRadioControls variant="mobile" />);

    fireEvent.click(screen.getByTestId("academy-radio-mobile-trigger"));
    fireEvent.click(mute("mobile"));

    expect(getRadioSnapshot().muted).toBe(true);
    expect(mute()).toHaveAttribute("aria-pressed", "true");
  });

  it("the mobile trigger names the radio and its current status", () => {
    render(<AcademyRadioControls variant="mobile" />);

    const trigger = screen.getByTestId("academy-radio-mobile-trigger");
    expect(trigger).toHaveAccessibleName("Academy Radio — Ready");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("academy-radio-panel-mobile")).toBeTruthy();
  });
});

describe("Academy Radio controls — route changes", () => {
  it("a remount does not reset the player or stack a second element", async () => {
    const first = render(<AcademyRadioControls />);
    fireEvent.click(playPause());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));
    const creationsWhilePlaying = audioCreations;

    // Navigating away and back unmounts and remounts the navbar.
    first.unmount();
    render(<AcademyRadioControls />);

    expect(playPause()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("academy-radio-title")).toHaveTextContent("Tidecaller");
    expect(audioCreations).toBe(creationsWhilePlaying);
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("Academy Radio controls — accessibility", () => {
  it("exposes every control as a named, keyboard-reachable button", () => {
    render(<AcademyRadioControls />);
    fireEvent.click(screen.getByTestId("academy-radio-title"));

    for (const control of [playPause(), mute(), next()]) {
      expect(control.tagName).toBe("BUTTON");
      expect(control).toHaveAccessibleName();
      expect(control).not.toHaveAttribute("tabindex", "-1");
    }
    expect(screen.getByTestId("academy-radio-volume-desktop")).toHaveAccessibleName(
      "Music volume",
    );
  });

  it("opens and closes the panel from the keyboard", () => {
    render(<AcademyRadioControls />);
    const trigger = screen.getByTestId("academy-radio-title");

    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", "academy-radio-panel-desktop");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("announces the track once it is genuinely audible", async () => {
    const { container } = render(<AcademyRadioControls />);
    const live = container.querySelector('[aria-live="polite"]')!;
    expect(live).toHaveTextContent("");

    fireEvent.click(playPause());

    await waitFor(() =>
      expect(live).toHaveTextContent("Academy Radio now playing: Tidecaller"),
    );
  });

  it("animates the playing indicator only when motion is welcome", async () => {
    const { container } = render(<AcademyRadioControls />);
    fireEvent.click(playPause());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("holds the indicator still under reduced motion, keeping the text state", async () => {
    mocks.reducedMotion = true;
    const { container } = render(<AcademyRadioControls />);
    fireEvent.click(playPause());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    // The state is still readable without any animation at all.
    expect(playPause()).toHaveAccessibleName("Pause Academy Radio");
  });
});
