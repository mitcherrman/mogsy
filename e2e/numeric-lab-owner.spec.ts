/**
 * NUM-REC2 — the owner numeric lab in a real browser.
 *
 * Runs `/dev/numeric-lab` — the SAME page `/admin/numeric-lab` mounts behind
 * AdminRoute, without the owner sign-in a browser spec cannot mint — against
 * an in-page stand-in for `/api/admin/numeric-lab/*`. The stand-in mirrors the
 * backend (League_Combat_Simulator `numeric_lab/service.py`): an allow-listed
 * public projection before Lock, and a round's private block only in the
 * answer to its own Lock, after validating the value. The fixtures are the
 * same historical captures the backend serves; they live in test files only.
 *
 * Proves at desktop and phone sizes, for BOTH original mechanics: the
 * authority banner; no answer anywhere in the DOM before Lock; keyboard
 * (desktop) and touch (phone) play; exactly one lock request carrying exactly
 * the locked value; the original reveal; the blind gut-call log; no sideways
 * scroll. Screenshots go to NUMERIC_LAB_SHOTS (default test-results/numeric-lab).
 *
 *   npx playwright test -c playwright.arena.config.ts numeric-lab-owner
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const SHOTS = process.env.NUMERIC_LAB_SHOTS ?? path.resolve("test-results/numeric-lab");
mkdirSync(SHOTS, { recursive: true });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const CAPTURE: Json = JSON.parse(readFileSync(path.resolve("src/lib/combat-estimate/__fixtures__/combatAuthorityCapture.json"), "utf8"));
const DROPS: Json = JSON.parse(readFileSync(path.resolve("e2e/fixtures/numeric-lab/stat_drop_mig1_rounds.json"), "utf8"));

const publicCe = (s: Json) => ({
  id: s.id, kind: s.kind, difficulty: s.difficulty, metric: s.metric,
  attacker: { champion: s.attacker.champion, level: s.attacker.level, items: s.attacker.items,
    stats: { attack_damage: s.attacker.stats.attack_damage, bonus_attack_damage: s.attacker.stats.bonus_attack_damage, ability_power: s.attacker.stats.ability_power } },
  ability: { slot: s.ability.slot, name: s.ability.name, rank: s.ability.rank, max_rank: s.ability.max_rank, component: s.ability.component },
  target: { champion: s.target.champion, level: s.target.level, items: s.target.items, armor: s.target.armor },
  penetration: s.penetration,
  scale: { policy: s.scale.policy, max: s.scale.max, coarse_step: s.scale.coarse_step, figure_every: s.scale.figure_every, basis: s.scale.basis },
  assumptions: s.assumptions,
});

interface Backend { locks: Json[]; status: number }

async function standInBackend(page: Page, status = 200): Promise<Backend> {
  const be: Backend = { locks: [], status };
  await page.route("**/api/admin/numeric-lab/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace("/api/admin/numeric-lab", "");
    const json = (body: unknown, code = 200) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(body) });
    if (be.status !== 200) return json({ detail: "Owner authorization required" }, be.status);
    if (p === "/stat-drop/rounds") {
      return json({ contract: "numeric_lab.stat_drop.public.v1", authority_label: "x",
        capture_source: { branch: DROPS.source.branch, commit: DROPS.source.commit },
        rounds: DROPS.rounds.map((r: Json) => ({ id: r.id, domain: r.domain, title: r.title, shape: r.shape, provenance_label: r.provenance, content: r.content })) });
    }
    if (p === "/combat-estimate/rounds") {
      return json({ contract: "numeric_lab.combat_estimate.public.v1", authority_label: "x",
        capture: { contract: CAPTURE.contract, captured_at: CAPTURE.captured_at, backend_commit: CAPTURE.backend.commit,
          implementation: "combat_calculations.physical_ability_damage.v1", scale_policy: { id: CAPTURE.scale_policy.id, development_only: true } },
        rounds: CAPTURE.scenarios.map(publicCe) });
    }
    const m = p.match(/^\/(stat-drop|combat-estimate)\/rounds\/([^/]+)\/lock$/);
    if (m && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      be.locks.push({ mode: m[1], id: decodeURIComponent(m[2]), body });
      if (m[1] === "stat-drop") {
        const r = DROPS.rounds.find((x: Json) => x.id === decodeURIComponent(m[2]));
        return json({ contract: "numeric_lab.stat_drop.release.v1", round_id: r.id, value: body.value, authority_label: "x", released: r.hidden });
      }
      const s = CAPTURE.scenarios.find((x: Json) => x.id === decodeURIComponent(m[2]));
      if (!Number.isInteger(body.estimate) || body.estimate < 0 || body.estimate >= s.scale.max) return json({ detail: { error: { code: "input_refused", message: "off the beam" } } }, 422);
      return json({ contract: "numeric_lab.combat_estimate.release.v1", round_id: s.id, estimate: body.estimate, authority_label: "x",
        backend_commit: CAPTURE.backend.commit,
        released: { metric: s.metric, exact: s.answer.exact, whole: s.answer.whole, result: s.result, working: s.working,
          provenance: s.provenance, formula_text: s.ability.formula_text, tier: s.ability.tier } });
    }
    return json({ detail: "not found" }, 404);
  });
  return be;
}

async function noSideScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // The arena frame's ::before is inset -4px (MIG1.2 §F note); body clips it.
  expect(over, "horizontal overflow px").toBeLessThanOrEqual(4);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900, touch: false },
  { name: "390x844", width: 390, height: 844, touch: true },
  { name: "360x640", width: 360, height: 640, touch: true },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch });

    test("Stat Drop: banner, no pre-lock answer, play, one lock, original reveal, gut call", async ({ page }) => {
      const be = await standInBackend(page);
      const round = DROPS.rounds.find((r: Json) => r.id === "drop.lc.olaf-undertow-haste");
      await page.goto(`/dev/numeric-lab?mode=stat-drop&round=${round.id}`);
      await expect(page.getByTestId("numeric-lab-banner")).toContainText("not server-authoritatively graded");
      await expect(page.getByTestId("mig-stat-drop")).toBeVisible();
      // The label rides the arena's own header too, so it is on screen without scrolling.
      await expect(page.locator("text=Prototype · historical capture >> visible=true").first()).toBeInViewport();
      const html = await page.getByTestId("owner-stat-drop").evaluate((e) => e.outerHTML);
      for (const leak of [round.hidden.canonicalDisplay, String(round.hidden.canonicalValue), round.hidden.evidence, "drop-true-flag"]) {
        expect(html, `pre-lock leak: ${leak}`).not.toContain(leak);
      }
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-stat-drop-open.png`), fullPage: true });
      if (vp.touch) {
        const box = (await page.getByTestId("drop-range").boundingBox())!;
        await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height / 2);
      } else {
        await page.getByRole("slider").focus();
        for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
      }
      await page.getByTestId("drop-lock").click();
      await expect(page.getByTestId("owner-stat-drop")).toHaveAttribute("data-phase", "revealed", { timeout: 5000 });
      expect(be.locks).toHaveLength(1);
      expect(typeof be.locks[0].body.value).toBe("number");
      expect(Object.keys(be.locks[0].body)).toEqual(["value"]);
      await expect(page.getByTestId("drop-true-flag")).toContainText(round.hidden.canonicalDisplay);
      await expect(page.getByTestId("drop-outcome")).toBeVisible();
      await page.getByTestId("gut-fair-correct").click();
      await page.getByTestId("gut-note").fill("dragging felt fine");
      await page.getByTestId("gut-record").click();
      await expect(page.getByTestId("numeric-lab-log-count")).toHaveText(/^1 logged/);
      await noSideScroll(page);
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-stat-drop-revealed.png`), fullPage: true });
    });

    test("Combat Estimate: certified premise, no pre-lock answer, two-beam play, one lock, CE1 reveal", async ({ page }) => {
      const be = await standInBackend(page);
      const s = CAPTURE.scenarios.find((x: Json) => x.id === "jarvan-q-r3-l5-dirk-vs-olaf");
      await page.goto(`/dev/numeric-lab?mode=combat-estimate&round=${s.id}`);
      await expect(page.getByTestId("numeric-lab-authority")).toContainText("8829fc3c");
      await expect(page.getByTestId("estimate-board")).toBeVisible();
      await expect(page.locator("text=Prototype · historical capture >> visible=true").first()).toBeInViewport();
      const leak = await page.evaluate(({ whole, exact, multiplier }) => {
        const root = document.querySelector('[data-testid="owner-combat-estimate"]') as HTMLElement;
        const html = root.outerHTML;
        return {
          markers: document.querySelectorAll('[data-testid="estimate-truth"], [data-testid="estimate-band"], [data-reveal-stage]').length,
          exact: html.includes(String(exact)), multiplier: html.includes(String(multiplier)),
          truth: document.querySelector('[data-testid="estimate-truth-value"]')?.textContent,
          wholeAttr: [...root.querySelectorAll("*")].some((e) => [...e.attributes].some((a) => a.value === String(whole))),
        };
      }, { whole: s.answer.whole, exact: s.answer.exact, multiplier: s.result.mitigation_multiplier });
      expect(leak).toEqual({ markers: 0, exact: false, multiplier: false, truth: "—", wholeAttr: false });
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-combat-estimate-open.png`), fullPage: true });
      if (vp.touch) {
        const coarse = (await page.getByTestId("estimate-coarse-rail").boundingBox())!;
        await page.touchscreen.tap(coarse.x + coarse.width * 0.4, coarse.y + coarse.height / 2);
        await page.getByTestId("estimate-plus-10").tap();
      } else {
        await page.getByTestId("estimate-board").focus();
        for (let i = 0; i < 3; i++) await page.keyboard.press("PageUp");
        await page.keyboard.press("Shift+ArrowRight");
      }
      const set = Number(await page.getByTestId("estimate-board").getAttribute("aria-valuenow"));
      await page.getByTestId("estimate-lock").dblclick();
      await expect(page.getByTestId("owner-combat-estimate")).toHaveAttribute("data-phase", "revealed", { timeout: 5000 });
      expect(be.locks).toEqual([{ mode: "combat-estimate", id: s.id, body: { estimate: set } }]);
      await expect(page.getByTestId("estimate-truth-value")).toHaveText(String(s.answer.whole));
      await expect(page.locator("body")).not.toContainText(/\b(Correct|Incorrect|Passed|Failed)\b/);
      await page.getByTestId("gut-unsure").click();
      await page.getByTestId("gut-record").click();
      await expect(page.getByTestId("download-ce-log")).toBeEnabled();
      await noSideScroll(page);
      await page.waitForTimeout(2000); // the CE1 reveal clock (1800ms) settles
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-combat-estimate-revealed.png`), fullPage: true });
    });
  });
}

test("a refused owner session shows the reason, not rounds", async ({ page }) => {
  await standInBackend(page, 403);
  await page.goto("/dev/numeric-lab?mode=combat-estimate");
  await expect(page.getByTestId("numeric-lab-error")).toContainText("owner session");
  await expect(page.getByTestId("estimate-board")).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, "1440x900-refused.png") });
});
