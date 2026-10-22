import { describe, expect, it } from "vitest";
import { collectDomQa, DOM_QA_ATTRIBUTES, evaluateDomQa, type DomQa, type DomQaContext } from "./domQa";
import { getFormat } from "./formats";

/** A clean, publishable reading: every check passes. */
function cleanDom(over: Partial<DomQa> = {}): DomQa {
  return {
    ctaPresent: true,
    ctaText: "Play at mogzy.lol",
    ctaHasLogo: true,
    cardClipped: false,
    cardOverlapsCta: false,
    missingAssets: [],
    horizontalScroll: false,
    clippedElements: [],
    offscreenChoices: [],
    visibleChoiceStates: ["idle", "idle", "idle", "idle"],
    feedbackVisible: false,
    explanationText: null,
    ctaAboveCard: true,
    qrBelowCard: true,
    qrInsideCtaPanel: false,
    groundPresent: true,
    contentInsideFrame: true,
    contentOutsideFrame: [],
    railClearOfCard: true,
    correctRowContrast: null,
    presentationStatus: null,
    presentationBand: null,
    presentationReason: null,
    expectedImage: null,
    subjectImageResolved: false,
    layout: {},
    ...over,
  };
}

function ctx(over: Partial<DomQaContext> = {}): DomQaContext {
  return {
    question: { id: 7 },
    format: getFormat("mobile-social")!,
    state: "question",
    slideKind: "quiz",
    expectExplanation: false,
    allowIncompletePresentation: false,
    allowMissingAssets: false,
    ...over,
  };
}

const codes = (v: ReturnType<typeof evaluateDomQa>) => v.failures.map((f) => f.code);

describe("evaluateDomQa — the capture-time rules the CLI applies", () => {
  it("passes a clean unanswered card", () => {
    const v = evaluateDomQa(cleanDom(), ctx());
    expect(v.failures).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it("fails answer leakage on an unanswered card and on a recap slide", () => {
    const leaked = cleanDom({ visibleChoiceStates: ["idle", "correct", "idle", "idle"] });
    expect(codes(evaluateDomQa(leaked, ctx()))).toEqual(["leakage"]);
    expect(codes(evaluateDomQa(cleanDom({ feedbackVisible: true }), ctx({ slideKind: "recap" })))).toEqual(["leakage"]);
  });

  it("fails a reveal that does not mark the correct answer, and a missing wrong selection", () => {
    expect(codes(evaluateDomQa(cleanDom(), ctx({ state: "correct" })))).toEqual(["missing-reveal"]);
    const incorrect = cleanDom({ visibleChoiceStates: ["correct", "idle", "idle", "idle"] });
    expect(codes(evaluateDomQa(incorrect, ctx({ state: "incorrect" })))).toEqual(["missing-reveal"]);
    expect(codes(evaluateDomQa(cleanDom(), ctx({ state: "selected" })))).toEqual(["missing-selection"]);
  });

  it("does not apply answer checks to end slides, which require the brand mark instead", () => {
    const summary = cleanDom({ visibleChoiceStates: [], ctaText: "", ctaHasLogo: true });
    expect(evaluateDomQa(summary, ctx({ slideKind: "summary" })).failures).toEqual([]);
    expect(codes(evaluateDomQa(cleanDom({ ctaHasLogo: false }), ctx({ slideKind: "ending" })))).toEqual(["cta-missing"]);
    expect(codes(evaluateDomQa(cleanDom({ ctaText: "Play now" }), ctx()))).toEqual(["cta-missing"]);
  });

  it("fails composition, placement, clipping and contrast exactly as captureOne did", () => {
    const v = evaluateDomQa(
      cleanDom({
        cardClipped: true,
        cardOverlapsCta: true,
        ctaAboveCard: false,
        qrBelowCard: false,
        qrInsideCtaPanel: true,
        groundPresent: false,
        contentInsideFrame: false,
        contentOutsideFrame: ["qr"],
        railClearOfCard: false,
        correctRowContrast: 3.1,
        visibleChoiceStates: ["correct", "idle"],
      }),
      ctx({ state: "correct" }),
    );
    expect(codes(v)).toEqual([
      "card-clipped",
      "cta-overlap",
      "cta-placement",
      "cta-placement",
      "cta-placement",
      "composition",
      "composition",
      "composition",
      "contrast",
    ]);
  });

  it("records overflow without failing the card (the CLI never failed a run on it)", () => {
    const v = evaluateDomQa(cleanDom({ offscreenChoices: [2], clippedElements: ['choice 1: "x"'] }), ctx());
    expect(v.failures).toEqual([]);
    expect(v.overflowFindings.map((f) => f.code)).toEqual(["text-clipping", "choice-outside-stage"]);
  });

  it("fails broken images and an expected subject image that never rendered", () => {
    const v = evaluateDomQa(
      cleanDom({ missingAssets: ["http://x/a.png"], expectedImage: "champion", subjectImageResolved: false }),
      ctx(),
    );
    expect(codes(v)).toEqual(["unresolved-subject-image", "missing-asset"]);
    expect(v.missingAssets).toEqual(["http://x/a.png"]);
  });

  it("warns, not fails, when an explanation state shows no explanation", () => {
    const v = evaluateDomQa(
      cleanDom({ visibleChoiceStates: ["correct", "idle"] }),
      ctx({ state: "explanation", expectExplanation: true }),
    );
    expect(v.failures).toEqual([]);
    expect(v.warnings.map((w) => w.code)).toEqual(["explanation-missing"]);
  });
});

describe("collectDomQa — reads a given document, not the page's own", () => {
  it("reads choice states, CTA text, the brand mark and the presentation attributes", () => {
    const doc = document.implementation.createHTMLDocument("export");
    doc.body.innerHTML = `
      <div data-quiz-render-stage data-render-layout="portrait">
        <div data-quiz-cta>Play at mogzy.lol <span data-quiz-brand-mark>Mogzy</span></div>
        <div data-quiz-content-card ${DOM_QA_ATTRIBUTES.status}="complete" ${DOM_QA_ATTRIBUTES.band}="text">
          <button data-quiz-choice="0" data-choice-state="idle"><span>A</span></button>
          <button data-quiz-choice="1" data-choice-state="correct"><span>B</span></button>
        </div>
        <div data-quiz-stage-ground></div>
      </div>`;
    const dom = collectDomQa(DOM_QA_ATTRIBUTES, doc);
    expect(dom.visibleChoiceStates).toEqual(["idle", "correct"]);
    expect(dom.ctaPresent).toBe(true);
    expect(dom.ctaText).toContain("mogzy.lol");
    expect(dom.groundPresent).toBe(true);
    expect(dom.presentationStatus).toBe("complete");
    expect(dom.presentationBand).toBe("text");
    expect(Object.keys(dom.layout).sort()).toEqual(["card", "cta", "ground", "qr", "rail", "resultArea", "scan"]);
    // And the page's own document was not what it read.
    expect(collectDomQa(DOM_QA_ATTRIBUTES).visibleChoiceStates).toEqual([]);
  });

  it("stays serialisable for page.evaluate: no named nested functions", () => {
    const source = collectDomQa.toString();
    expect(source).not.toMatch(/\n\s+function\s+\w+\s*\(/);
    expect(source).not.toMatch(/\bconst\s+\w+\s*=\s*(\([^)]*\)|\w+)\s*=>/);
    expect(source).not.toMatch(/__name/);
  });
});
