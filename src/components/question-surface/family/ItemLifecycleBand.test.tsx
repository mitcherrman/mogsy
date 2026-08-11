/**
 * Item lifecycle band (RA7) — rendered through the REAL surface.
 *
 * The family's failure mode is not leakage (the answer is a stat total that
 * appears nowhere in the premise); it is MISREADING. A sold item drawn like a
 * held one, or a purchase drawn like a starting item, silently changes what the
 * question is asking. So most of this suite is about the stage each item is
 * placed in, that the stage is stated as a WORD and not only as an appearance,
 * and that an incomplete transaction falls back instead of drawing a partial
 * timeline.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "../InteractiveScenarioSurface";
import {
  ITEM_HISTORY_SCENARIO,
  PURCHASE_HISTORY_Q,
  PURCHASE_HISTORY_SCENARIO,
  SELL_SWAP_Q,
  SELL_SWAP_SCENARIO,
  STATIC_INVENTORY_Q,
  STATIC_INVENTORY_SCENARIO,
} from "@/lib/question-surface/familyLayoutFixtures";
import type { QuizQuestion } from "@/lib/quiz/api";
import type {
  InteractionPermissions,
  QuestionView,
} from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};

function mount(
  question: QuestionView,
  scenarioSource: QuizQuestion | null,
  extra: Partial<React.ComponentProps<typeof InteractiveScenarioSurface>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <InteractiveScenarioSurface
        question={question}
        selectedOptionId={null}
        permissions={OPEN}
        onSelectOption={vi.fn()}
        variant="competitive"
        scenarioSource={scenarioSource}
        {...extra}
      />
    </QueryClientProvider>,
  );
}

const band = () => screen.getByTestId("family-band-lifecycle");
const stage = (name: string) => screen.getByTestId(`lifecycle-stage-${name}`);
const summary = () => screen.getByTestId("family-band-summary").textContent ?? "";

describe("lifecycle band — sell swap", () => {
  it("replaces the undifferentiated item row with staged columns", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    expect(band()).toBeInTheDocument();
    expect(screen.queryByTestId("scenario-hero")).toBeNull();
    expect(screen.getByTestId("scenario-surface").dataset.band).toBe("family");
  });

  it("places the retained, purchased and sold items in their own stages", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    expect(within(stage("retained")).getByText("Sunfire Aegis")).toBeInTheDocument();
    expect(within(stage("purchased")).getByText("Abyssal Mask")).toBeInTheDocument();
    expect(within(stage("sold")).getByText("Doran's Shield")).toBeInTheDocument();
  });

  it("names every stage as a word, never as colour alone", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    expect(stage("retained")).toHaveTextContent("Kept");
    expect(stage("purchased")).toHaveTextContent("Bought");
    expect(stage("sold")).toHaveTextContent("Sold");
  });

  it("draws the sold item struck through as well as faded", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    const sold = within(stage("sold")).getByTestId("lifecycle-item");
    expect(within(sold).getByTestId("family-sold-strike")).toBeInTheDocument();
    expect(within(sold).getByText("Doran's Shield").className).toContain("line-through");
  });

  it("gives the purchase a restrained marker and no strike", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    const bought = within(stage("purchased")).getByTestId("lifecycle-item");
    expect(within(bought).getByTestId("family-entity-tile").className)
      .toContain("#8fd0a0");
    expect(within(bought).queryByTestId("family-sold-strike")).toBeNull();
  });

  it("names the champion whose inventory this is", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    expect(band()).toHaveTextContent("Ornn");
  });
});

describe("lifecycle band — purchase history", () => {
  it("shows multiple starting items and multiple purchases", () => {
    mount(PURCHASE_HISTORY_Q, PURCHASE_HISTORY_SCENARIO);
    const starting = within(stage("starting")).getAllByTestId("lifecycle-item");
    const bought = within(stage("purchased")).getAllByTestId("lifecycle-item");
    expect(starting).toHaveLength(2);
    expect(bought).toHaveLength(2);
    expect(stage("starting")).toHaveTextContent("Doran's Blade");
    expect(stage("starting")).toHaveTextContent("Health Potion");
    expect(stage("purchased")).toHaveTextContent("Phage");
    expect(stage("purchased")).toHaveTextContent("Kindlegem");
  });

  it("separates what was started with from what is currently held", () => {
    mount(PURCHASE_HISTORY_Q, PURCHASE_HISTORY_SCENARIO);
    expect(stage("starting")).toHaveTextContent("Started with");
    expect(screen.queryByTestId("lifecycle-stage-current")).toBeNull();
  });

  it("renders the stages in chronological order in the DOM", () => {
    mount(PURCHASE_HISTORY_Q, PURCHASE_HISTORY_SCENARIO);
    const stages = Array.from(
      band().querySelectorAll("[data-stage]"),
    ).map((el) => el.getAttribute("data-stage"));
    expect(stages).toEqual(["starting", "purchased"]);
  });

  it("falls back to a monogram when an item icon fails to load", () => {
    mount(PURCHASE_HISTORY_Q, PURCHASE_HISTORY_SCENARIO);
    const tile = within(stage("starting")).getAllByTestId("family-entity-tile")[0];
    const box = tile.className;
    fireEvent.error(tile.querySelector("img")!);
    // The slot keeps its exact box and gains a monogram, so a dead image can
    // neither blank the entry nor reflow the stage around it.
    expect(tile.querySelector("img")).toBeNull();
    expect(tile.className).toBe(box);
    expect(tile).toHaveTextContent("D");
    expect(stage("starting")).toHaveTextContent("Doran's Blade");
  });
});

describe("lifecycle band — one item with a history", () => {
  it("renders the item once, in the stage it ends in", () => {
    mount(SELL_SWAP_Q, ITEM_HISTORY_SCENARIO);
    expect(screen.getAllByText("Doran's Shield")).toHaveLength(1);
    expect(within(stage("sold")).getByText("Doran's Shield")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-stage-starting")).toBeNull();
  });

  it("says how the item got there rather than duplicating the tile", () => {
    mount(SELL_SWAP_Q, ITEM_HISTORY_SCENARIO);
    expect(screen.getByTestId("lifecycle-item-history"))
      .toHaveTextContent("started with, then sold");
    expect(summary()).toContain("Doran's Shield (started with, then sold)");
  });
});

describe("lifecycle band — fallback and safety", () => {
  it("leaves a static inventory on the presentation it already had", () => {
    mount(STATIC_INVENTORY_Q, STATIC_INVENTORY_SCENARIO);
    expect(screen.queryByTestId("family-band-lifecycle")).toBeNull();
    expect(screen.getByTestId("scenario-hero")).toBeInTheDocument();
  });

  it("falls back when the transaction is incomplete", () => {
    const malformed = JSON.parse(JSON.stringify(SELL_SWAP_SCENARIO));
    delete (malformed.metadata as any).assets.entities.items[0].status;
    mount(SELL_SWAP_Q, malformed);
    expect(screen.queryByTestId("family-band-lifecycle")).toBeNull();
    expect(screen.getByTestId("scenario-hero")).toBeInTheDocument();
  });

  it("shows no option value, and therefore no answer", () => {
    for (const [q, s] of [
      [SELL_SWAP_Q, SELL_SWAP_SCENARIO],
      [PURCHASE_HISTORY_Q, PURCHASE_HISTORY_SCENARIO],
    ] as const) {
      const view = mount(q, s);
      const text = view.container
        .querySelector("[data-testid=family-band-lifecycle]")!.textContent ?? "";
      for (const option of q.options) expect(text).not.toContain(option.label);
      view.unmount();
    }
  });

  it("does not move when an option is selected or revealed", () => {
    const { container } = mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    const base = container
      .querySelector("[data-testid=family-band-lifecycle]")!.innerHTML;
    for (const extra of [
      { selectedOptionId: "1" },
      {
        selectedOptionId: "1",
        reveal: { revealed: true, isCorrect: false, correctOptionId: "0" },
      },
    ]) {
      const view = mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO, extra);
      expect(
        view.container.querySelector("[data-testid=family-band-lifecycle]")!.innerHTML,
      ).toBe(base);
      view.unmount();
    }
  });

  it("wraps on a narrow viewport instead of overflowing", () => {
    mount(PURCHASE_HISTORY_Q, PURCHASE_HISTORY_SCENARIO);
    expect(band().className).toContain("overflow-hidden");
    expect(band().querySelectorAll(".flex-wrap").length).toBeGreaterThan(0);
    expect(band().innerHTML).not.toContain("overflow-x");
  });
});

describe("lifecycle band — accessibility", () => {
  it("states the whole transaction as one screen-reader sentence", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    const text = summary();
    expect(text).toContain("Ornn");
    expect(text).toContain("kept Sunfire Aegis");
    expect(text).toContain("bought Abyssal Mask");
    expect(text).toContain("sold Doran's Shield");
  });

  it("keeps every stage word available, not only the visual treatment", () => {
    mount(PURCHASE_HISTORY_Q, PURCHASE_HISTORY_SCENARIO);
    expect(summary()).toContain("started with");
    expect(summary()).toContain("bought");
  });

  it("names the band so it is reachable as a landmark", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    expect(screen.getByLabelText("Item transactions")).toBeInTheDocument();
  });

  it("does not duplicate item names in image alt text", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    for (const img of Array.from(band().querySelectorAll("img"))) {
      expect(img.getAttribute("alt")).toBe("");
    }
  });

  it("uses no animation, so reduced-motion users see the same thing", () => {
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO);
    expect(band().innerHTML).not.toContain("animate-");
    expect(band().innerHTML).not.toContain("transition");
  });
});
