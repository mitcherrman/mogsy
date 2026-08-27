/**
 * Academy Radio — broadcast dock.
 *
 * Like the navbar player specs, these drive the REAL store rather than a mock:
 * the dock is a view over the shared transport, so what is checked is that it
 * reports the truth, that it moves the same state the navbar player reads,
 * and that rendering it never creates audio elements or toasts.
 *
 * jsdom implements none of HTMLMediaElement's playback and Node 25's global
 * `localStorage` has no methods, so both are stubbed locally in this file only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import AcademyRadioDock from "./AcademyRadioDock";
import AcademyRadioControls from "./AcademyRadioControls";
import {
  getRadioSnapshot,
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

const tune = (suffix = "dock") => screen.getByTestId(`academy-radio-tune-${suffix}`);
/** lucide stamps every icon with `lucide-<kebab-name>`, so the glyph is assertable. */
const glyph = (el: HTMLElement) => el.querySelector("svg")?.getAttribute("class") ?? "";
const next = (suffix = "dock") => screen.getByTestId(`academy-radio-next-${suffix}`);
const volume = (suffix = "dock") =>
  screen.getByTestId(`academy-radio-volume-${suffix}`) as HTMLInputElement;

describe("Academy Radio dock — what it shows", () => {
  it("names the current track and its state", () => {
    render(<AcademyRadioDock />);

    expect(screen.getByRole("group", { name: "Academy Radio" })).toBeTruthy();
    expect(screen.getByTestId("academy-radio-dock")).toHaveTextContent("Tidecaller");
    expect(screen.getByTestId("academy-radio-dock")).toHaveTextContent(/Ready/);
  });

  it("does not create an audio element, play anything, or toast merely by rendering", () => {
    const { baseElement } = render(
      <>
        <AcademyRadioDock variant="desktop" />
        <AcademyRadioDock variant="mobile" />
      </>,
    );

    expect(audioCreations).toBe(0);
    expect(play).not.toHaveBeenCalled();
    expect(baseElement.querySelector('[role="status"], [role="alert"]')).toBeNull();
  });

  it("reflects real playback state once play() resolves — never optimistically", async () => {
    render(<AcademyRadioDock />);

    expect(tune()).toHaveAccessibleName("Play music");
    fireEvent.click(tune());

    await waitFor(() => expect(tune()).toHaveAccessibleName("Pause music"));
    expect(screen.getByTestId("academy-radio-dock")).toHaveTextContent(/Live/);
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });

  it("shows the blocked state without claiming playback when the browser refuses", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<AcademyRadioDock />);

    fireEvent.click(tune());

    await waitFor(() => expect(getRadioSnapshot().status).toBe("blocked"));
    expect(tune()).toHaveAccessibleName("Play music");
    expect(screen.getByTestId("academy-radio-dock")).toHaveTextContent(/Tune in to listen/);
  });

  it("carries no native tooltips over the deck — accessible names only", () => {
    render(<AcademyRadioDock />);

    for (const control of [tune(), next()]) {
      expect(control).not.toHaveAttribute("title");
      expect(control).toHaveAccessibleName();
    }
  });
});

describe("Academy Radio dock — transport behaviour", () => {
  it("Play is an explicit request to hear the radio: it also lifts a mute", async () => {
    render(<AcademyRadioDock />);
    toggleRadioMute();
    expect(getRadioSnapshot().muted).toBe(true);

    fireEvent.click(tune());

    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));
    expect(getRadioSnapshot().muted).toBe(false);
    expect(tune()).toHaveAccessibleName("Pause music");
  });

  it("Pause leaves the live transport running and unrelated gestures do not resume it", async () => {
    render(<AcademyRadioDock />);
    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    fireEvent.click(tune());
    expect(getRadioSnapshot()).toMatchObject({ status: "playing", muted: true, isAudible: false });
    play.mockClear();
    expect(play).not.toHaveBeenCalled();
    expect(getRadioSnapshot().muteReason).toBe("manual");
  });

  it("persists the paused and volume choices under the canonical storage keys", async () => {
    render(<AcademyRadioDock />);

    fireEvent.change(volume(), { target: { value: "0.42" } });
    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));
    fireEvent.click(tune());

    expect(localStorage.getItem(RADIO_STORAGE_KEYS.volume)).toBe("0.42");
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.muted)).toBe("true");
    expect(getRadioSnapshot().volume).toBeCloseTo(0.42, 5);
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("keeps Next disabled with one track, subdued but explained accessibly", () => {
    render(<AcademyRadioDock />);

    expect(next()).toBeDisabled();
    const describedBy = next().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Only one track is available right now.",
    );
  });
});

describe("Academy Radio dock — one transport across every surface", () => {
  it("the dock, its mobile variant and the navbar player all move together", async () => {
    render(
      <>
        <AcademyRadioDock variant="desktop" />
        <AcademyRadioDock variant="mobile" />
        <AcademyRadioControls />
      </>,
    );

    fireEvent.click(tune("dock"));
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    // Exactly one element serves all three surfaces.
    expect(audioCreations).toBe(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(tune("dock-mobile")).toHaveAccessibleName("Pause music");
    expect(screen.getByTestId("academy-radio-tune-desktop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(tune("dock-mobile"));
    expect(tune("dock")).toHaveAccessibleName("Play music");
    expect(screen.getByTestId("academy-radio-tune-desktop")).toHaveAttribute("aria-pressed", "false");
  });

  it("a volume change on the mobile dock is the desktop dock's volume too", () => {
    render(
      <>
        <AcademyRadioDock variant="desktop" />
        <AcademyRadioDock variant="mobile" />
      </>,
    );

    fireEvent.change(volume("dock-mobile"), { target: { value: "0.6" } });

    expect(Number(volume("dock").value)).toBeCloseTo(0.6, 5);
    expect(getRadioSnapshot().volume).toBeCloseTo(0.6, 5);
  });
});

describe("Academy Radio dock — accessibility", () => {
  it("exposes every control as a named, keyboard-reachable button", () => {
    render(<AcademyRadioDock />);

    for (const control of [tune(), next()]) {
      expect(control.tagName).toBe("BUTTON");
      expect(control).toHaveAccessibleName();
      expect(control).not.toHaveAttribute("tabindex", "-1");
    }
    expect(volume()).toHaveAccessibleName("Music volume");
  });

  it("animates the spectrum only when motion is welcome", async () => {
    const { container } = render(<AcademyRadioDock />);
    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("holds every indicator still under reduced motion, keeping the text state", async () => {
    mocks.reducedMotion = true;
    const { container } = render(<AcademyRadioDock />);
    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(tune()).toHaveAccessibleName("Pause music");
    expect(screen.getByTestId("academy-radio-dock")).toHaveTextContent(/Live/);
  });
});

/**
 * The League Hub control is deliberately the simplest thing in the dock: a
 * Play triangle, a Pause bar, and one action behind them. These specs pin both
 * the glyph and the vocabulary, so neither a broadcast mark nor tune/mute
 * wording can drift back in.
 */
describe("Academy Radio dock — League Hub Play/Pause", () => {
  it("shows an ordinary Play triangle while music is not playing", () => {
    render(<AcademyRadioDock />);

    expect(glyph(tune())).toContain("lucide-play");
    expect(glyph(tune())).not.toContain("lucide-pause");
    expect(tune()).toHaveAccessibleName("Play music");
  });

  it("shows an ordinary Pause while music is playing", async () => {
    render(<AcademyRadioDock />);

    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(glyph(tune())).toContain("lucide-pause");
    expect(glyph(tune())).not.toContain("lucide-play");
    expect(tune()).toHaveAccessibleName("Pause music");
  });

  it("toggles music with each press, and does nothing else", async () => {
    render(<AcademyRadioDock />);

    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isAudible).toBe(true));

    fireEvent.click(tune());
    expect(getRadioSnapshot().isAudible).toBe(false);
    expect(glyph(tune())).toContain("lucide-play");

    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isAudible).toBe(true));
    expect(glyph(tune())).toContain("lucide-pause");
  });

  it("carries no broadcast mark and no Tune In or Mute vocabulary", async () => {
    render(<AcademyRadioDock />);

    const marks = () => glyph(tune());
    expect(marks()).not.toContain("lucide-radio");
    expect(marks()).not.toContain("lucide-volume-x");
    expect(screen.queryByRole("button", { name: /tune in|mute/i })).toBeNull();

    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(marks()).not.toContain("lucide-radio");
    expect(marks()).not.toContain("lucide-volume-x");
    expect(screen.queryByRole("button", { name: /tune in|mute/i })).toBeNull();
  });

  it("leaves the volume row and the rest of the deck in place", () => {
    render(<AcademyRadioDock />);

    expect(volume()).toHaveAccessibleName("Music volume");
    expect(next()).toBeTruthy();
    expect(screen.getByTestId("academy-radio-dock")).toHaveTextContent("Tidecaller");
  });
});
