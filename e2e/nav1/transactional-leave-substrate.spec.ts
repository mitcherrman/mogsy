import { expect, test, type Page } from "@playwright/test";

const fixture = "/e2e/nav1/transactional-leave.html";

async function enterProtected(page: Page) {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Enter protected B" }).click();
  await expect(page.getByRole("heading", { name: "Protected B" })).toBeVisible();
}

test("cancelled browser Back adds no entry and a later Back is a fresh attempt", async ({ page }) => {
  await enterProtected(page);
  const length = await page.evaluate(() => history.length);

  await page.evaluate(() => history.back());
  const dialog = page.getByRole("alertdialog", { name: "Leave protected fixture?" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/__nav1-e1\/protected$/);
  await expect(page.getByRole("button", { name: "Stay" })).toBeFocused();
  await page.getByRole("button", { name: "Stay" }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/__nav1-e1\/protected$/);
  expect(await page.evaluate(() => history.length)).toBe(length);

  await page.evaluate(() => history.back());
  await expect(dialog).toBeVisible();
});

test("confirmed browser Back replays POP and browser Forward returns to B", async ({ page }) => {
  await enterProtected(page);
  const length = await page.evaluate(() => history.length);

  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(new RegExp(`${fixture}$`));
  expect(await page.evaluate(() => history.length)).toBe(length);

  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(/\/__nav1-e1\/protected$/);
  await expect(page.getByRole("heading", { name: "Protected B" })).toBeVisible();
});

test("guarded PUSH and REPLACE preserve their original history actions", async ({ page }) => {
  await enterProtected(page);
  const beforePush = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "Guarded PUSH" }).click();
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/__nav1-e1\/push$/);
  expect(await page.evaluate(() => history.length)).toBe(beforePush + 1);

  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/__nav1-e1\/protected$/);
  const beforeReplace = await page.evaluate(() => history.length);
  await page.getByRole("button", { name: "Guarded REPLACE" }).click();
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/__nav1-e1\/replace$/);
  expect(await page.evaluate(() => history.length)).toBe(beforeReplace);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(new RegExp(`${fixture}$`));
});

test("repeated Back while open retains the first pending POP", async ({ page }) => {
  await enterProtected(page);
  await page.evaluate(() => history.back());
  const dialog = page.getByRole("alertdialog", { name: "Leave protected fixture?" });
  await expect(dialog).toBeVisible();

  await page.evaluate(() => {
    history.back();
    history.forward();
  });
  await expect(page.getByRole("alertdialog")).toHaveCount(1);
  await page.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(new RegExp(`${fixture}$`));
});
