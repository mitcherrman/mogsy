/**
 * Content Creator (/admin/content-creator) — end-to-end acceptance.
 *
 * Hermetic: the app runs on a Vite dev server in `e2e` mode with the
 * double-gated E2E identity seam (`src/lib/e2e/identity.ts`, dead-code-
 * eliminated from production builds). Supabase is a placeholder host and every
 * request to it is answered here; the combat backend is the loopback
 * `scripts/quiz-screenshots/ci-asset-stub.ts` (images), with the admin session
 * and review endpoints answered here from the visual-QA fixture. No request
 * leaves the runner — no production database, no Railway.
 *
 *   npx playwright test -c playwright.content-creator.config.ts
 *
 * Proves: owner access; non-owner and signed-out refusal; the bank loads and
 * filters; every Content Studio mode generates; previews are byte-identical to
 * the ZIP; manifest answers match the bank; PNG and ZIP downloads are valid;
 * a QA failure is reported (no file); cancellation; local history; nothing
 * writes to the question API; existing Admin routes still render.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { expect, test, type Page, type Route } from "@playwright/test";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SUPABASE = "https://e2e-supabase.test";
const API = "http://127.0.0.1:8000";
const OWNER = { token: "cc-owner-token", user: { id: "owner-1", email: "owner@example.test", is_anonymous: false }, admin: true };
const MEMBER = { token: "cc-member-token", user: { id: "member-1", email: "member@example.test", is_anonymous: false }, admin: false };

const FIXTURE = JSON.parse(
  readFileSync(path.resolve("scripts/quiz-screenshots/visual-qa-fixture.json"), "utf8"),
) as { questions: Json[] };

/** The fixture as stored review rows: numeric ids, approved, live. */
const ROWS: Json[] = FIXTURE.questions.map((q, i) => ({
  ...q,
  id: 101 + i,
  is_active: true,
  review_status: "approved",
  favorite_for_shorts: false,
  missing_asset: false,
  correct_answer: typeof q.correct_answer === "string" ? { type: "exact", value: q.correct_answer } : q.correct_answer,
}));
const byId = new Map(ROWS.map((r) => [r.id, r]));
const answerOf = (r: Json) => (typeof r.correct_answer === "string" ? r.correct_answer : r.correct_answer?.value);
/** Plain rows that render with any stub image: no premise media, no required asset. */
const PLAIN = ROWS.filter((r) => ["vq-01", "vq-02", "vq-08", "vq-10"].includes(FIXTURE.questions[r.id - 101].id)).map((r) => r.id);

type Backend = { writes: string[]; listQueries: URLSearchParams[] };

async function hermetic(page: Page, persona: Json | null): Promise<Backend> {
  const be: Backend = { writes: [], listQueries: [] };
  await page.addInitScript((p) => {
    localStorage.setItem("lol:ranked-rules:seen_version", "1");
    if (p) localStorage.setItem("mogsy_e2e_identity", JSON.stringify(p));
  }, persona);
  const cors = (route: Route) => ({
    "access-control-allow-origin": route.request().headers().origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, prefer",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  });
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", headers: cors(route), body: JSON.stringify(body) });

  await page.route(`${SUPABASE}/**`, (route) =>
    route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers: cors(route) }) : json(route, []),
  );
  await page.route(`${API}/api/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors(route) });
    const url = new URL(req.url());
    if (url.pathname.startsWith("/api/quiz/admin") && req.method() !== "GET") be.writes.push(`${req.method()} ${url.pathname}`);
    if (url.pathname === "/api/assets/champions") return route.fallback();
    const authed = (req.headers().authorization ?? "") === `Bearer ${OWNER.token}`;
    if (url.pathname === "/api/admin/session") {
      return authed
        ? json(route, { authorized: true, auth_method: "supabase_owner", user_id: OWNER.user.id, email: OWNER.user.email })
        : json(route, { detail: "forbidden" }, 403);
    }
    if (url.pathname.startsWith("/api/quiz/admin/")) {
      if (!authed) return json(route, { detail: "Owner authorization required" }, 403);
      if (url.pathname === "/api/quiz/admin/review/filter-options") {
        return json(route, {
          ok: true,
          categories: [...new Set(ROWS.map((r) => r.category))].sort(),
          source_types: [],
          formats: ["multiple_choice"],
          review_statuses: ["approved", "needs_fix", "rejected", "unreviewed"],
          packs: [],
        });
      }
      if (url.pathname === "/api/quiz/admin/review/questions") {
        be.listQueries.push(url.searchParams);
        const search = (url.searchParams.get("search") ?? "").toLowerCase();
        const category = url.searchParams.get("category");
        const page = Number(url.searchParams.get("page") ?? 1);
        const size = Number(url.searchParams.get("page_size") ?? 20);
        const hits = ROWS.filter(
          (r) => (!category || r.category === category) && (!search || String(r.question_text).toLowerCase().includes(search)),
        );
        return json(route, {
          ok: true, total: hits.length, page, page_size: size, pages: Math.max(1, Math.ceil(hits.length / size)),
          questions: hits.slice((page - 1) * size, page * size),
        });
      }
      const one = url.pathname.match(/^\/api\/quiz\/admin\/review\/questions\/(\d+)$/);
      if (one) {
        const row = byId.get(Number(one[1]));
        return row ? json(route, { ok: true, question: row }) : json(route, { ok: false }, 404);
      }
    }
    return json(route, { ok: false, detail: "not served in this test" }, 404);
  });
  return be;
}

async function openOwner(page: Page, query = ""): Promise<Backend> {
  const be = await hermetic(page, OWNER);
  await page.goto(`/admin/content-creator${query}`);
  await expect(page.getByTestId("cc-bank")).toBeVisible({ timeout: 30_000 });
  return be;
}

async function pick(page: Page, ids: number[]) {
  for (const id of ids) {
    await page.getByTestId(`cc-bank-add-${id}`).click();
    await expect(page.getByTestId(`cc-selected-${id}`)).toBeVisible();
  }
}

async function useOnly(page: Page, format: string) {
  for (const key of ["mobile-social", "square", "vertical", "landscape"]) {
    const chip = page.getByTestId(`cc-format-${key}`);
    const on = (await chip.getAttribute("aria-pressed")) === "true";
    if (on !== (key === format)) await chip.click();
  }
}

async function generate(page: Page) {
  await expect(page.getByTestId("cc-generate")).toBeEnabled();
  await page.getByTestId("cc-generate").click();
  await expect(page.getByTestId("cc-result")).toBeVisible({ timeout: 240_000 });
}

/** SHA-256 of every preview image's bytes, keyed by `<runId>/<path>`. */
async function previewHashes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const out: Record<string, string> = {};
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('[data-testid="cc-preview-image"]'))) {
      const bytes = await (await fetch(img.src)).arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      out[img.dataset.path!] = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return out;
  });
}

async function downloadZip(page: Page): Promise<{ name: string; zip: JSZip }> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("cc-download-zip").click()]);
  const file = await download.path();
  return { name: download.suggestedFilename(), zip: await JSZip.loadAsync(readFileSync(file!)) };
}

function pngSize(bytes: Buffer) {
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The archive holds exactly the previews, byte for byte, with valid reports. */
async function assertArchiveMatchesPreviews(page: Page, expectRuns: number) {
  const hashes = await previewHashes(page);
  const { zip } = await downloadZip(page);
  const pngs = Object.keys(zip.files).filter((n) => n.endsWith(".png"));
  expect(pngs.sort()).toEqual(Object.keys(hashes).sort());
  for (const name of pngs) {
    const bytes = Buffer.from(await zip.file(name)!.async("uint8array"));
    expect(createHash("sha256").update(bytes).digest("hex"), `preview == archive for ${name}`).toBe(hashes[name]);
    pngSize(bytes);
  }
  const manifests = Object.keys(zip.files).filter((n) => n.endsWith("/manifest.json"));
  expect(manifests).toHaveLength(expectRuns);
  for (const m of manifests) {
    const run = m.split("/")[0];
    const manifest = JSON.parse(await zip.file(m)!.async("string"));
    expect(zip.file(`${run}/index.html`), "contact sheet").toBeTruthy();
    expect(JSON.parse(await zip.file(`${run}/failures.json`)!.async("string"))).toEqual([]);
    expect(manifest.completed).toBe(true);
    expect(manifest.generator.version).toBe("browser-export-1");
    for (const q of manifest.questions) expect(q.correct_label).toBe(answerOf(byId.get(Number(q.id))!));
    for (const s of manifest.slides) {
      const size = pngSize(Buffer.from(await zip.file(`${run}/${s.file}`)!.async("uint8array")));
      expect(size).toEqual({ width: s.width, height: s.height });
    }
  }
  return zip;
}

test.describe("access", () => {
  test("a non-owner is turned away and never sees the creator", async ({ page }) => {
    await hermetic(page, MEMBER);
    await page.goto("/admin/content-creator");
    await expect(page).not.toHaveURL(/content-creator/, { timeout: 30_000 });
    await expect(page.getByTestId("admin-content-creator")).toHaveCount(0);
  });

  test("a signed-out visitor is turned away", async ({ page }) => {
    await hermetic(page, null);
    await page.goto("/admin/content-creator");
    await expect(page).not.toHaveURL(/content-creator/, { timeout: 30_000 });
    await expect(page.getByTestId("cc-bank")).toHaveCount(0);
  });
});

test.describe("owner", () => {
  test("the bank loads, filters, and shows answers and eligibility", async ({ page }) => {
    const be = await openOwner(page);
    const first = ROWS[0];
    await expect(page.getByTestId(`cc-bank-row-${first.id}`)).toContainText(String(first.question_text));
    await expect(page.getByTestId(`cc-bank-row-${first.id}`).getByTestId("cc-bank-answer")).toContainText(answerOf(first));
    await page.getByTestId("cc-bank-category").selectOption("items");
    await expect.poll(() => be.listQueries.some((q) => q.get("category") === "items")).toBe(true);
    for (const row of await page.locator('[data-testid^="cc-bank-row-"]').all()) {
      const id = Number((await row.getAttribute("data-testid"))!.replace("cc-bank-row-", ""));
      expect(byId.get(id)!.category).toBe("items");
    }
    expect(be.listQueries[0].get("review_status")).toBe("approved");
    expect(be.writes).toEqual([]);
  });

  test("single-question post: previews match the ZIP and a single PNG downloads", async ({ page }) => {
    const be = await openOwner(page);
    await useOnly(page, "square");
    await page.getByTestId("cc-mode-single-question").click();
    await pick(page, PLAIN.slice(0, 2));
    await expect(page.getByTestId("cc-plan-summary")).toContainText("4 images");
    await generate(page);
    await expect(page.getByTestId("cc-result")).toHaveAttribute("data-status", "succeeded");
    await expect(page.getByTestId("cc-preview-image")).toHaveCount(4);
    await assertArchiveMatchesPreviews(page, 1);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("cc-download-png").first().click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(pngSize(readFileSync((await download.path())!))).toEqual({ width: 1080, height: 1080 });
    expect(be.writes).toEqual([]);
  });

  test("classic quiz with the reveal state", async ({ page }) => {
    await openOwner(page);
    await useOnly(page, "mobile-social");
    await page.getByTestId("cc-mode-classic").click();
    await pick(page, [PLAIN[0]]);
    await generate(page);
    await expect(page.getByTestId("cc-result")).toHaveAttribute("data-status", "succeeded");
    await expect(page.getByTestId("cc-preview-image")).toHaveCount(2);
    await assertArchiveMatchesPreviews(page, 1);
  });

  test("answer reveal", async ({ page }) => {
    await openOwner(page);
    await useOnly(page, "vertical");
    await page.getByTestId("cc-mode-answer-reveal").click();
    await pick(page, [PLAIN[1]]);
    await generate(page);
    await expect(page.getByTestId("cc-result")).toHaveAttribute("data-status", "succeeded");
    await expect(page.getByTestId("cc-preview-image")).toHaveCount(3);
    await assertArchiveMatchesPreviews(page, 1);
  });

  test("multi-question challenge with copy variants", async ({ page }) => {
    await openOwner(page);
    await useOnly(page, "square");
    await page.getByTestId("cc-mode-multi-question").click();
    await pick(page, PLAIN.slice(0, 3));
    await page.getByTestId("cc-repeat").selectOption("1");
    await page.getByTestId("cc-mid").selectOption("2");
    await generate(page);
    await expect(page.getByTestId("cc-result")).toHaveAttribute("data-status", "succeeded");
    await expect(page.getByTestId("cc-preview-image")).toHaveCount(6);
    const zip = await assertArchiveMatchesPreviews(page, 1);
    const manifest = JSON.parse(await zip.file(/manifest\.json$/)[0].async("string"));
    expect(manifest.slides.map((s: Json) => s.slug)).toEqual(["opening", "q01", "q02", "q03", "answers", "ending"]);
    expect(manifest.challenge).toMatchObject({ question_count: 3, repeat_variant: 1, mid_cta_variant: 2 });
  });

  test("daily content package: three runs and a package manifest", async ({ page }) => {
    await openOwner(page);
    await useOnly(page, "square");
    await page.getByTestId("cc-mode-daily-package").click();
    await pick(page, PLAIN.slice(0, 3));
    await page.getByTestId(`cc-feature-${PLAIN[1]}`).click();
    await page.getByTestId("cc-run-name").fill("e2e-daily");
    await generate(page);
    await expect(page.getByTestId("cc-result")).toHaveAttribute("data-status", "succeeded");
    // 2 + 3 + (opening + 3 questions + answers + ending)
    await expect(page.getByTestId("cc-preview-image")).toHaveCount(11);
    const zip = await assertArchiveMatchesPreviews(page, 3);
    const pkg = JSON.parse(await zip.file("e2e-daily-package.json")!.async("string"));
    expect(pkg.featured_question_id).toBe(String(PLAIN[1]));
    expect(pkg.posts.map((p: Json) => p.run_id)).toEqual([
      "e2e-daily-post-1-single-question",
      "e2e-daily-post-2-answer-reveal",
      "e2e-daily-post-3-multi-question",
    ]);
  });

  test("a card that fails QA is reported and withheld, never shipped", async ({ page }) => {
    await openOwner(page);
    // Break every image a recipe card draws: the missing-asset check must fail it.
    await page.route(`${API}/assets/items/**`, (route) => route.fulfill({ status: 404, body: "" }));
    await useOnly(page, "square");
    await page.getByTestId("cc-mode-classic").click();
    await page.getByTestId("cc-state-correct").click(); // question only
    const recipe = ROWS.find((r) => FIXTURE.questions[r.id - 101].id === "vq-04")!;
    await pick(page, [recipe.id, PLAIN[0]]);
    await generate(page);
    await expect(page.getByTestId("cc-result")).toHaveAttribute("data-status", "failed");
    await expect(page.getByTestId("cc-failures")).toContainText(/missing-asset|unloadable-image|unresolved-subject-image/);
    const paths = await page.getByTestId("cc-preview-image").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.path));
    expect(paths.some((p) => p?.includes(`question_000${recipe.id}`))).toBe(false);
    expect(paths.some((p) => p?.includes(`question_000${PLAIN[0]}`))).toBe(true);
  });

  test("cancel stops the run and says so", async ({ page }) => {
    await openOwner(page);
    await useOnly(page, "mobile-social");
    for (const key of ["square", "vertical", "landscape"]) await page.getByTestId(`cc-format-${key}`).click();
    await page.getByTestId("cc-mode-multi-question").click();
    await pick(page, PLAIN.slice(0, 4));
    await page.getByTestId("cc-generate").click();
    await expect(page.getByTestId("cc-progress")).toBeVisible();
    await page.getByTestId("cc-cancel").click();
    await expect(page.getByTestId("cc-result")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("cc-result")).toHaveAttribute("data-status", "failed");
    await expect(page.getByTestId("cc-result-status")).toContainText("cancelled");
    expect(await page.getByTestId("cc-preview-image").count()).toBeLessThan(28);
  });

  test("history keeps a run across reloads and reopens it from its archive", async ({ page }) => {
    await openOwner(page);
    await useOnly(page, "square");
    await page.getByTestId("cc-mode-single-question").click();
    await pick(page, [PLAIN[0]]);
    await page.getByTestId("cc-run-name").fill("history-check");
    await generate(page);
    await expect(page.getByTestId("cc-history-row").first()).toContainText("history-check");
    await page.reload();
    await expect(page.getByTestId("cc-history-row").first()).toContainText("history-check", { timeout: 30_000 });
    await page.getByTestId("cc-history-row").first().getByRole("button").first().click();
    await expect(page.getByTestId("cc-preview-image")).toHaveCount(2);
  });

  test("Quiz Review hand-off preselects questions", async ({ page }) => {
    await openOwner(page, `?ids=${PLAIN[0]},${PLAIN[1]}`);
    await expect(page.getByTestId(`cc-selected-${PLAIN[0]}`)).toBeVisible();
    await expect(page.getByTestId(`cc-selected-${PLAIN[1]}`)).toBeVisible();
  });

  test("existing Admin routes still render", async ({ page }) => {
    await hermetic(page, OWNER);
    await page.goto("/admin/studio?section=video-social");
    await expect(page.getByTestId("admin-tool-content-creator")).toBeVisible({ timeout: 30_000 });
    await page.goto("/admin/quiz-content");
    await expect(page.getByText("Quiz Review").first()).toBeVisible({ timeout: 30_000 });
    await page.goto("/admin/quiz-broadcast");
    await expect(page).toHaveURL(/\/admin\/quiz-broadcast/);
  });
});
