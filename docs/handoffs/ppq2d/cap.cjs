// PPQ2-D reveal capture + geometry probe. Run with cwd = the capture worktree
// (branch + PPQ2-C's proposed regions seam patch).
//   node cap.cjs <outDir> <caseList> [viewportList]
// caseList: comma list of fixture:grade[:evidence[:names[:ids]]]
//   grade real|correct|wrong · evidence full|partial|absent · names real|long · ids rich|plain
// Env: PPQ_BASE (default http://localhost:5264), PPQ_CACHE (asset cache dir),
//      PPQ_RM=1 (reduced motion), PPQ_SOURCE=1 (keyboard-open the Source disclosure),
//      PPQ_EARLY=<ms> (screenshot that long after load instead of after settling).
// For each case it ALSO loads PPQ2-C's pre-answer preview of the same fixture,
// so "tablet growth" is measured against the real pre-answer tablets.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const BASE = process.env.PPQ_BASE || "http://localhost:5264";
const REVEAL = "/src/components/pro-play/arena/reveal/__preview__/index.html";
const PRE = "/src/components/pro-play/arena/__preview__/index.html";
const CACHE = process.env.PPQ_CACHE || path.join(__dirname, "asset-cache");
const [outDir, caseArg, vpArg] = process.argv.slice(2);
const viewports = (vpArg || "390x844,1024x768,1440x900").split(",").map((s) => { const [w, h] = s.split("x").map(Number); return { width: w, height: h }; });
const cases = caseArg.split(",").map((c) => {
  const [fixture, grade = "real", evidence = "full", names = "real", ids = "rich"] = c.split(":");
  return { fixture, grade, evidence, names, ids };
});
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const PRE_PROBE = () => {
  const stage = document.querySelector('[data-testid="ranked-question"]');
  const tablets = [...document.querySelectorAll('[data-surface-region="answers"] [data-quiz-choice]')];
  return {
    stageH: stage ? Math.round(stage.getBoundingClientRect().height * 10) / 10 : null,
    tabletH: tablets.map((t) => Math.round(t.getBoundingClientRect().height * 10) / 10),
  };
};

const PROBE = () => {
  const f = (n) => Math.round(n * 10) / 10;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: f(b.x), y: f(b.y), w: f(b.width), h: f(b.height), bottom: f(b.bottom) }; };
  const q = (s) => document.querySelector(s);
  const stage = q('[data-testid="ranked-question"]');
  const tablets = [...document.querySelectorAll('[data-surface-region="answers"] [data-quiz-choice]')];
  const footer = q("[data-pp-reveal-footer]");
  const out = {
    vw: innerWidth, vh: innerHeight,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    stageH: stage ? f(stage.getBoundingClientRect().height) : null,
    tablets: tablets.map((t) => ({ ...r(t), state: t.dataset.choiceState, pick: t.dataset.yourPick === "true" })),
    values: tablets.map((t) => {
      const d = t.querySelector("[data-pp-reveal-display]");
      const s = t.querySelector("[data-pp-reveal-support]");
      return d ? {
        display: d.textContent, support: s ? s.textContent : null,
        supportTruncated: s ? s.scrollWidth > s.clientWidth + 1 : false,
        opacity: getComputedStyle(d.closest("[data-pp-reveal-value]")).opacity,
      } : null;
    }),
    footer: r(footer), footerState: footer ? footer.dataset.ppEvidenceState : null,
    readout: footer ? (footer.querySelector("[data-pp-reveal-readout]") || {}).dataset?.ppRevealReadout || null : null,
    violations: [], notes: [],
  };
  const bad = (m) => out.violations.push(m);
  if (out.docW > innerWidth + 1) bad(`document x-overflow ${out.docW}/${innerWidth}`);
  if (stage && stage.scrollHeight > stage.clientHeight + 1) bad(`stage clip ${stage.scrollHeight - stage.clientHeight}px`);
  if (stage) for (const el of stage.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) bad("nested scroller: " + (el.className || el.tagName)); }
  if (footer) for (const el of footer.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) bad("nested scroller in footer"); }
  if (footer && footer.scrollWidth > footer.clientWidth + 1) bad(`footer x-overflow ${footer.scrollWidth}/${footer.clientWidth}`);
  // Everything visible inside a tablet stays inside it, and nothing visible is half-clipped.
  const clippedAway = (c, stop) => { const b = c.getBoundingClientRect(); for (let a = c.parentElement; a && a !== stop; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") { const ab = a.getBoundingClientRect(); if (b.top >= ab.bottom - 0.5 || b.left >= ab.right - 0.5 || b.right <= ab.left + 0.5 || b.bottom <= ab.top + 0.5) return "hidden"; if (b.right > ab.right + 0.5 || b.bottom > ab.bottom + 0.5) return "partial"; } } return null; };
  for (const t of tablets) {
    const tb = t.getBoundingClientRect();
    for (const c of t.querySelectorAll("*")) {
      const b = c.getBoundingClientRect();
      if (!b.width || getComputedStyle(c).visibility === "hidden") continue;
      const clip = clippedAway(c, t);
      if (clip === "hidden") continue;
      if (clip === "partial" && c.children.length === 0 && c.tagName !== "IMG" && !c.matches("[data-pp-reveal-support]")) { bad("partly clipped in tablet " + t.dataset.quizChoice + ": " + c.textContent.trim().slice(0, 12)); break; }
      if (b.bottom > tb.bottom + 0.5 || b.right > tb.right + 0.5 || b.left < tb.left - 0.5) { bad("tablet content outside tablet " + t.dataset.quizChoice + ": " + c.tagName); break; }
    }
    // "Your pick" sits at the tablet's bottom-right: it must not cover the value.
    const pick = t.querySelector('[data-testid="answer-your-pick"]');
    if (pick) {
      const pb = pick.getBoundingClientRect();
      for (const v of t.querySelectorAll("[data-pp-reveal-display], [data-pp-reveal-support]")) {
        const vb = v.getBoundingClientRect();
        // The painted text: the text's extent clipped to the element's own box
        // (a truncated line's Range runs past its ellipsis).
        const range = document.createRange(); range.selectNodeContents(v); const rr = range.getBoundingClientRect();
        const tbx = { left: Math.max(rr.left, vb.left), right: Math.min(rr.right, vb.right), top: Math.max(rr.top, vb.top), bottom: Math.min(rr.bottom, vb.bottom) };
        if (getComputedStyle(v).visibility !== "hidden" && tbx.right > tbx.left && !(tbx.right <= pb.left || tbx.left >= pb.right || tbx.bottom <= pb.top || tbx.top >= pb.bottom)) {
          out.notes.push(`"Your pick" overlaps ${v.matches("[data-pp-reveal-display]") ? "value" : "support"} text in tablet ${t.dataset.quizChoice}`);
        }
      }
    }
  }
  if (tablets.length) {
    const hs = new Set(tablets.map((t) => Math.round(t.getBoundingClientRect().height)));
    if (hs.size > 1) out.notes.push("tablet heights " + [...hs].join("/"));
    out.lastTabletBottom = Math.round(tablets[tablets.length - 1].getBoundingClientRect().bottom);
  }
  if (footer) { out.footerBottom = Math.round(footer.getBoundingClientRect().bottom); if (out.footerBottom > innerHeight + 0.5) out.notes.push(`footer below fold ${out.footerBottom}/${innerHeight}`); }
  const truncSupport = out.values.filter((v) => v && v.supportTruncated).length;
  if (truncSupport) out.notes.push(`support truncated on ${truncSupport} tablet(s)`);
  const brokenImgs = [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src") && i.offsetParent !== null).length;
  if (brokenImgs) out.notes.push("broken images " + brokenImgs);
  return out;
};

async function load(page, url) {
  for (let a = 0; ; a++) { try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }); break; } catch (e) { if (a >= 2) throw e; } }
  await page.waitForSelector('[data-testid="ranked-question"]', { timeout: 90000 });
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll("[data-pro-play-plate] img, [data-option-media] img")].filter((i) => i.offsetParent !== null);
    return imgs.every((i) => i.complete);
  }, null, { timeout: 30000 }).catch(() => {});
  await page.mouse.move(1, 1);
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const results = [];
  try {
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
        errors.length = 0;
        // Pre-answer baseline (PPQ2-C preview, same fixture and labels).
        await load(page, `${BASE}${PRE}?${new URLSearchParams({ fixture: c.fixture, state: "pre", names: c.names })}`);
        const pre = await page.evaluate(PRE_PROBE);
        const qs = new URLSearchParams({ fixture: c.fixture, grade: c.grade, evidence: c.evidence, names: c.names, ids: c.ids });
        await load(page, `${BASE}${REVEAL}?${qs}`);
        if (process.env.PPQ_EARLY) {
          await page.waitForTimeout(Number(process.env.PPQ_EARLY));
        } else {
          await page.waitForTimeout(1000);
        }
        if (process.env.PPQ_SOURCE === "1") {
          for (let i = 0; i < 60; i++) {
            await page.keyboard.press("Tab");
            if (await page.evaluate(() => !!document.activeElement?.matches("[data-pp-reveal-source]"))) break;
          }
          await page.keyboard.press("Enter");
          await page.waitForTimeout(500);
        }
        const probe = await page.evaluate(PROBE);
        probe.preStageH = pre.stageH;
        probe.preTabletH = pre.tabletH;
        probe.tabletGrowth = probe.tablets.map((t, i) => (pre.tabletH[i] != null ? Math.round((t.h - pre.tabletH[i]) * 10) / 10 : null));
        probe.stageGrowth = pre.stageH != null && probe.stageH != null ? Math.round((probe.stageH - pre.stageH) * 10) / 10 : null;
        if (process.env.PPQ_SOURCE === "1") {
          probe.sourceOpen = await page.evaluate(() => {
            const p = document.querySelector("[data-pp-reveal-source-panel]");
            const t = document.querySelector("[data-pp-reveal-source]");
            return { open: !!p, expanded: t?.getAttribute("aria-expanded"), text: p?.textContent?.slice(0, 200) ?? null };
          });
        }
        const tag = process.env.PPQ_TAG || "";
        const name = `${tag}${c.fixture}-${c.grade}${c.evidence !== "full" ? "-ev" + c.evidence : ""}${c.names === "long" ? "-longnames" : ""}${c.ids === "plain" ? "-plain" : ""}-${vp.width}x${vp.height}`;
        await page.screenshot({ path: path.join(outDir, name + ".jpg"), type: "jpeg", quality: 82, fullPage: vp.width < 1024 });
        results.push({ name, ...c, viewport: vp, errors: [...errors], ...probe });
        const growth = probe.tabletGrowth.filter((g) => g != null);
        const flags = [...probe.violations, ...probe.notes].join("; ");
        console.log(`${name}: ${probe.violations.length || errors.length ? "FAIL" : "ok"} growth=${growth.length ? Math.max(...growth) : "-"} stageΔ=${probe.stageGrowth} footer=${probe.footer ? probe.footer.h : "-"} ${errors.length ? "errors=" + errors.length : ""} ${flags}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const file = path.join(outDir, `probe${process.env.PPQ_TAG ? "-" + process.env.PPQ_TAG.replace(/-$/, "") : ""}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
