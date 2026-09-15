/**
 * RM1 Pass 1 — the award's TWO HALVES, preserved through the history
 * projection, for BOTH players.
 *
 * `settlementViews.points.test.ts` already fixes that the banked TOTAL survives.
 * What is fixed here is the split: a `+3` total is not enough to draw a bubble,
 * because `3 base` and `2 base + 1 speed` are different modules that bank the
 * same number, and the bubble prints the base and flags the bonus separately.
 *
 * Nothing here exercises a scoring rule. Every number below arrives from
 * `module_points` on the settlement and is asserted to arrive unchanged.
 */
import { describe, expect, it } from "vitest";
import { adaptBackendSettlement } from "./backend/adaptBackendSettlement";
import {
  FIXTURE_P1_ID, FIXTURE_P2_ID, FIXTURE_PLAYER_IDS, getScenario,
} from "./backend/backendSettlementFixtures";
import type { BackendResolvedRoundProjection } from "./backend/backendSettlementTypes";
import { projectRoundHistory } from "./settlementViews";

/** One settled round, with an award per player, at round `n`. */
const settlement = (
  n: number, awards?: Record<string, Record<string, number>> | null,
) => {
  const raw: BackendResolvedRoundProjection =
    JSON.parse(JSON.stringify(getScenario("both-correct-faster")!.settlement));
  raw.round_number = n;
  if (awards) raw.module_points = awards as never;
  return adaptBackendSettlement(raw, FIXTURE_PLAYER_IDS);
};

const award = (base: number, speed: number) => ({
  base_points: base, speed_bonus_points: speed, points_awarded: base + speed,
  score_before: 0, score_after: base + speed,
});

/**
 * The two sides differ in base AND in bonus, so a projection that read one
 * player's award for both cannot pass by coincidence.
 *
 * Chosen for SEPARABILITY, not for realism — see the longer note on the
 * ten-module fixture below. These are projection inputs; no pairing here is a
 * claim about what the scoring engine can emit.
 */
const ASYMMETRIC = {
  [FIXTURE_P1_ID]: award(2, 1),
  [FIXTURE_P2_ID]: award(0, 0),
};

describe("module history preserves base and speed", () => {
  it("keeps base, bonus and total as three separate facts", () => {
    const [row] = projectRoundHistory([settlement(1, ASYMMETRIC)], FIXTURE_P1_ID);
    expect(row.basePoints).toBe(2);
    expect(row.speedBonusPoints).toBe(1);
    // The total is still carried, and it is still the engine's own figure —
    // this layer neither recomputes nor replaces it.
    expect(row.pointsAwarded).toBe(3);
  });

  it("projects each player's OWN award, not the other's", () => {
    const log = [settlement(1, ASYMMETRIC)];
    const [viewer] = projectRoundHistory(log, FIXTURE_P1_ID);
    const [opponent] = projectRoundHistory(log, FIXTURE_P2_ID);
    expect([viewer.basePoints, viewer.speedBonusPoints]).toEqual([2, 1]);
    expect([opponent.basePoints, opponent.speedBonusPoints]).toEqual([0, 0]);
  });

  it("a zero-base module is a real 0, distinct from an unscored one", () => {
    const [opponent] = projectRoundHistory(
      [settlement(1, ASYMMETRIC)], FIXTURE_P2_ID);
    expect(opponent.basePoints).toBe(0);
    expect(opponent.basePoints).not.toBeNull();
  });

  it("an hp settlement publishes no award, so both halves are null", () => {
    // Null is "the settlement did not say" and must never become a zero: a
    // green-or-red `+0` bubble about an unscored round is the one claim the
    // projection is not allowed to make.
    const [row] = projectRoundHistory([settlement(1, null)], FIXTURE_P1_ID);
    expect(row.basePoints).toBeNull();
    expect(row.speedBonusPoints).toBeNull();
    expect(row.pointsAwarded).toBeNull();
    // And the damage row is untouched — current behaviour is preserved.
    expect(row.dealt).toBeGreaterThanOrEqual(0);
    expect(typeof row.hpAfter).toBe("number");
  });
});

/**
 * THE END-SCREEN FEASIBILITY PROOF (RM1 Pass 1 §5).
 *
 * Not the ES1 layout — just the DATA that layout needs: after a complete
 * ten-module match, can this projection produce the viewer's ten bubbles and
 * the opponent's ten bubbles, in the same chronological module order?
 *
 * It is asserted here rather than in a UI test because the answer is a property
 * of the projection: the two rows are the same function called with two player
 * ids over one settlement log, so they cannot fall out of order or disagree
 * about which module a column describes.
 */
describe("a complete 10-module match yields both players' bubble rows", () => {
  // Ten settled modules. The base walks 0..3 and back so every bubble state in
  // the approved vocabulary appears, and the bonus alternates INDEPENDENTLY of
  // it.
  //
  // THESE AWARDS ARE DELIBERATELY ASYMMETRIC AND ARE NOT A CLAIM ABOUT THE
  // SCORING ENGINE. The combination the bonus walk produces at module 5 —
  // `0 base + 1 speed` — is asserted below, and it may well be a state the
  // engine never emits: RP1's bonus requires correctness (and, on a block,
  // perfection) alongside finishing first, so a zero base with a bonus is
  // plausibly unreachable in a real match.
  //
  // It is here anyway, on purpose, because this suite tests a PROJECTION and
  // not a rule. The property being fixed is that the two halves of an award
  // survive independently — whatever pairing arrives. A fixture that only ever
  // paired a bonus with a positive base could not tell a correct projection
  // apart from one that derived the base from the total, or the bonus from the
  // base, and that substitution is exactly the defect the split exists to
  // prevent. So the input is chosen to be separable, not to be realistic.
  //
  // Nothing production-side infers legality from this. The projection copies
  // what the settlement published and asserts no scoring rule, and the bubble
  // renders `0 base` red with a dot because that is what it was handed — which
  // is the honest rendering of an award the server stated, reachable or not.
  const BASES_VIEWER = [2, 0, 3, 1, 2, 0, 1, 3, 2, 1];
  const BASES_OPPONENT = [1, 3, 0, 2, 0, 3, 2, 1, 0, 3];
  const speedViewer = (i: number) => (i % 3 === 0 ? 1 : 0);
  const speedOpponent = (i: number) => (i % 2 === 0 ? 1 : 0);

  const log = BASES_VIEWER.map((base, i) => settlement(i + 1, {
    [FIXTURE_P1_ID]: award(base, speedViewer(i)),
    [FIXTURE_P2_ID]: award(BASES_OPPONENT[i], speedOpponent(i)),
  }));

  it("produces ten viewer rows in chronological module order", () => {
    const rows = projectRoundHistory(log, FIXTURE_P1_ID);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows.map((r) => r.basePoints)).toEqual(BASES_VIEWER);
    expect(rows.map((r) => r.speedBonusPoints))
      .toEqual(BASES_VIEWER.map((_, i) => speedViewer(i)));
  });

  it("produces ten opponent rows in the SAME order, module for module", () => {
    const viewer = projectRoundHistory(log, FIXTURE_P1_ID);
    const opponent = projectRoundHistory(log, FIXTURE_P2_ID);
    expect(opponent).toHaveLength(10);
    // The invariant the stacked ES1 rows depend on: index i is module i in
    // both rows, so the viewer's row sits directly above the opponent's and
    // every column compares the same module.
    expect(opponent.map((r) => r.roundNumber)).toEqual(viewer.map((r) => r.roundNumber));
    expect(opponent.map((r) => r.basePoints)).toEqual(BASES_OPPONENT);
    expect(opponent.map((r) => r.speedBonusPoints))
      .toEqual(BASES_OPPONENT.map((_, i) => speedOpponent(i)));
  });

  it("the two rows disagree where the match did, and nowhere else", () => {
    const viewer = projectRoundHistory(log, FIXTURE_P1_ID);
    const opponent = projectRoundHistory(log, FIXTURE_P2_ID);
    // Module 3: viewer 3 base, opponent 0 base. A comparison row has to be
    // able to show that, which is the whole point of keeping both.
    expect(viewer[2].basePoints).toBe(3);
    expect(opponent[2].basePoints).toBe(0);
    // Module 5: the opponent's award pairs a ZERO base with a bonus. Merged
    // into one figure this would have rendered as a positive `+1` bubble —
    // which is the whole reason the halves travel separately.
    //
    // Again: an INTENTIONALLY ASYMMETRIC projection input, not an assertion
    // that the engine can produce this pairing (see the note above). What is
    // being fixed is that the projection does not fabricate one value from the
    // other; whether the pairing is reachable is a scoring question this suite
    // deliberately does not answer.
    expect(opponent[4].basePoints).toBe(0);
    expect(opponent[4].speedBonusPoints).toBe(1);
  });
});
