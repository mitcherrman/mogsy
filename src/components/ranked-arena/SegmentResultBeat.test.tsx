/**
 * THE META REFLEX BLOCK RESULT, in the top HUD.
 *
 * The locked scoring rules are the BACKEND's and are proven there
 * (`item_cost_duel.block_damage`, `test_quiz1_meta_reflex_additive.py`):
 * 1 damage a correct card, +1 for a perfect 5/5, +1 more if that perfect
 * player finished strictly sooner than the opponent. Nothing in this file
 * re-decides any of that.
 *
 * What IS this component's contract, and what these pin:
 *
 *  * the scoreline states each player's N/5, which is the one thing an
 *    ordinary round beat structurally cannot say;
 *  * the damage shown is the ENGINE's authoritative final figure, not the
 *    module's pre-mitigation block damage;
 *  * an earned Perfect or Speed bonus is SHOWN, read from the settlement's own
 *    flags and never inferred from timings;
 *  * a bonus that was not earned is absent, not zeroed;
 *  * the plate keeps one fixed box whatever it is carrying.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SegmentResultBeat, segmentScoreline } from "./SegmentResultBeat";
import type {
  SegmentRevealPlayer, SegmentSettlementView,
} from "@/lib/ranked-public/contracts";

afterEach(cleanup);

function revealPlayer(over: Partial<SegmentRevealPlayer> = {}): SegmentRevealPlayer {
  return {
    segmentResult: "win", correct: 5, incorrect: 0, unanswered: 0,
    totalResponseMs: 4000, perChallengeMs: [800, 800, 800, 800, 800],
    choices: [], perfect: true, speedBonus: 1, damageDealt: 7, ...over,
  };
}

function settlement(
  you: Partial<SegmentRevealPlayer> = {},
  them: Partial<SegmentRevealPlayer> = {},
  damage: Record<string, number> = { userA: 7, userB: 2 },
): SegmentSettlementView {
  return {
    reveal: {
      moduleId: "item_cost_duel", moduleVersion: 4, challengeCount: 5,
      challenges: [], items: {},
      players: {
        userA: revealPlayer(you),
        userB: revealPlayer({
          segmentResult: "loss", correct: 2, incorrect: 3,
          perfect: false, speedBonus: 0, damageDealt: 2, ...them }),
      },
    },
    damageByPlayerId: damage,
    abilitiesByPlayerId: {},
  };
}

const noop = () => {};
const render1 = (s: SegmentSettlementView) => render(
  <SegmentResultBeat settlement={s} viewerUserId="userA" opponentUserId="userB"
    roundNumber={7} detailsOpen={false} onToggleDetails={noop} />);

const beat = () => screen.getByTestId("ranked-last-result");

describe("the block scoreline", () => {
  it("states both players' score out of the block's own challenge count", () => {
    render1(settlement());
    expect(beat()).toHaveTextContent("YOU 5/5");
    expect(beat()).toHaveTextContent("OPP 2/5");
  });

  it("shows the ENGINE's final damage, not the module's block damage", () => {
    // The two legitimately differ — an outgoing bonus, a shield, a reduction —
    // and what the opponent actually lost is the authoritative figure. Showing
    // the module's pre-mitigation number would contradict the HP bar.
    render1(settlement({ damageDealt: 7 }, {}, { userA: 9, userB: 2 }));
    expect(beat()).toHaveTextContent("9 DMG");
    expect(beat()).not.toHaveTextContent("7 DMG");
  });

  it("equals the authoritative final damage for every shape of block", () => {
    for (const total of [0, 1, 4, 6, 7, 12]) {
      render1(settlement({}, {}, { userA: total, userB: 0 }));
      const line = screen.getByTestId("ranked-last-result-consequence").textContent!;
      if (total > 0) expect(line).toContain(`${total} DMG`);
      else expect(line).not.toContain("DMG");   // omitted, never "0 DMG"
      cleanup();
    }
  });

  it("drops the opponent clause rather than inventing a zero", () => {
    const s = settlement();
    render(<SegmentResultBeat settlement={s} viewerUserId="userA"
      opponentUserId={null} roundNumber={7} detailsOpen={false}
      onToggleDetails={noop} />);
    expect(beat()).toHaveTextContent("YOU 5/5");
    expect(beat()).not.toHaveTextContent("OPP");
  });
});

describe("the earned bonuses", () => {
  it("shows PERFECT for a 5/5 block", () => {
    render1(settlement({ correct: 5, perfect: true, speedBonus: 0, damageDealt: 6 },
                       {}, { userA: 6, userB: 2 }));
    expect(beat()).toHaveAttribute("data-perfect", "true");
    expect(screen.getByTestId("segment-bonus-perfect")).toHaveTextContent("Perfect");
    // Slower of two perfect players: accuracy paid, the premium did not.
    expect(beat()).toHaveAttribute("data-speed-bonus", "0");
    expect(screen.queryByTestId("segment-bonus-speed")).toBeNull();
    expect(beat()).toHaveTextContent("6 DMG");
  });

  it("shows PERFECT and SPEED for a 5/5 block that finished first", () => {
    render1(settlement({ correct: 5, perfect: true, speedBonus: 1, damageDealt: 7 }));
    expect(beat()).toHaveAttribute("data-perfect", "true");
    expect(beat()).toHaveAttribute("data-speed-bonus", "1");
    expect(screen.getByTestId("segment-bonus-perfect")).toBeInTheDocument();
    expect(screen.getByTestId("segment-bonus-speed")).toHaveTextContent("Speed");
    expect(beat()).toHaveTextContent("7 DMG");
  });

  it("shows NEITHER for a fast but imperfect block", () => {
    // The rule, enforced by the backend and merely reflected here: the premium
    // is layered on accuracy and is worth nothing without it. This block has
    // the fastest times in the fixture and still earns no chip.
    render1(settlement({
      segmentResult: "win", correct: 4, incorrect: 1,
      perfect: false, speedBonus: 0, damageDealt: 4,
      totalResponseMs: 100, perChallengeMs: [20, 20, 20, 20, 20],
    }, {}, { userA: 4, userB: 2 }));
    expect(beat()).toHaveAttribute("data-perfect", "false");
    expect(beat()).toHaveAttribute("data-speed-bonus", "0");
    expect(screen.queryByTestId("segment-bonus-chips")).toBeNull();
    expect(beat()).toHaveTextContent("4 DMG");
  });

  it("never fabricates a Perfect chip from a stray speed value", () => {
    // The backend cannot emit this pairing (`block_damage` only pays the
    // premium to a perfect player). If a payload ever claims it, the
    // presentation reports exactly what it was told and invents nothing —
    // it must not "helpfully" conclude the block was perfect.
    render1(settlement({ correct: 4, perfect: false, speedBonus: 1 }));
    expect(screen.queryByTestId("segment-bonus-perfect")).toBeNull();
    expect(beat()).toHaveAttribute("data-perfect", "false");
  });

  it("adds no chip row to a block that earned nothing", () => {
    render1(settlement({ correct: 0, incorrect: 5, segmentResult: "loss",
      perfect: false, speedBonus: 0, damageDealt: 0 }, {}, { userA: 0, userB: 5 }));
    expect(screen.queryByTestId("segment-bonus-chips")).toBeNull();
  });

  it("announces the bonuses to a screen reader, where width is no constraint", () => {
    render1(settlement());
    expect(beat().getAttribute("aria-label"))
      .toMatch(/perfect block.*speed bonus/);
  });
});

describe("the block beat belongs to the round-beat system", () => {
  it.each([
    ["win", "correct", "Win"],
    ["loss", "incorrect", "Loss"],
    ["draw", "both-correct", "Draw"],
    ["timeout", "timed-out", "Timeout"],
  ] as const)("maps %s onto the existing %s tone", (result, kind, word) => {
    render1(settlement({ segmentResult: result }));
    expect(beat()).toHaveAttribute("data-kind", kind);
    expect(beat()).toHaveAttribute("data-segment-result", result);
    expect(screen.getByTestId("ranked-last-result-verdict")).toHaveTextContent(word);
  });

  it("keeps ONE fixed box whatever the block earned", () => {
    // The plate lives inside the header's reserved min-height; a bonus row
    // that changed its height would move the clock beside it.
    const boxes = new Set<string>();
    const cases: Partial<SegmentRevealPlayer>[] = [
      { perfect: false, speedBonus: 0 },
      { perfect: true, speedBonus: 0 },
      { perfect: true, speedBonus: 1 },
    ];
    for (const c of cases) {
      render1(settlement(c));
      const cls = beat().className;
      expect(cls).toContain("h-10");
      expect(cls).toContain("whitespace-nowrap");
      boxes.add(cls.split(/\s+/).filter(
        (x) => x.startsWith("h-") || x === "whitespace-nowrap").sort().join(" "));
      cleanup();
    }
    expect(boxes.size).toBe(1);
  });

  it("uses the shared plate and its animation hook", () => {
    render1(settlement());
    expect(beat().className).toContain("ranked-result-beat");
    expect(beat()).toHaveAttribute("data-mode", "segment");
    expect(beat()).toHaveTextContent("R7");
  });
});

describe("segmentScoreline", () => {
  it("is the authoritative final damage, never the module's own figure", () => {
    expect(segmentScoreline(
      settlement({ damageDealt: 7 }, {}, { userA: 9, userB: 0 }), "userA", "userB",
    )).toBe("YOU 5/5 · OPP 2/5 · 9 DMG");
  });

  it("omits damage entirely when the block dealt none", () => {
    expect(segmentScoreline(
      settlement({}, {}, { userA: 0, userB: 0 }), "userA", "userB",
    )).toBe("YOU 5/5 · OPP 2/5");
  });
});
