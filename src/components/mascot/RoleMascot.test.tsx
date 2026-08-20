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
import {
  MOGZY_ROLE_ART_FACING, MOGZY_ROLE_ASSETS, getRankedRoleArtFacing,
} from "./mascot-assets";
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
  it("nests one transform per layer, idle -> facing -> action -> plate -> img", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="top" />);
    const root = container.querySelector(".role-mascot")!;
    const idle = root.querySelector(":scope > .role-mascot-idle")!;
    const facing = idle.querySelector(":scope > .role-mascot-facing")!;
    const action = facing.querySelector(":scope > .role-mascot-action")!;
    const plate = action.querySelector(":scope > .role-mascot-plate")!;
    expect(plate.querySelector(":scope > img")).not.toBeNull();
    // The host layer must stay transform-free so parent positioning and idle
    // motion can never fight over one declaration.
    expect((root as HTMLElement).style.transform).toBe("");
  });

  it("keeps the artwork's own direction BELOW the actions, never above them", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="mid" facing="right" />);
    const facing = container.querySelector(".role-mascot-facing") as HTMLElement;
    const action = container.querySelector(".role-mascot-action")!;
    const plate = container.querySelector(".role-mascot-plate") as HTMLElement;
    // `mid` is the one plate drawn facing LEFT, so asking for `right` flips it.
    expect(plate.style.getPropertyValue("--role-mascot-plate")).toBe("-1");
    // ...but the SEMANTIC layer still says "facing right", because that is what
    // the action keyframes hang off. If the plate correction lived up here, a
    // Mid duelist would lunge away from the opponent instead of at them.
    expect(facing.style.getPropertyValue("--role-mascot-facing")).toBe("1");
    expect(action.contains(plate)).toBe(true);
  });

  it("leaves a plate alone when it already looks the right way", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="top" facing="right" />);
    expect((container.querySelector(".role-mascot-plate") as HTMLElement)
      .style.getPropertyValue("--role-mascot-plate")).toBe("1");
    expect((container.querySelector(".role-mascot") as HTMLElement)
      .dataset.plateFlipped).toBeUndefined();
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

describe("RoleMascot — the artwork's own direction", () => {
  it("records a native direction for every role, and only mid faces left", () => {
    // Not a style choice: this map is what makes `facing` mean the same thing
    // for all five. Four plates lead with their weapon on the viewer's right;
    // `mid` leads with its staff on the left.
    expect(MOGZY_ROLE_ART_FACING).toEqual({
      top: "right", jungle: "right", mid: "left", adc: "right", support: "right",
    });
    for (const role of RANKED_ROLES) {
      expect(getRankedRoleArtFacing(role), role).toBe(MOGZY_ROLE_ART_FACING[role]);
    }
  });

  it("makes facing mean the same thing for every role", () => {
    stubReducedMotion(false);
    // Ask all five to look RIGHT. Whether that needs a flip differs by plate;
    // what must not differ is the result.
    for (const role of RANKED_ROLES) {
      const { container } = render(<RoleMascot role={role} facing="right" />);
      const plate = container.querySelector(".role-mascot-plate") as HTMLElement;
      const want = MOGZY_ROLE_ART_FACING[role] === "right" ? "1" : "-1";
      expect(plate.style.getPropertyValue("--role-mascot-plate"), role).toBe(want);
      // The semantic layer says "right" for all five, so all five lunge the
      // same way on screen.
      expect((container.querySelector(".role-mascot-facing") as HTMLElement)
        .style.getPropertyValue("--role-mascot-facing"), role).toBe("1");
      cleanup();
    }
  });

  it("leaves the net flip of a left-facing plate at IDENTITY when asked to face left", () => {
    stubReducedMotion(false);
    // `mid` drawn facing left, asked to face left: the plate is already right,
    // so nothing flips it — and the semantic layer alone carries the mirror.
    const { container } = render(<RoleMascot role="mid" facing="left" />);
    expect((container.querySelector(".role-mascot-plate") as HTMLElement)
      .style.getPropertyValue("--role-mascot-plate")).toBe("1");
    expect((container.querySelector(".role-mascot-facing") as HTMLElement)
      .style.getPropertyValue("--role-mascot-facing")).toBe("-1");
  });

  it("keeps the plate correction out of the reduced-motion overrides", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
    const block = css.slice(css.indexOf("@keyframes role-mascot-idle-float"));
    const from = block.indexOf("prefers-reduced-motion");
    // Bound to the media block itself, so the negative below cannot be
    // satisfied by simply running off the end of the rules.
    const reduced = block.slice(from, block.indexOf("\n}", from));
    // The TURN is dropped; the facing is not. Removing the mirror as well did
    // not remove motion — a static mirror is not motion — it removed the fact
    // that the two duelists are pointed at each other.
    expect(reduced).toContain(".role-mascot-facing { transition: none !important; }");
    expect(reduced).not.toContain(".role-mascot-plate");
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
      "--role-mascot-attack-reach", "--role-mascot-attack-windup",
      "--role-mascot-attack-duration", "--role-mascot-attack-lean",
      "--role-mascot-hit-recoil", "--role-mascot-hit-duration",
      "--role-mascot-hit-jolt",
      "--role-mascot-react-hop", "--role-mascot-react-squash",
      "--role-mascot-react-duration",
      "--role-mascot-squash",
    ]) {
      expect(css, token).toContain(token);
    }
  });
});

describe("RoleMascot — the motion is big enough to see (AI1 Phase 2B)", () => {
  const css = () => fs.readFileSync(path.join(process.cwd(), "src/index.css"), "utf8");
  const token = (name: string) => {
    const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css());
    return m![1].trim();
  };

  it("travels far enough that a viewer can see it, at any mascot size", () => {
    // The owner could not tell whether either action was firing. The triggers
    // were fine; the DISTANCE was not — at the 40px crest the Phase 2 lunge
    // moved the art 6.4px and the recoil 4.4px, once, and then stopped. These
    // are percentages of the mascot, so the guarantee holds at every size.
    expect(parseFloat(token("--role-mascot-attack-reach"))).toBeGreaterThanOrEqual(25);
    expect(parseFloat(token("--role-mascot-hit-recoil"))).toBeGreaterThanOrEqual(20);
    expect(parseFloat(token("--role-mascot-react-hop"))).toBeGreaterThanOrEqual(8);
  });

  it("gives attack an anticipation and hit none, so the two never read alike", () => {
    const attack = /@keyframes role-mascot-attack \{([\s\S]*?)\n\}/.exec(css())![1];
    const hit = /@keyframes role-mascot-hit \{([\s\S]*?)\n\}/.exec(css())![1];
    // Attack pulls BACK before it drives forward; its peak is halfway in.
    expect(attack).toContain("--role-mascot-attack-windup");
    expect(/^\s*48%/m.test(attack)).toBe(true);
    // A hit is done TO you: it peaks immediately and has no windup at all.
    expect(hit).not.toContain("windup");
    expect(/^\s*9%/m.test(hit)).toBe(true);
    // Only the hit rotates hard and oscillates home.
    expect(hit).toContain("--role-mascot-hit-jolt");
    expect((hit.match(/--role-mascot-hit-jolt/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("keeps the click reaction purely vertical, so facing cannot flip it", () => {
    const react = /@keyframes role-mascot-react \{([\s\S]*?)\n\}/.exec(css())![1];
    expect(react).toContain("translateY");
    expect(react).not.toContain("translateX");
    expect(react).not.toContain("rotate");
  });

  it("starts and ends every action at rest, so nothing can stick", () => {
    for (const name of ["attack", "hit", "react"]) {
      const body = new RegExp(`@keyframes role-mascot-${name} \\{([\\s\\S]*?)\\n\\}`)
        .exec(css())![1];
      const first = body.match(/0%\s*\{([^}]*)\}/)![1];
      const last = body.match(/100%\s*\{([^}]*)\}/)![1];
      for (const frame of [first, last]) {
        expect(frame, name).not.toMatch(/translate[XY]?\((?!0)/);
        expect(frame, name).not.toMatch(/rotate\((?!0deg)/);
        expect(frame, name).not.toMatch(/scale\((?!1,? ?1?\))/);
      }
      // No fill mode anywhere: the layer is at rest the instant it ends.
      expect(css()).not.toMatch(new RegExp(`role-mascot-${name} var\\(--[^)]+\\)[^;]*(forwards|both)`));
    }
  });
});

describe("RoleMascot — click reaction (AI1 Phase 2B)", () => {
  const click = (c: HTMLElement) =>
    act(() => { (c.querySelector(".role-mascot") as HTMLElement).click(); });

  it("is inert until a host opts in", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="top" />);
    const root = container.querySelector(".role-mascot") as HTMLElement;
    expect(root.className).not.toContain("role-mascot-interactive");
    expect(root.dataset.interactive).toBeUndefined();
    click(container);
    // A mascot nobody asked to be touchable does nothing when touched.
    expect(actionLayer(container).dataset.playing).toBeUndefined();
  });

  it("plays its own reaction on click", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="jungle" interactive />);
    click(container);
    const layer = actionLayer(container);
    expect(layer.classList.contains("role-mascot-react")).toBe(true);
    expect(layer.dataset.playing).toBe("react");
  });

  it("retriggers cleanly on rapid repeated clicks", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="mid" interactive />);
    click(container);
    const layer = actionLayer(container);
    const removed: string[] = [];
    const realRemove = layer.classList.remove.bind(layer.classList);
    layer.classList.remove = ((...c: string[]) => { removed.push(...c); realRemove(...c); }) as
      typeof layer.classList.remove;
    click(container);
    click(container);
    // Re-adding a class already present is a no-op, so each repeat MUST have
    // dropped it first. Two clicks, two drops — nothing swallowed.
    expect(removed.filter((c) => c === "role-mascot-react")).toHaveLength(2);
    expect(layer.classList.contains("role-mascot-react")).toBe(true);
    expect(layer.dataset.playing).toBe("react");
  });

  it("returns to the idle/facing state with no stuck transform", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="adc" facing="left" interactive />);
    click(container);
    const layer = actionLayer(container);
    act(() => layer.dispatchEvent(new Event("animationend")));
    expect(layer.className).toBe("role-mascot-action");
    expect(layer.dataset.playing).toBeUndefined();
    expect(layer.style.transform).toBe("");
    // Facing is untouched by the reaction: it lives on an ancestor layer.
    expect((container.querySelector(".role-mascot-facing") as HTMLElement)
      .style.getPropertyValue("--role-mascot-facing")).toBe("-1");
  });

  it("drops a click while a combat action is on screen, and never the reverse", () => {
    stubReducedMotion(false);
    const { container, rerender } = render(
      <RoleMascot role="support" interactive action={null} actionId={null} />);
    rerender(<RoleMascot role="support" interactive action="attack" actionId={1} />);
    const layer = actionLayer(container);
    expect(layer.dataset.playing).toBe("attack");

    // COMBAT BEATS COSMETICS, direction 1: the click is dropped outright.
    click(container);
    expect(layer.dataset.playing).toBe("attack");
    expect(layer.classList.contains("role-mascot-react")).toBe(false);

    // Combat ends; now the mascot is free to play.
    act(() => layer.dispatchEvent(new Event("animationend")));
    click(container);
    expect(layer.dataset.playing).toBe("react");

    // Direction 2: combat arriving mid-reaction interrupts it.
    rerender(<RoleMascot role="support" interactive action="hit" actionId={2} />);
    expect(layer.dataset.playing).toBe("hit");
    expect(layer.classList.contains("role-mascot-react")).toBe(false);
  });

  it("does not react at all under reduced motion", () => {
    stubReducedMotion(true);
    const { container } = render(<RoleMascot role="top" interactive />);
    click(container);
    // Unlike attack and hit, the reaction carries no information, so it is
    // dropped rather than degraded.
    expect(actionLayer(container).dataset.playing).toBeUndefined();
    expect(actionLayer(container).className).toBe("role-mascot-action");
  });

  it("cannot navigate, submit or reach the network", () => {
    stubReducedMotion(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<RoleMascot role="top" interactive />);
    const root = container.querySelector(".role-mascot") as HTMLElement;
    // Not a link, not a control, not in the tab order, and no form affordance:
    // there is nothing here for a navigation or a request to hang off.
    expect(root.tagName).toBe("SPAN");
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(root.getAttribute("href")).toBeNull();
    expect(root.getAttribute("tabindex")).toBeNull();
    expect(root.getAttribute("role")).toBeNull();
    click(container);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("offers a host no callback to hang anything on", () => {
    // The strongest guarantee the click is local: the prop simply does not
    // exist, so no surface can turn a mascot tap into a selection or a write.
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/mascot/RoleMascot.tsx"), "utf8");
    const props = src.slice(src.indexOf("export interface RoleMascotProps"),
                            src.indexOf("export function RoleMascot("));
    expect(props).not.toMatch(/\bon[A-Z]\w*\??:/);
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
    const { container } = render(<RoleMascot role="top" imageClassName="opacity-80" />);
    expect(container.querySelector("img")!.className).toContain("opacity-80");
  });

  it("frames the plate as the host asks, and contains by default", () => {
    stubReducedMotion(false);
    const { container } = render(<RoleMascot role="top" />);
    expect(container.querySelector("img")!.className).toContain("object-contain");
    cleanup();
    const cover = render(<RoleMascot role="top" fit="cover" />);
    // `cover` crops the plate's empty head/foot bands so the CHARACTER fills
    // the box. Vertical only — the source is taller than any box it is given.
    expect(cover.container.querySelector("img")!.className).toContain("object-cover");
    expect(cover.container.querySelector("img")!.className).not.toContain("object-contain");
  });

  it("keeps the host's box free of every transform", () => {
    stubReducedMotion(false);
    const { container, rerender } = render(
      <RoleMascot role="top" action={null} actionId={null} className="w-[52%]" />);
    rerender(<RoleMascot role="top" action="attack" actionId={9} className="w-[52%]" />);
    const root = container.querySelector(".role-mascot") as HTMLElement;
    // A parent may size and place this however it likes; nothing the mascot
    // does mid-animation reaches the box it was given, so no host layout can
    // be moved by an action.
    expect(root.style.transform).toBe("");
    expect(root.className).toContain("w-[52%]");
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
