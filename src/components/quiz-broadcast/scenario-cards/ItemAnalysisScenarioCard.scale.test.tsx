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

  it("sizes the hero icon off the band-stepped item token", () => {
    // Scoped to this render's own container, not `screen`: the suite shares a
    // document and a sibling file's card can leave a same-named <img> behind,
    // which is what made the RIV1 version of this assertion flake.
    const { container } = render_(itemCostQuestion());
    const icon = container.querySelector("[data-item-hero-icon]") as HTMLElement;
    // RIV1 floored this at `max(14cqmin,calc(5.5*var(--sc-fit)))` — 88px in
    // the Ranked band. RIV2 moved the number into `--item-hero-icon`, which
    // the approved concept needs because it also steps with the BAND'S HEIGHT
    // (index.css), the same distinction the recipe tree needed: `--sc-fit`
    // alone saturates at 16px and reports one value for a 306px desktop band
    // and a 208px tablet one. Measured, the item went 88 -> 152px at 1440.
    expect(icon.className).toContain("h-[var(--item-hero-icon)]");
    expect(icon.className).toContain("w-[var(--item-hero-icon)]");
  });

  it("hangs the container-query scale hook on both token hosts", () => {
    // `--item-hero-icon` is declared on `[data-item-media]`. The hero zone and
    // the backdrop are SIBLINGS, so the attribute has to be on each of them —
    // a custom property only inherits downwards. Without it the item falls
    // back to an unset token and collapses to nothing.
    const { container } = render_(itemCostQuestion());
    expect(container.querySelectorAll("[data-item-media]").length).toBe(2);
  });

  it("keeps the hero icon square, so item art is never stretched", () => {
    const { container } = render_(itemCostQuestion());
    const cls = (container.querySelector("[data-item-hero-icon]") as HTMLElement).className;
    const h = cls.match(/h-\[([^\]]+)\]/)?.[1];
    const w = cls.match(/w-\[([^\]]+)\]/)?.[1];
    expect(h).toBeTruthy();
    expect(h).toBe(w);
  });

  it("derives the whole composition from the item, so the ratios cannot drift", () => {
    // The regression this replaces RIV1's ring assertion with: every
    // decorative layer is a MULTIPLE of `--item-hero-icon` (or of
    // `--item-medallion`, which is itself one), so enlarging the item enlarges
    // its medallion, glow, pedestal and specks together. A bare `cqmin` ring
    // re-introduced here would end up INSIDE a 152px icon in the Ranked band.
    const { container } = render_(itemCostQuestion());
    const html = container.innerHTML;
    for (const token of [
      "var(--item-medallion)",
      "var(--item-medallion-inner)",
      "calc(1.05*var(--item-hero-icon))",   // glow
      "calc(0.68*var(--item-hero-icon))",   // pedestal offset
    ]) {
      expect(html).toContain(token);
    }
  });
});

describe("RIV2 — the item-primary card composes the approved shop scene", () => {
  it("draws the shopkeeper behind the item, from one shared asset", () => {
    const { container } = render_(itemCostQuestion());
    const shopkeeper = container.querySelector('img[src*="item-shopkeeper"]');
    expect(shopkeeper).not.toBeNull();
    // Decorative: the item and its name carry the meaning, so the merchant
    // must not be announced to a screen reader as a second subject.
    expect(shopkeeper).toHaveAttribute("alt", "");
  });

  it("drives the background echo from the SAME dynamic item art", () => {
    // Not a second asset and not a per-item background: the echo is the
    // question's own `item.icon`, which is what keeps this dynamic for every
    // item question without a line of per-item CSS.
    const { container } = render_(itemCostQuestion());
    // The subject icon is resolved to an absolute asset URL before it reaches
    // the card, so match on the path it always ends with.
    const copies = container.querySelectorAll('img[src$="/items/3089.png"], img[src="assets/items/3089.png"]');
    expect(copies.length).toBe(2); // foreground focal item + faint echo
    const echo = Array.from(copies).find((i) => i.getAttribute("alt") === "");
    expect(echo).toBeDefined();
    expect(echo!.className).toContain("h-[var(--item-echo)]");
  });

  it("marks exactly one image as the foreground focal item", () => {
    const { container } = render_(itemCostQuestion());
    const focal = container.querySelectorAll("[data-item-hero-icon]");
    expect(focal.length).toBe(1);
    expect(focal[0].getAttribute("alt")).toBe("Rabadon's Deathcap");
  });

  it("leaves the RECIPE path out of the shop scene entirely", () => {
    // The tree IS the picture on a build-path round, and a merchant behind it
    // would compete with the thing being taught. RIV1's recipe sizing and its
    // own ghost layer are untouched by this pass.
    const { container } = render_(itemRecipeQuestion());
    expect(container.querySelector('img[src*="item-shopkeeper"]')).toBeNull();
    expect(container.querySelector("[data-item-media]")).toBeNull();
    expect(container.querySelector("[data-item-recipe]")).not.toBeNull();
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
    expect(container.innerHTML).not.toContain("--item-hero-icon");
    expect(container.innerHTML).not.toContain("item-shopkeeper");
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
