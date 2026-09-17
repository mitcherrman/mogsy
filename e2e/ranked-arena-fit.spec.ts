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
  // RS2 compound worst cases at REAL corpus bounds (188-char prompt, 63-char
  // labels): cinematic art + both, and a family card + both.
  { id: "stressA", what: "Stress A: max prompt, longest labels, cinematic art" },
  { id: "stressB", what: "Stress B: max Combat Calculation prompt, longest labels" },
  // JPM1 — a jungle companion subject and a media-free Jungle Systems plate.
  { id: "junglePet", what: "a Jungle Systems evolved-companion card" },
  { id: "jungleRule", what: "a media-free Jungle Systems plate" },
] as const;

/**
 * Desktop viewports where the lock applies (`lg` and up).
 *
 * RS2 — THE SUPPORTED DESKTOP CONTRACT. The minimum supported desktop Ranked
 * viewport is 1024x768: every viewport here must seat every shape in
 * QUESTIONS with the full geometry contract. Below `lg` (1024 wide) the arena
 * is the stacked layout and is its own contract (see the 390x844 case). A
 * desktop width with LESS than 768 of height is outside the contract — see the
 * 1024x700 boundary probe at the end of this file.
 */
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
    // RS2: a drawn media band never pokes out of its region. Found at
    // 1024x768 Stress B: a 22px family-band floor in a 13px region spilled
    // 9px; the band is now suppressed below the legibility floor instead.
    mediaSpill: (() => {
      const region = document.querySelector('[data-surface-region="media"]');
      if (!region) return 0;
      const rr = region.getBoundingClientRect();
      return Math.max(0, ...[...region.children].map((c) => {
        const r = c.getBoundingClientRect();
        return r.height === 0 ? 0 : Math.round(r.bottom - rr.bottom);
      }));
    })(),
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
        expect(fit.mediaSpill, "the media band overflows its allocated region")
          .toBeLessThanOrEqual(0);
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

test.describe("1024x700 — below the supported desktop contract (boundary probe)", () => {
  test.use({ viewport: { width: 1024, height: 700 } });
  test("stays locked and keeps the Module Rail, even where the longest rounds cannot fit", async ({ page }) => {
    // Documents the boundary; it does NOT require every answer to be seated.
    // Measured: `realMax`, `stressA` and `stressB` put one tablet outside the
    // card here, with the media region already at 0. Seating them would mean
    // shrinking text on supported sizes, which the contract forbids.
    await page.goto("/dev/ranked-shell-probe?q=realMax");
    await page.waitForSelector('[data-testid="ranked-question"]');
    await page.waitForTimeout(900);
    const fit = await page.evaluate(MEASURE) as Fit;
    expect(fit.total).toBeGreaterThan(0);
    expect(fit.pageScroll).toBe(0);
    expect(fit.railInViewport).toBe(true);
  });
});

/**
 * RMOB1 — PHONES ARE THEIR OWN REGIME.
 *
 * Below `lg` the arena is natural document flow and the page scrolls by
 * design, so nothing here asserts that a match fits one screen. These are
 * CORRECTNESS checks only — what is wrong at any mobile design: a tablet cut
 * off or poking out of the parchment, art spilling out of its region, the
 * arena pushing the page sideways, or a hidden inner scroller inside the match.
 * Mobile hierarchy/sizing is deliberately not encoded until it is approved.
 */
const PHONES = [
  { w: 430, h: 932 }, { w: 412, h: 915 }, { w: 393, h: 852 }, { w: 390, h: 844 },
  { w: 375, h: 812 }, { w: 360, h: 800 }, { w: 360, h: 740 },
];

const MEASURE_PHONE = () => {
  const match = document.querySelector('[data-testid="ranked-match"]')!;
  const stage = document.querySelector('[data-testid="ranked-question"]')!.getBoundingClientRect();
  const tablets = [...document.querySelectorAll('[data-surface-region="answers"] [data-quiz-choice]')];
  const vw = document.documentElement.clientWidth;
  const region = document.querySelector('[data-surface-region="media"]');
  const rr = region?.getBoundingClientRect();
  return {
    tablets: tablets.length,
    tabletsOutsideStage: tablets.filter((t) => {
      const r = t.getBoundingClientRect();
      return r.top < stage.top - 0.5 || r.bottom > stage.bottom + 0.5
        || r.left < stage.left - 0.5 || r.right > stage.right + 0.5;
    }).length,
    tabletsClippingText: tablets.filter((t) => t.scrollWidth > t.clientWidth + 1).length,
    mediaSpill: rr ? Math.max(0, ...[...region!.children].map((c) => {
      const r = c.getBoundingClientRect();
      return r.height === 0 ? 0 : Math.round(r.bottom - rr.bottom);
    })) : 0,
    // Arena boxes only; the dev probe's own fixed switcher is not the arena.
    matchWiderThanViewport: [match, ...match.querySelectorAll("*")].some((e) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0) return false;
      let n: Element | null = e.parentElement; // ignore content inside a clipping ancestor
      while (n && n !== match.parentElement) {
        if (/hidden|clip/.test(getComputedStyle(n).overflowX)) return false;
        n = n.parentElement;
      }
      return r.right > vw + 0.5 || r.left < -0.5;
    }),
    innerScrollers: [match, ...match.querySelectorAll("*")].filter((e) => {
      const s = getComputedStyle(e);
      return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1;
    }).map((e) => e.getAttribute("data-testid") ?? e.className.toString().slice(0, 40)),
  };
};

for (const vp of PHONES) {
  test.describe(`RMOB1 phone ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
    for (const id of [...QUESTIONS.map((q) => q.id), "short", "opts2", "metareflex"]) {
      test(`${id}: nothing clipped, spilled, sideways or inner-scrolled`, async ({ page }) => {
        await page.goto(`/dev/ranked-shell-probe?q=${id}`);
        await page.waitForSelector('[data-testid="ranked-question"]');
        await page.waitForTimeout(900);
        const m = await page.evaluate(MEASURE_PHONE);
        if (id !== "metareflex") expect(m.tablets, "no answers rendered").toBeGreaterThan(0);
        expect(m.tabletsOutsideStage, "an answer tablet is outside the parchment").toBe(0);
        expect(m.tabletsClippingText, "an answer label is clipped horizontally").toBe(0);
        expect(m.mediaSpill, "media overflows its region").toBeLessThanOrEqual(0);
        expect(m.matchWiderThanViewport, "the arena overflows the viewport sideways").toBe(false);
        expect(m.innerScrollers, "an accidental nested scroller inside the match").toEqual([]);
      });
    }
  });
}

/**
 * RMOB1 — THE MODULE RAIL CLEARS THE FIXED DOCK.
 *
 * The audit found the Report/Rules tabs (fixed, bottom corners) sitting on the
 * rail at the end of the page: nothing in flow reserved room for them. The
 * shell now pads its foot by `--mogzy-dock-clearance`, so scrolled to the
 * bottom the rail must sit wholly above both tabs.
 */
for (const vp of PHONES) {
  test.describe(`RMOB1 dock clearance ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
    for (const id of ["media", "metareflex"]) {
      test(`${id}: the Module Rail clears the fixed dock at page end`, async ({ page }) => {
        await page.goto(`/dev/ranked-shell-probe?q=${id}`);
        await page.waitForSelector('[data-testid="ranked-question"]');
        await page.waitForTimeout(900);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(300);
        const m = await page.evaluate(() => {
          const rail = document.querySelector('[data-testid="ranked-round-timeline"]')!.getBoundingClientRect();
          const docks = ["mogzy-dock-left", "mogzy-dock-right"]
            .map((d) => document.querySelector(`[data-testid="${d}"]`)?.getBoundingClientRect())
            .filter((r): r is DOMRect => !!r && r.height > 0);
          return { docks: docks.length, overlap: docks.some((d) => d.top < rail.bottom), // The match shell's OWN foot below the rail. Not the document's: a round
            // shorter than the screen leaves `min-h-dvh` page floor, which is not
            // a footer this pass added.
            tail: Math.round(document.querySelector('[data-testid="ranked-match"]')!
              .getBoundingClientRect().bottom - rail.bottom) };
        });
        expect(m.docks, "the probe mounted no dock tabs to clear").toBeGreaterThan(0);
        expect(m.overlap, "a fixed dock tab covers the Module Rail").toBe(false);
        // And no excessive empty footer: clearance, not a spacer.
        expect(m.tail, "an excessive empty footer below the Module Rail").toBeLessThanOrEqual(96);
      });
    }
  });
}

/** RMOB1 — the phone duel strip replaces the banners and keeps its text inside. */
for (const vp of [{ w: 430, h: 932 }, { w: 360, h: 800 }]) {
  test.describe(`RMOB1 duel strip ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
    test("is compact, replaces the banners, and never spills its text", async ({ page }) => {
      await page.goto("/dev/ranked-shell-probe?q=media");
      await page.waitForSelector('[data-testid="ranked-mobile-duel"]');
      await page.waitForTimeout(900);
      const m = await page.evaluate(() => {
        const strip = document.querySelector('[data-testid="ranked-mobile-duel"]')!.getBoundingClientRect();
        const banners = [...document.querySelectorAll('[data-presentation="banner"]')]
          .filter((b) => b.getBoundingClientRect().height > 0).length;
        const spill = [...document.querySelectorAll('[data-testid="ranked-mobile-duel"] *')].some((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.left < strip.left - 0.5 || r.right > strip.right + 0.5
            || r.top < strip.top - 0.5 || r.bottom > strip.bottom + 0.5);
        });
        const header = document.querySelector('[data-testid="ranked-header"]')!.getBoundingClientRect();
        return { stripH: strip.height, banners, spill, headerH: header.height };
      });
      expect(m.banners, "a desktop duel banner is still drawn on a phone").toBe(0);
      expect(m.spill, "duel-strip content spills outside the strip").toBe(false);
      expect(m.stripH, "the duel strip is not compact").toBeLessThanOrEqual(96);
      expect(m.headerH, "the Match Header is not compact").toBeLessThanOrEqual(88);
    });
  });
}
