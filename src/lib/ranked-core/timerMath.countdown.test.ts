/**
 * RFX1 Phase 2B3 — THE COUNTDOWN'S SEMANTICS, stated and pinned.
 *
 * WHAT A DISPLAYED NUMBER MEANS. `remainingSeconds` is a CEILING, and that is
 * the product's existing convention rather than a new choice: the arena has
 * shipped `Math.ceil` since the mode did, and `projectTimer` caps it at the
 * configured duration so the clock reads the round's own length before it
 * opens. So "30" means "more than 29 s and at most 30 s remain", and it is
 * shown for the whole of that second — a full duration reads 30 at the
 * instant it opens and holds it for 1000 ms.
 *
 * The consequence this phase cares about: every visible number occupies its
 * own real second, "1" included, and "0" appears only when the round is truly
 * expired.
 */
import { describe, expect, it } from "vitest";

import {
  SKEW_RESYNC_THRESHOLD_MS, msUntilSecondBoundary, reconciledSkewMs, remainingSeconds,
} from "./timerMath";
import {
  MATCH_OUTRO_MS, MODULE_TITLE_END_MARGIN_MS, MODULE_TITLE_MIN_MS,
  moduleTitleWindowMs,
} from "./pacing";
import { MODULE_TITLE_MS } from "./centralStage";

const T = Date.parse("2026-09-20T12:00:30.000Z");
const iso = new Date(T).toISOString();
const at = (remaining: number) => T - remaining;

describe("RFX1 2B3 — what the displayed second means", () => {
  it("is a ceiling, so each number owns the second below it", () => {
    expect(remainingSeconds(iso, 0, at(30_000))).toBe(30);
    expect(remainingSeconds(iso, 0, at(29_001))).toBe(30);
    expect(remainingSeconds(iso, 0, at(29_000))).toBe(29);
    expect(remainingSeconds(iso, 0, at(1))).toBe(1);
    expect(remainingSeconds(iso, 0, at(0))).toBe(0);
  });

  it("never reads negative, however far past the deadline", () => {
    expect(remainingSeconds(iso, 0, at(-1))).toBe(0);
    expect(remainingSeconds(iso, 0, at(-60_000))).toBe(0);
  });
});

describe("RFX1 2B3 — the next boundary is a property of the deadline", () => {
  it("gives a whole second when the remaining time is a whole second", () => {
    // This is what makes "30" last a second instead of vanishing on arrival.
    expect(msUntilSecondBoundary(iso, 0, at(30_000))).toBe(1000);
    expect(msUntilSecondBoundary(iso, 0, at(1_000))).toBe(1000);
  });

  it("gives the remainder from an arbitrary instant, then whole seconds", () => {
    expect(msUntilSecondBoundary(iso, 0, at(29_700))).toBe(700);
    expect(msUntilSecondBoundary(iso, 0, at(29_001))).toBe(1);
    expect(msUntilSecondBoundary(iso, 0, at(1))).toBe(1);
  });

  it("is skew-corrected, and the correction moves the boundary by itself", () => {
    expect(msUntilSecondBoundary(iso, 250, at(29_700))).toBe(450);
    expect(msUntilSecondBoundary(iso, -250, at(29_700))).toBe(950);
  });

  it("schedules nothing once there is nothing left", () => {
    expect(msUntilSecondBoundary(iso, 0, at(0))).toBeNull();
    expect(msUntilSecondBoundary(iso, 0, at(-5_000))).toBeNull();
    expect(msUntilSecondBoundary("not a date", 0, T)).toBeNull();
  });

  it("walks a 30 s round in exactly 30 boundaries", () => {
    let now = at(30_000);
    const seen: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      const delay = msUntilSecondBoundary(iso, 0, now);
      if (delay === null) break;
      now += delay;
      seen.push(remainingSeconds(iso, 0, now));
    }
    expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => 29 - i));
  });
});

describe("RFX1 2B3 — the module transition has a floor, not a flicker", () => {
  it("plays its nominal beat when the server's window allows it", () => {
    expect(moduleTitleWindowMs(2900, MODULE_TITLE_MS)).toBe(MODULE_TITLE_MS);
  });

  it("shortens under the cutoff margin while it stays readable", () => {
    const room = MODULE_TITLE_MIN_MS + 200 + MODULE_TITLE_END_MARGIN_MS;
    expect(moduleTitleWindowMs(room, MODULE_TITLE_MS)).toBe(MODULE_TITLE_MIN_MS + 200);
  });

  it("is SKIPPED rather than flashed once the room falls below the floor", () => {
    const tooTight = MODULE_TITLE_MIN_MS - 1 + MODULE_TITLE_END_MARGIN_MS;
    expect(moduleTitleWindowMs(tooTight, MODULE_TITLE_MS)).toBe(0);
    // And a round that is already answerable still plays none at all.
    expect(moduleTitleWindowMs(0, MODULE_TITLE_MS)).toBe(0);
    expect(moduleTitleWindowMs(-1000, MODULE_TITLE_MS)).toBe(0);
  });

  it("the swap gate can never squeeze the title below the floor", () => {
    // 2B1's gate holds the swap until at most `started_at − 1000`, so the
    // title always has 1000 − the cutoff margin to play in. That number is
    // what makes the floor reachable rather than aspirational.
    expect(1000 - MODULE_TITLE_END_MARGIN_MS)
      .toBeGreaterThanOrEqual(MODULE_TITLE_MIN_MS);
  });

  it("never asks for more than the caller's own nominal beat", () => {
    expect(moduleTitleWindowMs(10_000, 300)).toBe(300);
  });
});

describe("RFX1 2B3 — the match-complete beat is one adjustable number", () => {
  it("is long enough to read as a beat and short enough not to block", () => {
    expect(MATCH_OUTRO_MS).toBeGreaterThanOrEqual(1000);
    expect(MATCH_OUTRO_MS).toBeLessThanOrEqual(1500);
  });
});

describe("RFX1 2B3 — polling corrects the clock, it does not shake it", () => {
  it("seeds from the first reading, whatever it is", () => {
    expect(reconciledSkewMs(null, -1234)).toBe(-1234);
    expect(reconciledSkewMs(null, 0)).toBe(0);
  });

  it("keeps the HIGHEST reading, because the least-delayed one is the truest", () => {
    // Every reading understates the offset by that response's travel time, so
    // a lower one is a slower round trip, not a new fact.
    let skew = reconciledSkewMs(null, -180);
    for (const reading of [-260, -205, -410, -300]) {
      skew = reconciledSkewMs(skew, reading);
    }
    expect(skew).toBe(-180);
    // A faster round trip IS new information, and is taken at once.
    expect(reconciledSkewMs(skew, -90)).toBe(-90);
  });

  it("adopts a genuine correction immediately", () => {
    // The device clock moved, or the tab was suspended: a large step DOWN.
    const moved = -180 - SKEW_RESYNC_THRESHOLD_MS - 1;
    expect(reconciledSkewMs(-180, moved)).toBe(moved);
  });

  it("bounds the error it can hold, so smoothing can never be a lie", () => {
    // Whatever it keeps, it is within the threshold of the newest reading —
    // and it errs by showing LESS time, never more.
    const held = reconciledSkewMs(-180, -700);
    expect(held).toBe(-180);
    expect(held - -700).toBeLessThanOrEqual(SKEW_RESYNC_THRESHOLD_MS);
    expect(held).toBeGreaterThan(-700);
  });

  it("a held skew does not move the boundaries between polls", () => {
    // The whole point: with the skew constant, every boundary is 1000 ms
    // apart. Feeding the raw readings instead would move each one by the
    // difference between two round trips.
    const deadline = new Date(T).toISOString();
    // Start on a boundary for the held skew, so the run is whole seconds.
    let now = T - 30_000 - -180;
    const gaps: number[] = [];
    for (const _reading of [-180, -260, -205, -410, -300]) {
      const delay = msUntilSecondBoundary(deadline, -180, now)!;
      gaps.push(delay);
      now += delay;
    }
    expect(gaps).toEqual([1000, 1000, 1000, 1000, 1000]);
  });
});
