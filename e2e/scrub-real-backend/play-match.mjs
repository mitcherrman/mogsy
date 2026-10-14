// DEV ONLY (SCRUB-S3). Plays one full `admin.scrub` bot match in the REAL arena against a LOCAL
// real backend (see README.md), with the real network between them. Nothing here ships and no
// Playwright config includes it.
//
//   node e2e/scrub-real-backend/play-match.mjs --vp 1280x720 --motion no-preference \
//        --plan exact,wrong,wrong --out ./scrub-out [--launch admin|api] [--axe <axe.min.js>] [--reload-after-lock 1]
//
// Per segment it: waits for the OPEN instrument, checks the pre-lock DOM and the pre-lock wire for
// answer secrecy, scrubs (keyboard on `exact`, mouse/touch drag on `wrong`), asserts the Lock POST
// body is exactly {"checkpoint": token}, samples the reveal stage per animation frame (stage
// order, durations, region movement), and reads the SERVER's resolved round back to compare the
// verdict, points and `presentation_ms`. A plan entry may be `exact`, `wrong` (the checkpoint
// FARTHEST from the first) or `timeout` (never locks).
//
// Env: SC_FRONTEND_URL (vite wired to the rig), SC_BACKEND_WORKTREE, SC_RIG_DATA, SC_BACKEND_PORT,
//      SC_PYTHON, SC_CHROME (a chromium build when playwright-core's pinned one is absent).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, "../../package.json"));
const { chromium } = require("playwright-core");
const RIG = path.join(HERE, "rig");
const FE = process.env.SC_FRONTEND_URL ?? "http://127.0.0.1:8151";
const PY = process.env.SC_PYTHON ?? "python3";
const PORT = process.env.SC_BACKEND_PORT ?? "8187";
const API = `http://127.0.0.1:${PORT}`;
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg("out", "./scrub-out"));
const SHOTS = path.join(OUT, "shots");
const VIEWPORTS = { "1600x900": [1600, 900], "1440x900": [1440, 900], "1366x768": [1366, 768], "1280x720": [1280, 720], "1280x600": [1280, 600],
  "1366x650": [1366, 650], "390x844": [390, 844], "360x640": [360, 640] };
const FORBIDDEN = ["canonical_checkpoint", "satisfied_checkpoints", "proof", "traverse_path", "threshold_xp",
  "granularity_caveat", "breakpoint_note", "is_correct"];
const py = (script, ...a) => execFileSync(PY, [path.join(RIG, script), ...a], { cwd: RIG, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const REGIONS = { shell: '[data-testid="ranked-match"]', stage: '[data-testid="ranked-question"]', body: '[data-testid="ranked-question-body"]',
  module: '[data-testid="mig-chronoscope"]', objective: '[data-testid="chronoscope-objective"]', instrument: '[data-testid="chronoscope-instrument"]',
  lens: '[data-testid="chronoscope-lens"]', reading: '[data-testid="chronoscope-reading"]', rail: '[data-testid="chronoscope-rail"]',
  footer: '[data-testid="chronoscope-footer"]', status: '[data-testid="chronoscope-status"]' };

function installSampler(regions) {
  const frames = [];
  let running = true;
  const t0 = performance.now();
  const sample = () => {
    if (!running) return;
    const m = document.querySelector('[data-testid="mig-chronoscope"]');
    const f = { t: Math.round(performance.now() - t0), seg: window.__seg ?? null,
      phase: m?.getAttribute("data-phase") ?? null, stage: m?.getAttribute("data-reveal-stage") ?? null,
      canon: document.querySelector('[data-testid="chronoscope-canon-mark"]')?.getAttribute("data-shown") ?? null,
      proof: document.querySelector('[data-testid="chronoscope-proof"]')?.getAttribute("data-shown") ?? null,
      verdict: document.querySelector('[data-testid="chronoscope-verdict"]')?.getAttribute("data-shown") ?? null, r: {} };
    for (const [k, s] of Object.entries(regions)) {
      const e = document.querySelector(s);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      if (b.width || b.height) f.r[k] = [Math.round((b.top + window.scrollY) * 100) / 100, Math.round(b.height * 100) / 100];
    }
    frames.push(f);
  };
  const raf = () => { sample(); if (running) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  new MutationObserver(sample).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__scStop = () => { running = false; return frames; };
}

const walkKeys = (v, out = new Set()) => {
  if (Array.isArray(v)) v.forEach((x) => walkKeys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); walkKeys(x, out); }
  return out;
};

async function detentPoint(page, i) {
  return page.evaluate((n) => {
    const d = document.querySelector(`[data-testid="chronoscope-detent-${n}"]`).getBoundingClientRect();
    const rail = document.querySelector('[data-testid="chronoscope-rail"]').getBoundingClientRect();
    return { x: d.left + d.width / 2, y: rail.top + rail.height / 2 };
  }, i);
}

async function dragTo(page, a, b, touch) {
  const from = await detentPoint(page, a);
  const to = await detentPoint(page, b);
  if (touch) {
    const s = await page.context().newCDPSession(page);
    const tp = (x, y) => [{ x: Math.round(x), y: Math.round(y) }];
    await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(from.x, from.y) });
    for (let i = 1; i <= 8; i++) {
      await s.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(from.x + (to.x - from.x) * i / 8, from.y) });
      await page.waitForTimeout(30);
    }
    await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y); await page.waitForTimeout(30); }
    await page.mouse.up();
  }
  await page.waitForTimeout(200);
}

const idx = (token) => Number(token.slice(1)) - 1;

async function main() {
  const vp = arg("vp", "1280x720");
  const motion = arg("motion", "no-preference");
  const scheme = arg("scheme", "dark");
  const plan = arg("plan", "exact,wrong,wrong").split(",");
  const launch = arg("launch", "api");
  const axePath = arg("axe", "");
  const reloadAfterLock = arg("reload-after-lock", "") === "1";
  fs.mkdirSync(SHOTS, { recursive: true });
  const report = { vp, motion, scheme, plan, launch, segments: [], errors: [], wire: { lockPosts: [], preLockLeaks: [] } };

  try { py("setup_db.py", "--wipe"); } catch { py("setup_db.py"); }
  const persona = JSON.parse(py("mint_token.py", "--json").trim());
  persona.admin = launch === "admin"; // only the admin SHELL gates on it; the server decides ownership
  const token = persona.token;
  const [w, h] = VIEWPORTS[vp];
  const phone = w < 640;
  const browser = await chromium.launch({ executablePath: process.env.SC_CHROME, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: motion, colorScheme: scheme,
    isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
  await ctx.addInitScript((p) => { try { localStorage.setItem("mogsy_e2e_identity", p); } catch {} }, JSON.stringify(persona));
  const page = await ctx.newPage();
  globalThis.__page = page; globalThis.__shots = SHOTS;
  page.on("pageerror", (e) => report.errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push("console: " + m.text().slice(0, 200)); });

  // ---- the wire
  let current = { seg: 0, locked: false };
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/segments\/\d+\/challenges\/\d+$/.test(r.url())) {
      report.wire.lockPosts.push({ url: r.url().replace(API, ""), body: r.postData() });
      current.locked = true;
    }
    if (r.method() === "POST" && /\/api\/ranked\/queue$/.test(r.url())) report.wire.queuePost = r.postData();
  });
  page.on("response", async (resp) => {
    const url = resp.url();
    if (!url.startsWith(API + "/api/ranked/matches/") || resp.request().method() !== "GET") return;
    let body; try { body = await resp.json(); } catch { return; }
    const st = body?.payload?.segment_state;
    if (!st || !st.active || st.segment_number !== current.seg || current.locked) return;
    if ((st.own_next_challenge_index ?? 0) !== 0) return;
    const keys = walkKeys({ ...st, own_challenge_reveals: undefined });
    const leaked = FORBIDDEN.filter((k) => keys.has(k));
    if (leaked.length) report.wire.preLockLeaks.push({ seg: current.seg, url: url.replace(API, ""), leaked });
    report.wire.preLockBodiesChecked = (report.wire.preLockBodiesChecked ?? 0) + 1;
  });

  // ---- launch
  // `--launch admin` is the owner's REAL click-through: the E2E admin persona opens Admin -> Leaguecraft ->
  // Ranked -> Playtests, clicks "Play Chronoscope" (the shared PresetLaunch POST /api/ranked/queue), and the app
  // navigates to /quiz/ranked itself. `--launch api` (default) posts that same body from the rig and opens
  // /quiz/ranked directly (the discovery path).
  let matchId;
  if (launch === "admin") {
    await page.goto(`${FE}/admin/leaguecraft?section=ranked&view=playtests`);
    const btn = page.locator('[data-testid="scrub-launch-button"]');
    await btn.waitFor({ timeout: 90000 });
    report.adminPanel = { label: (await btn.textContent())?.trim(),
      panelText: (await page.locator('[data-testid="ranked-scrub"]').textContent())?.slice(0, 260),
      panels: await page.locator('[data-testid^="ranked-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid"))) };
    await btn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/${vp}-admin-playtests.png` });
    await btn.click();
    await page.waitForURL(/\/quiz\/ranked/, { timeout: 60000 });
    report.adminQueuePost = report.wire.queuePost;
    matchId = JSON.parse(py("oracle_latest.py").trim()).match_id;
  } else {
    matchId = py("create_match.py").trim().split(/\r?\n/).pop();
    await page.goto(`${FE}/quiz/ranked`);
  }
  report.matchId = matchId;
  await page.waitForSelector('[data-testid="mig-chronoscope"]', { timeout: 90000 });
  // The first-visit "Ranked rules" popover (a fresh test persona) is the shell's, not Scrub's.
  await page.getByRole("button", { name: /got it/i }).click({ timeout: 4000 }).catch(() => {});
  await page.evaluate(installSampler, REGIONS);
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${vp}-${motion}-${n}.png` });
  const reduced = motion === "reduce";

  for (let s = 1; s <= plan.length; s++) {
    const kind = plan[s - 1];
    current = { seg: s, locked: false };
    await page.evaluate((n) => { window.__seg = n; }, s);
    // a fresh OPEN, answerable instrument for THIS segment
    await page.waitForFunction((n) => {
      const p = document.querySelector('[data-testid="scrub-phase"]');
      const ready = !!p && p.getAttribute("data-phase") === "open" && !p.hasAttribute("data-not-open") && !p.hasAttribute("data-input-closed");
      return ready;
    }, s, { timeout: 90000 });
    await page.waitForTimeout(400);
    const oracle = JSON.parse(py("oracle.py", matchId, String(s)).trim());
    const seg = { n: s, kind, oracle: { canonical: oracle.canonical, lane: oracle.lane, target: oracle.target_level, round: oracle.round_id } };

    // pre-lock DOM secrecy
    seg.preLockDom = await page.evaluate(() => {
      const q = (sel) => document.querySelector(sel);
      return {
        canonShown: q('[data-testid="chronoscope-canon-mark"]')?.getAttribute("data-shown"),
        proofShown: q('[data-testid="chronoscope-proof"]')?.getAttribute("data-shown"),
        verdictShown: q('[data-testid="chronoscope-verdict"]')?.getAttribute("data-shown"),
        stage: q('[data-testid="mig-chronoscope"]')?.getAttribute("data-reveal-stage"),
        passed: document.querySelectorAll('[data-passed="true"]').length,
        prompt: q('[data-testid="chronoscope-prompt"]')?.textContent,
        rail: { role: q('[data-testid="chronoscope-rail"]')?.getAttribute("role"), label: q('[data-testid="chronoscope-rail"]')?.getAttribute("aria-label"),
          now: q('[data-testid="chronoscope-rail"]')?.getAttribute("aria-valuenow"), text: q('[data-testid="chronoscope-rail"]')?.getAttribute("aria-valuetext"),
          count: q('[data-testid="chronoscope-rail"]')?.getAttribute("data-count") },
        lockDisabledBeforeScrub: q('[data-testid="chronoscope-lock"]')?.hasAttribute("disabled") ?? null,
      };
    });
    await shot(`s${s}-open`);
    if (axePath && s === 1) {
      await page.addScriptTag({ path: path.resolve(axePath) });
      seg.axeOpen = await page.evaluate(async () => {
        const r = await window.axe.run(document.querySelector('[data-testid="mig-chronoscope"]'));
        return { violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })), passes: r.passes.length };
      });
    }

    if (kind === "timeout") {
      seg.note = "never locks; waiting for the server's deadline";
      const promptBefore = await page.locator('[data-testid="chronoscope-prompt"]').textContent();
      const snap = () => page.evaluate(() => ({
        phase: document.querySelector('[data-testid="scrub-phase"]')?.getAttribute("data-phase") ?? null,
        inputClosed: document.querySelector('[data-testid="scrub-phase"]')?.getAttribute("data-input-closed") ?? null,
        inert: document.querySelector('[data-testid="scrub-phase"]')?.hasAttribute("inert") ?? null,
        lockDisabled: document.querySelector('[data-testid="chronoscope-lock"]')?.hasAttribute("disabled") ?? null,
        prompt: document.querySelector('[data-testid="chronoscope-prompt"]')?.textContent ?? null,
        proofShown: document.querySelector('[data-testid="chronoscope-proof"]')?.getAttribute("data-shown") ?? null,
        verdict: document.querySelector('[data-testid="chronoscope-verdict-text"]')?.textContent ?? null,
        header: document.querySelector('[data-testid="ranked-match"]')?.innerText?.split("\n").slice(0, 14).join(" | ") ?? null }));
      // The deadline is the SERVER's (30 s); the next segment's instrument is also "open", so detect the change
      // by the prompt, the phase or the arena's own timed-out word.
      await page.waitForFunction((before) => {
        const ph = document.querySelector('[data-testid="scrub-phase"]');
        const pr = document.querySelector('[data-testid="chronoscope-prompt"]')?.textContent;
        const txt = document.querySelector('[data-testid="ranked-match"]')?.innerText ?? "";
        return !ph || ph.getAttribute("data-phase") !== "open" || pr !== before || /timed out|time.?s up/i.test(txt);
      }, promptBefore, { timeout: 70000 });
      seg.timeoutDom = { atSettle: await snap() };
      await shot(`s${s}-timeout-0`);
      await page.waitForTimeout(1200);
      seg.timeoutDom.plus1200 = await snap();
      await shot(`s${s}-timeout-1`);
    } else {
      const token = kind === "exact" ? oracle.canonical : (() => {
        const i = oracle.tokens.indexOf(oracle.canonical);
        return (oracle.tokens.length - 1 - i) >= i ? oracle.tokens[oracle.tokens.length - 1] : oracle.tokens[0];
      })();
      seg.locked = token;
      const rail = page.locator('[data-testid="chronoscope-rail"]');
      if (kind === "exact") {
        // keyboard: the slider contract (Home, then ArrowRight to the checkpoint)
        await rail.focus();
        await page.keyboard.press("Home");
        for (let i = 0; i < idx(token); i++) await page.keyboard.press("ArrowRight");
        seg.input = "keyboard";
      } else {
        await dragTo(page, 0, idx(token), phone);
        seg.input = phone ? "touch-drag" : "mouse-drag";
      }
      await page.waitForTimeout(150);
      seg.readingLabel = await page.locator('[data-testid="chronoscope-reading-label"]').textContent();
      seg.railNow = await rail.getAttribute("aria-valuenow");
      await shot(`s${s}-snapped`);
      if (seg.railNow !== String(idx(token))) seg.warn = `rail at ${seg.railNow}, wanted ${idx(token)}`;
      const lockStarted = Date.now();
      await page.locator('[data-testid="chronoscope-lock"]').click();
      seg.lockClickedAt = lockStarted;
      // reveal: wait for `done` (or the reduced-motion instant frame)
      await page.waitForFunction(() => {
        const m = document.querySelector('[data-testid="mig-chronoscope"]');
        return !!m && m.getAttribute("data-phase") === "revealed" && (m.getAttribute("data-reveal-stage") ?? "done") === "done";
      }, null, { timeout: 30000 });
      seg.revealDoneMs = Date.now() - lockStarted;
      await page.waitForTimeout(250);
      seg.postRevealDom = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        return { verdict: q('[data-testid="chronoscope-verdict-text"]')?.textContent, note: q('[data-testid="chronoscope-verdict-note"]')?.textContent,
          proofShown: q('[data-testid="chronoscope-proof"]')?.getAttribute("data-shown"), canonShown: q('[data-testid="chronoscope-canon-mark"]')?.getAttribute("data-shown"),
          threshold: q('[data-testid="chronoscope-proof-threshold"]')?.textContent, lockButton: !!q('[data-testid="chronoscope-lock"]'),
          live: q('[data-testid="chronoscope-live"]')?.textContent };
      });
      await shot(`s${s}-reveal-done`);
      if (reloadAfterLock && s === 2) {
        const before = report.wire.lockPosts.length;
        await page.reload();
        await page.waitForSelector('[data-testid="mig-chronoscope"]', { timeout: 90000 });
        await page.waitForTimeout(1200);
        seg.reload = await page.evaluate(() => ({ phase: document.querySelector('[data-testid="mig-chronoscope"]')?.getAttribute("data-phase"),
          verdict: document.querySelector('[data-testid="chronoscope-verdict-text"]')?.textContent, lock: !!document.querySelector('[data-testid="chronoscope-lock"]'),
          canon: document.querySelector('[data-testid="chronoscope-canon-mark"]')?.getAttribute("data-shown") }));
        seg.reload.extraLockPosts = report.wire.lockPosts.length - before;
        await page.evaluate(installSampler, REGIONS); // the page lost the sampler with the reload
        await page.evaluate((n) => { window.__seg = n; }, s);
        await shot(`s${s}-after-reload`);
      }
    }
    // server truth for this round
    try {
      const r = await fetch(`${API}/api/ranked/matches/${matchId}/rounds/${s}/resolved`, { headers: { authorization: `Bearer ${token}` } });
      if (r.ok) {
        const j = await r.json();
        const reveal = j.payload?.segment_reveal;
        const me = reveal?.players?.[persona.user.id];
        seg.server = { presentation_ms: j.payload?.presentation_ms, checkpoint: me?.checkpoint, correct: me?.correct, points: me?.points_awarded,
          traverse: me?.traverse_path?.length, result: me?.segment_result, canonical: reveal?.canonical_checkpoint };
      } else seg.server = { status: r.status };
    } catch (e) { seg.server = { error: String(e) }; }
    report.segments.push(seg);
    // let the next segment replace this one (or the match end)
    if (s < plan.length) await page.waitForTimeout(500);
  }

  // result + review (server) once the match is over
  await page.waitForTimeout(6000);
  const frames = await page.evaluate(() => window.__scStop?.() ?? []);
  fs.writeFileSync(path.join(OUT, `${vp}-${motion}-frames.json`), JSON.stringify(frames));
  report.frames = frames.length;
  report.finalUrl = page.url();
  await shot("final");
  try {
    const rv = await fetch(`${API}/api/ranked/matches/${matchId}/review`, { headers: { authorization: `Bearer ${token}` } });
    const j = await rv.json();
    report.review = (j.payload?.rounds ?? j.rounds ?? []).map((e) => ({ n: e.round_number, kind: e.kind, revealed: e.revealed, outcome: e.outcome,
      viewer: e.viewer_checkpoint, canonical: e.canonical_checkpoint, hasProof: !!e.proof }));
    const hi = await fetch(`${API}/api/ranked/history`, { headers: { authorization: `Bearer ${token}` } });
    const hj = await hi.json();
    report.history = (hj.payload?.matches ?? hj.matches ?? hj.payload ?? []).slice?.(0, 3);
  } catch (e) { report.reviewError = String(e); }

  // frame analysis: region movement
  const regionMove = {};
  for (const k of Object.keys(REGIONS)) {
    let maxStep = 0, lo = Infinity, hi2 = -Infinity, prev = null;
    for (const f of frames) {
      const v = f.r[k]; if (!v) continue;
      if (prev) maxStep = Math.max(maxStep, Math.abs(v[0] - prev[0]), Math.abs(v[1] - prev[1]));
      prev = v; lo = Math.min(lo, v[0]); hi2 = Math.max(hi2, v[0]);
    }
    regionMove[k] = { maxStepPx: Math.round(maxStep * 100) / 100, topSpreadPx: hi2 - lo > 0 ? Math.round((hi2 - lo) * 100) / 100 : 0 };
  }
  report.regionMove = regionMove;
  const stagesBySeg = {};
  for (const f of frames) { if (!f.stage) continue; const a = (stagesBySeg[f.seg] ??= []); if (a[a.length - 1]?.stage !== f.stage) a.push({ stage: f.stage, t: f.t }); }
  report.stages = stagesBySeg;
  report.overflow = await page.evaluate(() => ({ hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  fs.writeFileSync(path.join(OUT, `${vp}-${motion}-${launch}-report.json`), JSON.stringify(report, null, 1));
  await browser.close();
  console.log("wrote", path.join(OUT, `${vp}-${motion}-${launch}-report.json`));
  console.log("segments", JSON.stringify(report.segments.map((x) => ({ n: x.n, kind: x.kind, verdict: x.postRevealDom?.verdict, server: x.server?.correct, hold: x.server?.presentation_ms }))));
  console.log("lockPosts", JSON.stringify(report.wire.lockPosts.map((p) => p.body)));
  console.log("preLockLeaks", report.wire.preLockLeaks.length, "bodiesChecked", report.wire.preLockBodiesChecked, "errors", report.errors.length);
}
main().catch(async (e) => {
  console.error("Error:", e);
  try { // leave evidence of WHERE it stopped
    const pg = globalThis.__page;
    await pg.screenshot({ path: `${globalThis.__shots}/error-state.png` });
    console.error("STATE", JSON.stringify(await pg.evaluate(() => ({ url: location.pathname,
      scrub: document.querySelector('[data-testid="scrub-phase"]')?.outerHTML?.slice(0, 160) ?? null,
      shell: document.querySelector('[data-testid="ranked-match"]')?.innerText?.slice(0, 400) ?? document.body.innerText.slice(0, 400) }))));
  } catch {}
  process.exit(1);
});
