// PPQ2-C capture + geometry probe. Run with cwd = the capture worktree.
//   node cap.cjs <outDir> <caseList> [viewportList]
// caseList: comma list of fixture:state[:names[:prompt]]   viewportList: 390x844,1024x768,...
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const BASE = process.env.PPQ_BASE || "http://localhost:5263";
const PAGE = "/src/components/pro-play/arena/__preview__/index.html";
const CACHE = process.env.PPQ_CACHE || path.join(__dirname, "asset-cache");
const [outDir, caseArg, vpArg] = process.argv.slice(2);
const viewports = (vpArg || "390x844,1024x768,1440x900").split(",").map((s) => { const [w, h] = s.split("x").map(Number); return { width: w, height: h }; });
const cases = caseArg.split(",").map((c) => { const [fixture, state = "pre", names = "real", prompt = "real"] = c.split(":"); return { fixture, state, names, prompt }; });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const PROBE = () => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const f = (n) => Math.round(n * 10) / 10; return { x: f(b.x), y: f(b.y), w: f(b.width), h: f(b.height), bottom: f(b.bottom) }; };
  const q = (s) => document.querySelector(s);
  const stage = q('[data-testid="ranked-question"]');
  const tablets = [...document.querySelectorAll('[data-surface-region="answers"] [data-quiz-choice]')];
  const out = {
    vw: innerWidth, vh: innerHeight,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    stage: r(stage), plate: r(q("[data-pro-play-plate]")),
    media: r(q('[data-surface-region="media"]')), prompt: r(q('[data-surface-region="prompt"]')), answers: r(q('[data-surface-region="answers"]')),
    tablets: tablets.map((t) => ({ ...r(t), state: t.dataset.choiceState })),
    dossier: r(q('[data-testid="pro-play-question-dossier"]')), session: r(q('[data-testid="pro-play-session-panel"]')),
    violations: [], notes: [],
  };
  const bad = (m) => out.violations.push(m);
  if (out.docW > innerWidth + 1) bad(`document x-overflow ${out.docW}/${innerWidth}`);
  if (stage && stage.scrollHeight > stage.clientHeight + 1) bad(`stage clip ${stage.scrollHeight - stage.clientHeight}px`);
  // nested scrollers inside the stage
  if (stage) for (const el of stage.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) bad("nested scroller: " + (el.className || el.tagName)); }
  // panel clipping
  for (const p of [q('[data-testid="pro-play-question-dossier"]'), q('[data-testid="pro-play-session-panel"]')]) if (p && p.offsetParent && p.scrollHeight > p.clientHeight + 1) bad(`panel content clipped: ${p.dataset.testid} ${p.scrollHeight - p.clientHeight}px`);
  // plate content must sit inside the plate
  const plate = q("[data-pro-play-plate]");
  if (plate) { const pb = plate.getBoundingClientRect(); for (const el of plate.querySelectorAll("h3, [data-pro-play-scope-line], [data-pro-play-window-facts], [data-pro-play-role-crest], [data-pro-play-shield]")) { const b = el.getBoundingClientRect(); if (b.width && el.offsetParent && (b.top < pb.top - 0.5 || b.bottom > pb.bottom + 0.5 || b.right > pb.right + 0.5)) bad("plate content outside plate: " + (el.tagName + "." + (el.dataset ? Object.keys(el.dataset).join("|") : ""))); } }
  // tablet symmetry: same height per row, nothing overflowing a tablet
  if (tablets.length) {
    const hs = new Set(tablets.map((t) => Math.round(t.getBoundingClientRect().height)));
    if (hs.size > 1) out.notes.push("tablet heights " + [...hs].join("/"));
    // An element wholly outside a clipping ancestor is intentionally hidden
    // (the one-line code rows); one PARTLY outside is a visible clip.
    const clippedAway = (c, stop) => { const b = c.getBoundingClientRect(); for (let a = c.parentElement; a && a !== stop; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") { const ab = a.getBoundingClientRect(); if (b.top >= ab.bottom - 0.5 || b.left >= ab.right - 0.5 || b.right <= ab.left + 0.5 || b.bottom <= ab.top + 0.5) return "hidden"; if (b.right > ab.right + 0.5 || b.bottom > ab.bottom + 0.5) return "partial"; } } return null; };
    for (const t of tablets) { const tb = t.getBoundingClientRect(); for (const c of t.querySelectorAll("*")) { const b = c.getBoundingClientRect(); if (!b.width || getComputedStyle(c).visibility === "hidden") continue; const clip = clippedAway(c, t); if (clip === "hidden") continue; if (clip === "partial" && c.children.length === 0 && c.tagName !== "IMG") { bad("partly clipped in tablet " + t.dataset.quizChoice + ": " + c.textContent.trim().slice(0, 12)); break; } if (b.bottom > tb.bottom + 0.5 || b.right > tb.right + 0.5 || b.left < tb.left - 0.5) { bad("tablet content outside tablet " + t.dataset.quizChoice + ": " + c.tagName); break; } } }
    const last = tablets[tablets.length - 1].getBoundingClientRect();
    out.lastTabletBottom = Math.round(last.bottom);
    if (last.bottom > innerHeight + 0.5) out.notes.push(`last tablet below fold ${Math.round(last.bottom)}/${innerHeight}`);
    out.truncatedNames = tablets.filter((t) => { const n = t.querySelector("[data-pp-tablet-name]"); return n && (n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1); }).length;
  }
  const answersEl = q('[data-surface-region="answers"]');
  if (answersEl) { const reserve = parseFloat(getComputedStyle(answersEl).minHeight) || 0; out.answersReserve = reserve; const used = answersEl.firstElementChild ? answersEl.firstElementChild.getBoundingClientRect().height : 0; out.answersUsed = Math.round(used); if (reserve && used > reserve + 0.5) out.notes.push(`answers over reserve ${Math.round(used)}>${reserve}`); }
  const brokenImgs = [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).map((i) => i.getAttribute("src"));
  if (brokenImgs.length) out.notes.push("broken images " + brokenImgs.length);
  out.imgs = [...document.querySelectorAll("[data-pro-play-plate] img, [data-option-media] img")].map((i) => ({ ok: i.complete && i.naturalWidth > 0, testid: i.dataset.testid || "icon" }));
  return out;
};

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const results = [];
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: process.env.PPQ_RM === "1" ? "reduce" : "no-preference" });
    await context.route(/supabase\.co\//, (route) => route.abort());
    await context.route(/railway\.app\/|fonts\.gstatic\.com\/|fonts\.googleapis\.com\//, async (route) => {
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
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    for (const c of cases) {
      const qs = new URLSearchParams({ fixture: c.fixture, state: c.state, names: c.names, prompt: c.prompt, ...(process.env.PPQ_EXTRA ? Object.fromEntries(new URLSearchParams(process.env.PPQ_EXTRA)) : {}) });
      const url = `${BASE}${PAGE}?${qs}`;
      errors.length = 0;
      for (let a = 0; ; a++) { try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }); break; } catch (e) { if (a >= 2) throw e; } }
      await page.waitForSelector('[data-testid="ranked-question"]', { timeout: 90000 });
      await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 30000 }).catch(() => {});
      // champion art arrives after the manifest query: wait for it where it applies
      await page.waitForFunction(() => {
        const plate = document.querySelector("[data-pro-play-plate]");
        if (!plate) return true;
        const needs = plate.dataset.proPlayPlate === "champion" || document.querySelector("[data-option-media]");
        if (!needs) return true;
        // Only images that are actually rendered: a lineup hidden below lg
        // keeps its lazy images unloaded, by design.
        const imgs = [...document.querySelectorAll("[data-pro-play-plate] img, [data-option-media] img")].filter((i) => i.offsetParent !== null);
        return imgs.length > 0 && imgs.every((i) => i.complete);
      }, null, { timeout: 30000 }).catch(() => {});
      await page.mouse.move(1, 1);
      if (process.env.PPQ_FOCUS === "1") {
        // Keyboard reach: Tab until an answer tablet holds focus.
        for (let i = 0; i < 40; i++) {
          await page.keyboard.press("Tab");
          if (await page.evaluate(() => !!document.activeElement?.matches("[data-quiz-choice]"))) break;
        }
        await page.keyboard.press("Tab");
      }
      if (process.env.PPQ_HOVER === "1") {
        const t = await page.$("[data-quiz-choice]");
        if (t) await t.hover();
      }
      await page.waitForTimeout(900);
      const probe = await page.evaluate(PROBE);
      const name = `${process.env.PPQ_TAG || ""}${c.fixture}-${c.state}${c.names === "long" ? "-longnames" : ""}${c.prompt === "long" ? "-longstem" : ""}-${vp.width}x${vp.height}`;
      await page.screenshot({ path: path.join(outDir, name + ".png"), fullPage: vp.width < 1024 });
      results.push({ name, ...c, viewport: vp, errors: [...errors], ...probe });
      const flags = [...probe.violations, ...probe.notes].join("; ");
      console.log(`${name}: ${probe.violations.length ? "FAIL" : "ok"} ${flags}`);
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "probe.json"), JSON.stringify(results, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
