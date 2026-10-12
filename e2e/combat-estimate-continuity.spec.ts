/**
 * CE1 — COMBAT ESTIMATE CONTINUITY, FIT, TARGET SIZE AND ANSWER SAFETY,
 * measured on every animation frame, plus the capture matrix the handoff cites.
 *
 * Plays the real lifecycle in `/dev/combat-estimate` (the DEV-only lab, which
 * mounts the production CanonicalArena with a lab renderer; no backend
 * needed): open → press the coarse beam → drag the fine beam → vernier keys →
 * keyboard → Lock (twice: the second must not submit) → locked → reveal
 * (charge, descend, band, ledger) → done → next round → a second round locked
 * and revealed, sampling the structural regions on every animation frame and
 * DOM commit and holding each to ≤1px of movement, in both motion modes, at
 * desktop, short-desktop and phone sizes. The poises, the truth pointer and
 * the band are excluded on purpose: they move by design.
 *
 * It also asserts: no page scroll, no overflow inside the question stage,
 * every control ≥44px rendered with rendered size equal to layout size, and —
 * reading the answer from the frozen capture on the Node side — that the DOM
 * carries neither the answer nor any verdict, truth or band before the reveal,
 * in text or in attributes.
 *
 * It writes screenshots and a reveal frame series to COMBAT_ESTIMATE_SHOTS
 * (default: <repo>/test-results/combat-estimate).
 *
 *   npx playwright test -c playwright.arena.config.ts combat-estimate-continuity
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Node's ESM loader wants an import attribute for JSON; read the frozen capture the plain way.
const capture = JSON.parse(readFileSync(path.resolve("src/lib/combat-estimate/__fixtures__/combatAuthorityCapture.json"), "utf8")) as unknown;

test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.COMBAT_ESTIMATE_SHOTS ?? path.resolve("test-results/combat-estimate");
mkdirSync(SHOTS, { recursive: true });

const FIRST = "jarvan-q-r3-l5-dirk-vs-olaf";
const answerOf = (id: string) => {
  const s = (capture as { scenarios: { id: string; answer: { whole: number; exact: number }; result: Record<string, number> }[] }).scenarios.find((x) => x.id === id);
  if (!s) throw new Error(id);
  return s;
};

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
  root: '[data-mig-primitive="estimate"]',
  board: '[data-testid="ce-board"]',
  head: '[data-part="head"]',
  instrument: '[data-part="board"]',
  plaque: '[data-part="plaque"]',
  coarse: '[data-part="coarse"]',
  fine: '[data-part="fine"]',
  plate: '[data-part="plate"]',
  lock: '[data-part="lock"]',
  ledger: '[data-part="ledger"]',
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
    const m = document.querySelector('[data-mig-primitive="estimate"]');
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
  const w = window as unknown as { __ceStop: () => Frame[]; __cePause: (p: boolean) => void };
  w.__ceStop = () => { running = false; mo.disconnect(); return frames; };
  w.__cePause = (p) => { paused = p; };
}

async function shot(page: Page, file: string) {
  await page.evaluate(() => (window as unknown as { __cePause?: (p: boolean) => void }).__cePause?.(true));
  await page.screenshot({ path: file });
  await page.waitForTimeout(30);
  await page.evaluate(() => (window as unknown as { __cePause?: (p: boolean) => void }).__cePause?.(false));
}

function worstMovement(frames: Frame[]) {
  const worst: Record<string, { frame: number; max: number; from: string; to: string }> = {};
  for (let i = 1; i < frames.length; i++) {
    for (const k of Object.keys(frames[i].r)) {
      const a = frames[i - 1].r[k];
      const b = frames[i].r[k];
      if (!a || !b) continue;
      const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));
      if (!worst[k] || d > worst[k].max) worst[k] = { frame: i, max: d, from: `${frames[i - 1].phase}/${frames[i - 1].stage}`, to: `${frames[i].phase}/${frames[i].stage}` };
    }
  }
  return worst;
}

const CONTROLS = ["estimate-minus-10", "estimate-minus-1", "estimate-plus-1", "estimate-plus-10", "estimate-lock"];

async function assertTargets(page: Page) {
  for (const id of CONTROLS) {
    const el = page.getByTestId(id);
    const m = await el.evaluate((e) => {
      const b = e.getBoundingClientRect();
      return { w: b.width, h: b.height, ow: (e as HTMLElement).offsetWidth, oh: (e as HTMLElement).offsetHeight };
    });
    expect(m.w, `${id} rendered width`).toBeGreaterThanOrEqual(44);
    expect(m.h, `${id} rendered height`).toBeGreaterThanOrEqual(44);
    expect(Math.abs(m.w - m.ow), `${id} not transform-scaled`).toBeLessThanOrEqual(1);
    expect(Math.abs(m.h - m.oh), `${id} not transform-scaled`).toBeLessThanOrEqual(1);
  }
  // The beams themselves are the pointer targets: each rail's HIT box (its row plus the 6px it reaches above and
  // below) is at least 44px tall — proved by hit-testing, not by reading a style — and the coarse poise is 44px.
  for (const id of ["estimate-coarse-rail", "estimate-fine-rail"]) {
    const hit = await page.getByTestId(id).evaluate((e) => {
      const b = e.getBoundingClientRect();
      const x = b.left + b.width / 2;
      let top = b.top; while (top > b.top - 20 && e.contains(document.elementFromPoint(x, top - 1))) top -= 1;
      let bottom = b.bottom; while (bottom < b.bottom + 20 && e.contains(document.elementFromPoint(x, bottom + 1))) bottom += 1;
      return bottom - top;
    });
    expect(hit, `${id} hit height`).toBeGreaterThanOrEqual(44);
  }
  const poise = await page.getByTestId("estimate-poise").evaluate((e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; });
  expect(poise[1]).toBeGreaterThanOrEqual(44);
}

async function assertNoOverflow(page: Page) {
  const o = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
    const de = document.documentElement;
    return {
      stageOverflow: stage.scrollHeight - stage.clientHeight, stageScrollTop: stage.scrollTop,
      pageX: de.scrollWidth - de.clientWidth, pageY: window.scrollY,
    };
  });
  expect(o.stageOverflow, "no overflow inside the question stage").toBeLessThanOrEqual(0);
  expect(o.stageScrollTop).toBe(0);
  expect(o.pageX, "no horizontal page overflow").toBeLessThanOrEqual(0);
  expect(o.pageY, "no page scroll").toBe(0);
}

/** The pre-reveal answer-leak scan: text, attributes, and the reveal's own markers. */
async function assertNoLeak(page: Page, roundId: string) {
  const a = answerOf(roundId);
  const leak = await page.evaluate(({ whole, exact, effective, multiplier }) => {
    const stage = document.querySelector('[data-testid="ranked-question"]') as HTMLElement;
    const html = stage.outerHTML;
    const text = stage.innerText;
    const attrs: string[] = [];
    stage.querySelectorAll("*").forEach((el) => { for (const at of Array.from(el.attributes)) attrs.push(`${at.name}=${at.value}`); });
    const token = (hay: string, n: string) => new RegExp(`(^|[^\\d.])${n}([^\\d]|$)`).test(hay);
    return {
      verdicts: document.querySelectorAll("[data-verdict]").length,
      markers: document.querySelectorAll('[data-testid="estimate-truth"], [data-testid="estimate-band"], [data-reveal-stage]').length,
      wholeInText: token(text, String(whole)),
      wholeInAttrs: attrs.some((x) => token(x, String(whole))),
      exactInHtml: html.includes(String(exact)) || html.includes(exact.toFixed(4)),
      effectiveInHtml: html.includes(String(effective)) || html.includes(effective.toFixed(3)),
      multiplierInHtml: html.includes(multiplier.toFixed(4)),
      truthValue: document.querySelector('[data-testid="estimate-truth-value"]')?.textContent,
    };
  }, { whole: a.answer.whole, exact: a.answer.exact, effective: a.result.effective_armor, multiplier: a.result.mitigation_multiplier });
  expect(leak.verdicts, "no verdict before the reveal").toBe(0);
  expect(leak.markers, "no truth / band / stage before the reveal").toBe(0);
  expect(leak.wholeInText, "the answer is not in the stage's text").toBe(false);
  expect(leak.wholeInAttrs, "the answer is not in any attribute").toBe(false);
  expect(leak.exactInHtml, "the exact value is not in the DOM").toBe(false);
  expect(leak.effectiveInHtml, "effective armor is not in the DOM").toBe(false);
  expect(leak.multiplierInHtml, "the multiplier is not in the DOM").toBe(false);
  expect(leak.truthValue).toBe("—");
}

for (const reduced of [false, true]) {
  for (const vp of VIEWPORTS) {
    test(`continuity ${vp.name}${reduced ? " reduced-motion" : ""}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/dev/combat-estimate?round=${FIRST}${reduced ? "&motion=reduce" : ""}`);
      const root = page.locator('[data-mig-primitive="estimate"]');
      await expect(root).toHaveAttribute("data-phase", "open");
      await page.waitForTimeout(400);
      await page.evaluate(installSampler, REGIONS);
      const tag = `${vp.name}${reduced ? "-reduced" : ""}`;

      await assertNoLeak(page, FIRST);
      await assertTargets(page);
      await assertNoOverflow(page);
      // Composition facts for the handoff: the stage body, the instrument, and the beams' resolution.
      const comp = await page.evaluate(() => {
        const r = (sel: string) => { const b = document.querySelector(sel)!.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
        const coarse = document.querySelector('[data-testid="estimate-coarse-rail"]')!.getBoundingClientRect().width;
        const fine = document.querySelector('[data-testid="estimate-fine-rail"]')!.getBoundingClientRect().width;
        const max = Number(document.querySelector('[data-testid="estimate-board"]')!.getAttribute("aria-valuemax")) + 1;
        return { stage: r('[data-testid="ranked-question"]'), ce: r('[data-testid="ce-stage"]'), board: r('[data-testid="ce-board"]'),
          instrument: r('[data-part="board"]'), ledger: r('[data-part="ledger"]'), pxPerNotch: +((coarse / max) * 50).toFixed(1), pxPerUnit: +(coarse / max).toFixed(2), pxPerFine: +(fine / 49).toFixed(1) };
      });
      console.log(`[composition ${tag}] ${JSON.stringify(comp)}`);
      await shot(page, path.join(SHOTS, `${tag}-1-open.png`));

      // Press the coarse beam: the heavy poise is there. Then drag the fine beam.
      const coarse = page.getByTestId("estimate-coarse-rail");
      const cb = (await coarse.boundingBox())!;
      await page.mouse.click(cb.x + cb.width * 0.38, cb.y + cb.height / 2);
      const reading1 = await page.getByTestId("estimate-reading-value").textContent();
      expect(reading1).toBe("150");
      const fine = page.getByTestId("estimate-fine-rail");
      const fb = (await fine.boundingBox())!;
      await page.mouse.move(fb.x + 4, fb.y + fb.height / 2);
      await page.mouse.down();
      await page.mouse.move(fb.x + fb.width * 0.5, fb.y + fb.height / 2, { steps: 14 });
      await page.waitForTimeout(80);
      await shot(page, path.join(SHOTS, `${tag}-2-drag.png`));
      await page.mouse.up();
      const reading2 = Number(await page.getByTestId("estimate-reading-value").textContent());
      expect(reading2).toBeGreaterThan(150);
      expect(reading2).toBeLessThan(200);

      // Revision: vernier keys and keyboard.
      await page.getByTestId("estimate-plus-10").click();
      await page.getByTestId("estimate-minus-1").click();
      await page.getByTestId("estimate-board").focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Shift+ArrowLeft");
      const before = Number(await page.getByTestId("estimate-board").getAttribute("aria-valuenow"));
      await page.keyboard.press("PageDown");
      const after = Number(await page.getByTestId("estimate-board").getAttribute("aria-valuenow"));
      expect(after).toBe(before - 50);
      await page.keyboard.press("PageUp");
      await page.keyboard.press("ArrowLeft");
      const settled = Number(await page.getByTestId("estimate-board").getAttribute("aria-valuenow"));
      expect(settled).toBe(before - 1);
      await assertNoLeak(page, FIRST);
      await shot(page, path.join(SHOTS, `${tag}-3-set.png`));

      // Lock, twice: the first submits, the second must change nothing.
      await page.getByTestId("estimate-lock").dblclick();
      await expect(root).toHaveAttribute("data-phase", "locked");
      await expect(page.getByTestId("lab-response")).toHaveText(`{${settled}}`);
      await expect(page.getByTestId("estimate-reading-value")).toHaveText(String(settled));
      await shot(page, path.join(SHOTS, `${tag}-4-locked.png`));

      // Reveal: a frame series through the choreography.
      await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 5000 });
      if (!reduced) {
        for (let i = 0; i < 8; i++) {
          await page.screenshot({ path: path.join(SHOTS, `${tag}-5-reveal-${i}.png`) });
          await page.waitForTimeout(160);
        }
      }
      await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
      await expect(page.getByTestId("lab-reveal-done")).toHaveAttribute("data-on", "true");
      await shot(page, path.join(SHOTS, `${tag}-6-revealed.png`));
      const a = answerOf(FIRST);
      await expect(page.getByTestId("estimate-truth-value")).toHaveText(String(a.answer.whole));
      await expect(page.getByTestId("estimate-reading-value")).toHaveText(String(settled));
      const verdict = await root.getAttribute("data-verdict");
      expect(verdict).toBe(settled > a.answer.whole ? "over" : settled < a.answer.whole ? "under" : "exact");
      await expect(page.getByTestId("estimate-verdict")).toContainText(String(Math.abs(settled - a.answer.whole)));
      await expect(page.getByTestId("ce-breakdown")).toHaveAttribute("data-working", "combat_working.v1");
      await expect(page.getByTestId("journey-combat-working-final")).toHaveText(String(Number(a.answer.exact.toFixed(4))));
      await assertNoOverflow(page);

      // Next round: the instrument stays where it was, and the new round leaks nothing.
      await page.getByTestId("lab-next").click();
      await expect(root).toHaveAttribute("data-phase", "open");
      await page.waitForTimeout(250);
      const secondId = (await page.getByTestId("lab-round").textContent())!;
      expect(secondId).not.toBe(FIRST);
      await assertNoLeak(page, secondId);
      await shot(page, path.join(SHOTS, `${tag}-7-next.png`));

      // A second round, by keyboard only, through to its reveal.
      await page.getByTestId("estimate-board").focus();
      await page.keyboard.press("End");
      await page.keyboard.press("PageDown");
      await page.keyboard.press("PageDown");
      await page.getByTestId("estimate-lock").click();
      await expect(root).toHaveAttribute("data-phase", "revealed", { timeout: 5000 });
      await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
      const b = answerOf(secondId);
      await expect(page.getByTestId("estimate-truth-value")).toHaveText(String(b.answer.whole));
      await shot(page, path.join(SHOTS, `${tag}-8-second-revealed.png`));
      await assertNoOverflow(page);

      const frames = await page.evaluate(() => (window as unknown as { __ceStop: () => Frame[] }).__ceStop());
      expect(frames.length).toBeGreaterThan(40);
      const phases = new Set(frames.map((f) => f.phase));
      expect([...phases]).toEqual(expect.arrayContaining(["open", "locked", "revealed"]));
      const worst = worstMovement(frames);
      const report = Object.entries(worst).map(([k, w]) => `${k}: ${w.max.toFixed(2)}px @${w.frame} ${w.from}→${w.to}`).join("\n");
      console.log(`[continuity ${tag}] frames=${frames.length}\n${report}`);
      for (const [k, w] of Object.entries(worst)) {
        expect(w.max, `${k} moved ${w.max.toFixed(2)}px (${w.from} → ${w.to})\n${report}`).toBeLessThanOrEqual(BUDGET_PX);
      }
    });
  }
}

test("an exact lock shows no band, a zero needle and the exact word", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/dev/combat-estimate?round=${FIRST}&state=revealed-exact`);
  const root = page.locator('[data-mig-primitive="estimate"]');
  await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
  await expect(root).toHaveAttribute("data-verdict", "exact");
  await expect(page.getByTestId("estimate-band")).toHaveCount(0);
  await expect(page.getByTestId("estimate-verdict")).toHaveText("Exact");
  // the pointer lands on the reading mark
  const tf = await page.getByTestId("estimate-truth").evaluate((e) => (e as HTMLElement).style.transform);
  const mf = await page.getByTestId("estimate-mark").evaluate((e) => (e as HTMLElement).style.transform);
  expect(tf).toBe(mf);
  const needle = await page.getByTestId("estimate-needle").evaluate((e) => (e as HTMLElement).style.transform);
  expect(needle).toBe("rotate(0deg)");
  await page.screenshot({ path: path.join(SHOTS, "1600x900-exact.png") });
});

test("an underestimate swings the needle left and bands to the left of the truth", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/dev/combat-estimate?round=${FIRST}&state=revealed-under`);
  const root = page.locator('[data-mig-primitive="estimate"]');
  await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
  await expect(root).toHaveAttribute("data-verdict", "under");
  const px = async (id: string) => Number(/translateX\(([-\d.]+)px\)/.exec(await page.getByTestId(id).evaluate((e) => (e as HTMLElement).style.transform))?.[1]);
  const poise = await px("estimate-poise");
  const truth = await px("estimate-truth");
  const band = await px("estimate-band");
  expect(poise).toBeLessThan(truth);
  expect(band).toBeLessThanOrEqual(truth);
  const needle = await page.getByTestId("estimate-needle").evaluate((e) => (e as HTMLElement).style.transform);
  expect(Number(/rotate\(([-\d.]+)deg\)/.exec(needle)?.[1])).toBeLessThan(0);
  await page.screenshot({ path: path.join(SHOTS, "1600x900-under.png") });
});

test("the synthetic round is labelled synthetic on the instrument and has no working", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/dev/combat-estimate?round=synthetic-demo&state=revealed-over&motion=reduce");
  const root = page.locator('[data-mig-primitive="estimate"]');
  await expect(root).toHaveAttribute("data-certification", "synthetic");
  await expect(page.getByTestId("estimate-certification")).toHaveText("SYNTHETIC — not certified");
  await expect(root).toHaveAttribute("data-reveal-stage", "done", { timeout: 6000 });
  await expect(page.getByTestId("ce-breakdown")).toHaveAttribute("data-working", "none");
  await page.screenshot({ path: path.join(SHOTS, "1280x720-synthetic.png") });
});
