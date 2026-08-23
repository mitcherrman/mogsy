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

import { SCENE_PADDING, TOME_CHROME } from "./tomeChrome";

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
    for (const key of ["regular", "compact"] as const) {
      const spec = TOME_CHROME[key];
      expect(spec.budget).toBeGreaterThanOrEqual(spec.controls + spec.rail + SCENE_PADDING[key]);
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
