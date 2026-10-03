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

test.describe("360x740 — below `lg` the arena is a FLOOR, never a lock", () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  test("a round taller than the phone scrolls the page whole instead of clipping", async ({ page }) => {
    // RMOB2 made the phone arena one screen tall — as a `min-height`, not a
    // height. The longest synthetic stress round genuinely cannot fit the
    // shortest supported phone, and when it does not, the page scrolls and
    // nothing is cut off.
    await page.goto(`/dev/ranked-shell-probe?q=stressB${LIVE_PHONE}`);
    await page.waitForSelector('[data-testid="ranked-question"]');
    await page.waitForTimeout(900);
    const fit = await page.evaluate(MEASURE) as Fit;
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
 * RMOB2 — THE PHONE ONE-SCREEN ARENA.
 *
 * Measured in the LIVE match shape: a role match with no progression layer, a
 * ten-module points match three modules in (so each player has settled
 * history), a real display name, and the match mounted bare exactly as
 * `QuizRankedPage` mounts it (`frame=0`).
 *
 * What is asserted is the composition's CORRECTNESS and the fit contract the
 * owner approved: ordinary rounds (every shape below except the two synthetic
 * 188-character stress rounds) are exactly one screen on every supported
 * phone; the stress rounds are one screen from 375x812 up and otherwise scroll
 * the page whole (see the 360x740 floor test above).
 */
const LIVE_PHONE = "&points=4:7-5&name=Kalista_Enjoyer&role=mid&orole=support&progression=0&frame=0";
const ORDINARY = ["media", "family", "realP99", "realMax", "short", "opts2", "opts4", "metareflex"];

const MEASURE_ONE_SCREEN = () => {
  const vw = document.documentElement.clientWidth;
  const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
  const inside = (r: DOMRect, box: DOMRect) =>
    r.left >= box.left - 0.5 && r.right <= box.right + 0.5
    && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
  const bar = rect('[data-testid="ranked-mobile-matchbar"]');
  const bottom = rect('[data-testid="ranked-mobile-bottombar"]');
  const timeline = rect('[data-testid="mobile-ranked-round-timeline"]');
  const clip = document.querySelector('[data-testid="mobile-ranked-round-timeline"] .ranked-timeline-clip')
    ?.getBoundingClientRect() ?? null;
  const tabs = ["question-report-tab", "ranked-rules-tab"]
    .map((id) => document.querySelector(`[data-testid="${id}"]`))
    .filter((e): e is Element => !!e && e.getBoundingClientRect().height > 0);
  const textSpills = [...document.querySelectorAll(
    '[data-testid="ranked-mobile-matchbar"] [data-testid^="mobile-name-"], '
    + '[data-testid="ranked-mobile-matchbar"] [data-testid^="mobile-status-"]')]
    .some((e) => {
      const r = e.getBoundingClientRect();
      if (bar && !inside(r, bar)) return true;
      // Truncation is allowed ONLY as a drawn ellipsis, never as a hard cut.
      const cut = [e, ...e.querySelectorAll("*")].some((n) =>
        n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).textOverflow !== "ellipsis"
        && getComputedStyle(n).overflowX !== "visible");
      return cut;
    });
  const nodes = timeline && clip
    ? [...document.querySelectorAll('[data-testid="mobile-ranked-round-timeline"] li')]
      .filter((n) => { const r = n.getBoundingClientRect(); return r.left >= clip.left - 1 && r.right <= clip.right + 1; })
    : [];
  const match = document.querySelector('[data-testid="ranked-match"]')!;
  return {
    bar: bar ? { top: bar.top, bottom: bar.bottom, left: bar.left, right: bar.right } : null,
    barInWidth: !!bar && bar.left >= -0.5 && bar.right <= vw + 0.5,
    timerInBar: !!bar && !!rect('[data-testid="mobile-clock"]')
      && inside(rect('[data-testid="mobile-clock"]')!, bar),
    textSpills,
    bubbles: ["userA", "userB"].map((id) =>
      document.querySelectorAll(`[data-testid^="mobile-recent-bubble-${id}-"]`).length),
    bottomInWidth: !!bottom && bottom.left >= -0.5 && bottom.right <= vw + 0.5,
    tabsInBar: tabs.length > 0 && !!bottom && tabs.every((t) => inside(t.getBoundingClientRect(), bottom)),
    tabsOverTimeline: !!timeline && tabs.some((t) => {
      const r = t.getBoundingClientRect();
      return r.right > timeline.left + 0.5 && r.left < timeline.right - 0.5;
    }),
    tabMascots: tabs.reduce((n, t) => n + t.querySelectorAll('[data-testid="mascot"], img').length, 0),
    visibleNodes: nodes.length,
    currentVisible: nodes.some((n) => n.getAttribute("aria-current") === "step"),
    desktopHeaderShown: (rect('[data-testid="ranked-header"]')?.height ?? 0) > 0,
    desktopTimelineShown: (rect('[data-testid="ranked-round-timeline"]')?.height ?? 0) > 0,
    nested: [match, ...match.querySelectorAll("*")].filter((e) => {
      const st = getComputedStyle(e);
      return /auto|scroll/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 1;
    }).length,
    pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    pageSideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};

for (const vp of PHONES) {
  test.describe(`RMOB2 one-screen ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true });
    const shapes = [...ORDINARY, "stressA", "stressB"];
    for (const id of shapes) {
      test(`${id}: composition is correct${ORDINARY.includes(id) || vp.h >= 812 ? " and fits one screen" : ""}`,
        async ({ page }) => {
          await page.goto(`/dev/ranked-shell-probe?q=${id}${LIVE_PHONE}`);
          await page.waitForSelector('[data-testid="ranked-mobile-bottombar"]');
          // Let the resume backfill settle the history bubbles.
          await page.waitForSelector('[data-testid^="mobile-recent-bubble-userB-"]');
          await page.waitForTimeout(600);
          const m = await page.evaluate(MEASURE_ONE_SCREEN);

          expect(m.bar, "no phone match bar").not.toBeNull();
          expect(m.barInWidth, "the match bar is wider than the phone").toBe(true);
          expect(m.timerInBar, "the timer is outside the match bar").toBe(true);
          expect(m.textSpills, "a name or status spills or is hard-cut").toBe(false);
          expect(m.bubbles, "each player shows exactly two recent results").toEqual([2, 2]);
          expect(m.desktopHeaderShown, "the desktop header strip is drawn on a phone").toBe(false);
          expect(m.desktopTimelineShown, "the 9-node desktop rail is drawn on a phone").toBe(false);

          expect(m.bottomInWidth, "the bottom bar is wider than the phone").toBe(true);
          expect(m.tabsInBar, "Report/Rules are not in the bottom bar").toBe(true);
          expect(m.tabsOverTimeline, "a Report/Rules control overlaps the timeline").toBe(false);
          expect(m.tabMascots, "the phone Report/Rules controls still carry mascot art").toBe(0);
          expect(m.visibleNodes, "the phone timeline window is not five modules").toBe(5);
          expect(m.currentVisible, "the current module is not in the window").toBe(true);

          expect(m.nested, "an accidental nested scroller").toBe(0);
          expect(m.pageSideways, "the page scrolls sideways").toBeLessThanOrEqual(0);
          if (ORDINARY.includes(id) || vp.h >= 812) {
            expect(m.pageScroll, "this round should be exactly one screen").toBeLessThanOrEqual(0);
          }

          if (id === "metareflex") return; // its own comparison cards, no answer grid
          const fit = await page.evaluate(MEASURE) as Fit;
          expect(fit.outside, "an answer tablet is outside its clipping box").toBe(0);
          expect(fit.answersInsideStage, "an answer tablet is outside the parchment").toBe(true);
          expect(fit.mediaSpill, "media overflows its region").toBeLessThanOrEqual(0);
        });
    }
  });
}

test.describe("RMOB2 compact phone HUD", () => {
  test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  test("is 40px tall and every control still takes a 44px-tall touch", async ({ page }) => {
    await page.goto(`/dev/ranked-shell-probe?q=media${LIVE_PHONE}`);
    await page.waitForSelector('[data-testid="ranked-mobile-matchbar"]');
    const m = await page.evaluate(() => {
      const row = document.querySelector('nav[aria-label="Mogzy controls"] > div')!.getBoundingClientRect();
      const ids = ["hud-home", "academy-radio-hud-trigger", "hud-page-report", "hud-profile",
        "hud-notifications-trigger"];
      const reach = ids.map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) return { id, ok: true };
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        // 4px above and below the visible box must still land on the control.
        const hit = (y: number) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
        return { id, ok: hit(r.top - 3.5 < 0 ? 0 : r.top - 3.5) && hit(r.bottom + 3.5) };
      });
      return { rowH: Math.round(row.height), reach };
    });
    expect(m.rowH).toBe(40);
    for (const r of m.reach) expect(r.ok, `${r.id} lost its 44px touch height`).toBe(true);
  });
});

/**
 * OF1-B — ORDER FORGE FITS. The Lock In and every card must be inside the
 * nearest clipping ancestor at every locked desktop viewport, in the open AND
 * the revealed state (`?forge=revealed` is the taller one), and on a phone the
 * page must stay scrollable with 44px handle / arrow targets.
 */
const FORGE_STATES = [
  { q: "orderforge", anchor: "forge-lock", what: "open" },
  { q: "orderforge&forge=locked", anchor: "forge-suspense", what: "locked" },
  { q: "orderforge&forge=revealed", anchor: "forge-verdict", what: "revealed" },
] as const;

const forgeFit = () => {
  const anchors = ["forge-lock", "forge-suspense", "forge-verdict"];
  const el = anchors.map((id) => document.querySelector(`[data-testid="${id}"]`))
    .find((e): e is Element => !!e)!;
  let clip: Element | null = el.parentElement;
  while (clip && getComputedStyle(clip).overflowY === "visible") clip = clip.parentElement;
  const box = clip!.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { inside: r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5,
    spill: clip!.scrollHeight - clip!.clientHeight };
};

for (const vp of LOCKED) {
  test.describe(`Order Forge @ ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });
    for (const st of FORGE_STATES) {
      test(`seats the ${st.what} state inside the arena`, async ({ page }) => {
        await page.goto(`/dev/ranked-shell-probe?q=${st.q}`);
        await page.waitForSelector(`[data-testid="${st.anchor}"]`);
        await page.waitForTimeout(900);
        const fit = await page.evaluate(forgeFit);
        expect(fit.inside, `${st.anchor} is outside the parchment`).toBe(true);
        expect(fit.spill, "the question panel clips Order Forge").toBeLessThanOrEqual(0);
      });
    }
  });
}

for (const size of [{ w: 360, h: 740 }, { w: 360, h: 800 }]) {
  test.describe(`Order Forge phone ${size.w}x${size.h}`, () => {
    test.use({ viewport: { width: size.w, height: size.h }, isMobile: true, hasTouch: true });
    test("scrolls the page and keeps every control 44px", async ({ page }) => {
      await page.goto(`/dev/ranked-shell-probe?q=orderforge${LIVE_PHONE}`);
      await page.waitForSelector('[data-testid="forge-lock"]');
      await page.waitForTimeout(900);
      const m = await page.evaluate(() => {
        const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        const grip = box("forge-grip-e0");
        const up = box("forge-up-e1");
        const grab = (document.querySelector('[data-testid="forge-grip-e0"]') as HTMLElement).style.touchAction;
        return {
          grip: [grip.width, grip.height], up: [up.width, up.height], grab,
          hOverflow: document.documentElement.scrollWidth > innerWidth,
          reachable: document.documentElement.scrollHeight >= document.querySelector(
            '[data-testid="forge-lock"]')!.getBoundingClientRect().bottom,
        };
      });
      expect(m.grip[0]).toBeGreaterThanOrEqual(44);
      expect(m.grip[1]).toBeGreaterThanOrEqual(44);
      expect(m.up[0]).toBeGreaterThanOrEqual(44);
      expect(m.up[1]).toBeGreaterThanOrEqual(44);
      expect(m.grab).toBe("none");
      expect(m.hOverflow, "horizontal overflow").toBe(false);
      expect(m.reachable, "Lock In is not reachable by scrolling").toBe(true);
    });
  });
}

/**
 * OF3-F1 / OF4 — the base-shop scene is decorative only: it captures no
 * pointer, nothing overflows sideways, and every reorder path works: the
 * up/down buttons, the grip's arrow keys, a grip drag and (OF4) a mouse drag
 * from ANYWHERE on the card.
 */
const forgeOrder = () => Array.from(document.querySelectorAll('[data-testid^="forge-card-"]'))
  .map((e) => e.getAttribute("data-testid")!.replace("forge-card-", ""));

const OF4_SIZES = [{ w: 1600, h: 900 }, { w: 1280, h: 720 }, { w: 360, h: 800 }];

for (const vp of OF4_SIZES) {
  test.describe(`Order Forge OF4 scene + input @ ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });
    test("scene is inert, tinted, static; every reorder path still works", async ({ page }) => {
      await page.goto(`/dev/ranked-shell-probe?q=orderforge&lead=1500${vp.w < 600 ? LIVE_PHONE : ""}`);
      await page.waitForSelector('[data-testid="forge-lock"]');
      // The probe opens the challenge a few seconds out; until then it is inert.
      await page.waitForSelector('[data-testid="order-forge-phase"]:not([data-not-open])', { timeout: 30_000 });
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const bd = document.querySelector('[data-testid="order-forge-backdrop"]')!;
        const img = bd.querySelector("img")!;
        const card = document.querySelector('[data-testid^="forge-card-"]')!.getBoundingClientRect();
        const hit = document.elementFromPoint(card.left + card.width / 2, card.top + card.height / 2);
        const br = bd.getBoundingClientRect();
        const vr = document.querySelector('[data-testid="order-forge-viewport"]')!.getBoundingClientRect();
        const cs = getComputedStyle(img);
        return {
          ptr: getComputedStyle(bd).pointerEvents, anim: cs.animationName, hidden: bd.getAttribute("aria-hidden"),
          blend: cs.mixBlendMode, opacity: Number(cs.opacity), filter: cs.filter, loaded: img.complete && img.naturalWidth > 0,
          captured: !!hit && bd.contains(hit), hOverflow: document.documentElement.scrollWidth > innerWidth,
          backdropInsidePage: br.left >= -0.5 && br.right <= innerWidth + 0.5,
          fillsModule: Math.abs(br.top - vr.top) < 0.5 && Math.abs(br.height - vr.height) < 0.5,
        };
      });
      expect(m.ptr).toBe("none");
      expect(m.anim).toBe("none");
      expect(m.hidden).toBe("true");
      expect(m.loaded, "scene art is decoded by the time the cards can be played").toBe(true);
      // OF4 treatment: multiplied colour, visible but subordinate, no heavy blur / desaturation.
      expect(m.blend).toBe("multiply");
      expect(m.opacity).toBeGreaterThanOrEqual(0.3);
      expect(m.opacity).toBeLessThanOrEqual(0.6);
      expect(m.filter).not.toMatch(/saturate\(0\.|blur\([2-9]/);
      expect(m.captured, "backdrop sits over a card").toBe(false);
      expect(m.hOverflow, "horizontal overflow").toBe(false);
      expect(m.backdropInsidePage).toBe(true);
      expect(m.fillsModule).toBe(true);

      const before = await page.evaluate(forgeOrder);
      // up/down buttons
      await page.click(`[data-testid="forge-down-${before[0]}"]`);
      expect(await page.evaluate(forgeOrder)).toEqual([before[1], before[0], ...before.slice(2)]);
      // keyboard on the grip
      await page.focus(`[data-testid="forge-grip-${before[0]}"]`);
      await page.keyboard.press("ArrowDown");
      expect((await page.evaluate(forgeOrder))[2]).toBe(before[0]);
      // pointer drag from the grip
      const g = (await page.locator(`[data-testid="forge-grip-${before[4]}"]`).boundingBox())!;
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await page.mouse.down();
      await page.mouse.move(g.x + g.width / 2, g.y - 70, { steps: 12 });
      await page.mouse.move(g.x + g.width / 2, g.y - 150, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      const after = await page.evaluate(forgeOrder);
      expect(after.indexOf(before[4]), "grip drag moved the card up").toBeLessThan(4);
      // OF4 — a mouse drag from the card's NAME, nowhere near the grip.
      const last = after[4];
      const n = (await page.locator(`[data-testid="forge-card-${last}"] .line-clamp-2`).boundingBox())!;
      await page.mouse.move(n.x + 8, n.y + n.height / 2);
      await page.mouse.down();
      await page.mouse.move(n.x + 8, n.y - 70, { steps: 12 });
      await page.mouse.move(n.x + 8, n.y - 150, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      const body = await page.evaluate(forgeOrder);
      expect(body.indexOf(last), "a press on the card body drags it").toBeLessThan(4);
      expect(await page.evaluate(() => String(getSelection())), "the drag selected text").toBe("");
    });
  });
}

/**
 * OF4 — TOUCH. The whole card drags after a press-and-hold, and a swipe over
 * the cards still scrolls the page. 360x600 so the page has somewhere to
 * scroll. Raw CDP touch events, because a synthetic scroll gesture never
 * reaches the page's own touch handlers.
 */
test.describe("Order Forge OF4 touch @ 360x600", () => {
  test.use({ viewport: { width: 360, height: 600 }, isMobile: true, hasTouch: true });
  test("a swipe scrolls the page; a hold drags the card without scrolling", async ({ page }) => {
    await page.goto(`/dev/ranked-shell-probe?q=orderforge&lead=1500${LIVE_PHONE}`);
    await page.waitForSelector('[data-testid="order-forge-phase"]:not([data-not-open])', { timeout: 30_000 });
    await page.waitForTimeout(300);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, x = 0, y = 0) => cdp.send("Input.dispatchTouchEvent",
      { type: type as "touchStart", touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    const nameBox = async (t: string) =>
      (await page.locator(`[data-testid="forge-card-${t}"] .line-clamp-2`).boundingBox())!;
    const scrollY = () => page.evaluate(() => window.scrollY);

    const pre = await page.evaluate(forgeOrder);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    // 1. A swipe up across a card, no hold: the page scrolls, the order does not change.
    const a = await nameBox(pre[2]);
    const y0 = await scrollY();
    await touch("touchStart", a.x + 8, a.y + a.height / 2);
    for (let i = 1; i <= 10; i++) await touch("touchMove", a.x + 8, a.y + a.height / 2 - i * 20);
    await touch("touchEnd");
    await page.waitForTimeout(500);
    expect(await scrollY(), "a swipe over a card must scroll the page").toBeGreaterThan(y0 + 40);
    expect(await page.evaluate(forgeOrder)).toEqual(pre);

    // 2. Press and hold, then drag up: the card moves, the page stays put.
    const b = await nameBox(pre[4]);
    await touch("touchStart", b.x + 8, b.y + b.height / 2);
    await page.waitForTimeout(320);
    await expect(page.locator(`[data-testid="forge-card-${pre[4]}"]`)).toHaveAttribute("data-lifted", "true");
    const ys = await scrollY();
    for (let i = 1; i <= 14; i++) {
      await touch("touchMove", b.x + 8, b.y + b.height / 2 - i * 12);
      await page.waitForTimeout(16);
    }
    expect(await scrollY(), "a lifted card must not scroll the page").toBe(ys);
    await touch("touchEnd");
    await page.waitForTimeout(500);
    const post = await page.evaluate(forgeOrder);
    expect(post.indexOf(pre[4]), "hold-drag moved the card up").toBeLessThan(4);
    await expect(page.locator(`[data-testid="forge-card-${pre[4]}"]`)).not.toHaveAttribute("data-lifted", "true");
  });
});

/**
 * OF4 — THE REVEAL TEACHES, AND NOTHING MOVES BUT THE CARDS. `?forge=live`
 * serves the lock, then the reveal. Measured per animation frame in the page:
 * the module box, the scene and its image never move or resize from the lock
 * to the settled reveal; the cards start in the player's order with values,
 * then TRAVEL (intermediate positions observed) into the canonical order.
 */
const PROBE_CANON = ["e1", "e4", "e3", "e0", "e2"];
const PROBE_MINE = ["e3", "e0", "e4", "e1", "e2"];

const sampleReveal = () => new Promise<{
  locked: number[]; frames: { t: number; step: string; motion: string; box: number[]; img: number[];
    rows: Record<string, number>; values: number; shown: number }[]; overflow: boolean;
}>((done) => {
  const rect = (sel: string) => { const r = document.querySelector(sel)!.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  let locked: number[] | null = null; let t0: number | null = null; let overflow = false;
  const frames: { t: number; step: string; motion: string; box: number[]; img: number[]; rows: Record<string, number>; values: number; shown: number }[] = [];
  const tick = (now: number) => {
    overflow ||= document.documentElement.scrollWidth > innerWidth;
    const rev = document.querySelector<HTMLElement>('[data-testid="forge-reveal"]');
    if (!rev) { locked = [...rect('[data-testid="order-forge-viewport"]'), ...rect('[data-testid="order-forge-backdrop"] img')]; requestAnimationFrame(tick); return; }
    if (t0 === null) t0 = now;
    const rows: Record<string, number> = {};
    for (const e of document.querySelectorAll<HTMLElement>('[data-testid^="forge-reveal-e"]')) {
      if (/^forge-reveal-e\d$/.test(e.dataset.testid!)) rows[e.dataset.testid!.slice(-2)] = Math.round(e.getBoundingClientRect().y);
    }
    frames.push({ t: now - t0, step: rev.dataset.step!, motion: rev.dataset.motion!,
      box: rect('[data-testid="order-forge-viewport"]'), img: rect('[data-testid="order-forge-backdrop"] img'), rows,
      values: document.querySelectorAll('[data-testid^="forge-reveal-e"][data-testid$="-value"]').length,
      // Values that are actually VISIBLE (their fade is done), not merely mounted.
      shown: [...document.querySelectorAll<HTMLElement>('[data-testid^="forge-reveal-e"][data-testid$="-value"]')]
        .filter((v) => Number(getComputedStyle(v).opacity) >= 0.95).length });
    if (now - t0 < 2000) requestAnimationFrame(tick); else done({ locked: locked!, frames, overflow });
  };
  requestAnimationFrame(tick);
});

for (const vp of OF4_SIZES) {
  test.describe(`Order Forge OF4 reveal @ ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });
    test("plays mine -> canonical with no jump of the scene or the module", async ({ page }) => {
      await page.goto(`/dev/ranked-shell-probe?q=orderforge&forge=live${vp.w < 600 ? LIVE_PHONE : ""}`);
      await page.waitForSelector('[data-testid="order-forge-phase"][data-phase="locked"]', { timeout: 60_000 });
      const r = await page.evaluate(sampleReveal);
      const first = r.frames[0];
      const last = r.frames[r.frames.length - 1];
      expect(r.overflow, "horizontal overflow").toBe(false);
      // Nothing outside the cards moves: module box and scene image are fixed.
      for (const f of r.frames) {
        expect(f.box, `module box moved at ${Math.round(f.t)}ms`).toEqual(r.locked.slice(0, 4));
        expect(f.img, `scene image moved / re-cropped at ${Math.round(f.t)}ms`).toEqual(r.locked.slice(4));
      }
      // Step 1: the player's own order, every value already present.
      expect(first.step).toBe("mine");
      expect(first.motion).toBe("full");
      expect(Object.entries(first.rows).sort((x, y) => x[1] - y[1]).map(([k]) => k)).toEqual(PROBE_MINE);
      expect(first.values).toBe(5);
      // Step 2: the canonical order, reached by travelling (in-between positions seen).
      expect(last.step).toBe("assembled");
      expect(Object.entries(last.rows).sort((x, y) => x[1] - y[1]).map(([k]) => k)).toEqual(PROBE_CANON);
      const from = first.rows.e1, to = last.rows.e1;
      expect(r.frames.some((f) => f.rows.e1 < from - 8 && f.rows.e1 > to + 8), "Infinity Edge jumped instead of travelling").toBe(true);
      // OF4-FIX1: landed, and then DWELLING, inside the SHORTEST legal reveal
      // (REVEAL_HOLD_MIN_MS = 900, which the controller may shorten to).
      const settledAt = r.frames.find((f) => f.step === "assembled"
        && Object.keys(f.rows).every((k) => Math.abs(f.rows[k] - last.rows[k]) < 1))!.t;
      expect(settledAt, "cards landed too late for the 900ms minimum reveal").toBeLessThan(600);
      expect(900 - settledAt, "no readable dwell on the correct order before 900ms").toBeGreaterThanOrEqual(300);
      // ...and from the landing to the end of the window it never leaves the canonical order.
      for (const f of r.frames.filter((x) => x.t >= settledAt && x.t <= 900)) {
        expect(Object.entries(f.rows).sort((x, y) => x[1] - y[1]).map(([k]) => k), `left canonical order at ${Math.round(f.t)}ms`).toEqual(PROBE_CANON);
      }
      // Values and marks were already in before the cards started to move.
      const firstMove = r.frames.find((f) => Math.abs(f.rows.e1 - first.rows.e1) > 2)!;
      expect(firstMove.shown, "cards moved before every value was visible").toBeGreaterThanOrEqual(4);
      expect(r.frames.some((f) => f.shown === 5 && f.t < settledAt), "values never all visible before landing").toBe(true);
      // Final state: values, marks and "was N" for every wrong card.
      for (const t of PROBE_CANON) await expect(page.getByTestId(`forge-reveal-${t}-value`)).toBeVisible();
      await expect(page.getByTestId("forge-reveal-e1-from")).toContainText(/was 4/i);
      await expect(page.getByTestId("forge-reveal-e2")).toHaveAttribute("data-mark", "right");
      await expect(page.getByTestId("forge-reveal-step")).toHaveText(/correct order/i);
    });
  });
}

test.describe("Order Forge OF4 reveal, reduced motion @ 1280x720", () => {
  test.use({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  test("lands on the settled canonical order on its first frame", async ({ page }) => {
    await page.goto("/dev/ranked-shell-probe?q=orderforge&forge=live");
    await page.waitForSelector('[data-testid="order-forge-phase"][data-phase="locked"]', { timeout: 60_000 });
    const r = await page.evaluate(sampleReveal);
    for (const f of r.frames) {
      expect(f.step).toBe("assembled");
      expect(f.motion).toBe("reduced");
      expect(Object.entries(f.rows).sort((x, y) => x[1] - y[1]).map(([k]) => k)).toEqual(PROBE_CANON);
      expect(f.box).toEqual(r.locked.slice(0, 4));
    }
  });
});

/**
 * OF4-CONTINUITY — ONE PHYSICAL SCENE, MEASURED ON THE REAL BOT LIFECYCLE.
 *
 * `?q=orderforge&forge=bot` replays the bodies the real backend served for a
 * wrong lock against the inline bot (the OF4-FIX2 capture): the lock POST
 * settles the segment and carries the reveal inline, the next poll is already
 * round 2 (another Order Forge segment, opening ~2.7s after the lock), and the
 * settlement starts the arena's reveal hold a round trip after the board's
 * reveal began. Every animation frame, in the page, from just before Lock In
 * to round 2 being usable:
 *   * open -> lock -> "Your order": nothing moves at all, and every row, art
 *     box and image is the SAME node;
 *   * -> "Correct order": only the cards whose canonical slot differs move,
 *     only vertically; the label and trailing boxes never change width (no
 *     rewrap); no generic result overlay is laid over the board;
 *   * -> round 2: the stage, the module box and the scene image never move or
 *     re-crop, no frame is empty or "Loading", the new rows occupy exactly the
 *     old rows' slots, and the board opens on the server's schedule.
 */
const BOT_MINE = ["e0", "e1", "e4", "e3", "e2"];
const BOT_CANON = ["e2", "e1", "e4", "e3", "e0"];

interface CFrame {
  t: number; phase: string | null; step: string | null; prompt: string | null; hold: string | null;
  overlay: boolean; loading: boolean; scrollY: number; forge: number | null;
  stage: number[] | null; body: number[] | null; vp: number[] | null; bd: number[] | null; bdImg: number | null;
  footer: number[] | null; railLast: number[] | null; lockInert: boolean | null;
  rows: Record<string, { id: number; r: number[]; art: number[]; img: number | null; label: number[]; clamp: number[]; trail: number[] }>;
}

async function playBotLifecycle(page: import("@playwright/test").Page, ms = 4200) {
  await page.goto("/dev/ranked-shell-probe?q=orderforge&forge=bot&lat=120");
  await page.waitForFunction(() => {
    const ph = document.querySelector('[data-testid="order-forge-phase"]');
    const imgs = [...document.querySelectorAll<HTMLImageElement>('[data-testid="order-forge-viewport"] img')];
    return ph?.getAttribute("data-phase") === "open" && !ph.getAttribute("data-not-open")
      && imgs.length >= 6 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  }, null, { timeout: 60_000 });
  // The captured player's submitted order.
  for (const id of ["forge-up-e4", "forge-up-e4", "forge-down-e2"]) {
    await page.getByTestId(id).click();
    await page.waitForTimeout(350);
  }
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  return page.evaluate((duration) => new Promise<{ lockAt: number; frames: CFrame[] }>((done) => {
    const ids = new WeakMap<Element, number>(); let n = 1;
    const idOf = (el: Element | null | undefined) => {
      if (!el) return null;
      if (!ids.has(el)) ids.set(el, n++);
      return ids.get(el)!;
    };
    const r = (el: Element | null | undefined) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10);
    };
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
    const frames: CFrame[] = [];
    const t0 = performance.now();
    let lockAt = -1;
    const tick = () => {
      const list = q("forge-reveal-list") ?? q("forge-list-locked") ?? q("forge-list");
      const rows: CFrame["rows"] = {};
      for (const row of list ? [...list.children] : []) {
        const tok = (row as HTMLElement).dataset.testid!.replace(/^forge-(reveal|locked|card)-/, "");
        const [art, label, trail] = [...row.children];
        rows[tok] = { id: idOf(row)!, r: r(row)!, art: r(art)!, img: idOf(art.querySelector("img")),
          label: r(label)!, clamp: r(label.firstElementChild)!, trail: r(trail)! };
      }
      const phaseEl = q("order-forge-phase");
      frames.push({
        t: performance.now() - t0,
        phase: phaseEl?.getAttribute("data-phase") ?? null,
        step: q("forge-reveal")?.getAttribute("data-step") ?? null,
        prompt: q("forge-prompt")?.textContent ?? null,
        hold: q("ranked-match")?.getAttribute("data-reveal-hold") ?? null,
        overlay: !!q("question-result-overlay"), loading: !!q("order-forge-loading"),
        scrollY: Math.round(scrollY), forge: idOf(q("mig-order-forge")),
        stage: r(q("ranked-question")), body: r(q("ranked-question-body")), vp: r(q("order-forge-viewport")),
        bd: r(q("order-forge-backdrop")?.querySelector("img")), bdImg: idOf(q("order-forge-backdrop")?.querySelector("img")),
        footer: r(q("forge-footer")), railLast: r(q("forge-rail-last")),
        lockInert: q("forge-lock") ? !!phaseEl?.hasAttribute("inert") : null,
        rows,
      });
      if (performance.now() - t0 < duration) requestAnimationFrame(tick);
      else done({ lockAt, frames });
    };
    requestAnimationFrame(tick);
    // Lock In a few frames into the sampling, from inside the page.
    setTimeout(() => { lockAt = performance.now() - t0; (q("forge-lock") as HTMLElement).click(); }, 120);
  }), ms);
}

const botOrder = (f: CFrame) => Object.entries(f.rows).sort((a, b) => a[1].r[1] - b[1].r[1]).map(([k]) => k);

for (const vp of OF4_SIZES) {
  test.describe(`Order Forge OF4-CONTINUITY bot lifecycle @ ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });
    test("open -> lock -> reveal -> canonical -> next round: only the teaching move moves anything", async ({ page }) => {
      test.setTimeout(120_000);
      const { lockAt, frames } = await playBotLifecycle(page);
      const pre = frames.filter((f) => f.t < lockAt);
      const open = pre[pre.length - 1];
      expect(open.phase).toBe("open");
      expect(botOrder(open)).toEqual(BOT_MINE);
      const swapIdx = frames.findIndex((f) => f.t > lockAt && f.forge !== open.forge);
      expect(swapIdx, "round 2 never replaced the reveal").toBeGreaterThan(0);
      const round1 = frames.slice(pre.length, swapIdx);
      const round2 = frames.slice(swapIdx);
      const at = (f: CFrame) => `${Math.round(f.t - lockAt)}ms (${f.phase}/${f.step ?? "-"})`;

      // THE SCENE: stage, question body, module box and scene image never move,
      // resize or remount, from the open board to round 2; the page does not scroll.
      for (const f of [...round1, ...round2]) {
        expect(f.stage, `stage moved at ${at(f)}`).toEqual(open.stage);
        expect(f.body, `question body moved at ${at(f)}`).toEqual(open.body);
        expect(f.vp, `module box moved at ${at(f)}`).toEqual(open.vp);
        expect(f.bd, `scene re-cropped at ${at(f)}`).toEqual(open.bd);
        expect(f.bdImg, `scene image remounted at ${at(f)}`).toBe(open.bdImg);
        expect(f.footer, `footer resized at ${at(f)}`).toEqual(open.footer);
        expect(f.railLast, `end rail moved at ${at(f)}`).toEqual(open.railLast);
        expect(f.scrollY, `page scrolled at ${at(f)}`).toBe(open.scrollY);
        expect(f.loading, `loading frame at ${at(f)}`).toBe(false);
        expect(Object.keys(f.rows), `empty board at ${at(f)}`).toHaveLength(5);
      }

      // OPEN -> LOCK -> "YOUR ORDER": nothing moves, nothing remounts.
      const still = round1.filter((f) => f.phase === "locked" || f.step === "mine");
      expect(still.length).toBeGreaterThan(3);
      for (const f of still) {
        for (const t of BOT_MINE) {
          const a = open.rows[t], b = f.rows[t];
          expect(b.id, `${t} row remounted at ${at(f)}`).toBe(a.id);
          expect(b.img, `${t} art image remounted at ${at(f)}`).toBe(a.img);
          for (const k of ["r", "art", "label", "clamp", "trail"] as const) {
            expect(b[k], `${t}.${k} moved at ${at(f)}`).toEqual(a[k]);
          }
        }
      }

      // "CORRECT ORDER": only the cards the canonical order moves, and only vertically.
      const moving = round1.filter((f) => f.step === "assembled");
      expect(moving.length).toBeGreaterThan(10);
      const movers = BOT_MINE.filter((t, i) => BOT_CANON.indexOf(t) !== i);
      expect(movers).toEqual(["e0", "e2"]);
      for (const f of moving) {
        for (const t of BOT_MINE) {
          const a = open.rows[t], b = f.rows[t];
          expect(b.id, `${t} row remounted at ${at(f)}`).toBe(a.id);
          expect(b.img).toBe(a.img);
          if (!movers.includes(t)) { expect(b.r, `${t} should not move (${at(f)})`).toEqual(a.r); continue; }
          // Moving cards keep their x, width and height, and their inner boxes' widths.
          expect([b.r[0], b.r[2], b.r[3]]).toEqual([a.r[0], a.r[2], a.r[3]]);
          expect([b.label[0], b.label[2]], `${t} label width changed at ${at(f)}`).toEqual([a.label[0], a.label[2]]);
          expect([b.clamp[2], b.clamp[3]], `${t} label rewrapped at ${at(f)}`).toEqual([a.clamp[2], a.clamp[3]]);
          expect([b.trail[0], b.trail[2]], `${t} trailing slot changed at ${at(f)}`).toEqual([a.trail[0], a.trail[2]]);
        }
      }
      const last = round1[round1.length - 1];
      expect(botOrder(last)).toEqual(BOT_CANON);
      expect(moving.some((f) => f.rows.e2.r[1] < open.rows.e2.r[1] - 8 && f.rows.e2.r[1] > last.rows.e2.r[1] + 8),
        "the wrong card jumped instead of travelling").toBe(true);
      // The board is the result: the generic stamp / edge / wash is never laid over
      // it, although the arena's reveal hold (settlement discovered) overlaps it.
      expect(round1.some((f) => f.phase === "revealed" && f.hold === "true")).toBe(true);
      for (const f of round1) expect(f.overlay, `generic result overlay at ${at(f)}`).toBe(false);

      // NEXT ROUND: a single-frame content swap into the SAME slots.
      const first2 = round2[0];
      expect(first2.phase).toBe("open");
      expect(first2.prompt).not.toBe(open.prompt);
      const slots = (f: CFrame) => Object.values(f.rows).map((x) => x.r).sort((a, b) => a[1] - b[1]);
      const inner = (f: CFrame) => Object.values(f.rows).map((x) => [x.art, x.label, x.trail])
        .sort((a, b) => a[0][1] - b[0][1]);
      expect(slots(first2)).toEqual(slots(open));
      expect(inner(first2)).toEqual(inner(open));
      for (const f of round2) expect(f.step, `reveal leftovers at ${at(f)}`).toBeNull();
      // Usable on the server's schedule (round 2 opens ~2.7s after the lock), and
      // nothing moves on the way to usable.
      const usable = round2.find((f) => f.lockInert === false);
      expect(usable, "round 2 never became usable").toBeTruthy();
      expect(usable!.t - lockAt).toBeLessThan(3400);
      for (const f of round2) expect(slots(f)).toEqual(slots(first2));
    });
  });
}

test.describe("Order Forge OF4-CONTINUITY bot lifecycle, reduced motion @ 1280x720", () => {
  test.use({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  test("same nodes, no travel: the settled canonical order replaces the locked order in one frame", async ({ page }) => {
    test.setTimeout(120_000);
    const { lockAt, frames } = await playBotLifecycle(page, 2000);
    const pre = frames.filter((f) => f.t < lockAt);
    const open = pre[pre.length - 1];
    const after = frames.filter((f) => f.t > lockAt && f.forge === open.forge);
    const revealed = after.filter((f) => f.phase === "revealed");
    expect(revealed.length).toBeGreaterThan(5);
    const slotY = BOT_MINE.map((t) => open.rows[t].r[1]);
    for (const f of after) {
      expect(f.stage).toEqual(open.stage);
      expect(f.vp).toEqual(open.vp);
      expect(f.overlay).toBe(false);
      for (const t of BOT_MINE) {
        expect(f.rows[t].id).toBe(open.rows[t].id);
        // Every card is always exactly in a slot, never between two.
        expect(slotY).toContain(f.rows[t].r[1]);
      }
    }
    for (const f of revealed) {
      expect(f.step).toBe("assembled");
      expect(botOrder(f)).toEqual(BOT_CANON);
    }
  });
});
