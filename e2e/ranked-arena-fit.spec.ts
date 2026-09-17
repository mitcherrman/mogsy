/**
 * THE RANKED ARENA FITS, AND THE QUESTION IS INSIDE IT.
 *
 * The viewport lock (RM1) made the arena exactly one viewport tall and asked
 * the media region — the art — to absorb whatever the screen cannot pay for.
 * That trades a scrolling match for a smaller picture, which is the right
 * trade. It becomes the WRONG one the moment the constraint fails to reach the
 * art: `.ranked-panel` is `overflow: hidden`, so a card that is still too tall
 * does not scroll and does not grow — it is silently cut off, and what is cut
 * off is the bottom, and the bottom is the answers.
 *
 * That is exactly what happened. A plain `my-auto` block between the stage and
 * the surface kept its intrinsic height, and at 1280x720 all four answer
 * tablets rendered outside the card. The match was unplayable and every
 * automated check was green, because `document.scrollHeight` is unchanged when
 * content is clipped rather than overflowed.
 *
 * SO THIS FILE MEASURES BOXES, NOT SCROLL HEIGHTS. For each viewport and each
 * question shape it finds the nearest CLIPPING ancestor of the answer grid and
 * compares every tablet's rect against that ancestor's content box. A tablet
 * that is not wholly inside it is a tablet a player cannot read or click,
 * whatever the scroll metrics say.
 */
import { expect, test } from "@playwright/test";

/** Probe states that ship with the route — no fixture of this file's own. */
const QUESTIONS = [
  { id: "opts4", what: "an ordinary four-option round" },
  { id: "media", what: "a rich cinematic item card" },
  { id: "realP99", what: "a p99 prompt with p99 option labels" },
  { id: "realMax", what: "the longest prompt the bank can serve, with its longest options" },
  { id: "family", what: "a Combat Calculation family card" },
] as const;

/** Desktop widths where the lock applies (`lg` and up). */
const LOCKED = [
  { w: 1920, h: 1080 }, { w: 1920, h: 800 }, { w: 1878, h: 797 },
  { w: 1600, h: 900 }, { w: 1600, h: 800 }, { w: 1440, h: 900 },
  { w: 1440, h: 800 }, { w: 1366, h: 768 }, { w: 1280, h: 720 },
  { w: 1024, h: 768 },
];

/**
 * RS1 — the breakpoint SEAMS, one pixel either side. Each pair straddles a
 * rule in `index.css` (the 1280/1500 reserve steps, the 1600x780 wide-desktop
 * override, the 860/861 compaction gate), which is exactly where two rules
 * that each fit on their own can stop fitting together.
 */
const SEAMS = [
  { w: 1279, h: 800 }, { w: 1280, h: 800 }, { w: 1499, h: 800 }, { w: 1500, h: 800 },
  { w: 1599, h: 800 }, { w: 1600, h: 779 }, { w: 1600, h: 780 },
  { w: 1440, h: 860 }, { w: 1440, h: 861 },
];

/**
 * RS1 — THE ARENA'S OWN BOXES, not just the card's.
 *
 * Every assertion above can pass while the whole arena row is wrong: at
 * 1280x720 the grid's implicit `auto` row floored at 480.5px against a 447px
 * grid, so the stage AND both Player Columns overflowed the grid by 34px and
 * sat on top of the status strip — with every answer still inside the card,
 * the Module Rail still on screen and the page not scrolling. The shrink chain
 * never engaged, because the stage never saw a definite height.
 */
type Arena = {
  shellOverViewport: number; gridOverflow: number[];
  stageOverNext: number; stageOverRail: number; railsIntoStage: boolean;
  pageScroll: number;
};

const MEASURE_ARENA = () => {
  const shell = document.querySelector(".ranked-shell")!.getBoundingClientRect();
  const stage = document.querySelector('[data-testid="ranked-question"]')!;
  const focus = document.querySelector('[data-testid="ranked-focus-column"]')!;
  const grid = focus.parentElement!;
  const g = grid.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  const rail = document.querySelector('[data-testid="ranked-round-timeline"]')!
    .getBoundingClientRect();
  const next = grid.nextElementSibling?.getBoundingClientRect();
  const sideCols = [grid.children[0], grid.children[1]]
    .map((c) => (c.firstElementChild ?? c).getBoundingClientRect());
  return {
    shellOverViewport: Math.round(shell.bottom - window.innerHeight),
    gridOverflow: [...grid.children]
      .map((c) => Math.round(c.getBoundingClientRect().bottom - g.bottom)),
    stageOverNext: next ? Math.round(s.bottom - next.top) : -1,
    stageOverRail: Math.round(s.bottom - rail.top),
    railsIntoStage: sideCols.some((r) =>
      r.right > s.left + 0.5 && r.left < s.right - 0.5),
    pageScroll: Math.round(
      document.documentElement.scrollHeight - document.documentElement.clientHeight),
  } satisfies Arena;
};

const expectArenaFits = (a: Arena) => {
  expect(a.shellOverViewport, "the Ranked shell is taller than the viewport")
    .toBeLessThanOrEqual(0);
  expect(Math.max(...a.gridOverflow),
    "an arena column overflows the grid row it was given").toBeLessThanOrEqual(0);
  expect(a.stageOverNext, "the Question Stage runs into the strip below it")
    .toBeLessThanOrEqual(0);
  expect(a.stageOverRail, "the Question Stage crosses the Module Rail")
    .toBeLessThanOrEqual(0);
  expect(a.railsIntoStage, "a Player Column intersects the Question Stage").toBe(false);
  expect(a.pageScroll, "the arena is scrolling the page").toBe(0);
};

type Fit = {
  total: number; inside: number; outside: number;
  clipper: string; promptInside: boolean; mediaPx: number;
  pageScroll: number; railInViewport: boolean;
};

const MEASURE = () => {
  const stage = document.querySelector('[data-testid="ranked-question"]')!;
  const answers = document.querySelector('[data-surface-region="answers"]')!;
  const prompt = document.querySelector('[data-surface-region="prompt"]');
  const band = document.querySelector('[data-testid="scenario-hero"]')
    ?? document.querySelector('[data-testid="scenario-compact"]');
  const rail = document.querySelector('[data-testid="ranked-round-timeline"]');

  /** The nearest ancestor that actually clips — never a scroll height. */
  const clipperOf = (el: Element): Element => {
    let n = el.parentElement;
    while (n && n !== document.documentElement) {
      if (/hidden|clip|auto|scroll/.test(getComputedStyle(n).overflowY)) return n;
      n = n.parentElement;
    }
    return document.documentElement;
  };
  const tablets = [...answers.querySelectorAll("[data-quiz-choice]")];
  const clip = clipperOf(tablets[0] ?? answers);
  const cs = getComputedStyle(clip);
  const cr = clip.getBoundingClientRect();
  const top = cr.top + parseFloat(cs.borderTopWidth);
  const bottom = cr.bottom - parseFloat(cs.borderBottomWidth);
  const whollyInside = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.top >= top - 0.5 && r.bottom <= bottom + 0.5;
  };
  const inside = tablets.filter(whollyInside).length;
  return {
    total: tablets.length, inside, outside: tablets.length - inside,
    clipper: clip.getAttribute("data-testid") ?? clip.tagName.toLowerCase(),
    promptInside: prompt ? whollyInside(prompt.querySelector("h2") ?? prompt) : true,
    mediaPx: band ? Math.round(band.getBoundingClientRect().height) : 0,
    pageScroll: Math.round(
      document.documentElement.scrollHeight - document.documentElement.clientHeight),
    railInViewport: rail
      ? rail.getBoundingClientRect().bottom <= window.innerHeight + 0.5 : false,
    answersInsideStage: (() => {
      const sr = stage.getBoundingClientRect();
      return tablets.every((t) => {
        const r = t.getBoundingClientRect();
        return r.top >= sr.top - 0.5 && r.bottom <= sr.bottom + 0.5
          && r.left >= sr.left - 0.5 && r.right <= sr.right + 0.5;
      });
    })(),
  } satisfies Fit;
};

for (const vp of [...LOCKED, ...SEAMS]) {
  test.describe(`${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });

    for (const q of QUESTIONS) {
      test(`seats every answer of ${q.what}`, async ({ page }) => {
        // `realMax` at 1024 wide was the one residue this file shipped with,
        // marked expected-to-fail. It was never a defect in the shrink chain:
        // the constraint reached the art and the art gave everything it had —
        // the media region was already at 0 and the card was still ~24px short,
        // because the longest prompt the bank can serve paired with its longest
        // option labels wraps to a 284px answer block, and the lock's own rule
        // forbids shrinking text.
        //
        // The 24px turned out to be a seam charged twice, and QV1 Step 2 removed
        // it: a flex `gap` and a sibling `margin-top` do not override one
        // another, so this stage was paying 20px per seam where it should pay 8.
        // The case now lands exactly on the card's inner edge, so the marker is
        // gone and every combination in this file is a required pass.
        await page.goto(`/dev/ranked-shell-probe?q=${q.id}`);
        await page.waitForSelector('[data-testid="ranked-question"]');
        await page.waitForTimeout(900);
        const fit = await page.evaluate(MEASURE) as Fit;

        expect(fit.total, "the round rendered no answers at all").toBeGreaterThan(0);
        // THE ASSERTION THE BUG WOULD HAVE FAILED.
        expect(fit.outside,
          `${fit.outside} of ${fit.total} answer tablets are outside `
          + `<${fit.clipper}>, which clips — a player cannot read or click them`)
          .toBe(0);
        expect(fit.promptInside, "the prompt is clipped by the card").toBe(true);
        // The lock's own promise, from the other side: no scrolling.
        expect(fit.pageScroll, "the arena is scrolling the page").toBe(0);
        // And the rail is the thing scrolling was traded away to keep on screen.
        expect(fit.railInViewport, "the Module Rail is off screen").toBe(true);
        expect(fit.answersInsideStage, "an answer tablet is outside the parchment")
          .toBe(true);
        // RS1: and the card is where the arena put it.
        expectArenaFits(await page.evaluate(MEASURE_ARENA) as Arena);
      });
    }

    test("seats a Meta Reflex round inside the arena", async ({ page }) => {
      await page.goto("/dev/ranked-shell-probe?q=metareflex");
      await page.waitForSelector('[data-testid="ranked-question"]');
      await page.waitForTimeout(900);
      expectArenaFits(await page.evaluate(MEASURE_ARENA) as Arena);
    });

    test("yields the ART before it yields the question", async ({ page }) => {
      // The compression order, observed rather than declared: the same round at
      // the same width renders a SMALLER band on a shorter screen, and its
      // answers stay whole either way.
      await page.goto("/dev/ranked-shell-probe?q=media");
      await page.waitForSelector('[data-testid="ranked-question"]');
      await page.waitForTimeout(900);
      const here = await page.evaluate(MEASURE) as Fit;
      // Still inside the supported fit envelope — this asserts the compression
      // ORDER, not the floor. A height below the envelope is a different
      // question and has its own answer (see the note at the end of the file).
      await page.setViewportSize({ width: vp.w, height: Math.max(720, vp.h - 160) });
      await page.waitForTimeout(600);
      const shorter = await page.evaluate(MEASURE) as Fit;

      expect(shorter.mediaPx,
        "a shorter viewport did not take it out of the art")
        .toBeLessThanOrEqual(here.mediaPx);
      expect(shorter.outside,
        "the answers were cut off instead of the art being made smaller").toBe(0);
    });
  });
}

test.describe("390x844 — below `lg`, nothing is locked", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("keeps the stacked, intrinsic layout and scrolls normally", async ({ page }) => {
    await page.goto("/dev/ranked-shell-probe?q=realMax");
    await page.waitForSelector('[data-testid="ranked-question"]');
    await page.waitForTimeout(900);
    const fit = await page.evaluate(MEASURE) as Fit;
    // Nothing is clipped on a phone, and the page genuinely does scroll — the
    // arena stacks into a column taller than any phone viewport, by design.
    expect(fit.outside).toBe(0);
    expect(fit.pageScroll).toBeGreaterThan(0);
  });
});

/**
 * THE FLOOR, STATED HONESTLY.
 *
 * Everything above asserts the compression ORDER — art first, question never —
 * inside the heights the arena supports. It deliberately does not assert that
 * every conceivable viewport seats every conceivable round, because that is not
 * true and pretending otherwise in a test would only hide it: once the media
 * region has yielded to zero, the prompt and the answers are what is left, and
 * they are `flex: 0 0 auto` on purpose. Below roughly 660px of viewport height
 * at 1280 wide — measured with QV1 Step 2's seam correction in place — the
 * longest four-stacked-answer rounds in the bank need more room than the lock
 * has to give, and the card clips rather than scrolls.
 *
 * That residue is a product decision (accept a minimum supported height, or let
 * the page scroll again in that one case), not a layout defect, and it is
 * recorded rather than encoded. Every height this file DOES test is a required
 * pass — there are no expected failures left in it.
 */
