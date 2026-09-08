/**
 * CON1 — run an Admin export without leaving `/admin/quiz-content`.
 *
 * WHAT IT REUSES, AND WHAT IT OWNS
 *
 * It owns nothing about how a card looks. It mounts the production render
 * harness — `src/pages/dev/quiz-render/QuizRenderPage`, the exact component
 * Playwright drives — into an offscreen host sized by the harness itself, waits
 * for the harness's own `data-quiz-render-ready`, applies the Content Factory's
 * own presentation and asset gates to the mounted stage, and hands the stage to
 * `./browserCapture`. Formats, states, answer selection, filenames, run-
 * directory shape and the readiness policy all come from the modules that
 * already own them.
 *
 * THE ZOOM ENVELOPE
 *
 * `scripts/quiz-screenshots/generate.ts` captures the `question` card first for
 * each question+format, reads the zoom the harness fitted, and FORCES that same
 * zoom on every other card of the same question and format — so a reveal is
 * never a different size from the question it answers. This does the same, via
 * the same `?scale=` parameter the runner uses. Dropping it would produce a
 * carousel whose slides breathe.
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
import { evaluateAssetGate } from "./assetGate";
import { buildCaptureStyleBundle, captureStageToPng, type CaptureStyleBundle } from "./browserCapture";
import { evaluatePresentationGate } from "./presentationGate";
import { getFormat } from "./formats";
import {
  PRESENTATION_BAND_ATTRIBUTE,
  PRESENTATION_REASON_ATTRIBUTE,
  PRESENTATION_STATUS_ATTRIBUTE,
  QUIZ_RENDER_WINDOW_KEY,
  type RenderQuestion,
} from "./types";
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
      warnings: string[];
      /** The zoom the harness fitted, as it stamps it. Parity tooling compares
       *  this against the CLI's `usedScale` for the same card. */
      usedScale: number | null;
    }
  /** The harness itself declined this card (e.g. a state it has no content
   *  for). The CLI records these as skipped-with-a-reason, never as output. */
  | { card: ExportCard; status: "skipped"; reason: string }
  | { card: ExportCard; status: "failed"; reason: string };

export type ExportRunResult = {
  outcomes: ExportCardOutcome[];
  files: ExportedFile[];
  /** `url()` targets the stylesheet asked for and the browser could not read. */
  styleWarnings: string[];
};

export type ExportProgress = { done: number; total: number; card: ExportCard };

/** The harness takes the document it renders into; see its own note. */
type HarnessModule = { default: ComponentType<{ renderDocument?: Document }> };

function harnessUrl(card: ExportCard, forcedScale?: number): string {
  const params = new URLSearchParams({
    q: card.questionId,
    state: card.state,
    format: card.formatKey,
  });
  if (card.slide !== "quiz") params.set("slide", card.slide);
  if (forcedScale !== undefined) params.set("scale", String(forcedScale));
  return `/dev/quiz-render?${params.toString()}`;
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
): Promise<{ kind: "ready"; stage: HTMLElement } | { kind: "error"; message: string }> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const error = host.querySelector(ERROR_SELECTOR);
    if (error) return { kind: "error", message: (error.textContent ?? "").trim() };
    const ready = host.querySelector(READY_SELECTOR);
    if (ready) return { kind: "ready", stage: ready as HTMLElement };
    if (Date.now() > deadline) {
      return { kind: "error", message: `the card did not become ready within ${READY_TIMEOUT_MS / 1000}s` };
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }
}

/**
 * Apply the Content Factory's publishing gates to a stage that is about to be
 * captured.
 *
 * These are the SAME two modules the Playwright runner calls, reading the same
 * two attributes the harness stamps and the same backend-computed
 * `asset_status` — not a browser-side re-derivation of either. The diagnostic
 * overrides are pinned false: they exist so a developer can capture a known-bad
 * card through the CLI, and Admin has never offered them.
 */
function evaluateGates(card: ExportCard, stage: HTMLElement, question: RenderQuestion | undefined): string | null {
  const presentation = evaluatePresentationGate({
    status: stage.querySelector(`[${PRESENTATION_STATUS_ATTRIBUTE}]`)?.getAttribute(PRESENTATION_STATUS_ATTRIBUTE) ?? null,
    band: stage.querySelector(`[${PRESENTATION_BAND_ATTRIBUTE}]`)?.getAttribute(PRESENTATION_BAND_ATTRIBUTE) ?? null,
    reason: stage.querySelector(`[${PRESENTATION_REASON_ATTRIBUTE}]`)?.getAttribute(PRESENTATION_REASON_ATTRIBUTE) ?? null,
    questionId: card.questionId,
    questionKey: question?.question_key ?? null,
    format: card.formatKey,
    state: card.state,
    allowIncomplete: false,
  });
  if (presentation.failed) return presentation.findings[0]?.message ?? "incomplete presentation";

  const asset = evaluateAssetGate({
    assetStatus: question?.asset_status ?? null,
    questionId: card.questionId,
    questionKey: question?.question_key ?? null,
    format: card.formatKey,
    state: card.state,
    allowMissingAssets: false,
  });
  if (asset.failed) return asset.findings[0]?.message ?? "a required asset did not resolve";

  return null;
}

/**
 * Defence in depth, the browser half of the runner's `<img>` check.
 *
 * The gates above ask the BACKEND whether an asset was required and resolvable.
 * This asks the picture whether it painted — a bad URL join, a serving 404 or a
 * CSP block all land here and nowhere else. A visibly broken image in an
 * exported PNG is not publishable whatever the premise required.
 */
function findBrokenImages(stage: HTMLElement): string[] {
  return Array.from(stage.querySelectorAll("img"))
    .filter((image) => image.complete && image.naturalWidth === 0)
    .map((image) => image.currentSrc || image.src);
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
}): Promise<ExportRunResult> {
  const { plan, questions } = args;
  const byId = new Map(questions.map((q) => [String(q.id), q]));

  const harness = (await import("@/pages/dev/quiz-render/QuizRenderPage")) as HarnessModule;
  const bundle = args.styleBundle ?? (await buildCaptureStyleBundle());

  const globals = window as unknown as Record<string, unknown>;
  const previousInjection = globals[QUIZ_RENDER_WINDOW_KEY];
  globals[QUIZ_RENDER_WINDOW_KEY] = { questions: [...questions] };

  const outcomes: ExportCardOutcome[] = [];
  /** Fitted zoom per question+format, so every card of one post matches. */
  const scaleEnvelope = new Map<string, number>();
  /** One surface per format; cards of the same format reuse it. */
  const frames = new Map<string, { frame: HTMLIFrameElement; root: Root; host: HTMLElement }>();

  try {
    let done = 0;
    for (const card of plan.cards) {
      args.onProgress?.({ done, total: plan.cards.length, card });
      const envelopeKey = `${card.questionId}::${card.formatKey}`;
      const url = harnessUrl(card, scaleEnvelope.get(envelopeKey));

      let surface = frames.get(card.formatKey);
      if (!surface) {
        const format = getFormat(card.formatKey);
        if (!format) {
          outcomes.push({ card, status: "failed", reason: `unknown format "${card.formatKey}"` });
          done += 1;
          continue;
        }
        const frame = await createStageFrame(format.width, format.height);
        surface = { frame, root: createRoot(frame.contentDocument!.body), host: frame.contentDocument!.body };
        frames.set(card.formatKey, surface);
      }
      const host = surface.host;
      const root = surface.root;
      const frameDocument = surface.frame.contentDocument!;

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
      if (settled.kind === "error") {
        // The harness's own refusal. `resolveAnswerPlan` returns one of these
        // for a state a question genuinely has no content for (an explanation
        // card on a question with no explanation), which the CLI reports as a
        // skip rather than inventing text for it.
        outcomes.push({ card, status: "skipped", reason: settled.message });
        done += 1;
        continue;
      }

      const stage = host.querySelector(STAGE_SELECTOR) as HTMLElement | null;
      if (!stage) {
        outcomes.push({ card, status: "failed", reason: "the render stage never mounted" });
        done += 1;
        continue;
      }

      if (!scaleEnvelope.has(envelopeKey)) {
        const fitted = Number(stage.getAttribute("data-render-scale"));
        if (Number.isFinite(fitted) && fitted > 0) scaleEnvelope.set(envelopeKey, fitted);
      }

      const question = byId.get(String(card.questionId));
      const gateFailure = evaluateGates(card, stage, question);
      if (gateFailure) {
        outcomes.push({ card, status: "failed", reason: gateFailure });
        done += 1;
        continue;
      }

      const broken = findBrokenImages(stage);
      if (broken.length > 0) {
        outcomes.push({
          card,
          status: "failed",
          reason:
            `${broken.length} image${broken.length === 1 ? "" : "s"} on the card did not load: ` +
            `${broken.slice(0, 3).join(", ")}`,
        });
        done += 1;
        continue;
      }

      const captured = await captureStageToPng(stage, bundle);
      if (captured.outcome === "captured") {
        const stamped = Number(stage.getAttribute("data-render-scale"));
        outcomes.push({
          card,
          status: "captured",
          warnings: captured.warnings,
          usedScale: Number.isFinite(stamped) ? stamped : null,
          file: { path: card.zipPath, fileName: card.flatFileName, blob: captured.blob },
        });
      } else {
        outcomes.push({ card, status: "failed", reason: captured.failure.detail });
      }
      done += 1;
    }
    args.onProgress?.({ done, total: plan.cards.length, card: plan.cards[plan.cards.length - 1] });
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
  };
}
