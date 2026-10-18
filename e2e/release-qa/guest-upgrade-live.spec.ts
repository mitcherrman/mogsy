/**
 * RELEASE-QA — one real, bounded guest→permanent authentication + Daily
 * persistence smoke. THIS RUNS AGAINST THE EXISTING LIVE AUTH/BACKEND.
 * Intentional side effect: ONE QA-labelled real account and Daily parent run.
 * No actual user records are modified or cleaned. Never run on untrusted forks.
 * No passwords, session tokens, or JWTs are printed or attached.
 *
 * This does not assert completion of the actual Daily questions.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

test("fresh mobile guest starts Daily and retains the same run after account upgrade", async ({ page }) => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const email = `mogzy-launch-qa-${suffix}@mogzy.lol`;
  const username = `launchqa${suffix.slice(0, 6)}`;
  const password = `QA!${randomBytes(24).toString("base64url")}`;

  await page.goto("/quiz", { waitUntil: "domcontentloaded" });
  await expect.poll(async () => await page.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  }), { timeout: 25_000 }).toBeNull();

  // Real public Daily POST — intentionally mints one true guest identity.
  const before = await page.evaluate(async () => {
    const { httpDailyRunTransport } = await import("/src/lib/daily-challenge/run/client.ts");
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    const run = await httpDailyRunTransport.startToday();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error("missing authenticated guest after Daily creation");
    return { userId: data.user.id, anonymous: data.user.is_anonymous === true, runId: run.runId };
  });
  expect(before.anonymous, "Daily should start under a real anonymous guest").toBe(true);
  expect(before.runId).toBeTruthy();

  // Actual production signup UI and account-upgrade state machine.
  await page.goto("/auth?mode=signup&returnTo=%2Fquiz%2Fdaily-challenge");
  await expect(page.getByTestId("upgrade-username-input")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("upgrade-username-input").fill(username);
  await page.getByTestId("upgrade-email-input").fill(email);
  await page.getByTestId("upgrade-password-input").fill(password);
  await page.getByTestId("upgrade-submit").click();

  // No assumption that a form submission means a verified signup.
  await expect.poll(async () => await page.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return { userId: data.user.id, anonymous: data.user.is_anonymous === true };
  }), { timeout: 60_000 }).toEqual({ userId: before.userId, anonymous: false });

  // The server-owned Daily parent must still belong to the SAME JWT identity.
  const after = await page.evaluate(async () => {
    const { httpDailyRunTransport } = await import("/src/lib/daily-challenge/run/client.ts");
    const run = await httpDailyRunTransport.readToday();
    return run?.runId ?? null;
  });
  expect(after, "Daily parent persisted after same-UID permanent conversion").toBe(before.runId);

  // The app must not strand the guest in the auth form.
  await expect(page).toHaveURL(/\/(quiz|lol)(?:\/|\?|$)/, { timeout: 20_000 });
});
