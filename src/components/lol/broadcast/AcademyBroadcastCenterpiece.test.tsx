/**
 * Academy Broadcast centerpiece — the magic-book surface with the radio dock
 * at its base.
 *
 * Checked here: the placeholder transmission is intentional finished content,
 * the dock sits BELOW the broadcast surface in DOM order, the surface's energy
 * state follows real playback (never optimism), every feed state renders, and
 * composing the centerpiece never creates audio elements or toasts. The dock's
 * own transport behaviour is specified in AcademyRadioDock.test.tsx.
 *
 * jsdom implements none of HTMLMediaElement's playback and Node 25's global
 * `localStorage` has no methods, so both are stubbed locally in this file only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AcademyBroadcastCenterpiece from "./AcademyBroadcastCenterpiece";
import AcademyBroadcastSurface from "./AcademyBroadcastSurface";
import {
  PLACEHOLDER_TRANSMISSION,
  type BroadcastFeed,
} from "./broadcast-content";
import AcademyRadioControls from "@/components/audio/AcademyRadioControls";
import { getRadioSnapshot, resetRadioForTests } from "@/lib/audio/academy-radio";

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

describe("Academy Broadcast centerpiece — composition", () => {
  it("renders the placeholder transmission as finished, honest content", () => {
    render(<AcademyBroadcastCenterpiece />);

    const surface = screen.getByTestId("academy-broadcast-surface");
    expect(surface).toHaveTextContent("Academy Broadcast");
    expect(surface).toHaveTextContent("Transmission systems online");
    expect(surface).toHaveTextContent(
      "Academy updates will appear here when new transmissions begin.",
    );
    // The one honest transmission never fakes a date, action, or pager.
    expect(surface.querySelector("a")).toBeNull();
  });

  it("places the radio dock BELOW the broadcast surface in DOM order", () => {
    render(<AcademyBroadcastCenterpiece />);

    const surface = screen.getByTestId("academy-broadcast-surface");
    const dock = screen.getByTestId("academy-radio-dock");
    expect(
      surface.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // And the dock never renders inside the broadcast content area.
    expect(surface.contains(dock)).toBe(false);
  });

  it("shows the current track and state in the dock", () => {
    render(<AcademyBroadcastCenterpiece />);

    const dock = screen.getByTestId("academy-radio-dock");
    expect(dock).toHaveTextContent("Tidecaller");
    expect(dock).toHaveTextContent(/Ready/);
  });

  it("does not create an audio element, play anything, or toast merely by rendering", () => {
    const { baseElement } = render(
      <>
        <AcademyBroadcastCenterpiece variant="desktop" />
        <AcademyBroadcastCenterpiece variant="mobile" />
      </>,
    );

    expect(audioCreations).toBe(0);
    expect(play).not.toHaveBeenCalled();
    expect(baseElement.querySelector('[role="status"], [role="alert"]')).toBeNull();
  });

  it("the mobile variant renders its own stacked surface and dock", () => {
    render(<AcademyBroadcastCenterpiece variant="mobile" />);

    expect(screen.getByTestId("academy-broadcast-centerpiece-mobile")).toBeTruthy();
    expect(screen.getByTestId("academy-broadcast-surface-mobile")).toBeTruthy();
    expect(screen.getByTestId("academy-radio-dock-mobile")).toBeTruthy();
  });
});

describe("Academy Broadcast centerpiece — energy follows real playback", () => {
  it("energizes the tome only once play() has actually resolved", async () => {
    render(
      <>
        <AcademyBroadcastCenterpiece />
        <AcademyRadioControls />
      </>,
    );

    const surface = screen.getByTestId("academy-broadcast-surface");
    expect(surface).toHaveAttribute("data-energized", "false");

    fireEvent.click(screen.getByTestId("academy-radio-playpause-dock"));
    await waitFor(() => expect(surface).toHaveAttribute("data-energized", "true"));

    // One element serves the dock, the navbar and the entrance alike.
    expect(audioCreations).toBe(1);
    expect(screen.getByTestId("academy-radio-playpause-desktop")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("pulses while transmitting, but holds still under reduced motion", async () => {
    mocks.reducedMotion = true;
    const { container } = render(<AcademyBroadcastCenterpiece />);

    fireEvent.click(screen.getByTestId("academy-radio-playpause-dock"));
    await waitFor(() => expect(getRadioSnapshot().isPlaying).toBe(true));

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    // The energized state survives without any animation at all.
    expect(screen.getByTestId("academy-broadcast-surface")).toHaveAttribute(
      "data-energized",
      "true",
    );
  });
});

describe("Academy Broadcast surface — every feed state is a finished visual", () => {
  const renderSurface = (feed: BroadcastFeed) =>
    render(
      <MemoryRouter>
        <AcademyBroadcastSurface feed={feed} />
      </MemoryRouter>,
    );

  it("loading", () => {
    renderSurface({ status: "loading" });
    expect(screen.getByTestId("academy-broadcast-surface")).toHaveTextContent(
      "Receiving transmission…",
    );
  });

  it("empty", () => {
    renderSurface({ status: "empty" });
    expect(screen.getByTestId("academy-broadcast-surface")).toHaveTextContent(
      "No transmissions right now",
    );
  });

  it("unavailable", () => {
    renderSurface({ status: "unavailable" });
    expect(screen.getByTestId("academy-broadcast-surface")).toHaveTextContent(
      "Broadcast unavailable",
    );
  });

  it("a future multi-transmission feed gets actions, a timestamp and a pager", () => {
    renderSurface({
      status: "ready",
      transmissions: [
        {
          ...PLACEHOLDER_TRANSMISSION,
          id: "one",
          headline: "First transmission",
          timestamp: "Patch cycle",
          primaryAction: { label: "Open", to: "/lol/patch-reports" },
          secondaryAction: { label: "Later", to: "/lol" },
        },
        { ...PLACEHOLDER_TRANSMISSION, id: "two", headline: "Second transmission" },
      ],
      index: 0,
    });

    const surface = screen.getByTestId("academy-broadcast-surface");
    expect(surface).toHaveTextContent("First transmission");
    expect(surface).toHaveTextContent("Patch cycle");
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/lol/patch-reports",
    );
    expect(screen.getByRole("link", { name: "Later" })).toBeTruthy();
  });
});
