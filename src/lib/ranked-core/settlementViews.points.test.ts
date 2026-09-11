/**
 * RP1 — the settled module's award, into the rail's ledger.
 *
 * Pure pass-through over `module_points`. What is fixed here is that nothing
 * invents a number, and that an hp settlement produces no points at all rather
 * than a zero that would render. (The reveal-beat award projection moved to
 * `pointsFeedback` in Step 4, which states the base/bonus split the rails and
 * the result plate both need; its tests live beside it.)
 */
import { describe, expect, it } from "vitest";
import { adaptBackendSettlement } from "./backend/adaptBackendSettlement";
import {
  FIXTURE_P1_ID, FIXTURE_P2_ID, FIXTURE_PLAYER_IDS, getScenario,
} from "./backend/backendSettlementFixtures";
import type { BackendResolvedRoundProjection } from "./backend/backendSettlementTypes";
import { projectRoundHistory } from "./settlementViews";

const settlement = (awards?: Record<string, Record<string, number>>) => {
  const raw: BackendResolvedRoundProjection =
    JSON.parse(JSON.stringify(getScenario("both-correct-faster")!.settlement));
  if (awards) raw.module_points = awards as never;
  return adaptBackendSettlement(raw, FIXTURE_PLAYER_IDS);
};

const AWARDS = {
  [FIXTURE_P1_ID]: {
    base_points: 2, speed_bonus_points: 1, points_awarded: 3,
    score_before: 8, score_after: 11,
  },
  [FIXTURE_P2_ID]: {
    base_points: 2, speed_bonus_points: 0, points_awarded: 2,
    score_before: 6, score_after: 8,
  },
};

describe("the recent-module ledger", () => {
  it("carries each row's award", () => {
    const [row] = projectRoundHistory([settlement(AWARDS)], FIXTURE_P1_ID);
    expect(row.pointsAwarded).toBe(3);
  });

  it("carries null on an hp round, so the row stays a damage row", () => {
    const [row] = projectRoundHistory([settlement()], FIXTURE_P1_ID);
    expect(row.pointsAwarded).toBeNull();
    expect(row.dealt).toBeGreaterThanOrEqual(0);
  });
});
