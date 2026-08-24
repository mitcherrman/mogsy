/**
 * RG3 — Meta Reflex resolution inside the live block.
 *
 * The block is the hardest surface in this work, because its per-card clock
 * takes the obvious design off the table: card N+1's window opens the instant
 * card N is accepted, so the reveal for N and the advance to N+1 arrive
 * together and any hold to play a reveal is spent out of the next card's six
 * seconds. These tests pin the shape that follows from that — resolution
 * BESIDE live play, never over it — and pin that it stays fast.
 */
import { render, screen } from "@testing-library/react";
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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(Date.parse("2026-07-18T12:00:12+00:00") - 4000);
});
afterEach(() => { vi.useRealTimers(); });

describe("Meta Reflex — the card that just resolved", () => {
  it("shows nothing before the first card settles", () => {
    renderBlock(parse(metaReflexState(0)));
    expect(screen.queryByTestId("mr-card-result")).toBeNull();
  });

  it("resolves card 1 while card 2 is LIVE, with both values on screen", () => {
    renderBlock(parse(metaReflexState(1)));
    // The live card is still the interactive surface...
    expect(screen.getByTestId("mr-block")).toBeInTheDocument();
    expect(screen.getByTestId("mr-choice-left")).toBeEnabled();
    // ...and the previous card's resolution sits beside it, complete.
    const result = screen.getByTestId("mr-card-result");
    expect(result).toHaveAttribute("data-challenge-index", "0");
    expect(screen.getByTestId("evidence-left-value")).toHaveTextContent("3,450 gold");
    expect(screen.getByTestId("evidence-right-value")).toHaveTextContent("3,400 gold");
    expect(screen.getByTestId("answer-verdict")).toHaveAttribute("data-verdict", "correct");
  });

  it("always describes the LAST settled card, never an older one", () => {
    renderBlock(parse(metaReflexState(3)));
    expect(screen.getByTestId("mr-card-result"))
      .toHaveAttribute("data-challenge-index", "2");
  });

  it("never describes the card the player is looking at", () => {
    renderBlock(parse(metaReflexState(2)));
    const shown = Number(
      screen.getByTestId("mr-card-result").getAttribute("data-challenge-index"));
    expect(shown).toBeLessThan(2);
  });

  it("gives the last card the surface once the block is over", () => {
    renderBlock(parse(metaReflexState(5, {
      own_card_reveals: [0, 1, 2, 3, 4].map((i) => settledCardReveal(i)),
    })));
    expect(screen.getByTestId("mr-waiting")).toBeInTheDocument();
    expect(screen.getByTestId("mr-card-result"))
      .toHaveAttribute("data-challenge-index", "4");
  });

  it("adds no control and no confirm step to the block", () => {
    renderBlock(parse(metaReflexState(2)));
    const buttons = screen.getAllByRole("button");
    // Exactly the two choice cards, and nothing else to press.
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b.textContent ?? "").not.toMatch(/next|continue|confirm/i);
    }
  });

  it("does not disturb the live card's own countdown", () => {
    renderBlock(parse(metaReflexState(2)));
    // The clock is the server's window for the CURRENT card; a resolution
    // beside it must not gate, pause or replace it.
    expect(screen.getByTestId("mr-countdown")).toBeInTheDocument();
    expect(screen.getByTestId("mr-countdown")).toHaveAttribute("data-expired", "false");
  });

  it("keeps the live card free of any compared value", () => {
    renderBlock(parse(metaReflexState(2)));
    // The resolution strip legitimately carries numbers; the CARD must not.
    const live = screen.getByTestId("mr-prompt").parentElement!;
    const choices = [
      screen.getByTestId("mr-choice-left"), screen.getByTestId("mr-choice-right"),
    ];
    expect(live).toBeInTheDocument();
    for (const choice of choices) {
      expect(choice.textContent ?? "").not.toMatch(/gold|\d{3,}/);
    }
  });
});
