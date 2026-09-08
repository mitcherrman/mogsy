/**
 * CON1 — browser-side capture of a render-harness stage.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A SECOND RENDERER
 *
 * The deterministic Content Factory captures `[data-quiz-render-stage]` with
 * Playwright (`scripts/quiz-screenshots/capture.ts`). That stage is already a
 * self-contained capture surface: it declares its own pixel width/height, it
 * suppresses the arena's viewport-fixed backdrop and paints the ground inside
 * itself, and it stamps `data-quiz-render-ready` only after fonts and images
 * settle. Nothing about it needs a Node process.
 *
 * This module rasterises THAT SAME element in the browser. It holds no layout,
 * no format table, no question model and no style of its own — it is handed an
 * element and returns a PNG of it. Every pixel it produces was composed by the
 * production components under the production stylesheet.
 *
 * WHY SVG foreignObject AND NOT html2canvas
 *
 * `html2canvas` (already a dependency, used by `useScreenshot` for the
 * lightweight matchup card) re-implements CSS painting in JavaScript. Measured
 * against the Playwright output on the real composition it differs on 26–41%
 * of pixels: it lays glyphs out individually inside a scaled ancestor
 * ("T h o r n m a i l"), drops the vellum texture, and mis-crops the ground.
 * It is not usable for publishable content — see `docs/CON1_ADMIN_EXPORT.md`.
 *
 * An `<svg><foreignObject>` rasterised through an `<img>` uses the browser's
 * OWN layout and paint engine, so box-shadows, multi-layer backgrounds,
 * gradients, masks and text shaping are by construction identical to the live
 * render. Its three real constraints are handled below, in order:
 *
 *   1. NO NETWORK. An `<img>`-loaded SVG cannot fetch anything, so every
 *      stylesheet, font file and image must already be inline. Anything that
 *      cannot be inlined is REPORTED, never silently dropped.
 *   2. NO ANIMATION CLOCK. It rasterises at time zero, so an entrance with a
 *      delay and `animation-fill-mode: backwards` paints its FROM keyframe —
 *      which is how four answer tablets at `opacity: 0` reached a PNG during
 *      the audit. Animations are disabled the same way the Playwright runner
 *      disables them (`reducedMotion: 'reduce'`), and for the same reason the
 *      stylesheet itself gives: the resting state is the visible one.
 *   3. NO DOCUMENT ANCESTORS. The stage is re-parented under a bare div, so
 *      everything it INHERITED from `<html>`/`<body>` — the font stack, the
 *      text colour and every `:root` custom property — is re-seeded from the
 *      live render before serialisation.
 */

/** Elements whose failure to inline leaves a visible hole in the export. */
export type CaptureFailure = {
  code: "unloadable-image" | "raster-failed" | "tainted-canvas" | "empty-stage";
  detail: string;
};

/**
 * A STRING discriminant, not `ok: true | false`. This project compiles with
 * `strict: false`, and without `strictNullChecks` TypeScript widens boolean
 * literal members of a union — so an `ok` flag stops narrowing the result and
 * the failure branch silently type-checks as the success one.
 */
export type CaptureResult =
  | { outcome: "captured"; blob: Blob; width: number; height: number; warnings: string[] }
  | { outcome: "failed"; failure: CaptureFailure; warnings: string[] };

/**
 * Stylesheet text plus its inlined `url()` payloads.
 *
 * Building this walks every stylesheet in the document and fetches every asset
 * they reference, which is the expensive half of a capture. It does not change
 * between the cards of one export, so a run builds it ONCE and passes it to
 * every capture.
 */
export type CaptureStyleBundle = {
  css: string;
  /** `url()` targets that could not be inlined; they will not paint. */
  unresolved: string[];
};

const INHERITED_PROPERTIES = [
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "font-feature-settings",
  "font-kerning",
  "letter-spacing",
  "word-spacing",
  "line-height",
  "text-align",
  "text-transform",
  "text-rendering",
  "-webkit-font-smoothing",
  "direction",
  "white-space",
] as const;

/**
 * The animation kill-switch, appended AFTER the document's own CSS so it wins.
 *
 * This is the browser-side twin of the runner's `reducedMotion: "reduce"`, not
 * a new opinion about motion: `index.css` already drops the answer-tablet
 * entrance under that preference, with the note that "the resting state is the
 * visible one, so dropping it is safe by construction".
 */
const STATIC_CLOCK_CSS =
  "*,*::before,*::after{animation:none !important;transition:none !important;}";

const URL_PATTERN = /url\((['"]?)([^'")]+)\1\)/g;

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Collect every stylesheet the document has and inline the assets they call
 * for. Cross-origin sheets (the Google Fonts links in `index.html`) expose no
 * `cssRules`, so they are re-fetched by href — which is also what makes the
 * `@font-face` sources reachable for inlining.
 */
export async function buildCaptureStyleBundle(doc: Document = document): Promise<CaptureStyleBundle> {
  const chunks: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = null;
    }
    if (rules) {
      let text = "";
      for (const rule of Array.from(rules)) text += `${rule.cssText}\n`;
      chunks.push(text);
      continue;
    }
    if (sheet.href) {
      try {
        const response = await fetch(sheet.href);
        if (response.ok) chunks.push(await response.text());
      } catch {
        /* an unreachable sheet contributes nothing; reported via `unresolved` */
      }
    }
  }

  let css = chunks.join("\n");
  const targets = new Set<string>();
  css.replace(URL_PATTERN, (match, _quote, target: string) => {
    if (!target.startsWith("data:")) targets.add(target);
    return match;
  });

  const inlined = new Map<string, string>();
  const unresolved: string[] = [];
  await Promise.all(
    Array.from(targets).map(async (target) => {
      let absolute: string;
      try {
        absolute = new URL(target, doc.baseURI).href;
      } catch {
        unresolved.push(target);
        return;
      }
      const dataUrl = await fetchAsDataUrl(absolute);
      if (dataUrl) inlined.set(target, dataUrl);
      else unresolved.push(target);
    }),
  );

  css = css.replace(URL_PATTERN, (match, _quote, target: string) =>
    inlined.has(target) ? `url("${inlined.get(target)}")` : match,
  );

  return { css: `${css}\n${STATIC_CLOCK_CSS}`, unresolved };
}

/**
 * Re-seed on the serialisation wrapper everything the stage inherited from the
 * document it was mounted in: the theme classes (so `.theme-lol …` descendant
 * rules still match), every `:root`/`body` custom property, and the inheritable
 * text properties. Without this the answer labels fall back to the SVG's
 * default serif while the Cinzel headings — which name their face explicitly —
 * stay correct, which is exactly the half-wrong output that is hardest to spot.
 */
function seedInheritedContext(wrapper: HTMLElement, stage: HTMLElement, width: number, height: number): void {
  const doc = stage.ownerDocument;
  const view = doc.defaultView;
  if (!view) return;
  const declarations = [`width:${width}px`, `height:${height}px`];
  for (const element of [doc.documentElement, doc.body]) {
    if (!element) continue;
    const computed = view.getComputedStyle(element);
    for (const property of Array.from(computed)) {
      if (property.startsWith("--")) declarations.push(`${property}:${computed.getPropertyValue(property)}`);
    }
  }
  const stageComputed = view.getComputedStyle(stage);
  for (const property of INHERITED_PROPERTIES) {
    const value = stageComputed.getPropertyValue(property);
    if (value) declarations.push(`${property}:${value}`);
  }
  wrapper.setAttribute("style", declarations.join(";"));
  const themeClasses = `${doc.documentElement.className} ${doc.body?.className ?? ""}`.trim();
  if (themeClasses) wrapper.setAttribute("class", themeClasses);
}

/**
 * Inline every `<img>` in the clone.
 *
 * A failure here is a FAILURE, not a warning: the source element is a real
 * picture the composition placed on the card, and exporting the card with a
 * hole where it belongs is precisely the outcome the Content Factory's asset
 * gate exists to prevent. The caller is told which URL, so the operator can act
 * on it rather than discovering it in a published post.
 */
async function inlineImages(
  source: HTMLElement,
  clone: HTMLElement,
): Promise<{ unloadable: string[] }> {
  const sources = Array.from(source.querySelectorAll("img"));
  const clones = Array.from(clone.querySelectorAll("img"));
  const unloadable: string[] = [];
  await Promise.all(
    sources.map(async (image, index) => {
      const target = clones[index];
      if (!target) return;
      const href = image.currentSrc || image.src;
      if (!href || href.startsWith("data:")) return;
      const dataUrl = await fetchAsDataUrl(href);
      if (!dataUrl) {
        unloadable.push(href);
        return;
      }
      target.setAttribute("src", dataUrl);
      target.removeAttribute("srcset");
      target.removeAttribute("loading");
    }),
  );
  return { unloadable };
}

/**
 * Rasterise one render-harness stage to a PNG blob at its own declared size.
 *
 * The stage's `getBoundingClientRect()` IS the format's pixel size — the
 * harness sets `width`/`height` from the format registry — so the export needs
 * no size table and cannot disagree with the one the CLI uses.
 */
export async function captureStageToPng(
  stage: HTMLElement,
  bundle: CaptureStyleBundle,
): Promise<CaptureResult> {
  const warnings: string[] = [];
  const rect = stage.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width <= 0 || height <= 0) {
    return {
      outcome: "failed",
      warnings,
      failure: { code: "empty-stage", detail: `stage measured ${width}×${height}` },
    };
  }

  const doc = stage.ownerDocument;
  const clone = stage.cloneNode(true) as HTMLElement;
  clone.style.margin = "0";

  const { unloadable } = await inlineImages(stage, clone);
  if (unloadable.length > 0) {
    return {
      outcome: "failed",
      warnings,
      failure: {
        code: "unloadable-image",
        detail:
          `${unloadable.length} image${unloadable.length === 1 ? "" : "s"} on the card could not be ` +
          `read for export (cross-origin without CORS, or unreachable): ${unloadable.slice(0, 3).join(", ")}`,
      },
    };
  }

  const wrapper = doc.createElementNS("http://www.w3.org/1999/xhtml", "div") as HTMLElement;
  seedInheritedContext(wrapper, stage, width, height);
  const styleElement = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
  styleElement.textContent = bundle.css;
  wrapper.appendChild(styleElement);
  wrapper.appendChild(clone);

  // `outerHTML` emits HTML, which is not well-formed XML — an unescaped `&` or
  // a void element without a closing slash makes the SVG fail to parse, and an
  // <img>-loaded SVG reports that only as a generic load error.
  let markup: string;
  try {
    markup = new XMLSerializer().serializeToString(wrapper);
  } catch (error) {
    return {
      outcome: "failed",
      warnings,
      failure: { code: "raster-failed", detail: `could not serialise the card: ${String(error)}` },
    };
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject></svg>`;
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const image = new Image();
  image.width = width;
  image.height = height;
  const loaded = await new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = svgUrl;
  });
  if (!loaded) {
    return {
      outcome: "failed",
      warnings,
      failure: { code: "raster-failed", detail: "the browser could not rasterise the card" },
    };
  }

  const canvas = doc.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return {
      outcome: "failed",
      warnings,
      failure: { code: "raster-failed", detail: "2D canvas unavailable" },
    };
  }
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((result) => resolve(result), "image/png");
    } catch {
      resolve(null);
    }
  });
  if (!blob) {
    return {
      outcome: "failed",
      warnings,
      failure: {
        code: "tainted-canvas",
        detail: "the card could not be read back — an asset on it is cross-origin without CORS",
      },
    };
  }

  return { outcome: "captured", blob, width, height, warnings };
}
