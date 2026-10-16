/**
 * JUX1-F2 — a phone's reveal takes the answer region, through the production
 * module on real JATTN1 captures (`lib/journey/__fixtures__/jattn1`).
 *
 * jsdom has no layout, so what is provable here is the strip's CONTENT (the
 * player's own answer and the correct one, as their tablets draw them, for a
 * right answer, a wrong one, a timeout and a formula-length label), that it
 * exists only on a reveal, and the stylesheet contract that keeps desktop
 * unchanged. The fit itself (no clipping, no scroll, the same stage height at
 * 509×709, 390×844, 360×740 and 360×640) is certified in a browser — see
 * `JOURNEY_JUX1_HANDOFF.md`.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { masterySliceModule } from "./masterySliceModule";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function show(s: CaptureSnapshot) {
  vi.setSystemTime(Date.parse(s.at));
  const round = readPublicRound(s.envelope);
  return render(
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: (() => {}) as never, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>,
  );
}
const q = (id: string) => screen.queryByTestId(id);
const text = (id: string) => q(id)?.textContent ?? null;
/** The label a tablet draws (its option letter, the label, any "Your pick" tag). */
const tablet = (state: string) => document.querySelector<HTMLElement>(`[data-quiz-choice][data-choice-state="${state}"]`);
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replace(/\r\n/g, "\n");

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("before the answer nothing changes", () => {
  it.each([["jattn1/zed_ahri.reference", "child0-open"], ["jattn1/pantheon.standard", "child2-open"]])(
    "%s %s: four tablets, no strip", (n, label) => {
      show(snap(n, label));
      expect(document.querySelectorAll("[data-quiz-choice]")).toHaveLength(4);
      expect(q("journey-answer-strip")).toBeNull();
      expect(q("journey-reveal")).toBeNull();
    });
});

describe("the reveal's answer strip says what the tablets said", () => {
  it("a wrong answer: the player's pick and the correct answer, each as its tablet draws it", () => {
    show(snap("jattn1/pantheon.standard", "child2-reveal"));
    const strip = q("journey-answer-strip")!;
    expect(strip.dataset.outcome).toBe("wrong");
    const picked = text("journey-answer-strip-picked")!;
    const correct = text("journey-answer-strip-correct")!;
    expect(picked).toMatch(/^Your answer/);
    expect(correct).toMatch(/^Correct answer/);
    const pickedValue = picked.replace(/^Your answer/, "");
    const correctValue = correct.replace(/^Correct answer/, "");
    expect(tablet("incorrect-selected")!.textContent).toContain(pickedValue);
    expect(tablet("correct")!.textContent).toContain(correctValue);
    // the verdict's answer is the same served answer
    expect(text("journey-reveal-answer")).toBe(correctValue);
    // the four tablets are still there (hidden on a phone by the stylesheet only)
    expect(document.querySelectorAll("[data-quiz-choice]")).toHaveLength(4);
  });

  it("sits in the verdict's line, right after the verdict, inside the reveal's polite region", () => {
    show(snap("jattn1/pantheon.standard", "child2-reveal"));
    const strip = q("journey-answer-strip")!;
    expect(strip.parentElement!.className).toBe("journey-reveal__top");
    expect(strip.previousElementSibling).toBe(q("journey-reveal-verdict"));
    expect(q("journey-reveal")!.contains(strip)).toBe(true);
  });

  it("a correct answer: one item, marked correct", () => {
    show(snap("jattn1/zed_ahri.reference", "child3-reveal"));
    expect(q("journey-answer-strip")!.dataset.outcome).toBe("correct");
    expect(text("journey-answer-strip-picked")).toBe(`Your answer · correct${text("journey-reveal-answer")}`);
    expect(q("journey-answer-strip-picked")!.dataset.tone).toBe("correct");
    expect(q("journey-answer-strip-correct")).toBeNull();
  });

  it("a timeout: no answer, then the correct one", () => {
    show(snap("jattn1/zed_ahri.reference.timeout", "child3-timeout-reveal"));
    expect(q("journey-answer-strip")!.dataset.outcome).toBe("timeout");
    expect(text("journey-answer-strip-picked")).toBe("Your answerNo answer");
    expect(text("journey-answer-strip-correct")).toBe(`Correct answer${text("journey-reveal-answer")}`);
  });

  it("a formula-length label is drawn whole, and the two answers stack", () => {
    show(snap("jattn1/zed_ahri.reference.wrong", "child0-reveal"));
    const strip = q("journey-answer-strip")!;
    expect(strip.dataset.layout).toBe("stacked");
    const picked = text("journey-answer-strip-picked")!.replace(/^Your answer/, "");
    const correct = text("journey-answer-strip-correct")!.replace(/^Correct answer/, "");
    expect(correct).toBe("70 / 92.5 / 115 / 137.5 / 160 (+70% bonus AD)");
    expect(picked).toBe("70 / 92.5 / 115 / 137.5 / 160 (+70% total AD)");
    expect(tablet("incorrect-selected")!.textContent).toContain(picked);
  });

  it("short values sit side by side", () => {
    show(snap("jattn1/pantheon.standard", "child2-reveal"));
    expect(q("journey-answer-strip")!.dataset.layout).toBe("inline");
  });
});

describe("the stylesheet: phones only, nothing clipped, nothing scrolls", () => {
  const start = CSS.indexOf("JUX1-F2 — A PHONE'S REVEAL TAKES THE ANSWER REGION");
  const block = CSS.slice(start);
  const media = block.indexOf("@media (max-width: 639.98px) {");
  const outside = block.slice(block.indexOf("*/") + 2, media);
  const inside = block.slice(media);

  it("is the last section, and outside a phone it lays out nothing and draws no strip", () => {
    expect(start).toBeGreaterThan(0);
    expect(outside.trim()).toBe(".journey-answer-strip { display: none; }");
  });
  it("hides the tablets (keeping their box) only during a reveal", () => {
    expect(inside).toMatch(/\.journey-ask\[data-revealing="true"\] \[data-surface-region="answers"\] \{ visibility: hidden; \}/);
    expect(inside).not.toMatch(/display:\s*none/);
  });
  it("never scrolls, clips with an ellipsis or breaks inside a word", () => {
    expect(inside).not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
    expect(inside).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(inside).not.toMatch(/overflow-wrap:\s*anywhere|word-break:\s*break-all/);
    expect(inside).toMatch(/-webkit-line-clamp: none;/);
  });
  it("leaves the base reveal box (desktop) as it was", () => {
    expect(CSS).toContain("\n.journey-reveal {\n  position: absolute;\n  inset: 0 0 auto 0;\n  height: var(--jq-prompt-h);");
  });
});
