/**
 * WP1 — GLYPH PRESS CONTINUITY, FIT, TARGET SIZE, LIFECYCLE AND LEAK, measured
 * on every animation frame, plus the capture matrix the handoff cites.
 *
 * Plays the real lifecycle in `/dev/word-puzzle` (the DEV-only lab, which
 * mounts the production CanonicalArena with a lab renderer; no backend
 * needed): open → type → drum tap → sounding (hit and miss) → cursor fixes →
 * Lock → locked → reveal (ink, verdict) → done → next round, sampling the
 * structural regions on every animation frame and DOM commit and holding
 * each to ≤1px of movement, in both motion modes, at desktop, short-desktop
 * and phone sizes.
 *
 * It also asserts: no page scroll, no overflow inside the question stage, no
 * socket clipped by the bed, every control ≥44px rendered with rendered size
 * equal to layout size (sockets are measured and reported separately), no
 * focus-induced scrolling, no console error or React warning, that the DOM
 * carries no answer before the reveal, that the settled reveal carries the
 * same information with and without motion, that Next works repeatedly, and
 * that a late "server" answer from the previous round cannot land on the next.
 *
 * It writes screenshots and a reveal frame series to WORD_PUZZLE_SHOTS
 * (default: <repo>/test-results/word-puzzle).
 *
 *   npx playwright test -c playwright.arena.config.ts word-puzzle-continuity
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.WORD_PUZZLE_SHOTS ?? path.resolve("test-results/word-puzzle");
mkdirSync(SHOTS, { recursive: true });

interface FixtureRound {
  id: string; answer: string; verified: boolean;
  source: { label: string; revisionId: number | null } | null;
}
const FIXTURE = JSON.parse(readFileSync(path.resolve("src/lib/word-puzzle/__fixtures__/wordPuzzleRounds.json"), "utf8")) as { rounds: FixtureRound[] };
const ROUNDS = FIXTURE.rounds;
const roundOf = (id: string) => ROUNDS.find((r) => r.id === id)!;

const VIEWPORTS = [
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1366x650", width: 1366, height: 650 },
  { name: "1280x600", width: 1280, height: 600 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x640", width: 360, height: 640 },
] as const;

/** The structural regions a player tracks. */
const REGIONS: Record<string, string> = {
  root: '[data-mig-primitive="glyph-press"]',
  head: '[data-part="head"]',
  forme: '[data-part="forme"]',
  block: '[data-testid="gp-block"]',
  plaque: '[data-part="plaque"]',
  drum: '[data-part="drum"]',
  plate: '[data-part="plate"]',
  lock: '[data-part="lock"]',
  status: '[data-part="status"]',
  stage: '[data-testid="ranked-question"]',
};
const BUDGET_PX = 1;

interface Frame { phase: string | null; stage: string | null; r: Record<string, [number, number, number, number]> }

function installSampler(regions: Record<string, string>) {
  const frames: Frame[] = [];
  let running = true;
  let paused = false;
  const sample = () => {
    if (!running || paused) return;
    const m = document.querySelector('[data-mig-primitive="glyph-press"]');
    const f: Frame = { phase: m?.getAttribute("data-phase") ?? null, stage: m?.getAttribute("data-reveal-stage") ?? null, r: {} };
    for (const [k, s] of Object.entries(regions)) {
      const e = document.querySelector(s);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      if (b.width || b.height) f.r[k] = [b.left + window.scrollX, b.top + window.scrollY, b.width, b.height];
    }
    frames.push(f);
  };
  const raf = () => { sample(); if (running) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const mo = new MutationObserver(sample);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const w = window as unknown as { __gpStop: () => Frame[]; __gpPause: (p: boolean) => void };
  w.__gpStop = () => { running = false; mo.disconnect(); return frames; };
  w.__gpPause = (p) => { paused = p; };
}

async function shot(page: Page, file: string) {
  await page.evaluate(() => (window as unknown as { __gpPause?: (p: boolean) => void }).__gpPause?.(true));
  await page.screenshot({ path: file });
  await page.waitForTimeout(30);
  await page.evaluate(() => (window as unknown as { __gpPause?: (p: boolean) => void }).__gpPause?.(false));
}

function worstMovement(frames: Frame[], skip: readonly string[] = []) {
  const worst: Record<string, { frame: number; max: number; from: string; to: string }> = {};
  for (let i = 1; i < frames.length; i++) {
    for (const k of Object.keys(frames[i].r)) {
      if (skip.includes(k)) continue;
      const a = frames[i - 1].r[k];
      const b = frames[i].r[k];
      if (!a || !b) continue;
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));
      if (!worst[k] || d > worst[k].max) worst[k] = { frame: i, max: d, from: `${frames[i - 1].phase}/${frames[i - 1].stage}`, to: `${frames[i].phase}/${frames[i].stage}` };
    }
  }
  return worst;
}

/**
 * Two app-shell notices that appear on every route of this app (checked against `/`, which has no
 * Glyph Press): React Router's v7 future-flag notice, and the browser's note that a webfont was
 * preloaded but unused on a lab page. Nothing else is filtered: a React `Warning:` still fails.
 */
const APP_SHELL_NOISE = [/React Router Future Flag Warning/, /was preloaded using link preload but not used/];

/** Console errors and warnings (React reports its warnings through console.error), and uncaught exceptions. */
function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    if (APP_SHELL_NOISE.some((p) => p.test(m.text()))) return;
    problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e)}`));
  return problems;
}

/**
 * Every control the player presses is ≥44×44 as RENDERED and nothing is shrunk by a transform
 * (the centred drum tile is scaled UP, never down). Sockets are measured separately: on a long
 * phrase at a phone's width the sockets are laid out smaller than 44px by the fit, so they report
 * their size and are held to the 24px WCAG 2.5.8 floor, not 44.
 */
async function assertTargets(page: Page, tag: string) {
  const m = await page.evaluate(() => {
    const root = document.querySelector('[data-mig-primitive="glyph-press"]')!;
    const size = (e: Element) => {
      const b = e.getBoundingClientRect();
      return { w: b.width, h: b.height, ow: (e as HTMLElement).offsetWidth, oh: (e as HTMLElement).offsetHeight };
    };
    const controls = [...root.querySelectorAll<HTMLElement>("button:not(.gp-cell), [data-tile]")]
      // The lock and its locked-state twin share a box; whichever is hidden is not a target.
      .filter((e) => e.getAttribute("data-shown") !== "false")
      .map((e) => ({ id: e.getAttribute("data-testid") ?? e.className, ...size(e) }));
    const sockets = [...root.querySelectorAll<HTMLElement>('.gp-cell[data-state]:not([data-state="engraved"])')].map((e) => size(e));
    const all = [...root.querySelectorAll<HTMLElement>(".gp-cell")].map((e) => size(e));
    return { controls, sockets, all };
  });
  // 0.1px of tolerance: a transformed tile reports 43.9998 for a 44px box (matrix float error).
  for (const c of m.controls) {
    expect(c.w, `${c.id} rendered width`).toBeGreaterThanOrEqual(43.9);
    expect(c.h, `${c.id} rendered height`).toBeGreaterThanOrEqual(43.9);
    expect(c.w - c.ow, `${c.id} not transform-shrunk`).toBeGreaterThanOrEqual(-1);
    expect(c.h - c.oh, `${c.id} not transform-shrunk`).toBeGreaterThanOrEqual(-1);
  }
  const side = m.all.length ? Math.round(Math.min(...m.all.map((s) => Math.min(s.w, s.h)))) : 0;
  const under44 = m.sockets.filter((s) => Math.min(s.w, s.h) < 43.5).length;
  console.log(`[targets ${tag}] controls=${m.controls.length} all ≥44; sockets=${m.all.length} side=${side}px; open sockets under 44px: ${under44}/${m.sockets.length}`);
  for (const s of m.all) expect(Math.min(s.w, s.h), "socket under the 24px floor").toBeGreaterThanOrEqual(24);
  return { side, under44, open: m.sockets.length };
}

async function assertNoOverflow(page: Page) {
  const o = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
    const forme = document.querySelector('[data-testid="gp-forme"]') as HTMLElement;
    const bed = document.querySelector('[data-testid="gp-bed"]') as HTMLElement;
    const de = document.documentElement;
    const b = bed.getBoundingClientRect();
    // Every socket, mark and break tick lies inside the bed: nothing is clipped by the forme's overflow.
    const clipped = [...document.querySelectorAll<HTMLElement>('.gp-cell, .gp-mark, .gp-break')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1;
    }).length;
    return {
      stageOverflow: stage.scrollHeight - stage.clientHeight, stageScrollTop: stage.scrollTop,
      formeOverflow: forme.getAttribute("data-overflow"), clipped,
      pageX: de.scrollWidth - de.clientWidth, pageY: window.scrollY,
    };
  });
  expect(o.stageOverflow, "no overflow inside the question stage").toBeLessThanOrEqual(0);
  expect(o.stageScrollTop).toBe(0);
  expect(o.formeOverflow, "the phrase fits the forme").toBe("false");
  expect(o.clipped, "no socket, mark or tick clipped by the bed").toBe(0);
  expect(o.pageX, "no horizontal page overflow").toBeLessThanOrEqual(0);
  expect(o.pageY, "no page scroll").toBe(0);
}

/**
 * Turns the drum with its ‹ › controls until the tile sits wholly inside the window, then returns it.
 * A tile outside the window is clipped, and a player would have to turn the drum to reach it too.
 */
async function reachTile(page: Page, glyph: string) {
  const tile = page.getByTestId(`gp-tile-${glyph}`);
  // The band turns by a 180ms transition; a rect read mid-turn is not where the tile will rest.
  const settled = () => page.waitForFunction(() => {
    const band = document.querySelector<HTMLElement>(".gp-drum-band");
    if (!band) return false;
    const want = band.style.transform.match(/translateX\((-?[\d.]+)px\)/);
    const got = new DOMMatrixReadOnly(getComputedStyle(band).transform);
    return !!want && Math.abs(got.m41 - parseFloat(want[1])) < 0.5;
  });
  for (let i = 0; i < 40; i++) {
    await settled();
    const side = await page.evaluate((g) => {
      const t = document.querySelector(`[data-testid="gp-tile-${g}"]`)!.getBoundingClientRect();
      const w = document.querySelector('[data-testid="gp-drum-window"]')!.getBoundingClientRect();
      // Clear of the rim fade as well as the window's edge.
      if (t.left < w.left + 12) return "prev";
      if (t.right > w.right - 12) return "next";
      return "in";
    }, glyph);
    if (side === "in") return tile;
    await page.getByTestId(side === "prev" ? "gp-drum-prev" : "gp-drum-next").click();
  }
  throw new Error(`the drum never brought ${glyph} into the window`);
}

/** Nothing scrolled: not the page, not the question stage, not the instrument. */
async function assertNotMoved(page: Page, what: string) {
  const s = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
    const root = document.querySelector('[data-mig-primitive="glyph-press"]') as HTMLElement;
    const forme = document.querySelector('[data-testid="gp-forme"]') as HTMLElement;
    const drum = document.querySelector('[data-testid="gp-drum-window"]') as HTMLElement;
    return [window.scrollX, window.scrollY, stage.scrollTop, stage.scrollLeft, root.scrollTop, root.scrollLeft, forme.scrollTop, forme.scrollLeft, drum.scrollTop, drum.scrollLeft];
  });
  expect(s, `${what}: no scroll anywhere`).toEqual(s.map(() => 0));
}

/** The answer is nowhere in the DOM: not in text, not in any attribute but a clue image's URL (reported). */
async function leakScan(page: Page, answer: string) {
  return page.evaluate((a) => {
    const squash = (s: string) => s.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    const needle = squash(a);
    const hits: { where: string; value: string }[] = [];
    const urlHits: { where: string; value: string }[] = [];
    const walk = document.querySelector('[data-testid="word-puzzle-lab"]')!;
    for (const e of [walk, ...walk.querySelectorAll("*")]) {
      for (const at of Array.from(e.attributes)) {
        if (!squash(at.value).includes(needle)) continue;
        const bucket = at.name === "src" || at.name === "style" || at.name === "href" ? urlHits : hits;
        bucket.push({ where: `${e.tagName.toLowerCase()}[${at.name}]`, value: at.value.slice(0, 120) });
      }
    }
    // Text, but not the lab's own dev chrome (its round id is the dev picker, never a player surface).
    const player = document.querySelector('[data-mig-primitive="glyph-press"]')!;
    if (squash(player.textContent ?? "").includes(needle)) hits.push({ where: "text", value: (player.textContent ?? "").slice(0, 120) });
    return { hits, urlHits };
  }, answer);
}

/** Everything a settled reveal tells the player. */
async function revealSnapshot(page: Page) {
  return page.evaluate(() => {
    const t = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? "";
    return {
      sockets: [...document.querySelectorAll<HTMLElement>(".gp-cell")].map((c) => ({
        state: c.dataset.state, origin: c.dataset.origin ?? null, result: c.dataset.result ?? null,
        face: c.querySelector(".gp-cell-face")?.textContent ?? "", struck: c.querySelector(".gp-cell-wrong")?.textContent ?? null,
        label: c.getAttribute("aria-label"),
      })),
      answer: t("gp-answer"), score: t("gp-score"), lockstate: t("gp-lockstate"), status: t("gp-status"), live: t("gp-live"),
      record: t("gp-sounding-record"), fill: t("gp-fill"),
      charges: document.querySelectorAll('[data-testid="gp-charges"] i[data-on="true"]').length,
      verdict: document.querySelector('[data-mig-primitive="glyph-press"]')?.getAttribute("data-verdict") ?? null,
      stage: document.querySelector('[data-mig-primitive="glyph-press"]')?.getAttribute("data-reveal-stage") ?? null,
      marks: [...document.querySelectorAll('[data-testid="gp-mark"]')].map((m) => m.textContent),
    };
  });
}

/** A round whose long phrase must break on a phone, so every viewport is tested at its hardest. */
const ROUND = "life-form-disintegration-ray";

for (const reduced of [false, true]) {
  for (const vp of VIEWPORTS) {
    test(`continuity ${vp.name}${reduced ? " reduced-motion" : ""}`, async ({ page }) => {
      const problems = collectProblems(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/dev/word-puzzle?round=${ROUND}${reduced ? "&motion=reduce" : ""}`);
      const root = page.locator('[data-mig-primitive="glyph-press"]');
      await expect(root).toHaveAttribute("data-phase", "open");
      await expect(page.getByTestId("gp-block")).toBeVisible();
      await page.waitForTimeout(300);
      await page.evaluate(installSampler, REGIONS);
      const tag = `${vp.name}${reduced ? "-reduced" : ""}`;

      expect((await leakScan(page, roundOf(ROUND).answer)).hits, "no answer in the open DOM").toEqual([]);
      await assertTargets(page, tag);
      await assertNoOverflow(page);
      await shot(page, path.join(SHOTS, `${tag}-1-open.png`));

      // Type on the physical keyboard: the cursor sits on the first blank socket.
      const forme = page.getByTestId("gp-forme");
      await forme.focus();
      await assertNotMoved(page, "focus on the forme");
      await page.keyboard.type("li");
      const fill0 = await page.getByTestId("gp-fill").textContent();
      // A tap on a drum tile sets the glyph under the cursor.
      await (await reachTile(page, "F")).click();
      const fill1 = await page.getByTestId("gp-fill").textContent();
      expect(fill1).not.toBe(fill0);
      await assertNotMoved(page, "typing and a tile tap");

      // A sounding that hits (E) and one that misses (X): the ledger grows, the drum shows it.
      await page.getByTestId("gp-sound").click();
      await expect(root).toHaveAttribute("data-armed", "true");
      await page.keyboard.press("e");
      await expect(page.getByTestId("gp-tile-E")).toHaveAttribute("data-state", "sounded", { timeout: 3000 });
      await page.getByTestId("gp-sound").click();
      await (await reachTile(page, "X")).click();
      await expect(page.getByTestId("gp-tile-X")).toHaveAttribute("data-state", "tarnished", { timeout: 3000 });
      await expect(page.getByTestId("gp-sounding-record")).toHaveText(/E ×\d+ · X —/);
      expect((await leakScan(page, roundOf(ROUND).answer)).hits, "no answer after soundings").toEqual([]);
      await shot(page, path.join(SHOTS, `${tag}-2-sounded.png`));

      // Revision: arrows and Backspace on the forme; the drum's keys.
      await forme.focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Backspace");
      await page.keyboard.type("z");
      await page.getByTestId("gp-drum-window").focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      for (const id of ["gp-forme", "gp-drum-window", "gp-drum-prev", "gp-drum-next", "gp-sound", "gp-lock"]) {
        await page.getByTestId(id).focus();
        await assertNotMoved(page, `focus on ${id}`);
      }
      // Make one of the player's glyphs the right one, so the reveal shows all five kinds of result.
      const truth = [...roundOf(ROUND).answer.toUpperCase()].filter((c) => /[A-Z]/.test(c));
      const lastSet = await page.evaluate(() => {
        const cells = [...document.querySelectorAll(".gp-cell")];
        for (let i = cells.length - 1; i >= 0; i--) if (cells[i].getAttribute("data-state") === "set") return i;
        return -1;
      });
      expect(lastSet, "the player has set at least one glyph").toBeGreaterThanOrEqual(0);
      await page.getByTestId(`gp-cell-${lastSet}`).click();
      await page.keyboard.type(truth[lastSet].toLowerCase());
      await expect(page.getByTestId(`gp-face-${lastSet}`)).toHaveText(truth[lastSet]);
      await shot(page, path.join(SHOTS, `${tag}-3-set.png`));
      await assertTargets(page, `${tag} mid-lifecycle`);

      // Lock (with blanks: the reveal must show what was missing).
      await page.getByTestId("gp-lock").click();
      await expect(root).toHaveAttribute("data-phase", "locked");
      await shot(page, path.join(SHOTS, `${tag}-4-locked.png`));

      // Reveal: a frame series through the choreography.
      await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 5000 });
      if (!reduced) {
        // The completion callback is the end of the choreography, never its start: while the press is
        // still inking or turning the plaque, the host has not been told it is done.
        const stages = new Set<string>();
        for (let i = 0; i < 8; i++) {
          const s = await page.evaluate(() => ({
            stage: document.querySelector('[data-mig-primitive="glyph-press"]')?.getAttribute("data-reveal-stage") ?? "none",
            done: document.querySelector('[data-testid="lab-reveal-done"]')?.getAttribute("data-on") ?? "none",
          }));
          stages.add(s.stage);
          if (s.stage !== "done") expect(s.done, `reveal-complete fired while the reveal was at "${s.stage}"`).toBe("false");
          await page.screenshot({ path: path.join(SHOTS, `${tag}-5-reveal-${i}.png`) });
          await page.waitForTimeout(140);
        }
        expect(stages.has("ink") || stages.has("verdict"), `the choreography ran (saw ${[...stages]})`).toBe(true);
      }
      await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 5000 });
      await expect(page.getByTestId("lab-reveal-done")).toHaveAttribute("data-on", "true");
      await expect(page.getByTestId("gp-proof")).toHaveAttribute("data-shown", "true");
      await expect(page.getByTestId("gp-answer")).toHaveText("Life Form Disintegration Ray");
      // Every socket printed, and the kinds of result the brief asks the instrument to show are all present.
      const results = await page.evaluate(() => [...document.querySelectorAll("[data-result]")].map((e) => e.getAttribute("data-result")));
      expect(results.length).toBe(25);
      expect(new Set(results)).toEqual(new Set(["given", "sounded", "right", "wrong", "missing"]));
      await shot(page, path.join(SHOTS, `${tag}-6-revealed.png`));
      await assertNoOverflow(page);

      // The round itself — one lifecycle, block included — never moved a structural region beyond the budget.
      const roundFrames = await page.evaluate(() => (window as unknown as { __gpStop: () => Frame[] }).__gpStop());
      expect(roundFrames.length).toBeGreaterThan(30);
      expect([...new Set(roundFrames.map((f) => f.phase))]).toEqual(expect.arrayContaining(["open", "locked", "revealed"]));
      const worstRound = worstMovement(roundFrames);
      const roundReport = Object.entries(worstRound).map(([k, w]) => `${k}: ${w.max.toFixed(2)}px @${w.frame} ${w.from}→${w.to}`).join("\n");
      console.log(`[continuity ${tag}] frames=${roundFrames.length}\n${roundReport}`);
      for (const [k, w] of Object.entries(worstRound)) {
        expect(w.max, `${k} moved ${w.max.toFixed(2)}px (${w.from} → ${w.to})\n${roundReport}`).toBeLessThanOrEqual(BUDGET_PX);
      }

      // Next round: the instrument stays where it was (the new round's block may re-flow; nothing else may move).
      await page.evaluate(installSampler, REGIONS);
      await page.getByTestId("lab-next").click();
      await expect(root).toHaveAttribute("data-phase", "open");
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => document.querySelectorAll("[data-result], [data-verdict]").length), "next round carries no result").toBe(0);
      await shot(page, path.join(SHOTS, `${tag}-7-next.png`));
      const nextFrames = await page.evaluate(() => (window as unknown as { __gpStop: () => Frame[] }).__gpStop());
      const worstNext = worstMovement(nextFrames, ["block"]);
      for (const [k, w] of Object.entries(worstNext)) {
        expect(w.max, `next round: ${k} moved ${w.max.toFixed(2)}px`).toBeLessThanOrEqual(BUDGET_PX);
      }
      expect(problems, "no console errors or React warnings").toEqual([]);
    });
  }
}

test("a solved lock prints every socket gold and the plaque names the answer", async ({ page }) => {
  const problems = collectProblems(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/dev/word-puzzle?round=rabadons-deathcap&state=revealed-right");
  const root = page.locator('[data-mig-primitive="glyph-press"]');
  await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
  await expect(root).toHaveAttribute("data-verdict", "solved");
  const results = await page.evaluate(() => [...document.querySelectorAll("[data-result]")].map((e) => e.getAttribute("data-result")));
  expect(results.every((r) => r === "right" || r === "given")).toBe(true);
  await expect(page.getByTestId("gp-answer")).toHaveText("Rabadon's Deathcap");
  await expect(page.getByTestId("gp-lockstate")).toHaveText("Solved");
  await page.screenshot({ path: path.join(SHOTS, "1600x900-solved.png") });
  expect(problems).toEqual([]);
});

test("every round fits the forme, unclipped, at every short and narrow size", async ({ page }) => {
  const problems = collectProblems(page);
  for (const vp of [{ w: 360, h: 640 }, { w: 390, h: 844 }, { w: 1280, h: 600 }, { w: 1366, h: 650 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    for (const r of ROUNDS) {
      console.log(`[fit] ${r.id}@${vp.w}x${vp.h}`);
      await page.goto(`/dev/word-puzzle?round=${r.id}`);
      try {
        // Dev-server cold module loads under machine load have exceeded 5s once in this suite; 15s is the ceiling.
        await expect(page.getByTestId("gp-block"), `${r.id}@${vp.w}x${vp.h} block`).toBeVisible({ timeout: 15_000 });
      } catch (e) {
        const d = await page.evaluate(() => ({
          url: location.href, text: document.body.innerText.slice(0, 300),
          bed: document.querySelector('[data-testid="gp-bed"]')?.getBoundingClientRect().toJSON() ?? null,
          root: document.querySelector("[data-mig-primitive]")?.outerHTML.slice(0, 200) ?? null,
        })).catch((err) => ({ evalFailed: String(err) }));
        console.log(`[fit-diag] ${JSON.stringify(d)} problems=${JSON.stringify(problems)}`);
        await page.screenshot({ path: path.join(SHOTS, `diag-${r.id}-${vp.w}x${vp.h}.png`) }).catch(() => {});
        throw e;
      }
      await expect(page.getByTestId("gp-forme"), `${r.id}@${vp.w}x${vp.h} fits`).toHaveAttribute("data-overflow", "false");
      await assertNoOverflow(page);
      const t = await assertTargets(page, `${r.id}@${vp.w}x${vp.h}`);
      expect(t.side).toBeGreaterThanOrEqual(24);
      await page.screenshot({ path: path.join(SHOTS, `${vp.w}x${vp.h}-round-${r.id}.png`) });
    }
  }
  expect(problems).toEqual([]);
});

test("Next works repeatedly, open or revealed, and each round starts clean", async ({ page }) => {
  const problems = collectProblems(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dev/word-puzzle");
  const root = page.locator('[data-mig-primitive="glyph-press"]');
  await expect(root).toHaveAttribute("data-phase", "open");
  const seen: string[] = [];
  for (let i = 0; i < ROUNDS.length * 1.5; i++) {
    const id = (await page.getByTestId("lab-round").textContent())!;
    seen.push(id);
    await expect(page.getByTestId("gp-fill")).toHaveText(/^0\//);
    await expect(page.getByTestId("gp-sounding-record")).toHaveText("none yet");
    expect(await page.evaluate(() => document.querySelectorAll("[data-result], [data-verdict]").length)).toBe(0);
    await assertNoOverflow(page);
    await page.getByTestId("gp-forme").focus();
    await page.keyboard.type("q");
    if (i % 3 === 2) {
      await page.getByTestId("gp-lock").click();
      await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
    }
    await page.getByTestId("lab-next").click();
    await expect(page.getByTestId("lab-round")).not.toHaveText(id);
    await expect(root).toHaveAttribute("data-phase", "open");
    await expect(page.getByTestId("lab-reveal-done")).toHaveAttribute("data-on", "false");
  }
  // Every round was visited, in a stable order, and the order wrapped.
  expect(new Set(seen).size).toBe(ROUNDS.length);
  expect(seen[0]).toBe(seen[ROUNDS.length]);
  expect(problems).toEqual([]);
});

test("a late answer from the previous round never lands on the next (sounding and Lock)", async ({ page }) => {
  const problems = collectProblems(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dev/word-puzzle?round=heimerdinger");
  const root = page.locator('[data-mig-primitive="glyph-press"]');
  await expect(root).toHaveAttribute("data-phase", "open");
  // Sound a glyph and press Next in the same task, well inside the stand-in server's latency.
  const inFlight = await page.evaluate(async () => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const commit = () => new Promise((r) => setTimeout(r, 0));
    q("gp-sound").click();
    await commit(); // React commits "armed" before the key arrives, as it does between a click and a keypress
    q("gp-forme").dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true }));
    await commit();
    const state = q("gp-tile-E").getAttribute("data-state");
    q("lab-next").click();
    return state;
  });
  expect(inFlight, "the sounding was in flight when Next was pressed").toBe("pending");
  await page.waitForTimeout(900);
  await expect(page.getByTestId("gp-sounding-record")).toHaveText("none yet");
  await expect(page.getByTestId("gp-charges").locator('i[data-on="true"]')).toHaveCount(3);
  // Lock and press Next in the same task.
  await page.evaluate(() => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    q("gp-lock").click();
    q("lab-next").click();
  });
  await page.waitForTimeout(1200);
  await expect(root).toHaveAttribute("data-phase", "open");
  expect(await page.evaluate(() => document.querySelectorAll("[data-result], [data-verdict]").length)).toBe(0);
  await expect(page.getByTestId("lab-reveal-done")).toHaveAttribute("data-on", "false");
  expect(problems).toEqual([]);
});

test("repeated letters and punctuation behave: a sounding fills every instance, marks are never sockets", async ({ page }) => {
  const problems = collectProblems(page);
  await page.setViewportSize({ width: 1280, height: 720 });

  // Repeated letters. Heimerdinger: E×3, I×2, R×2. Sound one that was not given.
  await page.goto("/dev/word-puzzle?round=heimerdinger");
  const root = page.locator('[data-mig-primitive="glyph-press"]');
  await expect(root).toHaveAttribute("data-phase", "open");
  const answer = roundOf("heimerdinger").answer.toUpperCase();
  const engravedAtStart = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.gp-cell[data-state="engraved"] .gp-cell-face')].map((e) => e.textContent!));
  const candidate = [...new Set(answer)].find((g) => answer.split(g).length - 1 >= 2 && !engravedAtStart.includes(g))!;
  const occurrences = answer.split(candidate).length - 1;
  await page.getByTestId("gp-sound").click();
  await page.keyboard.press(candidate.toLowerCase());
  await expect(page.getByTestId(`gp-tile-${candidate}`)).toHaveAttribute("data-state", "sounded", { timeout: 3000 });
  await expect(page.getByTestId("gp-sounding-record")).toHaveText(`${candidate} ×${occurrences}`);
  const sounded = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.gp-cell[data-origin="sounded"] .gp-cell-face')].map((e) => e.textContent));
  expect(sounded).toEqual(Array.from({ length: occurrences }, () => candidate));
  // A sounded glyph is fully placed: typing it again sets nothing.
  const fillBefore = await page.getByTestId("gp-fill").textContent();
  await page.getByTestId("gp-forme").focus();
  await page.keyboard.press(candidate.toLowerCase());
  expect(await page.getByTestId("gp-fill").textContent()).toBe(fillBefore);
  // The same free glyph may be set in two sockets.
  const free = [..."QJZXKV"].find((g) => !answer.includes(g) && !engravedAtStart.includes(g))!;
  await page.keyboard.type(free + free);
  const faces = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.gp-cell[data-state="set"] .gp-cell-face')].map((e) => e.textContent));
  expect(faces).toEqual([free, free]);

  // Punctuation. Kai'Sa has an apostrophe; Command: Shockwave has a colon. Marks are drawn, never sockets, never typed.
  for (const [id, mark, glyphs] of [["kaisa", "'", 5], ["command-shockwave", ":", 16]] as const) {
    await page.goto(`/dev/word-puzzle?round=${id}`);
    await expect(root).toHaveAttribute("data-phase", "open");
    expect(await page.getByTestId("gp-mark").allTextContents()).toEqual([mark]);
    expect(await page.locator(".gp-cell").count()).toBe(glyphs);
    await page.getByTestId("gp-forme").focus();
    const f0 = await page.getByTestId("gp-fill").textContent();
    await page.keyboard.press(mark);
    await page.keyboard.press(" ");
    expect(await page.getByTestId("gp-fill").textContent(), `${mark} sets nothing`).toBe(f0);
    // The cursor walks the sockets and steps over the mark without stopping on it.
    await page.keyboard.press("End");
    await page.keyboard.press("Home");
    const cursor = await page.evaluate(() => [...document.querySelectorAll(".gp-cell")].findIndex((c) => c.getAttribute("data-cursor") === "true"));
    expect(cursor).toBeGreaterThanOrEqual(0);
    // The mark survives the reveal in place.
    await page.getByTestId("gp-lock").click();
    await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
    expect(await page.getByTestId("gp-mark").allTextContents()).toEqual([mark]);
    await expect(page.getByTestId("gp-answer")).toHaveText(roundOf(id).answer);
  }
  expect(problems).toEqual([]);
});

test("reveal labels, scores and sources are correct for each verdict, verified or dev-only", async ({ page }) => {
  const problems = collectProblems(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const word: Record<string, string> = { solved: "Solved", partial: "Partly set", missed: "Missed" };
  for (const id of ["rabadons-deathcap", "life-form-disintegration-ray", "shurima"]) {
    const r = roundOf(id);
    for (const state of ["revealed-right", "revealed-wrong", "revealed-partial"]) {
      await page.goto(`/dev/word-puzzle?round=${id}&state=${state}`);
      const root = page.locator('[data-mig-primitive="glyph-press"]');
      await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
      const verdict = (await root.getAttribute("data-verdict"))!;
      await expect(page.getByTestId("gp-lockstate")).toHaveText(word[verdict]);
      await expect(page.getByTestId("gp-answer")).toHaveText(r.answer);
      const score = (await page.getByTestId("gp-score").textContent())!;
      const m = score.match(/^(\d+) of (\d+) glyphs? set right|^Every glyph was given/);
      expect(m, `score "${score}"`).not.toBeNull();
      if (state === "revealed-right") expect(verdict).toBe("solved");
      else expect(verdict).not.toBe("solved");
      // Source line.
      const footnote = r.source ? `${r.source.label}${r.source.revisionId ? ` · revision ${r.source.revisionId}` : ""}` : "Unverified demonstration content — development only.";
      await expect(page.getByTestId("gp-status")).toHaveText(footnote);
      // The dev-only round is labelled everywhere a player or a tester would look.
      if (!r.verified) {
        await expect(page.getByTestId("lab-unverified")).toBeVisible();
        await expect(page.getByTestId("gp-forme").locator("xpath=ancestor::*[@data-mig-primitive]").getByText(/dev-only/i).first()).toBeVisible();
      } else {
        await expect(page.getByTestId("lab-unverified")).toHaveCount(0);
      }
      // The live region announces the result for assistive tech.
      await expect(page.getByTestId("gp-live")).toHaveText(new RegExp(`^${word[verdict]}\\. .+ The answer is ${r.answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.$`));
    }
  }
  expect(problems).toEqual([]);
});

test("reduced motion tells the player exactly what motion does, once settled", async ({ page }) => {
  const problems = collectProblems(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const snapshots: Record<string, Awaited<ReturnType<typeof revealSnapshot>>> = {};
  for (const reduced of [false, true]) {
    // The same seed gives the same givens, so the same inputs make the same round in both modes.
    await page.goto(`/dev/word-puzzle?round=kaisa&seed=parity${reduced ? "&motion=reduce" : ""}`);
    const root = page.locator('[data-mig-primitive="glyph-press"]');
    await expect(root).toHaveAttribute("data-phase", "open");
    await expect(root).toHaveAttribute("data-reduced", reduced ? "true" : "false");
    // Sound A (hit), sound Q (miss), fill all but one open socket with fixed wrong glyphs.
    await page.getByTestId("gp-sound").click();
    await page.keyboard.press("a");
    await expect(page.getByTestId("gp-tile-A")).toHaveAttribute("data-state", "sounded", { timeout: 3000 });
    await page.getByTestId("gp-sound").click();
    await page.keyboard.press("q");
    await expect(page.getByTestId("gp-tile-Q")).toHaveAttribute("data-state", "tarnished", { timeout: 3000 });
    const open = await page.evaluate(() => document.querySelectorAll('.gp-cell:not([data-state="engraved"])').length);
    await page.getByTestId("gp-forme").focus();
    await page.keyboard.press("Home");
    await page.keyboard.type("ZXJ".slice(0, Math.max(0, open - 1)));
    await page.getByTestId("gp-lock").click();
    await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
    await expect(page.getByTestId("lab-reveal-done")).toHaveAttribute("data-on", "true");
    snapshots[reduced ? "reduced" : "motion"] = await revealSnapshot(page);
  }
  expect(snapshots.reduced).toEqual(snapshots.motion);
  expect(snapshots.motion.sockets.length).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});

test("the open DOM never carries the answer, in text or in any attribute, for any round", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const urlBorne: string[] = [];
  for (const r of ROUNDS) {
    await page.goto(`/dev/word-puzzle?round=${r.id}`);
    await expect(page.getByTestId("gp-block")).toBeVisible();
    // Open, then armed with a sounding in flight, then locked: the answer is still not in the DOM.
    const open = await leakScan(page, r.answer);
    expect(open.hits, `${r.id}: open`).toEqual([]);
    await page.getByTestId("gp-sound").click();
    await page.keyboard.press("e");
    await page.waitForTimeout(400);
    expect((await leakScan(page, r.answer)).hits, `${r.id}: after a sounding`).toEqual([]);
    await page.getByTestId("gp-lock").click();
    await expect(page.locator('[data-mig-primitive="glyph-press"]')).toHaveAttribute("data-phase", "locked");
    expect((await leakScan(page, r.answer)).hits, `${r.id}: locked`).toEqual([]);
    if (open.urlHits.length) urlBorne.push(`${r.id}: ${open.urlHits.map((h) => `${h.where}=${h.value}`).join(" | ")}`);
  }
  // A champion-name round's clue image is hosted at a path that spells the champion. That is the clue's
  // identity, not a contract field, and it is reported (never asserted away) for the production seam.
  console.log(`[leak] URL-borne spellings of the answer (clue image paths):\n${urlBorne.join("\n") || "(none)"}`);
});

test.describe("touch", () => {
  test.use({ hasTouch: true });
  for (const vp of [{ w: 390, h: 844 }, { w: 360, h: 640 }]) {
    test(`a phone plays the whole press by touch at ${vp.w}x${vp.h}`, async ({ page }) => {
      const problems = collectProblems(page);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto("/dev/word-puzzle?round=infinity-edge");
      const root = page.locator('[data-mig-primitive="glyph-press"]');
      await expect(root).toHaveAttribute("data-phase", "open");
      const fill = async () => (await page.getByTestId("gp-fill").textContent())!;

      // Tap a tile to set a glyph; tap a socket to move the cursor; tap ⌫ to take one back.
      const f0 = await fill();
      await (await reachTile(page, "A")).tap();
      expect(await fill()).not.toBe(f0);
      await (await reachTile(page, "clear")).tap();
      expect(await fill()).toBe(f0);
      const target = await page.evaluate(() => {
        const open = [...document.querySelectorAll<HTMLElement>('.gp-cell:not([data-state="engraved"])')];
        const c = open[open.length - 1];
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, index: [...document.querySelectorAll(".gp-cell")].indexOf(c) };
      });
      await page.touchscreen.tap(target.x, target.y);
      await expect(page.getByTestId(`gp-cell-${target.index}`)).toHaveAttribute("data-cursor", "true");

      // Drag the drum with a finger: it turns, and it sets nothing.
      const cdp = await page.context().newCDPSession(page);
      const win = await page.getByTestId("gp-drum-window").boundingBox();
      const y = win!.y + win!.height / 2;
      const centred = () => page.locator('[data-tile][data-centred="true"]').getAttribute("data-tile");
      const before = await centred();
      const fillBefore = await fill();
      const x0 = win!.x + win!.width * 0.8;
      // A finger moves at a finger's pace. Eight zero-delay moves read to Chrome as a fling, and Chrome
      // then swallows the NEXT tap (it arrives with pointerdown/up and no click) — a harness artifact.
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
      for (let i = 1; i <= 8; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 - i * 14, y }] });
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(120);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(centred).not.toBe(before);
      await page.waitForTimeout(300);
      expect(await fill()).toBe(fillBefore);

      // Arm a sounding and spend it by tapping a tile; then lock by tapping.
      const probe = () => page.evaluate(() => {
        const e = document.querySelector<HTMLElement>('[data-testid="gp-sound"]')!;
        const b = e.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        const drum = document.querySelector<HTMLElement>('[data-testid="gp-drum-window"]')!;
        return {
          rect: [b.left, b.top, b.width, b.height].map(Math.round), hit: hit?.getAttribute("data-testid") ?? hit?.className ?? null,
          disabled: (e as HTMLButtonElement).disabled, pressed: e.getAttribute("aria-pressed"), dragging: drum.dataset.dragging,
          armed: document.querySelector("[data-mig-primitive]")!.getAttribute("data-armed"),
          pending: [...document.querySelectorAll('[data-tile][data-state="pending"]')].map((t) => (t as HTMLElement).dataset.tile),
          soundingRecord: document.querySelector('[data-testid="gp-sounding-record"]')?.textContent,
        };
      });
      const soundBefore = await probe();
      await page.evaluate(() => {
        const w = window as unknown as { __ev: string[] };
        w.__ev = [];
        for (const t of ["pointerdown", "pointerup", "pointercancel", "touchstart", "touchend", "click"]) {
          document.addEventListener(t, (e) => w.__ev.push(`${t}:${(e.target as HTMLElement).closest?.("[data-testid]")?.getAttribute("data-testid") ?? (e.target as Element).nodeName}`), true);
        }
      });
      await page.getByTestId("gp-sound").tap();
      try {
        await expect(root).toHaveAttribute("data-armed", "true", { timeout: 3000 });
      } catch (e) {
        const ev = await page.evaluate(() => (window as unknown as { __ev: string[] }).__ev);
        const cue = await page.getByTestId("lab-cue").getAttribute("data-cue");
        console.log(`[touch-diag ${vp.w}x${vp.h}] events=${JSON.stringify(ev)} cue=${cue} before=${JSON.stringify(soundBefore)} after=${JSON.stringify(await probe())}`);
        throw e;
      }
      await (await reachTile(page, "E")).tap();
      await expect(page.getByTestId("gp-tile-E")).toHaveAttribute("data-state", /sounded|tarnished|pending/, { timeout: 3000 });
      await assertNotMoved(page, "touch play");
      await assertTargets(page, `touch ${vp.w}x${vp.h}`);
      await page.getByTestId("gp-lock").tap();
      await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
      await assertNoOverflow(page);
      await page.screenshot({ path: path.join(SHOTS, `touch-${vp.w}x${vp.h}-revealed.png`) });
      expect(problems).toEqual([]);
    });
  }
});
