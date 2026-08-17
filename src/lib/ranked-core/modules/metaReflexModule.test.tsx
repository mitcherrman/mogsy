/**
 * QUIZ1 Phase 7 — the Meta Reflex viewport.
 *
 * Two properties are load-bearing and everything here serves them: what a card
 * SHOWS is decided by its kind (so a recognition card can never grow a label),
 * and what a click SENDS is the server's positional card id (so no v4 answer
 * can carry an `item_id` the server refuses).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import {
  metaReflexSegmentMeta, metaReflexState, publicRoundV2,
} from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { cardCountdown, metaReflexModule } from "./metaReflexModule";

/** Parse a backend-shaped state exactly as the live client does. */
function parse(state: unknown): SegmentStateView {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = metaReflexSegmentMeta();
  payload.segment_state = state;
  return readPublicRound(body).segmentState!;
}

function renderBlock(state: SegmentStateView, over: { busy?: boolean; error?: string | null } = {}) {
  const acts = {
    submitChallenge: vi.fn(),
    busy: over.busy ?? false,
    error: over.error ?? null,
  };
  const body = publicRoundV2();
  render(
    <metaReflexModule.Viewport
      publicRound={readPublicRound(body)}
      selection={null}
      permissions={NO_INTERACTIONS}
      onSelect={() => {}}
      segmentState={state}
      actions={acts}
      skewMs={0}
    />,
  );
  return { acts };
}

/** Freeze the wall clock `msLeft` before the fixture's card deadline. */
function freezeAt(msLeft: number) {
  vi.setSystemTime(Date.parse("2026-07-18T12:00:12+00:00") - msLeft);
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); freezeAt(4000); });
afterEach(() => { vi.useRealTimers(); });

describe("Meta Reflex — rendering by card kind", () => {
  it("shows a magnitude card's prompt, both names and both icons", () => {
    renderBlock(parse(metaReflexState(0)));
    expect(screen.getByTestId("mr-prompt")).toHaveTextContent("Which item costs more gold?");
    expect(screen.getByTestId("mr-choice-left-label")).toHaveTextContent("Hexdrinker");
    expect(screen.getByTestId("mr-choice-right-label")).toHaveTextContent("Giant's Belt");
    // The compared value does not exist client-side, so it cannot be on screen.
    expect(screen.getByTestId("mr-block").textContent).not.toMatch(/\d{3,}\s*g/);
  });

  it("shows a classification card's champions without the property being asked", () => {
    renderBlock(parse(metaReflexState(1)));
    expect(screen.getByTestId("mr-prompt")).toHaveTextContent("Which champion uses Energy?");
    expect(screen.getByTestId("mr-choice-left-label")).toHaveTextContent("Kennen");
    expect(screen.getByTestId("mr-choice-right-label")).toHaveTextContent("Kha'Zix");
    // "Energy" appears once — in the question. Never as a label on a card.
    expect(screen.getByTestId("mr-choice-left").textContent).not.toMatch(/Energy|Mana/);
    expect(screen.getByTestId("mr-choice-right").textContent).not.toMatch(/Energy|Mana/);
  });

  it("shows a recognition card as art only, addressed by position", () => {
    renderBlock(parse(metaReflexState(2)));
    expect(screen.queryByTestId("mr-choice-left-label")).toBeNull();
    expect(screen.queryByTestId("mr-choice-right-label")).toBeNull();
    // The accessible name is the POSITION: any real description would be the
    // answer, and the media URL is never mined for one.
    expect(screen.getByLabelText("Left option")).toBeInTheDocument();
    expect(screen.getByLabelText("Right option")).toBeInTheDocument();
    const img = screen.getAllByTestId("mr-card-img")[0] as HTMLImageElement;
    expect(img.src).toContain("/api/ranked/media/segment-card/m1/4/2/left.png");
    expect(img.src).not.toContain("assets/champions");
  });

  it("renders a card with missing media through the fallback, still clickable", () => {
    const { acts } = renderBlock(parse(metaReflexState(3)));
    expect(screen.getAllByTestId("mr-card-art-fallback")).toHaveLength(1);
    expect(screen.getByTestId("mr-choice-left-label")).toHaveTextContent("Vel'Koz");
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    expect(acts.submitChallenge).toHaveBeenCalledWith(3, { cardId: "c3:left" });
  });

  it("labels the block with the product name, never the module id", () => {
    renderBlock(parse(metaReflexState(0)));
    expect(screen.getByTestId("mr-block").textContent).toContain("Meta Reflex");
    expect(screen.getByTestId("mr-block").textContent).not.toContain("item_cost_duel");
  });

  it("shows five-card progress", () => {
    renderBlock(parse(metaReflexState(0)));
    expect(screen.getByTestId("mr-progress")).toHaveTextContent("1 / 5");
  });
});

describe("Meta Reflex — submission", () => {
  it("sends the LEFT card id for a left click", () => {
    const { acts } = renderBlock(parse(metaReflexState(0)));
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    expect(acts.submitChallenge).toHaveBeenCalledWith(0, { cardId: "c0:left" });
  });

  it("sends the RIGHT card id for a right click", () => {
    const { acts } = renderBlock(parse(metaReflexState(1)));
    fireEvent.click(screen.getByTestId("mr-choice-right"));
    expect(acts.submitChallenge).toHaveBeenCalledWith(1, { cardId: "c1:right" });
  });

  it("never sends an item_id for a v4 card", () => {
    const { acts } = renderBlock(parse(metaReflexState(0)));
    fireEvent.click(screen.getByTestId("mr-choice-right"));
    const [, choice] = acts.submitChallenge.mock.calls[0];
    expect(choice).not.toHaveProperty("itemId");
    expect(Object.keys(choice)).toEqual(["cardId"]);
  });

  it("locks both cards on the first click — one submission, not two", () => {
    const { acts } = renderBlock(parse(metaReflexState(0)));
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    fireEvent.click(screen.getByTestId("mr-choice-right"));
    expect(acts.submitChallenge).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("mr-choice-left")).toBeDisabled();
    expect(screen.getByTestId("mr-choice-right")).toBeDisabled();
    // No local verdict: the lock says "sent", never "right" or "wrong".
    expect(screen.getByTestId("mr-status")).toHaveTextContent("Locked in");
  });

  it("shows no correctness anywhere after answering", () => {
    renderBlock(parse(metaReflexState(0)));
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    expect(screen.getByTestId("mr-block").textContent)
      .not.toMatch(/correct|incorrect|wrong|✓|✗/i);
  });
});

describe("Meta Reflex — the card clock", () => {
  it("computes remaining time from the server deadline, not a local timer", () => {
    freezeAt(4000);
    renderBlock(parse(metaReflexState(0)));
    expect(screen.getByTestId("mr-countdown")).toHaveTextContent("4s");
  });

  it("reads through the skew, so a wrong browser clock changes nothing", () => {
    // Local clock 10s FAST, so the snapshot's `server - local` skew is -10s.
    // Read raw, the deadline would already look 6s gone; read through the skew
    // it is the 4s the server actually has left.
    const deadline = "2026-07-18T12:00:12+00:00";
    const nowMs = Date.parse(deadline) - 4000 + 10_000;
    expect(cardCountdown(deadline, -10_000, nowMs, 6000)!.seconds).toBe(4);
    expect(cardCountdown(deadline, 0, nowMs, 6000)!.expired).toBe(true);
  });

  it("resets when the SERVER moves to the next card", () => {
    const { rerender } = render(<div />);
    void rerender;
    freezeAt(1000);
    const first = cardCountdown("2026-07-18T12:00:12+00:00", 0, Date.now(), 6000)!;
    expect(first.seconds).toBe(1);
    // The next card carries its own, later deadline — a fresh 6s, not a
    // continuation of the previous card's clock.
    const next = cardCountdown("2026-07-18T12:00:18+00:00", 0, Date.now(), 6000)!;
    expect(next.seconds).toBe(7);
  });

  it("hydrates from the CURRENT deadline after a reconnect mid-block", () => {
    // A resumed snapshot puts the viewer on card 2 with the clock already part
    // spent; the countdown is whatever the server's deadline says it is.
    freezeAt(2500);
    renderBlock(parse(metaReflexState(2)));
    expect(screen.getByTestId("mr-progress")).toHaveTextContent("3 / 5");
    expect(screen.getByTestId("mr-countdown")).toHaveTextContent("3s");
  });

  it("disables the cards at zero without inventing a result", () => {
    freezeAt(-500); // deadline already passed
    const { acts } = renderBlock(parse(metaReflexState(0)));
    expect(screen.getByTestId("mr-countdown")).toHaveAttribute("data-expired", "true");
    expect(screen.getByTestId("mr-choice-left")).toBeDisabled();
    fireEvent.click(screen.getByTestId("mr-choice-left"));
    expect(acts.submitChallenge).not.toHaveBeenCalled();
    // The server's schedule decides the timeout; the UI only says it is coming.
    expect(screen.getByTestId("mr-status")).toHaveTextContent("Time's up");
    expect(screen.getByTestId("mr-block").textContent).not.toMatch(/correct|incorrect/i);
  });

  it("reports no clock at all when the segment is block-clocked", () => {
    expect(cardCountdown(null, 0, Date.now(), null)).toBeNull();
  });
});

describe("Meta Reflex — end of block", () => {
  it("stops offering cards once the server says the block is finished", () => {
    renderBlock(parse(metaReflexState(5)));
    expect(screen.queryByTestId("mr-choice-left")).toBeNull();
    expect(screen.getByTestId("mr-waiting")).toBeInTheDocument();
    expect(screen.getByTestId("mr-progress")).toHaveTextContent("5 / 5");
  });

  it("refuses to render a v4 block that did not arrive as Meta Reflex cards", () => {
    const state = parse(metaReflexState(0));
    renderBlock({ ...state, block: null });
    expect(screen.getByTestId("mr-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("mr-choice-left")).toBeNull();
  });

  it("surfaces an action error from the shell", () => {
    renderBlock(parse(metaReflexState(0)), { error: "that card is not in this block" });
    expect(screen.getByTestId("mr-error")).toHaveTextContent("not in this block");
  });
});
