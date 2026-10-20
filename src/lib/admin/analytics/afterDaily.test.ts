import { describe, expect, it } from "vitest";
import { computeAfterDaily } from "./afterDaily";
import type { JourneyAction, VisitorJourney } from "./visitorJourney";

const DAY = 24 * 60 * 60 * 1000;
const end = Date.parse("2026-10-20T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const action = (at: number, kind: JourneyAction["kind"], category?: string): JourneyAction =>
  ({ at: iso(at), title: "x", where: "x", evidence: "x", kind, category });
const journey = (actions: JourneyAction[], id = "v"): VisitorJourney => ({
  id, kind: "guest", accountLabel: "", human: true, firstAt: null, lastAt: null, landing: "", source: "",
  sessions: 1, returning: false, games: 0, actions,
});

describe("computeAfterDaily", () => {
  it("counts only browsers with a recorded Daily stage", () => {
    const s = computeAfterDaily([journey([action(end - 5 * DAY, "game_start", "role_challenge")])], end);
    expect(s.dailyBrowsers).toBe(0);
  });

  it("names the first different game started after the last Daily activity", () => {
    const t = end - 3 * DAY;
    const s = computeAfterDaily([journey([
      action(t, "game_start", "daily_stage"),
      action(t + 60_000, "stage_end", "daily_stage"),
      action(t + 120_000, "game_start", "more_challenges"),
      action(t + 180_000, "game_start", "ranked_vs_bot"),
    ])], end);
    expect(s.next.more_challenges).toBe(1);
    expect(s.next.ranked_vs_bot).toBe(0);
  });

  it("a game before the Daily is not 'after', and no later game reads as none recorded", () => {
    const t = end - 3 * DAY;
    const s = computeAfterDaily([journey([
      action(t - 60_000, "game_start", "practice_quiz"),
      action(t, "game_start", "daily_stage"),
    ])], end);
    expect(s.next.none).toBe(1);
    expect(s.next.practice_quiz).toBe(0);
  });

  it("page views and clicks are never a game played after Daily", () => {
    const t = end - 3 * DAY;
    const s = computeAfterDaily([journey([
      action(t, "game_start", "daily_stage"),
      action(t + 1000, "page_view"),
      action(t + 2000, "click"),
    ])], end);
    expect(s.next.none).toBe(1);
  });

  it("return needs a session on a later UTC day, and only counts browsers with a full day of follow-up", () => {
    const early = end - 4 * DAY;
    const late = end - 2 * 60 * 60 * 1000; // two hours before the range ends
    const s = computeAfterDaily([
      journey([action(early, "game_start", "daily_stage"), action(early + DAY, "session")], "back"),
      journey([action(early, "game_start", "daily_stage"), action(early + 5000, "session")], "same-day"),
      journey([action(late, "game_start", "daily_stage")], "too-late"),
    ], end);
    expect(s.dailyBrowsers).toBe(3);
    expect(s.followUpEligible).toBe(2);
    expect(s.returned).toBe(1);
  });

  it("with no browser eligible, return stays unknown rather than zero", () => {
    const s = computeAfterDaily([journey([action(end - 60_000, "game_start", "daily_stage")])], end);
    expect(s.followUpEligible).toBe(0);
    expect(s.returned).toBe(0);
  });
});
