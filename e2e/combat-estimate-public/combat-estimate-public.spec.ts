/**
 * CE-FIX1 — Combat Estimate on its PUBLIC route, opened from More Challenges,
 * in a real browser. GitHub Actions only (bundled Chromium, one worker), per
 * AGENTS.md. Every backend request is intercepted with the frozen CE1 capture;
 * nothing leaves the runner except fonts.
 *
 * The defect it guards: on a phone the public arena stacks (its flanks are
 * panels), so `.ranked-question-stage` is content-sized. The stage used to
 * measure that box and cap itself 2px under it, every ResizeObserver delivery,
 * so the game shrank ~120px a second until nothing but a sliver was left.
 *
 * For each of 390x844, 360x640, 1280x720 and 1440x900 it:
 *   - opens the game from the More Challenges gallery (no direct deep link);
 *   - holds the stage still for 2.5s and fails on any shrink, on a stream of
 *     resize deliveries, or on the board / beam / Lock leaving the page;
 *   - plays all six hits with the real controls, checks each lock posts the
 *     estimate the plaque shows and each reveal shows the authority's answer,
 *     and re-checks the stage after every reveal;
 *   - reaches the results screen, with no navigation off the game route.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = "test-results/combat-estimate-public";
const ROUTE = "/quiz/more-challenges/combat_estimate";

type Scenario = {
  id: string; kind: string; difficulty: string; metric: string;
  attacker: { champion: string; level: number; items: unknown[]; stats: Record<string, number> };
  ability: { slot: string; name: string; rank: number; max_rank: number; component: string | null; formula_text: string; tier: string };
  target: unknown; penetration: unknown; scale: unknown; assumptions: string[];
  result: unknown; answer: { exact: number; whole: number }; working: unknown; provenance: unknown;
};

const catalog = JSON.parse(readFileSync(path.resolve("src/lib/public-modes/__fixtures__/publicModeCatalog.json"), "utf8"));
const capture = JSON.parse(readFileSync(path.resolve("src/lib/combat-estimate/__fixtures__/combatAuthorityCapture.json"), "utf8"));
const SCENARIOS = (capture.scenarios as Scenario[]).slice(0, 6);

const identity = {
  token: "ce-public-token",
  user: { id: "ce-public-user", email: "ce-public@example.test", is_anonymous: false },
  admin: false,
};

const publicRound = (s: Scenario) => ({
  id: s.id, kind: s.kind, difficulty: s.difficulty, metric: s.metric,
  attacker: { champion: s.attacker.champion, level: s.attacker.level, items: s.attacker.items, stats: {
    attack_damage: s.attacker.stats.attack_damage, bonus_attack_damage: s.attacker.stats.bonus_attack_damage,
    ability_power: s.attacker.stats.ability_power } },
  ability: { slot: s.ability.slot, name: s.ability.name, rank: s.ability.rank, max_rank: s.ability.max_rank, component: s.ability.component },
  target: s.target, penetration: s.penetration, scale: s.scale, assumptions: s.assumptions,
});

interface Backend { locks: { index: number; estimate: number }[] }

async function prepare(page: Page): Promise<Backend> {
  const backend: Backend = { locks: [] };
  await page.addInitScript(({ identity }) => {
    localStorage.setItem("mogsy_e2e_identity", JSON.stringify(identity));
    // Count ResizeObserver deliveries, page-wide, without changing what they do.
    const RO = window.ResizeObserver;
    (window as unknown as { __roDeliveries: number }).__roDeliveries = 0;
    window.ResizeObserver = class extends RO {
      constructor(cb: ResizeObserverCallback) {
        super((entries, obs) => { (window as unknown as { __roDeliveries: number }).__roDeliveries += 1; cb(entries, obs); });
      }
    };
  }, { identity });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (local && !url.pathname.startsWith("/api/")) return route.continue();
    if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) return route.continue();
    const p = url.pathname;
    if (p === "/api/game-modes") return route.fulfill({ json: catalog });
    if (p === "/api/game-modes/combat_estimate/sessions" && request.method() === "POST") {
      return route.fulfill({ json: {
        contract: "bonus_session.combat_estimate.v1", session_id: "sess-ce-public",
        public: { contract: "numeric_lab.combat_estimate.public.v1", authority_label: "Combat authority",
          capture: { contract: "combat_estimate.capture.v1", implementation: "combat_calculations.physical_ability_damage.v1" },
          rounds: SCENARIOS.map(publicRound) },
      } });
    }
    const lock = p.match(/^\/api\/game-modes\/combat_estimate\/sessions\/sess-ce-public\/rounds\/(\d+)\/lock$/);
    if (lock && request.method() === "POST") {
      const index = Number(lock[1]);
      const s = SCENARIOS[index];
      const estimate = Number(JSON.parse(request.postData() ?? "{}").estimate);
      backend.locks.push({ index, estimate });
      const error = estimate - s.answer.whole;
      return route.fulfill({ json: {
        contract: "bonus_session.combat_estimate.release.v1", index,
        release: { round_id: s.id, authority_label: "Combat authority", released: {
          metric: s.metric, exact: s.answer.exact, whole: s.answer.whole, result: s.result, working: s.working,
          provenance: s.provenance, formula_text: s.ability.formula_text, tier: s.ability.tier } },
        feedback: { guess: estimate, canonical: s.answer.whole, error, abs_error: Math.abs(error),
          relative_error: Math.abs(error) / Math.abs(s.answer.whole), graded: false },
      } });
    }
    if (p.startsWith("/api/")) return route.fulfill({ status: 404, json: { detail: "not served by this spec" } });
    // Art, analytics, auth: nothing reaches a real host.
    return route.abort();
  });
  return backend;
}

/** The stage's height every frame for `ms`, and the resize deliveries in that window. */
async function watchStage(page: Page, ms: number) {
  return page.evaluate(async (ms) => {
    const w = window as unknown as { __roDeliveries: number };
    const stage = () => document.querySelector<HTMLElement>('[data-testid="ce-stage"]');
    const first = stage();
    const heights: number[] = [];
    const ro0 = w.__roDeliveries;
    const t0 = performance.now();
    await new Promise<void>((done) => {
      const tick = () => {
        const s = stage();
        heights.push(s ? s.getBoundingClientRect().height : 0);
        if (performance.now() - t0 >= ms) done(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { heights, deliveries: w.__roDeliveries - ro0, sameElement: stage() === first };
  }, ms);
}

async function expectStable(page: Page, label: string) {
  const { heights, deliveries, sameElement } = await watchStage(page, 2500);
  const start = heights[0];
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  // The collapse took 2px a frame; a stable stage does not move at all.
  expect(min, `${label}: the stage shrank (${start} -> ${min}px)`).toBeGreaterThanOrEqual(start - 1);
  expect(max - min, `${label}: the stage's height moved by ${max - min}px`).toBeLessThanOrEqual(1);
  expect(start, `${label}: the stage is too short to play`).toBeGreaterThanOrEqual(300);
  // A feedback loop shows as one delivery a frame (~150 in 2.5s); a still page has none.
  expect(deliveries, `${label}: ${deliveries} resize deliveries while idle`).toBeLessThanOrEqual(4);
  expect(sameElement, `${label}: the stage remounted`).toBe(true);
  for (const id of ["ce-board", "estimate-board", "estimate-coarse", "estimate-fine", "estimate-plate"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, `${label}: ${id} is not laid out`).not.toBeNull();
    expect(box!.height, `${label}: ${id} collapsed`).toBeGreaterThan(8);
  }
}

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  const phone = vp.width < 768;
  test.describe(`Combat Estimate public route @ ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, isMobile: phone, hasTouch: phone });

    test("opens from More Challenges, stays put, and plays six hits to the results", async ({ page }) => {
      const backend = await prepare(page);
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      const navigations: string[] = [];
      page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(new URL(f.url()).pathname); });

      await page.goto("/quiz/more-challenges");
      const card = page.locator('[data-testid="mode-card"][data-mode-id="combat_estimate"]');
      await page.getByText("Random game").first().waitFor();
      if (!(await card.isVisible())) await page.getByRole("button", { name: /Precision/ }).first().click();
      await card.scrollIntoViewIfNeeded();
      await card.getByTestId("mode-card-play").click();

      await expect(page).toHaveURL(new RegExp(`${ROUTE}$`));
      const game = page.getByTestId("combat-estimate-game");
      await expect(game).toHaveAttribute("data-phase", "open");
      await expect(page.getByTestId("ce-stage")).toBeVisible();
      await expectStable(page, "open");
      await page.screenshot({ path: `${SHOTS}/open-${vp.width}x${vp.height}.png` });
      const enteredAt = navigations.lastIndexOf(ROUTE);
      expect(enteredAt).toBeGreaterThanOrEqual(0);

      for (let i = 0; i < SCENARIOS.length; i += 1) {
        const s = SCENARIOS[i];
        await expect(game).toHaveAttribute("data-round", String(i));
        await expect(page.getByTestId("bonus-game-counter")).toHaveText(`Round ${i + 1} / ${SCENARIOS.length}`);
        await expect(page.getByTestId("ce-ability-name")).toHaveText(s.ability.name);
        // The real controls: three coarse steps up, one fine step back.
        for (let k = 0; k < 3; k += 1) await page.getByTestId("estimate-plus-10").click();
        await page.getByTestId("estimate-minus-1").click();
        const shown = Number((await page.getByTestId("estimate-reading-value").innerText()).replace(/[^\d.-]/g, ""));
        expect(shown).toBeGreaterThan(0);
        await page.getByTestId("estimate-lock").click();
        await expect(game).toHaveAttribute("data-phase", "revealed");
        expect(backend.locks.at(-1)).toEqual({ index: i, estimate: shown });
        // Backend-authoritative: the reveal is the authority's own answer.
        await expect(page.getByTestId("estimate-truth-value")).toHaveText(new RegExp(`^${s.answer.whole}\\b`));
        await expect(page.getByTestId("ce-breakdown")).toBeAttached();
        await expect(page.getByTestId("estimate-verdict")).not.toHaveText("");
        await expectStable(page, `revealed ${i + 1}`);
        if (i === 0) await page.screenshot({ path: `${SHOTS}/revealed-${vp.width}x${vp.height}.png` });
        await page.getByTestId(i === SCENARIOS.length - 1 ? "bonus-game-finish" : "bonus-game-next").click();
      }

      const results = page.getByTestId("bonus-game-results");
      await expect(results).toBeVisible();
      await expect(page.getByTestId("bonus-game-results-headline")).toHaveText(/Off by|Run complete/);
      await expect(page.getByTestId("bonus-game-results-rounds").locator("li")).toHaveCount(SCENARIOS.length);
      // Ungraded: an error, never a pass mark.
      await expect(results).not.toContainText(/\b(Correct|Incorrect|Passed|Failed)\b/);
      await page.screenshot({ path: `${SHOTS}/results-${vp.width}x${vp.height}.png` });

      expect(backend.locks.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(navigations.slice(enteredAt).every((p) => p === ROUTE), `left the game: ${navigations.join(" -> ")}`).toBe(true);
      await expect(page).toHaveURL(new RegExp(`${ROUTE}$`));
      expect(pageErrors).toEqual([]);
    });
  });
}
