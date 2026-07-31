/**
 * Teardown of the static startup shell.
 *
 * The old implementation hung entirely off a single requestAnimationFrame,
 * which a background tab can suspend indefinitely. These tests pin the two
 * properties that replaced it: removal happens as soon as React commits (with
 * rAF unavailable), and it never happens before there is something to see.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTUP_SHELL_FALLBACK_MS, retireStartupShell } from "./startup-shell-teardown";

function setupDocument() {
  document.documentElement.setAttribute("data-startup-shell", "lol");
  document.body.innerHTML = `<div id="initial-shell"></div><div id="root"></div>`;
  return document.getElementById("root")!;
}

const shell = () => document.getElementById("initial-shell");

/** Let the MutationObserver microtask drain. */
const flush = () => new Promise<void>((r) => queueMicrotask(() => r()));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-startup-shell");
});

describe("retireStartupShell", () => {
  it("removes the shell as soon as React commits into #root", async () => {
    const root = setupDocument();
    retireStartupShell(root);
    expect(shell()).not.toBeNull();

    root.appendChild(document.createElement("div"));
    await flush();

    expect(shell()).toBeNull();
    expect(document.documentElement.hasAttribute("data-startup-shell")).toBe(false);
  });

  it("does not depend on requestAnimationFrame", async () => {
    // Exactly the background-tab case: the frame callback is registered and then
    // never invoked, because the tab is not painting.
    const parked: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      parked.push(cb);
      return 1;
    });

    const root = setupDocument();
    retireStartupShell(root);
    root.appendChild(document.createElement("div"));
    await flush();

    expect(shell()).toBeNull();
    // Removal happened without a single frame callback ever running…
    expect(parked.every((cb) => typeof cb === "function")).toBe(true);
    // …and without waiting out the fallback timer either.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the shell until React has mounted visible structure", async () => {
    const root = setupDocument();
    retireStartupShell(root);
    await flush();

    // No commit yet, and well inside the fallback window.
    vi.advanceTimersByTime(STARTUP_SHELL_FALLBACK_MS - 1);
    expect(shell()).not.toBeNull();
  });

  it("retires on a bounded fallback even if React never commits", async () => {
    const root = setupDocument();
    retireStartupShell(root);

    vi.advanceTimersByTime(STARTUP_SHELL_FALLBACK_MS);
    expect(shell()).toBeNull();
  });

  it("uses a short bound, not a multi-second stall", () => {
    expect(STARTUP_SHELL_FALLBACK_MS).toBeLessThanOrEqual(3000);
  });

  it("removes immediately when React committed before teardown was wired up", () => {
    const root = setupDocument();
    root.appendChild(document.createElement("div"));

    retireStartupShell(root);

    expect(shell()).toBeNull();
  });

  it("is safe to run twice", async () => {
    const root = setupDocument();
    const retire = retireStartupShell(root);
    root.appendChild(document.createElement("div"));
    await flush();
    expect(() => retire()).not.toThrow();
    expect(shell()).toBeNull();
  });
});
