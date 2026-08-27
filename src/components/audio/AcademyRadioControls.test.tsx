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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import AcademyRadioControls from "./AcademyRadioControls";
import {
  DEFAULT_MUSIC_VOLUME,
  getRadioSnapshot,
  playRadio,
  RADIO_STORAGE_KEYS,
  resetRadioForTests,
  setRadioMuted,
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

const tune = (variant = "desktop") =>
  screen.getByTestId(`academy-radio-tune-${variant}`);
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

    expect(tune()).toHaveAttribute("aria-pressed", "false");
    expect(tune()).toHaveAccessibleName("Tune in to Academy Radio");
  });

  it("reflects real playback state once play() resolves", async () => {
    render(<AcademyRadioControls />);

    fireEvent.click(tune());

    await waitFor(() => expect(tune()).toHaveAttribute("aria-pressed", "true"));
    expect(tune()).toHaveAccessibleName("Mute Academy Radio");
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });

  it("does not flip to playing when the browser refuses playback", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<AcademyRadioControls />);

    fireEvent.click(tune());

    await waitFor(() => expect(getRadioSnapshot().status).toBe("blocked"));
    expect(tune()).toHaveAttribute("aria-pressed", "false");
  });

  it("mutes without pausing the live station", async () => {
    render(<AcademyRadioControls />);
    fireEvent.click(tune());
    await waitFor(() => expect(tune()).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(tune());

    expect(tune()).toHaveAttribute("aria-pressed", "false");
    expect(getRadioSnapshot()).toMatchObject({ status: "playing", muted: true, isAudible: false });
  });
});

describe("Academy Radio controls — Tune In/Mute", () => {
  it("uses one action and exposes no Radio pause control", async () => {
    render(<AcademyRadioControls />);
    fireEvent.click(tune());
    await waitFor(() => expect(tune()).toHaveAccessibleName("Mute Academy Radio"));
    fireEvent.click(tune());
    expect(tune()).toHaveAccessibleName("Tune in to Academy Radio");
    expect(getRadioSnapshot().muted).toBe(true);
    expect(screen.queryByLabelText(/Pause Academy Radio/i)).toBeNull();
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

    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));
    fireEvent.click(tune());
    // Unmuting is also a request to hear it again, so let that start settle.
    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(getRadioSnapshot().muted).toBe(false);
    expect(getRadioSnapshot().volume).toBeCloseTo(0.7, 5);
  });
});

describe("Academy Radio controls — desktop and mobile share one transport", () => {
  it("a mobile Mute is visible to the desktop row", async () => {
    render(<AcademyRadioControls />);
    render(<AcademyRadioControls variant="mobile" />);

    fireEvent.click(screen.getByTestId("academy-radio-mobile-trigger"));
    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));
    fireEvent.click(tune("mobile"));

    expect(getRadioSnapshot().muted).toBe(true);
    expect(tune()).toHaveAttribute("aria-pressed", "false");
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

/**
 * The HUD notice is a small, temporary nudge hanging under the top-right Radio
 * control — not a fixture of the bar. These specs pin where it sits, that its
 * copy is only the two approved strings, and that it goes away for good once
 * the visitor has answered it either way.
 */
describe("Academy Radio controls — HUD notice", () => {
  const notice = () => screen.getByTestId("academy-radio-hud-prompt");
  const trigger = () => screen.getByTestId("academy-radio-hud-trigger");

  it("hangs directly below the Radio control rather than inside the bar", () => {
    render(<AcademyRadioControls variant="hud" />);

    // Same anchor box as the control, and after it in the DOM: the notice is
    // positioned off the trigger, not laid out beside it in the HUD cluster.
    expect(notice().parentElement).toBe(trigger().parentElement);
    expect(
      trigger().compareDocumentPosition(notice()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(notice()).toHaveClass("absolute", "top-full", "right-0");
  });

  it("is sized by its copy — no fixed box, so it can shift nothing", () => {
    render(<AcademyRadioControls variant="hud" />);

    expect(notice()).toHaveClass("w-fit", "whitespace-nowrap");
    expect(notice()).not.toHaveClass("w-36");
    expect(notice()).not.toHaveClass("h-8");
  });

  it("rotates only the two approved strings while the radio is still silent", () => {
    vi.useFakeTimers();
    render(<AcademyRadioControls variant="hud" />);

    expect(notice().textContent).toBe("Turn on the Radio!");
    act(() => vi.advanceTimersByTime(7000));
    expect(notice().textContent).toBe("See what's playing!");
    act(() => vi.advanceTimersByTime(7000));
    expect(notice().textContent).toBe("Turn on the Radio!");

    expect(notice()).not.toHaveTextContent(/Tune In to listen/i);
    expect(screen.queryByText(/Tune In to listen/i)).toBeNull();
    vi.useRealTimers();
  });

  it("holds the notice still under reduced motion", () => {
    mocks.reducedMotion = true;
    vi.useFakeTimers();
    render(<AcademyRadioControls variant="hud" />);

    expect(notice().textContent).toBe("Turn on the Radio!");
    act(() => vi.advanceTimersByTime(21_000));

    expect(notice().textContent).toBe("Turn on the Radio!");
    expect(screen.getByTestId("academy-radio-hud-prompt")).toBeTruthy();
    vi.useRealTimers();
  });

  it("dismisses when the notice itself is clicked", () => {
    render(<AcademyRadioControls variant="hud" />);

    fireEvent.click(notice());

    expect(screen.queryByTestId("academy-radio-hud-prompt")).toBeNull();
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.noticeSeen)).toBe("true");
  });

  it("dismisses when the Radio control is used instead", () => {
    render(<AcademyRadioControls variant="hud" />);

    fireEvent.click(trigger());

    expect(screen.queryByTestId("academy-radio-hud-prompt")).toBeNull();
    expect(localStorage.getItem(RADIO_STORAGE_KEYS.noticeSeen)).toBe("true");
    // The control still does its own job.
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("stays dismissed on the next mount", () => {
    const first = render(<AcademyRadioControls variant="hud" />);
    fireEvent.click(notice());
    first.unmount();

    render(<AcademyRadioControls variant="hud" />);

    expect(screen.queryByTestId("academy-radio-hud-prompt")).toBeNull();
  });

  it("drops the invitation once the radio is actually audible", async () => {
    render(<AcademyRadioControls variant="hud" />);
    expect(notice().textContent).toBe("Turn on the Radio!");

    await act(async () => { await playRadio(); });

    // Nothing to turn on any more — discovery is all that is left to offer.
    expect(getRadioSnapshot().isAudible).toBe(true);
    expect(notice().textContent).toBe("See what's playing!");
  });

  it("does not rotate the invitation back in once audible", async () => {
    render(<AcademyRadioControls variant="hud" />);
    await act(async () => { await playRadio(); });

    // Fake timers only for the rotation window, so nothing async runs under them.
    vi.useFakeTimers();
    act(() => vi.advanceTimersByTime(21_000));
    vi.useRealTimers();

    expect(notice().textContent).toBe("See what's playing!");
  });

  it("does not nag a visitor who muted the radio themselves", async () => {
    render(<AcademyRadioControls variant="hud" />);
    await act(async () => { await playRadio(); });

    act(() => setRadioMuted(true));

    expect(getRadioSnapshot().muteReason).toBe("manual");
    expect(notice().textContent).toBe("See what's playing!");
  });

  it("keeps the invitation while startup has not succeeded yet", async () => {
    // Autoplay refused: the station has never sounded, so turning it on really
    // is the next step and the invitation is still the honest copy.
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<AcademyRadioControls variant="hud" />);

    await act(async () => { await playRadio(); });

    expect(getRadioSnapshot().status).toBe("blocked");
    expect(notice().textContent).toBe("Turn on the Radio!");
  });

  it("is never a toast and never announces itself", () => {
    const { baseElement } = render(<AcademyRadioControls variant="hud" />);

    expect(baseElement.querySelector('[role="status"], [role="alert"]')).toBeNull();
    expect(notice()).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByLabelText(/Pause Academy Radio/i)).toBeNull();
  });
});

describe("Academy Radio controls — route changes", () => {
  it("a remount does not reset the player or stack a second element", async () => {
    const first = render(<AcademyRadioControls />);
    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));
    const creationsWhilePlaying = audioCreations;

    // Navigating away and back unmounts and remounts the navbar.
    first.unmount();
    render(<AcademyRadioControls />);

    expect(tune()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("academy-radio-title")).toHaveTextContent("Tidecaller");
    expect(audioCreations).toBe(creationsWhilePlaying);
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("Academy Radio controls — accessibility", () => {
  it("exposes every control as a named, keyboard-reachable button", () => {
    render(<AcademyRadioControls />);
    fireEvent.click(screen.getByTestId("academy-radio-title"));

    for (const control of [tune(), next()]) {
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

    fireEvent.click(tune());

    await waitFor(() =>
      expect(live).toHaveTextContent("Academy Radio now playing: Tidecaller"),
    );
  });

  it("animates the playing indicator only when motion is welcome", async () => {
    const { container } = render(<AcademyRadioControls />);
    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("holds the indicator still under reduced motion, keeping the text state", async () => {
    mocks.reducedMotion = true;
    const { container } = render(<AcademyRadioControls />);
    fireEvent.click(tune());
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    // The state is still readable without any animation at all.
    expect(tune()).toHaveAccessibleName("Mute Academy Radio");
  });
});
