import { expect, test } from "@playwright/test";
for (const width of [320,390,1280]) {
 test(`owner's account overview and timeline readable at ${width}px`, async ({page})=>{
   await page.setViewportSize({width,height:width<400?750:900});
   await page.goto("/e2e/admin-account-journey/harness.html");
   await expect(page.getByTestId("admin-accounts-operations-pulse")).toBeVisible();
   await expect(page.getByTestId("admin-account-journey")).toBeVisible();
   await expect(page.getByTestId("admin-account-journey")).toContainText("Email confirmed");
   await expect(page.getByTestId("account-timeline")).toContainText("Legacy ledger");
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   expect(overflow,"no horizontal viewport overflow").toBeLessThanOrEqual(12);
   await page.getByTestId("account-timeline").scrollIntoViewIfNeeded();
   await expect(page.getByTestId("account-timeline")).toBeVisible();
 });
}
