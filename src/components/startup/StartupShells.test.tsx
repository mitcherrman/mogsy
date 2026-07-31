/**
 * Startup shells are rendered before auth, app settings, Pro entitlement and
 * tutorial state are known. Two things therefore have to stay true: they show
 * the destination surface (not a branded splash), and they leak nothing about
 * the visitor — no name, no entitlement, no privileged control.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  EntryShell,
  LibraryHubShell,
  NeutralBootShell,
  RouteBootShell,
} from "./StartupShells";
import { DEFAULT_BASE_BG, ENTRY_BASE_BG, LOL_BASE_BG } from "@/lib/startup-shell";

afterEach(cleanup);

const surface = (c: HTMLElement) => c.querySelector("[data-startup-shell-surface]") as HTMLElement;

/** rgb() is how jsdom reports a resolved hex background. */
function hexOf(el: HTMLElement): string {
  const m = el.style.background.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return el.style.background;
  return (
    "#" +
    [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")
  );
}

describe("no shell shows the legacy branded loader", () => {
  it.each([
    ["entrance", <EntryShell key="e" />],
    ["library hub", <LibraryHubShell key="l" />],
    ["neutral", <NeutralBootShell key="n" />],
  ])("%s shell renders no logo image", (_name, element) => {
    const { container } = render(element);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("mogsy-logo");
  });

  it.each([
    ["entrance", <EntryShell key="e" />],
    ["library hub", <LibraryHubShell key="l" />],
    ["neutral", <NeutralBootShell key="n" />],
  ])("%s shell does not pulse", (_name, element) => {
    const { container } = render(element);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
  });
});

describe("each shell paints its destination's surface", () => {
  it("uses the entrance base colour for /", () => {
    const { container } = render(<EntryShell />);
    expect(hexOf(surface(container))).toBe(ENTRY_BASE_BG);
  });

  it("uses the library base colour for /lol", () => {
    const { container } = render(<LibraryHubShell />);
    expect(hexOf(surface(container))).toBe(LOL_BASE_BG);
  });

  it("uses the app base colour for everything else", () => {
    const { container } = render(<NeutralBootShell />);
    expect(hexOf(surface(container))).toBe(DEFAULT_BASE_BG);
  });
});

describe("the hub shell reserves the hub's geometry", () => {
  it("holds the full viewport open", () => {
    const { container } = render(<LibraryHubShell />);
    expect(surface(container).className).toContain("min-h-dvh");
  });

  it("reserves space for all six academy destinations", () => {
    const { container } = render(<LibraryHubShell />);
    // Six desktop book slots + six mobile panel slots, matching LolHub's IA.
    expect(container.querySelectorAll("[data-shell-book]")).toHaveLength(12);
  });

  it("clears the app header so the hub does not jump when the navbar mounts", () => {
    const { container } = render(<LibraryHubShell />);
    expect(container.innerHTML).toContain("--app-header-h");
  });
});

describe("shells are safe before identity resolves", () => {
  it.each([
    ["entrance", <EntryShell key="e" />],
    ["library hub", <LibraryHubShell key="l" />],
    ["neutral", <NeutralBootShell key="n" />],
  ])("%s shell exposes no interactive control", (_name, element) => {
    const { container } = render(element);
    expect(container.querySelectorAll("a, button, input, form")).toHaveLength(0);
  });

  it("the pre-auth hub shell renders no user-specific or entitlement text", () => {
    const { container } = render(<LibraryHubShell />);
    const text = container.textContent ?? "";
    expect(text.trim()).toBe("");
    expect(text).not.toMatch(/Pro|Summoner|Welcome back|Sign up|XP|streak/i);
  });

  it("announces itself as busy rather than as content", () => {
    render(<LibraryHubShell />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
  });
});

describe("RouteBootShell picks by route alone", () => {
  it("gives League routes the library shell", () => {
    for (const path of ["/lol", "/lol/docs", "/combat-lab", "/quiz/ranked"]) {
      cleanup();
      const { container } = render(<RouteBootShell pathname={path} />);
      expect(hexOf(surface(container))).toBe(LOL_BASE_BG);
    }
  });

  it("gives the entrance the entrance shell", () => {
    const { container } = render(<RouteBootShell pathname="/" />);
    expect(hexOf(surface(container))).toBe(ENTRY_BASE_BG);
  });

  it("falls back to the neutral shell elsewhere", () => {
    const { container } = render(<RouteBootShell pathname="/settings" />);
    expect(hexOf(surface(container))).toBe(DEFAULT_BASE_BG);
  });
});
