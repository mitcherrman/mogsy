/**
 * QRT2 ADOPTION — the Mastery slice and Pro Play / Worlds tell a graded answer
 * in words, measured on a real layout.
 *
 * Mastery slice: `/dev/ranked-shell-probe?q=masteryRecall&mprose=1&mreveal=…`
 * mounts the real `QuizRankedMatch` with the server's own per-challenge reveal
 * held (`own_challenge_reveals`). Pro Play: `/lol/dev/pro-play-arena?source=fixture`
 * plays the frozen production payloads through the real `ProPlayArenaRun`.
 * (Practice rides the same `CanonicalArena` question seam; its one-screen
 * browser suite is `e2e/pm2`, and its tablets are covered by unit tests.)
 *
 * Asserted, per viewport (360x640, 390x844, 1280x720):
 *   * before the reveal nothing is tagged or lit, and the reveal moves no tablet;
 *   * the right answer is the one lit, fully opaque tablet and says "Correct answer";
 *   * the player's pick says "Your pick" (and is a different tablet when wrong);
 *   * a timeout is "Timed out" from the server's flag and carries no pick tab;
 *   * every tab is a single line, inside the viewport, and off every other
 *     tab and off the tablet's letter plate (the two-up pair is the hard case);
 *   * Pro Play keeps its manual Next.
 *
 *   npx playwright test -c playwright.arena.config.ts e2e/qrt2-adoption.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const VIEWPORTS = [
  { id: "360x640", w: 360, h: 640, phone: true },
  { id: "390x844", w: 390, h: 844, phone: true },
  { id: "1280x720", w: 1280, h: 720, phone: false },
] as const;

type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };

interface Snap {
  vw: number; vh: number;
  tablets: Array<{ label: string; state: string; opacity: number; rect: Rect; letter: Rect | null;
    tabs: Array<{ id: string; text: string; rect: Rect }> }>;
  verdict: { word: string; verdict: string | null; icon: boolean } | null;
  tabsInLiveRegion: number;
}

const MEASURE = (): Snap => {
  const r = (el: Element | null): Rect | null => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height };
  };
  const tablets = [...document.querySelectorAll<HTMLElement>("[data-quiz-choice]")].map((el) => ({
    label: (el.querySelector("span.min-w-0")?.textContent ?? el.textContent ?? "").trim().slice(0, 30),
    state: el.getAttribute("data-choice-state") ?? "",
    opacity: Number(getComputedStyle(el).opacity),
    rect: r(el)!,
    letter: r(el.querySelector("[data-choice-letter]")),
    tabs: [...el.querySelectorAll('[data-testid="answer-correct-tag"], [data-testid="answer-your-pick"]')]
      .map((t) => ({ id: t.getAttribute("data-testid")!, text: t.textContent ?? "", rect: r(t)! })),
  }));
  const v = document.querySelector('[data-testid="mastery-verdict"]');
  return {
    vw: window.innerWidth, vh: window.innerHeight, tablets,
    verdict: v ? { word: v.textContent ?? "", verdict: v.getAttribute("data-verdict"), icon: !!v.querySelector("svg") } : null,
    tabsInLiveRegion: [...document.querySelectorAll('[data-testid="answer-result-tags"]')]
      .filter((e) => e.closest('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])')).length,
  };
};

const measure = (page: Page) => page.evaluate(MEASURE);
const intersects = (a: Rect, b: Rect) =>
  a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

/** The contract every tab obeys, wherever it sits. */
function expectTabsWellFormed(s: Snap, where: string) {
  for (const t of s.tablets) {
    const tabs = t.tabs;
    for (const tab of tabs) {
      expect(tab.rect.height, `${where}: "${tab.text}" wrapped`).toBeLessThanOrEqual(20);
      expect(tab.rect.left, `${where}: tab left`).toBeGreaterThanOrEqual(-0.5);
      expect(tab.rect.right, `${where}: tab right`).toBeLessThanOrEqual(s.vw + 0.5);
      expect(tab.rect.left, `${where}: tab leaves its tablet on the left`).toBeGreaterThanOrEqual(t.rect.left - 0.5);
      expect(tab.rect.right, `${where}: tab leaves its tablet on the right`).toBeLessThanOrEqual(t.rect.right + 0.5);
      if (t.letter) expect(intersects(tab.rect, t.letter), `${where}: "${tab.text}" sits on the letter plate`).toBe(false);
    }
    if (tabs.length === 2) expect(intersects(tabs[0].rect, tabs[1].rect), `${where}: tabs overlap`).toBe(false);
  }
  expect(s.tabsInLiveRegion, `${where}: tabs inside a live region`).toBe(0);
}

async function openProbe(page: Page, q: string) {
  await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await page.goto(`/dev/ranked-shell-probe?${q}&frame=0&progression=0&lol=1`);
  await page.getByTestId("ranked-match").waitFor();
  const gotIt = page.getByRole("button", { name: "GOT IT" });
  await gotIt.waitFor({ state: "visible", timeout: 4_000 }).catch(() => undefined);
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="probe-short"]')?.parentElement;
    if (bar) bar.style.display = "none";
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`Mastery slice @ ${vp.id}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1,
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}) });

    test("before the reveal: nothing tagged or lit; the reveal moves no tablet", async ({ page }) => {
      await openProbe(page, "q=masteryRecall&points=1&mprose=1");
      await page.waitForSelector("[data-quiz-choice]");
      // The tablets enter on a staggered transform; measure after it settles.
      await page.waitForTimeout(1500);
      const open = await measure(page);
      expect(open.tablets.every((t) => t.state === "idle" && t.tabs.length === 0)).toBe(true);
      expect(open.verdict).toBeNull();

      await page.goto(`/dev/ranked-shell-probe?q=masteryRecall&points=1&mprose=1&mreveal=wrong&frame=0&progression=0&lol=1`);
      await page.getByTestId("mastery-inline-reveal").waitFor();
      await page.waitForTimeout(1500);
      const shown = await measure(page);
      // Every tablet keeps its box. On a phone the whole card re-centres by
      // exactly 10px when the submit button becomes the reveal box: measured
      // identically on the unmodified base (`a2eebc89`+#136), so it is pinned
      // here at that value, not a new movement. Desktop moves nothing.
      expect(shown.tablets.map((t) => Math.round(t.rect.height)))
        .toEqual(open.tablets.map((t) => Math.round(t.rect.height)));
      const expected = vp.phone ? 10 : 0;
      shown.tablets.forEach((t, i) => {
        // Sub-pixel rounding of the centred card: +-1px.
        expect(Math.abs(open.tablets[i].rect.top - t.rect.top - expected),
          `tablet ${i}: the reveal moved it`).toBeLessThanOrEqual(1);
      });
    });

    for (const mode of ["right", "wrong", "timeout"] as const) {
      test(`${mode}: the answer, the pick and the headline are told in words`, async ({ page }) => {
        await openProbe(page, `q=masteryRecall&points=1&mprose=1&mreveal=${mode}`);
        await page.getByTestId("mastery-inline-reveal").waitFor();
        await page.waitForTimeout(600);
        const s = await measure(page);
        const lit = s.tablets.filter((t) => t.state === "correct");
        expect(lit, "exactly one tablet is the answer").toHaveLength(1);
        expect(lit[0].label).toBe("11");
        expect(lit[0].opacity).toBe(1);
        expect(lit[0].tabs.map((t) => t.id)).toContain("answer-correct-tag");
        const pick = s.tablets.flatMap((t) => t.tabs.map((x) => ({ t, x }))).filter(({ x }) => x.id === "answer-your-pick");
        if (mode === "timeout") {
          expect(pick, "a timeout has no pick").toHaveLength(0);
          expect(s.verdict).toMatchObject({ verdict: "timeout", icon: true });
          expect(s.verdict!.word).toContain("Timed out");
        } else {
          expect(pick).toHaveLength(1);
          if (mode === "wrong") {
            expect(pick[0].t.state).toBe("incorrect-selected");
            expect(pick[0].t.label).toBe("9");
            expect(s.verdict).toMatchObject({ verdict: "incorrect", icon: true });
          } else {
            expect(pick[0].t.label).toBe("11");
            expect(s.verdict).toMatchObject({ verdict: "correct", icon: true });
          }
        }
        expectTabsWellFormed(s, `mastery ${mode}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });

  test.describe(`Pro Play @ ${vp.id}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1,
      ...(vp.phone ? { isMobile: true, hasTouch: true } : {}) });

    for (const pick of [0, 1]) {
      test(`pick ${pick}: tabs in words, well formed, Next stays manual`, async ({ page }) => {
        await page.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
        await page.goto("/lol/dev/pro-play-arena?source=fixture&set=champion_player");
        await page.waitForSelector("[data-quiz-choice]");
        const gotIt = page.getByRole("button", { name: "GOT IT" });
        if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
        await page.waitForTimeout(800);
        const open = await measure(page);
        expect(open.tablets.every((t) => t.tabs.length === 0 && t.state !== "correct")).toBe(true);

        await page.locator("[data-quiz-choice]").nth(pick).click();
        await page.waitForSelector("[data-pp-reveal-footer]");
        await page.waitForTimeout(1800);
        const s = await measure(page);
        const lit = s.tablets.filter((t) => t.state === "correct");
        expect(lit).toHaveLength(1);
        expect(lit[0].opacity).toBe(1);
        // "Correct answer", or just "Correct" where the tablet is a narrow pair
        // or picture tile and the player's own pick shares its top edge.
        expect(lit[0].tabs.map((t) => t.text).join(" ")).toMatch(/Correct( answer)?/i);
        const picked = s.tablets.filter((t) => t.tabs.some((x) => x.id === "answer-your-pick"));
        expect(picked, "exactly one tablet is the player's pick").toHaveLength(1);
        // The pick is the tablet that was tapped, and is wrong only if it is not the answer.
        expect(s.tablets.indexOf(picked[0])).toBe(pick);
        expect(picked[0].state === "correct" || picked[0].state === "incorrect-selected").toBe(true);
        expectTabsWellFormed(s, `pro play pick ${pick}`);
        // Manual Next / See results is untouched: still a button, still the player's.
        await expect(page.locator("[data-pp-reveal-footer] button").last()).toBeVisible();
      });
    }
  });
}
