/**
 * Playwright capture engine: drives /dev/quiz-render deterministically and
 * collects QA signals per capture. Question data is injected locally via
 * addInitScript — the page never fetches it and no credentials reach the
 * browser context.
 */
import { chromium, type Browser, type Page } from "playwright";
import type { QaFinding } from "../../src/lib/quiz-screenshot/metadata";
import { evaluateAssetGate } from "../../src/lib/quiz-screenshot/assetGate";
import {
  evaluatePresentationGate,
  UNRESOLVED_SUBJECT_IMAGE_CODE,
} from "../../src/lib/quiz-screenshot/presentationGate";
import {
  PRESENTATION_BAND_ATTRIBUTE,
  PRESENTATION_REASON_ATTRIBUTE,
  PRESENTATION_STATUS_ATTRIBUTE,
  QUIZ_RENDER_WINDOW_KEY,
  type RenderFormat,
  type RenderQuestion,
  type RenderState,
} from "../../src/lib/quiz-screenshot/types";

const READY_TIMEOUT_MS = 20_000;

/** Layout reported when a capture never got far enough to measure anything. */
const EMPTY_LAYOUT: CaptureLayout = {
  card: null, cta: null, qr: null, ground: null, rail: null, scan: null, resultArea: null,
};

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
  /**
   * CON1 Step 4 — `phone` / `screen` / `island` are gone with the device
   * mock-up they described. The composition's own parts replace them: the
   * painted ground (deterministic per format) and, in the landscape family,
   * the brand rail.
   */
  ground: LayoutRect | null;
  rail: LayoutRect | null;
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
  /**
   * CON1 Step 4 — the brand lockup actually rendered a wordmark.
   *
   * This used to be `img.src.includes("mogsy-logo") && naturalWidth > 0`: a
   * FILENAME check, which was always a weak proxy for "the brand is on the
   * card" and became an outright wrong one when the wordmark stopped being an
   * image. The mark is set in type now (see QuizCta.tsx), so the gate asks the
   * question directly — is there a `[data-quiz-brand-mark]` node inside the
   * lockup, does it carry text, and does it have a non-zero box.
   */
  ctaHasLogo: boolean;
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
  /**
   * CON1 Step 4 — composition checks, replacing the phone-frame ones.
   *
   * `groundPresent` is the painted stage the folio sits on (the old
   * `phonePresent`). `contentInsideFrame` is what `allContentInsideScreen`
   * was actually protecting: nothing may leave the capture, and nothing may
   * sit under the inset plate edge. `railClearOfCard` is the landscape
   * family's equivalent of the island-overlap check — the brand column and
   * the folio must not intersect.
   */
  groundPresent: boolean;
  contentInsideFrame: boolean;
  contentOutsideFrame: string[];
  railClearOfCard: boolean;
  correctRowContrast: number | null;
  /** CON1 Step 1D — the production presentation outcome the page stamped on
   *  the question card. Read as attributes, never inferred from pixels or
   *  visible text; null when the slide renders no question card. */
  presentationStatus: string | null;
  presentationBand: string | null;
  presentationReason: string | null;
  /**
   * CON1 Step 5 — the subject artwork the card said it expected, and whether
   * a real one is on screen.
   *
   * `expectedImage` is the page's declaration (see `data-quiz-expected-image`
   * in QuizRenderPage). `subjectImageResolved` is the browser's answer: at
   * least one <img> inside the card that has finished loading with a non-zero
   * intrinsic size and a non-zero box.
   *
   * The pair exists because the two ways this can go wrong look nothing alike
   * in the DOM. A BROKEN image is an <img> with naturalWidth 0, which
   * `missingAssets` already catches. An UNRESOLVED one is no <img> at all —
   * the runtime manifest fetch failed, the resolver returned undefined and the
   * component rendered an empty frame. Nothing existing sees that.
   */
  expectedImage: string | null;
  subjectImageResolved: boolean;
  /** Layout geometry for cross-state stability checks (px, page space). */
  layout: Record<string, { x: number; y: number; w: number; h: number } | null>;
};

async function runDomQa(page: Page): Promise<DomQa> {
  return page.evaluate((attrs: { status: string; band: string; reason: string }) => {
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
    let ctaHasLogo = false;
    doc.querySelectorAll<HTMLElement>("[data-quiz-cta] [data-quiz-brand-mark]").forEach((mark) => {
      const r = mark.getBoundingClientRect();
      if ((mark.textContent ?? "").trim().length > 0 && r.width > 0 && r.height > 0) {
        ctaHasLogo = true;
      }
    });

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

    // Structural placement.
    //
    // CON1 Step 4 — the rule is per LAYOUT FAMILY now. In the stacked
    // (portrait/square) compositions it is unchanged and unrelaxed: the brand
    // lockup sits fully ABOVE the folio, the QR fully BELOW it, and the QR is
    // never inside the lockup. In the landscape family both live in a rail
    // BESIDE the folio, so "above" and "below" describe nothing — the vertical
    // assertions are vacuously satisfied there and `railClearOfCard` below is
    // what actually holds the composition together. This is a different rule
    // for a different composition, not a weakened one.
    const stageEl = doc.querySelector("[data-quiz-render-stage]");
    const layoutFamily = stageEl?.getAttribute("data-render-layout") ?? "portrait";
    const stacked = layoutFamily !== "landscape";
    const ctaEl = doc.querySelector("[data-quiz-cta]");
    const qrEl = doc.querySelector("[data-quiz-cta-qr]");
    let ctaAboveCard = true;
    let qrBelowCard = true;
    // In the rail the QR is deliberately part of the lockup — one column, one
    // object. The "no combined panel" rule exists so a stacked card never
    // grows a footer block that competes with the answers; it does not apply
    // to a side rail.
    const qrInsideCtaPanel = stacked && !!(ctaEl && qrEl && ctaEl.contains(qrEl));
    if (card && stacked) {
      const cardR = card.getBoundingClientRect();
      if (ctaEl) ctaAboveCard = ctaEl.getBoundingClientRect().bottom <= cardR.top + 1;
      if (qrEl) qrBelowCard = qrEl.getBoundingClientRect().top >= cardR.bottom - 1;
    }

    // CON1 Step 4 — composition checks, in place of the phone-frame ones.
    //
    // The old checks were about a device mock-up: is the phone there, does its
    // bottom edge run off the capture, is everything inside its screen, does
    // the island pill clear the content. Three of those describe an object
    // that no longer exists. What they were PROTECTING does still matter and
    // is asserted here against the composition that replaced it:
    //   groundPresent      — the painted stage rendered (was: phonePresent)
    //   contentInsideFrame — nothing leaves the capture (was: inside-screen)
    //   railClearOfCard    — the brand column and the folio do not intersect
    //                        (was: the island pill clearing the content)
    const groundEl = doc.querySelector("[data-quiz-stage-ground]");
    const railEl = doc.querySelector("[data-quiz-brand-rail]");
    const scanEl = doc.querySelector("[data-quiz-cta-scan]");
    const groundPresent = !!groundEl;
    let contentInsideFrame = true;
    const contentOutsideFrame: string[] = [];
    let railClearOfCard = true;
    if (stageRect) {
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
          r.left >= stageRect.left - 1 &&
          r.right <= stageRect.right + 1 &&
          r.top >= stageRect.top - 1 &&
          r.bottom <= stageRect.bottom + 1;
        if (!inside) {
          contentInsideFrame = false;
          contentOutsideFrame.push(label);
        }
      }
      if (railEl && card) {
        const railR = railEl.getBoundingClientRect();
        const cardR = card.getBoundingClientRect();
        railClearOfCard = !(
          railR.right > cardR.left + 1 && cardR.right > railR.left + 1 &&
          railR.bottom > cardR.top + 1 && cardR.bottom > railR.top + 1
        );
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
      ["ground", groundEl],
      ["rail", railEl],
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

    // CON1 Step 1D — structured presentation outcome, straight off the card.
    const presentationEl = doc.querySelector(`[${attrs.status}]`);
    const presentationStatus = presentationEl?.getAttribute(attrs.status) ?? null;
    const presentationBand = presentationEl?.getAttribute(attrs.band) ?? null;
    const presentationReason = presentationEl?.getAttribute(attrs.reason) ?? null;

    // CON1 Step 5 — did the subject artwork the card expected actually arrive?
    // Scoped to the CARD, not the page: the painted ground, the QR and the
    // brand chrome are images too, and counting them would make every card
    // look like it had a subject visual.
    const expectedImage =
      presentationEl?.getAttribute("data-quiz-expected-image") ?? null;
    const cardEl = doc.querySelector("[data-quiz-content-card]") ?? presentationEl;
    let subjectImageResolved = false;
    cardEl?.querySelectorAll("img").forEach((img) => {
      const r = img.getBoundingClientRect();
      // `complete && naturalWidth > 0` is "the bytes decoded"; the box test is
      // "and it occupies the frame". A 0x0 image is as blank as a missing one.
      if (img.complete && img.naturalWidth > 0 && r.width > 1 && r.height > 1) {
        subjectImageResolved = true;
      }
    });

    return {
      presentationStatus,
      presentationBand,
      presentationReason,
      expectedImage,
      subjectImageResolved,
      ctaPresent,
      ctaText,
      ctaHasLogo,
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
      groundPresent,
      contentInsideFrame,
      contentOutsideFrame,
      railClearOfCard,
      correctRowContrast,
      layout,
    };
  }, {
    status: PRESENTATION_STATUS_ATTRIBUTE,
    band: PRESENTATION_BAND_ATTRIBUTE,
    reason: PRESENTATION_REASON_ATTRIBUTE,
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
    // ── CON1 Step 1D: presentation completeness ──────────────────────────
    // Enforced HERE, at the first point the real production layout result is
    // known: the page has mounted, called the one band authority and stamped
    // the outcome. Earlier is a guess; later (finalize) would already have
    // written a publishable-looking PNG with no record of what was missing.
    // The decision itself lives in the pure gate module — this only reports it
    // through the QA channel every other structural check uses.
    const presentationGate = evaluatePresentationGate({
      status: dom.presentationStatus,
      band: dom.presentationBand,
      reason: dom.presentationReason,
      questionId: question.id,
      questionKey: question.question_key ?? null,
      format: format.key,
      state,
      allowIncomplete: args.allowIncompletePresentation === true,
    });
    for (const finding of presentationGate.findings) {
      if (finding.severity === "failure") qa.failures.push(finding);
      else qa.warnings.push(finding);
    }

    // ── CON1 Step 1E: asset completeness ─────────────────────────────────
    // A DIFFERENT failure class from the presentation gate above, decided by a
    // different authority. It reads no DOM at all: the backend already asked
    // the canonical asset resolver whether the files this question requires
    // exist, and `question.asset_status` is that answer. The browser's own
    // broken-image check below stays as defence in depth for assets that break
    // between the resolver and the pixel — but it is the backstop, never the
    // primary authority for something the backend already knew.
    const assetGate = evaluateAssetGate({
      assetStatus: question.asset_status,
      questionId: question.id,
      questionKey: question.question_key ?? null,
      format: format.key,
      state,
      allowMissingAssets: args.allowMissingAssets === true,
    });
    for (const finding of assetGate.findings) {
      if (finding.severity === "failure") qa.failures.push(finding);
      else qa.warnings.push(finding);
    }

    // ── CON1 Step 5: an EXPECTED subject image that never resolved ───────
    // The gap Step 4 recorded as "the one way the factory can currently
    // produce a bad image and call the run clean". Distinct from both gates
    // above: the presentation gate asks whether a premise reached the LAYOUT,
    // and the asset gate asks whether the files a question REQUIRES exist on
    // disk. Neither sees a card whose layout is right and whose files are fine
    // but whose runtime art fetch failed, because the component then renders
    // no <img> at all and there is nothing broken to find.
    //
    // Fail-closed and narrow: it fires only when the page itself declared that
    // it expected a subject visual, so a text card can never trip it.
    if (dom.expectedImage && !dom.subjectImageResolved) {
      const finding: QaFinding = {
        severity: args.allowMissingAssets === true ? "warning" : "failure",
        code: UNRESOLVED_SUBJECT_IMAGE_CODE,
        message:
          `Unresolved subject image on question ${question.id}: the card ` +
          `declared it expected ${dom.expectedImage} artwork, but no image ` +
          `rendered inside it (format=${format.key}, state=${state}). The ` +
          `art is resolved at runtime from GET /api/assets/champions; a ` +
          `failed or CORS-blocked fetch publishes an empty frame rather than ` +
          `a broken image, which is why this is checked separately.` +
          (args.allowMissingAssets === true
            ? " Downgraded to a warning because --allow-missing-assets is set;"
            + " this image is a diagnostic, not a publishable capture."
            : ""),
        format: format.key,
        state,
      };
      if (finding.severity === "failure") qa.failures.push(finding);
      else qa.warnings.push(finding);
    }

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

    // Content formats must carry the top CTA. Quiz-family slides require the
    // visible mogzy.lol link text; end slides (app-cta/community) use the
    // brand-led variant — larger wordmark, no small line — so there the gate
    // requires a successfully-loaded Mogsy logo instead (the play messaging
    // lives in the slide body, and the QR still encodes the quiz URL).
    const endSlide =
      slideKind === "app-cta" ||
      slideKind === "community" ||
      slideKind === "opening" ||
      slideKind === "summary" ||
      slideKind === "ending";
    if (format.cta !== "none") {
      if (!dom.ctaPresent) {
        qa.failures.push({
          severity: "failure",
          code: "cta-missing",
          message: "Content format rendered without the CTA footer",
          format: format.key,
          state,
        });
      } else if (endSlide && !dom.ctaHasLogo) {
        qa.failures.push({
          severity: "failure",
          code: "cta-missing",
          message: "End-slide brand CTA is missing a rendered Mogzy wordmark",
          format: format.key,
          state,
        });
      } else if (!endSlide && !dom.ctaText.includes("mogzy.lol")) {
        qa.failures.push({
          severity: "failure",
          code: "cta-missing",
          message: "CTA footer does not show the mogzy.lol link text",
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
      // CON1 Step 4 — composition structure, replacing the phone-frame gates.
      // Same failure class (`composition`, renamed from `phone-frame`), same
      // severity, asserted against the composition that exists.
      if (!dom.groundPresent) {
        qa.failures.push({
          severity: "failure",
          code: "composition",
          message: "Social composition rendered without its painted stage ground",
          format: format.key,
          state,
        });
      }
      if (!dom.contentInsideFrame) {
        qa.failures.push({
          severity: "failure",
          code: "composition",
          message: `Content outside the capture frame: ${dom.contentOutsideFrame.join(", ")}`,
          format: format.key,
          state,
        });
      }
      if (!dom.railClearOfCard) {
        qa.failures.push({
          severity: "failure",
          code: "composition",
          message: "Brand rail overlaps the question card",
          format: format.key,
          state,
        });
      }
      if (slideKind === "quiz" && state !== "question" &&
          dom.correctRowContrast !== null && dom.correctRowContrast < 4.5) {
        qa.failures.push({
          severity: "failure",
          code: "contrast",
          message: `Correct-row text contrast ${dom.correctRowContrast} is below 4.5:1`,
          format: format.key,
          state,
        });
      }
    }

    // ── Answer-state integrity checks (quiz card only) ───────────────────
    // Non-quiz slides (recap/app-cta/community) have no answer grid, so these
    // checks do not apply. Recap re-shows the question in the unanswered
    // composition, so it is treated like the question state for leakage.
    const states = dom.visibleChoiceStates;
    if (endSlide) {
      // No answer grid to validate; phone-frame/CTA checks above still ran.
      // (The summary slide deliberately shows correct answers — that is its
      // purpose, and it renders no [data-quiz-choice] grid.)
    } else if (state === "question" || slideKind === "recap") {
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
    // Reveal/selection integrity applies only to real quiz slides — non-quiz
    // slides carry a "state" for labeling but render no answer grid.
    if (slideKind === "quiz" &&
        (state === "correct" || state === "incorrect" || state === "explanation") &&
        !states.includes("correct")) {
      qa.failures.push({
        severity: "failure",
        code: "missing-reveal",
        message: "Reveal state does not visibly mark the correct answer",
        format: format.key,
        state,
      });
    }
    if (slideKind === "quiz" && state === "incorrect" && !states.includes("incorrect-selected")) {
      qa.failures.push({
        severity: "failure",
        code: "missing-reveal",
        message: "Incorrect state does not visibly mark the wrong selection",
        format: format.key,
        state,
      });
    }
    if (slideKind === "quiz" && state === "selected" && !states.includes("selected")) {
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
