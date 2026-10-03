// Landing contracts in a real browser: auto timing, click / Enter / Space,
// history replace, Back cancellation, reduced motion.
const { chromium } = require("playwright") // run from the repo root;
const BASE = process.argv[2];

const mounted = (page) => page.waitForSelector('[data-testid="mogzy-entry-v2"]').then(() => page.evaluate(() => performance.now()));
const atHub = (page) => page.waitForURL("**/lol", { timeout: 15000 }).then(() => page.evaluate(() => performance.now()));

(async () => {
  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  const out = [];
  const fresh = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
    const prime = await ctx.newPage(); // warm cache: we test behaviour, not network
    await prime.goto(BASE + "/"); await prime.waitForURL("**/lol"); await prime.close();
    return ctx;
  };

  // 1. automatic journey
  {
    const ctx = await fresh(); const page = await ctx.newPage();
    await page.goto(BASE + "/terms"); await page.waitForLoadState("domcontentloaded");
    await page.goto(BASE + "/", { waitUntil: "commit" });
    const m = await mounted(page); const h = await atHub(page);
    out.push(["auto: mount → /lol", Math.round(h - m) + " ms"]);
    // history replace: Back from the Hub returns to the page before "/", not to "/"
    await page.goBack(); await page.waitForTimeout(800);
    out.push(["auto: Back from Hub lands on", new URL(page.url()).pathname]);
    await ctx.close();
  }
  // 2. click / Enter / Space during the hold enter at once
  for (const how of ["click", "Enter", "Space"]) {
    const ctx = await fresh(); const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "commit" });
    const m = await mounted(page);
    await page.waitForTimeout(250);
    const t = await page.evaluate(() => performance.now());
    if (how === "click") await page.getByRole("button", { name: "Enter Mogzy" }).click();
    else await page.keyboard.press(how);
    const h = await atHub(page);
    out.push([`${how} at ${Math.round(t - m)} ms → /lol after`, Math.round(h - t) + " ms (transition 780)"]);
    await ctx.close();
  }
  // 3. Back during the hold cancels the hand-off
  {
    const ctx = await fresh(); const page = await ctx.newPage();
    await page.goto(BASE + "/terms"); await page.waitForLoadState("domcontentloaded");
    await page.goto(BASE + "/", { waitUntil: "commit" });
    await mounted(page); await page.waitForTimeout(500);
    await page.goBack(); await page.waitForTimeout(3000);
    out.push(["Back at 500 ms into hold → after 3 s at", new URL(page.url()).pathname]);
    await ctx.close();
  }
  // 4. reduced motion
  {
    const ctx = await fresh({ reducedMotion: "reduce" }); const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "commit" });
    const m = await mounted(page); const h = await atHub(page);
    out.push(["reduced motion: mount → /lol", Math.round(h - m) + " ms (450 + 220)"]);
    await ctx.close();
  }
  for (const [k, v] of out) console.log(k.padEnd(44), v);
  await browser.close();
})();
