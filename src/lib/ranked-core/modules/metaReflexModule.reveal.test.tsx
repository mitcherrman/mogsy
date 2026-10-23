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
import { cleanup, render, screen, within } from "@testing-library/react";
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
    expect(screen.getByTestId("mr-final-verdict")).toHaveTextContent("CORRECT");
  });

  it.each([
    ["correct", "CORRECT", "text-emerald-400"],
    ["incorrect", "INCORRECT", "text-red-400"],
    ["timeout", "TIMED OUT", "text-amber-400"],
  ])("shows the server's final %s verdict during waiting", (outcome, verdict, tone) => {
    const state = parse(metaReflexState(5, {
      own_card_reveals: [
        ...Array.from({ length: 4 }, (_, i) => settledCardReveal(i)),
        settledCardReveal(4, {
          outcome,
          selected_card_id: outcome === "timeout" ? null : "c4:left",
          correct_card_id: outcome === "incorrect" ? "c4:right" : "c4:left",
        }),
      ],
      own_revealing_card_index: null,
      own_reveal_until: null,
    }));
    renderBlock(state);
    const notice = screen.getByTestId("mr-final-verdict");
    expect(notice).toHaveTextContent(verdict);
    expect(notice.querySelector("span")).toHaveClass(tone);
    expect(screen.getByTestId("mr-settled-card")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// DV2-A — the settled card says WHAT the two sides were.
//
// Once a card has settled the server discloses each side's display value
// (`own_card_reveals[].left|right.value_display`, formatted server-side) and,
// on a recognition card, each side's label. The reveal draws them on the card
// the player was just looking at. These pin that it does so for every
// outcome, that it draws NOTHING of the kind before settlement, that it
// computes no gap, and that it adds no geometry to the card.
// ---------------------------------------------------------------------------

/** A distinctive pair, so a leak cannot hide behind a fixture default. */
const VALUES = {
  left: { label: "Infinity Edge", value_display: "3,450 gold" },
  right: { label: "Bloodthirster", value_display: "3,400 gold" },
};

const valueText = (side: "left" | "right") =>
  screen.getByTestId(`mr-value-${side}`).textContent;

describe("the revealed values (DV2-A)", () => {
  it.each([
    ["correct", { outcome: "correct", selected_card_id: "c0:left", correct_card_id: "c0:left" }],
    ["incorrect", { outcome: "incorrect", selected_card_id: "c0:right", correct_card_id: "c0:left" }],
    ["timeout", { outcome: "timeout", selected_card_id: null, correct_card_id: "c0:left" }],
    ["unanswered", { outcome: "unanswered", selected_card_id: null, correct_card_id: "c0:left" }],
  ])("shows BOTH values, with their units, on a %s card", (_name, outcome) => {
    renderBlock(revealing(0, { ...outcome, ...VALUES }));
    expect(valueText("left")).toBe("3,450 gold");
    expect(valueText("right")).toBe("3,400 gold");
    // Each value sits on ITS OWN side's rectangle, not beside the pair.
    const settled = within(screen.getByTestId("mr-settled-card"));
    expect(within(settled.getByTestId("mr-choice-left")).getByTestId("mr-value-left"))
      .toBeInTheDocument();
    expect(within(settled.getByTestId("mr-choice-right")).getByTestId("mr-value-right"))
      .toBeInTheDocument();
  });

  it("shows the values on the SERVER's side whichever side the player took", () => {
    // The player took the LOWER side; the server says the other was right.
    renderBlock(revealing(0, { outcome: "incorrect", selected_card_id: "c0:right",
      correct_card_id: "c0:left", ...VALUES }));
    const settled = within(screen.getByTestId("mr-settled-card"));
    expect(settled.getByTestId("mr-choice-left")).toHaveAttribute("data-reveal", "correct");
    expect(settled.getByTestId("mr-value-left")).toHaveTextContent("3,450 gold");
    expect(settled.getByTestId("mr-choice-right")).toHaveAttribute("data-reveal", "wrong");
    expect(settled.getByTestId("mr-value-right")).toHaveTextContent("3,400 gold");
  });

  it("passes the server's text through verbatim: a class word, a unit, a thousands group", () => {
    renderBlock(revealing(1, { kind: "classification", entity_kind: "champion",
      left: { label: "Kennen", value_display: "Energy" },
      right: { label: "Kha'Zix", value_display: "Mana" } }));
    expect(valueText("left")).toBe("Energy");
    expect(valueText("right")).toBe("Mana");
    cleanup();
    renderBlock(revealing(3, {
      left: { label: "Vel'Koz", value_display: "1,984 HP" },
      right: { label: "Kled", value_display: "1,861 HP" } }));
    expect(valueText("left")).toBe("1,984 HP");
    expect(valueText("right")).toBe("1,861 HP");
  });

  it("is on screen in the FIRST commit of the reveal — no staging inside a 1.5 s hold", () => {
    vi.useFakeTimers();
    renderBlock(revealing(0, VALUES));
    // No timer has run and none is pending on the module's behalf.
    expect(valueText("left")).toBe("3,450 gold");
    expect(valueText("right")).toBe("3,400 gold");
    vi.useRealTimers();
  });

  it("holds the values on the final card's reveal while the block is scored", () => {
    const state = parse(metaReflexState(5, {
      own_card_reveals: Array.from({ length: 5 }, (_, i) =>
        settledCardReveal(i, i === 4 ? VALUES : {})),
      own_revealing_card_index: null,
      own_reveal_until: null,
    }));
    renderBlock(state);
    expect(screen.getByTestId("mr-waiting")).toBeInTheDocument();
    expect(valueText("left")).toBe("3,450 gold");
    expect(valueText("right")).toBe("3,400 gold");
  });

  it("reconstructs the same values after a remount (the phase is read, not timed)", () => {
    const { unmount } = renderBlock(revealing(0, VALUES));
    const before = screen.getByTestId("mr-settled-card").innerHTML;
    unmount();
    renderBlock(revealing(0, VALUES));
    expect(screen.getByTestId("mr-settled-card").innerHTML).toBe(before);
  });
});

describe("no value before settlement (DV2-A)", () => {
  const SECRET = { left: { label: "Infinity Edge", value_display: "9,876 gold" },
    right: { label: "Bloodthirster", value_display: "9,875 gold" } };

  it("draws no value, no caption and no digits of the answer on a LIVE card", () => {
    // Card 0 settled with the secret values; card 1 (a classification card) is
    // now live. Nothing of card 0 may travel onto card 1, and card 1 carries
    // no values of its own.
    renderBlock(parse(metaReflexState(1, {
      own_card_reveals: [settledCardReveal(0, SECRET)],
      own_revealing_card_index: null,
      own_reveal_until: null,
    })));
    expect(screen.getByTestId("mr-block")).toHaveAttribute("data-phase", "answer");
    expect(screen.queryByTestId("mr-value-left")).toBeNull();
    expect(screen.queryByTestId("mr-value-right")).toBeNull();
    expect(screen.queryByTestId("mr-reveal-label-left")).toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("9,876");
    expect(text).not.toContain("9,875");
    expect(text).not.toMatch(/\bgold\b/);
  });

  it("draws none on the very first card, before anything has settled", () => {
    renderBlock(parse(metaReflexState(0, { own_card_reveals: [] })));
    expect(screen.getByTestId("mr-block")).toHaveAttribute("data-phase", "answer");
    expect(document.querySelectorAll("[data-testid^='mr-value-']")).toHaveLength(0);
    expect(document.querySelectorAll("[data-testid^='mr-reveal-label-']")).toHaveLength(0);
    expect(screen.getByTestId("mr-choice-left")).toHaveAccessibleName("Hexdrinker");
    expect(screen.getByTestId("mr-choice-right")).toHaveAccessibleName("Giant's Belt");
  });

  it("states no value in a live card's accessible name either", () => {
    renderBlock(parse(metaReflexState(1, {
      own_card_reveals: [settledCardReveal(0, SECRET)],
    })));
    for (const side of ["left", "right"] as const) {
      expect(screen.getByTestId(`mr-choice-${side}`).getAttribute("aria-label"))
        .not.toMatch(/\d/);
    }
  });

  it("holds no caption on the live side of a recognition card", () => {
    renderBlock(parse(metaReflexState(2, {
      own_card_reveals: [settledCardReveal(0), settledCardReveal(1)],
    })));
    expect(screen.getByTestId("mr-choice-left")).toHaveAccessibleName("Left option");
    expect(screen.getByTestId("mr-choice-right")).toHaveAccessibleName("Right option");
    expect(document.querySelectorAll("[data-testid^='mr-reveal-label-']")).toHaveLength(0);
  });
});

describe("the reveal never computes a gap (DV2-A)", () => {
  it("shows no difference, ratio or 'more than' between the two values", () => {
    renderBlock(revealing(0, VALUES));
    const text = document.body.textContent ?? "";
    // 3,450 − 3,400 = 50. The pair is shown; their difference is not.
    expect(text).not.toMatch(/\b50\b/);
    expect(text).not.toMatch(/gap|differ|more than|less than|ahead|behind|%/i);
    expect(document.querySelector("[data-testid*='gap']")).toBeNull();
  });

  it("does not read the numbers: an unparseable display is drawn as given", () => {
    renderBlock(revealing(0, {
      left: { label: "Infinity Edge", value_display: "about 3.4k" },
      right: { label: "Bloodthirster", value_display: "n/a" } }));
    expect(valueText("left")).toBe("about 3.4k");
    expect(valueText("right")).toBe("n/a");
  });
});

describe("a reply with no display (legacy / null) degrades by omission (DV2-A)", () => {
  it("omits both values and still draws the settled card as it always was", () => {
    renderBlock(revealing(0, {
      left: { label: "Infinity Edge", value_display: null },
      right: { label: "Bloodthirster", value_display: null } }));
    expect(screen.queryByTestId("mr-value-left")).toBeNull();
    expect(screen.queryByTestId("mr-value-right")).toBeNull();
    expect(screen.getByTestId("mr-choice-left")).toHaveAttribute("data-reveal", "correct");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/null|undefined|NaN/);
    // Spoken exactly as before this feature.
    expect(screen.getByTestId("mr-choice-left"))
      .toHaveAccessibleName("Hexdrinker, your answer, correct answer");
  });

  it("omits an empty or whitespace display rather than drawing a blank plate", () => {
    renderBlock(revealing(0, {
      left: { label: "Infinity Edge", value_display: "" },
      right: { label: "Bloodthirster", value_display: "   " } }));
    expect(screen.queryByTestId("mr-value-left")).toBeNull();
    expect(screen.queryByTestId("mr-value-right")).toBeNull();
  });

  it("draws a value for the side that has one and nothing for the side that has not", () => {
    renderBlock(revealing(0, {
      left: { label: "Infinity Edge", value_display: "3,450 gold" },
      right: { label: "Bloodthirster", value_display: null } }));
    expect(valueText("left")).toBe("3,450 gold");
    expect(screen.queryByTestId("mr-value-right")).toBeNull();
  });

  it("reads a reply that omits value_display entirely (a pre-reveal-text row)", () => {
    const reveal = settledCardReveal(0) as Record<string, any>;
    delete reveal.left.value_display;
    delete reveal.right.value_display;
    renderBlock(parse(metaReflexState(1, {
      own_card_reveals: [reveal], own_revealing_card_index: 0 })));
    expect(screen.queryByTestId("mr-value-left")).toBeNull();
    expect(screen.getByTestId("mr-settled-card")).toBeInTheDocument();
  });
});

describe("a recognition card's reveal names what was asked about (DV2-A)", () => {
  const recognition = {
    kind: "recognition", entity_kind: "ability",
    outcome: "incorrect", selected_card_id: "c2:right", correct_card_id: "c2:left",
    left: { label: "Xerath W", value_display: null },
    right: { label: "Xerath E", value_display: null },
  };

  it("discloses each side's label, and no value, once settled", () => {
    renderBlock(revealing(2, recognition));
    expect(screen.getByTestId("mr-reveal-label-left")).toHaveTextContent("Xerath W");
    expect(screen.getByTestId("mr-reveal-label-right")).toHaveTextContent("Xerath E");
    expect(screen.queryByTestId("mr-value-left")).toBeNull();
  });

  it("speaks the revealed label with the verdict, not just 'Left option'", () => {
    renderBlock(revealing(2, recognition));
    expect(screen.getByTestId("mr-choice-left"))
      .toHaveAccessibleName("Xerath W, correct answer");
    expect(screen.getByTestId("mr-choice-right"))
      .toHaveAccessibleName("Xerath E, your answer, incorrect");
  });

  it("leaves the position names when the reveal carries no label", () => {
    renderBlock(revealing(2, { ...recognition,
      left: { label: null, value_display: null },
      right: { label: null, value_display: null } }));
    expect(document.querySelectorAll("[data-testid^='mr-reveal-label-']")).toHaveLength(0);
    expect(screen.getByTestId("mr-choice-left"))
      .toHaveAccessibleName("Left option, correct answer");
  });
});

describe("the values add no verdict and no geometry (DV2-A)", () => {
  it("keeps the single verdict in the arena header: no result plate with values on", () => {
    renderBlock(revealing(0, { outcome: "incorrect", selected_card_id: "c0:right",
      correct_card_id: "c0:left", ...VALUES }));
    for (const id of ["mr-card-beat", "ranked-card-beat", "ranked-last-result",
      "mr-card-result", "mr-card-result-pick"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    const text = document.body.textContent ?? "";
    for (const banned of ["CORRECT", "INCORRECT", "POINT", "+1", "+0"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("states the value in words: it is part of each side's accessible name", () => {
    renderBlock(revealing(0, { outcome: "incorrect", selected_card_id: "c0:right",
      correct_card_id: "c0:left", ...VALUES }));
    expect(screen.getByTestId("mr-choice-left"))
      .toHaveAccessibleName("Hexdrinker, 3,450 gold, correct answer");
    expect(screen.getByTestId("mr-choice-right"))
      .toHaveAccessibleName("Giant's Belt, 3,400 gold, your answer, incorrect");
    // The visible plate is hidden from AT: the name above already says it, so
    // a screen reader does not hear every value twice.
    expect(screen.getByTestId("mr-value-left")).toHaveAttribute("aria-hidden", "true");
  });

  it("leaves a neutral side's name as its name plus its value", () => {
    renderBlock(revealing(0, { outcome: "timeout", selected_card_id: null,
      correct_card_id: "c0:left", ...VALUES }));
    expect(screen.getByTestId("mr-choice-right"))
      .toHaveAccessibleName("Giant's Belt, 3,400 gold");
  });

  it("takes no height: the plate is absolute and the card reserves its room in EVERY phase", () => {
    const live = renderBlock(answering(0));
    const liveClass = screen.getByTestId("mr-choice-left").className;
    live.unmount();
    renderBlock(revealing(0, VALUES));
    const settledClass = screen.getByTestId("mr-choice-left").className;
    // The padding that holds the plate's room is the same live and settled, so
    // nothing in the card moves when the reveal lands...
    for (const reserved of ["pb-6", "lg:pb-7"]) {
      expect(liveClass).toContain(reserved);
      expect(settledClass).toContain(reserved);
    }
    // ...the plate itself is out of flow, so it adds no height to the row...
    expect(screen.getByTestId("mr-value-left").className).toMatch(/\babsolute\b/);
    // ...and the row it sits in keeps the declared frame height.
    expect(screen.getByTestId("mr-card-row").className)
      .toContain("h-[9rem] lg:h-[13rem]");
  });

  it("truncates rather than wraps, so a long value cannot grow the card", () => {
    renderBlock(revealing(0, {
      left: { label: "Infinity Edge", value_display: "1,234,567 gold" },
      right: { label: "Bloodthirster", value_display: "1,234,566 gold" } }));
    const plate = screen.getByTestId("mr-value-left");
    expect(plate.firstElementChild?.className).toContain("truncate");
    expect(plate.className).toMatch(/\bh-5\b/);
    // The whole text stays available to a pointer and a screen reader.
    expect(plate).toHaveAttribute("title", "1,234,567 gold");
  });

  it("has no animation or transition, so reduced motion has nothing to strip", () => {
    renderBlock(revealing(0, VALUES));
    const plate = screen.getByTestId("mr-value-left");
    expect(plate.className).not.toMatch(/animate-|transition|duration-|motion-/);
  });
});

describe("a MIXED block: every card reveals its own values (DV2-A)", () => {
  /**
   * Five cards, five different outcomes. The Nth reveal must state card N's
   * values and verdict marks, and never another card's — the values travel with
   * the reveal row, not with the screen.
   */
  const MIXED = [
    { kind: "magnitude", outcome: "correct", selected_card_id: "c0:left", correct_card_id: "c0:left",
      left: { label: "Hexdrinker", value_display: "1,300 gold" },
      right: { label: "Giant's Belt", value_display: "900 gold" } },
    { kind: "classification", entity_kind: "champion", outcome: "incorrect",
      selected_card_id: "c1:right", correct_card_id: "c1:left",
      left: { label: "Kennen", value_display: "Energy" },
      right: { label: "Kha'Zix", value_display: "Mana" } },
    { kind: "recognition", entity_kind: "ability", outcome: "timeout",
      selected_card_id: null, correct_card_id: "c2:right",
      left: { label: "Xerath E", value_display: null },
      right: { label: "Xerath W", value_display: null } },
    { kind: "magnitude", entity_kind: "champion", outcome: "unanswered",
      selected_card_id: null, correct_card_id: "c3:left",
      left: { label: "Vel'Koz", value_display: "1,984 HP" },
      right: { label: "Kled", value_display: "1,861 HP" } },
    { kind: "magnitude", outcome: "correct", selected_card_id: "c4:right", correct_card_id: "c4:right",
      left: { label: "Knight's Vow", value_display: "40 armor" },
      right: { label: "Thornmail", value_display: "80 armor" } },
  ];

  const stateAt = (index: number) => parse(metaReflexState(index + 1, {
    own_card_reveals: MIXED.slice(0, index + 1).map((r, i) => settledCardReveal(i, r)),
    own_revealing_card_index: index < 4 ? index : null,
    own_reveal_until: index < 4 ? "2026-07-18T12:00:07.500+00:00" : null,
  }));

  it.each([
    [0, "1,300 gold", "900 gold"],
    [1, "Energy", "Mana"],
    [3, "1,984 HP", "1,861 HP"],
    [4, "40 armor", "80 armor"],
  ])("card %i states its own pair and nothing from the cards around it", (i, left, right) => {
    renderBlock(stateAt(i));
    expect(valueText("left")).toBe(left);
    expect(valueText("right")).toBe(right);
    const text = document.body.textContent ?? "";
    for (const [j, other] of MIXED.entries()) {
      if (j === i) continue;
      for (const side of [other.left, other.right]) {
        if (side.value_display && ![left, right].includes(side.value_display)) {
          expect(text).not.toContain(side.value_display);
        }
      }
    }
  });

  it("names the timed-out recognition card's two abilities, with no value", () => {
    renderBlock(stateAt(2));
    expect(screen.getByTestId("mr-reveal-label-left")).toHaveTextContent("Xerath E");
    expect(screen.getByTestId("mr-reveal-label-right")).toHaveTextContent("Xerath W");
    expect(screen.queryByTestId("mr-value-left")).toBeNull();
    expect(screen.getByTestId("mr-choice-right"))
      .toHaveAccessibleName("Xerath W, correct answer");
    expect(screen.getByTestId("mr-choice-right")).toHaveAttribute("data-reveal", "correct");
  });
});
