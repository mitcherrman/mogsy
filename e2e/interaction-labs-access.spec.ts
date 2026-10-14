/**
 * INT1 — owner-only entry for the Rangefinder / Glyph Press labs.
 *
 * @owner-dev: the real AdminRoute + InteractionLabPage + the original labs,
 * with an owner (or non-owner) persona from the DEV-only E2E identity seam.
 * Loads the committed fixtures through the file input as the owner would.
 *
 * @prod-preview: the production bundle, signed out. No lab, no loader, no
 * DEV route, and no fixture content in any JS asset the page can fetch.
 *
 * Screenshots go to INT1_SHOTS (default test-results/interaction-labs).
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const SHOTS = process.env.INT1_SHOTS ?? path.resolve("test-results/interaction-labs");
mkdirSync(SHOTS, { recursive: true });
const RF_PACK = path.resolve("src/lib/rangefinder/__fixtures__/rangeAuthorityCapture.json");
const WP_PACK = path.resolve("src/lib/word-puzzle/__fixtures__/wordPuzzleRounds.json");
const WP = JSON.parse(readFileSync(WP_PACK, "utf8")) as { rounds: { id: string; answer: string }[] };
const LABEL = "Prototype • not server-authoritatively graded";

const persona = (admin: boolean) => JSON.stringify({
  token: "int1-e2e-not-a-real-token",
  user: { id: admin ? "int1-owner" : "int1-player", email: null, is_anonymous: false },
  admin,
});

/** Hermetic: Supabase answers empty, so no run depends on the network (or a CI proxy that blocks it). */
const stubSupabase = (ctx: BrowserContext) =>
  ctx.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

async function open(browser: Browser, admin: boolean, vp = { width: 1280, height: 720 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 640, hasTouch: vp.width < 640 });
  await stubSupabase(ctx);
  await ctx.addInitScript((p) => { try { localStorage.setItem("mogsy_e2e_identity", p); } catch { /* storage blocked */ } }, persona(admin));
  return ctx.newPage();
}

/** No text node or attribute other than an image src carries the answer. */
async function answerInDom(page: Page, answer: string): Promise<string[]> {
  const norm = answer.toUpperCase().replace(/[^A-Z]/g, "");
  return page.evaluate((n) => {
    const hits: string[] = [];
    const clean = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
    const root = document.querySelector('[data-mig-primitive="glyph-press"]');
    if (!root) return ["no primitive"];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (clean(walker.currentNode.textContent ?? "").includes(n)) hits.push("text");
    for (const el of root.querySelectorAll("*")) for (const a of el.getAttributeNames()) {
      if (a === "src") continue;
      if (clean(el.getAttribute(a) ?? "").includes(n)) hits.push(`${el.tagName}@${a}`);
    }
    return hits;
  }, norm);
}

test.describe("@owner-dev owner flow", () => {
  test("non-owner is redirected away and never sees a loader", async ({ browser }) => {
    const page = await open(browser, false);
    await page.goto("/admin/interaction-labs/word-puzzle");
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await expect(page.getByTestId("lab-pack-input")).toHaveCount(0);
  });

  test("index → Glyph Press: wrong file refused, real file plays a full round, refresh forgets the pack", async ({ browser }) => {
    const page = await open(browser, true);
    await page.goto("/admin/interaction-labs");
    await expect(page.getByTestId("interaction-labs-index")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("lab-prototype-label")).toHaveText(LABEL);
    await page.screenshot({ path: path.join(SHOTS, "owner-index-1280x720.png") });

    await page.getByRole("link", { name: /Glyph Press/ }).click();
    await expect(page.getByTestId("interaction-lab-loader")).toHaveAttribute("data-lab", "word-puzzle");
    await page.getByTestId("lab-pack-input").setInputFiles(RF_PACK);
    await expect(page.getByTestId("lab-pack-error")).toContainText("Not a Word Puzzle round file");
    await expect(page.locator('[data-mig-primitive="glyph-press"]')).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "owner-word-puzzle-wrong-pack-1280x720.png") });

    await page.getByTestId("lab-pack-input").setInputFiles(WP_PACK);
    const root = page.locator('[data-mig-primitive="glyph-press"]');
    await expect(root).toHaveAttribute("data-phase", "open", { timeout: 15_000 });
    await expect(page.getByTestId("lab-prototype-label")).toHaveText(LABEL);
    const id = (await page.getByTestId("lab-round").textContent())!.trim();
    const answer = WP.rounds.find((r) => r.id === id)!.answer;
    expect(await answerInDom(page, answer), "answer not in the open DOM").toEqual([]);
    await page.screenshot({ path: path.join(SHOTS, `owner-word-puzzle-open-${id}-1280x720.png`) });

    // Type the exact answer on the keyboard, lock, and see it solved.
    await page.getByTestId("gp-forme").focus();
    await page.keyboard.type(answer.replace(/[^A-Za-z]/g, "").toLowerCase());
    await page.getByTestId("gp-lock").click();
    await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 5000 });
    await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 8000 });
    await expect(root).toHaveAttribute("data-verdict", "solved");
    await page.screenshot({ path: path.join(SHOTS, `owner-word-puzzle-solved-${id}-1280x720.png`) });

    // A wrong / partial lock on the next round.
    await page.getByTestId("lab-next").click();
    await expect(root).toHaveAttribute("data-phase", "open");
    await page.getByTestId("gp-forme").focus();
    await page.keyboard.type("q");
    await page.getByTestId("gp-lock").click();
    await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 8000 });
    expect(await root.getAttribute("data-verdict")).not.toBe("solved");
    await page.screenshot({ path: path.join(SHOTS, "owner-word-puzzle-wrong-1280x720.png") });

    // The pack lives in memory only: a refresh is back at the loader.
    await page.reload();
    await expect(page.getByTestId("interaction-lab-loader")).toBeVisible({ timeout: 15_000 });
    await expect(root).toHaveCount(0);
  });

  test("Rangefinder: exact and wrong placements by keyboard, phone touch drag", async ({ browser }) => {
    const page = await open(browser, true);
    await page.goto("/admin/interaction-labs/rangefinder?round=janna-w");
    await page.getByTestId("lab-pack-input").setInputFiles(RF_PACK);
    const root = page.locator('[data-mig-primitive="rangefinder"]');
    await expect(root).toHaveAttribute("data-phase", "open", { timeout: 15_000 });
    await expect(page.getByTestId("lab-prototype-label")).toHaveText(LABEL);
    await expect(page.getByTestId("lab-round")).toHaveText("janna-w");
    expect(await page.locator('[data-mig-primitive="rangefinder"]').innerHTML()).not.toContain("550");
    await page.screenshot({ path: path.join(SHOTS, "owner-rangefinder-open-1280x720.png") });

    // Janna W is 550: Home (100) + 18 stops of 25.
    const field = page.getByRole("slider");
    await field.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowRight");
    await expect(field).toHaveAttribute("aria-valuenow", "550");
    await page.getByTestId("rangefinder-lock").click();
    await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 8000 });
    await expect(root).toHaveAttribute("data-verdict", "exact");
    await page.screenshot({ path: path.join(SHOTS, "owner-rangefinder-exact-1280x720.png") });

    await page.getByTestId("lab-next").click();
    await expect(root).toHaveAttribute("data-phase", "open");
    await field.focus();
    await page.keyboard.press("End");
    await page.getByTestId("rangefinder-lock").click();
    await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 8000 });
    expect(["short", "long"]).toContain(await root.getAttribute("data-verdict"));
    await page.screenshot({ path: path.join(SHOTS, "owner-rangefinder-wrong-1280x720.png") });

    const phone = await open(browser, true, { width: 390, height: 844 });
    await phone.goto("/admin/interaction-labs/rangefinder?round=ezreal-q");
    await phone.getByTestId("lab-pack-input").setInputFiles(RF_PACK);
    const proot = phone.locator('[data-mig-primitive="rangefinder"]');
    await expect(proot).toHaveAttribute("data-phase", "open", { timeout: 15_000 });
    const box = (await phone.getByRole("slider").boundingBox())!;
    await phone.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.3);
    await expect(phone.getByRole("slider")).not.toHaveAttribute("aria-valuenow", "");
    await phone.screenshot({ path: path.join(SHOTS, "owner-rangefinder-placed-390x844.png") });
    await phone.getByTestId("rangefinder-lock").tap();
    await expect(proot).toHaveAttribute("data-reveal-stage", "done", { timeout: 8000 });
    await phone.screenshot({ path: path.join(SHOTS, "owner-rangefinder-revealed-390x844.png") });
  });
});

test.describe("@prod-preview production bundle, signed out", () => {
  test.beforeEach(async ({ context }) => { await stubSupabase(context); });

  for (const p of ["/admin/interaction-labs", "/admin/interaction-labs/word-puzzle", "/admin/interaction-labs/rangefinder"]) {
    test(`${p} mounts no loader and no lab`, async ({ page }) => {
      await page.goto(p);
      // Signed out, AdminRoute either redirects home or (Supabase unreachable) shows the unavailable card.
      await expect(async () => {
        const home = new URL(page.url()).pathname === "/";
        const unavailable = await page.getByTestId("owner-unavailable").count();
        expect(home || unavailable > 0).toBe(true);
      }).toPass({ timeout: 20_000 });
      await expect(page.getByTestId("lab-pack-input")).toHaveCount(0);
      await expect(page.locator("[data-mig-primitive]")).toHaveCount(0);
      await page.screenshot({ path: path.join(SHOTS, `prod-signed-out-${p.split("/").pop()}.png`) });
    });
  }

  for (const p of ["/dev/word-puzzle", "/dev/rangefinder"]) {
    test(`${p} is not a route in production`, async ({ page }) => {
      await page.goto(p);
      await page.waitForTimeout(1500);
      await expect(page.locator("[data-mig-primitive]")).toHaveCount(0);
      await expect(page.getByTestId("word-puzzle-lab")).toHaveCount(0);
      await expect(page.getByTestId("rangefinder-lab")).toHaveCount(0);
    });
  }

  test("no JS asset of the production build carries fixture content", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const entry = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
    expect(entry.length).toBeGreaterThan(0);
    const manifestish = await (await request.get(entry[0])).text();
    const chunks = new Set([...manifestish.matchAll(/assets\/([A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js)/g)].map((m) => `/assets/${m[1]}`));
    const labChunks = [...chunks].filter((c) => /InteractionLabPage|RangefinderLab|WordPuzzleLab/.test(c));
    expect(labChunks.length, "the lab chunks are reachable (and therefore public)").toBeGreaterThan(0);
    const markers = [
      "2026-10-11T23:48:19.725Z", "2026-10-11T21:48:10.970Z", "Template:Data_Ahri/Spirit_Rush",
      "A desert empire of the Ascended", "Life Form Disintegration Ray is", "castRangeUnits\":",
    ];
    for (const c of [...chunks, ...entry]) {
      const body = await (await request.get(c)).text();
      for (const m of markers) expect(body.includes(m), `${c} contains ${m}`).toBe(false);
    }
  });
});
