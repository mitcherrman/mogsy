/**
 * The startup surface must show *nothing* — no logo, no skeleton, no text, no
 * animation. Drawing the destination's geometry made the visitor watch the page
 * assemble, so these tests exist to keep placeholder content from creeping back.
 *
 * It is also rendered before auth, app settings, Pro entitlement and tutorial
 * state are known, so it must leak nothing about the visitor either — which a
 * component rendering no content at all satisfies trivially.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StartupSurface } from "./StartupShells";
import { DEFAULT_BASE_BG, ENTRY_BASE_BG, LOL_BASE_BG } from "@/lib/startup-shell";

afterEach(cleanup);

const surface = (c: HTMLElement) => c.querySelector("[data-startup-surface]") as HTMLElement;

/** rgb() is how jsdom reports a resolved hex background. */
function hexOf(el: HTMLElement): string {
  const m = el.style.background.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return el.style.background;
  return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

const ROUTES = ["/", "/lol", "/lol/docs", "/combat-lab", "/quiz/ranked", "/settings", undefined];

describe("the startup surface renders no visible content", () => {
  it.each(ROUTES)("%s — is a single empty element", (pathname) => {
    const { container } = render(<StartupSurface pathname={pathname} />);
    const el = surface(container);
    expect(el).not.toBeNull();
    expect(el.childElementCount).toBe(0);
    expect(el.textContent).toBe("");
  });

  it.each(ROUTES)("%s — draws no placeholder shapes", (pathname) => {
    const { container } = render(<StartupSurface pathname={pathname} />);
    // Book/card outlines, heading bands, navbar bars, mascot silhouettes — the
    // whole family of "watch the page assemble" filler.
    expect(container.querySelectorAll("[data-shell-book]")).toHaveLength(0);
    expect(container.querySelectorAll("div, span, section, header, nav, img, svg")).toHaveLength(1);
  });

  it.each(ROUTES)("%s — has no logo and no loading text", (pathname) => {
    const { container } = render(<StartupSurface pathname={pathname} />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("mogsy-logo");
    expect(container.textContent).toBe("");
  });

  it.each(ROUTES)("%s — is not animated", (pathname) => {
    const { container } = render(<StartupSurface pathname={pathname} />);
    expect(surface(container).className).not.toMatch(/animate-|pulse|spin|transition/);
    expect(container.innerHTML).not.toMatch(/animate-|animation:/);
  });

  it.each(ROUTES)("%s — exposes no interactive control", (pathname) => {
    const { container } = render(<StartupSurface pathname={pathname} />);
    expect(container.querySelectorAll("a, button, input, form")).toHaveLength(0);
  });
});

describe("it does not announce ordinary hydration", () => {
  it("is hidden from assistive tech rather than reported as a live region", () => {
    const { container } = render(<StartupSurface pathname="/lol" />);
    expect(surface(container)).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("[role]")).toBeNull();
    expect(container.querySelector("[aria-busy]")).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("puts no loading announcement in the accessibility tree", () => {
    render(<StartupSurface pathname="/lol" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/loading/i)).toBeNull();
  });
});

describe("it paints the destination's base colour", () => {
  it("uses the entrance colour for the entrance routes", () => {
    for (const p of ["/", "/dev/mogzy-entry-v2"]) {
      cleanup();
      const { container } = render(<StartupSurface pathname={p} />);
      expect(hexOf(surface(container))).toBe(ENTRY_BASE_BG);
    }
  });

  it("uses the library colour across the League section", () => {
    for (const p of ["/lol", "/lol/docs", "/combat-lab", "/quiz/ranked"]) {
      cleanup();
      const { container } = render(<StartupSurface pathname={p} />);
      expect(hexOf(surface(container))).toBe(LOL_BASE_BG);
    }
  });

  it("falls back to the app base colour elsewhere, and with no route context", () => {
    const { container } = render(<StartupSurface pathname="/settings" />);
    expect(hexOf(surface(container))).toBe(DEFAULT_BASE_BG);
    cleanup();
    const bare = render(<StartupSurface />);
    expect(hexOf(surface(bare.container))).toBe(DEFAULT_BASE_BG);
  });

  it("is opaque and covers the viewport, so no browser default shows through", () => {
    const { container } = render(<StartupSurface pathname="/lol" />);
    const el = surface(container);
    expect(el.className).toContain("fixed");
    expect(el.className).toContain("inset-0");
    // A colour with alpha would let the white canvas through underneath.
    expect(el.style.background).not.toMatch(/rgba|transparent/);
  });
});
