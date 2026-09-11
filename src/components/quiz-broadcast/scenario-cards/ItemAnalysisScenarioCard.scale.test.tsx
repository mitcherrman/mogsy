/**
 * RIV1 — the item media SCALE contract.
 *
 * `ItemAnalysisScenarioCard` was the one scenario card the `--sc-fit` pass
 * never reached. Every size in it was bare `cqmin`, which is ~10px on the 16:9
 * broadcast stage and 2.56px in the Ranked band (capped at `--qs-media-max:
 * 16rem`), so the focal item rendered at 27px and a component at 18px while the
 * sibling summoner-spell card drew its subject at 64px in the same box. The
 * owner's report — "item images are still way too small" after MAA1 Phase 2
 * shipped 512px sources — was a box problem, not an artwork problem.
 *
 * WHAT THIS FILE HOLDS, AND WHAT IT DELIBERATELY DOES NOT
 * jsdom has no layout engine, so the computed pixel sizes cannot be asserted
 * here (scenarioCards.contract.test.tsx says the same, for the same reason).
 * The measured before/after lives in the RIV1 report. What is pinned here is
 * the thing a future edit would silently undo: that the item media carries a
 * FLOOR at all, that the floor is square, that the recipe tree's vertical
 * rhythm is not expressed in `%` again, and that no sibling card picked the
 * item treatment up by accident.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/lib/quiz/api";
import { ScenarioCard } from "./ScenarioCard";
import { selectScenario } from "./classify";

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** An `item_costs`-shaped round: the item is STATED, the number is the answer. */
function itemCostQuestion(): QuizQuestion {
  return {
    id: "riv1-cost",
    category: "items",
    question_text: "How much gold does Rabadon's Deathcap cost?",
    format: "multiple_choice",
    choices: ["3600", "3200", "2800", "4000"],
    metadata: {
      assets: { subject: { type: "item", name: "Rabadon's Deathcap", icon: "assets/items/3089.png" } },
    } as QuizQuestion["metadata"],
  };
}

/** A build-path round: `known_components` is what routes to the recipe tree. */
function itemRecipeQuestion(components = ["Sheen", "Phage"]): QuizQuestion {
  return {
    id: "riv1-recipe",
    category: "items",
    question_text: "Trinity Force builds from Sheen, Phage, and which other component?",
    format: "multiple_choice",
    choices: ["Kindlegem", "Ruby Crystal", "Cloth Armor", "Null-Magic Mantle"],
    metadata: {
      assets: { subject: { type: "item", name: "Trinity Force", icon: "assets/items/3078.png" } },
      presentation: { scenario_type: "item", role: "context", timing: "question", spoiler: false },
      known_components: components,
      known_component_icons: components.map((name, i) => ({ name, icon: `assets/items/30${57 + i}.png` })),
    } as QuizQuestion["metadata"],
  };
}

const render_ = (q: QuizQuestion) =>
  wrap(<ScenarioCard question={q} revealActive={false} correctAnswer={null} />);

describe("RIV1 — the item-primary hero is floored, not bare cqmin", () => {
  it("routes a stated-item question to the item card rather than the spoiler placeholder", () => {
    // The premise for everything below: a cost/stat question SHOWS its item.
    // If this ever flips to `placeholder` the artwork is hidden entirely and
    // no size assertion below would notice.
    expect(selectScenario(itemCostQuestion(), false, null).card).toBe("item_analysis");
  });

  it("sizes the hero icon with a --sc-fit floor", () => {
    render_(itemCostQuestion());
    const icon = screen.getByRole("img", { name: "Rabadon's Deathcap" });
    // The regression this exists for: `h-[14cqmin]` renders 36px in the Ranked
    // band. The floor is what makes it 88px there while leaving the broadcast
    // stage (where the cqmin term wins) untouched.
    expect(icon.className).toContain("h-[max(14cqmin,calc(5.5*var(--sc-fit)))]");
    expect(icon.className).toContain("w-[max(14cqmin,calc(5.5*var(--sc-fit)))]");
  });

  it("keeps the hero icon square, so item art is never stretched", () => {
    render_(itemCostQuestion());
    const cls = screen.getByRole("img", { name: "Rabadon's Deathcap" }).className;
    const h = cls.match(/h-\[([^\]]+)\]/)?.[1];
    const w = cls.match(/w-\[([^\]]+)\]/)?.[1];
    expect(h).toBeTruthy();
    expect(h).toBe(w);
  });

  it("floors the shrine composition too, so the rings cannot end up inside the icon", () => {
    const { container } = render_(itemCostQuestion());
    const html = container.innerHTML;
    for (const ring of [
      "max(26cqmin,calc(8.4*var(--sc-fit)))",
      "max(20cqmin,calc(6.9*var(--sc-fit)))",
      "max(15cqmin,calc(5*var(--sc-fit)))",
    ]) {
      expect(html).toContain(ring);
    }
  });
});

describe("RIV1 — the recipe tree scales off the band's height", () => {
  it("hangs the container-query scale hook on the tree root", () => {
    // The tokens themselves live in index.css under a `@container
    // (min-height: …)` query, because --sc-fit saturates at 1rem for every
    // band 176px tall or more and so cannot tell a 256px desktop band from a
    // 145px phone one. Without this attribute none of them apply.
    const { container } = render_(itemRecipeQuestion());
    expect(container.querySelector("[data-item-recipe]")).not.toBeNull();
  });

  it("sizes the focal node and the component tiles from those tokens", () => {
    render_(itemRecipeQuestion());
    const focal = screen.getByRole("img", { name: "Trinity Force" });
    expect(focal.className).toContain("h-[var(--recipe-focal)]");
    expect(focal.className).toContain("w-[var(--recipe-focal)]");
    const sheen = screen.getByRole("img", { name: "Sheen" });
    expect(sheen.className).toContain("h-[var(--recipe-tile)]");
    expect(sheen.className).toContain("w-[var(--recipe-tile)]");
  });

  it("keeps the compact tile variant for a crowded recipe", () => {
    // `compact` turns on at four children (three components + the answer
    // slot). Losing this would overflow a five-node row off the card.
    render_(itemRecipeQuestion(["Sheen", "Phage", "Kindlegem"]));
    const sheen = screen.getByRole("img", { name: "Sheen" });
    expect(sheen.className).toContain("h-[var(--recipe-tile-compact)]");
    expect(sheen.className).not.toContain("h-[var(--recipe-tile)]");
  });

  it("does NOT express the tree's vertical rhythm as a percentage again", () => {
    // The original bug: `pt-[9%] pb-[3%]` on the inner stack. A percentage
    // PADDING resolves against the container's WIDTH — ~896px against a 156px
    // height in the Ranked band — so those two rules alone claimed 84px and
    // 21px and squeezed the tree into what was left.
    const { container } = render_(itemRecipeQuestion());
    const stack = container.querySelector("[data-item-recipe] .flex.h-full.flex-col");
    expect(stack).not.toBeNull();
    const cls = (stack as HTMLElement).className;
    expect(cls).toContain("pt-[14.08cqh]");
    expect(cls).toContain("pb-[4.69cqh]");
    expect(cls).not.toMatch(/p[tby]-\[\d+(\.\d+)?%\]/);
  });

  it("states the label size as a length, not a colour", () => {
    // `text-[var(--x)]` is ambiguous in Tailwind and compiles to `color`, so
    // the labels silently inherited 16px and truncated. The `length:` hint is
    // load-bearing.
    const { container } = render_(itemRecipeQuestion());
    expect(container.innerHTML).toContain("text-[length:var(--recipe-label)]");
    expect(container.innerHTML).not.toContain("text-[var(--recipe-label)]");
  });
});

describe("RIV1 — nothing else inherited the item treatment", () => {
  it("leaves the collectible fallback on its own floor", () => {
    // A rune subject takes CollectibleCard. It already had a --sc-fit floor of
    // its own (2.5x) and RIV1 must not have redefined it in passing.
    const q: QuizQuestion = {
      id: "riv1-rune", category: "runes",
      question_text: "How much adaptive force does this rune grant?",
      format: "multiple_choice", choices: ["9", "5", "18", "0"],
      metadata: { assets: { subject: { type: "rune", name: "Sudden Impact", icon: "assets/runes/Sudden_Impact.png" } } } as QuizQuestion["metadata"],
    };
    expect(selectScenario(q, false, null).card).toBe("collectible");
    const { container } = render_(q);
    expect(container.innerHTML).toContain("max(11cqmin,calc(2.5*var(--sc-fit)))");
    // None of the item card's tokens may leak into a card that is not it.
    expect(container.innerHTML).not.toContain("--recipe-focal");
    expect(container.innerHTML).not.toContain("--recipe-tile");
    expect(container.innerHTML).not.toContain("5.5*var(--sc-fit)");
  });

  it("does not resurrect the rejected RR1 Item Analysis experiment", () => {
    // That pass added item METADATA panels to the question-time card. The
    // dossier sections this card can draw stay reveal-gated, so a
    // question-time render states the item and nothing else.
    const { container } = render_(itemCostQuestion());
    expect(screen.queryByText("Item Information")).not.toBeInTheDocument();
    expect(screen.queryByText("Stats")).not.toBeInTheDocument();
    expect(screen.queryByText("Builds Into")).not.toBeInTheDocument();
    // The universal parchment/gold shell, not a second dark panel scheme.
    expect(container.innerHTML).not.toContain("bg-slate-900");
    expect(container.innerHTML).not.toContain("bg-navy");
  });
});
