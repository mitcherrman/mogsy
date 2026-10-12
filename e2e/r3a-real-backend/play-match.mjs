// DEV ONLY (RECONSTRUCT R3A). Plays one full admin.reconstruct bot match in the REAL arena against a
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
const require = createRequire(path.join(HERE, "../../package.json"));
const { chromium } = require("playwright-core");
const RIG = path.join(HERE, "rig");
const BASE2 = process.env.RC_FRONTEND_URL ?? "http://localhost:8132";
const WT = process.env.RC_BACKEND_WORKTREE ?? "C:/Users/mlmit/mogzy-wt/reconstruct-r3a-be";
const PY = process.env.RC_PYTHON ?? "python";
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg("out", "./r3a-out"));
const SHOTS = path.join(OUT, "shots");
const VIEWPORTS = { "1600x900": [1600, 900], "1440x900": [1440, 900], "1280x720": [1280, 720], "1280x600": [1280, 600], "390x844": [390, 844], "360x640": [360, 640] };
const py = (script, ...a) => execFileSync(PY, [path.join(RIG, script), ...a], { cwd: RIG, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

const graph = JSON.parse(fs.readFileSync(path.join(WT, "fixtures/reconstruct_recipe_graph_rev4065930.json"), "utf8"));
const nameOf = new Map(graph.item_graph_nodes.map((n) => [n.item_id, n.item_name]));
const recipe = new Map(); // item name -> [component names with multiplicity]
for (const e of graph.item_build_components) {
  const t = e.item_name;
  if (!recipe.has(t)) recipe.set(t, []);
  for (let i = 0; i < (e.quantity ?? 1); i++) recipe.get(t).push(e.component_item_name);
}

async function playMatch(browser, { vp, motion, scheme, plan, shots, latency }) {
  py("setup_db.py", "--wipe");
  const persona = py("mint_token.py", "--json").trim();
  const matchId = py("create_match.py").trim().split(/\r?\n/).pop();
  const v = { width: VIEWPORTS[vp][0], height: VIEWPORTS[vp][1] };
  const ctx = await browser.newContext({ viewport: v, reducedMotion: motion, colorScheme: scheme,
    isMobile: v.width < 640, hasTouch: v.width < 640, deviceScaleFactor: 1 });
  await ctx.addInitScript((p) => { try { localStorage.setItem("mogsy_e2e_identity", p); } catch {} }, persona);
  if (latency > 0) {
    await ctx.route(/127\.0\.0\.1:8077\/api\//, async (route) => {
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
    console.error(`  seg${s} target=${target} slots=${slots} want=${JSON.stringify(want)} opts=${JSON.stringify(opts.map((o) => o.label))} picks=${JSON.stringify(picks)}`);
    if (picks.length !== slots) picks = opts.slice(0, slots).map((o) => o.id); // unknown recipe: arbitrary
    if (outcome === "wrong") {
      const decoy = opts.find((o) => !want.includes(o.label));
      if (decoy) picks[picks.length - 1] = decoy.id;
    }
    await mark(`s${s}-open`); await shot(`s${s}-1-open`);
    for (let i = 0; i < picks.length; i++) {
      await mark(`s${s}-pick${i + 1}of${picks.length}`);
      await page.locator(`[data-testid="${picks[i]}"]`).click();
      await page.waitForTimeout(200);
    }
    await shot(`s${s}-2-full`);
    await mark(`s${s}-lock`);
    const tLock = Date.now();
    await page.locator('[data-testid="reconstruct-lock"]').click();
    // watch the lifecycle until the next board is open, or the match leaves the arena
    const t0 = Date.now();
    let sawReveal = false, shotDone = false;
    while (Date.now() - t0 < 25000) {
      const st = await page.evaluate((sel) => {
        const m = document.querySelector(sel);
        return { phase: m?.getAttribute("data-phase") ?? null, stage: m?.getAttribute("data-reveal-stage") ?? null,
          target: document.querySelector('[data-testid="reconstruct-target"] p')?.textContent ?? null,
          over: !!document.querySelector('[data-testid="ranked-match-over"]'),
          outro: !!document.querySelector('[data-testid="ranked-match-outro"]'),
          notOpen: document.querySelector('[data-testid="reconstruct-phase"]')?.hasAttribute("data-not-open") ?? null,
          url: location.pathname };
      }, rcSel);
      if (st.phase === "revealed") sawReveal = true;
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
  const data = await page.evaluate(() => window.__rcStop());
  await ctx.close();
  return { vp, motion, scheme, matchId, segs, errors, wallMs: Date.now() - t00, plan, latency, ...data };
}

const plan = arg("plan", "right,wrong,right").split(",");
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.RC_PLAYWRIGHT_EXE ? { executablePath: process.env.RC_PLAYWRIGHT_EXE } : {}) });
const run = await playMatch(browser, { vp: arg("vp", "1440x900"), motion: arg("motion", "no-preference"),
  scheme: arg("scheme", "dark"), plan, shots: arg("shots", "1") !== "0", latency: Number(arg("latency", "0")) });
await browser.close();
const name = `${run.vp}-${run.motion}-${run.scheme}-${plan.join("_")}-lat${run.latency}`;
fs.writeFileSync(path.join(OUT, `${name}.frames.json`), JSON.stringify(run.frames));
fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ ...run, frames: undefined, frameCount: run.frames.length }, null, 1));
console.log(`wrote ${path.join(OUT, name)}.json (+ .frames.json), ${run.frames.length} frames, ${run.shifts.length} layout-shift entries`);
console.log("segments:", JSON.stringify(run.segs));
