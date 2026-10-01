import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuideStorage, guideStorageKey, type GuideStorage } from "@/components/mogzy-guide";
import LeaguecraftGuide from "./LeaguecraftGuide";
import {
  LEAGUECRAFT_GUIDE_SURFACE,
  ROLE_FIRST_USE_ID,
  ROLE_FIRST_USE_TTL_MS,
  ROLE_PICKED_ID,
  ROLE_PICKED_TTL_MS,
} from "./leaguecraft-guide";

const memStorage = (seed: string[] = []): GuideStorage => {
  const m = new Map<string, string>(seed.map((k) => [k, "1"]));
  return createGuideStorage({
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  });
};
const FIRST_KEY = guideStorageKey(LEAGUECRAFT_GUIDE_SURFACE, ROLE_FIRST_USE_ID);

const base = { hasRole: false, rolePicks: 0, playOpen: false, playDisabled: false } as const;
const guide = () => screen.queryByTestId(`mogzy-guide-${LEAGUECRAFT_GUIDE_SURFACE}`);
const live = () => screen.getByTestId(`mogzy-guide-${LEAGUECRAFT_GUIDE_SURFACE}-live`);
const bubble = () => screen.getByTestId(`mogzy-guide-${LEAGUECRAFT_GUIDE_SURFACE}-bubble`);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove("reduce-motion");
});

describe("LeaguecraftGuide — role guidance", () => {
  it("introduces the role selector on a first visit, announced once", () => {
    render(<LeaguecraftGuide {...base} storage={memStorage()} layout="desktop" />);
    expect(guide()?.getAttribute("data-active-message")).toBe(ROLE_FIRST_USE_ID);
    expect(live().textContent).toBe("Start here. Pick the role you know best.");
    expect(live().getAttribute("role")).toBe("status");
    expect(live().getAttribute("aria-live")).toBe("polite");
    // The visible bubble never announces; only the live region does.
    expect(bubble().getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    // It is a bystander: no button, no focus stop, no pointer events.
    expect(screen.queryByRole("button")).toBeNull();
    expect(guide()?.className).toContain("pointer-events-none");
  });

  it("is absent — not merely hidden — for a visitor who already has a role", () => {
    render(<LeaguecraftGuide {...base} hasRole storage={memStorage()} layout="desktop" />);
    expect(guide()).toBeNull();
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(0);
  });

  it("does not repeat once it has been seen, across mounts", () => {
    const storage = memStorage();
    const first = render(<LeaguecraftGuide {...base} storage={storage} layout="desktop" />);
    expect(guide()).not.toBeNull();
    // The visit ends by expiry, which counts as seen.
    act(() => void vi.advanceTimersByTime(ROLE_FIRST_USE_TTL_MS + 50));
    expect(storage.has(FIRST_KEY)).toBe(true);
    first.unmount();

    render(<LeaguecraftGuide {...base} storage={storage} layout="desktop" />);
    expect(guide()).toBeNull();
  });

  it("is consumed by an actual role choice, and leans toward PLAY instead of repeating itself", () => {
    const storage = memStorage();
    const view = render(<LeaguecraftGuide {...base} storage={storage} layout="desktop" />);
    expect(guide()?.getAttribute("data-active-message")).toBe(ROLE_FIRST_USE_ID);

    // The host re-renders with the pick — and, as in the page, with a role now on
    // the stage. First-use must still be recorded, and must not come back.
    view.rerender(
      <LeaguecraftGuide {...base} hasRole rolePicks={1} storage={storage} layout="desktop" />,
    );
    expect(storage.has(FIRST_KEY)).toBe(true);
    expect(guide()?.getAttribute("data-active-message")).toBe(ROLE_PICKED_ID);
    expect(live().textContent).toBe("Ready? Press Play.");
    expect(
      screen.getByTestId(`mogzy-guide-${LEAGUECRAFT_GUIDE_SURFACE}-bubble`).getAttribute("data-direction"),
    ).toBe("down");

    // A beat, not a message to read: it leaves on its own, and does not return.
    act(() => void vi.advanceTimersByTime(ROLE_PICKED_TTL_MS + 50));
    act(() => void vi.advanceTimersByTime(600));
    expect(guide()).toBeNull();

    view.rerender(
      <LeaguecraftGuide {...base} hasRole rolePicks={2} storage={storage} layout="desktop" />,
    );
    expect(guide()).toBeNull();
  });

  it("announces each message once, never twice", () => {
    const storage = memStorage();
    const view = render(<LeaguecraftGuide {...base} storage={storage} layout="desktop" />);
    const seen: string[] = [live().textContent ?? ""];
    view.rerender(
      <LeaguecraftGuide {...base} hasRole rolePicks={1} storage={storage} layout="desktop" />,
    );
    seen.push(live().textContent ?? "");
    expect(seen).toEqual([
      "Start here. Pick the role you know best.",
      "Ready? Press Play.",
    ]);
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("stays quiet about PLAY while the host holds PLAY still", () => {
    const storage = memStorage([FIRST_KEY]);
    render(
      <LeaguecraftGuide {...base} hasRole rolePicks={1} playDisabled storage={storage} layout="desktop" />,
    );
    expect(guide()).toBeNull();
  });

  it("leaves when the match-entry record opens, and never offers first-use over it", () => {
    const storage = memStorage();
    const view = render(<LeaguecraftGuide {...base} storage={storage} layout="desktop" />);
    expect(guide()).not.toBeNull();
    view.rerender(<LeaguecraftGuide {...base} playOpen storage={storage} layout="desktop" />);
    act(() => void vi.advanceTimersByTime(600));
    expect(guide()).toBeNull();
    // Opening PLAY directly is itself the answer.
    expect(storage.has(FIRST_KEY)).toBe(true);
  });

  it("does not consume first-use for a visitor who arrives with the record already open", () => {
    const storage = memStorage();
    render(<LeaguecraftGuide {...base} playOpen storage={storage} layout="desktop" />);
    expect(guide()).toBeNull();
    expect(storage.has(FIRST_KEY)).toBe(false);
  });
});

describe("LeaguecraftGuide — placement and motion", () => {
  it("uses the authored mobile placement on a phone and the desktop one otherwise", () => {
    const view = render(<LeaguecraftGuide {...base} storage={memStorage()} layout="mobile" />);
    expect(guide()?.getAttribute("data-layout")).toBe("mobile");
    view.unmount();
    render(<LeaguecraftGuide {...base} storage={memStorage()} layout="desktop" />);
    expect(guide()?.getAttribute("data-layout")).toBe("desktop");
  });

  it("is anchored inside the host rather than in flow, so it cannot move the lobby", () => {
    render(<LeaguecraftGuide {...base} storage={memStorage()} layout="desktop" />);
    expect((guide() as HTMLElement).style.position).toBe("absolute");
  });

  it("keeps the same words and drops every motion layer under reduced motion", () => {
    document.documentElement.classList.add("reduce-motion");
    const storage = memStorage();
    const view = render(<LeaguecraftGuide {...base} storage={storage} layout="desktop" />);
    expect(guide()?.getAttribute("data-motion")).toBe("still");
    expect(live().textContent).toBe("Start here. Pick the role you know best.");

    view.rerender(
      <LeaguecraftGuide {...base} hasRole rolePicks={1} storage={storage} layout="desktop" />,
    );
    // The lean is not applied; the information is in the text.
    expect(guide()?.getAttribute("data-motion")).toBe("still");
    expect(
      screen.getByTestId(`mogzy-guide-${LEAGUECRAFT_GUIDE_SURFACE}-lean`).style.getPropertyValue("--guide-lean-y"),
    ).toBe("0px");
    expect(live().textContent).toBe("Ready? Press Play.");
  });
});
