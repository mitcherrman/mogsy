/**
 * POINT1 — the Meta Reflex per-card reveal.
 *
 * A card used to vanish the instant it settled: card N+1's window opened at
 * card N's acceptance, so the reveal and the advance arrived on the same
 * snapshot and the answer could only ever be shown BESIDE the next live card,
 * in a strip, never on the card the player had just been looking at.
 *
 * The backend now freezes a reveal window into the block
 * (`meta_reflex.CARD_REVEAL_WINDOW_MS`) and chains the next card's start past
 * it, so `own_revealing_card_index` names a settled card whose successor has
 * not opened. These pin what the client does with that — and pin that it reads
 * the phase rather than timing it, which is what makes a refresh mid-reveal
 * land on the same screen.
 */
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import {
  metaReflexSegmentMeta, metaReflexState, publicRoundV2, settledCardReveal,
} from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { metaReflexModule } from "./metaReflexModule";

function parse(state: unknown): SegmentStateView {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = metaReflexSegmentMeta();
  payload.segment_state = state;
  return readPublicRound(body).segmentState!;
}

function renderBlock(state: SegmentStateView) {
  const body = publicRoundV2();
  return render(
    <metaReflexModule.Viewport
      publicRound={readPublicRound(body)}
      selection={null}
      permissions={NO_INTERACTIONS}
      onSelect={() => {}}
      segmentState={state}
      actions={{ submitChallenge: vi.fn(), busy: false, error: null }}
      skewMs={0}
    />,
  );
}

/**
 * The server mid-reveal of card `index`: that card has settled, the next one
 * is the active index but has NOT opened.
 */
function revealing(index: number, reveal: Record<string, unknown> = {}) {
  const reveals = Array.from({ length: index + 1 }, (_, i) =>
    settledCardReveal(i, i === index ? reveal : {}));
  return parse(metaReflexState(index + 1, {
    own_card_reveals: reveals,
    own_revealing_card_index: index,
    own_reveal_until: "2026-07-18T12:00:07.500+00:00",
  }));
}

/** The same block with the reveal finished: card `index+1` is live. */
function answering(index: number) {
  return parse(metaReflexState(index + 1, {
    own_card_reveals: Array.from({ length: index + 1 }, (_, i) =>
      settledCardReveal(i)),
    own_revealing_card_index: null,
    own_reveal_until: null,
  }));
}

beforeEach(() => { vi.useRealTimers(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("a correct card", () => {
  it("holds the settled card on screen instead of replacing it", () => {
    renderBlock(revealing(0));
    expect(screen.getByTestId("mr-block")).toHaveAttribute("data-phase", "reveal");
    expect(screen.getByTestId("mr-settled-card")).toBeInTheDocument();
    // Card 1, not card 2 — the progress marker names what is being revealed.
    expect(screen.getByTestId("mr-progress")).toHaveTextContent("1 / 5");
  });

  /**
   * POINT1 corrective — the verdict is NOT stated here. It resolves in the
   * arena's one result slot, the top header strip, from `ArenaViewModel
   * .cardBeat`; see `components/ranked-arena/CardResultBeat`. A plate here as
   * well would be a second textual result surface for the same card.
   */
  it("states no verdict of its own inside the viewport", () => {
    renderBlock(revealing(0));
    expect(screen.queryByTestId("mr-card-beat")).toBeNull();
    expect(screen.queryByTestId("ranked-card-beat")).toBeNull();
    expect(screen.queryByTestId("ranked-last-result")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("CORRECT");
    expect(text).not.toContain("INCORRECT");
    expect(text).not.toContain("POINT");
  });

  it("marks the correct rectangle green", () => {
    renderBlock(revealing(0));
    const card = screen.getByTestId("mr-settled-card");
    expect(within(card).getByTestId("mr-choice-left"))
      .toHaveAttribute("data-reveal", "correct");
  });

  it("renders no feedback strip of any kind — beside or above the card", () => {
    renderBlock(revealing(0));
    expect(screen.queryByTestId("mr-card-result")).toBeNull();
    expect(screen.queryByTestId("mr-card-result-pick")).toBeNull();
    expect(screen.queryByTestId("mr-card-beat")).toBeNull();
  });

  it("keeps \"Next card…\" as the viewport's own transition line", () => {
    renderBlock(revealing(0));
    expect(screen.getByTestId("mr-status")).toHaveTextContent("Next card…");
  });
});

describe("an incorrect card", () => {
  const wrong = { outcome: "incorrect", selected_card_id: "c0:right",
    correct_card_id: "c0:left" };

  it("states no verdict inside the viewport for a wrong card either", () => {
    renderBlock(revealing(0, wrong));
    expect(screen.queryByTestId("mr-card-beat")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("INCORRECT");
    expect(text).not.toContain("OPPONENT");
    // The card BODY is still what it was: the answer is marked, in place.
    expect(screen.getByTestId("mr-settled-card")).toBeInTheDocument();
  });

  it("still marks the ACTUAL correct rectangle green", () => {
    renderBlock(revealing(0, wrong));
    const card = screen.getByTestId("mr-settled-card");
    expect(within(card).getByTestId("mr-choice-left"))
      .toHaveAttribute("data-reveal", "correct");
  });

  it("marks the player's losing pick as theirs", () => {
    renderBlock(revealing(0, wrong));
    const card = screen.getByTestId("mr-settled-card");
    expect(within(card).getByTestId("mr-choice-right"))
      .toHaveAttribute("data-reveal", "wrong");
  });

  it("renders no below-card feedback strip", () => {
    renderBlock(revealing(0, wrong));
    expect(screen.queryByTestId("mr-card-result")).toBeNull();
    expect(screen.queryByTestId("mr-card-beat")).toBeNull();
  });

  /** THE LEARNING RULE: the green side is the server's, not the player's. */
  it("drives the green state from correctCardId, never from the selection", () => {
    renderBlock(revealing(0, { outcome: "incorrect",
      selected_card_id: "c0:left", correct_card_id: "c0:right" }));
    const card = screen.getByTestId("mr-settled-card");
    expect(within(card).getByTestId("mr-choice-right"))
      .toHaveAttribute("data-reveal", "correct");
    expect(within(card).getByTestId("mr-choice-left"))
      .toHaveAttribute("data-reveal", "wrong");
  });

  it("marks a timed-out card's correct side green with nothing picked", () => {
    renderBlock(revealing(0, { outcome: "timeout", selected_card_id: null,
      correct_card_id: "c0:left" }));
    const card = screen.getByTestId("mr-settled-card");
    expect(within(card).getByTestId("mr-choice-left"))
      .toHaveAttribute("data-reveal", "correct");
    expect(within(card).getByTestId("mr-choice-right"))
      .not.toHaveAttribute("data-reveal");
  });
});

describe("the phase is the SERVER's", () => {
  it("does not show the next card while the reveal is running", () => {
    renderBlock(revealing(0));
    // The live answer surface is absent entirely: no clock, and the settled
    // card's rectangles cannot be answered.
    expect(screen.getByTestId("mr-block")).toHaveAttribute("data-phase", "reveal");
    expect(screen.getByTestId("mr-choice-left")).toBeDisabled();
    expect(screen.getByTestId("mr-choice-right")).toBeDisabled();
  });

  it("shows the next card, live, once the reveal has ended", () => {
    renderBlock(answering(0));
    expect(screen.getByTestId("mr-block")).toHaveAttribute("data-phase", "answer");
    expect(screen.queryByTestId("mr-settled-card")).toBeNull();
    expect(screen.getByTestId("mr-progress")).toHaveTextContent("2 / 5");
  });

  /**
   * The phase is reconstructed from the snapshot, so an unmount and remount —
   * which is what a refresh is — lands on the identical screen with no local
   * timer to restore.
   */
  it("reconstructs the same reveal after a remount", () => {
    const { unmount } = renderBlock(revealing(2, { outcome: "incorrect",
      selected_card_id: "c2:right", correct_card_id: "c2:left" }));
    const before = screen.getByTestId("mr-settled-card").textContent;
    const progress = screen.getByTestId("mr-progress").textContent;
    unmount();
    renderBlock(revealing(2, { outcome: "incorrect",
      selected_card_id: "c2:right", correct_card_id: "c2:left" }));
    expect(screen.getByTestId("mr-settled-card").textContent).toBe(before);
    expect(screen.getByTestId("mr-progress").textContent).toBe(progress);
    expect(within(screen.getByTestId("mr-settled-card"))
      .getByTestId("mr-choice-left")).toHaveAttribute("data-reveal", "correct");
  });

  it("names the wrong pick and the correct side in words, not colour alone", () => {
    renderBlock(revealing(2, { outcome: "incorrect",
      selected_card_id: "c2:right", correct_card_id: "c2:left" }));
    const settled = within(screen.getByTestId("mr-settled-card"));
    expect(settled.getByTestId("mr-tag-right")).toHaveTextContent(/^Your pick$/);
    expect(settled.getByTestId("mr-choice-right")).toHaveAttribute("data-picked", "true");
    expect(settled.getByTestId("mr-tag-left")).toHaveTextContent(/^Correct$/);
    expect(settled.getByTestId("mr-choice-left")).not.toHaveAttribute("data-picked");
  });

  it("marks a right pick as both the player's and correct", () => {
    renderBlock(revealing(2, { outcome: "correct",
      selected_card_id: "c2:left", correct_card_id: "c2:left" }));
    const settled = within(screen.getByTestId("mr-settled-card"));
    expect(settled.getByTestId("mr-tag-left")).toHaveTextContent("Your pick · Correct");
    expect(settled.queryByTestId("mr-tag-right")).toBeNull();
  });

  it("reveals every one of the five cards", () => {
    for (let i = 0; i < 5; i += 1) {
      const { unmount } = renderBlock(revealing(i));
      // Card five's hold is the `ownFinished` branch — it has no successor to
      // wait on — but every card's ANSWER is shown on the card either way.
      expect(screen.getByTestId("mr-settled-card")).toBeInTheDocument();
      expect(screen.getByTestId("mr-progress"))
        .toHaveTextContent(`${i + 1} / 5`);
      unmount();
    }
  });
});

describe("the module bonus belongs to the block, not to a card", () => {
  /**
   * Meta Reflex pays +1 a correct card; the perfect and speed premiums are
   * properties of the WHOLE block and are stated by the module summary. A card
   * that happened to complete a perfect block must not claim them.
   */
  it("states no award and no bonus on a card, even the last one", () => {
    renderBlock(revealing(4));
    const text = document.body.textContent ?? "";
    for (const banned of ["+1", "+2", "POINT", "PERFECT", "BONUS", "FIRST"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("holds the final card's reveal while the block is scored", () => {
    const state = parse(metaReflexState(5, {
      own_card_reveals: Array.from({ length: 5 }, (_, i) => settledCardReveal(i)),
      own_revealing_card_index: null,
      own_reveal_until: null,
    }));
    renderBlock(state);
    expect(screen.getByTestId("mr-waiting")).toBeInTheDocument();
    // Card five is still on screen, revealed — the module summary is what
    // replaces it, not a timer. Its VERDICT is in the header's plate, which
    // this viewport does not own; see `cardBeat.test.ts`.
    expect(screen.getByTestId("mr-settled-card")).toBeInTheDocument();
    expect(screen.queryByTestId("mr-card-beat")).toBeNull();
  });
});
