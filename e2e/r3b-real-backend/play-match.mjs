// DEV ONLY (RECONSTRUCT R3A; extended by R3B: timeout plan, --reload reconnect, double-Lock POST count,
// outro/end-screen geometry, server-truth readback). Plays one full admin.reconstruct bot match in the REAL arena against a
// LOCAL real backend (see README.md), sampling geometry + host lifecycle on every frame.
//
//   node e2e/r3a-real-backend/play-match.mjs --vp 1440x900 --motion no-preference --scheme dark //        --plan right,wrong,right --latency 0 --out ./r3a-out
//
// Env: RC_FRONTEND_URL (vite wired to the rig, default http://localhost:8132), RC_BACKEND_WORKTREE
// (read-only worktree of backend origin/master), RC_RIG_DATA, RC_PLAYWRIGHT_EXE (a chromium build
// matching playwright-core when the installed browsers lag the package), RC_PYTHON.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { installSampler, REGIONS } from "./sampler.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.RC_FE_PACKAGE ?? path.join(HERE, "../../package.json"));
const { chromium } = require("playwright-core");
const RIG = path.join(HERE, "rig");
const BASE2 = process.env.RC_FRONTEND_URL ?? "http://localhost:8132";
const WT = process.env.RC_BACKEND_WORKTREE ?? "C:/Users/mlmit/mogzy-wt/reconstruct-r3a-be";
const PY = process.env.RC_PYTHON ?? "python";
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg("out", "./r3a-out"));
const SHOTS = path.join(OUT, "shots");
const API = `http://127.0.0.1:${process.env.RC_BACKEND_PORT ?? "8077"}`;
const VIEWPORTS = { "1600x900": [1600, 900], "1440x900": [1440, 900], "1280x720": [1280, 720], "1280x600": [1280, 600], "1366x650": [1366, 650], "390x844": [390, 844], "360x640": [360, 640] };
const py = (script, ...a) => execFileSync(PY, [path.join(RIG, script), ...a], { cwd: RIG, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

const graph = JSON.parse(fs.readFileSync(path.join(WT, "fixtures/reconstruct_recipe_graph_rev4065930.json"), "utf8"));
const nameOf = new Map(graph.item_graph_nodes.map((n) => [n.item_id, n.item_name]));
const recipe = new Map(); // item name -> [component names with multiplicity]
for (const e of graph.item_build_components) {
  const t = e.item_name;
  if (!recipe.has(t)) recipe.set(t, []);
  for (let i = 0; i < (e.quantity ?? 1); i++) recipe.get(t).push(e.component_item_name);
}

async function playMatch(browser, { vp, motion, scheme, plan, shots, latency, reloadSeg }) {
  try { py("setup_db.py", "--wipe"); } catch { py("setup_db.py"); } // a held handle: reuse (prior match is complete)
  const persona = py("mint_token.py", "--json").trim();
  const matchId = py("create_match.py").trim().split(/\r?\n/).pop();
  const v = { width: VIEWPORTS[vp][0], height: VIEWPORTS[vp][1] };
  const ctx = await browser.newContext({ viewport: v, reducedMotion: motion, colorScheme: scheme,
    isMobile: v.width < 640, hasTouch: v.width < 640, deviceScaleFactor: 1 });
  await ctx.addInitScript((p) => { try { localStorage.setItem("mogsy_e2e_identity", p); } catch {} }, persona);
  if (latency > 0) {
    await ctx.route(new RegExp(API.replace(/[.:/]/g, (c) => "\\" + c) + "\/api\/"), async (route) => {
      await new Promise((r) => setTimeout(r, latency));
      await route.continue();
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });
  const t00 = Date.now();
  await page.goto(`${BASE2}/quiz/ranked`);
  const rcSel = '[data-testid="mig-reconstruct"]';
  await page.waitForSelector(rcSel, { timeout: 60000 });
  await page.evaluate(installSampler, REGIONS);
  const mark = (n) => page.evaluate((s) => { window.__step = s; window.__rcSnap?.(); }, n);
  const segs = [];
  const lockPosts = [];
  let reloadLanding = null;
  const timeoutHold = [];
  const reloads = [];
  const shot = async (n) => { if (shots) await page.screenshot({ path: `${SHOTS}/${vp}-${motion}-${scheme}-${n}.png` }); };
  for (let s = 1; s <= plan.length; s++) {
    // wait for an OPEN board that is answerable
    await page.waitForFunction(() => {
      const p = document.querySelector('[data-testid="reconstruct-phase"]');
      return !!p && p.getAttribute("data-phase") === "open" && !p.hasAttribute("data-not-open");
    }, null, { timeout: 60000 });
    await page.waitForTimeout(350);
    const target = await page.locator('[data-testid="reconstruct-target"] p').textContent();
    const slots = Number(await page.locator(rcSel).getAttribute("data-slots"));
    const want = [...(recipe.get(target) ?? [])];
    const opts = await page.evaluate(() => [...document.querySelectorAll('[data-part="option"]')].map((b) => ({
      id: b.getAttribute("data-testid"), label: (b.getAttribute("aria-label") ?? "").replace(/, [a-z]+ placed$/, "") })));
    const byLabel = new Map(opts.map((o) => [o.label, o.id]));
    let picks = want.map((l) => byLabel.get(l)).filter(Boolean);
    const outcome = plan[s - 1];
    const timeout = outcome === "timeout";
    console.error(`  seg${s} target=${target} slots=${slots} want=${JSON.stringify(want)} opts=${JSON.stringify(opts.map((o) => o.label))} picks=${JSON.stringify(picks)}`);
    if (picks.length !== slots) picks = opts.slice(0, slots).map((o) => o.id); // unknown recipe: arbitrary
    if (outcome === "wrong") {
      const decoy = opts.find((o) => !want.includes(o.label));
      if (decoy) picks[picks.length - 1] = decoy.id;
    }
    await mark(`s${s}-open`); await shot(`s${s}-1-open`);
    for (let i = 0; i < (timeout ? 0 : picks.length); i++) {
      await mark(`s${s}-pick${i + 1}of${picks.length}`);
      await page.locator(`[data-testid="${picks[i]}"]`).click();
      await page.waitForTimeout(200);
    }
    await shot(`s${s}-2-full`);
    await mark(`s${s}-lock`);
    const tLock = Date.now();
    if (!timeout) {
      // R3B: a second Lock press must not send a second POST (duplicate-lock guard).
      const posts = [];
      const onReq = (r) => { if (r.method() === "POST" && /\/challenges\/|\/submit|\/answer/.test(r.url())) posts.push(r.url()); };
      page.on("request", onReq);
      const lockBtn = page.locator('[data-testid="reconstruct-lock"]');
      await lockBtn.click();
      await lockBtn.click({ timeout: 300, force: true }).catch(() => {});
      await page.waitForTimeout(400);
      page.off("request", onReq);
      lockPosts.push({ s, posts: posts.length });
    }
    if (reloadSeg === s) {
      // R3B reconnect: reload mid-hold; the arena must resume from the server.
      await page.waitForTimeout(timeout ? 0 : 600);
      await mark(`s${s}-reload`);
      await page.reload();
      try {
        await page.waitForSelector('[data-testid="mig-reconstruct"], [data-testid="ranked-match-over"]', { timeout: 60000 });
      } catch {
        // Record what a reconnect after the final round actually lands on.
        await page.screenshot({ path: `${SHOTS}/${vp}-${motion}-reload${s}-landing.png` });
        reloadLanding = { url: page.url(), text: (await page.locator("body").innerText()).slice(0, 600) };
        reloads.push({ s, at: Date.now() - tLock, landing: reloadLanding });
        break;
      }
      await page.evaluate(installSampler, REGIONS).catch(() => {});
      // Frames before the reload are lost with the page; re-anchor the segment on the resumed page.
      await mark(`s${s}-lock`);
      reloads.push({ s, at: Date.now() - tLock });
    }
    // watch the lifecycle until the next board is open, or the match leaves the arena
    const t0 = Date.now();
    let sawReveal = false, shotDone = false;
    while (Date.now() - t0 < (timeout ? 45000 : 25000)) {
      const st = await page.evaluate((sel) => {
        const m = document.querySelector(sel);
        return { phase: m?.getAttribute("data-phase") ?? null, stage: m?.getAttribute("data-reveal-stage") ?? null,
          target: document.querySelector('[data-testid="reconstruct-target"] p')?.textContent ?? null,
          over: !!document.querySelector('[data-testid="ranked-match-over"]'),
          outro: !!document.querySelector('[data-testid="ranked-match-outro"]'),
          notOpen: document.querySelector('[data-testid="reconstruct-phase"]')?.hasAttribute("data-not-open") ?? null,
          hold: document.querySelector('[data-testid="ranked-match"]')?.getAttribute("data-reveal-hold") ?? null,
          url: location.pathname };
      }, rcSel);
      if (st.phase === "revealed") sawReveal = true;
      if (timeout && st.hold === "true" && !shotDone) {
        shotDone = true; await page.waitForTimeout(1500); await mark(`s${s}-timeout-hold`); await shot(`s${s}-3-timeout-hold`);
        timeoutHold.push({ s, text: (await page.locator('[data-testid="ranked-match"]').innerText().catch(() => "")).slice(0, 500) });
      }
      if (st.phase === "revealed" && st.stage === "done" && !shotDone) { shotDone = true; await mark(`s${s}-evidence-done`); await shot(`s${s}-3-evidence`); }
      if (st.phase === "revealed" && st.stage && st.stage !== "done" && !shotDone && shots && /settle/.test(st.stage)) { await shot(`s${s}-3a-${st.stage}`); }
      if (s < plan.length && st.phase === "open" && st.target !== target) break;
      if (s === plan.length && (st.over || (!st.phase && st.url))) { if (st.over) break; }
      await page.waitForTimeout(30);
    }
    segs.push({ s, target, slots, outcome, sawReveal, lockToNextMs: Date.now() - tLock });
  }
  await page.waitForTimeout(2500);
  await mark("end-screen"); await shot("end");
  const endText = await page.locator('[data-testid="ranked-match-over"]').innerText().catch(() => null);
  const data = await page.evaluate(() => (window.__rcStop ? window.__rcStop() : { frames: [], shifts: [] }));
  const token = JSON.parse(persona).token;
  const get = async (u) => { const r = await fetch(API + u, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const server = { result: await get(`/api/ranked/matches/${matchId}/result`), rounds: [] };
  for (let rn = 1; rn <= plan.length; rn++) {
    const res = await get(`/api/ranked/matches/${matchId}/rounds/${rn}/resolved`);
    const p = res.body?.payload ?? {};
    const me = p.segment_reveal?.players?.[JSON.parse(persona).user.id] ?? null;
    server.rounds.push({ rn, status: res.status, presentation_ms: p.presentation_ms ?? null, started_at: p.started_at ?? null,
      final_deadline: p.final_deadline ?? null, match_over: p.match_over ?? null,
      me: me && { correct: me.correct, incorrect: me.incorrect, unanswered: me.unanswered, points: me.points_awarded } });
  }
  await ctx.close();
  return { vp, motion, scheme, matchId, segs, timeoutHold, lockPosts, reloads, endText, server, errors, wallMs: Date.now() - t00, plan, latency, ...data };
}

const plan = arg("plan", "right,wrong,right").split(",");
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.RC_PLAYWRIGHT_EXE ? { executablePath: process.env.RC_PLAYWRIGHT_EXE } : {}) });
const run = await playMatch(browser, { vp: arg("vp", "1440x900"), motion: arg("motion", "no-preference"),
  scheme: arg("scheme", "dark"), plan, shots: arg("shots", "1") !== "0", latency: Number(arg("latency", "0")),
  reloadSeg: Number(arg("reload", "0")) });
await browser.close();
const name = `${run.vp}-${run.motion}-${run.scheme}-${plan.join("_")}-lat${run.latency}${run.reloads.length ? "-reload" + run.reloads[0].s : ""}`;
fs.writeFileSync(path.join(OUT, `${name}.frames.json`), JSON.stringify(run.frames));
fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ ...run, frames: undefined, frameCount: run.frames.length }, null, 1));
console.log(`wrote ${path.join(OUT, name)}.json (+ .frames.json), ${run.frames.length} frames, ${run.shifts.length} layout-shift entries`);
console.log("segments:", JSON.stringify(run.segs));
