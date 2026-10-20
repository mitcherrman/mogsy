// MISC W3B capture harness: the Play selector (match-entry scroll) geometry.
//
//   node cap.cjs <outDir> <label> <baseUrl> [surface=fixture|live] [view=menu|ranked|invite]
//
// cwd = a frontend worktree (Playwright is resolved from its node_modules).
// For every viewport it opens the record, waits for the unfurl to settle, then
// measures where the sheet, the body scroller and every control sit, whether
// each control is reachable (fully inside the viewport AND inside the visible
// part of the body scroller), horizontal overflow, scroll lock, target sizes,
// and console / page errors. Writes <label>-<surface>-<view>.json plus one PNG
// per viewport. `JSON.stringify` output is the evidence the handoff quotes.
const path = require("path");
const fs = require("fs");
const { createRequire } = require("module");
const req = createRequire(path.join(process.cwd(), "package.json"));
const pw = req("playwright");
const ENGINE = process.env.ENGINE || "chromium"; // chromium (Edge channel) | firefox
const engine = pw[ENGINE];

const [, , OUT, LABEL, BASE = "http://localhost:5366", SURFACE = "fixture", VIEW = "menu"] = process.argv;
const VIEWPORTS = [
  { id: "320x568", width: 320, height: 568, mobile: true },
  { id: "360x640", width: 360, height: 640, mobile: true },
  { id: "375x667", width: 375, height: 667, mobile: true },
  { id: "390x844", width: 390, height: 844, mobile: true },
  { id: "568x320-landscape", width: 568, height: 320, mobile: true },
  { id: "667x375-landscape", width: 667, height: 375, mobile: true },
  { id: "844x390-landscape", width: 844, height: 390, mobile: true },
  { id: "1440x900", width: 1440, height: 900, mobile: false },
];
const ONLY = process.env.VP ? process.env.VP.split(",") : null;
fs.mkdirSync(OUT, { recursive: true });

// What the page measures about itself. Runs in the page.
function measure() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), b: +r.bottom.toFixed(1), r: +r.right.toFixed(1) };
  };
  const sheet = document.querySelector('[data-testid="play-scroll"]');
  const body = document.querySelector(".play-scroll__body");
  const sizer = document.querySelector(".play-scroll-sizer");
  const frame = document.querySelector(".play-scroll-frame");
  const bodyR = body ? body.getBoundingClientRect() : null;
  const controls = {};
  const add = (name, el) => {
    if (!el) { controls[name] = null; return; }
    const r = el.getBoundingClientRect();
    const inViewport = r.top >= 0 && r.left >= 0 && r.bottom <= vh + 0.5 && r.right <= vw + 0.5;
    // Reachable = inside the viewport, and either outside the body scroller
    // (header controls) or inside its visible box.
    const inBody = body && body.contains(el);
    const inBodyBox = !inBody || (bodyR && r.top >= bodyR.top - 0.5 && r.bottom <= bodyR.bottom + 0.5);
    controls[name] = {
      w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1),
      inViewport, inScroller: !!inBody, visibleWithoutScrolling: inViewport && inBodyBox,
    };
  };
  add("close", document.querySelector('[data-testid="play-scroll-close"]'));
  add("rolePrev", document.querySelector('[data-testid="play-scroll-role-prev"]'));
  add("roleNext", document.querySelector('[data-testid="play-scroll-role-next"]'));
  add("mascot", document.querySelector('[data-testid="play-scroll-mascot"]'));
  for (const id of ["ranked", "daily", "invite"]) {
    add(`mode-${id}`, document.querySelector(`[data-testid="play-mode-${id}"], [data-testid="play-mode-${id}-complete"]`));
  }
  add("practice", document.querySelector('[data-testid="play-scroll-practice"]'));
  add("back", document.querySelector('[data-testid="play-scroll"] .play-scroll-back'));
  add("cancel", document.querySelector('[data-testid="play-scroll"] .play-scroll-control'));
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null);
  return {
    viewport: { vw, vh },
    sheet: rect(sheet), sizer: rect(sizer), frame: rect(frame), body: rect(body),
    bodyScroll: body ? { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, overflowY: cs(body, "overflowY"), scrolls: body.scrollHeight > body.clientHeight + 1 } : null,
    sheetOverflow: sheet ? { scrollHeight: sheet.scrollHeight, clientHeight: sheet.clientHeight } : null,
    horizontalOverflow: {
      document: document.documentElement.scrollWidth > vw + 0.5,
      docScrollWidth: document.documentElement.scrollWidth,
      sheet: sheet ? sheet.scrollWidth > sheet.clientWidth + 1 : null,
      body: body ? body.scrollWidth > body.clientWidth + 1 : null,
    },
    pageScroll: {
      docScrollHeight: document.documentElement.scrollHeight, scrollY: window.scrollY,
      htmlOverflow: cs(document.documentElement, "overflow"), bodyOverflow: cs(document.body, "overflow"),
      bodyPosition: cs(document.body, "position"), bodyPaddingRight: cs(document.body, "paddingRight"),
      bodyDataScrollLocked: document.body.getAttribute("data-scroll-locked"),
    },
    controls,
    hasAny: !!sheet,
  };
}

// Gestures the "short phone" brief cares about: can the player actually get
// to the lowest control by touch-scrolling the body, and does the page behind
// stay put.
async function scrollProbe(page) {
  return page.evaluate(async () => {
    const body = document.querySelector(".play-scroll__body");
    if (!body) return null;
    const before = { bodyTop: body.scrollTop, winY: window.scrollY };
    body.scrollTop = body.scrollHeight;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = { bodyTop: body.scrollTop, winY: window.scrollY };
    const last = body.querySelector('[data-testid="play-scroll-practice"]') || body.querySelector("li:last-child button, li:last-child");
    const lr = last ? last.getBoundingClientRect() : null;
    const br = body.getBoundingClientRect();
    const reachable = lr ? lr.bottom <= br.bottom + 1 && lr.top >= br.top - 1 : null;
    body.scrollTop = 0;
    return { before, after, maxScrollTop: after.bodyTop, lastControlReachableAtEnd: reachable };
  });
}

async function openRecord(page, surface, view) {
  if (surface === "fixture") {
    await page.goto(`${BASE}/dev/play-scroll`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForSelector('[data-testid="play-scroll"]', { timeout: 180000 });
    if (view === "ranked") {
      await page.click('[data-testid="play-mode-ranked"]');
      await page.waitForSelector('[data-view="ranked"]', { timeout: 20000 });
    } else if (view === "invite") {
      await page.click('[data-testid="play-mode-invite"]');
      await page.waitForSelector('[data-view="invite"]', { timeout: 20000 });
    }
  } else {
    await page.goto(`${BASE}/quiz?play=1`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForSelector('[data-testid="play-scroll"]', { timeout: 180000 });
  }
}

async function settle(page) {
  // The unfurl animates the sheet's height; wait until it stops moving.
  let last = "";
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const now = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="play-scroll"]');
      if (!el) return "none";
      const r = el.getBoundingClientRect();
      return `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`;
    });
    if (now === last && i > 4) return;
    last = now;
  }
}

(async () => {
  const browser = await engine.launch(ENGINE === "chromium" ? { channel: process.env.BROWSER_CHANNEL || "msedge", headless: true } : { headless: true });
  const results = { label: LABEL, base: BASE, surface: SURFACE, view: VIEW, browser: ENGINE === "chromium" ? (process.env.BROWSER_CHANNEL || "msedge") : ENGINE, viewports: {} };
  for (const vp of VIEWPORTS) {
    if (ONLY && !ONLY.includes(vp.id)) continue;
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2,
      // Firefox contexts reject `isMobile`; it only gets viewport + touch.
      ...(ENGINE === "chromium" ? { isMobile: vp.mobile } : {}), hasTouch: vp.mobile,
      reducedMotion: process.env.REDUCED === "1" ? "reduce" : "no-preference",
    });
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("quiz:gate:hub_visited", "1");
        localStorage.setItem("lol:ranked-rules:seen_version", "1");
      } catch {}
    });
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
    try {
      await openRecord(page, SURFACE, VIEW);
      await settle(page);
      const m = await page.evaluate(measure);
      m.scrollProbe = await scrollProbe(page);
      m.pageErrors = errors;
      m.consoleErrors = consoleErrors.filter((t) => !/Failed to load resource|ERR_|net::|fonts|supabase/i.test(t));
      results.viewports[vp.id] = m;
      await page.screenshot({ path: path.join(OUT, `${LABEL}-${SURFACE}-${VIEW}-${vp.id}.png`) });
    } catch (e) {
      results.viewports[vp.id] = { error: String(e).slice(0, 300), pageErrors: errors };
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, `${LABEL}-${SURFACE}-${VIEW}.json`), JSON.stringify(results, null, 2));
  // One-line-per-viewport digest.
  for (const [id, m] of Object.entries(results.viewports)) {
    if (m.error) { console.log(id, "ERROR", m.error); continue; }
    const c = m.controls;
    const unreach = Object.entries(c).filter(([, v]) => v && !v.visibleWithoutScrolling).map(([k]) => k);
    console.log(
      id.padEnd(18),
      `sheet ${m.sheet?.w}x${m.sheet?.h}`.padEnd(20),
      `body ${m.bodyScroll?.clientHeight}/${m.bodyScroll?.scrollHeight}${m.bodyScroll?.scrolls ? " SCROLLS" : ""}`.padEnd(24),
      `hOver:${m.horizontalOverflow.document}`,
      `unreachable w/o scroll: [${unreach.join(",")}]`,
      `err:${m.pageErrors.length}/${m.consoleErrors.length}`,
    );
  }
})();
