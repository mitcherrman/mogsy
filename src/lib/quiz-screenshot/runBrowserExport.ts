/**
 * CON1 — run an Admin export without leaving `/admin/quiz-content`.
 *
 * WHAT IT REUSES, AND WHAT IT OWNS
 *
 * It owns nothing about how a card looks. It mounts the production render
 * harness — `src/pages/dev/quiz-render/QuizRenderPage`, the exact component
 * Playwright drives — into an offscreen host sized by the harness itself, waits
 * for the harness's own `data-quiz-render-ready`, applies the Content Factory's
 * own QA to the mounted stage, and hands the stage to `./browserCapture`.
 * Formats, states, answer selection, filenames, run-directory shape and the
 * readiness policy all come from the modules that already own them.
 *
 * CC2 — THE SAME CAPTURE CONTRACT AS PLAYWRIGHT
 *
 *  - Harness parameters: every card carries what the generator passes —
 *    `slide`, `scale`, `difficulty`, and the challenge's `progress` / `repeat`
 *    / `mid` / `qids` / `sumStart` / `sumPage` / `sumPages`.
 *  - Answer plan: quiz and recap cards resolve `resolveAnswerPlan` first, as
 *    the generator does, so a state a question has no content for is SKIPPED
 *    with the generator's reason and an invalid one FAILS. A harness that then
 *    refuses a card is a failure (the CLI's `harness-error`), never a skip.
 *  - QA: the full capture-time DOM sweep (`./domQa.ts`) — presentation and
 *    asset gates, missing/unresolved images, answer leakage, missing reveal,
 *    CTA presence and placement, composition, contrast. Any failing finding
 *    withholds the card: Admin is fail-closed, so a card the CLI would mark
 *    failed produces no file here.
 *
 * THE ZOOM ENVELOPE
 *
 * `scripts/quiz-screenshots/generate.ts` captures the `question` card first for
 * each question+format, reads the zoom the harness fitted, and FORCES that same
 * zoom on every other card of the same question and format — so a reveal is
 * never a different size from the question it answers. This does the same, via
 * the same `?scale=` parameter the runner uses. Dropping it would produce a
 * carousel whose slides breathe. CC2: which cards share it is the generator's
 * own rule (`ExportCard.sharesZoom`) — quiz slides only, never `explanation`,
 * never challenge slides.
 *
 * THE HARNESS'S SIDE EFFECTS
 *
 * The harness page puts `dark theme-lol` on the document root while it is
 * mounted (it renders outside Layout, and the live quiz is always in the League
 * theme). React renders this tree from the PARENT realm, so left to itself that
 * root is Admin's — and the operator watched `/admin/quiz-content` turn
 * League-dark for the length of an export. The harness now takes the document
 * it is rendering into (`renderDocument`), and the export passes the iframe's,
 * so the theme lands on the export surface and Admin is never touched.
 *
 * One global remains, and has to: the harness module sets
 * `MotionGlobalConfig.skipAnimations` at module scope, which is realm-wide and
 * is exactly what the export tree needs (it renders in this realm). It is
 * restored on unmount, and it is why the module is imported DYNAMICALLY here —
 * a static import would apply it to the whole app from first paint.
 */
import type { ComponentType } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/query-client";
import { buildCaptureStyleBundle, captureStageToPng, type CaptureStyleBundle } from "./browserCapture";
import {
  assessBrowserExportSupport,
  GECKO_MAX_DATA_URL_CHARS,
  type BrowserExportSupport,
} from "./browserSupport";
import { collectDomQa, DOM_QA_ATTRIBUTES, evaluateDomQa, type CaptureLayout } from "./domQa";
import { getFormat } from "./formats";
import type { QaFinding } from "./metadata";
import { resolveAnswerPlan } from "./states";
import { QUIZ_RENDER_WINDOW_KEY, type RenderQuestion, type RenderState } from "./types";
import type { ExportCard, ExportPlan } from "./exportPlan";

const READY_TIMEOUT_MS = 20_000;
const STAGE_SELECTOR = "[data-quiz-render-stage]";
const READY_SELECTOR = '[data-quiz-render-ready="true"]';
const ERROR_SELECTOR = "[data-quiz-render-error]";

export type ExportedFile = { path: string; fileName: string; blob: Blob };

export type ExportCardOutcome =
  | {
      card: ExportCard;
      status: "captured";
      file: ExportedFile;
      /** Capture-level notes from `browserCapture` (strings, as before CC2). */
      warnings: string[];
      /** The zoom the harness fitted, as it stamps it. Parity tooling compares
       *  this against the CLI's `usedScale` for the same card. */
      usedScale: number | null;
      /** CC2 — QA warnings from the shared DOM sweep (never failures). */
      findings: QaFinding[];
      overflow: QaFinding[];
      missingAssets: string[];
      layout: CaptureLayout;
    }
  /** The answer plan declined this card (a state the question has no content
   *  for). The CLI records these as skipped-with-a-reason, never as output. */
  | { card: ExportCard; status: "skipped"; reason: string }
  | {
      card: ExportCard;
      status: "failed";
      reason: string;
      /** Machine-readable class: a QA finding code, a capture failure code,
       *  `harness-error`, `ready-timeout`, `cancelled`, … */
      classification: string;
      /** Every QA finding, when the DOM sweep ran. */
      findings?: QaFinding[];
      overflow?: QaFinding[];
      missingAssets?: string[];
      layout?: CaptureLayout;
    };

export type ExportRunResult = {
  outcomes: ExportCardOutcome[];
  files: ExportedFile[];
  /** `url()` targets the stylesheet asked for and the browser could not read. */
  styleWarnings: string[];
  /** Why the run stopped early (cancelled, unsupported browser), else null. */
  aborted: string | null;
  support: BrowserExportSupport;
  startedAt: Date;
  finishedAt: Date;
};

export type ExportProgress = { done: number; total: number; card: ExportCard };

/** The harness takes the document it renders into; see its own note. */
type HarnessModule = { default: ComponentType<{ renderDocument?: Document }> };

/** The harness URL for one card — the generator's parameters, in its order. */
export function harnessUrl(card: ExportCard, forcedScale?: number): string {
  const params = new URLSearchParams({
    q: card.questionId,
    state: card.state,
    format: card.formatKey,
  });
  if (forcedScale !== undefined) params.set("scale", String(forcedScale));
  if (card.slide !== "quiz") params.set("slide", card.slide);
  if (card.difficulty) params.set("difficulty", card.difficulty);
  for (const [key, value] of Object.entries(card.extraParams ?? {})) params.set(key, value);
  return `/dev/quiz-render?${params.toString()}`;
}

/** Zoom-envelope key: one fitted zoom per question directory + format. */
function envelopeKey(card: ExportCard): string {
  return `${card.dirSlug}::${card.formatKey}`;
}

/**
 * Wait for the harness to say it is done, or to say it cannot render this card.
 *
 * Polls rather than observing: readiness is stamped as an ATTRIBUTE on a node
 * the harness may have replaced since the last frame, and the error panel is a
 * different element entirely, so there is no single node to observe.
 */
async function waitForHarness(
  host: HTMLElement,
): Promise<
  | { kind: "ready"; stage: HTMLElement }
  | { kind: "error"; message: string }
  | { kind: "timeout"; message: string }
> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const error = host.querySelector(ERROR_SELECTOR);
    if (error) return { kind: "error", message: (error.textContent ?? "").trim() };
    const ready = host.querySelector(READY_SELECTOR);
    if (ready) return { kind: "ready", stage: ready as HTMLElement };
    if (Date.now() > deadline) {
      return { kind: "timeout", message: `the card did not become ready within ${READY_TIMEOUT_MS / 1000}s` };
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
}

/**
 * The export surface: an offscreen iframe sized to the FORMAT.
 *
 * Why an iframe and not a hidden div in this page. The harness fits its zoom by
 * measuring the card it has just laid out, and that layout runs under the
 * document's media queries — which are the VIEWPORT's, not the stage's. Mounted
 * in Admin, the card is measured at the operator's monitor width, so a Tailwind
 * responsive variant can resolve one way for the export and the other way for
 * the CLI (which gives each capture a viewport the size of the format). The
 * result is a correct composition at a slightly wrong zoom — measured at up to
 * 10px of card height on `landscape`, which is exactly the kind of difference
 * that is invisible until two slides of one carousel sit side by side.
 *
 * An iframe IS a viewport. Sized to the format, every media query the card
 * consults answers the same as it does under Playwright.
 *
 * The stylesheets are copied in rather than re-fetched so the frame is styled by
 * the same CSS this page is running, and the theme classes are mirrored because
 * the harness's own effect puts them on the TOP-level document.
 */
async function createStageFrame(width: number, height: number): Promise<HTMLIFrameElement> {
  const frame = document.createElement("iframe");
  frame.setAttribute("data-content-export-frame", "");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Content export render surface");
  frame.width = String(width);
  frame.height = String(height);
  // Off the left edge rather than `display:none`: a hidden frame has no layout,
  // and the harness fits its zoom by MEASURING what it laid out.
  frame.style.cssText =
    `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none;`;
  document.body.appendChild(frame);

  await new Promise<void>((resolve) => {
    if (frame.contentDocument?.readyState === "complete") resolve();
    else frame.addEventListener("load", () => resolve(), { once: true });
    // about:blank can be complete before the listener attaches.
    if (frame.contentDocument?.readyState === "complete") resolve();
  });

  const doc = frame.contentDocument!;
  // Layout.tsx's own rule for the LoL section, applied to the export surface:
  // strip any sitewide `theme-*` the operator happens to be using, then assert
  // the League theme. Copying Admin's classes verbatim would let an operator's
  // chosen theme change what the exported PNG looks like.
  const inherited = document.documentElement.className.replace(/theme-\S+/g, "").trim();
  doc.documentElement.className = `${inherited} dark theme-lol`.trim();
  doc.body.style.margin = "0";
  for (const node of Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))) {
    doc.head.appendChild(node.cloneNode(true));
  }
  // The zoom fit measures text, so it must not run against fallback metrics.
  try {
    await doc.fonts?.ready;
  } catch {
    /* font API unavailable in this frame — proceed */
  }
  return frame;
}

type Surface = { frame: HTMLIFrameElement; root: Root; host: HTMLElement; doc: Document };

/** Every card not attempted, failed with one reason — a short run is never silent. */
function failRemaining(
  cards: readonly ExportCard[],
  from: number,
  classification: string,
  reason: string,
): ExportCardOutcome[] {
  return cards.slice(from).map((card) => ({ card, status: "failed" as const, classification, reason }));
}

/**
 * Execute a plan. Returns every card's outcome — a partial run reports what it
 * produced AND what it did not, rather than quietly shipping a short set.
 */
export async function runBrowserExport(args: {
  plan: ExportPlan;
  /** Adapted rows for the whole selection, as the harness expects them. */
  questions: readonly RenderQuestion[];
  onProgress?: (progress: ExportProgress) => void;
  /** Injected in tests; production builds the bundle from the live document. */
  styleBundle?: CaptureStyleBundle;
  /** Cancels between cards; the remaining cards are reported as cancelled. */
  signal?: AbortSignal;
  /** Injected in tests; production assesses the running browser. */
  support?: BrowserExportSupport;
}): Promise<ExportRunResult> {
  const { plan, questions } = args;
  const startedAt = new Date();
  const support = args.support ?? assessBrowserExportSupport();
  const byId = new Map(questions.map((q) => [String(q.id), q]));

  if (support.status === "unsupported") {
    const reason = support.notes.join(" ") || "this browser cannot run the export";
    return {
      outcomes: failRemaining(plan.cards, 0, "browser-unsupported", reason),
      files: [],
      styleWarnings: [],
      aborted: reason,
      support,
      startedAt,
      finishedAt: new Date(),
    };
  }

  const harness = (await import("@/pages/dev/quiz-render/QuizRenderPage")) as HarnessModule;
  const bundle = args.styleBundle ?? (await buildCaptureStyleBundle());
  const maxSvgChars = support.engine === "firefox" ? GECKO_MAX_DATA_URL_CHARS : undefined;

  const globals = window as unknown as Record<string, unknown>;
  const previousInjection = globals[QUIZ_RENDER_WINDOW_KEY];
  globals[QUIZ_RENDER_WINDOW_KEY] = { questions: [...questions] };

  const outcomes: ExportCardOutcome[] = [];
  /** Fitted zoom per question+format, so every card of one post matches. */
  const scaleEnvelope = new Map<string, number>();
  /** One surface per format; cards of the same format reuse it. */
  const frames = new Map<string, Surface>();
  let aborted: string | null = null;

  try {
    let done = 0;
    for (let cardIndex = 0; cardIndex < plan.cards.length; cardIndex++) {
      const card = plan.cards[cardIndex];
      if (args.signal?.aborted) {
        aborted = "cancelled by the operator";
        outcomes.push(...failRemaining(plan.cards, cardIndex, "cancelled", "cancelled before this card was captured"));
        break;
      }
      args.onProgress?.({ done, total: plan.cards.length, card });
      const fail = (classification: string, reason: string, extra: Partial<Extract<ExportCardOutcome, { status: "failed" }>> = {}) => {
        outcomes.push({ card, status: "failed", classification, reason, ...extra });
        done += 1;
      };

      const format = getFormat(card.formatKey);
      if (!format) {
        fail("unknown-format", `unknown format "${card.formatKey}"`);
        continue;
      }
      const question = byId.get(String(card.questionId));
      if (!question) {
        fail("question-not-loaded", `question ${card.questionLabel} was not loaded for export`);
        continue;
      }

      // The generator's answer plan, before anything is mounted.
      let expectExplanation = false;
      if (card.slide === "quiz" || card.slide === "recap") {
        const planState: RenderState = card.slide === "recap" ? "question" : card.state;
        try {
          const answerPlan = resolveAnswerPlan(question, planState);
          if (answerPlan.kind === "skip") {
            outcomes.push({ card, status: "skipped", reason: answerPlan.reason });
            done += 1;
            continue;
          }
          expectExplanation = answerPlan.plan.showExplanation;
        } catch (error) {
          fail("invalid-state-for-question", error instanceof Error ? error.message : String(error));
          continue;
        }
      }

      const forcedScale = card.sharesZoom ? scaleEnvelope.get(envelopeKey(card)) : undefined;
      const url = harnessUrl(card, forcedScale);

      let surface = frames.get(card.formatKey);
      if (!surface) {
        const frame = await createStageFrame(format.width, format.height);
        const doc = frame.contentDocument!;
        surface = { frame, root: createRoot(doc.body), host: doc.body, doc };
        frames.set(card.formatKey, surface);
      }
      // Gecko may swap an iframe's initial about:blank once it finishes
      // loading; a root mounted into the old document would never become ready.
      if (surface.frame.contentDocument !== surface.doc) {
        fail("export-surface-replaced", "the browser replaced the export surface; this browser is not supported");
        continue;
      }
      const { host, root, doc: frameDocument } = surface;

      // Clear the host first. A remount is not instantaneous, and the previous
      // card's stage still carries `data-quiz-render-ready="true"` — polling
      // for readiness against a stale stage would capture the last card twice.
      await new Promise<void>((resolve) => {
        root.render(null);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      await new Promise<void>((resolve) => {
        root.render(
          createElement(
            QueryClientProvider,
            // The app's own client, not a new one: components under the card
            // (the champion manifest the cinematic splash reads, for one) query
            // through it, and a second client would mean a second cache and a
            // second round of fetches for data this page already has.
            { client: queryClient },
            createElement(
              TooltipProvider,
              null,
              createElement(
                MemoryRouter,
                // KEYED BY URL. `MemoryRouter` reads `initialEntries` once, at
                // mount, and ignores it afterwards — so re-rendering the same
                // root with a new entry silently kept the FIRST card's state and
                // format, and every card of a run came out as card one.
                { key: url, initialEntries: [url] },
                createElement(harness.default, { renderDocument: frameDocument }),
              ),
            ),
          ),
        );
        requestAnimationFrame(() => resolve());
      });

      const settled = await waitForHarness(host);
      if (settled.kind === "timeout") {
        fail("ready-timeout", settled.message);
        continue;
      }
      if (settled.kind === "error") {
        // The answer plan already skipped every state the generator skips, so
        // a refusal here is the CLI's `harness-error`: a failure.
        fail("harness-error", settled.message || "the render harness refused this card");
        continue;
      }

      const stage = host.querySelector(STAGE_SELECTOR) as HTMLElement | null;
      if (!stage) {
        fail("empty-stage", "the render stage never mounted");
        continue;
      }

      if (card.sharesZoom && !scaleEnvelope.has(envelopeKey(card))) {
        const fitted = Number(stage.getAttribute("data-render-scale"));
        if (Number.isFinite(fitted) && fitted > 0) scaleEnvelope.set(envelopeKey(card), fitted);
      }

      // The capture-time QA sweep, the same readings and rules as `captureOne`.
      const dom = collectDomQa(DOM_QA_ATTRIBUTES, frameDocument);
      const verdict = evaluateDomQa(dom, {
        question,
        format,
        state: card.state,
        slideKind: card.slide,
        expectExplanation,
        allowIncompletePresentation: false,
        allowMissingAssets: false,
      });
      const layout = dom.layout as unknown as CaptureLayout;
      if (verdict.failures.length > 0) {
        fail(verdict.failures[0].code, verdict.failures[0].message, {
          findings: [...verdict.failures, ...verdict.warnings],
          overflow: verdict.overflowFindings,
          missingAssets: verdict.missingAssets,
          layout,
        });
        continue;
      }

      const captured = await captureStageToPng(stage, bundle, { maxSvgChars });
      if (captured.outcome === "captured") {
        const stamped = Number(stage.getAttribute("data-render-scale"));
        outcomes.push({
          card,
          status: "captured",
          warnings: captured.warnings,
          usedScale: Number.isFinite(stamped) ? stamped : null,
          file: { path: card.zipPath, fileName: card.flatFileName, blob: captured.blob },
          findings: verdict.warnings,
          overflow: verdict.overflowFindings,
          missingAssets: verdict.missingAssets,
          layout,
        });
        done += 1;
      } else {
        fail(captured.failure.code, captured.failure.detail, {
          findings: verdict.warnings,
          overflow: verdict.overflowFindings,
          missingAssets: verdict.missingAssets,
          layout,
        });
      }
    }
    if (plan.cards.length > 0) {
      args.onProgress?.({ done, total: plan.cards.length, card: plan.cards[plan.cards.length - 1] });
    }
  } finally {
    for (const { frame, root } of frames.values()) {
      root.unmount();
      frame.remove();
    }
    if (previousInjection === undefined) delete globals[QUIZ_RENDER_WINDOW_KEY];
    else globals[QUIZ_RENDER_WINDOW_KEY] = previousInjection;
  }

  return {
    outcomes,
    files: outcomes.flatMap((o) => (o.status === "captured" ? [o.file] : [])),
    styleWarnings: bundle.unresolved,
    aborted,
    support,
    startedAt,
    finishedAt: new Date(),
  };
}
