/**
 * RP1 Step 3 — a settled module's award, as the settlement adapter sees it.
 *
 * `module_points` is the ONE thing a points client reads to learn what a
 * module was worth. It is pass-through — the backend already reconciled the
 * module's explanation against the award the engine banked — so what these
 * tests fix is that nothing is re-derived here, and that an unreadable award
 * fails rather than rendering as a confident wrong number.
 */
import { describe, expect, it } from "vitest";
import { adaptBackendSettlement, SettlementAdapterError } from "./adaptBackendSettlement";
import {
  FIXTURE_P1_ID, FIXTURE_P2_ID, FIXTURE_PLAYER_IDS, getScenario,
} from "./backendSettlementFixtures";
import type { BackendResolvedRoundProjection } from "./backendSettlementTypes";

const fixture = (): BackendResolvedRoundProjection =>
  JSON.parse(JSON.stringify(getScenario("both-correct-faster")!.settlement));

const AWARD = {
  [FIXTURE_P1_ID]: {
    base_points: 2, speed_bonus_points: 1, points_awarded: 3,
    score_before: 8, score_after: 11,
  },
  [FIXTURE_P2_ID]: {
    base_points: 2, speed_bonus_points: 0, points_awarded: 2,
    score_before: 6, score_after: 8,
  },
};

describe("module_points", () => {
  it("adapts both players' awards, keyed by backend player id", () => {
    const raw = fixture();
    raw.module_points = AWARD;
    const s = adaptBackendSettlement(raw, FIXTURE_PLAYER_IDS);
    expect(s.modulePoints).toEqual({
      [FIXTURE_P1_ID]: {
        basePoints: 2, speedBonusPoints: 1, pointsAwarded: 3,
        scoreBefore: 8, scoreAfter: 11,
      },
      [FIXTURE_P2_ID]: {
        basePoints: 2, speedBonusPoints: 0, pointsAwarded: 2,
        scoreBefore: 6, scoreAfter: 8,
      },
    });
  });

  it("is null for an hp round, which publishes none", () => {
    expect(adaptBackendSettlement(fixture(), FIXTURE_PLAYER_IDS).modulePoints)
      .toBeNull();
  });

  it("does NOT recompute the award from the base and the bonus", () => {
    // A deliberately inconsistent block: the backend refuses to publish one,
    // and if it somehow did, this adapter must report what it was TOLD rather
    // than quietly preferring its own arithmetic.
    const raw = fixture();
    raw.module_points = {
      [FIXTURE_P1_ID]: {
        base_points: 2, speed_bonus_points: 1, points_awarded: 99,
        score_before: 0, score_after: 99,
      },
    };
    expect(adaptBackendSettlement(raw, FIXTURE_PLAYER_IDS)
      .modulePoints?.[FIXTURE_P1_ID].pointsAwarded).toBe(99);
  });

  it("REFUSES a malformed award rather than rendering half of one", () => {
    const raw = fixture();
    raw.module_points = {
      [FIXTURE_P1_ID]: { base_points: 2, speed_bonus_points: 1 },
    } as never;
    expect(() => adaptBackendSettlement(raw, FIXTURE_PLAYER_IDS))
      .toThrow(SettlementAdapterError);
  });

  it("leaves every other field of an hp settlement byte-identical", () => {
    const withPoints = fixture();
    withPoints.module_points = AWARD;
    const a = adaptBackendSettlement(withPoints, FIXTURE_PLAYER_IDS);
    const b = adaptBackendSettlement(fixture(), FIXTURE_PLAYER_IDS);
    expect({ ...a, modulePoints: null }).toEqual(b);
  });
});
