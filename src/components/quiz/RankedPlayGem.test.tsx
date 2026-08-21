/**
 * LC1 — the PLAY seal: the same one action as the button it replaces, with
 * real button semantics and no information carried by animation alone.
 *
 * The material is now `play-seal.png`, which has the word PLAY baked into it.
 * That makes the visible word un-editable from here, so the tests below pin
 * the thing that still has to hold: the control is a real button, its
 * accessible name is exactly "Play", and the art is decorative — never the
 * only carrier of the name.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import RankedPlayGem from "./RankedPlayGem";

afterEach(cleanup);

/**
 * The reduced-motion block that actually governs THIS component.
 *
 * Anchored on a selector the block must contain, not on `lastIndexOf` — index.css
 * carries a dozen `prefers-reduced-motion` blocks and "the last one" is whichever
 * feature appended CSS most recently, which is not a fact about this component.
 */
const reducedMotionBlockContaining = (css: string, anchor: string): string => {
  const starts = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)/g)].map(
    (m) => m.index as number,
  );
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const block = css.slice(starts[i], starts[i + 1] ?? css.length);
    if (block.includes(anchor)) return block;
  }
  throw new Error(`no reduced-motion block contains ${anchor}`);
};

describe("RankedPlayGem", () => {
  it("is a real button whose accessible name is exactly the visible word", () => {
    render(<RankedPlayGem onClick={() => {}} />);
    const gem = screen.getByRole("button", { name: /^Play$/ });
    expect(gem.tagName).toBe("BUTTON");
    expect(gem.getAttribute("type")).toBe("button");
  });

  it("fires the host's action on click", () => {
    const onClick = vi.fn();
    render(<RankedPlayGem onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("activates from the keyboard (native button activation)", () => {
    const onClick = vi.fn();
    render(<RankedPlayGem onClick={onClick} />);
    const gem = screen.getByRole("button", { name: /^Play$/ });
    act(() => gem.focus());
    expect(document.activeElement).toBe(gem);
    fireEvent.keyDown(gem, { key: "Enter" });
    fireEvent.keyUp(gem, { key: "Enter" });
    // jsdom does not synthesise the click from keydown, so assert the real
    // contract instead: the element is a focusable native button, which is
    // what makes Enter/Space work in a browser.
    fireEvent.click(gem);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("depresses on pointer down and springs back on release", () => {
    render(<RankedPlayGem onClick={() => {}} />);
    const gem = screen.getByTestId("ranked-play-gem");
    expect(gem.getAttribute("data-pressed")).toBe("false");
    fireEvent.pointerDown(gem);
    expect(gem.getAttribute("data-pressed")).toBe("true");
    fireEvent.pointerUp(gem);
    expect(gem.getAttribute("data-pressed")).toBe("false");
  });

  it("shows the pressed state for a keyboard press too", () => {
    render(<RankedPlayGem onClick={() => {}} />);
    const gem = screen.getByTestId("ranked-play-gem");
    fireEvent.keyDown(gem, { key: " " });
    expect(gem.getAttribute("data-pressed")).toBe("true");
    fireEvent.keyUp(gem, { key: " " });
    expect(gem.getAttribute("data-pressed")).toBe("false");
  });

  it("releases the pressed state when the pointer leaves mid-press", () => {
    render(<RankedPlayGem onClick={() => {}} />);
    const gem = screen.getByTestId("ranked-play-gem");
    fireEvent.pointerDown(gem);
    fireEvent.pointerLeave(gem);
    expect(gem.getAttribute("data-pressed")).toBe("false");
  });

  it("when disabled, neither fires nor depresses", () => {
    const onClick = vi.fn();
    render(<RankedPlayGem onClick={onClick} disabled />);
    const gem = screen.getByTestId("ranked-play-gem");
    expect(gem.hasAttribute("disabled")).toBe(true);
    fireEvent.pointerDown(gem);
    expect(gem.getAttribute("data-pressed")).toBe("false");
    fireEvent.click(gem);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps its label readable with motion off — nothing is animation-only", () => {
    // jsdom reports no `prefers-reduced-motion` match, which is the branch
    // framer's useReducedMotion treats as reduced; the label, the role and
    // the disabled state must all still be present either way.
    render(<RankedPlayGem onClick={() => {}} label="Play" />);
    expect(screen.getByTestId("ranked-play-gem").textContent).toContain("Play");
  });

  it("renders the wax as a decorative material layer, not as the button's paint", () => {
    // A background on the CONTROL would put a rectangle of shadow and focus
    // ring around an object with transparent corners.
    render(<RankedPlayGem onClick={() => {}} />);
    const seal = screen.getByTestId("ranked-play-gem");
    const material = seal.querySelector(".lc-seal__material");
    expect(material).toBeTruthy();
    expect(material!.getAttribute("aria-hidden")).toBe("true");
    expect(seal.querySelector(".lc-seal__glint")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("names the button from live text, even though the word is baked into the art", () => {
    // The art says PLAY; assistive technology must not have to read a
    // picture to find that out. The label is live text, visually hidden.
    render(<RankedPlayGem onClick={() => {}} />);
    const seal = screen.getByRole("button", { name: /^Play$/ });
    const label = seal.querySelector(".lc-seal__label")!;
    expect(label.textContent).toBe("Play");
    expect(label.className).toContain("sr-only");
    // Nothing decorative may carry the name.
    expect(seal.querySelector(".lc-seal__material")!.textContent).toBe("");
  });
});

describe("the PLAY seal's CSS invariants", () => {
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = (selector: string) => {
    const rule = css.match(new RegExp(`${escape(selector)}\\s*\\{([^}]*)\\}`));
    expect(rule, `no rule for ${selector}`).toBeTruthy();
    return rule![1];
  };

  it("renders the seal from the shipped asset, not from a second copy of it", () => {
    expect(block(".lc-seal")).toContain('url("/assets/ranked/play-seal.png")');
    // One art path only: the material and the glint mask read the same var,
    // so the browser fetches the seal once and reuses it for the mask.
    expect(block(".lc-seal__material")).toContain("var(--lc-seal-art)");
    expect(block(".lc-seal__glint")).toContain("mask-image: var(--lc-seal-art)");
    expect(css.match(/url\("\/assets\/ranked\/play-seal\.png"\)/g)!.length).toBe(1);
  });

  it("leaves the control unpainted, so its focus ring is the seal's shape", () => {
    const seal = block(".lc-seal");
    expect(seal).toContain("background: none");
    expect(seal).toContain("border: 0");
    expect(block(".lc-seal:focus-visible")).toContain("outline");
  });

  it("answers hover, press and disabled — each as its own state", () => {
    expect(block(".lc-seal:hover:not(:disabled)")).toContain("--lc-seal-glow");
    // Pressed is a physical depression: down, smaller, with the shadow
    // compressing under it rather than merely moving with it.
    const pressed = block('.lc-seal[data-pressed="true"]:not(:disabled)');
    expect(pressed).toContain("--lc-seal-lift: 3px");
    expect(pressed).toContain("--lc-seal-scale: 0.976");
    expect(pressed).toContain("--lc-seal-shadow-blur: 6px");
    expect(block(".lc-seal:disabled .lc-seal__material")).toMatch(/saturate|brightness/);
  });

  it("lets a press win over a hover, by source order as well as specificity", () => {
    expect(css.indexOf('.lc-seal[data-pressed="true"]:not(:disabled)')).toBeGreaterThan(
      css.indexOf(".lc-seal:hover:not(:disabled)"),
    );
  });

  it("goes quiet when disabled — nothing that still looks pressable", () => {
    expect(block(".lc-seal:disabled .lc-seal__glint")).toMatch(/display:\s*none/);
    expect(block(".lc-seal:disabled")).toContain("not-allowed");
  });

  it("under reduced motion, changes light but never travels", () => {
    const reduced = reducedMotionBlockContaining(css, "--lc-seal-scale: 1");
    expect(reduced).toContain("--lc-seal-scale: 1");
    expect(reduced).toContain("--lc-seal-lift: 0px");
    expect(reduced).toContain(".lc-seal__glint");
    // The ambient glow is a property of the object, not an animation, so it
    // survives: the seal keeps its whole identity with motion off.
    expect(reduced).not.toMatch(/--lc-seal-glow:/);
  });
});
