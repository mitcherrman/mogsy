import { describe, expect, it } from "vitest";
import type { CaptureLayout, LayoutRect } from "./domQa";
import { evaluateLayoutStability, type LayoutsByFormat } from "./layoutGates";

const r = (x: number, y: number, w = 100, h = 50): LayoutRect => ({ x, y, w, h });
function layout(over: Partial<CaptureLayout> = {}): CaptureLayout {
  return {
    card: r(10, 100),
    cta: r(10, 10),
    qr: r(10, 300),
    ground: r(0, 0, 1080, 1350),
    rail: null,
    scan: r(200, 300),
    resultArea: r(10, 200),
    ...over,
  };
}

describe("evaluateLayoutStability", () => {
  it("classic: question and correct must match within 1px everywhere", () => {
    const ok: LayoutsByFormat = new Map([
      ["mobile-social", new Map([
        ["question", { layout: layout(), slide: "quiz" as const }],
        ["correct", { layout: layout({ card: r(11, 100) }), slide: "quiz" as const }],
      ])],
    ]);
    expect(evaluateLayoutStability({ layoutsByFormat: ok, carousel: false, questionId: 1 }).failures).toEqual([]);

    const shifted: LayoutsByFormat = new Map([
      ["mobile-social", new Map([
        ["question", { layout: layout(), slide: "quiz" as const }],
        ["correct", { layout: layout({ card: r(10, 104) }), slide: "quiz" as const }],
      ])],
    ]);
    const res = evaluateLayoutStability({ layoutsByFormat: shifted, carousel: false, questionId: 1 });
    expect(res.failures.map((f) => [f.classification, f.state, f.format])).toEqual([
      ["layout-shift", "correct", "mobile-social"],
    ]);
  });

  it("carousel: the frame is fixed across slides; the CTA is gated within its family", () => {
    const byJob = new Map([
      ["question", { layout: layout(), slide: "quiz" as const }],
      // End slide: a different CTA geometry is allowed (brand lockup), the frame is not.
      ["app-cta", { layout: layout({ cta: r(0, 0, 300, 90), card: r(40, 400) }), slide: "app-cta" as const }],
      ["recap", { layout: layout({ cta: r(10, 12), qr: r(10, 340) }), slide: "recap" as const }],
    ]);
    const res = evaluateLayoutStability({
      layoutsByFormat: new Map([["square", byJob]]),
      carousel: true,
      questionId: "challenge",
    });
    expect(res.failures.map((f) => f.state)).toEqual(["frame:recap", "cta:recap"]);
    expect(res.notes).toEqual(["  ◻ square post frame parity across 3 slide(s)"]);
  });
});
