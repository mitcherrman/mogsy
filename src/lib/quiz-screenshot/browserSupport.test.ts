import { describe, expect, it } from "vitest";
import { assessBrowserExportSupport, detectEngine, type SupportScope } from "./browserSupport";
import { captureStageToPng, declaredCustomProperties } from "./browserCapture";
import { runBrowserExport } from "./runBrowserExport";
import { buildExportPlan } from "./exportPlan";

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
  safari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1",
  firefoxIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15",
};

/** A scope with every API the export needs. */
function fullScope(userAgent: string, over: Partial<SupportScope> = {}): SupportScope {
  const fn = function () {};
  return {
    navigator: { userAgent },
    document: { createElementNS: fn },
    XMLSerializer: fn,
    Image: fn,
    HTMLCanvasElement: { prototype: { toBlob: fn, getContext: fn } },
    SVGForeignObjectElement: fn,
    FileReader: fn,
    Blob: fn,
    URL: { createObjectURL: fn },
    fetch: fn,
    requestAnimationFrame: fn,
    DataView: fn,
    ...over,
  };
}

describe("detectEngine", () => {
  it.each([
    [UA.chromeWin, "chromium"],
    [UA.edge, "chromium"],
    [UA.firefox, "firefox"],
    [UA.safari, "webkit"],
    [UA.chromeIos, "webkit"],
    [UA.firefoxIos, "webkit"],
    ["curl/8.0", "unknown"],
  ])("%s → %s", (ua, engine) => {
    expect(detectEngine(ua)).toBe(engine);
  });

  it("trusts Chromium brand hints", () => {
    expect(detectEngine("", [{ brand: "Chromium" }])).toBe("chromium");
  });
});

describe("assessBrowserExportSupport", () => {
  it("Chromium is the verified engine", () => {
    expect(assessBrowserExportSupport(fullScope(UA.chromeWin))).toMatchObject({ status: "verified", missing: [] });
  });

  it("Firefox is never reported as verified", () => {
    const s = assessBrowserExportSupport(fullScope(UA.firefox));
    expect(s.status).toBe("unverified");
    expect(s.engine).toBe("firefox");
    expect(s.notes.join(" ")).toMatch(/not passed a parity run/);
  });

  it("Safari is unverified and warned about canvas tainting", () => {
    const s = assessBrowserExportSupport(fullScope(UA.safari));
    expect(s.status).toBe("unverified");
    expect(s.notes.join(" ")).toMatch(/tainted-canvas/);
  });

  it("a missing API makes the export unsupported, naming it", () => {
    const s = assessBrowserExportSupport(
      fullScope(UA.firefox, { SVGForeignObjectElement: undefined, HTMLCanvasElement: { prototype: {} } }),
    );
    expect(s.status).toBe("unsupported");
    expect(s.missing).toEqual(["HTMLCanvasElement.toBlob", "HTMLCanvasElement.getContext", "SVGForeignObjectElement"]);
  });
});

describe("runBrowserExport browser guards", () => {
  const plan = buildExportPlan({
    selection: [{ id: "1", label: "#1" }],
    formats: ["square"],
    states: ["question", "correct"],
    post: null,
    runId: "guard",
  });

  it("refuses to start on an unsupported browser and reports every card", async () => {
    const result = await runBrowserExport({
      plan,
      questions: [],
      support: { engine: "unknown", status: "unsupported", missing: ["XMLSerializer"], notes: ["lacks XMLSerializer"] },
    });
    expect(result.files).toEqual([]);
    expect(result.aborted).toMatch(/XMLSerializer/);
    expect(result.outcomes.map((o) => [o.status, o.status === "failed" ? o.classification : null])).toEqual([
      ["failed", "browser-unsupported"],
      ["failed", "browser-unsupported"],
    ]);
    // Nothing was mounted.
    expect(document.querySelector("[data-content-export-frame]")).toBeNull();
  });

  it("a cancelled run reports every remaining card as cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runBrowserExport({
      plan,
      questions: [],
      signal: controller.signal,
      styleBundle: { css: "", unresolved: [] },
      support: { engine: "chromium", status: "verified", missing: [], notes: [] },
    });
    expect(result.aborted).toBe("cancelled by the operator");
    expect(result.outcomes.every((o) => o.status === "failed" && o.classification === "cancelled")).toBe(true);
    expect(result.outcomes).toHaveLength(2);
  });
});

describe("browserCapture compatibility guards", () => {
  it("collects declared custom-property names for engines that do not enumerate them", () => {
    expect(
      declaredCustomProperties(":root{--background: 0 0% 4%;--lol-gold:#c8aa6e}.x{color:var(--lol-gold)} .y{ --card-r : 2px }"),
    ).toEqual(["--background", "--card-r", "--lol-gold"]);
  });

  it("fails an oversize card with svg-too-large instead of a generic decode error", async () => {
    const stage = document.createElement("div");
    stage.innerHTML = "<p>card</p>";
    document.body.appendChild(stage);
    stage.getBoundingClientRect = () => ({ width: 1080, height: 1080 }) as DOMRect;
    const result = await captureStageToPng(stage, { css: "", unresolved: [] }, { maxSvgChars: 64 });
    stage.remove();
    expect(result.outcome).toBe("failed");
    expect(result.outcome === "failed" && result.failure.code).toBe("svg-too-large");
  });
});
