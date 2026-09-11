/**
 * WHERE THE FILTER MENU OPENS.
 *
 * The owner's requirement is absolute: the League menu drops DOWNWARD and
 * never flips above its trigger, however little room is left beneath it.
 *
 * Radix's `side="bottom"` is only a PREFERENCE — with collision handling on,
 * floating-ui flips the panel above the trigger as soon as the space below is
 * short. The only way to forbid that is `avoidCollisions={false}`, and that
 * flag governs BOTH axes: an earlier pass used it and the 375px Team menu ran
 * to x=512 on a 375px screen. So this file pins both halves of the bargain:
 *
 *   1. the panel never renders above the trigger, and
 *   2. it is still horizontally contained, which floating-ui is no longer
 *      doing for us.
 *
 * jsdom has no layout, so the DOM cannot answer "where did it paint". What it
 * CAN answer is what the component asked for, and that is what decides
 * placement: `data-side`, `avoidCollisions`, and the height the component
 * computed from the space beneath the trigger.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterCombobox, availableBelow, alignFor } from "./FilterCombobox";

const OPTIONS = Array.from({ length: 60 }, (_, i) => ({
  value: `League ${i}`,
  label: `League ${i}`,
}));

function open() {
  const trigger = screen.getByRole("combobox", { name: /League/i });
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
  return trigger;
}

function renderCombo() {
  return render(
    <FilterCombobox label="League" value="" onChange={() => {}} options={OPTIONS} />,
  );
}

/** A trigger at a given viewport position, without needing real layout. */
function fakeTrigger(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement("span");
  el.getBoundingClientRect = () =>
    ({ top: 0, bottom: 0, left: 0, right: 0, width: 130, height: 36, x: 0, y: 0,
       toJSON: () => ({}), ...rect }) as DOMRect;
  return el;
}

afterEach(cleanup);

describe("the menu opens downward, always", () => {
  it("asks for the bottom side", () => {
    renderCombo();
    open();
    const content = screen.getByRole("dialog");
    expect(content.getAttribute("data-side")).toBe("bottom");
    expect(content.getAttribute("data-downward-only")).toBe("true");
  });

  it("FORBIDS the flip rather than merely preferring not to", () => {
    // THE ASSERTION THAT FAILS IF THE POPOVER IS EVER ALLOWED ABOVE ITS
    // TRIGGER, and it has to be written against the source.
    //
    // jsdom reports every rect as 0x0, so floating-ui never detects a
    // collision and never flips: a rendered `data-side` is "bottom" here even
    // with collision handling fully ON. A DOM assertion therefore cannot tell
    // the two configurations apart -- it passes either way, which is worse
    // than no test. `avoidCollisions={false}` is the only thing that makes
    // downward-only a guarantee instead of a preference, so that is what is
    // pinned. (Verified in a real browser at 1280x800: trigger at y=814,
    // panel at y=814, data-side "bottom", list shrunk to its 128px floor.)
    const src = readFileSync(
      path.join(process.cwd(), "src/components/pro-play/FilterCombobox.tsx"),
      "utf8",
    );
    expect(src).toMatch(/avoidCollisions=\{false\}/);
    expect(src).not.toMatch(/avoidCollisions(\s|>|=\{true\})/);
  });

  it("never renders above its trigger", () => {
    renderCombo();
    const trigger = open();
    const content = screen.getByRole("dialog");
    // Radix only emits data-side="top" when it has flipped the panel above
    // the anchor; that value appearing here IS the regression.
    expect(content.getAttribute("data-side")).not.toBe("top");
    expect(content.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_PRECEDING)
      .toBeTruthy();
  });

  it("shrinks instead of flipping when space below runs out", () => {
    // 800px viewport, trigger near the bottom: the menu must get shorter, not
    // move above the control.
    vi.stubGlobal("innerHeight", 800);
    const roomy = availableBelow(fakeTrigger({ bottom: 100 }));
    const cramped = availableBelow(fakeTrigger({ bottom: 700 }));
    expect(cramped).toBeLessThan(roomy);
    // ...but never to nothing, and never past the cap that fixed the original
    // "covers the whole viewport" complaint.
    expect(cramped).toBeGreaterThanOrEqual(128);
    expect(roomy).toBeLessThanOrEqual(320);
    vi.unstubAllGlobals();
  });

  it("keeps a usable floor even with the trigger off the bottom edge", () => {
    vi.stubGlobal("innerHeight", 800);
    expect(availableBelow(fakeTrigger({ bottom: 900 }))).toBe(128);
    vi.unstubAllGlobals();
  });
});

describe("horizontal containment, which floating-ui is no longer doing", () => {
  it("hangs from the left edge when there is room to the right", () => {
    vi.stubGlobal("innerWidth", 1280);
    expect(alignFor(fakeTrigger({ left: 200, right: 330 }))).toBe("start");
    vi.unstubAllGlobals();
  });

  it("hangs from the right edge when the panel would overflow", () => {
    // The exact 375px Team-filter case that ran to x=512 before this fix.
    vi.stubGlobal("innerWidth", 375);
    expect(alignFor(fakeTrigger({ left: 192, right: 330 }))).toBe("end");
    vi.unstubAllGlobals();
  });

  it("does not flip to the right edge when that would overflow too", () => {
    // A trigger narrower than the panel near the left edge: flipping would
    // push the panel off the LEFT, so it stays put.
    vi.stubGlobal("innerWidth", 375);
    expect(alignFor(fakeTrigger({ left: 8, right: 140 }))).toBe("start");
    vi.unstubAllGlobals();
  });

  it("is safe when there is no trigger to measure", () => {
    expect(alignFor(null)).toBe("start");
    expect(availableBelow(null)).toBe(320);
  });
});
