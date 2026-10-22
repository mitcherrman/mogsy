/**
 * CC2 — can THIS browser run the content export, and has it been verified?
 *
 * The export (`./browserCapture.ts`, `./runBrowserExport.ts`) depends on a
 * handful of platform features. Parity with the Playwright authority has been
 * MEASURED only in Chromium (the CI parity workflow drives bundled headless
 * Chromium). Everything else is reported honestly as unverified, never as
 * supported-by-assumption.
 *
 * Engine notes from the CC2 compatibility review (code reading, not a test):
 *
 *  - Firefox (Gecko): every API below exists. Three behaviours differ from
 *    Chromium and are guarded where practical:
 *      1. enumerating `getComputedStyle()` has historically omitted custom
 *         properties, which would drop the `:root` theme tokens the capture
 *         re-seeds — `browserCapture` now also reads every custom property the
 *         stylesheets declare, by name;
 *      2. Gecko caps URL length, and the card is rasterised from a `data:` URL
 *         carrying inlined fonts and images — an oversize card now fails with
 *         an explicit `svg-too-large` reason instead of a generic decode error;
 *      3. an iframe's initial `about:blank` may be replaced when it finishes
 *         loading — the runner detects a replaced export surface and fails
 *         that card with a reason instead of waiting out the ready timeout.
 *  - WebKit (Safari): has historically TAINTED a canvas after drawing an SVG
 *    that contains `<foreignObject>`, which makes `toBlob` fail. The capture
 *    already reports that as `tainted-canvas`; it is not worked around.
 *
 * Pure apart from reading the injected scope, so it is unit-tested with fakes.
 */

export type BrowserEngine = "chromium" | "firefox" | "webkit" | "unknown";

export type BrowserExportSupport = {
  engine: BrowserEngine;
  /**
   * verified    — the engine the parity workflow measures (Chromium).
   * unverified  — the APIs exist but no parity run has passed on this engine.
   * unsupported — a required API is missing; the export must not start.
   */
  status: "verified" | "unverified" | "unsupported";
  missing: string[];
  notes: string[];
};

/** The parts of a browser global scope the assessment reads. */
export type SupportScope = {
  navigator?: { userAgent?: string; userAgentData?: { brands?: Array<{ brand: string }> } };
  document?: { createElementNS?: unknown };
  XMLSerializer?: unknown;
  Image?: unknown;
  HTMLCanvasElement?: { prototype?: { toBlob?: unknown; getContext?: unknown } };
  SVGForeignObjectElement?: unknown;
  FileReader?: unknown;
  Blob?: unknown;
  URL?: { createObjectURL?: unknown };
  fetch?: unknown;
  requestAnimationFrame?: unknown;
  DataView?: unknown;
};

/**
 * Engine from the user agent. Brand hints win when present (Chromium exposes
 * them; Firefox and Safari do not). Order matters: Chromium UAs also say
 * "Safari", Edge/Opera/Brave are Chromium, and EVERY iOS browser — Chrome
 * (`CriOS`) and Firefox (`FxiOS`) included — is WebKit underneath.
 */
export function detectEngine(
  userAgent: string,
  brands: ReadonlyArray<{ brand: string }> = [],
): BrowserEngine {
  if (/\b(iPhone|iPad|iPod)\b|CriOS\/|FxiOS\/|EdgiOS\//.test(userAgent)) return "webkit";
  if (brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand))) return "chromium";
  if (/Firefox\/\d/.test(userAgent)) return "firefox";
  if (/Chrome\/\d|Chromium\/\d|Edg\/\d|OPR\/\d/.test(userAgent)) return "chromium";
  if (/AppleWebKit\/\d/.test(userAgent) && /Safari\/\d|Mobile\//.test(userAgent)) return "webkit";
  return "unknown";
}

const REQUIRED: Array<[string, (s: SupportScope) => boolean]> = [
  ["XMLSerializer", (s) => typeof s.XMLSerializer === "function"],
  ["Image", (s) => typeof s.Image === "function"],
  ["HTMLCanvasElement.toBlob", (s) => typeof s.HTMLCanvasElement?.prototype?.toBlob === "function"],
  ["HTMLCanvasElement.getContext", (s) => typeof s.HTMLCanvasElement?.prototype?.getContext === "function"],
  ["SVGForeignObjectElement", (s) => typeof s.SVGForeignObjectElement === "function"],
  ["FileReader", (s) => typeof s.FileReader === "function"],
  ["Blob", (s) => typeof s.Blob === "function"],
  ["URL.createObjectURL", (s) => typeof s.URL?.createObjectURL === "function"],
  ["fetch", (s) => typeof s.fetch === "function"],
  ["requestAnimationFrame", (s) => typeof s.requestAnimationFrame === "function"],
  ["document.createElementNS", (s) => typeof s.document?.createElementNS === "function"],
  ["DataView", (s) => typeof s.DataView === "function"],
];

export function assessBrowserExportSupport(
  scope: SupportScope = globalThis as unknown as SupportScope,
): BrowserExportSupport {
  const missing = REQUIRED.filter(([, present]) => !present(scope)).map(([name]) => name);
  const engine = detectEngine(
    scope.navigator?.userAgent ?? "",
    scope.navigator?.userAgentData?.brands ?? [],
  );
  const notes: string[] = [];
  if (missing.length > 0) {
    notes.push(`This browser lacks ${missing.join(", ")}, which the export needs.`);
    return { engine, status: "unsupported", missing, notes };
  }
  if (engine === "chromium") return { engine, status: "verified", missing, notes };
  if (engine === "firefox") {
    notes.push(
      "Firefox has not passed a parity run against the canonical renderer; " +
        "check every exported image before publishing.",
    );
  } else if (engine === "webkit") {
    notes.push(
      "Safari has historically blocked reading back a canvas drawn from SVG foreignObject; " +
        "cards may fail with a tainted-canvas reason. Use Chrome or Edge.",
    );
  } else {
    notes.push("Unrecognised browser; export parity is unverified. Use Chrome or Edge.");
  }
  return { engine, status: "unverified", missing, notes };
}

/**
 * The largest `data:` URL the capture will hand to an `<img>` on Gecko.
 *
 * Firefox enforces a maximum URL length; the exact cap has varied by release,
 * so this is a conservative ceiling rather than a measured one. Above it the
 * capture fails with an explicit reason instead of a generic decode failure.
 */
export const GECKO_MAX_DATA_URL_CHARS = 32 * 1024 * 1024;
