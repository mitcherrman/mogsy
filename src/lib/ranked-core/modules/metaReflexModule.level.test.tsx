/**
 * MRLVL1 Phase 3 — the frozen champion level in Ranked's Meta Reflex viewport.
 *
 * What is proved here is the whole path, not the badge: a `champion_level` on
 * the wire survives the contract reader, reaches the card, and is rendered
 * beside the prompt — and a card without one renders exactly as it always did.
 *
 * The client NEVER chooses, infers or computes a level. Every case below feeds
 * a backend-shaped payload and asserts what came out, so a frontend that
 * started deciding levels for itself would fail here rather than look right.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import {
  metaReflexCards, metaReflexLevelAwareCard, metaReflexSegmentMeta,
  metaReflexState, publicRoundV2, settledCardReveal,
} from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { metaReflexModule } from "./metaReflexModule";

/** The approved Meta Reflex breakpoint pool, verbatim. */
const LEVELS = [1, 6, 11, 16, 18, 20] as const;

function parse(state: unknown): SegmentStateView {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = metaReflexSegmentMeta();
  payload.segment_state = state;
  return readPublicRound(body).segmentState!;
}

function renderBlock(state: SegmentStateView) {
  render(
    <metaReflexModule.Viewport
      publicRound={readPublicRound(publicRoundV2())}
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
 * A block whose ACTIVE card is `card`. The other four are the ordinary
 * fixture's, so the block around the card under test is a real one.
 */
function blockWith(card: Record<string, unknown>, index = 0, over = {}) {
  const cards = metaReflexCards();
  cards[index] = card as (typeof cards)[number];
  return metaReflexState(index, {
    challenges: { prompt: "Meta Reflex", challenge_count: 5, challenges: cards },
    ...over,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(Date.parse("2026-07-18T12:00:12+00:00") - 4000);
});
afterEach(() => { vi.useRealTimers(); });

describe("Ranked Meta Reflex — the level badge", () => {
  it.each(LEVELS)("shows LVL %i on a level-aware card", (level) => {
    renderBlock(parse(blockWith(metaReflexLevelAwareCard(level))));
    expect(screen.getByTestId("champion-level-badge"))
      .toHaveTextContent(`LVL ${level}`);
  });

  it("renders the level beside the prompt, not inside either choice", () => {
    renderBlock(parse(blockWith(metaReflexLevelAwareCard(11))));
    const badge = screen.getByTestId("champion-level-badge");
    // The level applies to BOTH champions; on a coin it would read as a fact
    // about that champion.
    expect(screen.getByTestId("mr-choice-left")).not.toContainElement(badge);
    expect(screen.getByTestId("mr-choice-right")).not.toContainElement(badge);
    // Adjacent to the question it qualifies.
    expect(badge.parentElement).toContainElement(screen.getByTestId("mr-prompt"));
  });

  it("keeps the level out of the prompt sentence", () => {
    renderBlock(parse(blockWith(metaReflexLevelAwareCard(11))));
    const prompt = screen.getByTestId("mr-prompt");
    expect(prompt).toHaveTextContent("Which champion has more Health?");
    expect(prompt.textContent).not.toMatch(/level|lvl|\b11\b/i);
  });

  it("shows no badge on a level-independent card", () => {
    // Card 3 of the standard fixture is move speed — League does not scale it,
    // so the backend sends null and the card must look untouched.
    renderBlock(parse(metaReflexState(3)));
    expect(screen.getByTestId("mr-prompt"))
      .toHaveTextContent("Which champion is faster?");
    expect(screen.queryByTestId("champion-level-badge")).toBeNull();
  });

  it.each([0, 1, 2, 3, 4])("shows no badge on standard fixture card %i", (i) => {
    // None of the five is a scaling champion stat: item cost, classification,
    // recognition, move speed, item stat.
    renderBlock(parse(metaReflexState(i)));
    expect(screen.queryByTestId("champion-level-badge")).toBeNull();
  });

  it("shows nothing for a card frozen before MRLVL1 existed", () => {
    // The key is ABSENT, not null — exactly what a stored pre-MRLVL1 segment
    // replays as. It must parse and render, and must not become LVL 1.
    const legacy = metaReflexLevelAwareCard(11) as Record<string, unknown>;
    delete legacy.champion_level;
    renderBlock(parse(blockWith(legacy)));
    expect(screen.getByTestId("mr-prompt")).toBeInTheDocument();
    expect(screen.queryByTestId("champion-level-badge")).toBeNull();
  });

  it("keeps the badge through the card's reveal", () => {
    // A card that shed its badge when it settled would read as the question
    // having changed between being asked and being answered.
    const state = blockWith(metaReflexLevelAwareCard(18), 0, {
      own_next_challenge_index: 1,
      own_challenges_completed: 1,
      own_card_index: 1,
      own_revealing_card_index: 0,
      own_card_reveals: [settledCardReveal(0)],
      own_submitted_choices: [{ card_id: "c0:left" }, null, null, null, null],
    });
    renderBlock(parse(state));
    expect(screen.getByTestId("mr-block")).toHaveAttribute("data-phase", "reveal");
    expect(screen.getByTestId("champion-level-badge")).toHaveTextContent("LVL 18");
  });

  it("does not disturb the answer choices", () => {
    // The regression guard for "redesign answer cards": a level-aware card is
    // an ordinary magnitude card that gained one pill above the prompt.
    renderBlock(parse(blockWith(metaReflexLevelAwareCard(16))));
    expect(screen.getByTestId("mr-choice-left-label")).toHaveTextContent("Garen");
    expect(screen.getByTestId("mr-choice-right-label")).toHaveTextContent("Ahri");
    expect(screen.getByTestId("mr-choice-left")).toHaveAttribute("data-card-id", "c0:left");
    expect(screen.getByTestId("mr-choice-right")).toHaveAttribute("data-card-id", "c0:right");
  });

  it("never reveals a compared value alongside the level", () => {
    // The level is part of the QUESTION. It must not have smuggled in any of
    // the answer with it.
    renderBlock(parse(blockWith(metaReflexLevelAwareCard(20))));
    const block = screen.getByTestId("mr-block");
    expect(block.textContent).not.toMatch(/correct|value|\bHP\b/i);
  });
});

describe("Ranked Meta Reflex — the level on the wire", () => {
  it("reads champion_level off the payload", () => {
    const state = parse(blockWith(metaReflexLevelAwareCard(6)));
    const block = state.block!;
    expect(block.contract).toBe("meta_reflex");
    if (block.contract !== "meta_reflex") throw new Error("wrong contract");
    expect(block.cards[0].championLevel).toBe(6);
  });

  it("reads an absent champion_level as null, not as 1", () => {
    const legacy = metaReflexLevelAwareCard(11) as Record<string, unknown>;
    delete legacy.champion_level;
    const block = parse(blockWith(legacy)).block!;
    if (block.contract !== "meta_reflex") throw new Error("wrong contract");
    expect(block.cards[0].championLevel).toBeNull();
  });

  it("rejects a champion_level that is not a number", () => {
    // Fail closed rather than degrade: a level that arrives as "11" is a
    // backend contract break, and guessing past it is how a wrong level ends
    // up on screen.
    const bad = metaReflexLevelAwareCard(11) as Record<string, unknown>;
    bad.champion_level = "11";
    expect(() => parse(blockWith(bad))).toThrow(/champion_level/);
  });
});
