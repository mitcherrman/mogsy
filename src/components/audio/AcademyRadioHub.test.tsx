/**
 * Academy Radio — hub broadcast console.
 *
 * Like the navbar player specs, these drive the REAL store rather than a mock:
 * the console and bar layouts are views over the shared transport, so what is
 * checked is that they report the truth, that they move the same state the
 * navbar player reads, and that rendering them never creates audio elements
 * or toasts.
 *
 * jsdom implements none of HTMLMediaElement's playback and Node 25's global
 * `localStorage` has no methods, so both are stubbed locally in this file only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import AcademyRadioHub from "./AcademyRadioHub";
import AcademyRadioControls from "./AcademyRadioControls";
import {
  getRadioSnapshot,
  installFirstGestureUnlock,
  RADIO_STORAGE_KEYS,
  resetRadioForTests,
  toggleRadioMute,
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

const playPause = (suffix = "hub") => screen.getByTestId(`academy-radio-playpause-${suffix}`);
const mute = (suffix = "hub") => screen.getByTestId(`academy-radio-mute-${suffix}`);
const next = (suffix = "hub") => screen.getByTestId(`academy-radio-next-${suffix}`);
const volume = (suffix = "hub") =>
  screen.getByTestId(`academy-radio-volume-${suffix}`) as HTMLInputElement;

describe("Academy Radio hub console — what it shows", () => {
  it("names the station, the current track and its state", () => {
    render(<AcademyRadioHub />);

    expect(screen.getByRole("group", { name: "Academy Radio" })).toBeTruthy();
    expect(screen.getByTestId("academy-radio-hub")).toHaveTextContent("Tidecaller");
    expect(screen.getByTestId("academy-radio-hub")).toHaveTextContent(/Ready/);
  });

  it("does not create an audio element, play anything, or toast merely by rendering", () => {
    const { baseElement } = render(
      <>
        <AcademyRadioHub layout="console" />
        <AcademyRadioHub layout="bar" />
      </>,
    );

    expect(audioCreations).toBe(0);
    expect(play).not.toHaveBeenCalled();
    expect(baseElement.querySelector('[role="status"], [role="alert"]')).toBeNull();
  });

  it("reflects real playback state once play() resolves — never optimistically", async () => {
    render(<AcademyRadioHub />);

    expect(playPause()).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(playPause());

    await waitFor(() => expect(playPause()).toHaveAttribute("aria-pressed", "true"));
    expect(playPause()).toHaveAccessibleName("Pause Academy Radio");
    expect(screen.getByTestId("academy-radio-hub")).toHaveTextContent(/Playing/);
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });

  it("shows the blocked state without claiming playback when the browser refuses", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<AcademyRadioHub />);

    fireEvent.click(playPause());

    await waitFor(() => expect(getRadioSnapshot().status).toBe("blocked"));
    expect(playPause()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("academy-radio-hub")).toHaveTextContent(/Press play to start/);
  });
});

describe("Academy Radio hub console — transport behaviour", () => {
  it("Play is an explicit request to hear the radio: it also lifts a mute", async () => {
    render(<AcademyRadioHub />);
    toggleRadioMute();
    expect(getRadioSnapshot().muted).toBe(true);

    fireEvent.click(playPause());

    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));
    expect(getRadioSnapshot().muted).toBe(false);
    expect(mute()).toHaveAttribute("aria-pressed", "false");
  });

  it("an explicit Pause blocks unrelated gesture auto-resume for the session", async () => {
    render(
      <>
        <AcademyRadioHub />
        <button type="button">Open a book</button>
      </>,
    );
    fireEvent.click(playPause());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    fireEvent.click(playPause());
    expect(getRadioSnapshot().status).toBe("paused");
    play.mockClear();

    installFirstGestureUnlock();
    fireEvent.click(screen.getByRole("button", { name: "Open a book" }));

    expect(play).not.toHaveBeenCalled();
    expect(getRadioSnapshot().status).toBe("paused");
  });

  it("persists mute and volume choices under the canonical storage keys", () => {
    render(<AcademyRadioHub />);

    fireEvent.change(volume(), { target: { value: "0.42" } });
    fireEvent.click(mute());

    expect(localStorage.getItem(RADIO_STORAGE_KEYS.volume)).toBe("0.42");
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.muted)).toBe("true");
    expect(getRadioSnapshot().volume).toBeCloseTo(0.42, 5);
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("keeps Next disabled with one track and explains why accessibly", () => {
    render(<AcademyRadioHub />);

    expect(next()).toBeDisabled();
    const describedBy = next().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Only one track is available right now.",
    );
  });
});

describe("Academy Radio hub — one transport across every surface", () => {
  it("the console, the bar and the navbar player all move together", async () => {
    render(
      <>
        <AcademyRadioHub layout="console" />
        <AcademyRadioHub layout="bar" />
        <AcademyRadioControls />
      </>,
    );

    fireEvent.click(playPause("hub"));
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    // Exactly one element serves all three surfaces.
    expect(audioCreations).toBe(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(playPause("hub-bar")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("academy-radio-playpause-desktop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(mute("hub-bar"));
    expect(mute("hub")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("academy-radio-mute-desktop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("a volume change on the bar is the console's volume too", () => {
    render(
      <>
        <AcademyRadioHub layout="console" />
        <AcademyRadioHub layout="bar" />
      </>,
    );

    fireEvent.change(volume("hub-bar"), { target: { value: "0.6" } });

    expect(Number(volume("hub").value)).toBeCloseTo(0.6, 5);
    expect(getRadioSnapshot().volume).toBeCloseTo(0.6, 5);
  });
});

describe("Academy Radio hub — accessibility", () => {
  it("exposes every control as a named, keyboard-reachable button", () => {
    render(<AcademyRadioHub />);

    for (const control of [playPause(), mute(), next()]) {
      expect(control.tagName).toBe("BUTTON");
      expect(control).toHaveAccessibleName();
      expect(control).not.toHaveAttribute("tabindex", "-1");
    }
    expect(volume()).toHaveAccessibleName("Music volume");
  });

  it("animates the spectrum only when motion is welcome", async () => {
    const { container } = render(<AcademyRadioHub />);
    fireEvent.click(playPause());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("holds every indicator still under reduced motion, keeping the text state", async () => {
    mocks.reducedMotion = true;
    const { container } = render(<AcademyRadioHub />);
    fireEvent.click(playPause());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(playPause()).toHaveAccessibleName("Pause Academy Radio");
    expect(screen.getByTestId("academy-radio-hub")).toHaveTextContent(/Playing/);
  });
});
