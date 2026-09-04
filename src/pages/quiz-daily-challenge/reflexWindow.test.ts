/**
 * THE META REFLEX WINDOW, pinned to a REAL production activation.
 *
 * Every number below was read off `POST /api/daily-challenge/runs/{id}/cards/7/activate`
 * against the deployed backend on 2026-09-04, not invented for a fixture: a
 * six-second window, `ends_at` exactly `server_now + 6000ms`, and
 * `remaining_ms: 6000`.
 *
 * What this exists to hold:
 *
 *  * the window stays SIX SECONDS. The mode's own entry copy promises "six
 *    seconds a card", and a projection that quietly drew more would be a
 *    scoring surprise in the direction the player notices last;
 *  * the clock is DISPLAY ONLY and clamps at zero. Expiry is the server's
 *    ruling — the client never decides it, and never locks the tablets on its
 *    own, which is what keeps a card answerable inside the backend's grace and
 *    afterwards in the learning phase;
 *  * network latency does NOT inflate it — the skew is measured at the same
 *    instant the stale `server_now` lands, so the two errors cancel. The one
 *    thing that can stretch the drawn number is a STALE RENDER TICK, which is
 *    why a backgrounded tab (Chrome clamps hidden timers to ~1/s, and to ~1/min
 *    after five minutes) drew 0:07, then 0:13, then a frozen 0:20 during live
 *    certification. Display only; the server scored none of it.
 */
import { describe, expect, it } from "vitest";
import { clockSkewMs, projectTimer } from "./dailyChallengeViews";
import type { DcCard } from "@/lib/daily-challenge/contracts";

/** The activation response's own timestamps, verbatim. */
const SERVER_NOW = "2026-09-04T07:01:39.408146+00:00";
const ENDS_AT = "2026-09-04T07:01:45.408146+00:00";
const WINDOW_MS = 6000;

const reflexCard = (): DcCard => ({
  sequence: 7, kind: "meta_reflex", tier: "reflex", prompt: "Which item gives more Ability Power?",
  category: null, media: null,
  options: [
    { index: 0, eliminated: false, label: "Verdant Barrier", media: "assets/items/4632.png", side: "left", entityId: "Verdant Barrier" },
    { index: 1, eliminated: false, label: "Actualizer", media: "assets/items_wiki/2522.png", side: "right", entityId: "Actualizer" },
  ],
  eliminated: [], points: 60, scoreLocked: false, scoreOutcome: null,
  awardedScore: 0, attemptCount: 0, activated: true, requiresActivation: true,
  timer: { endsAt: ENDS_AT, remainingMs: WINDOW_MS, serverNow: SERVER_NOW },
  resolved: false,
});

describe("the Meta Reflex window, against a real production activation", () => {
  const serverMs = Date.parse(SERVER_NOW);

  it("is six seconds when the device agrees with the server", () => {
    const skew = clockSkewMs(SERVER_NOW, serverMs);
    expect(skew).toBe(0);
    const t = projectTimer(reflexCard(), null, serverMs, skew);
    expect(t).not.toBeNull();
    expect(t!.remainingSeconds).toBe(6);
    expect(t!.durationSeconds).toBe(6);
  });

  it("still draws six on a device whose clock is minutes off", () => {
    // The skew anchor is the whole point: a wrong wall clock changes what is
    // DRAWN and nothing else, so it must not change even that.
    for (const driftMs of [-300_000, -5_000, 5_000, 300_000]) {
      const deviceAtReceipt = serverMs + driftMs;
      const skew = clockSkewMs(SERVER_NOW, deviceAtReceipt);
      const t = projectTimer(reflexCard(), null, deviceAtReceipt, skew);
      expect(t!.remainingSeconds).toBe(6);
    }
  });

  it("is not inflated by network latency — the skew anchor cancels it", () => {
    // `server_now` is already stale by one network leg when the response
    // lands, but the skew is measured at that same instant, so the two errors
    // are the same error and subtract out. Six, not seven.
    for (const latencyMs of [50, 700, 2500]) {
      const deviceAtReceipt = serverMs + latencyMs;   // device clock in sync
      const skew = clockSkewMs(SERVER_NOW, deviceAtReceipt);
      const t = projectTimer(reflexCard(), null, deviceAtReceipt, skew);
      expect(t!.remainingSeconds).toBe(6);
    }
  });

  it("only ever runs LONG by how STALE the render tick is", () => {
    // The one way the drawn number exceeds the window: `now` is the page's
    // 250ms tick, and a tick that has not fired recently is in the past.
    //
    // This is why a BACKGROUND tab draws nonsense. Chrome clamps a hidden
    // page's timers to ~1/s and, after five minutes, to ~1/min — measured in
    // exactly that state, a live six-second window rendered 0:07, then 0:13,
    // then a frozen 0:20. Every one of those is the tick's age, not the
    // window's length, and none of them changed what the server scored.
    //
    // Pinned so the relationship stays legible: drawn = window + tick age.
    const skew = clockSkewMs(SERVER_NOW, serverMs);
    for (const [tickAgeMs, drawn] of [[0, 6], [1_000, 7], [7_000, 13], [14_000, 20]]) {
      const t = projectTimer(reflexCard(), null, serverMs - tickAgeMs, skew);
      expect(t!.remainingSeconds).toBe(drawn);
    }
  });

  it("clamps at zero rather than going negative past the deadline", () => {
    const t = projectTimer(reflexCard(), null, Date.parse(ENDS_AT) + 30_000, 0);
    expect(t!.remainingSeconds).toBe(0);
    expect(t!.urgent).toBe(true);
  });

  it("draws no clock at all once the server drops the timer", () => {
    // What an EXPIRED reflex card actually looks like in production: the score
    // is locked to `timeout`, the timer is gone, and the card is still open to
    // be solved untimed. Nothing here may resurrect a countdown for it.
    const expired = { ...reflexCard(), timer: null, scoreLocked: true,
      scoreOutcome: "timeout" as const };
    expect(projectTimer(expired, 6000, Date.now(), 0)).toBeNull();
  });
});
