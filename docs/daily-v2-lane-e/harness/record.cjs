// LOCAL-ONLY, owner-approved run: ONE bundled headless Chromium (no channel,
// no installed Edge/Chrome, no user profile), one context, recorded video.
// Plays one Daily three-acts take at 390x844 against the local stack
// (Vite 127.0.0.1:8790 in E2E mode -> scratch backend 127.0.0.1:8711).
// Firm 9-minute deadline; browser always closed in finally.
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(process.env.WT, "node_modules", "playwright"));

const HERE = __dirname;
const persona = fs.readFileSync(path.join(HERE, "persona.json"), "utf8");
const OUT = path.join(HERE, "video");
const DEADLINE = Date.now() + 9 * 60 * 1000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let browser;
async function main() {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
  });
  await context.addInitScript((p) => {
    localStorage.setItem("mogsy_e2e_identity", p);
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
  }, persona);
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8790/admin/creator-replay", { timeout: 120000 });
  await page.getByTestId("three-acts-new").click({ timeout: 60000 });
  await page.waitForURL(/\/quiz\/daily-challenge\/creator\/dr_/, { timeout: 60000 });
  log("take", page.url());
  let last = "";
  while (Date.now() < DEADLINE) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (/DAILY SCORE/i.test(text) && !/\d+ \/ 19/.test(text)) { log("stage result"); break; }
    const hdr = (text.match(/(\d+) \/ 19/) || [])[0] || "";
    const play = page.getByRole("button", { name: /^(play|start|begin|continue|enter)/i }).first();
    if (!hdr && await play.isVisible().catch(() => false)) { await play.click().catch(() => {}); }
    const opt = page.locator('[aria-label="Answer options"] button:not([disabled])').first();
    if (await opt.isVisible().catch(() => false)) {
      await page.waitForTimeout(1200);
      await opt.click({ timeout: 2000 }).catch(() => {});
      if (hdr !== last) { log("answered", hdr); last = hdr; }
    } else {
      // A Meta Reflex card: take the left card when one is live.
      const card = page.locator('button[aria-label]:has(img)').first();
      if (/STAT CHECK/i.test(text) && await card.isVisible().catch(() => false)) {
        await page.waitForTimeout(1500);
        await card.click({ timeout: 1000, position: { x: 20, y: 20 } }).catch(() => {});
        if (hdr + "mr" !== last) { log("card", hdr); last = hdr + "mr"; }
      }
    }
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(HERE, "result-390.png") });
  await context.close();   // flushes the video
}

main().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close().catch(() => {}); });
process.on("SIGINT", async () => { if (browser) await browser.close().catch(() => {}); process.exit(130); });
process.on("SIGTERM", async () => { if (browser) await browser.close().catch(() => {}); process.exit(143); });
