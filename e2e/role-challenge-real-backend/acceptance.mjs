// DEV ONLY — Role Challenge end-to-end acceptance against the LOCAL real-backend rig.
//
//   node e2e/role-challenge-real-backend/acceptance.mjs --out <dir>
//
// Env: RC_BACKEND_WORKTREE, RC_RIG_DATA (see rig/common.py), RC_FRONTEND_URL
// (vite wired to the rig with VITE_E2E_AUTH=1; default http://127.0.0.1:8151),
// RC_BACKEND_PORT (default 8190), RC_PYTHON, PW_EXE (chromium executable).
//
// Each scenario records PASS/FAIL with evidence into <out>/report.json and
// screenshots into <out>/shots. The scratch DB is wiped first: the backend
// server must be (re)started AFTER this script wipes it, so start it with
// `--fresh` handled by the operator, or run this against a freshly set-up DB.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, "../../package.json"));
const { chromium } = require("playwright-core");
const RIG = path.join(HERE, "rig");
const FE = process.env.RC_FRONTEND_URL ?? "http://127.0.0.1:8151";
const API = `http://127.0.0.1:${process.env.RC_BACKEND_PORT ?? "8190"}`;
const PY = process.env.RC_PYTHON ?? "python";
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg("out", "./rc-acceptance"));
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const py = (...a) => execFileSync(PY, a, { cwd: RIG, encoding: "utf8" }).trim();
const persona = (who) => py(path.join(RIG, "mint_token.py"), who, "--json");
const token = (who) => py(path.join(RIG, "mint_token.py"), who);

// The rig bank's answers, by prompt (rig/setup_db.py). WRONG_AT answers wrong on purpose.
const ANSWERS = {
  "What is Flash's base cooldown?": "300 seconds",
  "What is Ignite's base cooldown?": "180 seconds",
  "What is Heal's base cooldown?": "240 seconds",
  "What is Barrier's base cooldown?": "180 seconds",
  "When does Baron Nashor first spawn?": "20:00",
  "When does the first elemental drake spawn?": "5:00",
  "What must happen before the Elder Dragon can spawn?": "A team claims the Dragon Soul",
  "How long do Blue Sentinel and Red Brambleback take to respawn?": "5 minutes",
  "How long does the Rift Scuttler take to respawn?": "2:30",
  "How many elemental drakes must one team slay to claim the Dragon Soul?": "4",
  "Which buff does Red Brambleback grant?": "Crest of Cinders",
  "Which buff does Blue Sentinel grant?": "Crest of Insight",
  "What happens when you destroy an enemy inhibitor?": "Super minions spawn for your team in that lane",
  "How many turrets stand in each lane, not counting Nexus turrets?": "3",
  "How many turrets guard each Nexus?": "2",
  "Which trinket reveals and disables nearby enemy wards?": "Oracle Lens",
};

const report = { startedAt: new Date().toISOString(), frontend: FE, backend: API, scenarios: [] };
const record = (name, pass, evidence) => {
  report.scenarios.push({ name, result: pass ? "PASS" : "FAIL", evidence });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${evidence ? "  " + JSON.stringify(evidence) : ""}`);
};
const api = async (who, method, p, body) => {
  const r = await fetch(API + p, { method, headers: { Authorization: `Bearer ${token(who)}`,
    ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const browser = await chromium.launch({ executablePath: process.env.PW_EXE });
async function open(who, vp, url) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 640, hasTouch: vp.width < 640,
    deviceScaleFactor: 1 });
  const p = persona(who);
  await ctx.addInitScript((pp) => {
    localStorage.setItem("mogsy_e2e_identity", pp);
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
  }, p);
  const page = await ctx.newPage();
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(e.message));
  await page.goto(FE + url, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
const waitHub = (page) => page.waitForSelector('[data-testid="challenge-mode-switcher"]', { timeout: 90000 });
const dismissRules = async (page) => {
  const b = page.locator('[data-testid="ranked-rules-acknowledge"]');
  if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
};

/** Answer the current question; returns its prompt, or null at the end screen. */
async function answerOne(page, previous, wrong) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (await page.locator('[data-testid="ranked-match-over"]').count()) return null;
    const q = (await page.locator('[data-testid="ranked-question-body"]').first().textContent().catch(() => null))?.trim() ?? null;
    const buttons = page.locator('[data-testid="answer-grid"] button');
    const prompt = q ? Object.keys(ANSWERS).find((k) => q.includes(k)) : null;
    if (prompt && prompt !== previous && (await buttons.count()) === 4 && await buttons.first().isEnabled()) {
      const labels = await buttons.allTextContents();
      const correct = labels.findIndex((t) => t.replace(/^[A-D]\.\s*/, "").trim() === ANSWERS[prompt]);
      const pick = wrong ? (correct + 1) % 4 : correct;
      await buttons.nth(pick).click();
      return prompt;
    }
    await page.waitForTimeout(300);
  }
  throw new Error("no answerable question within 90s");
}

async function playToEnd(page, { from = 0, until = 12, wrongAt = [] } = {}) {
  let prev = null; let n = from;
  while (n < until) {
    await dismissRules(page);
    const p = await answerOne(page, prev, wrongAt.includes(n + 1));
    if (p === null) break;
    prev = p; n += 1;
  }
  return n;
}

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

try {
  // ── 1. Hub modes, desktop + mobile ────────────────────────────────────────
  for (const [label, vp] of [["desktop", DESKTOP], ["mobile", MOBILE]]) {
    const { ctx, page } = await open("free", vp, "/quiz");
    await waitHub(page); await page.waitForTimeout(2500);
    const dailySelected = await page.getByRole("tab", { name: "Daily Challenge" }).getAttribute("aria-selected");
    const left = await page.locator('[data-testid="hero-standing-column"]').count();
    const right = await page.locator('[data-testid="hero-profile-column"]').count();
    if (label === "mobile") await page.locator('[data-testid="challenge-mode-switcher"]').scrollIntoViewIfNeeded();
    await shot(page, `${label}-1-hub-daily`);
    record(`${label}: hub opens on Daily with Ranked Standing + Academy Record kept`,
      dailySelected === "true" && left === 1 && right === 1, { dailySelected, left, right });
    await page.getByRole("tab", { name: "Ranked" }).click();
    await page.waitForTimeout(1200);
    const carousel = await page.locator('[data-testid="play-row"]').count();
    await shot(page, `${label}-2-hub-ranked`);
    record(`${label}: Ranked mode shows the existing role stage and Play seal`, carousel === 1, { carousel });
    await page.getByRole("tab", { name: "Role Challenge" }).click();
    await page.waitForSelector('[data-testid="rc-champion-option"]', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const options = await page.locator('[data-testid="rc-champion-option"]').count();
    const broken = await page.evaluate(() => [...document.querySelectorAll('[data-testid="rc-champion-portrait"]')]
      .filter((i) => i.complete && i.naturalWidth === 0).length);
    await shot(page, `${label}-3-role-picker`);
    record(`${label}: Role Challenge picker lists all 173 champions with portraits`,
      options === 173 && broken === 0, { options, brokenPortraits: broken });
    await page.getByRole("radio", { name: "Support" }).click();
    await page.locator("#rc-champion-search").fill("aatrox");
    await page.getByRole("radio", { name: /Aatrox/ }).click();
    await page.waitForTimeout(400);
    const sel = await page.locator('[data-testid="rc-selection"]').textContent();
    await page.locator('[data-testid="rc-selection"]').scrollIntoViewIfNeeded();
    await shot(page, `${label}-4-role-selected-offmeta`);
    record(`${label}: unconventional pick (Aatrox Support) is selectable`, /Aatrox · Support/.test(sel) && /Off-meta/.test(sel), { sel });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    record(`${label}: no horizontal page overflow`, overflow <= 0, { overflow });
    await ctx.close();
  }

  // ── 2. Free: full 12-question run with reload + hub resume ───────────────
  {
    const { ctx, page } = await open("free", DESKTOP, "/quiz?mode=role");
    await page.waitForSelector('[data-testid="rc-champion-option"]', { timeout: 90000 });
    await page.getByRole("radio", { name: "Mid" }).click();
    await page.locator("#rc-champion-search").fill("aatrox");
    await page.getByRole("radio", { name: /Aatrox/ }).click();
    const starts = [];
    page.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/role-challenges/start")) starts.push(r.postDataJSON()); });
    await page.getByTestId("rc-play").click();
    await page.waitForURL(/\/quiz\/ranked/, { timeout: 30000 });
    await page.waitForSelector('[data-testid="ranked-question-body"]', { timeout: 60000 });
    const eyebrow = await page.locator('[data-testid="ranked-header"]').textContent();
    const nodes = await page.locator('[data-testid^="timeline-node-"]').count();
    await page.waitForTimeout(800);
    await shot(page, "desktop-5-arena-q1");
    record("Free start enters the existing Ranked arena as Role Challenge, 12 nodes",
      /Role Challenge/i.test(eyebrow) && /12/.test(eyebrow) && nodes === 12 && starts.length === 1, { eyebrow: eyebrow.trim(), nodes, starts: starts.length });
    const rulesTitle = await page.locator('[data-testid="ranked-rules-panel"]').textContent().catch(() => "");
    record("Rules scroll states Role Challenge length and stakes", /Role Challenge Rules/.test(rulesTitle) && /12 questions/.test(rulesTitle), { rules: rulesTitle.slice(0, 120) });
    await dismissRules(page);
    let answered = await playToEnd(page, { until: 4, wrongAt: [2] });
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="ranked-question-body"]', { timeout: 60000 });
    const header2 = (await page.locator('[data-testid="ranked-header"]').textContent()).trim();
    await shot(page, "desktop-6-arena-after-reload");
    record("Reload mid-run resumes the same Role Challenge match", /Role Challenge/i.test(header2), { header: header2, answeredBefore: answered });
    // Leave to the hub mid-run: the picker must offer Resume, not a new start.
    await page.goto(FE + "/quiz?mode=role", { waitUntil: "domcontentloaded" });
    const card = await page.waitForSelector('[data-testid="role-active-run"]', { timeout: 60000 });
    const cardText = await card.textContent();
    const playDisabled = await page.getByTestId("rc-play").isDisabled();
    await page.locator('[data-testid="role-active-run"]').scrollIntoViewIfNeeded();
    await shot(page, "desktop-7-hub-resume-card");
    record("Hub shows the active run with Resume and blocks a second start", /Aatrox · Mid/.test(cardText) && playDisabled, { cardText, playDisabled });
    await page.getByRole("button", { name: "Resume" }).click();
    await page.waitForURL(/\/quiz\/ranked/, { timeout: 30000 });
    await page.waitForSelector('[data-testid="ranked-question-body"]', { timeout: 60000 });
    const nodeStates = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="timeline-node-"]')].map((n) => n.getAttribute("data-state") ?? n.className.slice(0, 20)));
    answered = await playToEnd(page, { from: answered, until: 12, wrongAt: [7] });
    await page.waitForSelector('[data-testid="ranked-match-over"]', { timeout: 120000 });
    await page.waitForTimeout(2500);
    await shot(page, "desktop-8-result");
    const resultText = await page.locator('[data-testid="ranked-match-over"]').textContent();
    const back = page.getByRole("button", { name: "Back to Role Challenge" });
    record("All 12 questions answered and the result screen offers Back to Role Challenge",
      answered >= 11 && await back.count() > 0, { answered, nodeStatesAfterResume: nodeStates.slice(0, 12), result: resultText.slice(0, 160) });
    await back.first().click();
    await page.waitForURL(/\/quiz\?mode=role/, { timeout: 30000 });
    await page.waitForSelector('[data-testid="rc-champion-option"]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const roleTab = await page.getByRole("tab", { name: "Role Challenge" }).getAttribute("aria-selected");
    const today = await page.locator('[data-testid="role-today-run"]').textContent().catch(() => "");
    const elig = await page.locator('[data-testid="rc-eligibility"]').textContent().catch(() => "");
    await page.getByRole("radio", { name: /Ahri/ }).click();
    const blocked = await page.getByTestId("rc-play").isDisabled();
    await page.locator('[data-testid="rc-play"]').scrollIntoViewIfNeeded();
    await shot(page, "desktop-9-hub-after-free-run");
    record("Return lands on Role Challenge; Free daily start is spent with reset time + Premium offer",
      roleTab === "true" && /complete/.test(today) && /used/.test(elig) && /Premium/.test(elig) && blocked,
      { roleTab, today, elig, blocked });
    // Ranked isolation, from the server.
    const hist = await api("free", "GET", "/api/ranked/history?limit=20");
    const prog = await api("free", "GET", "/api/ranked/progression");
    const histRows = hist.body?.matches ?? hist.body?.history ?? hist.body?.items ?? [];
    const standing = await page.locator('[data-testid="hero-standing-column"]').textContent();
    record("Role Challenge does not enter Ranked history, rating, placements or role record",
      hist.status === 200 && Array.isArray(histRows) && histRows.length === 0 && /Placement 0 \/ 5/.test(standing)
        && /No ranked matches on record yet/.test(standing),
      { historyStatus: hist.status, historyRows: histRows.length, progression: prog.body, standingExcerpt: standing.slice(0, 120) });
    const refused = await api("free", "POST", "/api/role-challenges/start", { role: "top", champion: "ahri", start_key: crypto.randomUUID() });
    record("Server refuses a second Free start today (403 DAILY_LIMIT)", refused.status === 403 && refused.body?.detail?.code === "ROLE_CHALLENGE_DAILY_LIMIT_REACHED", { status: refused.status, code: refused.body?.detail?.code });
    await ctx.close();
  }

  // ── 3. Premium: lost response → idempotent retry, then unlimited starts ──
  {
    const { ctx, page } = await open("premium", DESKTOP, "/quiz?mode=role");
    await page.waitForSelector('[data-testid="rc-champion-option"]', { timeout: 90000 });
    await page.getByRole("radio", { name: "Jungle" }).click();
    await page.locator("#rc-champion-search").fill("wukong");
    await page.getByRole("radio", { name: /Wukong/ }).click();
    const keys = [];
    let dropped = false;
    await page.route("**/api/role-challenges/start", async (route) => {
      keys.push(route.request().postDataJSON().start_key);
      if (!dropped) {
        dropped = true;
        await route.fetch();          // the server DOES create the run…
        await route.abort("failed");  // …and the client never hears back
        return;
      }
      await route.continue();
    });
    await page.getByTestId("rc-play").click();
    await page.waitForSelector("text=retry safely", { timeout: 30000 });
    await shot(page, "desktop-10-lost-response-retry");
    await page.getByTestId("rc-play").click();
    await page.waitForURL(/\/quiz\/ranked/, { timeout: 30000 });
    const status1 = await api("premium", "GET", "/api/role-challenges/status");
    record("A lost start response retried with the same key enters the SAME run (no second run)",
      keys.length === 2 && keys[0] === keys[1] && status1.body?.active_run?.champion === "wukong",
      { keys, activeRun: status1.body?.active_run?.run_id });
    await page.waitForSelector('[data-testid="ranked-question-body"]', { timeout: 60000 });
    await dismissRules(page);
    await playToEnd(page, { until: 12 });
    await page.waitForSelector('[data-testid="ranked-match-over"]', { timeout: 120000 });
    await page.getByRole("button", { name: "Back to Role Challenge" }).first().click();
    await page.waitForSelector('[data-testid="rc-champion-option"]', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const chip = await page.locator('[data-testid="rc-plan-chip"]').textContent();
    await page.getByRole("radio", { name: "ADC" }).click();
    await page.locator("#rc-champion-search").fill("thresh");
    await page.getByRole("radio", { name: /Thresh/ }).click();
    const enabled = !(await page.getByTestId("rc-play").isDisabled());
    await shot(page, "desktop-11-premium-repeat");
    record("Premium may start again after today's run (unlimited)", enabled && /Unlimited/.test(chip), { chip, enabled });
    await page.unroute("**/api/role-challenges/start");
    await page.getByTestId("rc-play").click();
    await page.waitForURL(/\/quiz\/ranked/, { timeout: 30000 });
    const status2 = await api("premium", "GET", "/api/role-challenges/status");
    record("Premium second start is a premium-slot run", status2.body?.active_run?.slot_kind === "premium", { run: status2.body?.active_run });
    // Same key replay at the API: idempotent, no new run.
    const k = crypto.randomUUID();
    const a = await api("premium", "POST", "/api/role-challenges/start", { role: "adc", champion: "thresh", start_key: k });
    record("API: a start while a run is active is refused or replays, never a second active run",
      a.status !== 200 || a.body?.role_challenge?.result === "existing", { status: a.status, code: a.body?.detail?.code });
    await ctx.close();
  }

  // ── 4. Mobile: arena + result ─────────────────────────────────────────────
  {
    const { ctx, page } = await open("premium", MOBILE, "/quiz/ranked");
    await page.waitForSelector('[data-testid="ranked-question-body"]', { timeout: 90000 });
    await dismissRules(page);
    await page.waitForTimeout(800);
    await shot(page, "mobile-5-arena");
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await playToEnd(page, { until: 12 });
    await page.waitForSelector('[data-testid="ranked-match-over"]', { timeout: 120000 });
    await page.waitForTimeout(2500);
    await shot(page, "mobile-6-result");
    record("mobile: Role Challenge plays to a result without horizontal overflow", ov <= 0, { overflow: ov });
    await page.getByRole("button", { name: "Back to Role Challenge" }).first().click();
    await page.waitForSelector('[data-testid="rc-champion-option"]', { timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.locator('[data-testid="role-mode-panel"]').scrollIntoViewIfNeeded();
    await shot(page, "mobile-7-hub-after-run");
    await ctx.close();
  }

  // ── 5. Daily mode still reaches the Daily Challenge route ─────────────────
  {
    const { ctx, page } = await open("free", DESKTOP, "/quiz");
    await waitHub(page);
    await page.getByRole("button", { name: /Play Daily|Continue Daily|View Today's Results|Continue \/ Review/ }).click();
    await page.waitForURL(/\/quiz\/daily-challenge/, { timeout: 30000 });
    await page.waitForTimeout(3000);
    await shot(page, "desktop-12-daily-route");
    record("Daily mode's button opens the Daily Challenge page", /daily-challenge/.test(page.url()), { url: page.url() });
    await ctx.close();
  }
} catch (e) {
  record("UNEXPECTED ERROR", false, { error: String(e?.stack ?? e).slice(0, 600) });
} finally {
  report.finishedAt = new Date().toISOString();
  report.passed = report.scenarios.filter((s) => s.result === "PASS").length;
  report.failed = report.scenarios.filter((s) => s.result === "FAIL").length;
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed} passed, ${report.failed} failed → ${OUT}/report.json`);
  await browser.close();
}
