/**
 * First meaningful interaction.
 *
 * A direct /lol visit or a hard refresh loads silent. Exactly one centralized
 * listener pair waits for a real application action and starts the radio from
 * it — feature components stay ignorant of the music. What must NOT wake it is
 * the point of most of this file: pointer movement, hover, scroll, resize,
 * focus, visibility changes, synthetic events, and clicks on scenery.
 *
 * jsdom implements none of HTMLMediaElement's playback, and Node 25's global
 * `localStorage` has no methods when `--localstorage-file` is pathless, so both
 * are stubbed locally in this file only — the shared setup is left alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import {
  RADIO_STORAGE_KEYS,
  getRadioSnapshot,
  installFirstGestureUnlock,
  isFirstGestureUnlockArmed,
  pauseRadio,
  playRadio,
  prepareRadio,
  resetRadioForTests,
  setRadioMuted,
  startRadio,
} from "./academy-radio";

// The radio deliberately shows no playback notification. The mock is kept as a
// tripwire so a reintroduced toast fails the "playback notifications" specs
// below rather than quietly reappearing in front of visitors.
vi.mock("sonner", () => ({ toast: vi.fn() }));

const toastMock = vi.mocked(toast);

/* -------------------------------------------------------------------------- */
/* Local stubs                                                                */
/* -------------------------------------------------------------------------- */

const nativeLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const nativePlay = HTMLMediaElement.prototype.play;
const nativePause = HTMLMediaElement.prototype.pause;
const nativeLoad = HTMLMediaElement.prototype.load;
const nativePausedDescriptor = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "paused",
);

let paused = true;
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

/** Flushes every queued microtask, so an in-flight start has settled. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * jsdom marks every constructed event untrusted and `isTrusted` is a
 * non-configurable own accessor, so trust cannot be forged here — which is
 * exactly why the store does not gate on it. The browser is the only authority
 * on whether an event was a real gesture: an untrusted click cannot satisfy the
 * autoplay policy, so play() is refused, and the store treats a refusal as a
 * silent non-event that leaves the listener armed (see the "refused" spec
 * below). What is asserted here is the part the app owns — which *kinds* of
 * interaction are even looked at, and which targets count.
 */
function dispatchOn(target: EventTarget, event: Event) {
  target.dispatchEvent(event);
}

function click(target: EventTarget) {
  dispatchOn(target, new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  dispatchOn(
    target,
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

function mount<T extends HTMLElement>(element: T): T {
  document.body.appendChild(element);
  return element;
}

function aButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Leaguecraft book";
  return mount(button);
}

beforeEach(() => {
  installLocalStorageStub();
  resetRadioForTests();
  toastMock.mockClear();
  document.body.innerHTML = "";

  paused = true;
  play = vi.fn(async () => {
    paused = false;
  });

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
  resetRadioForTests();
  document.body.innerHTML = "";
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

describe("first meaningful interaction — the silent load", () => {
  it("plays nothing on a direct /lol render, only arms the listener", () => {
    prepareRadio();
    installFirstGestureUnlock();

    expect(play).not.toHaveBeenCalled();
    expect(getRadioSnapshot().isPlaying).toBe(false);
    expect(isFirstGestureUnlockArmed()).toBe(true);
  });

  it("arms exactly one listener pair however many times it is installed", async () => {
    prepareRadio();
    installFirstGestureUnlock();
    installFirstGestureUnlock();
    installFirstGestureUnlock();

    click(aButton());
    await flush();

    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("first meaningful interaction — what starts the radio", () => {
  it("starts from a click on a real interactive control", async () => {
    prepareRadio();
    installFirstGestureUnlock();

    click(aButton());
    await flush();

    expect(play).toHaveBeenCalledTimes(1);
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });

  it("starts from Enter on a real interactive control", async () => {
    prepareRadio();
    installFirstGestureUnlock();

    press(aButton(), "Enter");
    await flush();

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("starts from Space on a real interactive control", async () => {
    prepareRadio();
    installFirstGestureUnlock();

    press(aButton(), " ");
    await flush();

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("starts from a link, the way a navigation control would", async () => {
    prepareRadio();
    installFirstGestureUnlock();

    const link = mount(document.createElement("a"));
    // A hash target: jsdom implements no other navigation, and the point here
    // is the anchor being a control, not where it goes.
    link.href = "#quiz";
    click(link);
    await flush();

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("removes its listeners once an attempt has been handled", async () => {
    prepareRadio();
    installFirstGestureUnlock();

    click(aButton());
    await flush();
    expect(isFirstGestureUnlockArmed()).toBe(false);

    click(aButton());
    await flush();
    expect(play).toHaveBeenCalledTimes(1);
  });
});

describe("first meaningful interaction — what must never start the radio", () => {
  beforeEach(() => {
    prepareRadio();
    installFirstGestureUnlock();
  });

  it("ignores pointer movement", async () => {
    dispatchOn(aButton(), new MouseEvent("pointermove", { bubbles: true }));
    dispatchOn(window, new MouseEvent("mousemove", { bubbles: true }));
    await flush();

    expect(play).not.toHaveBeenCalled();
    expect(isFirstGestureUnlockArmed()).toBe(true);
  });

  it("ignores hover", async () => {
    const button = aButton();
    dispatchOn(button, new MouseEvent("mouseover", { bubbles: true }));
    dispatchOn(button, new MouseEvent("mouseenter", { bubbles: true }));
    await flush();

    expect(play).not.toHaveBeenCalled();
  });

  it("ignores scrolling and passive touch movement", async () => {
    dispatchOn(document, new Event("scroll", { bubbles: true }));
    dispatchOn(aButton(), new Event("touchmove", { bubbles: true }));
    await flush();

    expect(play).not.toHaveBeenCalled();
  });

  it("ignores resize, focus and visibility changes", async () => {
    dispatchOn(window, new Event("resize"));
    dispatchOn(aButton(), new Event("focus", { bubbles: true }));
    dispatchOn(aButton(), new Event("focusin", { bubbles: true }));
    dispatchOn(document, new Event("visibilitychange"));
    await flush();

    expect(play).not.toHaveBeenCalled();
    expect(isFirstGestureUnlockArmed()).toBe(true);
  });

  it("ignores clicks on scenery rather than on a control", async () => {
    const art = mount(document.createElement("div"));
    art.className = "academy-backdrop";
    click(art);
    await flush();

    expect(play).not.toHaveBeenCalled();
  });

  it("ignores typing a space into a text field", async () => {
    const input = mount(document.createElement("input"));
    press(input, " ");
    await flush();

    expect(play).not.toHaveBeenCalled();
  });

  it("ignores modifier chords, which are browser shortcuts rather than app actions", async () => {
    const button = aButton();
    press(button, "Enter", { metaKey: true });
    press(button, "Enter", { ctrlKey: true });
    press(button, "Enter", { altKey: true });
    await flush();

    expect(play).not.toHaveBeenCalled();
  });

  it("ignores controls that opt out, so consent chrome cannot be an entry gesture", async () => {
    const banner = mount(document.createElement("div"));
    banner.setAttribute("data-no-audio-gesture", "");
    const accept = document.createElement("button");
    banner.appendChild(accept);

    click(accept);
    await flush();

    expect(play).not.toHaveBeenCalled();
    expect(isFirstGestureUnlockArmed()).toBe(true);
  });
});

describe("first meaningful interaction — a refused start is not a spent chance", () => {
  it("stays armed and silent when the browser refuses the attempt", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    prepareRadio();
    installFirstGestureUnlock();

    // A forged click behaves exactly like this in a real browser: the autoplay
    // policy refuses it, and the visitor's next genuine action must still work.
    click(aButton());
    await flush();

    expect(getRadioSnapshot().isPlaying).toBe(false);
    expect(getRadioSnapshot().status).toBe("blocked");
    expect(isFirstGestureUnlockArmed()).toBe(true);
  });

  it("still starts on a later gesture once the browser allows it", async () => {
    play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    prepareRadio();
    installFirstGestureUnlock();

    click(aButton());
    await flush();
    expect(getRadioSnapshot().isPlaying).toBe(false);

    click(aButton());
    await flush();

    expect(play).toHaveBeenCalledTimes(2);
    expect(getRadioSnapshot().isPlaying).toBe(true);
    expect(isFirstGestureUnlockArmed()).toBe(false);
  });
});

describe("first meaningful interaction — explicit preferences win", () => {
  it("does not audibly auto-start a visitor who muted the radio", async () => {
    prepareRadio();
    setRadioMuted(true);

    installFirstGestureUnlock();
    expect(isFirstGestureUnlockArmed()).toBe(false);

    click(aButton());
    await flush();

    expect(play).not.toHaveBeenCalled();
    expect(getRadioSnapshot().muted).toBe(true);
  });

  it("honours a mute preference restored from a previous visit", async () => {
    localStorage.setItem(RADIO_STORAGE_KEYS.muted, "true");
    prepareRadio();

    installFirstGestureUnlock();
    click(aButton());
    await flush();

    expect(play).not.toHaveBeenCalled();
  });

  it("does not auto-resume a session the visitor explicitly paused", async () => {
    prepareRadio();
    await startRadio();
    pauseRadio();
    play.mockClear();

    // Re-arming must not resurrect it behind their back.
    installFirstGestureUnlock();
    click(aButton());
    await flush();

    expect(play).not.toHaveBeenCalled();
    expect(getRadioSnapshot().status).toBe("paused");
  });

  it("a later explicit Play still resumes a paused session", async () => {
    prepareRadio();
    await startRadio();
    pauseRadio();
    play.mockClear();

    await playRadio();

    expect(play).toHaveBeenCalledTimes(1);
    expect(getRadioSnapshot().isPlaying).toBe(true);
  });
});

/**
 * The radio announces itself with nothing but its own controls.
 *
 * There was a one-time "Academy Radio is playing" toast here. It is gone by
 * decision, not by accident, so `sonner` stays mocked in this file purely as the
 * tripwire: if any path back into a playback notification is ever reintroduced,
 * these assertions are what fail.
 */
describe("playback notifications", () => {
  it("says nothing when the first meaningful gesture starts the radio", async () => {
    prepareRadio();
    installFirstGestureUnlock();

    click(aButton());
    await flush();

    expect(play).toHaveBeenCalledTimes(1);
    expect(getRadioSnapshot().isPlaying).toBe(true);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("says nothing when the visitor presses Play themselves", async () => {
    prepareRadio();
    await playRadio();

    expect(getRadioSnapshot().isPlaying).toBe(true);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("says nothing when a start is refused", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    prepareRadio();
    installFirstGestureUnlock();

    click(aButton());
    await flush();

    expect(toastMock).not.toHaveBeenCalled();
  });

  it("stays quiet across repeated starts within a session", async () => {
    prepareRadio();
    installFirstGestureUnlock();

    click(aButton());
    await flush();
    await startRadio();

    expect(toastMock).not.toHaveBeenCalled();
  });

  it("persists no notice flag, only the visitor's own preferences", async () => {
    prepareRadio();
    installFirstGestureUnlock();

    click(aButton());
    await flush();

    expect(localStorage.getItem("mogsy.audio.radioNoticeSeen")).toBeNull();
    expect(Object.values(RADIO_STORAGE_KEYS)).toEqual([
      "mogsy.audio.musicMuted",
      "mogsy.audio.musicVolume",
    ]);
  });
});
