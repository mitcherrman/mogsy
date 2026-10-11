// PPQ2-E — capture + geometry probe of the PRODUCTION route /lol/pro-play/quiz
// on the live API (real guest sessions; nothing but ordinary ephemeral quiz
// sessions is created). Run with cwd = the PPQ2-E worktree.
//
//   node docs/handoffs/ppq2e/route-cap.cjs <outDir> [viewports] [runs]
//     viewports: comma list WxH (default 390x844,1024x768,1440x900)
//     runs:      comma list of  main | partial | absent | long   (default all)
//
//  main     one full session: pre, selected (answer held in flight), the first
//           reveal of each verdict, the first four-way reveal, Source open,
//           then on to the completed summary.
//  partial  the live answer response with option B's evidence subject removed
//  absent   the live answer response with `evidence` removed
//  long     the live answer response with a long explanation (server sentence
//           + a synthetic second sentence)
//  The three variants are SYNTHETIC network rewrites of real responses on the
//  real production route; each capture name says which. A variant run plays
//  until it has captured a two-way and a four-way reveal.
//
// Env: PPQ_BASE (default http://localhost:5281), PPQ_CACHE (asset cache),
//      PPQ_RM=1 (reduced motion), PPQ_LEGACY=1 (the pre-PPQ2-E page on main:
//      pre, first reveal and the completed summary only).
//
// Screenshots: `-view` is the viewport exactly as the player sees it at the
// settled state (no scroll reset). Below 1024 a `-full` page capture is also
// written for context, taken at the same scroll position.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const BASE = process.env.PPQ_BASE || "http://localhost:5281";
const CACHE = process.env.PPQ_CACHE || path.join(process.cwd(), "..", ".ppq2int-asset-cache");
const LEGACY = process.env.PPQ_LEGACY === "1";
const [outDir, vpArg, runArg] = process.argv.slice(2);
const viewports = (vpArg || "390x844,1024x768,1440x900").split(",").map((s) => { const [w, h] = s.split("x").map(Number); return { width: w, height: h }; });
const runs = (runArg || (LEGACY ? "main" : "main,partial,absent,long")).split(",");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

// The PPQ2-INT geometry probe, reused verbatim (one source of truth).
const capSrc = fs.readFileSync(path.join(__dirname, "..", "ppq2int", "cap.cjs"), "utf8");
const PROBE = eval(capSrc.slice(capSrc.indexOf("const PROBE = () => {"), capSrc.indexOf("async function settle(page)")) + "; PROBE");

// PPQ2-E — the app dock (Report pill) against the reveal footer, in the
// viewport as it stands. Any visible text or control of the footer under a
// dock tab is a violation; so is a footer whose bottom is not clear of the
// dock band after the reveal settled.
const DOCK_PROBE = () => {
  const out = { violations: [], notes: [] };
  const vis = (el) => { if (!el) return false; const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return cs.visibility !== "hidden" && b.width > 0 && b.height > 0; };
  const tabs = [...document.querySelectorAll('[data-testid^="mogzy-dock-tabs-"] > *')].filter(vis).map((t) => t.getBoundingClientRect());
  out.dockTabs = tabs.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }));
  const footer = document.querySelector("[data-pp-reveal-footer]");
  if (!footer) return out;
  const fb = footer.getBoundingClientRect();
  out.footerViewport = { top: Math.round(fb.top), bottom: Math.round(fb.bottom), vh: innerHeight };
  const clearance = parseFloat(getComputedStyle(footer).scrollMarginBottom) || 0;
  out.clearance = clearance;
  const texts = [...footer.querySelectorAll("[data-pp-reveal-scope], [data-pp-reveal-explanation], [data-pp-reveal-note], [data-pp-reveal-source], [data-testid='pro-play-next'], [data-pp-reveal-readout]")].filter((e) => vis(e) && !e.classList.contains("sr-only"));
  for (const t of texts) {
    const b = t.getBoundingClientRect();
    for (const d of tabs) {
      const ix = Math.min(b.right, d.right) - Math.max(b.left, d.left);
      const iy = Math.min(b.bottom, d.bottom) - Math.max(b.top, d.top);
      if (ix > 0.5 && iy > 0.5) out.violations.push(`dock tab over footer ${Object.keys(t.dataset)[0] || t.getAttribute("data-testid")} ${Math.round(ix)}x${Math.round(iy)}`);
    }
  }
  if (fb.bottom > innerHeight - clearance + 1 && fb.top < innerHeight) out.violations.push(`footer bottom ${Math.round(fb.bottom)} inside the dock band (vh ${innerHeight} - ${Math.round(clearance)})`);
  return out;
};

async function settle(page, ms = 900) {
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll("[data-pro-play-plate] img, [data-option-media] img, [data-option-content] img")].filter((i) => i.offsetParent !== null);
    return imgs.every((i) => i.complete);
  }, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

const LONG_TAIL = " Synthetic second sentence for the long-explanation check: the comparison counts every scope game in this window with a recorded result, and players with fewer than the minimum sample are excluded before the ranking is made.";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const results = [];
  const stamp = (s) => s.replace(/[^a-z0-9_.+-]/gi, "_");
  try {
    for (const vp of viewports) {
      for (const run of runs) {
        const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: process.env.PPQ_RM === "1" ? "reduce" : "no-preference" });
        await context.route(/supabase\.co\//, (route) => route.abort());
        await context.route(/railway\.app\/(?!api\/pro-play)|fonts\.gstatic\.com\/|fonts\.googleapis\.com\//, async (route) => {
          const url = route.request().url();
          const key = path.join(CACHE, crypto.createHash("sha1").update(url).digest("hex"));
          if (fs.existsSync(key + ".body")) {
            const meta = JSON.parse(fs.readFileSync(key + ".json", "utf8"));
            return route.fulfill({ status: meta.status, headers: meta.headers, body: fs.readFileSync(key + ".body") });
          }
          for (let i = 0; i < 4; i++) {
            try {
              const res = await route.fetch({ timeout: 45000 });
              const body = await res.body();
              if (res.status() < 500) {
                const headers = { "content-type": res.headers()["content-type"] || "application/octet-stream", "access-control-allow-origin": "*" };
                fs.writeFileSync(key + ".body", body);
                fs.writeFileSync(key + ".json", JSON.stringify({ status: res.status(), headers }));
                return route.fulfill({ status: res.status(), headers, body });
              }
            } catch (e) { /* retry */ }
          }
          return route.abort();
        });
        // Live answer responses: optionally held (the "selected" frame) and
        // optionally rewritten (the labelled variants).
        let hold = null;
        await context.route(/\/api\/pro-play\/quiz\/sessions\/[^/]+\/answer$/, async (route) => {
          if (hold) await hold.promise;
          const res = await route.fetch({ timeout: 60000 });
          let body = await res.text();
          if (run !== "main" && res.status() === 200) {
            const j = JSON.parse(body);
            const r = j.result;
            if (run === "absent") delete r.evidence;
            if (run === "partial" && r.evidence && Array.isArray(r.evidence.subjects)) {
              const req = JSON.parse(route.request().postData() || "{}");
              void req;
              const choices = lastQuestion?.choices || [];
              const drop = choices[1];
              r.evidence.subjects = r.evidence.subjects.filter((s) => s.label !== drop);
            }
            if (run === "long") r.explanation = String(r.explanation || "") + LONG_TAIL;
            body = JSON.stringify(j);
          }
          return route.fulfill({ status: res.status(), headers: { ...res.headers(), "content-length": String(Buffer.byteLength(body)) }, body });
        });
        // The question on stage (for the partial rewrite's "option B").
        let lastQuestion = null;
        context.on("response", async (res) => {
          if (!/\/api\/pro-play\/quiz\/sessions/.test(res.url()) || res.status() !== 200) return;
          try { const j = await res.json(); if (j && j.question) lastQuestion = j.question; } catch { /* body consumed */ }
        });

        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        page.on("console", (m) => { if (m.type() === "error" && !/supabase|Failed to load resource|ERR_FAILED/i.test(m.text())) errors.push("console: " + m.text().slice(0, 160)); });

        const shoot = async (label, extra = {}) => {
          const name = stamp(`${LEGACY ? "main-legacy-" : ""}${label}-${vp.width}x${vp.height}`);
          const probe = LEGACY ? { violations: [], notes: [] } : await page.evaluate(PROBE);
          const dock = LEGACY ? { violations: [], notes: [] } : await page.evaluate(DOCK_PROBE);
          await page.screenshot({ path: path.join(outDir, name + "-view.jpg"), type: "jpeg", quality: 82 });
          if (vp.width < 1024) await page.screenshot({ path: path.join(outDir, name + "-full.jpg"), type: "jpeg", quality: 78, fullPage: true });
          const all = [...probe.violations, ...dock.violations];
          results.push({ name, run, viewport: vp, errors: [...errors], ...extra, ...probe, dock });
          console.log(`${name}: ${all.length || errors.length ? "FAIL" : "ok"} ${[...all, ...probe.notes, ...errors].join("; ")}`);
          errors.length = 0;
        };

        const QUESTION = LEGACY ? "[data-quiz-choice]" : '[data-pro-play-phase="question"] [data-testid="ranked-question"]';
        for (let a = 0; ; a++) { try { await page.goto(`${BASE}/lol/pro-play/quiz`, { waitUntil: "domcontentloaded", timeout: 120000 }); break; } catch (e) { if (a >= 2) throw e; } }
        await page.waitForSelector(QUESTION, { timeout: 120000 });
        await settle(page);

        const seen = new Set();
        let fourWay = false;
        let twoWay = false;
        for (let qn = 1; qn <= 10; qn++) {
          await page.waitForSelector(QUESTION, { timeout: 60000 });
          await settle(page, 500);
          const n = await page.$$eval("[data-quiz-choice]", (els) => els.length);
          if (run === "main" && qn === 1) await shoot("pre", { choices: n });
          const wantSelected = run === "main" && qn === 1 && !LEGACY;
          if (wantSelected) { let release; hold = { promise: new Promise((r) => { release = r; }) }; hold.release = release; }
          await page.click('[data-quiz-choice="0"]');
          if (wantSelected) {
            await page.waitForSelector('[data-choice-state="selected"]', { timeout: 30000 });
            await page.waitForTimeout(300);
            await shoot("selected", { choices: n });
            hold.release(); hold = null;
          }
          if (LEGACY) await page.waitForSelector("[data-quiz-answer-feedback]", { timeout: 60000 });
          else await page.waitForSelector('[data-pro-play-phase="revealed"]', { timeout: 60000 });
          await settle(page, 1300); // values staged ≤ 630 ms, footer ≤ 710 ms, smooth scroll
          const verdict = LEGACY
            ? ((await page.$('[data-choice-state="correct-selected"], [data-choice-state="correct"][data-quiz-choice="0"]')) ? "correct" : "incorrect")
            : await page.$eval("[data-pp-reveal-footer]", (e) => e.dataset.ppRevealFooter);
          const state = !LEGACY ? await page.$eval("[data-pp-reveal-footer]", (e) => e.dataset.ppEvidenceState) : "legacy";
          const tag = run === "main" ? "" : `-${run === "long" ? "long_explanation" : "evidence_" + run}`;
          if (run === "main") {
            if (!seen.has(verdict)) { seen.add(verdict); await shoot(`reveal-${verdict}${n === 4 ? "-4way" : ""}`, { choices: n, verdict, evidenceState: state }); }
            else if (n >= 3 && !fourWay) { await shoot(`reveal-${verdict}-4way`, { choices: n, verdict, evidenceState: state }); }
            if (n >= 3) fourWay = true;
            if (qn === 1 && !LEGACY) {
              await page.click("[data-pp-reveal-source]");
              await page.waitForSelector("[data-pp-reveal-source-panel]", { timeout: 10000 });
              await page.waitForTimeout(400);
              await shoot("source", { choices: n, verdict });
              await page.keyboard.press("Escape");
              await page.waitForTimeout(300);
            }
            if (LEGACY && seen.size >= 1 && qn === 1) { /* one legacy reveal is enough */ }
          } else {
            const want = n >= 3 ? !fourWay : !twoWay;
            if (want) await shoot(`reveal${tag}-${verdict}-${n === 2 ? "2way" : "4way"}`, { choices: n, verdict, evidenceState: state });
            if (n >= 3) fourWay = true; else twoWay = true;
            if (fourWay && twoWay) break;
          }
          const next = LEGACY
            ? page.getByRole("button", { name: qn === 10 ? "See results" : "Next" })
            : page.locator('[data-testid="pro-play-next"]');
          await next.click();
        }
        if (run === "main") {
          await page.waitForSelector(LEGACY ? "[data-pro-play-summary]" : '[data-testid="pro-play-summary"]', { timeout: 60000 });
          await settle(page, 600);
          await shoot("completed");
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, `${LEGACY ? "legacy-" : ""}probe.json`), JSON.stringify(results, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
