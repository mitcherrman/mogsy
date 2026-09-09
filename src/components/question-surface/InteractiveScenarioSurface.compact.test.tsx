/**
 * Phase 2 compact-layout contracts for the question surface:
 *  - compact density (competitive/speed) hard-caps the cinematic band so a
 *    text-first Ranked round never reserves oversized media space;
 *  - comfortable surfaces (standard quiz) keep the tall presentation;
 *  - short 4-option answer sets go 2-up on desktop, long labels fall back to
 *    one column, and the classic quiz grid is untouched by default.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "./InteractiveScenarioSurface";
import type { QuizQuestion } from "@/lib/quiz/api";
import type {
  InteractionPermissions,
  QuestionView,
} from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};

const SHORT_Q: QuestionView = {
  questionId: "q-short", category: "items", prompt: "How much gold?",
  options: [
    { id: "0", index: 0, label: "2400" },
    { id: "1", index: 1, label: "2500" },
    { id: "2", index: 2, label: "2600" },
    { id: "3", index: 3, label: "2700" },
  ],
};
const LONG_LABEL = "A very long explanatory answer label that keeps going well past the cap";
const LONG_Q: QuestionView = {
  ...SHORT_Q,
  questionId: "q-long",
  options: SHORT_Q.options.map((o, i) => (i === 2 ? { ...o, label: LONG_LABEL } : o)),
};
const ITEM_SCENARIO: QuizQuestion = {
  id: "q", category: "items", question_text: SHORT_Q.prompt, format: "multiple_choice",
  choices: SHORT_Q.options.map((o) => o.label),
  metadata: { assets: { subject: { type: "item", name: "Rabadon's Deathcap", icon: "assets/items/3089.png" } } },
};

function mount(
  variant: "competitive" | "standard",
  question: QuestionView = SHORT_Q,
  scenarioSource: QuizQuestion | null = null,
) {
  render(
    <InteractiveScenarioSurface
      question={question} selectedOptionId={null} permissions={OPEN}
      onSelectOption={vi.fn()} variant={variant} scenarioSource={scenarioSource}
    />,
  );
}

describe("compact media budget", () => {
  it("caps the cinematic band under compact density, viewport-relative", () => {
    // QUIZ1 Phase 11 raised the compact ceiling from a flat 11rem to
    // `min(22rem, 34vh)`. The contract this test protects is unchanged — a
    // competitive round must not reserve oversized media — but the cap is now
    // a fraction of the VIEWPORT rather than a fixed height, because R1 (no
    // ability tray) and Phase 11 (no XP row) gave that space back and a fixed
    // cap left the band short in the middle of a half-empty screen. `min()`
    // keeps a short laptop screen near the old height.
    //
    // ARENA1 Phase 1: the variant's cap is now the FALLBACK of
    // `--qs-media-max`, which the canonical question stage sets to its own
    // reserved media region. Outside that stage the token is unset, so the
    // effective cap is byte-for-byte the one this test has always asserted —
    // which is exactly why it is asserted as the fallback rather than dropped.
    mount("competitive", SHORT_Q, ITEM_SCENARIO);
    const hero = screen.getByTestId("scenario-hero");
    expect(hero.style.maxHeight).toBe("var(--qs-media-max, min(22rem, 34vh))");
    expect(hero.style.minHeight).toBe("8rem");
  });

  it("still caps compact well below the comfortable surface", () => {
    mount("competitive", SHORT_Q, ITEM_SCENARIO);
    const compact = screen.getByTestId("scenario-hero").style.maxHeight;
    mount("standard", SHORT_Q, ITEM_SCENARIO);
    const comfortable = screen.getAllByTestId("scenario-hero")[1].style.maxHeight;
    expect(compact).not.toBe(comfortable);
    expect(comfortable).toBe("var(--qs-media-max, 30rem)");
  });

  it("keeps the tall presentation for comfortable surfaces", () => {
    mount("standard", SHORT_Q, ITEM_SCENARIO);
    const hero = screen.getByTestId("scenario-hero");
    expect(hero.style.maxHeight).toBe("var(--qs-media-max, 30rem)");
    expect(hero.style.minHeight).toBe("12.5rem");
  });

  it("text-first questions get the short compact band, no hero reservation", () => {
    mount("competitive", SHORT_Q, null);
    expect(screen.queryByTestId("scenario-hero")).toBeNull();
    expect(screen.getByTestId("scenario-compact")).toBeInTheDocument();
  });

  /**
   * RR1 pass 1 — the compact plate OWNS the arena's reserved media region.
   *
   * The stage reserves `--qs-media-h` (16rem at >=1024px) so consecutive rounds
   * occupy one physical space. The plate used to be a fixed 64/72px strip, so a
   * compact round left ~184px of bare parchment under it and read as content
   * that had failed to load.
   *
   * jsdom performs no layout, so the pixel proof is a browser measurement, not
   * an assertion here (recorded in RR1_HANDOFF.md: region 256 / plate 256 /
   * empty 0 at >=1024px; unchanged 72px with no stage, 64px on mobile). What IS
   * checkable — and what actually encodes the contract — is that the plate
   * declares BOTH halves of it: a growth affordance so it can take the
   * reserve's free space, and a minimum so that with no reserve it keeps
   * exactly the intrinsic height it always had. Either alone is a regression:
   * `grow` without `min-h` collapses the strip outside the arena, and `min-h`
   * without `grow` restores the empty parchment.
   */
  it("the compact plate can fill a reserve and still keep its own floor", () => {
    mount("competitive", SHORT_Q, null);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.className).toContain("grow");
    expect(plate.className).toContain("min-h-16");
    expect(plate.className).toContain("sm:min-h-[4.5rem]");
    // The fixed heights the plate must NOT go back to — they are what pinned
    // it to the top of the region.
    expect(plate.className).not.toMatch(/(^|\s)h-16(\s|$)/);
    expect(plate.className).not.toContain("sm:h-[4.5rem]");
  });

  it("fills the reserve with owned chrome, never with invented artwork", () => {
    // Several families are premise-DENIED because no canonical asset exists
    // (quiz/presentation_contract.py). The plate must therefore fill the region
    // with its own asset-free hextech mark and nothing that could 404.
    mount("competitive", SHORT_Q, null);
    const watermark = screen.getByTestId("scenario-compact-watermark");
    expect(watermark).toBeInTheDocument();
    expect(watermark.querySelector("img")).toBeNull();
    expect(watermark.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("compact answer columns", () => {
  const grid = () => document.querySelector("[data-quiz-answer-options]")!;

  it("goes 2-up on desktop for four short labels under compact density", () => {
    mount("competitive", SHORT_Q);
    expect(grid().getAttribute("data-columns")).toBe("wide-2");
    expect(grid().className).toContain("lg:grid-cols-2");
  });

  it("falls back to one column when any label is long", () => {
    mount("competitive", LONG_Q);
    expect(grid().getAttribute("data-columns")).toBe("auto");
    expect(grid().className).not.toContain("lg:grid-cols-2");
  });

  it("leaves comfortable surfaces on the classic single column", () => {
    mount("standard", SHORT_Q);
    expect(grid().getAttribute("data-columns")).toBe("auto");
    expect(grid().className).not.toContain("lg:grid-cols-2");
  });
});
