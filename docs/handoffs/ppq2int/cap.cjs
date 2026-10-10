// PPQ2-INT capture + geometry probe for the playable dev route.
// Run with cwd = the integration worktree (needs its node_modules/playwright).
//   node docs/handoffs/ppq2int/cap.cjs <outDir> <caseList> [viewportList]
// caseList: comma list of <setOrKey>:<state>[:<extra query>]
//   state: pre | correct | wrong | next   (next = reveal, then Next to question 2)
//   e.g. champion_player:pre,t1_lineage:wrong,default:next
// Env: PPQ_BASE (default http://localhost:5276), PPQ_CACHE (asset disk cache dir),
//      PPQ_SOURCE=live to drive the live API instead of fixtures (pre/correct/wrong only).
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const BASE = process.env.PPQ_BASE || "http://localhost:5276";
const CACHE = process.env.PPQ_CACHE || path.join(process.cwd(), "..", ".ppq2int-asset-cache");
const SOURCE = process.env.PPQ_SOURCE === "live" ? "live" : "fixture";
const [outDir, caseArg, vpArg] = process.argv.slice(2);
const viewports = (vpArg || "390x844,768x1024,1440x900").split(",").map((s) => { const [w, h] = s.split("x").map(Number); return { width: w, height: h }; });
const cases = caseArg.split(",").map((c) => { const [set, state = "pre", extra = ""] = c.split(":"); return { set, state, extra }; });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

// The fixture server's key: needed only to steer a capture to the right/wrong tablet.
const samplesSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/pro-play/__fixtures__/proPlaySamples.ts"), "utf8");
const SAMPLES = JSON.parse(samplesSrc.slice(samplesSrc.indexOf("PRO_PLAY_SAMPLES = {") + "PRO_PLAY_SAMPLES = ".length, samplesSrc.lastIndexOf("} as unknown") + 1));
const DEFAULT_FIRST = "champion_player";
const firstKey = (set) => (SAMPLES[set] ? set : set.split(",")[0] in SAMPLES ? set.split(",")[0] : DEFAULT_FIRST);
const correctIndex = (key) => SAMPLES[key].question.choices.indexOf(SAMPLES[key].result.correct_answer);

const PROBE = () => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const f = (n) => Math.round(n * 10) / 10; return { x: f(b.x), y: f(b.y + scrollY), w: f(b.width), h: f(b.height), bottom: f(b.bottom + scrollY) }; };
  const q = (s) => document.querySelector(s);
  const stage = q('[data-testid="ranked-question"]');
  const tablets = [...document.querySelectorAll('[data-surface-region="answers"] [data-quiz-choice]')];
  const out = {
    vw: innerWidth, vh: innerHeight, scrollY,
    phase: q("[data-pro-play-phase]")?.dataset.proPlayPhase ?? null,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    shell: r(q('[data-testid="quiz-ranked"]')), header: r(q('[data-testid="ranked-header"]')),
    headerTitle: q('[data-testid="ranked-header-title"]')?.textContent?.trim() ?? null,
    stage: r(stage), plate: r(q("[data-pro-play-plate]")),
    media: r(q('[data-surface-region="media"]')), prompt: r(q('[data-surface-region="prompt"]')), answers: r(q('[data-surface-region="answers"]')),
    tablets: tablets.map((t) => ({ ...r(t), state: t.dataset.choiceState })),
    hudControl: r(q('[data-testid="pro-play-next"], [data-testid="pro-play-try-again"], [data-pro-play-action-reserve]')),
    next: r(q('[data-testid="pro-play-next"]')),
    timeline: r(q('[data-testid="ranked-round-timeline"]')),
    yourPick: r(q('[data-testid="answer-your-pick"]')),
    dossierVisible: !!q('[data-testid="pro-play-question-dossier"]')?.offsetParent,
    sessionVisible: !!q('[data-testid="pro-play-session-panel"]')?.offsetParent,
    activeTestId: document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName,
    violations: [], notes: [],
  };
  const bad = (m) => out.violations.push(m);
  if (out.docW > innerWidth + 1) bad(`document x-overflow ${out.docW}/${innerWidth}`);
  if (stage && stage.scrollHeight > stage.clientHeight + 1) bad(`stage clip ${stage.scrollHeight - stage.clientHeight}px`);
  if (stage) for (const el of stage.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) bad("nested scroller: " + (el.className || el.tagName)); }
  for (const p of [q('[data-testid="pro-play-question-dossier"]'), q('[data-testid="pro-play-session-panel"]')]) if (p && p.offsetParent && p.scrollHeight > p.clientHeight + 1) bad(`panel content clipped: ${p.dataset.testid} ${p.scrollHeight - p.clientHeight}px`);
  // "Your pick" must not sit over any visible text in its tablet.
  const pick = q('[data-testid="answer-your-pick"]');
  if (pick) {
    const pb = pick.getBoundingClientRect();
    const tablet = pick.closest("[data-quiz-choice]");
    for (const el of tablet.querySelectorAll("span, p, div, svg")) {
      if (el === pick || pick.contains(el) || el.contains(pick)) continue;
      if (el.children.length && el.tagName !== "svg") continue;
      const cs = getComputedStyle(el); if (cs.visibility === "hidden" || !el.offsetParent && el.tagName !== "svg") continue;
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      const ix = Math.min(b.right, pb.right) - Math.max(b.left, pb.left); const iy = Math.min(b.bottom, pb.bottom) - Math.max(b.top, pb.top);
      if (ix > 0.5 && iy > 0.5) { bad(`your-pick overlaps ${el.tagName}"${(el.textContent || "").trim().slice(0, 10)}" ${Math.round(ix)}x${Math.round(iy)}`); break; }
    }
  }
  if (tablets.length) {
    const tb0 = tablets[0].closest("[data-quiz-answer-options]");
    for (const t of tablets) { const tb = t.getBoundingClientRect(); for (const c of t.querySelectorAll("*")) { const b = c.getBoundingClientRect(); if (!b.width || getComputedStyle(c).visibility === "hidden") continue; if (c.matches('[data-testid="answer-your-pick"]')) continue; let hidden = false; for (let a = c.parentElement; a && a !== t; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflow !== "visible") { const ab = a.getBoundingClientRect(); if (b.top >= ab.bottom - 0.5 || b.left >= ab.right - 0.5) hidden = true; } } if (hidden) continue; if (b.bottom > tb.bottom + 0.5 || b.right > tb.right + 0.5 || b.left < tb.left - 0.5) { bad("tablet content outside tablet " + t.dataset.quizChoice + ": " + c.tagName); break; } } }
    const last = tablets[tablets.length - 1].getBoundingClientRect();
    out.lastTabletBottom = Math.round(last.bottom + scrollY);
    if (last.bottom + scrollY > innerHeight + 0.5) out.notes.push(`last tablet below fold ${Math.round(last.bottom + scrollY)}/${innerHeight}`);
    const hs = new Set(tablets.map((t) => Math.round(t.getBoundingClientRect().height))); if (hs.size > 1) out.notes.push("tablet heights " + [...hs].join("/"));
    void tb0;
  }
  if (out.next && out.next.bottom - scrollY > innerHeight + 0.5) out.notes.push(`Next below fold ${Math.round(out.next.bottom)}/${innerHeight}`);
  const brokenImgs = [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src") && i.offsetParent).length;
  if (brokenImgs) out.notes.push("broken images " + brokenImgs);
  return out;
};

async function settle(page) {
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll("[data-pro-play-plate] img, [data-option-media] img, [data-option-content] img")].filter((i) => i.offsetParent !== null);
    return imgs.every((i) => i.complete);
  }, null, { timeout: 30000 }).catch(() => {});
  await page.mouse.move(1, 1);
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const results = [];
  try {
    for (const vp of viewports) {
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
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => { if (m.type() === "error" && !/supabase|Failed to load resource|ERR_FAILED/i.test(m.text())) errors.push("console: " + m.text().slice(0, 160)); });
      for (const c of cases) {
        const qs = new URLSearchParams(SOURCE === "live" ? { source: "live" } : { source: "fixture", set: c.set, latency: "60" });
        if (c.extra) for (const [k, v] of new URLSearchParams(c.extra)) qs.set(k, v);
        const url = `${BASE}/lol/dev/pro-play-arena?${qs}`;
        errors.length = 0;
        for (let a = 0; ; a++) { try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }); break; } catch (e) { if (a >= 2) throw e; } }
        await page.waitForSelector('[data-testid="ranked-question"]', { timeout: 90000 });
        await settle(page);
        const pre = await page.evaluate(PROBE);
        let probe = pre;
        if (c.state !== "pre") {
          const key = firstKey(c.set);
          const right = SOURCE === "live" ? 0 : correctIndex(key);
          const n = await page.$$eval("[data-quiz-choice]", (els) => els.length);
          const pickIdx = c.state === "wrong" ? (right + 1) % n : right;
          await page.click(`[data-quiz-choice="${pickIdx}"]`);
          await page.waitForSelector('[data-pro-play-phase="revealed"]', { timeout: 60000 });
          await settle(page);
          probe = await page.evaluate(PROBE);
          if (c.state === "next") {
            await page.click('[data-testid="pro-play-next"]');
            await page.waitForSelector('[data-pro-play-phase="question"]', { timeout: 60000 });
            await settle(page);
            probe = await page.evaluate(PROBE);
          }
          // Layout stability across the transition (same page, same viewport).
          const d = (a, b) => (a && b ? Math.round((b.y - a.y) * 10) / 10 + "/" + Math.round((b.h - a.h) * 10) / 10 : "n/a");
          probe.stability = { stage: d(pre.stage, probe.stage), answers: d(pre.answers, probe.answers), media: d(pre.media, probe.media), hud: d(pre.hudControl, probe.hudControl), timeline: d(pre.timeline, probe.timeline), shell: d(pre.shell, probe.shell) };
          for (const [k, v] of Object.entries(probe.stability)) if (v !== "n/a" && v !== "0/0" && vp.width >= 1024) probe.notes.push(`moved ${k} ${v}`);
        }
        const name = `${process.env.PPQ_TAG || ""}${c.set.replace(/,/g, "+")}-${c.state}${c.extra ? "-" + c.extra.replace(/[=&]/g, "_") : ""}-${vp.width}x${vp.height}`;
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(outDir, name + ".png"), fullPage: vp.width < 1024 });
        results.push({ name, ...c, source: SOURCE, viewport: vp, errors: [...errors], pre: c.state === "pre" ? undefined : { stage: pre.stage, answers: pre.answers }, ...probe });
        const flags = [...probe.violations, ...probe.notes, ...errors].join("; ");
        console.log(`${name}: ${probe.violations.length || errors.length ? "FAIL" : "ok"} ${flags}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, "probe.json"), JSON.stringify(results, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
