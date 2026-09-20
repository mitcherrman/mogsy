/**
 * MRLVL1 Phase 3 — the `LVL n` badge itself.
 *
 * The badge's whole job is to render a number it is given and to render
 * NOTHING when it is given none. Both halves are load-bearing: a missing badge
 * on a level-aware card makes "Which champion has more Health?" unanswerable,
 * and an invented badge on a level-independent card is a claim about data the
 * server never sent.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChampionLevelBadge } from "./ChampionLevelBadge";

/** The approved Meta Reflex breakpoint pool, verbatim. */
const LEVELS = [1, 6, 11, 16, 18, 20] as const;

describe("ChampionLevelBadge", () => {
  it.each(LEVELS)("renders LVL %i", (level) => {
    render(<ChampionLevelBadge level={level} />);
    const badge = screen.getByTestId("champion-level-badge");
    expect(badge).toHaveTextContent(`LVL ${level}`);
    expect(badge).toHaveAttribute("data-champion-level", String(level));
  });

  it("does not spell out LEVEL", () => {
    render(<ChampionLevelBadge level={11} />);
    expect(screen.getByTestId("champion-level-badge").textContent)
      .not.toMatch(/level/i);
  });

  it("renders nothing for a null level", () => {
    const { container } = render(<ChampionLevelBadge level={null} />);
    expect(screen.queryByTestId("champion-level-badge")).toBeNull();
    // Not merely hidden: a level-independent card's markup is UNCHANGED, so
    // there is no empty element and no reserved row to shift the layout.
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the level is missing entirely", () => {
    const { container } = render(<ChampionLevelBadge />);
    expect(screen.queryByTestId("champion-level-badge")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("never infers LVL 1 from an absent level", () => {
    // The regression this guards is the tempting one: defaulting a missing
    // level to 1 because base stats ARE level-1 values. A pre-MRLVL1 segment
    // would then sprout a badge describing a match nobody recorded.
    render(<><ChampionLevelBadge level={undefined} /><ChampionLevelBadge level={null} /></>);
    expect(screen.queryAllByTestId("champion-level-badge")).toHaveLength(0);
  });

  it("keeps one-digit and two-digit levels the same width", () => {
    // The no-jump rule. A block deals five cards in a row, and the prompt must
    // not shuffle sideways as the breakpoint changes.
    render(<><ChampionLevelBadge level={1} /><ChampionLevelBadge level={20} /></>);
    const [one, twenty] = screen.getAllByTestId("champion-level-badge");
    expect(one.className).toBe(twenty.className);
    expect(one.className).toMatch(/tabular-nums/);
    expect(one.className).toMatch(/whitespace-nowrap/);
    // jsdom does no layout, so the FLOOR is pinned instead of the width.
    // 4rem/64px was measured in a real browser against the widest label,
    // "LVL 20", which lays out at 61px; the first attempt at 3.5rem/56px let
    // one-digit levels render 5px narrower. Shrinking this re-opens that.
    expect(one.className).toMatch(/min-w-\[4rem\]/);
  });
});
