/**
 * PHD-RELEASE — the Patch Hub's List View, Deck View and Catch Up, in a real
 * browser, logged out, on the LIVE public Patch Report API.
 *
 *   1. COEXIST     /lol/patch-reports (List), /lol/patch-deck (Deck) and
 *                  Catch Up all render for a guest; Catch Up has no layout switch.
 *   2. SWITCH      List → Deck carries the patch and the URL's entity anchor;
 *                  Deck → List lands on that entity; Back returns.
 *   3. VIEWPORTS   1280, 1440, 1920, 375, 320: no sideways scroll, no broken
 *                  images, no console errors; screenshots of every face.
 *   4. ART         mirrored champions (face right of 56%) put art on the right.
 *   5. CHAPTERS    champion, item and system cards are reachable from the rail.
 *   6. FACES       Overview, Riot Changes, Impact (chart click), History,
 *                  Explore; keyboard (←/→/]), focus ring, reduced motion.
 *   7. NETWORK     opening a card reads only its own patch; earlier reports are
 *                  read only when History opens, at most 12.
 *   8. PHONE       sticky face bar under the HUD and swipe on the art.
 *   9. FALLBACKS   archived patch, unknown card → cover, unknown patch → error.
 *
 * CI only (playwright.patch-deck.config.ts). PATCH_DECK_BASE_URL points the
 * same checks at the published site.
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const SWAIN = "s-patch-champions__e-champion-swain";
const KSANTE = "s-patch-champions__e-champion-k-sante";
const LUCIAN = "s-patch-champions__e-champion-lucian";
const PATCH = "26.20";

const VIEWPORTS = [
  { id: "1280", width: 1280, height: 800 },
  { id: "1440", width: 1440, height: 900 },
  { id: "1920", width: 1920, height: 1080 },
  { id: "375", width: 375, height: 812, phone: true },
  { id: "320", width: 320, height: 700, phone: true },
] as const;

type Watch = { consoleErrors: string[]; pageErrors: string[]; reportReads: string[] };

/** Collect console errors, uncaught errors and Patch Report detail reads for one page. */
function watch(page: Page): Watch {
  const w: Watch = { consoleErrors: [], pageErrors: [], reportReads: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") w.consoleErrors.push(`${msg.text()} @ ${msg.location().url}`);
  });
  page.on("pageerror", (err) => w.pageErrors.push(String(err)));
  page.on("request", (req) => {
    const m = /\/api\/patch-reports\/([^/?#]+)$/.exec(new URL(req.url()).pathname);
    if (m) w.reportReads.push(decodeURIComponent(m[1]));
  });
  return w;
}

async function expectNoErrors(w: Watch, info: TestInfo) {
  if (w.consoleErrors.length) await info.attach("console-errors", { body: w.consoleErrors.join("\n"), contentType: "text/plain" });
  expect(w.pageErrors, "uncaught page errors").toEqual([]);
  expect(w.consoleErrors, "console errors").toEqual([]);
}

async function shot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
}

async function noSidewaysScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(sw, "document is not wider than the viewport").toBeLessThanOrEqual(cw);
}

/**
 * Every <img> on screen has finished loading with pixels (artwork fallbacks
 * included). Off-screen lazy images have not been requested yet and are skipped.
 */
async function noBrokenImages(page: Page) {
  // Marks on-screen images (no eval: the live site may run a strict CSP).
  const mark = () =>
    page.evaluate(() => {
      const out: { src: string; complete: boolean; ok: boolean }[] = [];
      for (const img of Array.from(document.images)) {
        const r = img.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
        out.push({ src: img.currentSrc || img.src, complete: img.complete, ok: img.naturalWidth > 0 });
      }
      return out;
    });
  await expect.poll(async () => (await mark()).every((i) => i.complete), { timeout: 60_000 }).toBe(true);
  const broken = (await mark()).filter((i) => !i.ok).map((i) => i.src);
  expect(broken, "broken images").toEqual([]);
}

/** The current card, once a card change has settled (the outgoing card animates out alongside it). */
async function deckCard(page: Page) {
  const cards = page.getByTestId("deck-card");
  await expect(cards).toHaveCount(1);
  return cards;
}

async function openDeck(page: Page, search: string) {
  await page.goto(`/lol/patch-deck${search}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("patch-deck")).toBeVisible({ timeout: 90_000 });
  await expect(await deckCard(page)).toBeVisible();
}

/** A real touch swipe (Chromium touch events → pointer events), right to left. */
async function swipeLeft(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height * 0.5;
  const xs = [0.7, 0.6, 0.5, 0.4, 0.3, 0.2].map((f) => box.x + box.width * f);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: xs[0], y }] });
  for (const x of xs.slice(1)) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function openFace(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
  await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
}

const cardId = async (page: Page) => (await deckCard(page)).getAttribute("data-card-id");

test.describe("Patch Hub views coexist for a guest", () => {
  test("List View offers List | Deck; Catch Up does not; both routes render logged out", async ({ page }, info) => {
    const w = watch(page);
    await page.goto(`/lol/patch-reports?patch=${PATCH}`, { waitUntil: "domcontentloaded" });
    const layout = page.getByTestId("patch-hub-layout-switch");
    await expect(layout).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("patch-hub-layout-list")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("patch-hub-layout-deck")).toHaveAttribute("href", `/lol/patch-deck?patch=${PATCH}`);
    await expect(page.locator(`[id="${SWAIN}"]`)).toBeVisible();
    // A guest: no signed-in account chrome is needed for either page.
    await shot(page, info, "list-1280");

    await page.getByTestId("patch-hub-view-catchup").click();
    await expect(page).toHaveURL(/view=catchup|since=/);
    await expect(page.getByTestId("patch-hub-layout-switch")).toHaveCount(0);
    await shot(page, info, "catchup-1280");

    await page.goBack();
    await expect(page.getByTestId("patch-hub-layout-switch")).toBeVisible();
    await expectNoErrors(w, info);
  });

  test("List → Deck carries patch and entity; Deck → List lands on it; Back returns", async ({ page }, info) => {
    const w = watch(page);
    // A Swain permalink (the URL's semantic entity anchor) is carried into the deck.
    await page.goto(`/lol/patch-reports?patch=${PATCH}#${SWAIN}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`[id="${SWAIN}"]`)).toBeInViewport({ timeout: 90_000 });
    await page.getByTestId("patch-hub-layout-deck").click();
    await expect(page).toHaveURL(new RegExp(`/lol/patch-deck\\?patch=${PATCH.replace(".", "\\.")}&card=${SWAIN}$`));
    await expect(await deckCard(page)).toHaveAttribute("data-card-id", SWAIN);

    // Steps through cards replace the entry; Back leaves the deck.
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => cardId(page)).not.toBe(SWAIN);
    await page.keyboard.press("ArrowLeft");
    await expect(await deckCard(page)).toHaveAttribute("data-card-id", SWAIN);

    await page.getByTestId("deck-list-link").click();
    await expect(page).toHaveURL(new RegExp(`/lol/patch-reports\\?patch=${PATCH.replace(".", "\\.")}#${SWAIN}$`));
    const swain = page.locator(`[id="${SWAIN}"]`);
    await expect(swain).toBeInViewport();

    await page.goBack();
    await expect(await deckCard(page)).toHaveAttribute("data-card-id", SWAIN);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/lol/patch-reports\\?patch=${PATCH.replace(".", "\\.")}#${SWAIN}$`));
    await expectNoErrors(w, info);
  });
});

for (const vp of VIEWPORTS) {
  test.describe(`Deck View at ${vp.id}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: "phone" in vp, isMobile: "phone" in vp });

    test("cover, champion faces, item and system chapters", async ({ page }, info) => {
      const w = watch(page);
      await openDeck(page, `?patch=${PATCH}`);
      await expect(await deckCard(page)).toHaveAttribute("data-card-kind", "cover");
      await noBrokenImages(page);
      await noSidewaysScroll(page);
      await shot(page, info, `${vp.id}-cover`);

      // Swain (face at 67%) is mirrored; K'Sante (33%) keeps the art left.
      await openDeck(page, `?patch=${PATCH}&card=${SWAIN}`);
      if (!("phone" in vp)) {
        await expect(await deckCard(page)).toHaveAttribute("data-side", "right");
      }
      expect(w.reportReads.filter((v) => v !== PATCH), "a card reads only its own patch").toEqual([]);
      await noBrokenImages(page);
      await noSidewaysScroll(page);
      await shot(page, info, `${vp.id}-swain-overview`);

      await openFace(page, "Riot changes");
      await expect(page.getByTestId("deck-face-changes")).toBeVisible();
      await noSidewaysScroll(page);
      await shot(page, info, `${vp.id}-swain-changes`);
      expect(w.reportReads.filter((v) => v !== PATCH), "no eager history reads").toEqual([]);

      await openFace(page, "Patch history");
      await expect(page.getByTestId("deck-history-strip")).toBeVisible();
      await expect(page.getByTestId("deck-history-loading")).toHaveCount(0, { timeout: 90_000 });
      const earlier = new Set(w.reportReads.filter((v) => v !== PATCH));
      expect(earlier.size, "history reads earlier reports").toBeGreaterThan(0);
      expect(earlier.size, "history window").toBeLessThanOrEqual(12);
      await noSidewaysScroll(page);
      await shot(page, info, `${vp.id}-swain-history`);

      await openFace(page, "Explore");
      await expect(page.getByTestId("deck-face-explore")).toBeVisible();
      await shot(page, info, `${vp.id}-swain-explore`);

      await openDeck(page, `?patch=${PATCH}&card=${KSANTE}`);
      if (!("phone" in vp)) {
        await expect(await deckCard(page)).toHaveAttribute("data-side", "left");
      }
      await expect(page.getByTestId("deck-direction").first()).toBeVisible();
      await noBrokenImages(page);
      await shot(page, info, `${vp.id}-ksante-overview`);

      // Impact: the level chart answers a click (desktop) / the dial is present (phone).
      await openDeck(page, `?patch=${PATCH}&card=${LUCIAN}&face=impact`);
      await expect(page.getByTestId("deck-impact-loading")).toHaveCount(0, { timeout: 90_000 });
      const chart = page.getByTestId("deck-impact-chart");
      if (await chart.count()) {
        await page.locator('[data-testid="deck-chart-hit"][data-level="8"]').click({ force: true });
        await expect(page.getByTestId("deck-impact-dial")).toHaveAttribute("data-level", "8");
      } else {
        info.annotations.push({ type: "impact", description: "Lucian 26.20 rendered no chart (unavailable state shown)" });
        await expect(page.getByTestId("deck-impact-panel").or(page.getByTestId("deck-impact-unavailable")).first()).toBeVisible();
      }
      await noSidewaysScroll(page);
      await shot(page, info, `${vp.id}-lucian-impact`);

      // Chapters: every chapter pill opens its first card; items and systems exist in 26.20.
      const kinds = new Set<string>();
      const pills = page.getByTestId("deck-chapter");
      const n = await pills.count();
      for (let i = 0; i < n; i++) {
        await pills.nth(i).click();
        const kind = await (await deckCard(page)).getAttribute("data-card-kind");
        if (kind && !kinds.has(kind)) {
          kinds.add(kind);
          await noBrokenImages(page);
          await noSidewaysScroll(page);
          await shot(page, info, `${vp.id}-chapter-${kind}`);
        }
      }
      expect([...kinds]).toEqual(expect.arrayContaining(["champion", "item", "system"]));
      await expectNoErrors(w, info);
    });

    if ("phone" in vp) {
      test("sticky face bar under the HUD, swipe on the art", async ({ page }, info) => {
        const w = watch(page);
        await openDeck(page, `?patch=${PATCH}&card=${SWAIN}&face=changes`);
        const bar = page.locator(".dk-tabs-bar");
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(400);
        const { barTop, deckTop } = await page.evaluate(() => ({
          barTop: document.querySelector(".dk-tabs-bar")!.getBoundingClientRect().top,
          deckTop: document.querySelector(".dk-top")!.getBoundingClientRect().bottom,
        }));
        expect(Math.abs(barTop - deckTop), "face bar sticks under the deck bar").toBeLessThanOrEqual(2);
        await expect(bar).toBeInViewport();
        await shot(page, info, `${vp.id}-sticky-face-bar`);

        await page.mouse.wheel(0, -2000);
        await page.waitForTimeout(300);
        const box = (await page.getByTestId("deck-swipe").boundingBox())!;
        await swipeLeft(page, box);
        await expect.poll(() => cardId(page)).not.toBe(SWAIN);
        await noSidewaysScroll(page);
        await expectNoErrors(w, info);
      });
    }
  });
}

test.describe("keyboard, focus and reduced motion", () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

  test("arrows and ] move, focus is visible, motion collapses", async ({ page }, info) => {
    const w = watch(page);
    await openDeck(page, `?patch=${PATCH}&card=${SWAIN}`);
    const start = await page.getByTestId("patch-deck").getAttribute("data-index");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("patch-deck")).not.toHaveAttribute("data-index", start!);
    await page.keyboard.press("]");
    await expect(page.getByTestId("patch-deck")).toHaveAttribute("data-face", "changes");
    await page.keyboard.press("Home");
    await expect(await deckCard(page)).toHaveAttribute("data-card-kind", "cover");

    // Tab into the deck: the focused control shows the gold ring.
    let ring = "";
    for (let i = 0; i < 40 && !ring; i++) {
      await page.keyboard.press("Tab");
      ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el?.closest(".phd1-deck")) return "";
        const s = getComputedStyle(el);
        return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 ? `${s.outlineStyle} ${s.outlineWidth}` : "";
      });
    }
    expect(ring, "a deck control shows a visible focus outline").not.toBe("");

    // The deck's reduced-motion override collapses every CSS transition to 1ms.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const motion = await page.evaluate(() => ({
      matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      durations: [".dk-layout-switch__item", ".dk-chapter", ".dk-tickmark"].map((sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).transitionDuration : "missing";
      }),
    }));
    info.annotations.push({ type: "reduced-motion", description: JSON.stringify(motion) });
    expect(motion.matches).toBe(true);
    for (const d of motion.durations) {
      expect(d.split(",").every((part) => parseFloat(part) * (part.trim().endsWith("ms") ? 0.001 : 1) <= 0.001), d).toBe(true);
    }
    await shot(page, info, "1440-reduced-motion-cover");
    await expectNoErrors(w, info);
  });
});

test.describe("fallbacks", () => {
  test("archived patch, unknown card and unknown patch", async ({ page }, info) => {
    const w = watch(page);
    await openDeck(page, "?patch=26.15");
    await expect(page.getByTestId("deck-patch-select")).toHaveValue("26.15");
    await expect(await deckCard(page)).toHaveAttribute("data-card-kind", "cover");
    await shot(page, info, "archived-26.15-cover");

    await openDeck(page, `?patch=${PATCH}&card=s-patch-champions__e-champion-nobody&face=impact`);
    await expect(await deckCard(page)).toHaveAttribute("data-card-kind", "cover");
    await expect(page).toHaveURL(new RegExp(`/lol/patch-deck\\?patch=${PATCH.replace(".", "\\.")}$`));

    await page.goto("/lol/patch-deck?patch=9.99", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Could not load patch 9.99")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("link", { name: /^Open Patch / })).toBeVisible();
    await shot(page, info, "unknown-patch");
    // The 9.99 404s are the expected failure being tested, not app errors.
    w.consoleErrors = w.consoleErrors.filter((e) => !/9\.99|404/.test(e));
    await expectNoErrors(w, info);
  });
});
