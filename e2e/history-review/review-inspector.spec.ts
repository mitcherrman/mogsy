/**
 * Match History V2 (Track D) — THE QUESTION INSPECTOR, MEASURED IN A REAL BROWSER.
 *
 * `harness.html` renders the REAL `QuestionInspector` → `QuestionReviewCard`, in
 * the real Radix Popover (fine pointer, 1280x800 and the short 1280x560) and the
 * real `QuestionReviewSheet` (coarse pointer, 320/360/390 phones). For every
 * fixture state in `fixtures.ts` × every viewport this asserts:
 *
 *   1. HOST       the popover (fine) or sheet (coarse) is the host that opened.
 *   2. BOUNDED    popover <= 24rem tall and fully inside the viewport (opened
 *                 from top, middle, bottom and bottom-right); sheet <= 85dvh.
 *   3. NO SPILL   no sideways page scroll, and nothing inside the card is wider
 *                 than the host that holds it.
 *   4. NO CLIPPING no text box is silently cut by overflow:hidden (a deliberate
 *                 `truncate` ellipsis is allowed).
 *   5. LEGIBLE    no visible text under 8px.
 *   6. CLOSE      the sheet's close control is >= 44x44 and closes it.
 *   7. KEYBOARD   Enter opens, Escape closes, focus returns to the trigger;
 *                 the open sheet traps Tab.
 *   8. SEALED     a sealed fixture carries no revealed field, and its open card
 *                 shows no "correct answer" and no correct marker.
 *   9. SCREENSHOT every state × viewport is captured and attached.
 *
 * CI only (see playwright.history-review.config.ts). Images the card asks for are
 * answered by this spec: art/ok.png is a real PNG, art/missing.png is a 404.
 */
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { FIXTURES, STATE_IDS } from "./fixtures";

// 1x1 transparent PNG: enough for the <img> to load and take its CSS size.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const PHONES = [
  { id: "320x568", w: 320, h: 568 },
  { id: "360x640", w: 360, h: 640 },
  { id: "390x844", w: 390, h: 844 },
];
const DESKTOPS = [
  { id: "1280x800", w: 1280, h: 800 },
  { id: "1280x560", w: 1280, h: 560 },
];
const REM_24 = 24 * 16;

async function openHarness(page: Page, state: string, pos = "middle") {
  await page.route("http://127.0.0.1:8000/**", (route) =>
    route.request().url().endsWith("/art/ok.png")
      ? route.fulfill({ status: 200, contentType: "image/png", body: PNG })
      : route.fulfill({ status: 404, body: "" }));
  await page.goto(`/e2e/history-review/harness.html?state=${state}&pos=${pos}`);
  await expect(page.getByTestId("history-trigger")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** A viewport screenshot, written to the output dir (uploaded as an artifact) and attached to the report. */
async function shot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

/** Every geometry fact the assertions below need, read in one pass. */
async function measure(host: Locator) {
  return host.evaluate((el) => {
    const hostBox = el.getBoundingClientRect();
    const card = el.querySelector('[data-testid="question-review-card"]') as HTMLElement | null;
    const overflowing: string[] = [];
    const clipped: string[] = [];
    const tiny: string[] = [];
    const scope = card ?? el;
    for (const node of Array.from(scope.querySelectorAll<HTMLElement>("*"))) {
      const r = node.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const label = `${node.tagName.toLowerCase()}[${node.getAttribute("data-testid") ?? node.className.toString().slice(0, 40)}]`;
      if (r.right > hostBox.right + 1 || r.left < hostBox.left - 1) {
        overflowing.push(`${label} ${Math.round(r.left)}..${Math.round(r.right)} vs host ${Math.round(hostBox.left)}..${Math.round(hostBox.right)}`);
      }
      const cs = getComputedStyle(node);
      const ownText = Array.from(node.childNodes).some((c) => c.nodeType === 3 && (c.textContent ?? "").trim());
      if (ownText) {
        const size = parseFloat(cs.fontSize);
        if (size < 8) tiny.push(`${label} ${size}px`);
        if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && cs.textOverflow !== "ellipsis"
          && node.scrollWidth > node.clientWidth + 1) {
          clipped.push(`${label} scrollWidth ${node.scrollWidth} > clientWidth ${node.clientWidth}`);
        }
      }
    }
    return {
      box: { left: hostBox.left, top: hostBox.top, right: hostBox.right, bottom: hostBox.bottom, width: hostBox.width, height: hostBox.height },
      hostScrollW: el.scrollWidth, hostClientW: el.clientWidth,
      pageScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, innerH: window.innerHeight,
      overflowing, clipped, tiny,
      text: (card ?? el).textContent ?? "",
      correctMarkers: (card ?? el).querySelectorAll('[data-option-state="correct"],[data-testid^="review-correct-answer"],[data-testid^="review-mastery-correct-answer"]').length,
    };
  });
}

function expectClean(m: Awaited<ReturnType<typeof measure>>) {
  expect(m.pageScrollW, "page scrolls sideways").toBeLessThanOrEqual(m.innerW);
  expect(m.hostScrollW, "host content wider than host").toBeLessThanOrEqual(m.hostClientW + 1);
  expect(m.overflowing, "content outside its host").toEqual([]);
  expect(m.clipped, "text silently clipped").toEqual([]);
  expect(m.tiny, "text under 8px").toEqual([]);
}

// ── static: sealed fixtures hold no answers at all ────────────────────────────
test.describe("fixture integrity", () => {
  for (const id of STATE_IDS.filter((s) => FIXTURES[s].sealed)) {
    test(`${id} carries no revealed field`, () => {
      const r = FIXTURES[id].round;
      expect(r.revealed).toBe(false);
      expect(r.question?.correctOptionIndex ?? null).toBeNull();
      expect(r.question?.explanation ?? null).toBeNull();
      for (const c of r.masteryChallenges ?? []) {
        expect([c.correctAnswer, c.explanation, c.viewerAnswer, c.isCorrect, c.combatWorking ?? null, c.comparisonValues ?? null])
          .toEqual([null, null, null, null, null, null]);
      }
      expect(JSON.stringify(r)).not.toMatch(/correct_?(option|answer)":(?!null)/i);
    });
  }
});

// ── coarse pointer: the bottom sheet ─────────────────────────────────────────
for (const vp of PHONES) {
  test.describe(`sheet ${vp.id}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    for (const id of STATE_IDS) {
      test(`${id}`, async ({ page }, testInfo) => {
        await openHarness(page, id, "bottom");
        expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "touch emulation").toBe(true);

        const trigger = page.getByTestId("history-trigger");
        await trigger.click();
        const sheet = page.getByTestId("question-review-sheet");
        await expect(sheet).toBeVisible();
        await expect(page.getByTestId("question-review-popover")).toHaveCount(0);

        const m = await measure(sheet);
        expectClean(m);
        expect(m.box.height, "sheet taller than 85dvh").toBeLessThanOrEqual(m.innerH * 0.85 + 1);
        expect(m.box.left).toBeGreaterThanOrEqual(-0.5);
        expect(m.box.right).toBeLessThanOrEqual(m.innerW + 0.5);
        expect(m.box.bottom).toBeLessThanOrEqual(m.innerH + 0.5);

        const body = page.getByTestId("question-review-sheet-body");
        const bm = await body.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(bm.sw, "sheet body scrolls sideways").toBeLessThanOrEqual(bm.cw + 1);

        const close = page.getByTestId("question-review-sheet-close");
        const cb = (await close.boundingBox())!;
        expect(cb.width, "close target width").toBeGreaterThanOrEqual(44);
        expect(cb.height, "close target height").toBeGreaterThanOrEqual(44);

        if (FIXTURES[id].sealed) {
          expect(m.correctMarkers, "sealed card marks a correct answer").toBe(0);
          expect(m.text).not.toMatch(/correct answer/i);
        }

        await shot(page, testInfo, `sheet-${vp.id}-${id}`);

        // Close control closes it and focus returns to the opener.
        await close.click();
        await expect(sheet).toHaveCount(0);
        await expect(trigger).toBeFocused();
      });
    }

    test("keyboard: Enter opens, Tab stays trapped, Escape closes and restores focus", async ({ page }) => {
      await openHarness(page, "mastery-mixed", "bottom");
      const trigger = page.getByTestId("history-trigger");
      await trigger.focus();
      await page.keyboard.press("Enter");
      const sheet = page.getByTestId("question-review-sheet");
      await expect(sheet).toBeVisible();
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="question-review-sheet"]')),
          "focus escaped the open sheet").toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  });
}

// ── fine pointer: the anchored popover ───────────────────────────────────────
for (const vp of DESKTOPS) {
  test.describe(`popover ${vp.id}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });

    for (const id of STATE_IDS) {
      for (const pos of ["middle", "bottom", "top"] as const) {
        test(`${id} from ${pos}`, async ({ page }, testInfo) => {
          await openHarness(page, id, pos);
          expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(false);

          const trigger = page.getByTestId("history-trigger");
          await trigger.click();
          const pop = page.getByTestId("question-review-popover");
          await expect(pop).toBeVisible();
          await expect(page.getByTestId("question-review-sheet")).toHaveCount(0);

          const m = await measure(pop);
          expectClean(m);
          expect(m.box.height, "popover taller than 24rem").toBeLessThanOrEqual(REM_24 + 1);
          expect(m.box.width, "popover wider than ~29rem").toBeLessThanOrEqual(29 * 16 + 1);
          expect(m.box.left, "popover left of viewport").toBeGreaterThanOrEqual(-0.5);
          expect(m.box.top, "popover above viewport").toBeGreaterThanOrEqual(-0.5);
          expect(m.box.right, "popover right of viewport").toBeLessThanOrEqual(m.innerW + 0.5);
          expect(m.box.bottom, "popover below viewport").toBeLessThanOrEqual(m.innerH + 0.5);

          if (FIXTURES[id].sealed) {
            expect(m.correctMarkers, "sealed card marks a correct answer").toBe(0);
            expect(m.text).not.toMatch(/correct answer/i);
          }

          if (pos === "middle") {
            await shot(page, testInfo, `popover-${vp.id}-${id}`);
          }
        });
      }
    }

    test("keyboard: Enter opens, Escape closes and restores focus", async ({ page }) => {
      await openHarness(page, "quiz-incorrect", "bottom");
      const trigger = page.getByTestId("history-trigger");
      await trigger.focus();
      await page.keyboard.press("Enter");
      const pop = page.getByTestId("question-review-popover");
      await expect(pop).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(pop).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test("long content scrolls inside the popover instead of growing it", async ({ page }) => {
      await openHarness(page, "quiz-long", "middle");
      await page.getByTestId("history-trigger").click();
      const pop = page.getByTestId("question-review-popover");
      await expect(pop).toBeVisible();
      const s = await pop.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }));
      expect(s.oy).toBe("auto");
      expect(s.sh, "long fixture should exceed the popover so scrolling is exercised").toBeGreaterThan(s.ch);
    });
  });
}

// ── art ──────────────────────────────────────────────────────────────────────
test.describe("art", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("a failed image request leaves a fully rendered card", async ({ page }) => {
    await openHarness(page, "quiz-missing-art");
    await page.getByTestId("history-trigger").click();
    await expect(page.getByTestId("question-review-card")).toBeVisible();
    await expect(page.getByTestId("review-options")).toBeVisible();
    await expect(page.getByTestId("review-correct-answer")).toBeVisible();
    // No broken-image glyph may contribute to layout: every <img> is either loaded or absent.
    const broken = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .filter((i) => i.complete && i.naturalWidth === 0 && i.getBoundingClientRect().width > 0)
        .map((i) => i.src));
    expect(broken, "visible broken images").toEqual([]);
  });
});

// ── combat: the server's structured working is printed, not recomputed ──────────
test.describe("combat working", () => {
  test.use({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true });
  test("the served numbers render inside the sheet", async ({ page }) => {
    await openHarness(page, "mastery-combat", "bottom");
    await page.getByTestId("history-trigger").click();
    const working = page.getByTestId("review-mastery-working-0");
    await expect(working).toBeVisible();
    await expect(working).toContainText("Leona");
    await expect(page.getByTestId("journey-combat-working-answer")).toHaveText(/83/);
  });
});
