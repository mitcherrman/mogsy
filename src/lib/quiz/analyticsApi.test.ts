/**
 * PT1.8 — the one sentence a reader gets about movement.
 *
 * `movementSentence` is the only place in the client that turns the server's
 * numbers into a claim, so it is the only place a claim can be invented. These
 * tests pin the four cases in order of how badly each gets it wrong when
 * confused: no data, thin data, no comparable period, and a real movement.
 */
import { describe, expect, it } from "vitest";
import { movementSentence, windowLabel, type TrendReport } from "./analyticsApi";

const REPORT = (over: Partial<TrendReport> = {}): TrendReport =>
  ({
    ok: true,
    capability: { can_view_trends: true, trend_windows: [7, 30, 90], can_build: true, reason: "premium" },
    windows: [7, 30, 90],
    window_days: 30,
    since: "", until: "", previous_since: "",
    current: { attempts: 40, correct: 30, accuracy: 75, active_days: 5 },
    previous: { attempts: 40, correct: 20, accuracy: 50, active_days: 5 },
    delta: { attempts: 0, accuracy_points: 25, active_days: 0, direction: "improving", comparable: true },
    series: [], modes: [], categories: [], recurring_weak: [],
    sufficiency: {
      min_attempts: 10, category_min_attempts: 5, trend_points: 5,
      has_data: true, enough_for_trend: true, enough_for_comparison: true,
    },
    counts_modes: [], excludes_modes: [],
    ...over,
  }) as TrendReport;

describe("movementSentence", () => {
  it("says nothing happened when nothing happened", () => {
    expect(
      movementSentence(
        REPORT({
          current: { attempts: 0, correct: 0, accuracy: 0, active_days: 0 },
          sufficiency: {
            min_attempts: 10, category_min_attempts: 5, trend_points: 5,
            has_data: false, enough_for_trend: false, enough_for_comparison: false,
          },
        }),
      ),
    ).toMatch(/no answers in this window/i);
  });

  it("names the threshold rather than hiding behind it", () => {
    const line = movementSentence(
      REPORT({
        current: { attempts: 4, correct: 3, accuracy: 75, active_days: 1 },
        sufficiency: {
          min_attempts: 10, category_min_attempts: 5, trend_points: 5,
          has_data: true, enough_for_trend: false, enough_for_comparison: false,
        },
      }),
    );
    expect(line).toMatch(/4 answers so far/);
    expect(line).toMatch(/10 in a window/);
  });

  it("does not invent a delta for a first window", () => {
    const line = movementSentence(
      REPORT({
        delta: { attempts: 40, accuracy_points: null, active_days: 5, direction: "insufficient", comparable: false },
        sufficiency: {
          min_attempts: 10, category_min_attempts: 5, trend_points: 5,
          has_data: true, enough_for_trend: true, enough_for_comparison: false,
        },
      }),
    );
    expect(line).toMatch(/first full window/i);
    expect(line).not.toMatch(/\d+ points/);
  });

  it("reports a real movement, in the window's own words", () => {
    expect(movementSentence(REPORT())).toBe("Up 25 points on the previous 30 days.");
    expect(
      movementSentence(
        REPORT({
          delta: { attempts: 0, accuracy_points: -12.5, active_days: 0, direction: "declining", comparable: true },
        }),
      ),
    ).toBe("Down 12.5 points on the previous 30 days.");
    expect(
      movementSentence(
        REPORT({
          delta: { attempts: 0, accuracy_points: 1, active_days: 0, direction: "steady", comparable: true },
        }),
      ),
    ).toMatch(/holding steady/i);
  });
});

describe("windowLabel", () => {
  it("names the offered windows and does not choke on one it has not met", () => {
    expect(windowLabel(7)).toBe("7 days");
    expect(windowLabel(30)).toBe("30 days");
    expect(windowLabel(90)).toBe("90 days");
    expect(windowLabel(180)).toBe("180 days");
  });
});
