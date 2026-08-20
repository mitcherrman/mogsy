/**
 * AI1 Phase 2 — the reusable role mascot.
 *
 * The behaviour under test is the COMPONENT's, not any surface's: art
 * resolution, the layer stack, facing, retriggering, return-to-rest, reduced
 * motion, and the host's ownership of layout. The last test in the file pins
 * the reusability contract itself — that this module reaches nothing in Ranked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { RoleMascot, roleMascotDefaultAlt } from "./RoleMascot";
import { MOGZY_ROLE_ASSETS } from "./mascot-assets";
import { RANKED_ROLES } from "@/lib/ranked-public/roles";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** jsdom has no matchMedia; every test states the motion preference it wants. */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

const actionLayer = (c: HTMLElement) =>
  c.querySelector('[data-testid="role-mascot-action"]') as HTMLElement;

describe("RoleMascot — art", () => {
  it("resolves every role to its own registered asset", () => {
    stubReducedMotion(false);
    for (const role of RANKED_ROLES) {
      const { container, unmount } = render(<RoleMascot role={role} />);
      const img = container.querySelector("img")!;
      expect(img.getAttribute("src"), role).toBe(MOGZY_ROLE_ASSETS[role]);
      expect(container.querySelector("[data-role]")!.getAttribute("data-role")).toBe(role);
      unmount();
    }
  });

  it("is decorative by default and announceable on request", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="mid" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("alt", "");

    cleanup();
    const named = render(<RoleMascot role="mid" alt={roleMascotDefaultAlt("mid")} />);
    const img2 = named.container.querySelector("img")!;
    expect(img2).toHaveAttribute("alt", "Mid mascot");
    expect(img2).not.toHaveAttribute("aria-hidden");
  });
});

describe("RoleMascot — layers", () => {
  it("nests one transform layer per motion, idle -> facing -> action -> img", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="top" />);
    const root = container.querySelector(".role-mascot")!;
    const idle = root.querySelector(":scope > .role-mascot-idle")!;
    const facing = idle.querySelector(":scope > .role-mascot-facing")!;
    const action = facing.querySelector(":scope > .role-mascot-action")!;
    expect(action.querySelector(":scope > img")).not.toBeNull();
    // The host layer must stay transform-free so parent positioning and idle
    // motion can never fight over one declaration.
    expect((root as HTMLElement).style.transform).toBe("");
  });

  it("renders at rest with no action class and no action transform", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="top" />);
    const layer = actionLayer(container);
    expect(layer.className).toBe("role-mascot-action");
    expect(layer.dataset.playing).toBeUndefined();
  });
});

describe("RoleMascot — facing", () => {
  it("mirrors only for left, and only on the facing layer", () => {
    stubReducedMotion(false);
    const right = render(<RoleMascot role="jungle" facing="right" />);
    expect(
      (right.container.querySelector(".role-mascot-facing") as HTMLElement)
        .style.getPropertyValue("--role-mascot-facing"),
    ).toBe("1");
    expect(right.container.querySelector("[data-facing]")!.getAttribute("data-facing"))
      .toBe("right");
    cleanup();

    const left = render(<RoleMascot role="jungle" facing="left" />);
    expect(
      (left.container.querySelector(".role-mascot-facing") as HTMLElement)
        .style.getPropertyValue("--role-mascot-facing"),
    ).toBe("-1");
    // The mirror never lands on the action layer, or the action keyframes
    // (written forward = +X) would travel the wrong way when facing left.
    expect((actionLayer(left.container)).style.transform).toBe("");
  });

  it("defaults to the untouched artwork", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="support" />);
    expect(container.querySelector("[data-facing]")!.getAttribute("data-facing"))
      .toBe("right");
  });
});

describe("RoleMascot — action playback", () => {
  it("does not fire for the id it mounted with", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="adc" action="hit" actionId={7} />);
    // A mascot mounting mid-match must not replay the last event as an
    // entrance animation.
    expect(actionLayer(container).dataset.playing).toBeUndefined();
  });

  it("plays attack when the id changes", () => {
    stubReducedMotion(false);
    const { container, rerender } = render(<RoleMascot role="top" action={null} actionId={null} />);
    rerender(<RoleMascot role="top" action="attack" actionId={1} />);
    const layer = actionLayer(container);
    expect(layer.classList.contains("role-mascot-attack")).toBe(true);
    expect(layer.dataset.playing).toBe("attack");
  });

  it("retriggers the SAME action on a new id", () => {
    stubReducedMotion(false);
    const { container, rerender } = render(<RoleMascot role="top" action={null} actionId={null} />);
    rerender(<RoleMascot role="top" action="attack" actionId={1} />);
    const layer = actionLayer(container);
    // Mid-flight: the class is still on when the next event arrives.
    expect(layer.classList.contains("role-mascot-attack")).toBe(true);
    const removed: string[] = [];
    const realRemove = layer.classList.remove.bind(layer.classList);
    layer.classList.remove = ((...c: string[]) => {
      removed.push(...c);
      realRemove(...c);
    }) as typeof layer.classList.remove;

    rerender(<RoleMascot role="top" action="attack" actionId={2} />);
    // Re-adding a class already present is a no-op, so a genuine retrigger
    // MUST have dropped it first. That drop is the whole mechanism.
    expect(removed).toContain("role-mascot-attack");
    expect(layer.classList.contains("role-mascot-attack")).toBe(true);
  });

  it("retriggers hit, and switching attack -> hit leaves only hit", () => {
    stubReducedMotion(false);
    const { container, rerender } = render(<RoleMascot role="mid" action={null} actionId={null} />);
    rerender(<RoleMascot role="mid" action="hit" actionId={1} />);
    expect(actionLayer(container).classList.contains("role-mascot-hit")).toBe(true);
    rerender(<RoleMascot role="mid" action="hit" actionId={2} />);
    expect(actionLayer(container).classList.contains("role-mascot-hit")).toBe(true);

    rerender(<RoleMascot role="mid" action="attack" actionId={3} />);
    const layer = actionLayer(container);
    // Deterministic: exactly one action class at a time, never both.
    expect(layer.classList.contains("role-mascot-attack")).toBe(true);
    expect(layer.classList.contains("role-mascot-hit")).toBe(false);
  });

  it("re-rendering the same id does NOT replay", () => {
    stubReducedMotion(false);
    const { container, rerender } = render(<RoleMascot role="top" action={null} actionId={null} />);
    rerender(<RoleMascot role="top" action="attack" actionId={5} />);
    const layer = actionLayer(container);
    act(() => layer.dispatchEvent(new Event("animationend")));
    expect(layer.classList.contains("role-mascot-attack")).toBe(false);
    // An unrelated re-render (a new className) must not resurrect the animation.
    rerender(<RoleMascot role="top" action="attack" actionId={5} className="h-9 w-9" />);
    expect(layer.classList.contains("role-mascot-attack")).toBe(false);
  });

  it("returns to baseline when the animation ends, leaving no stale transform", () => {
    stubReducedMotion(false);
    const { container, rerender } = render(<RoleMascot role="adc" action={null} actionId={null} />);
    rerender(<RoleMascot role="adc" action="attack" actionId={1} />);
    const layer = actionLayer(container);
    act(() => layer.dispatchEvent(new Event("animationend")));
    expect(layer.className).toBe("role-mascot-action");
    expect(layer.dataset.playing).toBeUndefined();
    expect(layer.style.transform).toBe("");
  });

  it("clears on animationcancel too, so an interrupted action cannot stick", () => {
    stubReducedMotion(false);
    const { container, rerender } = render(<RoleMascot role="adc" action={null} actionId={null} />);
    rerender(<RoleMascot role="adc" action="hit" actionId={1} />);
    const layer = actionLayer(container);
    act(() => layer.dispatchEvent(new Event("animationcancel")));
    expect(layer.className).toBe("role-mascot-action");
  });
});

describe("RoleMascot — reduced motion", () => {
  it("adds no action class at all when the user asks for reduced motion", () => {
    stubReducedMotion(true);
    const { container, rerender } = render(<RoleMascot role="top" action={null} actionId={null} />);
    rerender(<RoleMascot role="top" action="attack" actionId={1} />);
    const layer = actionLayer(container);
    expect(layer.className).toBe("role-mascot-action");
    expect(layer.dataset.playing).toBeUndefined();
  });

  it("keeps the stylesheet's reduced-motion overrides for every layer", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
    const block = css.slice(css.indexOf("@keyframes role-mascot-idle-float"));
    const reduced = block.slice(block.indexOf("prefers-reduced-motion"));
    expect(reduced).toContain(".role-mascot-idle { animation: none !important; }");
    expect(reduced).toContain(".role-mascot-facing { transition: none !important;");
    // Attack and hit survive as a still acknowledgement, never as travel.
    expect(reduced).toContain("role-mascot-reduced");
    expect(reduced).toContain("transform: none !important;");
  });

  it("keeps every tunable as a custom property rather than a hard-coded value", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
    for (const token of [
      "--role-mascot-idle-rise", "--role-mascot-idle-duration",
      "--role-mascot-attack-reach", "--role-mascot-attack-duration",
      "--role-mascot-hit-recoil", "--role-mascot-hit-duration",
      "--role-mascot-squash",
    ]) {
      expect(css, token).toContain(token);
    }
  });
});

describe("RoleMascot — host ownership of layout", () => {
  it("applies the host's sizing classes and styles to the OUTER box only", () => {
    stubReducedMotion(false);
    const { container } = render(
      <RoleMascot role="support" className="h-11 w-11 absolute bottom-0"
        style={{ maxWidth: "3rem" }} />,
    );
    const root = container.querySelector(".role-mascot") as HTMLElement;
    expect(root.className).toContain("h-11 w-11 absolute bottom-0");
    expect(root.style.maxWidth).toBe("3rem");
    // The inner layers carry no host classes — they are pure motion.
    expect(container.querySelector(".role-mascot-idle")!.className)
      .toBe("role-mascot-idle");
  });

  it("lets a host style the image without reaching into the layers", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="top" imageClassName="object-cover" />);
    expect(container.querySelector("img")!.className).toContain("object-cover");
  });
});

describe("RoleMascot — reusability contract", () => {
  it("imports nothing from Ranked surfaces, hooks, networking or damage models", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/mascot/RoleMascot.tsx"), "utf8");
    const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec, spec).not.toMatch(/quiz-ranked|ranked-arena|ranked-core|useRanked/);
    }
    // The only project imports are the canonical role vocabulary and the
    // canonical art registry — both of which sit below every surface.
    expect(imports.filter((s) => s.startsWith("@/") || s.startsWith("."))).toEqual([
      "./mascot-assets",
      "@/lib/ranked-public/roles",
    ]);
  });
});
