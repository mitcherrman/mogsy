import { expect, test, type Page } from "@playwright/test";

const SUPABASE = "https://e2e-supabase.test";
const row = {
  id: "fb-1", profile_id: "p-1", entry_intent: "question_report", type: "bug", category: "Ranked",
  legacy_category: null, page_reference: null, page_url: "/quiz/ranked", title: "Incorrect answer — Ranked",
  body: "Thornmail gives more armor than Warmog's.", status: "open", priority: "normal", severity: null,
  reproducibility: null, expected_result: null, actual_result: null, evidence_url: null, screenshot_path: null,
  client_meta: { ua: "TestAgent/1.0", viewport: "1440x900", app_version: "build-123" },
  report_context: {
    kind: "question_report", v: 1, reason: "incorrect_answer", mode: "Ranked", route: "/quiz/ranked",
    captured_at: "2026-09-13T10:00:00.000Z", prompt: "Which item gives the most armor?",
    choices: ["Thornmail", "Warmog's", "Bloodthirster"], canonical_answer: "Warmog's", selected_answer: "Thornmail",
    runtime_question_id: "q-77", round_number: 3,
  },
  admin_notes: "", is_archived: false, upvotes: 0, created_at: "2026-09-13T10:00:00.000Z",
};

async function mockSupabase(page: Page) {
  await page.route(`${SUPABASE}/**`, async route => {
    const request = route.request();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = request.url();
    const asObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    let body: unknown = asObject ? { value: null } : [];
    if (url.includes("/rpc/admin_list_feedback")) body = [row];
    else if (url.includes("/public_profiles")) body = [{ id: "p-1", display_name: "Summoner One", avatar_url: null }];
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  });
}

for (const width of [320, 390, 1280]) {
  test(`feedback report explains itself at ${width}px`, async ({ page }) => {
    await mockSupabase(page);
    await page.setViewportSize({ width, height: width < 400 ? 750 : 900 });
    await page.goto("/e2e/admin-audience-journeys/feedback.html");
    await page.getByText("Incorrect answer — Ranked").first().click();
    const summary = page.getByTestId("feedback-plain-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("Summoner One");
    await expect(summary).toContainText("Which item gives the most armor?");
    await expect(summary).toContainText("Player selected: Thornmail");
    await expect(summary).toContainText("not independently checked");
    const technical = page.locator("details", { hasText: "Technical details (for investigating)" });
    await expect(technical).not.toHaveAttribute("open", "");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no horizontal viewport overflow").toBeLessThanOrEqual(12);
  });
}
