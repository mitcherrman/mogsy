/**
 * Playwright capture engine: drives /dev/quiz-render deterministically and
 * collects QA signals per capture. Question data is injected locally via
 * addInitScript — the page never fetches it and no credentials reach the
 * browser context.
 */
import { chromium, type Browser, type Page } from "playwright";
import type { QaFinding } from "../../src/lib/quiz-screenshot/metadata";
import {
  collectDomQa,
  DOM_QA_ATTRIBUTES,
  EMPTY_LAYOUT,
  evaluateDomQa,
  type CaptureLayout,
  type DomQa,
  type LayoutRect,
} from "../../src/lib/quiz-screenshot/domQa";
import {
  QUIZ_RENDER_WINDOW_KEY,
  type RenderFormat,
  type RenderQuestion,
  type RenderState,
} from "../../src/lib/quiz-screenshot/types";

const READY_TIMEOUT_MS = 20_000;

export type CaptureQa = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  missingAssets: string[];
  overflowFindings: QaFinding[];
  warnings: QaFinding[];
  failures: QaFinding[];
};

// CC2 — layout geometry types live with the shared DOM sweep; re-exported here
// for existing importers.
export type { CaptureLayout, LayoutRect };

export type CaptureResult = {
  png: Buffer;
  qa: CaptureQa;
  /** Geometry of the card/CTA/QR for cross-state layout-stability checks. */
  layout: CaptureLayout;
  /** The zoom the harness actually rendered with (social formats). */
  usedScale: number | null;
};

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch();
}

/** Read the mounted harness through the shared sweep (src/lib/quiz-screenshot/domQa.ts). */
async function runDomQa(page: Page): Promise<DomQa> {
  return page.evaluate(collectDomQa, DOM_QA_ATTRIBUTES);
}

export async function captureOne(args: {
  browser: Browser;
  baseUrl: string;
  question: RenderQuestion;
  state: RenderState;
  format: RenderFormat;
  answerIndex?: number;
  expectedSelectedIndex: number | null;
  expectExplanation: boolean;
  /** Reuse the zoom fitted for an earlier state of the SAME question/format,
      so every state renders with one state-independent scale. */
  forcedScale?: number;
  /** Carousel slide kind (quiz|recap|app-cta|community|opening|summary|
      ending). Default "quiz". Answer-integrity QA only applies to the quiz
      card. */
  slide?: string;
  /** Difficulty/rank badge tier (iron|gold|diamond) to render on the slide. */
  difficulty?: string;
  /** Full ordered question list to inject (multi-question slides read more
      than the primary question — e.g. the answer summary). Defaults to just
      the primary question. */
  injectQuestions?: RenderQuestion[];
  /** Additional harness query params (progress/repeat/mid/qids/sum*). Keys
      and values are appended via URLSearchParams — never shell-interpolated. */
  extraParams?: Record<string, string>;
  /** CON1 Step 1D diagnostic override (--allow-incomplete-presentation).
      Default false: an unrendered safe presentation fails the capture. */
  allowIncompletePresentation?: boolean;
  /** CON1 Step 1E diagnostic override (--allow-missing-assets). */
  allowMissingAssets?: boolean;
}): Promise<CaptureResult> {
  const { browser, baseUrl, question, state, format } = args;
  const slideKind = args.slide ?? "quiz";
  const context = await browser.newContext({
    viewport: { width: format.width, height: format.height },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
  });
  const qa: CaptureQa = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    missingAssets: [],
    overflowFindings: [],
    warnings: [],
    failures: [],
  };
  try {
    await context.addInitScript(
      ({ key, questions }) => {
        (window as unknown as Record<string, unknown>)[key] = { questions };
      },
      { key: QUIZ_RENDER_WINDOW_KEY, questions: args.injectQuestions ?? [question] },
    );
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") qa.consoleErrors.push(msg.text().slice(0, 500));
    });
    page.on("pageerror", (err) => qa.pageErrors.push(String(err).slice(0, 500)));
    page.on("requestfailed", (req) => {
      qa.failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
    });
    page.on("response", (res) => {
      if (res.status() >= 400) qa.failedRequests.push(`HTTP ${res.status()} ${res.url()}`);
    });

    const search = new URLSearchParams({
      q: String(question.id),
      state,
      format: format.key,
    });
    if (args.answerIndex !== undefined) search.set("answerIndex", String(args.answerIndex));
    if (args.forcedScale !== undefined) search.set("scale", String(args.forcedScale));
    if (slideKind !== "quiz") search.set("slide", slideKind);
    if (args.difficulty) search.set("difficulty", args.difficulty);
    for (const [k, v] of Object.entries(args.extraParams ?? {})) search.set(k, v);
    await page.goto(`${baseUrl}/dev/quiz-render?${search}`, { waitUntil: "domcontentloaded" });

    const errorPanel = page.locator("[data-quiz-render-error]");
    const ready = page.locator('[data-quiz-render-ready="true"]');
    try {
      await Promise.race([
        ready.waitFor({ state: "attached", timeout: READY_TIMEOUT_MS }),
        errorPanel.waitFor({ state: "attached", timeout: READY_TIMEOUT_MS }),
      ]);
    } catch {
      qa.failures.push({
        severity: "failure",
        code: "ready-timeout",
        message: `Render-ready marker did not appear within ${READY_TIMEOUT_MS / 1000}s`,
        format: format.key,
        state,
      });
      const png = await page.screenshot();
      return { png, qa, layout: EMPTY_LAYOUT, usedScale: null };
    }
    if (await errorPanel.count()) {
      const msg = (await errorPanel.textContent())?.trim().slice(0, 300) ?? "unknown harness error";
      qa.failures.push({
        severity: "failure",
        code: "harness-error",
        message: msg,
        format: format.key,
        state,
      });
      const png = await page.screenshot();
      return { png, qa, layout: EMPTY_LAYOUT, usedScale: null };
    }

    const dom = await runDomQa(page);
    const scaleAttr = await page
      .locator("[data-quiz-render-stage]")
      .getAttribute("data-render-scale");
    const usedScale = scaleAttr !== null && Number.isFinite(Number(scaleAttr))
      ? Number(scaleAttr)
      : null;
    // CC2 — the findings come from the shared rules (src/lib/quiz-screenshot/
    // domQa.ts), which the browser export applies too. Same rules, same order.
    const verdict = evaluateDomQa(dom, {
      question,
      format,
      state,
      slideKind,
      expectExplanation: args.expectExplanation,
      allowIncompletePresentation: args.allowIncompletePresentation === true,
      allowMissingAssets: args.allowMissingAssets === true,
    });
    qa.failures.push(...verdict.failures);
    qa.warnings.push(...verdict.warnings);
    qa.overflowFindings.push(...verdict.overflowFindings);
    qa.missingAssets.push(...verdict.missingAssets);

    const stage = page.locator("[data-quiz-render-stage]");
    const png =
      format.kind === "social"
        ? await stage.screenshot()
        : await page.screenshot({ fullPage: false });
    return { png, qa, layout: dom.layout as unknown as CaptureLayout, usedScale };
  } finally {
    await context.close();
  }
}
