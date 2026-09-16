/**
 * PRESENTATION NEVER CONSUMES ANSWER TIME — the display half.
 *
 * The server opens a round in the FUTURE while the client is still playing the
 * previous result beat and this module's title, so `active_deadline` is
 * `started_at + duration` and `started_at` is the moment answering begins.
 *
 * Two things follow on this side, and they are the whole of the frontend fix:
 * the clock must sit still on the full duration until the boundary rather than
 * counting down through an interval the player cannot act in, and input must
 * stay shut until then — because the backend refuses an early receipt and a UI
 * that offered one would be offering something that cannot work.
 *
 * Neither of these DECIDES the boundary. `MODULE_TITLE_MS` and the reveal hold
 * sequence the animation; the server decides when the round is answerable.
 */
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { msUntilAnswerable } from "@/lib/ranked-core/timerMath";
import { projectTimer } from "./rankedViews";

/** A round that becomes answerable `leadMs` from the fixture's own "now". */
const NOW = Date.parse("2026-07-18T12:00:00+00:00");
const DURATION = 30;

function roundOpeningIn(leadMs: number) {
  const raw = publicRoundV2() as ReturnType<typeof publicRoundV2>;
  const payload = raw.payload as Record<string, unknown>;
  const startedAt = new Date(NOW + leadMs).toISOString();
  payload.active_round = {
    round_number: 1,
    started_at: startedAt,
    // The server's own arithmetic: the full configured duration, starting at
    // the boundary and not before it.
    active_deadline: new Date(NOW + leadMs + DURATION * 1000).toISOString(),
    duration_seconds: DURATION,
    pressure_applied: false,
    ready_to_resolve: false,
  };
  return readPublicRound(raw);
}

describe("the clock before the answerable boundary", () => {
  it("sits on the FULL configured duration while the presentation plays", () => {
    // 2.9s of lead-in is the ordinary case (result beat + module title). An
    // unclamped countdown would read 33s here — more time than the round has.
    const timer = projectTimer(roundOpeningIn(2900), 0, NOW)!;
    expect(timer.remainingSeconds).toBe(DURATION);
    expect(timer.durationSeconds).toBe(DURATION);
  });

  it("does not creep during the lead-in — no fake countdown", () => {
    const round = roundOpeningIn(2900);
    for (const elapsed of [0, 500, 1400, 2899]) {
      expect(projectTimer(round, 0, NOW + elapsed)!.remainingSeconds)
        .toBe(DURATION);
    }
  });

  it("starts counting from the full duration AT the boundary", () => {
    const round = roundOpeningIn(2900);
    expect(projectTimer(round, 0, NOW + 2900)!.remainingSeconds).toBe(DURATION);
    // One second in, one second gone — the player got the whole window.
    expect(projectTimer(round, 0, NOW + 2900 + 1000)!.remainingSeconds)
      .toBe(DURATION - 1);
  });

  it("is unchanged for a round that is already answerable", () => {
    // The clamp may not alter the ordinary case: a round opened at `now` ticks
    // exactly as it always did.
    const round = roundOpeningIn(0);
    expect(projectTimer(round, 0, NOW)!.remainingSeconds).toBe(DURATION);
    expect(projectTimer(round, 0, NOW + 10_000)!.remainingSeconds)
      .toBe(DURATION - 10);
  });

  it("still reaches zero at the deadline", () => {
    const round = roundOpeningIn(2900);
    expect(projectTimer(round, 0, NOW + 2900 + DURATION * 1000)!
      .remainingSeconds).toBe(0);
  });
});

describe("msUntilAnswerable", () => {
  it("is positive before the boundary and zero at or after it", () => {
    const startedAt = new Date(NOW + 2900).toISOString();
    expect(msUntilAnswerable(startedAt, 0, NOW)).toBe(2900);
    expect(msUntilAnswerable(startedAt, 0, NOW + 1400)).toBe(1500);
    expect(msUntilAnswerable(startedAt, 0, NOW + 2900)).toBe(0);
    expect(msUntilAnswerable(startedAt, 0, NOW + 9999)).toBe(0);
  });

  it("is skew-corrected like every other reading", () => {
    const startedAt = new Date(NOW + 2900).toISOString();
    expect(msUntilAnswerable(startedAt, 900, NOW)).toBe(2000);
  });

  it("never reports a negative wait for an unparseable start", () => {
    expect(msUntilAnswerable("not-a-date", 0, NOW)).toBe(0);
  });

  it("holds the whole existing presentation, title included", () => {
    // The 1400ms title is honest now: it fits inside the lead-in rather than
    // running over an active answer clock.
    const startedAt = new Date(NOW + 2900).toISOString();
    expect(msUntilAnswerable(startedAt, 0, NOW)).toBeGreaterThanOrEqual(1400);
  });
});
