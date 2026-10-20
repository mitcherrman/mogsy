/** TEMPORARY diagnostics for two Orrery-spec failures on the masthead branch (removed before review). */
import { expect, test, type Page } from "@playwright/test";

async function stub(page: Page) {
  await page.route("**/api/patch-reports", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ patches: [{ patch_version: "26.20", source_url: "", built_at: "2026-10-01T00:00:00Z", section_titles: [], card_count: 41, change_count: 598, cards_by_type: {}, cards_by_status: {} }] }) }));
  await page.route("**/api/patch-reports/**", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ patch_version: "26.20", source_url: "", built_at: "2026-10-01T00:00:00Z", sections: [],
      cards: ["Ryze", "Ahri", "Akali", "Viktor", "Jinx", "Yasuo"].map((n, i) => ({ section_title: "Champions", status: "analyzed",
        entity_type: "champion", entity_name: n, entity_slug: n.toLowerCase(), mogzy_entity_ref: null, mogzy_image_path: null, official_image_url: null,
        editorial_direction: i < 3 ? "buff" : "nerf", editorial_direction_source: "riot_section",
        changes: [{ group_title: "Base stats", property_name: "Health", change_kind: "numeric", before_raw: "600", after_raw: i < 3 ? "620" : "580" }] })) }) }));
  await page.route("**/api/daily-run/today", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
  await page.route("**/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
}

const census = (page: Page) => page.evaluate(() => {
  const m: Record<string, number> = {};
  for (const a of document.getAnimations()) {
    if (a.playState !== "running") continue;
    const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
    const pe = (a.effect as KeyframeEffect | null)?.pseudoElement ?? "";
    const k = `${a.constructor.name}:${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? ""}@${t?.getAttribute("class")?.split(" ")[0] ?? t?.tagName}${pe}`;
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
});

test("diag: running animations full vs lite", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await stub(page);
  await page.goto("/lol");
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("academy-veil")).toHaveCount(0);
  await page.waitForTimeout(1400);
  console.log("DIAG full", JSON.stringify(await census(page)));
  await page.goto("/lol?quality=lite");
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
  await page.waitForTimeout(1500);
  console.log("DIAG lite", JSON.stringify(await census(page)));
});

test("diag: Read full report after Daily and back", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await stub(page);
  await page.goto("/lol");
  await expect(page.getByTestId("academy-core-stage")).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("academy-veil")).toHaveCount(0);
  await page.getByTestId("academy-core-daily").click();
  await expect(page).toHaveURL(/\/quiz\/daily-challenge$/);
  await page.goBack();
  await expect(page.getByTestId("academy-core-book")).toBeVisible();
  const link = page.getByTestId("academy-core-book").getByRole("link", { name: /Read full report/i });
  console.log("DIAG count", await link.count());
  for (let i = 0; i < 3; i++) {
    const b = await link.boundingBox();
    const hit = b ? await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 200), [b.x + b.width / 2, b.y + b.height / 2]) : null;
    console.log("DIAG link", i, JSON.stringify(b), hit);
    await page.waitForTimeout(400);
  }
  try { await link.click({ timeout: 8000 }); console.log("DIAG click ok", page.url()); }
  catch (e) { console.log("DIAG click failed", String(e).slice(0, 1500).replace(/
/g, " | ")); }
  for (let i = 0; i < 0; i++) {
    const info = await page.evaluate(() => {
      const link = [...document.querySelectorAll<HTMLElement>('[data-testid="academy-core-book"] a, [data-testid="academy-core-book"] button')]
        .find((e) => /Read full report/i.test(e.textContent ?? "") || /Read full report/i.test(e.getAttribute("aria-label") ?? ""));
      if (!link) return { found: false, veil: !!document.querySelector('[data-testid="academy-veil"]'), startup: document.querySelector(".o35-root")?.getAttribute("data-startup") };
      const r = link.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { found: true, rect: [r.x, r.y, r.width, r.height].map(Math.round), hit: hit?.outerHTML.slice(0, 160), inside: link === hit || link.contains(hit!),
        veil: !!document.querySelector('[data-testid="academy-veil"]'), startup: document.querySelector(".o35-root")?.getAttribute("data-startup") };
    });
    console.log("DIAG report", i, JSON.stringify(info));
    await page.waitForTimeout(500);
  }
});
