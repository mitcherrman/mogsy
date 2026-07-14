/**
 * Playwright capture engine: drives /dev/quiz-render deterministically and
 * collects QA signals per capture. Question data is injected locally via
 * addInitScript — the page never fetches it and no credentials reach the
 * browser context.
 */
import { chromium, type Browser, type Page } from "playwright";
import type { QaFinding } from "../../src/lib/quiz-screenshot/metadata";
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

export type LayoutRect = { x: number; y: number; w: number; h: number };
export type CaptureLayout = {
  card: LayoutRect | null;
  cta: LayoutRect | null;
  qr: LayoutRect | null;
  phone: LayoutRect | null;
  screen: LayoutRect | null;
  island: LayoutRect | null;
  scan: LayoutRect | null;
  resultArea: LayoutRect | null;
};

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

type DomQa = {
  ctaPresent: boolean;
  ctaText: string;
  cardClipped: boolean;
  cardOverlapsCta: boolean;
  missingAssets: string[];
  horizontalScroll: boolean;
  clippedElements: string[];
  offscreenChoices: number[];
  visibleChoiceStates: string[];
  feedbackVisible: boolean;
  explanationText: string | null;
  /** Structural CTA placement: text strip above the card, QR below it,
      and never combined into one panel. */
  ctaAboveCard: boolean;
  qrBelowCard: boolean;
  qrInsideCtaPanel: boolean;
  /** Phone-composition checks. */
  phonePresent: boolean;
  phoneBottomCropped: boolean;
  allContentInsideScreen: boolean;
  contentOutsideScreen: string[];
  islandClearOfContent: boolean;
  correctRowContrast: number | null;
  /** Layout geometry for cross-state stability checks (px, page space). */
  layout: Record<string, { x: number; y: number; w: number; h: number } | null>;
};

async function runDomQa(page: Page): Promise<DomQa> {
  return page.evaluate(() => {
    const doc = document;
    const missingAssets: string[] = [];
    doc.querySelectorAll("img").forEach((img) => {
      if (img.complete && img.naturalWidth === 0) missingAssets.push(img.src);
    });

    const root = doc.documentElement;
    const horizontalScroll = root.scrollWidth > root.clientWidth + 1;

    const stage = doc.querySelector("[data-quiz-render-stage]");
    const stageRect = stage?.getBoundingClientRect();

    const clippedElements: string[] = [];
    const offscreenChoices: number[] = [];
    const visibleChoiceStates: string[] = [];
    doc.querySelectorAll<HTMLElement>("[data-quiz-choice]").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-quiz-choice"));
      visibleChoiceStates.push(btn.getAttribute("data-choice-state") ?? "missing");
      const r = btn.getBoundingClientRect();
      if (
        stageRect &&
        (r.right > stageRect.right + 1 ||
          r.bottom > stageRect.bottom + 1 ||
          r.left < stageRect.left - 1 ||
          r.top < stageRect.top - 1)
      ) {
        offscreenChoices.push(idx);
      }
      // Conservative text-clipping check on the label span.
      btn.querySelectorAll<HTMLElement>("span").forEach((span) => {
        if (span.scrollWidth > span.clientWidth + 1 || span.scrollHeight > span.clientHeight + 1) {
          clippedElements.push(`choice ${idx}: "${(span.textContent ?? "").slice(0, 40)}"`);
        }
      });
    });

    // Feedback counts as VISIBLE only when it actually paints. The reserved
    // result-area spacer (visibility:hidden inside [data-quiz-result-placeholder])
    // keeps the card height identical across states and must not register as
    // a pre-reveal leak — while any painted feedback still does.
    const feedbackEls = Array.from(
      doc.querySelectorAll<HTMLElement>("[data-quiz-answer-feedback]"),
    );
    const feedback = feedbackEls.find(
      (el) =>
        getComputedStyle(el).visibility !== "hidden" &&
        !el.closest("[data-quiz-result-placeholder]"),
    ) ?? null;
    const explanationText =
      feedback?.querySelector("p.text-xs.opacity-80")?.textContent ?? null;
    const ctaPresent = !!doc.querySelector("[data-quiz-cta]");
    const ctaText = doc.querySelector("[data-quiz-cta]")?.textContent ?? "";

    // Content card must sit fully inside the stage and clear of the CTA.
    let cardClipped = false;
    let cardOverlapsCta = false;
    const card = doc.querySelector("[data-quiz-content-card]");
    if (card && stageRect) {
      const r = card.getBoundingClientRect();
      cardClipped =
        r.top < stageRect.top - 1 ||
        r.bottom > stageRect.bottom + 1 ||
        r.left < stageRect.left - 1 ||
        r.right > stageRect.right + 1;
      const cta = doc.querySelector("[data-quiz-cta]");
      if (cta) {
        const c = cta.getBoundingClientRect();
        cardOverlapsCta = r.bottom > c.top + 1 && c.bottom > r.top + 1 && r.right > c.left + 1 && c.right > r.left + 1;
      }
    }

    // Structural placement: the CTA text strip must sit fully ABOVE the card
    // and the QR fully BELOW it; the QR must never live inside the CTA strip
    // (no combined panel).
    const ctaEl = doc.querySelector("[data-quiz-cta]");
    const qrEl = doc.querySelector("[data-quiz-cta-qr]");
    let ctaAboveCard = true;
    let qrBelowCard = true;
    const qrInsideCtaPanel = !!(ctaEl && qrEl && ctaEl.contains(qrEl));
    if (card) {
      const cardR = card.getBoundingClientRect();
      if (ctaEl) ctaAboveCard = ctaEl.getBoundingClientRect().bottom <= cardR.top + 1;
      if (qrEl) qrBelowCard = qrEl.getBoundingClientRect().top >= cardR.bottom - 1;
    }

    // Phone-composition checks. Everything (CTA, card, QR, caption) must sit
    // inside the phone screen; the phone's bottom hardware edge must be
    // cropped out of the frame; the arched hood must overlap the CTA region
    // and reach below the card's top edge at the sides (framing its corners)
    // WITHOUT covering any card text (card padding keeps text clear).
    const phoneEl = doc.querySelector("[data-quiz-phone]");
    const screenEl = doc.querySelector("[data-quiz-phone-screen]");
    const hoodEl = doc.querySelector("[data-quiz-phone-island]");
    const scanEl = doc.querySelector("[data-quiz-cta-scan]");
    const phonePresent = !!(phoneEl && screenEl && hoodEl);
    let phoneBottomCropped = false;
    let allContentInsideScreen = true;
    const contentOutsideScreen: string[] = [];
    let islandClearOfContent = true;
    if (phonePresent && stageRect) {
      const phoneR = phoneEl!.getBoundingClientRect();
      phoneBottomCropped = phoneR.bottom >= stageRect.bottom + 8;
      const screenR = screenEl!.getBoundingClientRect();
      const named: Array<[string, Element | null]> = [
        ["cta", ctaEl],
        ["card", card],
        ["qr", qrEl],
        ["scan", scanEl],
      ];
      for (const [label, el] of named) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const inside =
          r.left >= screenR.left - 1 &&
          r.right <= screenR.right + 1 &&
          r.top >= screenR.top - 1 &&
          r.bottom <= stageRect.bottom + 1;
        if (!inside) {
          allContentInsideScreen = false;
          contentOutsideScreen.push(label);
        }
      }
      const islandR = hoodEl!.getBoundingClientRect();
      // The island pill must sit clear of every content element — the frame
      // supports the content, it never overlays it.
      islandClearOfContent = true;
      for (const [, el] of named) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const overlaps =
          islandR.bottom > r.top + 1 && r.bottom > islandR.top + 1 &&
          islandR.right > r.left + 1 && r.right > islandR.left + 1;
        if (overlaps) islandClearOfContent = false;
      }
    }

    // Jade correct-row contrast (correct state only): text vs row background.
    let correctRowContrast: number | null = null;
    const correctBtn = doc.querySelector<HTMLElement>(
      '[data-quiz-choice][data-choice-state="correct"]',
    );
    if (correctBtn) {
      // Straight-line WCAG contrast computation — no const-assigned helper
      // functions (tsx/esbuild keepNames breaks those inside page.evaluate).
      const cs = getComputedStyle(correctBtn);
      const rgbRe = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/;
      const fgMatch = cs.color.match(rgbRe);
      let bgMatch = cs.backgroundColor.match(rgbRe);
      if ((!bgMatch || cs.backgroundColor.includes("0, 0, 0, 0")) && cs.backgroundImage) {
        bgMatch = cs.backgroundImage.match(rgbRe); // first gradient stop
      }
      if (fgMatch && bgMatch) {
        const lums: number[] = [];
        for (const m of [fgMatch, bgMatch]) {
          const parts = [Number(m[1]), Number(m[2]), Number(m[3])];
          const weights = [0.2126, 0.7152, 0.0722];
          let lumTotal = 0;
          for (let i = 0; i < 3; i++) {
            const c = parts[i] / 255;
            const lin = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            lumTotal += weights[i] * lin;
          }
          lums.push(lumTotal);
        }
        const l1 = Math.max(lums[0], lums[1]);
        const l2 = Math.min(lums[0], lums[1]);
        correctRowContrast = Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
      }
    }

    // NOTE: no named const-function here at top level — tsx/esbuild keepNames
    // helpers do not exist inside page.evaluate.
    const layoutTargets: Array<[string, Element | null]> = [
      ["card", card],
      ["cta", ctaEl],
      ["qr", qrEl],
      ["phone", phoneEl],
      ["screen", screenEl],
      ["island", hoodEl],
      ["scan", scanEl],
      ["resultArea", doc.querySelector("[data-quiz-result-area]")],
    ];
    const layout: Record<string, { x: number; y: number; w: number; h: number } | null> = {};
    for (const [label, el] of layoutTargets) {
      if (!el) {
        layout[label] = null;
      } else {
        const r = el.getBoundingClientRect();
        layout[label] = {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      }
    }

    return {
      ctaPresent,
      ctaText,
      cardClipped,
      cardOverlapsCta,
      missingAssets,
      horizontalScroll,
      clippedElements,
      offscreenChoices,
      visibleChoiceStates,
      feedbackVisible: !!feedback,
      explanationText,
      ctaAboveCard,
      qrBelowCard,
      qrInsideCtaPanel,
      phonePresent,
      phoneBottomCropped,
      allContentInsideScreen,
      contentOutsideScreen,
      islandClearOfContent,
      correctRowContrast,
      layout,
    };
  });
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
}): Promise<CaptureResult> {
  const { browser, baseUrl, question, state, format } = args;
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
      { key: QUIZ_RENDER_WINDOW_KEY, questions: [question] },
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
      return { png, qa, layout: { card: null, cta: null, qr: null }, usedScale: null };
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
      return { png, qa, layout: { card: null, cta: null, qr: null }, usedScale: null };
    }

    const dom = await runDomQa(page);
    const scaleAttr = await page
      .locator("[data-quiz-render-stage]")
      .getAttribute("data-render-scale");
    const usedScale = scaleAttr !== null && Number.isFinite(Number(scaleAttr))
      ? Number(scaleAttr)
      : null;
    qa.missingAssets.push(...dom.missingAssets);
    if (dom.missingAssets.length) {
      qa.failures.push({
        severity: "failure",
        code: "missing-asset",
        message: `${dom.missingAssets.length} image(s) failed to load`,
        format: format.key,
        state,
      });
    }
    if (dom.horizontalScroll && format.kind === "audit") {
      qa.overflowFindings.push({
        severity: "failure",
        code: "horizontal-scroll",
        message: "Document scrolls horizontally at this viewport",
        format: format.key,
        state,
      });
    }
    for (const c of dom.clippedElements) {
      qa.overflowFindings.push({
        severity: "warning",
        code: "text-clipping",
        message: c,
        format: format.key,
        state,
      });
    }
    if (dom.offscreenChoices.length) {
      qa.overflowFindings.push({
        severity: "failure",
        code: "choice-outside-stage",
        message: `Answer button(s) ${dom.offscreenChoices.join(",")} extend outside the capture stage`,
        format: format.key,
        state,
      });
    }

    if (dom.cardClipped) {
      qa.failures.push({
        severity: "failure",
        code: "card-clipped",
        message: "Content card extends outside the stage frame",
        format: format.key,
        state,
      });
    }
    if (dom.cardOverlapsCta) {
      qa.failures.push({
        severity: "failure",
        code: "cta-overlap",
        message: "Content card overlaps the CTA footer",
        format: format.key,
        state,
      });
    }

    // Content formats must carry the CTA with the visible mogsy.app link.
    if (format.cta !== "none") {
      if (!dom.ctaPresent) {
        qa.failures.push({
          severity: "failure",
          code: "cta-missing",
          message: "Content format rendered without the CTA footer",
          format: format.key,
          state,
        });
      } else if (!dom.ctaText.includes("mogsy.app")) {
        qa.failures.push({
          severity: "failure",
          code: "cta-missing",
          message: "CTA footer does not show the mogsy.app link text",
          format: format.key,
          state,
        });
      }
      // Required screenshot structure: CTA strip above the card, QR below
      // it, and never combined into one panel.
      if (!dom.ctaAboveCard) {
        qa.failures.push({
          severity: "failure",
          code: "cta-placement",
          message: "CTA strip is not fully above the quiz card",
          format: format.key,
          state,
        });
      }
      if (!dom.qrBelowCard) {
        qa.failures.push({
          severity: "failure",
          code: "cta-placement",
          message: "QR code is not fully below the quiz card",
          format: format.key,
          state,
        });
      }
      if (dom.qrInsideCtaPanel) {
        qa.failures.push({
          severity: "failure",
          code: "cta-placement",
          message: "QR code is inside the CTA panel (combined panel is not allowed)",
          format: format.key,
          state,
        });
      }
      // Phone-composition structure.
      if (!dom.phonePresent) {
        qa.failures.push({
          severity: "failure",
          code: "phone-frame",
          message: "Phone frame/screen/island missing from the social composition",
          format: format.key,
          state,
        });
      } else {
        if (!dom.phoneBottomCropped) {
          qa.failures.push({
            severity: "failure",
            code: "phone-frame",
            message: "Phone bottom edge is visible — it must run off the capture",
            format: format.key,
            state,
          });
        }
        if (!dom.allContentInsideScreen) {
          qa.failures.push({
            severity: "failure",
            code: "phone-frame",
            message: `Content outside the phone screen: ${dom.contentOutsideScreen.join(", ")}`,
            format: format.key,
            state,
          });
        }
        if (!dom.islandClearOfContent) {
          qa.failures.push({
            severity: "failure",
            code: "phone-frame",
            message: "Dynamic-island pill overlaps content (CTA/card/QR/caption)",
            format: format.key,
            state,
          });
        }
      }
      if (state !== "question" && dom.correctRowContrast !== null && dom.correctRowContrast < 4.5) {
        qa.failures.push({
          severity: "failure",
          code: "contrast",
          message: `Correct-row text contrast ${dom.correctRowContrast} is below 4.5:1`,
          format: format.key,
          state,
        });
      }
    }

    // ── Answer-state integrity checks ────────────────────────────────────
    const states = dom.visibleChoiceStates;
    if (state === "question") {
      if (states.some((s) => s !== "idle")) {
        qa.failures.push({
          severity: "failure",
          code: "leakage",
          message: `Unanswered state shows non-idle choice styling: [${states.join(", ")}]`,
          format: format.key,
          state,
        });
      }
      if (dom.feedbackVisible) {
        qa.failures.push({
          severity: "failure",
          code: "leakage",
          message: "Feedback/explanation panel visible in unanswered state",
          format: format.key,
          state,
        });
      }
    }
    if ((state === "correct" || state === "incorrect" || state === "explanation") &&
        !states.includes("correct")) {
      qa.failures.push({
        severity: "failure",
        code: "missing-reveal",
        message: "Reveal state does not visibly mark the correct answer",
        format: format.key,
        state,
      });
    }
    if (state === "incorrect" && !states.includes("incorrect-selected")) {
      qa.failures.push({
        severity: "failure",
        code: "missing-reveal",
        message: "Incorrect state does not visibly mark the wrong selection",
        format: format.key,
        state,
      });
    }
    if (state === "selected" && !states.includes("selected")) {
      qa.failures.push({
        severity: "failure",
        code: "missing-selection",
        message: "Selected state shows no selected choice",
        format: format.key,
        state,
      });
    }
    if (args.expectExplanation && !dom.explanationText?.trim()) {
      qa.warnings.push({
        severity: "warning",
        code: "explanation-missing",
        message: "Explanation state rendered without visible explanation text",
        format: format.key,
        state,
      });
    }

    const stage = page.locator("[data-quiz-render-stage]");
    const png =
      format.kind === "social"
        ? await stage.screenshot()
        : await page.screenshot({ fullPage: false });
    return { png, qa, layout: dom.layout, usedScale };
  } finally {
    await context.close();
  }
}
