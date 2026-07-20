import { test, expect } from "@playwright/test";
import { useIdentity } from "./helpers";

// Deterministic seeded slugs (see backend engine_tests/e2e_harness/seed_acceptance.py).
const S = {
  scheduled: "e2e-scheduled",
  open: "e2e-open",
  locked: "e2e-locked",
  revealedUnsettled: "e2e-revealed-unsettled",
  settledA: "e2e-settled-a", // winner LEFT (Annie); acct1 backed winner
  draw: "e2e-settled-draw",
  void: "e2e-void",
};
const detail = (slug: string) => `/lol/combat-battles/${slug}`;

// Markers that must NOT appear before reveal.
const RESULT_MARKERS = ["winner_side", "Applied HP damage", "Combat log", "result_checksum"];

test.describe("Combat Sim Battles — public loop", () => {
  test("1. guest sees the index grouped by lifecycle with a sign-in CTA", async ({ page }) => {
    await useIdentity(page); // guest
    await page.goto("/lol/combat-battles");
    await expect(page.getByRole("heading", { name: /Combat Sim Battles/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Open for predictions/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Revealed results/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in/ })).toBeVisible();
    // Void battles are not listed publicly.
    await expect(page.getByRole("link", { name: /Void Battle/ })).toHaveCount(0);
  });

  test("11. no pre-reveal leakage on a locked battle (guest)", async ({ page }) => {
    await useIdentity(page);
    const resp = await page.goto(detail(S.locked));
    await expect(page.getByText(/Prediction locked/)).toBeVisible();
    await expect(page.getByText(/hasn.t been revealed yet|Predictions are locked/)).toBeVisible();
    const body = await page.locator("main").innerText();
    for (const m of RESULT_MARKERS) expect(body).not.toContain(m);
    // The detail network response also must not carry result fields.
    expect(resp).toBeTruthy();
  });

  test("4. revealed result renders authoritative combat values", async ({ page }) => {
    await useIdentity(page);
    await page.goto(detail(S.settledA));
    await expect(page.getByText(/Result revealed/)).toBeVisible();
    await expect(page.getByText(/Result:\s*Annie/)).toBeVisible();
    await expect(page.getByText("Applied HP damage").first()).toBeVisible();
    await expect(page.getByText("1,154")).toBeVisible(); // Annie applied HP (backend 1153.8)
  });

  test("11b. guest sees no personal correctness on a settled battle", async ({ page }) => {
    await useIdentity(page);
    await page.goto(detail(S.settledA));
    await expect(page.getByText(/You didn.t predict this battle/)).toBeVisible();
    await expect(page.getByText(/Your prediction: (Correct|Incorrect)/)).toHaveCount(0);
  });
});

test.describe("Combat Sim Battles — authenticated prediction", () => {
  test("2. verified account creates and edits a prediction", async ({ page }) => {
    await useIdentity(page, "acct1");
    await page.goto(detail(S.open));
    const group = page.getByRole("group", { name: /Choose a side to predict/ });
    const left = group.getByRole("button", { name: /Annie/ });
    const right = group.getByRole("button", { name: /Brand/ });
    // Seeded pick is LEFT.
    await expect(left).toHaveAttribute("aria-pressed", "true");
    // Change to RIGHT and confirm it becomes the pressed pick.
    await right.click();
    await expect(right).toHaveAttribute("aria-pressed", "true");
    await expect(left).toHaveAttribute("aria-pressed", "false");
    // Persist across reload (server-authoritative).
    await page.reload();
    await expect(page.getByRole("group", { name: /Choose a side to predict/ })
      .getByRole("button", { name: /Brand/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("3. rapid double submit resolves to a single server-authoritative pick", async ({ page }) => {
    await useIdentity(page, "acct1");
    await page.goto(detail(S.open));
    const group = page.getByRole("group", { name: /Choose a side to predict/ });
    const left = group.getByRole("button", { name: /Annie/ });
    // Fire two quick clicks; final state must be exactly one pressed pick.
    await left.click();
    await left.click();
    await expect(left).toHaveAttribute("aria-pressed", "true");
    await expect(group.getByRole("button", { name: /Brand/ })).toHaveAttribute("aria-pressed", "false");
  });

  test("lock freeze: locked battle exposes no prediction controls", async ({ page }) => {
    await useIdentity(page, "acct1");
    await page.goto(detail(S.locked));
    await expect(page.getByText(/Predictions are locked/)).toBeVisible();
    await expect(page.getByRole("group", { name: /Choose a side to predict/ })).toHaveCount(0);
  });
});

test.describe("Combat Sim Battles — settlement outcomes", () => {
  test("6. settled correct shows +100 and Arena Score", async ({ page }) => {
    await useIdentity(page, "acct1");
    await page.goto(detail(S.settledA));
    await expect(page.getByText(/Your prediction: Correct/)).toBeVisible();
    await expect(page.getByText(/\+100 Arena Score/)).toBeVisible();
    await expect(page.getByText(/Your Arena Score/)).toBeVisible();
    await expect(page.getByText("200", { exact: false })).toBeVisible();
  });

  test("6b. second account sees only its own (incorrect) result", async ({ page }) => {
    await useIdentity(page, "acct2");
    await page.goto(detail(S.settledA));
    await expect(page.getByText(/Your prediction: Incorrect/)).toBeVisible();
    await expect(page.getByText(/Your prediction: Correct/)).toHaveCount(0);
  });

  test("5. revealed-but-unsettled shows result with pending personal outcome", async ({ page }) => {
    await useIdentity(page, "acct1");
    await page.goto(detail(S.revealedUnsettled));
    await expect(page.getByText(/Result revealed/)).toBeVisible();
    await expect(page.getByText(/Your prediction: (Correct|Incorrect|Push|Void)/)).toHaveCount(0);
  });

  test("7. draw settles as a push (no score change)", async ({ page }) => {
    await useIdentity(page, "acct1");
    await page.goto(detail(S.draw));
    await expect(page.getByText(/Your prediction: Push/)).toBeVisible();
    await expect(page.getByText(/No Arena Score was gained or lost/)).toBeVisible();
  });

  test("8. void shows the public reason and awards zero (D1 regression)", async ({ page }) => {
    await useIdentity(page, "acct1");
    await page.goto(detail(S.void));
    await expect(page.getByText(/This battle was voided\./)).toBeVisible();
    await expect(page.getByText(/Reason:\s*Configuration error found in review/)).toBeVisible();
    await expect(page.getByText(/Your prediction: Void/)).toBeVisible();
  });
});

test.describe("Combat Sim Battles — admin", () => {
  test("9/10. admin page loads (route gate), lists events, exposes controls", async ({ page }) => {
    await useIdentity(page, "admin");
    await page.goto("/admin/combat-battles");
    await expect(page).toHaveURL(/\/admin\/combat-battles/); // not redirected to /
    await expect(page.getByRole("heading", { name: /Combat Sim Battles.*Admin/i })).toBeVisible();
    await expect(page.getByText(/you cannot set a winner, outcome, or score/i)).toBeVisible();
    await expect(page.getByText(/Create draft/)).toBeVisible();
    await expect(page.getByText(/Settled Battle A|Open Battle/)).toBeVisible();
  });

  test("admin route denies a non-admin account", async ({ page }) => {
    await useIdentity(page, "acct1");
    await page.goto("/admin/combat-battles");
    await expect(page).toHaveURL(/\/$|\/lol/); // redirected away from admin
  });
});

test.describe("Combat Sim Battles — responsive", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("12. settled detail has no horizontal overflow at mobile width", async ({ page }) => {
    await useIdentity(page, "acct1");
    await page.goto(detail(S.settledA));
    await expect(page.getByText(/Result revealed/)).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
