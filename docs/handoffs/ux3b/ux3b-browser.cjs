// UX3B real-browser release acceptance: headless Edge against production
// `vite preview` builds of FE main 4b13c042 with VITE_WORLDS_EXPERIENCE_ENABLED
// unset (OFF, :5281) and "true" (ON, :5282), reading the LIVE production API,
// plus the published site (https://mogzy.lol) for the flag-off comparison.
// Writes ux3b-results.json + screenshots into OUT_DIR.
//
// Run (cwd = the worktree): node docs/handoffs/ux3b/ux3b-browser.cjs
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(process.cwd(), "node_modules/playwright"));

const OFF = process.env.OFF ?? "http://localhost:5281";
const ON = process.env.ON ?? "http://localhost:5282";
const PUB = process.env.PUB ?? "https://mogzy.lol";
const W = "/lol/pro-play/tournament/worlds-2026";
const DCGI = "/lol/pro-play/tournament/dcgi-2026";
const HUB = "/lol/pro-play";
const C9_KC = "115660588583171786";
const FINAL = "115660540726095133";
const OUT = process.env.OUT_DIR || path.join(__dirname);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (group, name, ok, detail) => {
  results.push({ group, name, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? "PASS" : "FAIL"}  [${group}] ${name}${detail !== undefined ? "  " + JSON.stringify(detail).slice(0, 400) : ""}`);
};

const DESKTOPS = [
  { name: "1440", viewport: { width: 1440, height: 900 } },
  { name: "1280", viewport: { width: 1280, height: 800 } },
];
const PHONE = { name: "390", viewport: { width: 390, height: 844 }, mobile: true };

async function waitImages(page, ms = 20000) {
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: ms }).catch(() => {});
}
async function meta(page) {
  return page.evaluate(() => ({
    title: document.title,
    canonical: document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
    robots: document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
    description: document.head.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
  }));
}
async function layout(page) {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:var(--app-header-h)";
    document.body.appendChild(probe);
    const hdr = probe.getBoundingClientRect().height;
    probe.remove();
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top + scrollY, bottom: b.bottom + scrollY, height: b.height, width: b.width, left: b.left, right: b.right };
    };
    // The global HUD is fixed above the experience: whatever is hit-tested
    // just inside the command bar's top edge must belong to the experience.
    const frameEl = document.querySelector("[data-testid='worlds-experience']");
    const barEl = document.querySelector("[data-testid='command-bar']");
    const hud = [];
    if (barEl) {
      const bb = barEl.getBoundingClientRect();
      for (const fx of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        const hit = document.elementFromPoint(bb.left + bb.width * fx, bb.top + 3);
        hud.push(Boolean(hit && frameEl && frameEl.contains(hit)));
      }
    }
    const footer = document.querySelector("footer");
    // Anything wider than the viewport that is not inside a scroll container.
    const clipped = [];
    for (const el of document.querySelectorAll("[data-testid='worlds-experience'] *")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.right > innerWidth + 1 || b.left < -1) {
        let p = el.parentElement, scrolls = false;
        while (p && p !== document.body) {
          const s = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { scrolls = true; break; }
          p = p.parentElement;
        }
        if (!scrolls) clipped.push((el.getAttribute("data-testid") || el.tagName) + ":" + Math.round(b.left) + "-" + Math.round(b.right));
      }
      if (clipped.length > 5) break;
    }
    return {
      innerWidth, innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      headerH: hdr,
      hudClear: hud,
      frame: r("[data-testid='worlds-experience']"),
      bar: r("[data-testid='command-bar']"),
      footerTop: footer ? footer.getBoundingClientRect().top + scrollY : null,
      footerVisible: footer ? getComputedStyle(footer).display !== "none" : false,
      main: r("main"),
      h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()),
      clipped,
    };
  });
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: opts.mobile ?? false,
    hasTouch: opts.mobile ?? false,
    reducedMotion: opts.reducedMotion ?? "no-preference",
  });
  const page = await ctx.newPage();
  const errors = [];
  const chunks = [];
  const requests = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/404 Error: User attempted|Failed to load resource|supabase|ERR_|net::/i.test(m.text())) errors.push(m.text());
  });
  page.on("request", (r) => {
    const u = r.url();
    requests.push(u);
    if (/\/assets\/[^/]+\.js$/.test(u)) chunks.push(u.split("/").pop());
  });
  if (opts.tournament) await page.route("**/live-esports/tournament/worlds-2026*", opts.tournament);
  return { ctx, page, errors, chunks, requests };
}
async function go(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
}
const screenOf = (page) => page.getAttribute("[data-testid='workspace']", "data-screen").catch(() => null);
async function shot(page, name, full = false) {
  await waitImages(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: full });
}
async function sectionText(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-testid='tournament-v2']") || document.querySelector("main");
    return (el?.innerText ?? "").replace(/\d+\s*(d|h|m|s)\b/g, "#").replace(/\s+/g, " ").trim();
  });
}
const expChunk = (chunks) => chunks.filter((c) => /ProductionExperience|WorldsExperience/.test(c));
const run = (g) => !ONLY || ONLY.has(g);
let CODES = [];

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    {
      const api = "https://web-production-83e53.up.railway.app/api/live-esports/tournament/worlds-2026";
      const body = await (await fetch(api)).json();
      CODES = body.context.participants.map((p) => p.code).filter(Boolean);
    }
    /* ── warm ── */
    for (const base of [OFF, ON]) {
      const { ctx, page } = await newPage(browser);
      await go(page, base + W);
      await page.waitForSelector("[data-testid='tournament-v2'], [data-testid='worlds-experience']", { timeout: 120000 }).catch(() => {});
      await ctx.close();
    }

    /* ── A. OFF build vs the PUBLISHED site (rollback state = today's production) ── */
    if (run("A")) for (const vp of [DESKTOPS[0], PHONE]) {
      const got = {};
      for (const [label, base] of [["off", OFF], ["published", PUB]]) {
        const { ctx, page, errors, chunks } = await newPage(browser, vp);
        await go(page, base + W);
        await page.waitForSelector("[data-testid='tournament-v2']", { timeout: 120000 }).catch(() => {});
        await waitImages(page);
        await page.waitForTimeout(3000);
        got[label] = {
          meta: await meta(page), layout: await layout(page), text: await sectionText(page), errors, chunks: [...chunks],
          sections: await page.$$eval("[data-testid^='section-']", (els) => els.map((e) => e.getAttribute("data-testid"))),
          v2: await page.locator("[data-testid='tournament-v2']").count(),
        };
        if (vp.name === "1440") await shot(page, `ux3b-off-vs-published-${label}-1440`);
        await ctx.close();
      }
      const g = "A flag-off vs published";
      check(g, `${vp.name}: OFF renders the published TournamentV2 page`, got.off.v2 === 1 && got.off.sections.length > 0, got.off.sections);
      check(g, `${vp.name}: published site renders TournamentV2 (no experience)`, got.published.v2 === 1 && expChunk(got.published.chunks).length === 0, got.published.sections);
      check(g, `${vp.name}: same sections as published`, JSON.stringify(got.off.sections) === JSON.stringify(got.published.sections));
      {
        const A = got.off.text.split(" "), B = got.published.text.split(" ");
        const diffs = [];
        for (let i = 0; i < Math.max(A.length, B.length) && diffs.length < 6; i++) if (A[i] !== B[i]) diffs.push([i, A.slice(Math.max(0, i - 4), i + 4).join(" "), B.slice(Math.max(0, i - 4), i + 4).join(" ")]);
        check(g, `${vp.name}: same text as published`, got.off.text === got.published.text, diffs.length ? diffs : { words: A.length });
      }
      check(g, `${vp.name}: same title/canonical/description as published`, JSON.stringify(got.off.meta) === JSON.stringify(got.published.meta), got.off.meta);
      check(g, `${vp.name}: OFF never requests the experience chunk`, expChunk(got.off.chunks).length === 0, expChunk(got.off.chunks));
      check(g, `${vp.name}: OFF no horizontal overflow`, got.off.layout.scrollWidth <= got.off.layout.innerWidth, got.off.layout.scrollWidth);
      check(g, `${vp.name}: OFF no page errors`, got.off.errors.length === 0, got.off.errors);
    }

    /* ── B. OFF: rollback state for shared nested links; other routes ── */
    if (run("B")) {
      const g = "B flag-off routes";
      const { ctx, page, chunks } = await newPage(browser);
      for (const p of ["/teams", "/schedule", "/stages/swiss", "/schedule?match=" + C9_KC]) {
        await go(page, OFF + W + p);
        await page.waitForSelector("text=Page not found", { timeout: 60000 }).catch(() => {});
        const m = await meta(page);
        const homeLink = await page.locator("a[href='/'], a[href='/lol']").count();
        check(g, `OFF: shared nested link ${p} → 404 page, noindex, a way home`, (await page.locator("text=Page not found").count()) > 0 && /noindex/.test(m.robots ?? "") && homeLink > 0, m);
      }
      for (const p of ["/teams", "/schedule"]) {
        await go(page, PUB + W + p);
        await page.waitForSelector("text=Page not found", { timeout: 90000 }).catch(() => {});
        check(g, `PUBLISHED today: ${p} is the 404 page (flag off in production)`, (await page.locator("text=Page not found").count()) > 0);
      }
      await go(page, OFF + DCGI);
      await page.waitForSelector("h1", { timeout: 90000 });
      check(g, "OFF: DCGI renders its v1 page", (await page.locator("h1", { hasText: "Demacia Cup Global Invitational 2026" }).count()) > 0);
      for (const p of ["/lol/dev/worlds-experience", "/dev/match-grid"]) {
        await go(page, OFF + p);
        await page.waitForSelector("text=Page not found", { timeout: 60000 }).catch(() => {});
        check(g, `OFF: dev route ${p} 404s in production`, (await page.locator("text=Page not found").count()) > 0);
      }
      check(g, "OFF: experience chunk never requested across these visits", expChunk(chunks).length === 0, expChunk(chunks));
      await ctx.close();
    }

    /* ── C. ON: desktop acceptance at 1440×900 and 1280×800 ── */
    if (run("C")) for (const vp of DESKTOPS) {
      const g = `C flag-on ${vp.name}`;
      const { ctx, page, errors, chunks } = await newPage(browser, vp);
      await go(page, ON + W);
      await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 90000 });
      await waitImages(page);
      const l = await layout(page);
      const m = await meta(page);
      check(g, "Overview at the Worlds URL", (await screenOf(page)) === "overview");
      check(g, "Overview keeps the published title + canonical, indexable", m.title === "Worlds — League of Legends World Championship 2026 | Mogzy" && m.canonical?.endsWith(W) && !/noindex/.test(m.robots ?? ""), m);
      check(g, "frame spans the viewport", Math.abs(l.frame.width - l.innerWidth) <= 1, l.frame);
      check(g, "global HUD does not overlap the frame (bar top hit-tests inside the experience)", l.hudClear.length === 5 && l.hudClear.every(Boolean) && Math.abs(l.frame.top - l.headerH) <= 1, { hud: l.hudClear, frameTop: l.frame.top, headerH: l.headerH });
      check(g, "frame fills the viewport below the header", Math.abs(l.frame.height - (l.innerHeight - l.headerH)) <= 1, { frame: l.frame.height, avail: l.innerHeight - l.headerH });
      check(g, "one h1 (no duplicate tournament heading)", l.h1.length === 1, l.h1);
      check(g, "footer follows the frame", l.footerVisible && l.footerTop >= l.frame.bottom - 1, { footerTop: l.footerTop, frameBottom: l.frame.bottom });
      check(g, "no body-level horizontal overflow", l.scrollWidth <= l.innerWidth && l.bodyScrollWidth <= l.innerWidth, l.scrollWidth);
      check(g, "no clipped content outside a scroll container", l.clipped.length === 0, l.clipped);
      check(g, "no simulation UI", (await page.locator("[data-testid='simulated-badge'], [data-testid='scenario-picker'], [data-testid='detail-simulated']").count()) === 0 && (await page.getByText("Prototype data").count()) === 0 && (await page.getByText("Simulated", { exact: true }).count()) === 0);
      check(g, "Discover is not offered", (await page.locator("[data-testid='nav-screen'][data-screen='discover']").count()) === 0 || (await page.locator("[data-testid='nav-screen'][data-screen='discover']").first().isDisabled()));
      await shot(page, `ux3b-on-overview-${vp.name}`);

      // Navigation, titles, canonicals; Back/Forward.
      const nav = (key) => page.locator(`[data-testid='nav-screen'][data-screen='${key}']`).first().click();
      for (const [key, url, title] of [
        ["stages", /\/stages$/, /^(Play-In|Swiss|Knockouts) — Worlds 2026 \| Mogzy$/],
        ["teams", /\/teams$/, /^Teams — Worlds 2026 \| Mogzy$/],
        ["schedule", /\/schedule$/, /^Schedule — Worlds 2026 \| Mogzy$/],
      ]) {
        await nav(key);
        await page.waitForFunction((k) => document.querySelector("[data-testid='workspace']")?.getAttribute("data-screen") === k, key, { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(250);
        const mm = await meta(page);
        check(g, `nav → ${key}: URL, title, query-free canonical`, url.test(new URL(page.url()).pathname) && title.test(mm.title) && !mm.canonical.includes("?"), { url: page.url(), title: mm.title, canonical: mm.canonical });
      }
      for (const key of ["teams", "stages", "overview"]) {
        await page.goBack();
        await page.waitForFunction((k) => document.querySelector("[data-testid='workspace']")?.getAttribute("data-screen") === k, key, { timeout: 10000 }).catch(() => {});
        check(g, `Back → ${key}`, (await screenOf(page)) === key, page.url());
      }
      await page.goForward();
      await page.waitForTimeout(300);
      check(g, "Forward → stages", (await screenOf(page)) === "stages", page.url());

      // Every stage by direct URL + refresh.
      for (const [stage, re] of [["play-in", /^Play-In — /], ["swiss", /^Swiss — /], ["knockouts", /^Knockouts — /]]) {
        await go(page, `${ON}${W}/stages/${stage}`);
        await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 60000 });
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 60000 });
        await page.waitForTimeout(400);
        const mm = await meta(page);
        check(g, `direct URL + refresh /stages/${stage}`, (await screenOf(page)) === "stages" && new URL(page.url()).pathname === `${W}/stages/${stage}` && re.test(mm.title) && mm.canonical.endsWith(`/stages/${stage}`), { url: page.url(), title: mm.title });
      }
      // Swiss round selection survives refresh.
      await go(page, ON + W + "/stages/swiss");
      await page.waitForSelector("[data-testid='swiss-round-head']", { timeout: 60000 });
      await page.locator("[data-testid='swiss-round-head']").nth(2).click();
      await page.waitForTimeout(400);
      const swissUrl = page.url();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-testid='swiss-round-head']", { timeout: 60000 });
      await page.waitForTimeout(300);
      check(g, "Swiss Round 3 in URL, pressed, survives refresh", /round=3/.test(swissUrl) && page.url() === swissUrl && (await page.locator("[data-testid='swiss-round-head']").nth(2).getAttribute("aria-pressed")) === "true", swissUrl);
      // Knockout: TBD slots are drawn as TBD, no invented teams.
      // The brief's singular /stages/knockout is not the slug (knockouts): it corrects to the default stage.
      await go(page, ON + W + "/stages/knockout");
      await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 60000 });
      await page.waitForTimeout(600);
      check(g, "singular /stages/knockout (not a slug) corrects in place to the default stage", /\/stages\/(play-in|swiss|knockouts)$/.test(new URL(page.url()).pathname), page.url());
      await go(page, ON + W + "/stages/knockouts");
      await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 60000 });
      await page.waitForTimeout(500);
      const koText = await page.locator("[data-testid='workspace']").innerText();
      const bracket = koText.slice(koText.search(/QUARTERFINALS/i));
      const named = CODES.filter((c) => new RegExp(`(^|\\s)${c}(\\s|$)`).test(bracket));
      check(g, "Knockout pre-draw: slots empty, no team named (draw not made)", /bracket set by the draw/i.test(koText) && bracket.length > 0 && named.length === 0, { named, head: bracket.slice(0, 120) });

      // Schedule: match selection, Escape, deep link + refresh.
      await go(page, ON + W + "/schedule");
      await page.waitForSelector("[data-testid='fixture-row']", { timeout: 60000 });
      await page.locator("[data-testid='fixture-row']").first().click();
      await page.waitForSelector("[data-testid='match-detail']", { timeout: 10000 }).catch(() => {});
      const mMeta = await meta(page);
      check(g, "Schedule fixture → detail (?match=), canonical stays /schedule", /match=/.test(page.url()) && mMeta.canonical.endsWith(W + "/schedule"), { url: page.url(), canonical: mMeta.canonical });
      const centre = await page.getAttribute("[data-testid='detail-footer']", "data-match-centre").catch(() => null);
      const centreHref = await page.getAttribute("[data-testid='detail-match-centre']", "href").catch(() => null);
      check(g, "Match Centre link only for a fixture the hub lists (C9 v KC listed → ?next=)", centre === "listed" ? centreHref === `${HUB}?next=${new URL(page.url()).searchParams.get("match")}` : centre !== null, { centre, centreHref });
      if (vp.name === "1440") await shot(page, "ux3b-on-schedule-match-1440");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      check(g, "Escape closes the detail", !/match=/.test(page.url()), page.url());
      // Filters: date and stage chips.
      const stageChip = page.locator("[data-testid='schedule-filter-chip'][data-stage='swiss']").first();
      if (await stageChip.count()) {
        await stageChip.click();
        await page.waitForTimeout(400);
        check(g, "Schedule stage filter writes the URL", /stage=swiss/.test(page.url()), page.url());
      } else check(g, "Schedule stage filter present", false, "no stage chip found");
      const link = `${ON}${W}/schedule?day=2026-10-15&match=${C9_KC}`;
      await go(page, link);
      await page.waitForSelector("[data-testid='match-detail']", { timeout: 60000 }).catch(() => {});
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-testid='match-detail']", { timeout: 60000 }).catch(() => {});
      check(g, "Schedule deep link (day+match) survives refresh, titled C9 vs KC", page.url() === link && (await meta(page)).title.startsWith("C9 vs KC"), page.url());
      // Teams + region (UX2A reconciliation).
      await go(page, `${ON}${W}/teams?team=KC`);
      await page.waitForSelector("[data-testid='team-focus']", { timeout: 60000 }).catch(() => {});
      const tm = await meta(page);
      check(g, "direct team link opens KC, canonical /teams", (await page.locator("[data-testid='team-focus']").count()) > 0 && tm.canonical.endsWith(W + "/teams") && /Karmine Corp/.test(tm.title), tm);
      const lck = page.locator("[data-testid='region-chip']", { hasText: "LCK" }).first();
      if (await lck.count()) {
        await lck.click();
        await page.waitForTimeout(300);
        check(g, "region LCK clears KC (UX2A)", !/team=KC/.test(page.url()) && /region=/.test(page.url()), page.url());
      }
      // Keyboard: Tab reaches the screen nav, Enter activates.
      await go(page, ON + W);
      await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 60000 });
      let reached = false;
      for (let i = 0; i < 60 && !reached; i++) {
        await page.keyboard.press("Tab");
        reached = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "nav-screen" && document.activeElement?.getAttribute("data-screen") === "teams");
      }
      if (reached) {
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
      }
      const focusVisible = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== "none" || /ring/.test(document.activeElement?.className ?? ""));
      check(g, "keyboard: Tab reaches the Teams nav and Enter opens it", reached && (await screenOf(page)) === "teams", { reached, focusVisible });
      // Workspace scroll (internal) is usable at this height.
      await go(page, ON + W + "/schedule");
      await page.waitForSelector("[data-testid='fixture-row']", { timeout: 60000 });
      const sc = await page.evaluate(() => {
        const rows = document.querySelectorAll("[data-testid='fixture-row']");
        const last = rows[rows.length - 1];
        last?.scrollIntoView({ block: "center" });
        const b = last?.getBoundingClientRect();
        return { rows: rows.length, visible: b ? b.top >= 0 && b.bottom <= innerHeight : false };
      });
      check(g, "Schedule list scrolls its last fixture into view", sc.visible, sc);
      // Other contexts unchanged with the flag ON.
      await go(page, ON + DCGI);
      await page.waitForSelector("h1", { timeout: 90000 });
      check(g, "DCGI v1 page unchanged with the flag on", (await page.locator("h1", { hasText: "Demacia Cup Global Invitational 2026" }).count()) > 0 && (await page.locator("[data-testid='worlds-experience']").count()) === 0);
      check(g, "experience chunk loaded", expChunk(chunks).length > 0, expChunk(chunks));
      check(g, "no Match Grid chunk on Worlds pages", !chunks.some((c) => /MatchGrid/i.test(c)), chunks.filter((c) => /MatchGrid/i.test(c)));
      check(g, "no page errors", errors.length === 0, errors);
      await ctx.close();
    }

    /* ── D. ON: phone 390 × 844 ── */
    if (run("D")) {
      const g = "D flag-on 390";
      const { ctx, page, errors } = await newPage(browser, PHONE);
      await go(page, ON + W);
      await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 90000 });
      await waitImages(page);
      const l = await layout(page);
      check(g, "compact frame", (await page.getAttribute("[data-testid='worlds-experience']", "data-layout")) === "compact");
      check(g, "bar below the global header", l.bar.top >= l.headerH - 1, { bar: l.bar.top, headerH: l.headerH });
      check(g, "no horizontal overflow", l.scrollWidth <= l.innerWidth, l.scrollWidth);
      check(g, "no clipped content", l.clipped.length === 0, l.clipped);
      check(g, "one h1", l.h1.length === 1, l.h1);
      await shot(page, "ux3b-m-on-overview-390");
      await page.locator("[data-testid='nav-screen'][data-screen='teams']").first().click();
      await page.waitForSelector("[data-testid='team-tile']", { timeout: 20000 });
      await page.locator("[data-testid='team-tile']").first().click();
      await page.waitForSelector("[role='dialog']", { timeout: 10000 }).catch(() => {});
      check(g, "team tile opens a bottom sheet (?team=)", (await page.locator("[role='dialog']").count()) > 0 && /team=/.test(page.url()), page.url());
      await page.goBack();
      await page.waitForTimeout(600);
      check(g, "Back closes the team sheet", (await page.locator("[role='dialog']").count()) === 0 && !/team=/.test(page.url()), page.url());
      await page.locator("[data-testid='nav-screen'][data-screen='schedule']").first().click();
      await page.waitForSelector("[data-testid='fixture-row']", { timeout: 20000 });
      await page.locator("[data-testid='fixture-row']").first().click();
      await page.waitForSelector("[role='dialog']", { timeout: 10000 }).catch(() => {});
      check(g, "fixture opens the match sheet", (await page.locator("[role='dialog']").count()) > 0 && /match=/.test(page.url()), page.url());
      await shot(page, "ux3b-m-on-match-sheet-390");
      const closeBtn = page.locator("[role='dialog'] [data-testid='detail-close'], [role='dialog'] button[aria-label*='Close' i]").first();
      if (await closeBtn.count()) await closeBtn.click(); else await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      check(g, "match sheet closes by its control", (await page.locator("[role='dialog']").count()) === 0, page.url());
      await go(page, ON + W + "/stages/swiss");
      await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 60000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 60000 });
      check(g, "nested route refresh on phone", (await screenOf(page)) === "stages", page.url());
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      const l2 = await layout(page);
      check(g, "footer reachable below the experience", l2.footerVisible && l2.footerTop > l2.frame.top, { footerTop: l2.footerTop, frameTop: l2.frame.top });
      check(g, "no horizontal overflow after moves", l2.scrollWidth <= l2.innerWidth, l2.scrollWidth);
      check(g, "no page errors", errors.length === 0, errors);
      await ctx.close();
    }

    /* ── E. ON: reduced motion ── */
    if (run("E")) {
      const g = "E reduced motion";
      const { ctx, page } = await newPage(browser, { reducedMotion: "reduce" });
      await go(page, ON + W);
      await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 90000 });
      check(g, "workspace marked reduced", (await page.getAttribute("[data-testid='workspace']", "data-motion")) === "reduced");
      await page.locator("[data-testid='nav-screen'][data-screen='teams']").first().click();
      await page.waitForTimeout(60);
      const tf = await page.evaluate(() => [...document.querySelectorAll("[data-testid='screen']")].map((s) => getComputedStyle(s).transform));
      check(g, "no travel mid-move", tf.every((t) => t === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t)), tf);
      await page.waitForTimeout(800);
      const stale = await page.evaluate(() => [...document.querySelectorAll("[data-testid='screen']")].map((s) => ({ hidden: s.getAttribute("aria-hidden"), op: getComputedStyle(s).opacity })));
      check(g, "after the move only the new screen is exposed", stale.filter((s) => s.hidden !== "true" && s.op !== "0").length === 1, stale);
      await ctx.close();
    }

    /* ── F. ON: degraded API on a screen path, loading, refetch failure + retry ── */
    if (run("F")) {
      const g = "F data states";
      const mutate = (fn) => async (route) => {
        const res = await route.fetch();
        const body = await res.json();
        fn(body);
        await route.fulfill({ response: res, json: body });
      };
      const cases = [
        ["503", async (r) => r.fulfill({ status: 503, body: "{}" }), async (p) => (await p.locator("text=This tournament could not be loaded.").count()) > 0, 30000],
        ["404", async (r) => r.fulfill({ status: 404, body: "{}" }), async (p) => (await p.locator("text=No such tournament.").count()) > 0, 20000],
        ["unsupported", mutate((b) => (b.contract_version = "tournament_context_v9")), async (p) => (await p.locator("[data-testid='tournament-contract-error']").count()) > 0, 20000],
        ["partial", mutate((b) => { b.state.matches = b.state.matches.slice(0, 40); b.state.coverage = { ...b.state.coverage, complete: false, found_matches: 40 }; }), async (p) => (await p.locator("[data-testid='status-partial']").count()) > 0, 20000],
        ["stale", mutate((b) => { b.stale = true; b.source_ok = false; for (const k of Object.keys(b.sources || {})) b.sources[k] = { ...b.sources[k], ok: false, stale: true }; }), async (p) => (await p.locator("[data-testid='status-stale']").count()) > 0, 20000],
        ["unknown", mutate((b) => { b.state.phase = "unknown"; b.state.matches = []; b.state.next_match_id = null; }), async (p) => (await p.locator("[data-testid='status-unknown']").count()) > 0, 20000],
      ];
      for (const [name, handler, ok, wait] of cases) {
        const { ctx, page } = await newPage(browser, { tournament: handler });
        await go(page, `${ON}${W}/schedule`);
        const t0 = Date.now();
        while (Date.now() - t0 < wait && !(await ok(page))) await page.waitForTimeout(500);
        check(g, `API ${name}: handled on a screen path`, await ok(page));
        if (name === "partial" || name === "503") await shot(page, `ux3b-on-api-${name}-1440`);
        await ctx.close();
      }
      // Loading frame while the read is held.
      {
        let release;
        const gate = new Promise((r) => (release = r));
        const { ctx, page } = await newPage(browser, { tournament: async (route) => { await gate; await route.continue(); } });
        await go(page, `${ON}${W}/teams`);
        await page.waitForSelector("[data-testid='tournament-loading']", { timeout: 30000 }).catch(() => {});
        const loading = await page.getAttribute("[data-testid='tournament-loading']", "data-experience").catch(() => null);
        check(g, "loading: frame-shaped skeleton while the read is pending", loading === "worlds", loading);
        release();
        await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 60000 }).catch(() => {});
        check(g, "loading → experience on the requested screen", (await screenOf(page)) === "teams");
        await ctx.close();
      }
      // Refetch failure then Retry recovery.
      {
        let fail = false;
        const { ctx, page } = await newPage(browser, { tournament: async (route) => (fail ? route.fulfill({ status: 503, body: "{}" }) : route.continue()) });
        // The app client disables focus refetch; the page's 120 s poll is the
        // refresh path, so jump the page clock past it.
        await page.clock.install({ time: new Date() });
        await go(page, `${ON}${W}/schedule`);
        await page.waitForSelector("[data-testid='worlds-experience']", { timeout: 60000 });
        fail = true;
        await page.clock.fastForward("02:05");
        for (let i = 0; i < 6; i++) { await page.waitForTimeout(1000); await page.clock.fastForward("00:05"); }
        await page.waitForSelector("[data-testid='status-refresh']", { timeout: 30000 }).catch(() => {});
        const shown = await page.locator("[data-testid='status-refresh']").count();
        const stillDrawn = await page.locator("[data-testid='fixture-row']").count();
        check(g, "refetch failure: 'Couldn't get the latest update' while the last good data stays", shown > 0 && stillDrawn > 0, { shown, stillDrawn });
        if (shown) await shot(page, "ux3b-on-refetch-failed-1440");
        fail = false;
        await page.locator("[data-testid='status-refresh'] button").click().catch(() => {});
        await page.waitForSelector("[data-testid='status-refresh']", { state: "detached", timeout: 30000 }).catch(() => {});
        check(g, "Retry recovers and clears the notice", (await page.locator("[data-testid='status-refresh']").count()) === 0);
        await ctx.close();
      }
    }

    /* ── G. HUB-NEXT1 in the integrated build (real production feed + tournament) ── */
    if (run("G")) for (const [label, base] of [["OFF", OFF], ["ON", ON]]) {
      const g = `G HUB-NEXT1 ${label}`;
      const { ctx, page, requests } = await newPage(browser);
      // Out-of-window Final.
      await go(page, `${base}${HUB}?next=${FINAL}`);
      const board = await page.waitForSelector("[data-testid='tournament-fixture']", { timeout: 60000 }).catch(() => null);
      const id = board ? await board.getAttribute("data-match-id") : null;
      const h = board ? await page.locator("[data-testid='tournament-fixture'] h3").first().innerText() : null;
      const meta2 = board ? await page.locator("[data-testid='tournament-fixture'] [data-testid='match-meta']").innerText().catch(() => "") : "";
      check(g, "out-of-window Final shows that exact fixture (id preserved, TBD vs TBD)", id === FINAL && h === "TBD vs TBD" && new URL(page.url()).searchParams.get("next") === FINAL, { id, h, meta: meta2 });
      check(g, "fixture identity comes from the tournament read", requests.some((r) => r.includes("/live-esports/tournament/worlds-2026")));
      const ev = await page.getAttribute("[data-testid='fixture-event-link']", "href").catch(() => null);
      const expected = label === "ON" ? `${W}/schedule?match=${FINAL}` : W;
      check(g, `event link → ${expected}`, ev === expected, ev);
      if (label === "ON" && ev) {
        await page.locator("[data-testid='fixture-event-link']").click();
        await page.waitForSelector("[data-testid='match-detail']", { timeout: 60000 }).catch(() => {});
        check(g, "event link opens the Schedule with the Final's detail", (await page.getAttribute("[data-testid='match-detail']", "data-match-id").catch(() => null)) === FINAL, page.url());
        await shot(page, "ux3b-on-hub-final-to-schedule-1440");
      }
      if (label === "OFF") await shot(page, "ux3b-off-hub-final-1440");
      // ?next= beats ?game=.
      await go(page, `${base}${HUB}`);
      await page.waitForSelector("[data-testid='series-chip']", { timeout: 60000 }).catch(() => {});
      const auto = await page.locator("#match-center h3").first().innerText().catch(() => null);
      let gameId = null;
      if (await page.locator("[data-testid='series-chip']").count()) {
        await page.locator("[data-testid='series-chip']").first().click();
        await page.waitForTimeout(800);
        gameId = new URL(page.url()).searchParams.get("game");
      }
      check(g, "normal automatic hub board renders (no explicit link)", Boolean(auto), auto);
      if (gameId) {
        await go(page, `${base}${HUB}?next=${FINAL}&game=${gameId}`);
        const b2 = await page.waitForSelector("[data-testid='tournament-fixture']", { timeout: 60000 }).catch(() => null);
        check(g, "?next= takes precedence over ?game=", b2 && (await b2.getAttribute("data-match-id")) === FINAL && (await page.locator("[data-testid='match-summary']").count()) === 0, gameId);
      } else check(g, "?next= takes precedence over ?game= (needs a game id)", false, "no series chip");
      // Unknown id → blocking honest notice.
      await go(page, `${base}${HUB}?next=999999999999999999`);
      const un = await page.waitForSelector("[data-testid='next-unresolved']", { timeout: 60000 }).catch(() => null);
      check(g, "unverifiable id → blocking notice, no other match", un && (await page.locator("[data-testid='match-summary'], [data-testid='tournament-fixture']").count()) === 0, un ? await un.innerText() : null);
      // In-feed fixture keeps the normal upcoming board.
      requests.length = 0;
      await go(page, `${base}${HUB}?next=${C9_KC}`);
      await page.waitForFunction(() => document.querySelector("#match-center h3")?.textContent?.includes("vs"), null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const inFeed = await page.locator("#match-center h3").first().innerText().catch(() => null);
      check(g, "in-feed fixture (C9 v KC) uses the normal upcoming board", /C9 vs KC/.test(inFeed ?? "") && (await page.locator("[data-testid='tournament-fixture']").count()) === 0, inFeed);
      await ctx.close();
    }

    /* ── H. 15 Oct switch on a hub left open across 00:00 LA (Playwright clock) ── */
    if (run("H")) for (const [label, base] of [["OFF", OFF], ["ON", ON]]) {
      const g = `H midnight ${label}`;
      const { ctx, page } = await newPage(browser);
      await page.clock.install({ time: new Date("2026-10-15T06:59:40Z") });
      await go(page, `${base}${HUB}`);
      await page.waitForSelector("[data-testid='tournament-spotlight']", { timeout: 90000 }).catch(() => {});
      const before = await page.getAttribute("[data-testid='tournament-spotlight']", "href").catch(() => null);
      await page.clock.fastForward("01:10");
      await page.waitForFunction((w) => document.querySelector("[data-testid='tournament-spotlight']")?.getAttribute("href") === w, W, { timeout: 30000 }).catch(() => {});
      const after = await page.getAttribute("[data-testid='tournament-spotlight']", "href").catch(() => null);
      await page.waitForTimeout(1500);
      const name = await page.getAttribute("[data-testid='tournament-spotlight']", "aria-label").catch(() => null);
      check(g, "23:59:40 LA: DCGI featured", before === DCGI, before);
      check(g, "open hub moves to Worlds within a minute of 00:00 LA, no reload", after === W, { after, name });
      if (label === "ON") {
        await page.locator("[data-testid='tournament-spotlight']").click();
        await page.waitForSelector("[data-testid='worlds-experience'], [data-testid='tournament-v2']", { timeout: 60000 }).catch(() => {});
        check(g, "pill opens the experience (flag on)", (await page.locator("[data-testid='worlds-experience']").count()) === 1);
      } else {
        await page.locator("[data-testid='tournament-spotlight']").click();
        await page.waitForSelector("[data-testid='tournament-v2']", { timeout: 60000 }).catch(() => {});
        check(g, "pill opens the published page (flag off)", (await page.locator("[data-testid='tournament-v2']").count()) === 1);
      }
      await ctx.close();
    }

    /* ── I. Coexistence: hub, other Pro Play routes, Ranked / Match Grid surfaces ── */
    if (run("I")) for (const [label, base] of [["OFF", OFF], ["ON", ON]]) {
      const g = `I coexistence ${label}`;
      const { ctx, page, errors, chunks } = await newPage(browser);
      await go(page, base + HUB);
      await page.waitForSelector("#match-center", { timeout: 90000 }).catch(() => {});
      check(g, "Pro Play hub renders, no experience chunk", (await page.locator("#match-center").count()) === 1 && expChunk(chunks).length === 0, expChunk(chunks));
      for (const [p, sel] of [["/lol/pro-play/live", "main"], ["/lol/pro-play/stats", "main"], ["/lol", "main"]]) {
        await go(page, base + p);
        await page.waitForSelector(sel, { timeout: 90000 }).catch(() => {});
        await page.waitForTimeout(800);
        check(g, `${p} renders (not the 404)`, (await page.locator("text=Page not found").count()) === 0);
      }
      await go(page, base + "/lol");
      await page.waitForTimeout(1500);
      const lolMain = await page.evaluate(() => getComputedStyle(document.querySelector("main") ?? document.body).maxWidth);
      check(g, "experience chunk not loaded outside Worlds", expChunk(chunks).length === 0, expChunk(chunks));
      check(g, "no page errors", errors.length === 0, errors);
      await ctx.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, process.env.RESULTS ?? "ux3b-results.json"), JSON.stringify({ at: new Date().toISOString(), passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2));
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  }
})();
