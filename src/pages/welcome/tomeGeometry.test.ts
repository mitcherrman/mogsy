/**
 * The painted spread's page geometry, as a contract (HI1-C4).
 *
 * The tome's two page regions are positioned in index.css against numbers
 * measured off the painting itself, and HI1-C4 added one tunable on top of
 * them: `--tome-page-inward`, how far both compositions sit in from the covers
 * toward the spine. The whole point of a tunable is that a person can retune it
 * after looking at it — which is exactly the change most likely to be made by
 * someone who has not read the file.
 *
 * So the invariants are pinned here rather than left to a reviewer's eye:
 *  - there is ONE knob, not a pair of numbers that can drift apart
 *  - it moves the two pages by the same amount in opposite directions, or the
 *    spread stops being symmetrical about its own spine
 *  - the single phone sheet, which has no covers and no gutter, is exempt
 *  - the finale's exits — the one element as wide as the page box — give the
 *    offset back, which is what keeps them off the fold
 *  - the turning sheet's ghost writing carries the same offset, or the outgoing
 *    words jump sideways the instant the page begins to lift
 *
 * jsdom parses no stylesheet the app ships, so this reads the source. That is
 * the same approach startup-shell.test.ts takes to index.html, and for the same
 * reason: the file IS the contract.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SCENE_PADDING, SNUG_MAX_HEIGHT, TOME_CHROME, chromeKeyFor } from "./tomeChrome";

const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");

/**
 * The declarations of every rule whose selector text starts exactly here.
 *
 * ALL of them, concatenated, not the first: several of these selectors appear
 * more than once on purpose — `.tome-spread` sets its inward offset in one
 * place and its sizing in another, and the leaf's faces are declared once for
 * geometry and once, scoped to the spread, for the paper they are cut from.
 * Reading only the first match made a passing assertion depend on which of two
 * rules happened to come first in the file.
 */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
  if (matches.length === 0) throw new Error(`index.css no longer has a rule for ${selector}`);
  return matches.map((m) => m[1]).join("\n");
}

describe("the inward page offset is one knob", () => {
  it("is declared once as a default and once as the spread's value", () => {
    const declarations = [...css.matchAll(/--tome-page-inward:\s*([^;]+);/g)].map((m) =>
      m[1].trim(),
    );
    expect(declarations).toEqual(["0px", "2.2cqw"]);
  });

  it("is expressed in container units, so it means the same thing everywhere", () => {
    // `cqw` is a percentage of the tome's own drawn width — the same thing
    // every other number in this section is a percentage of. A px or vw value
    // would mean one offset on a phone-sized spread and another on a desktop.
    expect(ruleBody(".tome-spread")).toMatch(/--tome-page-inward:\s*[\d.]+cqw/);
  });

  it("moves the two pages toward each other by the same amount", () => {
    expect(ruleBody(".tome-page-verso")).toContain("left: calc(8% + var(--tome-page-inward))");
    expect(ruleBody(".tome-page-recto")).toContain("left: calc(54% - var(--tome-page-inward))");
  });

  it("leaves the single phone sheet alone", () => {
    // One flat page: no cover to sit in from, no gutter to sit out of.
    expect(ruleBody(".academy-tome")).toContain("--tome-page-inward: 0px");
    expect(css).not.toMatch(/\.tome-single\s*\{[^}]*--tome-page-inward/);
  });
});

describe("nothing is pushed into the gutter", () => {
  it("gives the finale's exits back exactly the offset they were moved by", () => {
    // The exits are the one element that is the page box's FULL width, so they
    // are the one element the inward move would have put over the fold.
    expect(ruleBody(".academy-welcome .tome-exits")).toContain(
      "max-width: calc(100% - var(--tome-page-inward))",
    );
  });

  it("carries the offset onto the turning sheet's writing", () => {
    expect(ruleBody(".tome-leaf-content")).toContain(
      "translateX(calc(-1 * var(--tome-page-inward)))",
    );
  });
});

/* -------------------------------------------------------------------------- */

/**
 * The chrome reservation, as a contract (HI1 polish).
 *
 * The tome stopped moving because the two control rows RESERVE their height
 * instead of measuring their contents — see tomeStability.test.tsx for the
 * whole story and the measured before/after. That is a two-part guarantee, and
 * this is the CSS half: a row that lost its `height`, or gained a `flex: 1`,
 * or started sizing to its children would put the ~29px slide straight back
 * without failing a single behavioural test.
 */
describe("the control rows reserve their height", () => {
  it("declares a fixed height on each row rather than letting it be measured", () => {
    expect(ruleBody(".academy-welcome .tome-controls")).toMatch(
      /height:\s*var\(--tome-controls-h/,
    );
    expect(ruleBody(".academy-welcome .tome-rail")).toMatch(/height:\s*var\(--tome-rail-h/);
  });

  it("keeps both rows out of the column's own flexing", () => {
    // `flex: none` — the scene is `flex-1` and would otherwise be free to
    // stretch or shrink a row, which is the reservation being ignored.
    expect(ruleBody(".academy-welcome .tome-controls,\n.academy-welcome .tome-rail")).toContain(
      "flex: none",
    );
  });

  it("sizes the tome against the budget and against nothing else", () => {
    // The book's width is the smaller of a width budget and a HEIGHT budget,
    // and the height budget's only variable is `--tome-chrome`. If a control's
    // measured height ever entered this expression the book would resize with
    // the controls again.
    const spread = ruleBody(".tome-spread");
    expect(spread).toContain("var(--tome-chrome");
    expect(spread).toMatch(/width:\s*min\(/);
  });

  it("budgets more than the rows and the padding actually take", () => {
    for (const key of ["regular", "snug", "compact"] as const) {
      const spec = TOME_CHROME[key];
      expect(spec.budget).toBeGreaterThanOrEqual(spec.controls + spec.rail + SCENE_PADDING[key]);
    }
  });

  it("still reserves a real gap around controls that are 34px and 33px tall", () => {
    // The reservations are measured, not invented, and `snug` cutting them is
    // the point of WE1 — but a reservation that no longer clears the control
    // inside it is the tome sliding down the screen again.
    for (const key of ["regular", "snug", "compact"] as const) {
      expect(TOME_CHROME[key].controls).toBeGreaterThan(34);
      expect(TOME_CHROME[key].rail).toBeGreaterThan(33);
    }
  });

  it("floors the tome's entrance transform, so a clock that never runs cannot hold it small", () => {
    // `animation: tome-open ... both` opens from `scale(0.82) rotateX(24deg)`.
    // A browser that has the document hidden does not advance the clock, and
    // `both` fill then holds the book at that frame — measurably ~15% narrower
    // and ~33% shorter than the book it is meant to be. The declared value is
    // the steady state whenever the keyframes are not playing.
    const opened = ruleBody('.academy-welcome[data-ready="true"] .tome-opening');
    expect(opened).toContain("opacity: 1");
    expect(opened).toContain("transform: none");
    expect(opened).toContain("animation: tome-open");
  });
});

/* -------------------------------------------------------------------------- */

/**
 * The turning sheet, as a contract.
 *
 * Two things about the page turn are geometry rather than taste, and both are
 * invisible until they are wrong:
 *
 *  - the leaf is the DRAWN PAPER — x 50–92%, y 13–88% of the tome, measured off
 *    academy-book-spread.png — so it starts and ends flush with a real page
 *  - both faces are cut out of that same painting, at offsets derived from the
 *    <img>'s own size and negative margins, so the sheet is never a different
 *    cream from the book it belongs to
 *
 * A stray edit to any one of those five numbers reintroduces the slab.
 */
describe("the turning sheet is the book's own paper", () => {
  it("is the drawn page, not a rectangle over it", () => {
    const leaf = ruleBody(".tome-leaf-right");
    expect(leaf).toContain("left: 50%");
    expect(leaf).toContain("right: 8%");
    expect(leaf).toContain("top: 13%");
    expect(leaf).toContain("bottom: 12%");
  });

  it("lands its cast shadow on the facing page's paper, which is that box mirrored", () => {
    const shade = ruleBody(".tome-leaf-shade");
    expect(shade).toContain("left: 8%");
    expect(shade).toContain("width: 42%");
    expect(shade).toContain("top: 13%");
    expect(shade).toContain("bottom: 12%");
  });

  it("cuts both faces out of the painting rather than inventing a beige", () => {
    const shared = ruleBody(".tome-spread .tome-leaf-front,\n.tome-spread .tome-leaf-back");
    expect(shared).toContain("background-image: var(--tome-paper)");
    // The painting at its own scale: 1/0.768 of the tome's width, and 0.666 of
    // that again for its height.
    expect(shared).toContain("background-size: 130.21cqw 86.72cqw");

    // Front face shows the right page; back face shows the left one. Both are
    // the image's own corner minus this box's origin.
    expect(ruleBody(".tome-spread .tome-leaf-front")).toContain(
      "background-position: -65.1cqw -14.69cqw",
    );
    expect(ruleBody(".tome-spread .tome-leaf-back")).toContain(
      "background-position: -23.1cqw -14.69cqw",
    );
  });

  it("leaves no hand-written parchment gradient anywhere in the turn", () => {
    // The old faces were `linear-gradient(103deg, #efe3c6 …)` and its mirror —
    // a cream that simply was not the painting's.
    expect(css).not.toContain("#efe3c6");
    expect(css).not.toContain("#ddcda6");
  });

  it("runs the sheet, its fold light and its cast shadow on one clock and one curve", () => {
    const stage = ruleBody(".tome-leaf-stage");
    expect(stage).toMatch(/--tome-turn-ms:\s*980ms/);
    expect(stage).toMatch(/--tome-turn-ease:\s*cubic-bezier\(/);
    for (const selector of [".tome-leaf", ".tome-leaf-front::after", ".tome-leaf-shade"]) {
      expect(ruleBody(selector)).toContain("var(--tome-turn-ms) var(--tome-turn-ease)");
    }
  });

  it("lands flat", () => {
    // -178deg left the sheet visibly short of the page under it at the exact
    // moment the eye was on it. It must still stop clear of 180deg, where the
    // two faces fight for the same plane.
    const turn = css.match(/@keyframes tome-leaf-turn\s*\{([\s\S]*?)\n\}/)![1];
    const last = Number(turn.match(/100%\s*\{\s*transform:\s*rotateY\((-[\d.]+)deg\)/)![1]);
    expect(last).toBeLessThan(-179);
    expect(last).toBeGreaterThan(-180);
  });
});

/* -------------------------------------------------------------------------- */

/**
 * The last spread's page box.
 *
 * The finale claims more of the painted sheet than a chapter does, and there is
 * a hard limit on how much is actually there: measured column by column, the
 * drawn paper runs y 13–90% of the tome through the middle of each page. An
 * earlier 9%/8% was past its top edge everywhere and printed the finale's lower
 * control onto the painted frame.
 */
describe("the last spread stays on the paper", () => {
  it("claims the slack that exists and no more", () => {
    const box = ruleBody('.academy-welcome .tome-page:has(.tome-writing[data-finale])');
    const top = Number(box.match(/top:\s*([\d.]+)%/)![1]);
    const bottom = Number(box.match(/bottom:\s*([\d.]+)%/)![1]);
    // Inside the drawn paper at both ends...
    expect(top).toBeGreaterThanOrEqual(12);
    expect(100 - bottom).toBeLessThanOrEqual(90);
    // ...and still more room than a chapter's page gets, or it is pointless.
    expect(top).toBeLessThan(15);
    expect(bottom).toBeLessThan(13);
  });
});

/* -------------------------------------------------------------------------- */

/**
 * WE1 — the composition fits the budget, and the budget is a real budget.
 *
 * The failure this pass closed was not a missing breakpoint. It was that the
 * tome's vertical budget existed and the CONTENT did not honour it: the phone's
 * sheet claimed the budget as a MINIMUM and grew past it (570px against a 360px
 * budget at 320x568, with the rail 134px under the fold), and the painted
 * spread's writing kept its size after the page it was written on had stopped
 * keeping its own (a 1024x580 window printed the register 23px past the page
 * box, top and bottom).
 *
 * The rules below are what makes that not come back. Every one of them is the
 * mechanism of a measured failure, not a style preference.
 */
describe("WE1 — the phone sheet is a budget, not a suggestion", () => {
  it("states a height rather than a minimum, so a dense chapter cannot grow the book", () => {
    const sheet = ruleBody(".academy-welcome .tome-single > .tome-sheet");
    expect(sheet).toMatch(/height:\s*min\(calc\(100dvh - var\(--tome-chrome/);
    expect(sheet).not.toMatch(/min-height:/);
  });

  it("keeps the emergency growth, and keeps it behind a pathological height", () => {
    // Below 520px of portrait height nothing composes honestly, so the sheet is
    // handed back its old grow-and-scroll behaviour rather than clipping a word.
    // Every phone in the WE1 set is taller than this.
    const hatch = css.match(
      /@media \(orientation: portrait\) and \(max-height: 520px\) \{([\s\S]*?)\n\}/,
    );
    expect(hatch).not.toBeNull();
    expect(hatch![1]).toContain("height: auto");
    expect(hatch![1]).toMatch(/min-height:\s*min\(calc\(100dvh/);
  });

  it("makes the artwork the element that gives ground", () => {
    const art = ruleBody(".tome-single-art");
    // `flex: 0 1 auto` over a stated height: the plate says how big it wants to
    // be, the sheet's budget says how big it gets. `min-height: 0` is what lets
    // a flex item shrink below its content at all.
    expect(art).toContain("flex: 0 1 auto");
    expect(art).toContain("min-height: 0");
    // And it does NOT clip: every plate is `h-full` inside this box, so a
    // shorter box is a smaller plate — while Mogzy's entrance haze is inset
    // past the slot's edges on purpose and would meet a hard cut.
    expect(art).not.toContain("overflow: hidden");
  });

  it("does not shrink the artwork by height band instead", () => {
    // A per-band `height` on the slot would make the plate small on every
    // chapter of a short phone, including the four with room to spare. The
    // budget decides per PAGE, which is only possible if there is one height.
    // The landscape sheet's own slot is a different LAYOUT — art beside the
    // writing rather than above it — and keeps its own height; it is not a
    // height band of the portrait one.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const heights = [...bare.matchAll(/([^{}]*\.tome-single-art[^{}]*)\{([^}]*)\}/g)]
      .filter(([, selector]) => {
        const trimmed = selector.trim();
        return trimmed !== ".tome-single-art" && !trimmed.includes("tome-single-wide");
      })
      .map(([, , body]) => body)
      .filter((body) => /height:\s*min\(\d+dvh/.test(body));
    expect(heights).toHaveLength(0);
    expect(ruleBody(".tome-single-art")).toMatch(/height:\s*min\(30dvh, 190px\)/);
  });

  it("does not let the writing shrink with it", () => {
    expect(ruleBody(".academy-welcome .tome-single .tome-single-body")).toContain("flex: 0 0 auto");
  });

  it("exempts the finale's left page, which is a page and not a picture", () => {
    // Cropping a plate is a crop; cropping this slot is clipping words.
    const finale = ruleBody(".academy-welcome .tome-single-art:has(.tome-writing)");
    expect(finale).toContain("flex: 0 0 auto");
    expect(finale).toContain("height: auto");
  });

  it("never sets a body font-size in the short-height blocks", () => {
    // The order of sacrifice is artwork, then decorative spacing, then display
    // type. Body copy is not in it: it stays at its shipped size at every
    // supported viewport.
    for (const maxHeight of [700, 600]) {
      const block = css.match(
        new RegExp(
          `@media \\(orientation: portrait\\) and \\(max-height: ${maxHeight}px\\) \\{([\\s\\S]*?)\\n\\}\\n`,
        ),
      );
      expect(block, `no portrait max-height ${maxHeight} block`).not.toBeNull();
      expect(block![1]).not.toMatch(/\.tome-body\s*\{[^}]*font-size/);
    }
  });
});

describe("WE1 — the painted spread compacts by its own width", () => {
  it("asks the tome, not the viewport, how much room the dense pages have", () => {
    // `.academy-tome` is the `container-type: inline-size` element every `cqw`
    // on these pages already resolves against, and its width is the min of the
    // width budget and the height budget — so one container query on it is the
    // joint width-and-height condition, stated once and in the right unit.
    expect(css).toMatch(/@container \(max-width: 660px\) \{/);
    const block = css.match(/@container \(max-width: 660px\) \{([\s\S]*?)\n\}\n/);
    expect(block).not.toBeNull();
    // Only the painted spread: the phone sheet is inside the same container and
    // has its own, differently-shaped compaction.
    for (const selector of block![1].matchAll(/^\s{2}(\.[^{]+)\{/gm)) {
      expect(selector[1]).toContain(".tome-spread ");
    }
  });

  it("brings the finale graph's floor down with the book", () => {
    // At a 514px tome the graph's `13cqw` term is ~67px and its 5rem floor was
    // holding it at 80 — enough, on its own, to push the lower exit off the
    // paper. It is still the page's anchor and still takes what the copy leaves.
    const block = css.match(/@container \(max-width: 660px\) \{([\s\S]*?)\n\}\n/)![1];
    expect(block).toMatch(/\.tome-finale-graph \{[^}]*min-height:\s*clamp\(3\.25rem/);
  });

  it("takes nothing away from the register but its air", () => {
    const block = css.match(/@container \(max-width: 660px\) \{([\s\S]*?)\n\}\n/)![1];
    // No display:none, no font-size on an input, no change of control.
    expect(block).not.toMatch(/display:\s*none/);
    expect(block).not.toMatch(/\.tome-field-input/);
  });
});

describe("WE1 — which budget a viewport reads", () => {
  // The acceptance set, and the two shapes that were measured failing. The
  // ones at or above 768px tall must still read `regular`, because their
  // composition is the one that ships today and must not move.
  const CASES: [number, number, "regular" | "snug" | "compact"][] = [
    [320, 568, "snug"],
    [360, 640, "snug"],
    [390, 664, "snug"],
    [390, 844, "regular"],
    [430, 932, "regular"],
    [667, 375, "compact"],
    [844, 390, "compact"],
    [768, 1024, "regular"],
    [1024, 768, "regular"],
    [1024, 580, "snug"],
    [1366, 768, "regular"],
    [1440, 900, "regular"],
    [1920, 1080, "regular"],
  ];

  function tier(width: number, height: number) {
    // The same resolution useViewportTier makes, restated so this test does not
    // depend on a hook that belongs to the entrance.
    if (height < 560 && width > height) return "phone-landscape" as const;
    if (width < 640) return "phone" as const;
    if (width < 1024) return "tablet" as const;
    return "desktop" as const;
  }

  it.each(CASES)("%ix%i reads %s", (width, height, expected) => {
    expect(chromeKeyFor(tier(width, height), height)).toBe(expected);
  });

  it("leaves every viewport at or above the reference laptop's height alone", () => {
    // 1366x768 is the short desktop reference. `snug` must not reach it, or the
    // shipped desktop composition changes.
    expect(SNUG_MAX_HEIGHT).toBeLessThan(768);
  });
});
