import { expect, test, type Page } from "@playwright/test";

const account = {
  token: "ux1a-token",
  user: { id: "ux1a-user", email: "ux1a@example.test", is_anonymous: false },
  admin: false,
};

const controlIds = [
  "hud-home",
  "academy-radio-hud-trigger",
  "hud-page-report",
  "hud-profile",
  "hud-notifications-trigger",
] as const;

async function openHud(page: Page, signedIn: boolean, width: number, scale: 1 | 2) {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(({ identity }) => {
    sessionStorage.setItem("quiz:gate:hub_visited", "1");
    localStorage.removeItem("mogsy_e2e_identity");
    if (identity) localStorage.setItem("mogsy_e2e_identity", JSON.stringify(identity));
  }, { identity: signedIn ? account : null });
  await page.goto("/lol");
  await expect(page.getByTestId("global-hud-controls")).toBeVisible();
  if (scale === 2) {
    await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
  }
}

async function expectNoHudOverflow(page: Page, includeSignup: boolean, assertDocument = true) {
  const ids = includeSignup ? ["hud-signup-chip", ...controlIds] : [...controlIds];
  const geometry = await page.evaluate((testIds) => {
    const viewport = document.documentElement.clientWidth;
    return {
      viewport,
      scrollWidth: document.documentElement.scrollWidth,
      controls: testIds.map((testId) => {
        const element = document.querySelector(`[data-testid="${testId}"]`)!;
        const box = element.getBoundingClientRect();
        const after = getComputedStyle(element, "::after");
        const effectiveHeight = box.height
          + Math.max(0, -Number.parseFloat(after.top) || 0)
          + Math.max(0, -Number.parseFloat(after.bottom) || 0);
        return { testId, left: box.left, right: box.right, effectiveHeight };
      }),
    };
  }, ids);
  if (assertDocument) expect(geometry.scrollWidth).toBe(geometry.viewport);
  for (const control of geometry.controls) {
    expect(control.left, `${control.testId} left edge`).toBeGreaterThanOrEqual(0);
    expect(control.right, `${control.testId} right edge`).toBeLessThanOrEqual(geometry.viewport);
    expect(control.effectiveHeight, `${control.testId} effective target`).toBeGreaterThanOrEqual(44);
  }
}

for (const signedIn of [false, true]) {
  for (const width of [320, 375, 390]) {
    for (const scale of [1, 2] as const) {
      test(`${signedIn ? "signed-in" : "guest"} HUD fits ${width}px at ${scale === 2 ? "200%" : "normal"} text`, async ({ page }) => {
        await openHud(page, signedIn, width, scale);
        if (signedIn) {
          await expect(page.getByTestId("hud-signup-chip")).toHaveCount(0);
        } else {
          await expect(page.getByTestId("hud-signup-chip")).toBeVisible();
        }
        await expectNoHudOverflow(page, !signedIn);

        const expectedOrder = signedIn
          ? controlIds
          : [controlIds[0], "hud-signup-chip", ...controlIds.slice(1)];
        const actualOrder = await page.locator("nav[aria-label='Mogzy controls'] [data-testid]")
          .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
        expect(actualOrder.filter((id) => expectedOrder.includes(id as typeof expectedOrder[number])))
          .toEqual(expectedOrder);

        for (const id of expectedOrder) {
          const control = page.getByTestId(id);
          await control.focus();
          await expect(control).toBeFocused();
        }
      });
    }
  }
}

test("Home Hub collapsed controls remain usable at 320px and 200% text", async ({ page }) => {
  await openHud(page, false, 320, 2);
  await page.evaluate(() => {
    document.documentElement.classList.add("hub-floating-controls-collapsed");
    window.dispatchEvent(new Event("hub-floating-controls-change"));
  });
  const launcher = page.getByTestId("hub-hud-expand");
  await expect(launcher).toBeVisible();
  await expect(page.getByTestId("global-hud-controls")).toHaveAttribute("aria-hidden", "true");
  await launcher.click();
  await expect(page.getByTestId("global-hud-controls")).not.toHaveAttribute("aria-hidden", "true");
  await page.waitForTimeout(250);
  await expectNoHudOverflow(page, true);
  await page.locator("main").click({ position: { x: 10, y: 100 } });
  await expect(page.getByTestId("global-hud-controls")).toHaveAttribute("aria-hidden", "true");
});

test("global chrome stays bounded on representative routes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem("quiz:gate:hub_visited", "1"));
  for (const route of ["/lol", "/quiz", "/profile", "/quiz/ranked"]) {
    await page.goto(route);
    await expect(page.getByTestId("global-hud-controls")).toBeVisible();
    await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
    await expectNoHudOverflow(page, true, false);
  }
});
