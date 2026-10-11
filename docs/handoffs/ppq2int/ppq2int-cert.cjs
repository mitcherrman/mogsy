// PPQ2-INT re-run of the PPQ2-A certification harness (docs/handoffs/ppq2a/
// ppq2a-cert.cjs), unchanged except: configurable origins, the PPQ2-A probe
// page added to the existing-caller diff (it is a caller of the shared seam
// too), and an asset disk cache for the flaky Railway/font hosts (the same
// bytes are served to base and branch). Run with cwd = the integration worktree.
//   node ppq2int-cert.cjs <outDir> [diff|control]
// diff : existing callers (Ranked / Daily-hosted / Journey) on BASE (5241) vs
//        BRANCH (5242), pixel by pixel, clock frozen, animations frozen.
// probe: the new neutral question surface on BRANCH at the five viewports,
//        with geometry probes and screenshots.
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = req("playwright");

const OUT = process.argv[2];
const MODE = process.argv[3] || "all";
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.CERT_BASE || "http://localhost:5277";
const BRANCH = process.env.CERT_BRANCH || "http://localhost:5276";
const crypto = require("crypto");
const CACHE = process.env.PPQ_CACHE || path.join(process.cwd(), "..", ".ppq2int-asset-cache");
fs.mkdirSync(CACHE, { recursive: true });
async function cacheAssets(ctx) {
  await ctx.route(/railway\.app\/(?!api\/)|fonts\.gstatic\.com\/|fonts\.googleapis\.com\//, async (route) => {
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
}
const SIZES = [[375, 812], [390, 844], [1024, 768], [1280, 800], [1440, 900]];
const FIXED = new Date("2026-10-07T20:00:00.000Z");
const FREEZE = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";

const EXISTING = [
  ["ranked-short", "/dev/ranked-shell-probe?q=short&frame=0"],
  ["ranked-opts4", "/dev/ranked-shell-probe?q=opts4&frame=0"],
  ["ranked-media", "/dev/ranked-shell-probe?q=media&frame=0"],
  ["ranked-family", "/dev/ranked-shell-probe?q=family&frame=0"],
  ["ranked-points", "/dev/ranked-shell-probe?q=opts4&points=6:11-8&frame=0"],
  ["ranked-metareflex", "/dev/ranked-shell-probe?q=metareflex&frame=0"],
  ["ranked-orderforge", "/dev/ranked-shell-probe?q=orderforge&frame=0"],
  ["ranked-mastery", "/dev/ranked-shell-probe?q=masteryRecall&frame=0"],
  ["ranked-end", "/dev/ranked-shell-probe?end=victory&frame=0"],
  ["daily-hosted", "/dev/ranked-shell-probe?q=opts4&host=daily&ruleset=standard&frame=0"],
  ["journey-ranked", "/dev/journey-arena?capture=zed&step=6"],
  ["journey-daily", "/dev/journey-arena?capture=zed&step=6&host=daily"],
  // PPQ2-A's neutral question member with NO regions: the seam must be inert.
  ["question-probe-pre", "/dev/arena-question-probe?state=pre&opts=4"],
  ["question-probe-pair", "/dev/arena-question-probe?state=pre&opts=2"],
  ["question-probe-wrong", "/dev/arena-question-probe?state=revealed-wrong&opts=4&prompt=long&labels=long"],
];

const PROBES = [
  ["q-pre-4", "state=pre&opts=4"],
  ["q-pre-2", "state=pre&opts=2"],
  ["q-pre-3-long", "state=pre&opts=3&prompt=long&labels=long"],
  ["q-pre-4-long", "state=pre&opts=4&prompt=long&labels=long"],
  ["q-selected-4", "state=selected&opts=4"],
  ["q-revealed-correct-4", "state=revealed-correct&opts=4"],
  ["q-revealed-wrong-4-long", "state=revealed-wrong&opts=4&prompt=long&labels=long"],
  ["q-pre-4-empty-rails", "state=pre&opts=4&rails=empty"],
];

async function settle(page) {
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((i) => (i.complete ? null
      : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }))));
  });
  await page.waitForTimeout(700);
}

async function open(browser, url, w, h, readySel) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce",
    hasTouch: w < 768, isMobile: false });
  await cacheAssets(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(FIXED);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector(readySel, { timeout: 120000 });
  await page.addStyleTag({ content: FREEZE });
  await settle(page);
  return { ctx, page, errors };
}

async function compare(browser, a, b) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } });
  const page = await ctx.newPage();
  const r = await page.evaluate(async ([x, y]) => {
    const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = "data:image/png;base64," + src; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    const px = (im) => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: [ia.width, ia.height, ib.width, ib.height] };
    const da = px(ia), db = px(ib); let any = 0, over = 0; let box = null;
    for (let p = 0; p < da.length; p += 4) {
      const d = Math.max(Math.abs(da[p] - db[p]), Math.abs(da[p + 1] - db[p + 1]), Math.abs(da[p + 2] - db[p + 2]));
      if (d > 0) any++;
      if (d > 24) { over++; const q = p / 4; const xx = q % ia.width, yy = (q / ia.width) | 0;
        box = box ? [Math.min(box[0], xx), Math.min(box[1], yy), Math.max(box[2], xx), Math.max(box[3], yy)] : [xx, yy, xx, yy]; }
    }
    return { pixels: ia.width * ia.height, differing: any, over24: over, box };
  }, [a.toString("base64"), b.toString("base64")]);
  await ctx.close();
  return r;
}

const DOM_SIG = () => {
  // A structural signature of the arena, so an identical render is proven by
  // more than pixels: every element's tag, testid and class list, in order.
  const root = document.querySelector('[data-testid="ranked-match"], [data-testid="ranked-match-over"]');
  if (!root) return null;
  const parts = [];
  for (const el of root.querySelectorAll("*")) {
    parts.push(`${el.tagName}|${el.getAttribute("data-testid") ?? ""}|${el.getAttribute("class") ?? ""}`);
  }
  return { count: parts.length, sig: parts.join("\n") };
};

async function runDiff(browser) {
  const rows = [];
  const only = (process.env.ONLY || "").split(",").filter(Boolean);
  for (const [name, route] of EXISTING.filter(([n]) => !only.length || only.includes(n))) {
    for (const [w, h] of SIZES) {
      const shots = {};
      const sigs = {};
      for (const [label, origin] of [["base", BASE], ["branch", MODE === "control" ? BASE : BRANCH]]) {
        let attempt = 0;
        for (;;) {
          let handle;
          try {
            handle = await open(browser, origin + route, w, h,
              '[data-testid="ranked-match"], [data-testid="ranked-match-over"]');
            shots[label] = await handle.page.screenshot({ fullPage: true });
            sigs[label] = await handle.page.evaluate(DOM_SIG);
            await handle.ctx.close();
            break;
          } catch (e) {
            if (handle) await handle.ctx.close().catch(() => {});
            if (++attempt >= 3) { shots[label] = null; console.log("FAIL", name, label, w, String(e).slice(0, 160)); break; }
          }
        }
      }
      const pixel = shots.base && shots.branch ? await compare(browser, shots.base, shots.branch) : null;
      const domSame = sigs.base && sigs.branch ? sigs.base.sig === sigs.branch.sig : null;
      if (pixel && (pixel.over24 > 0 || pixel.size)) {
        fs.writeFileSync(path.join(OUT, `diff-${name}-${w}x${h}-base.png`), shots.base);
        fs.writeFileSync(path.join(OUT, `diff-${name}-${w}x${h}-branch.png`), shots.branch);
      }
      const row = { name, size: `${w}x${h}`, pixel, domSame, domCount: sigs.branch?.count ?? null };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
  fs.writeFileSync(path.join(OUT, MODE === "control" ? "control.json" : "diff.json"), JSON.stringify(rows, null, 1));
}

const GEOMETRY = () => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const f = (n) => Math.round(n * 10) / 10; return { x: f(b.x), y: f(b.y), w: f(b.width), h: f(b.height), bottom: f(b.bottom) }; };
  const q = (s) => document.querySelector(s);
  const stage = q('[data-testid="ranked-question"]');
  const tablets = [...document.querySelectorAll("[data-quiz-choice]")];
  const violations = [];
  // Nested scrollers anywhere inside the arena.
  const scrollers = [...(q('[data-testid="ranked-match"]')?.querySelectorAll("*") ?? [])].filter((el) => {
    const cs = getComputedStyle(el);
    return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
  }).map((el) => el.getAttribute("data-testid") || el.className.toString().slice(0, 60));
  if (scrollers.length) violations.push(`nested scroller: ${scrollers.join(", ")}`);
  // The stage clips (overflow hidden): its content must fit.
  if (stage && stage.scrollHeight > stage.clientHeight + 1) violations.push(`stage clip ${stage.scrollHeight} > ${stage.clientHeight}`);
  if (document.documentElement.scrollWidth > innerWidth + 1) violations.push("document x-overflow");
  for (const t of tablets) {
    const label = t.querySelector("span:last-child") || t;
    if (t.scrollWidth > t.clientWidth + 1) violations.push(`tablet x-clip: ${t.textContent.slice(0, 30)}`);
  }
  const flanks = ["probe-panel-left", "probe-panel-right"].map((id) => {
    const el = q(`[data-testid="${id}"]`);
    return el ? { id, visible: el.getClientRects().length > 0 } : { id, visible: false };
  });
  const shell = q('[data-testid="ranked-match"]');
  return {
    vw: innerWidth, vh: innerHeight,
    docH: document.documentElement.scrollHeight,
    stage: r(stage),
    stageMinHeight: stage ? getComputedStyle(stage).minHeight : null,
    stageClass: stage?.className.split(/\s+/).filter((c) => /ranked-(panel|folio|question-stage)/.test(c)) ?? [],
    regions: ["media", "prompt", "answers"].map((k) => r(stage?.querySelector(`[data-surface-region="${k}"]`))),
    lastTablet: r(tablets[tablets.length - 1]),
    lastTabletInViewport: tablets.length ? tablets[tablets.length - 1].getBoundingClientRect().bottom <= innerHeight : null,
    tabletCount: tablets.length,
    choiceStates: tablets.map((t) => t.dataset.choiceState),
    phoneArena: shell?.dataset.phoneArena ?? null,
    mobileBar: !!q('[data-testid="mobile-clock"]') || !!q('[data-testid^="mobile-combatant-"]'),
    bottomBar: !!q('[data-testid="ranked-mobile-bottombar"]'),
    combatant: !!q('[data-testid="class-portrait"]') || !!q('[data-testid^="hp-"]'),
    timer: !!q('[data-testid="timer-display"]'),
    headerVisible: (q('[data-testid="ranked-header"]')?.getClientRects().length ?? 0) > 0,
    timeline: r(q('[data-testid="ranked-round-timeline"]')),
    flanks,
    violations,
  };
};

async function runProbe(browser) {
  const rows = [];
  for (const [name, qs] of PROBES) {
    for (const [w, h] of SIZES) {
      let handle;
      try {
        handle = await open(browser, `${BRANCH}/dev/arena-question-probe?${qs}`, w, h, '[data-testid="ranked-question"]');
        const g = await handle.page.evaluate(GEOMETRY);
        g.pageErrors = handle.errors;
        await handle.page.screenshot({ path: path.join(OUT, `${name}-${w}x${h}.png`), fullPage: true });
        rows.push({ name, size: `${w}x${h}`, ...g });
        console.log(name, `${w}x${h}`, "stage", JSON.stringify(g.stage), "minH", g.stageMinHeight,
          "lastInVP", g.lastTabletInViewport, "phoneArena", g.phoneArena, "mobileBar", g.mobileBar,
          "flanks", g.flanks.map((f) => f.visible).join("/"), "viol", g.violations.length, "errs", g.pageErrors.length);
      } catch (e) {
        console.log("FAIL", name, w, h, String(e).slice(0, 200));
      } finally {
        if (handle) await handle.ctx.close().catch(() => {});
      }
    }
  }
  // Footprint reference: the Ranked stage on the BRANCH at the same viewports.
  for (const [w, h] of SIZES) {
    let handle;
    try {
      handle = await open(browser, `${BRANCH}/dev/ranked-shell-probe?q=opts4&frame=0`, w, h, '[data-testid="ranked-question"]');
      const g = await handle.page.evaluate(GEOMETRY);
      rows.push({ name: "reference-ranked-opts4", size: `${w}x${h}`, ...g });
      console.log("reference-ranked-opts4", `${w}x${h}`, "stage", JSON.stringify(g.stage), "minH", g.stageMinHeight);
    } catch (e) {
      console.log("FAIL reference", w, String(e).slice(0, 160));
    } finally {
      if (handle) await handle.ctx.close().catch(() => {});
    }
  }
  fs.writeFileSync(path.join(OUT, "probe.json"), JSON.stringify(rows, null, 1));
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    if (MODE === "probe" || MODE === "all") await runProbe(browser);
    if (MODE === "diff" || MODE === "all" || MODE === "control") await runDiff(browser);
  } finally {
    await browser.close();
  }
})();
