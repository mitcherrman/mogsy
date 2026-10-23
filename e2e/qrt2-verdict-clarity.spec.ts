/**
 * QRT2 PHASE 2A — THE ANSWER RESULT IS UNMISTAKABLE, MEASURED.
 *
 * Mounts the REAL `QuizRankedMatch` through `/dev/ranked-shell-probe` (and, for
 * the hosted Daily, the same match mounted the way `DailyRunPage` does) and
 * walks one question -> selected -> graded reveal inside a single mount, the way
 * the continuity suite does. Everything asserted here is a number read off the
 * laid-out page, not a class name:
 *
 *   * the verdict (CORRECT / INCORRECT / TIMED OUT) is the largest type on the
 *     card, carries an icon as well as words, and does not cover the prompt;
 *   * the correct answer is fully opaque and tagged "Correct answer" in words,
 *     and the player's wrong pick is tagged "Your pick" and drawn apart from it;
 *   * the evidence line is legible against the parchment it sits on;
 *   * nothing moves: the prompt and every tablet hold their coordinates from
 *     the open question to the graded reveal, and the page never scrolls;
 *   * a click is only ever a selection: the tablet locks as `selected` and no
 *     verdict, correct tablet or tag exists until the server settles;
 *   * reduced motion keeps every word and icon and strips the animation;
 *   * the verdict is announced by exactly one new live region.
 *
 * The probe's reveal lasts about 860 ms (its fixture clock), so every reveal
 * measurement is taken inside ONE in-page task that polls on animation frames
 * and measures synchronously the first time a tablet is lit.
 *
 *   npx playwright test -c playwright.arena.config.ts e2e/qrt2-verdict-clarity.spec.ts
 */
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 240_000 });

const SEQ = "seq=opts4,opts4,opts4,opts4&evlen=60&sfx=1&frame=0&progression=0&lol=1";
const DAILY_HOST = "&host=daily&ruleset=standard";
const url = (q: string) => `/dev/ranked-shell-probe?q=opts4&${SEQ}${q}`;
/** The same walk over a different question family, e.g. the bank's longest rows. */
const urlSeq = (state: string, q = "") =>
  `/dev/ranked-shell-probe?q=${state}&seq=${state},${state},${state},${state}&evlen=96&sfx=1&frame=0&progression=0&lol=1${q}`;

const VIEWPORTS = [
  { id: "360x640", w: 360, h: 640, phone: true },
  { id: "390x844", w: 390, h: 844, phone: true },
  { id: "430x932", w: 430, h: 932, phone: true },
  { id: "1280x720", w: 1280, h: 720, phone: false },
] as const;

type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };

interface Snapshot {
  vw: number; vh: number; scrollOverflow: number;
  stamp: null | {
    text: string; verdict: string | null; timeout: boolean; fontPx: number;
    iconCount: number; rect: Rect; animationName: string; motion: string | null;
  };
  stackRect: Rect | null;
  cardRect: Rect | null;
  promptRect: Rect | null;
  tablets: Array<{
    state: string; opacity: number; rect: Rect; tags: string; tagRect: Rect | null;
    labelRect: Rect | null; hasIcon: boolean; text: string;
  }>;
  evidence: null | { text: string; color: string; rect: Rect };
  liveRegionsWithVerdict: string[];
}

/** One synchronous read of everything the contract talks about. */
const MEASURE = (): Snapshot => {
  const rect = (el: Element | null): Rect | null => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  };
  const q = (id: string) => document.querySelector(`[data-testid="${id}"]`);
  const stampEl = q("result-stamp-viewer") as HTMLElement | null;
  const overlay = q("question-result-overlay") as HTMLElement | null;
  const tablets = [...document.querySelectorAll("[data-quiz-choice]")].map((el) => {
    const tags = el.querySelector('[data-testid="answer-result-tags"]');
    return {
      state: el.getAttribute("data-choice-state") ?? "",
      opacity: Number(getComputedStyle(el).opacity),
      rect: rect(el)!,
      tags: tags?.textContent ?? "",
      tagRect: rect(tags),
      labelRect: rect(el.querySelector("span.min-w-0.flex-1")),
      hasIcon: !!el.querySelector("svg"),
      text: el.textContent ?? "",
    };
  });
  const ev = q("answer-evidence") as HTMLElement | null;
  const verdictWords = /\b(correct|incorrect|timed out)\b/i;
  const live = [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')]
    .filter((el) => el.getAttribute("aria-live") !== "off")
    .filter((el) => verdictWords.test(el.textContent ?? ""))
    .map((el) => `${el.getAttribute("data-testid") ?? el.tagName}:${(el.textContent ?? "").trim().slice(0, 40)}`);
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    scrollOverflow: document.documentElement.scrollHeight - window.innerHeight,
    stamp: stampEl ? {
      text: stampEl.textContent ?? "",
      verdict: stampEl.getAttribute("data-verdict"),
      timeout: stampEl.getAttribute("data-timeout") === "true",
      fontPx: parseFloat(getComputedStyle(stampEl).fontSize),
      iconCount: stampEl.querySelectorAll("svg").length,
      rect: rect(stampEl)!,
      animationName: getComputedStyle(stampEl).animationName,
      motion: overlay?.getAttribute("data-motion") ?? null,
    } : null,
    stackRect: rect(overlay?.querySelector(".ranked-result-stack") ?? null),
    cardRect: rect(q("ranked-question")),
    promptRect: rect(document.querySelector('[data-surface-region="prompt"] h2')),
    tablets,
    evidence: ev ? {
      text: ev.textContent ?? "", color: getComputedStyle(ev).color, rect: rect(ev)!,
    } : null,
    liveRegionsWithVerdict: live,
  };
};

async function openProbe(page: Page, query: string, target: string = url(query)) {
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(target);
  await page.getByTestId("ranked-match").waitFor();
  const gotIt = page.getByRole("button", { name: "GOT IT" });
  await gotIt.waitFor({ state: "visible", timeout: 4_000 }).catch(() => undefined);
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await page.waitForSelector('[data-quiz-choice]');
  // The probe's own state selector is a fixed bar over the bottom of the page;
  // it is harness chrome, not part of the arena being measured.
  await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="probe-short"]')?.parentElement;
    if (bar) bar.style.display = "none";
  });
  await page.waitForTimeout(600);
  // Step 1 converts the canned hp match to the points match the rest plays.
  await page.getByTestId("probe-sfx-advance").click();
  await page.waitForTimeout(1800);
}

const advance = (page: Page) => page.getByTestId("probe-sfx-advance").click();

/** Poll on animation frames; measure synchronously the first frame a tablet is lit. */
const firstRevealSnapshot = (page: Page) => page.evaluate(`(async () => {
  const t0 = performance.now();
  while (performance.now() - t0 < 9000) {
    if (document.querySelector('[data-choice-state="correct"]')) return (${MEASURE.toString()})();
    await new Promise((r) => requestAnimationFrame(r));
  }
  return null;
})()`) as Promise<Snapshot | null>;

const measure = (page: Page) => page.evaluate(MEASURE);

const lightestTablet = (s: Snapshot) => s.tablets.filter((t) => t.state === "correct");

/** The shared geometry contract: both rects are in viewport space. */
function expectInside(r: Rect, s: Snapshot, label: string) {
  expect(r.left, `${label} left`).toBeGreaterThanOrEqual(-0.5);
  expect(r.right, `${label} right`).toBeLessThanOrEqual(s.vw + 0.5);
  expect(r.top, `${label} top`).toBeGreaterThanOrEqual(-0.5);
  expect(r.bottom, `${label} bottom`).toBeLessThanOrEqual(s.vh + 0.5);
}

const intersects = (a: Rect, b: Rect) =>
  a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

/** Anchors that may not move between the open question and its reveal. */
const anchors = (s: Snapshot) => ({
  prompt: s.promptRect?.top ?? null,
  firstTablet: s.tablets[0]?.rect.top ?? null,
  lastTablet: s.tablets[s.tablets.length - 1]?.rect.bottom ?? null,
  tabletCount: s.tablets.length,
  tabletHeights: s.tablets.map((t) => Math.round(t.rect.height * 2) / 2).join(","),
});

for (const vp of VIEWPORTS) {
  test.describe(`${vp.id}`, () => {
    test.use({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 1,
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
    });

    test("selected -> CORRECT -> INCORRECT, in one mount", async ({ page }) => {
      await openProbe(page, "");

      // ── ROUND 1: select, then the server grades CORRECT ────────────────
      const open = await measure(page);
      expect(open.stamp, "no verdict exists before the server settles").toBeNull();
      expect(open.tablets.every((t) => t.state === "idle")).toBe(true);

      await page.locator("[data-quiz-choice]").nth(0).click();
      // ACKNOWLEDGMENT: instant, local, and NOT a verdict.
      const selected = await measure(page);
      expect(selected.tablets[0].state, "the tap marks the tablet selected").toBe("selected");
      expect(selected.tablets.filter((t) => t.state !== "selected" && t.state !== "idle")).toEqual([]);
      expect(selected.stamp, "a click never draws a verdict").toBeNull();
      expect(selected.tablets.some((t) => t.tags !== ""), "a click never draws a tag").toBe(false);
      expect(lightestTablet(selected)).toHaveLength(0);
      expect(selected.scrollOverflow).toBeLessThanOrEqual(0);

      const before = anchors(selected);
      const pending = firstRevealSnapshot(page);
      await advance(page);
      const correct = await pending;
      expect(correct, "the CORRECT reveal never appeared").not.toBeNull();
      const c = correct!;

      expect(c.stamp!.text).toContain("CORRECT");
      expect(c.stamp!.text).not.toContain("INCORRECT");
      expect(c.stamp!.verdict).toBe("correct");
      expect(c.stamp!.iconCount, "a verdict is never colour alone").toBeGreaterThan(0);
      expect(c.stamp!.fontPx).toBeGreaterThanOrEqual(vp.phone ? 22 : 28);
      expectInside(c.stamp!.rect, c, "stamp");
      expect(c.stamp!.rect.width).toBeLessThanOrEqual(c.cardRect!.width);
      // The chosen, correct tablet: lit, opaque, and says so in words.
      const right = c.tablets[0];
      expect(right.state).toBe("correct");
      expect(right.opacity).toBe(1);
      expect(right.tags).toContain("Correct answer");
      expect(right.tags).toContain("Your pick");
      expect(right.hasIcon).toBe(true);
      expectInside(right.tagRect!, c, "tag");
      // Nothing moved, nothing scrolled.
      expect(c.scrollOverflow).toBeLessThanOrEqual(0);
      expect(anchors(c)).toEqual(before);
      // The evidence beat exists and is drawn in dark ink, not the old gold.
      expect(c.evidence, "evidence missing from the reveal").not.toBeNull();
      expect(c.evidence!.color).toBe("rgb(42, 26, 4)");
      expectInside(c.evidence!.rect, c, "evidence");

      // ── ROUND 3: pick a WRONG tablet; the server grades INCORRECT ───────
      await page.waitForTimeout(2600);
      await advance(page); // round 2 settles
      await page.waitForTimeout(2800);
      await page.waitForSelector('[data-answers-state="open"]');
      const open3 = await measure(page);
      await page.locator("[data-quiz-choice]").nth(2).click();
      const selected3 = await measure(page);
      expect(selected3.tablets[2].state).toBe("selected");
      expect(selected3.stamp).toBeNull();
      const before3 = anchors(selected3);
      expect(anchors(open3).tabletCount).toBe(before3.tabletCount);
      const pending3 = firstRevealSnapshot(page);
      await advance(page);
      const incorrect = await pending3;
      expect(incorrect, "the INCORRECT reveal never appeared").not.toBeNull();
      const i = incorrect!;

      expect(i.stamp!.text).toContain("INCORRECT");
      expect(i.stamp!.verdict).toBe("incorrect");
      expect(i.stamp!.iconCount).toBeGreaterThan(0);
      expect(i.stamp!.fontPx).toBeGreaterThanOrEqual(vp.phone ? 22 : 28);
      const lit = i.tablets.find((t) => t.state === "correct")!;
      const wrong = i.tablets.find((t) => t.state === "incorrect-selected")!;
      expect(lit && wrong, "both the answer and the wrong pick must be marked").toBeTruthy();
      expect(lit.opacity).toBe(1);
      expect(wrong.opacity).toBe(1);
      expect(lit.tags).toContain("Correct answer");
      expect(lit.tags).not.toContain("Your pick");
      expect(wrong.tags).toContain("Your pick");
      expect(wrong.tags).not.toContain("Correct answer");
      expect(lit.hasIcon && wrong.hasIcon).toBe(true);
      expectInside(lit.tagRect!, i, "correct tag");
      expectInside(wrong.tagRect!, i, "pick tag");
      // A tag never sits on its own tablet's label.
      for (const t of [lit, wrong]) {
        if (t.tagRect && t.labelRect) expect(intersects(t.tagRect, t.labelRect), `tag over label: ${t.text}`).toBe(false);
      }
      expect(i.scrollOverflow).toBeLessThanOrEqual(0);
      expect(anchors(i)).toEqual(before3);
      // The verdict stack never covers the question text.
      if (i.stackRect && i.promptRect) {
        expect(i.stackRect.bottom, "the verdict covers the prompt").toBeLessThanOrEqual(i.promptRect.top + 0.5);
      }
    });

    test("TIMED OUT is its own verdict and still tags the answer", async ({ page }) => {
      await openProbe(page, "&timeout=1");
      const before = anchors(await measure(page));
      const pending = firstRevealSnapshot(page);
      await advance(page);
      const t = (await pending)!;
      expect(t, "the TIMED OUT reveal never appeared").not.toBeNull();
      expect(t.stamp!.text).toContain("TIMED OUT");
      expect(t.stamp!.text).not.toContain("INCORRECT");
      expect(t.stamp!.verdict).toBe("timed_out");
      expect(t.stamp!.timeout).toBe(true);
      expect(t.stamp!.iconCount).toBeGreaterThan(0);
      expect(t.stamp!.fontPx).toBeGreaterThanOrEqual(vp.phone ? 22 : 28);
      expectInside(t.stamp!.rect, t, "stamp");
      // No pick was made, so only the answer is tagged.
      expect(t.tablets.filter((x) => x.state === "correct")).toHaveLength(1);
      expect(t.tablets.filter((x) => x.state === "incorrect-selected")).toHaveLength(0);
      const lit = t.tablets.find((x) => x.state === "correct")!;
      expect(lit.tags).toContain("Correct answer");
      expect(lit.tags).not.toContain("Your pick");
      expect(lit.opacity).toBe(1);
      expect(t.scrollOverflow).toBeLessThanOrEqual(0);
      expect(anchors(t)).toEqual(before);
    });

    test("one new live region announces the verdict; decoration is hidden", async ({ page }) => {
      await openProbe(page, "");
      await page.locator("[data-quiz-choice]").nth(0).click();
      const pending = firstRevealSnapshot(page);
      await advance(page);
      const s = (await pending)!;
      // The arena already carries several status regions that mention the
      // result (the HUD plate, the mobile bar, the duelist outcome rows) —
      // pre-existing, listed in the handoff, and not touched here. What THIS
      // work adds must announce exactly once: the overlay's own sr-only
      // status. The stamps and the tablet tabs are decoration, never live.
      const overlayLive = s.liveRegionsWithVerdict.filter((x) => x.startsWith("SPAN:"));
      expect(overlayLive, JSON.stringify(s.liveRegionsWithVerdict)).toHaveLength(1);
      const tabsLive = await page.evaluate(() => [...document.querySelectorAll(
        '[data-testid="answer-result-tags"], [data-testid="answer-correct-tag"], [data-testid="answer-your-pick"], [data-testid="result-stamp-viewer"], [data-testid="result-stamp-opponent"]')]
        .filter((el) => el.closest('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])')).length);
      expect(tabsLive, "tabs and stamps must not sit inside a live region").toBe(0);
      // The stamp and tags are decoration of facts already spoken.
      const decorative = await page.evaluate(() => {
        const stamp = document.querySelector('[data-testid="result-stamp-viewer"]');
        return stamp ? stamp.getAttribute("aria-hidden") : "missing";
      });
      expect(decorative === "true" || decorative === "missing").toBe(true);
    });
  });
}

test.describe("the bank's longest rows, on the smallest phone", () => {
  test.use({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  for (const state of ["realMax", "realP99", "stressA"]) {
    test(`${state}: the verdict never covers the question and nothing scrolls`, async ({ page }) => {
      await openProbe(page, "", urlSeq(state));
      const open = await measure(page);
      const before = anchors(open);
      await page.locator("[data-quiz-choice]").nth(2).click();
      const pending = firstRevealSnapshot(page);
      await advance(page);
      const s = (await pending)!;
      expect(s, `${state}: the reveal never appeared`).not.toBeNull();
      expect(s.stamp, "no verdict").not.toBeNull();
      // The stress rows overflow a 640px phone BEFORE any answer (that is what
      // they are for: realP99 by 8px, stressA by 60px). The contract is that
      // the reveal adds no scroll of its own.
      expect(s.scrollOverflow, `${state}: the reveal grew the page`)
        .toBeLessThanOrEqual(Math.max(0, open.scrollOverflow));
      expect(anchors(s)).toEqual(before);
      expectInside(s.stamp!.rect, s, "stamp");
      expect(s.stamp!.rect.width).toBeLessThanOrEqual(s.cardRect!.width);
      if (s.stackRect && s.promptRect) {
        expect(s.stackRect.bottom, `${state}: the verdict covers the prompt`)
          .toBeLessThanOrEqual(s.promptRect.top + 0.5);
      }
      for (const t of s.tablets.filter((x) => x.tagRect && x.labelRect)) {
        expect(intersects(t.tagRect!, t.labelRect!), `${state}: a tab sits on ${t.text}`).toBe(false);
      }
    });
  }
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });

  test("every word and icon is present and nothing animates", async ({ page }) => {
    await openProbe(page, "&timeout=1");
    const pending = firstRevealSnapshot(page);
    await advance(page);
    const s = (await pending)!;
    expect(s.stamp!.motion).toBe("reduced");
    expect(s.stamp!.animationName).toBe("none");
    expect(s.stamp!.text).toContain("TIMED OUT");
    expect(s.stamp!.iconCount).toBeGreaterThan(0);
    expect(s.tablets.find((t) => t.state === "correct")!.tags).toContain("Correct answer");
  });
});

test.describe("hosted Daily", () => {
  for (const vp of [VIEWPORTS[0], VIEWPORTS[3]]) {
    test.describe(vp.id, () => {
      test.use({
        viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1,
        ...(vp.phone ? { isMobile: true, hasTouch: true } : {}),
      });

      test("the Daily's reveal reads the same: verdict, tagged answer, no scroll", async ({ page }) => {
        await openProbe(page, DAILY_HOST);
        await page.locator("[data-quiz-choice]").nth(0).click();
        const before = anchors(await measure(page));
        const pending = firstRevealSnapshot(page);
        await advance(page);
        const s = (await pending)!;
        expect(s, "the Daily reveal never appeared").not.toBeNull();
        expect(s.stamp!.text).toContain("CORRECT");
        expect(s.stamp!.fontPx).toBeGreaterThanOrEqual(vp.phone ? 22 : 28);
        expect(s.tablets[0].tags).toContain("Correct answer");
        expect(s.tablets[0].opacity).toBe(1);
        expect(s.scrollOverflow).toBeLessThanOrEqual(0);
        expect(anchors(s)).toEqual(before);
      });
    });
  }
});

test.describe("evidence legibility (measured on the painted pixels)", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  test("evidence ink against the parchment it is drawn on is at least 4.5:1", async ({ page }) => {
    await page.clock.install();
    await openProbe(page, "");
    await page.locator("[data-quiz-choice]").nth(0).click();
    await advance(page);
    // Run the fake clock forward in small steps until the reveal is on screen,
    // then it stays frozen: nothing advances while the pixels are measured.
    let rect: Rect | null = null;
    for (let step = 0; step < 80 && !rect; step += 1) {
      await page.clock.runFor(100);
      rect = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="answer-evidence"]');
        if (!el || !document.querySelector('[data-choice-state="correct"]')) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      });
    }
    expect(rect, "the evidence never appeared").not.toBeNull();
    const png = await page.screenshot({
      animations: "disabled",
      clip: { x: Math.max(0, rect!.left - 4), y: Math.max(0, rect!.top - 2),
        width: Math.min(rect!.width + 8, 390), height: rect!.height + 4 },
    });
    if (process.env.QRT2_SHOTS) writeFileSync(`${process.env.QRT2_SHOTS}/evidence-clip.png`, png);
    const ratio = await page.evaluate(async (b64) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width; canvas.height = bmp.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const lum = (r: number, g: number, b: number) => {
        const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const all: number[] = [];
      for (let k = 0; k < px.length; k += 4) all.push(lum(px[k], px[k + 1], px[k + 2]));
      all.sort((a, b) => a - b);
      const dark = all[Math.floor(all.length * 0.02)];
      const light = all[Math.floor(all.length * 0.6)];
      return (light + 0.05) / (dark + 0.05);
    }, png.toString("base64"));
    expect(ratio, `evidence contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
