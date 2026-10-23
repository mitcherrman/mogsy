/**
 * JOURNEY-UI3 — the Journey clock (`projectJourneyTimer`) on REAL J3 captures.
 *
 * Historical Standard J3 captures use the frozen 150 s ACTIVE-answer pool.
 * New Standard F09 instead uses the existing per-child 30 s contract already
 * proven by Survival. Both clocks are projection-only, server-authoritative:
 * no client local zero settles a question, and the round deadline is never
 * substituted for the Journey's own timer.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { isJourneyFinalReveal, projectJourneyTimer, projectTimer } from "./rankedViews";

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j3");
const snap = (n: string, label: string): CaptureSnapshot => {
  const s = (JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8")) as CaptureSnapshot[]).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
/** The projection at `plusMs` after the capture instant (skew 0: local clock = server clock). */
const at = (n: string, label: string, plusMs = 0) => {
  const s = snap(n, label);
  const round = readPublicRound(s.envelope);
  return { round, t: projectJourneyTimer(round.segmentState, 0, Date.parse(s.at) + plusMs) };
};

describe("Historical frozen Standard: one pooled 150 s clock, server-authoritative", () => {
  it("counts down while the card is open", () => {
    const { t } = at("zed.standard", "child0-live");
    expect(t).toMatchObject({ durationSeconds: 150, remainingSeconds: 148, paused: false });
    expect(at("zed.standard", "child0-live", 3_000).t!.remainingSeconds).toBe(145);
  });

  it("does NOT burn during a reveal: held at the server's remainder until the next card opens", () => {
    const { round, t } = at("zed.standard", "child0-reveal");
    expect(round.segmentState!.activeTimeRunning).toBe(false);
    expect(t).toMatchObject({ remainingSeconds: 142, paused: true });
    const opens = Date.parse(round.segmentState!.ownCardStartedAt!);
    const s = snap("zed.standard", "child0-reveal");
    const justBefore = opens - Date.parse(s.at) - 1;
    expect(at("zed.standard", "child0-reveal", justBefore).t).toMatchObject({ remainingSeconds: 142, paused: true });
    // …and resumes at the server's own open instant, without waiting for a poll.
    expect(at("zed.standard", "child0-reveal", justBefore + 2_001).t).toMatchObject({ remainingSeconds: 140, paused: false });
  });

  it("does NOT burn during a transition beat", () => {
    const beat = at("zed.standard", "child3-beat");
    expect(beat.round.segmentState!.journey!.transitions.map((x) => x.kind)).toEqual(["purchase"]);
    expect(beat.t).toMatchObject({ remainingSeconds: 126, paused: true });
    expect(at("zed.standard", "child3-beat", 1_000).t).toMatchObject({ remainingSeconds: 126, paused: true });
  });

  it("a reconnect reads the same remainder: two reads inside one reveal agree", () => {
    const a = at("zed.standard", "child2-reveal").t!;
    const b = at("zed.standard", "child2-reveal-late").t!;
    expect(b.remainingSeconds).toBe(a.remainingSeconds);
  });

  it("the round's projected deadline is NOT the Journey clock (it would read 157 s at this reveal)", () => {
    const s = snap("zed.standard", "child0-reveal");
    const { round, t } = at("zed.standard", "child0-reveal");
    const legacy = projectTimer(round, 0, Date.parse(s.at))!;
    expect(legacy.remainingSeconds).toBeGreaterThan(t!.remainingSeconds);
  });

  it("exhaustion: the pool is spent and the Journey is over — 0, not paused", () => {
    const { round, t } = at("voli.standard.exhaust", "child1-timeout");
    expect(round.segmentState!.ownFinished).toBe(true);
    expect(t).toMatchObject({ remainingSeconds: 0, paused: false });
  });
});

/**
 * F09 compatibility proof. Until a captured Standard run with the NEW recipe
 * exists, adapt the genuine historical Standard captures by replacing only
 * their clock fields with the server's documented v2 per-card contract.
 * This is a FRONTEND WIRE TEST, not a claim to have exercised the new backend
 * or production database; original historical snapshots remain untouched.
 */
function newStandardCardClock(label: string, plusMs = 0) {
  const s = snap("zed.standard", label);
  const envelope = JSON.parse(JSON.stringify(s.envelope));
  const seg = envelope.payload.segment_state as Record<string, unknown>;
  const opensAt = Date.parse(seg.own_card_started_at as string);
  if (!Number.isFinite(opensAt)) throw new Error(`missing server card opening: ${label}`);
  seg.card_timer_ms = 30_000;
  seg.active_time_ms = null;
  seg.active_time_remaining_ms = null;
  seg.active_time_running = null;
  seg.own_card_deadline = new Date(opensAt + 30_000).toISOString();
  const state = readPublicRound(envelope).segmentState;
  return { state, timer: projectJourneyTimer(state, 0, Date.parse(s.at) + plusMs) };
}

describe("F09 — new Standard: the existing per-card Journey UI accepts the new wire shape", () => {
  it("shows 30 seconds per child and counts from that child's SERVER deadline", () => {
    const start = newStandardCardClock("child0-live");
    expect(start.state?.cardTimerMs).toBe(30_000);
    expect(start.state?.activeTimeMs).toBeNull();
    expect(start.timer).toMatchObject({ durationSeconds: 30, remainingSeconds: 28, paused: false });
    expect(newStandardCardClock("child0-live", 3_000).timer)
      .toMatchObject({ durationSeconds: 30, remainingSeconds: 25 });
  });

  it("holds at the full 30 seconds during the reveal, then starts at the NEXT child's opening", () => {
    expect(newStandardCardClock("child0-reveal").timer).toMatchObject({
      durationSeconds: 30, remainingSeconds: 30,
    });
    expect(newStandardCardClock("child0-reveal", 1_000).timer?.remainingSeconds).toBe(30);
    expect(newStandardCardClock("child0-reveal", 2_500).timer?.remainingSeconds).toBe(29);
  });

  it("holds through a Journey transition beat without spending the upcoming child's clock", () => {
    expect(newStandardCardClock("child3-beat").timer?.remainingSeconds).toBe(30);
    expect(newStandardCardClock("child3-beat", 1_000).timer?.remainingSeconds).toBe(30);
    expect(newStandardCardClock("child3-beat", 2_500).timer?.remainingSeconds).toBe(29);
  });

  it("a locally expired card displays zero but does not claim any backend settlement", () => {
    const x = newStandardCardClock("child0-live", 29_000);
    expect(x.timer).toMatchObject({ durationSeconds: 30, remainingSeconds: 0, urgent: false });
    expect(x.state?.ownFinished).toBe(false); // server still owns settlement
  });

  it("historical frozen Standard still uses the pooled contract, not the new card configuration", () => {
    const old = at("zed.standard", "child0-live");
    expect(old.round.segmentState?.cardTimerMs).toBeNull();
    expect(old.t).toMatchObject({ durationSeconds: 150, remainingSeconds: 148 });
  });
});

describe("Survival: 30 s per child", () => {
  it("the child's own window, full and still until it opens", () => {
    expect(at("olaf.survival", "child1-live").t).toMatchObject({ durationSeconds: 30, remainingSeconds: 28, paused: false });
    expect(at("olaf.survival", "child2-beat").t).toMatchObject({ durationSeconds: 30, remainingSeconds: 30 });
    expect(at("olaf.survival", "child2-beat", 1_000).t!.remainingSeconds).toBe(30);
  });
});

it("a segment that is not a Journey keeps the round clock (null here)", () => {
  const s = snap("zed.standard", "child1-open");
  const e = JSON.parse(JSON.stringify(s.envelope));
  delete e.payload.segment_state.challenges.journey;
  expect(projectJourneyTimer(readPublicRound(e).segmentState, 0, Date.parse(s.at))).toBeNull();
});

describe("JOURNEY5 — the final reveal window (derived from real J4 captures)", () => {
  it("Standard: the pool's frozen remainder, PAUSED, and it does not move", async () => {
    const { pantheonStandardFinalWindow } = await import("@/lib/journey/__fixtures__/j5/finalWindow");
    const s = pantheonStandardFinalWindow("correct");
    const seg = readPublicRound(s.envelope).segmentState;
    expect(isJourneyFinalReveal(seg)).toBe(true);
    const t0 = projectJourneyTimer(seg, 0, Date.parse(s.at));
    expect(t0).toMatchObject({ durationSeconds: 150, remainingSeconds: 110, paused: true, urgent: false });
    expect(projectJourneyTimer(seg, 0, Date.parse(s.at) + 1_500)!.remainingSeconds).toBe(110);
  });

  it("Survival: no child clock is left to show, so there is none (and the round's is not used)", async () => {
    const { pantheonSurvivalFinalChild } = await import("@/lib/journey/__fixtures__/j5/finalWindow");
    const s = pantheonSurvivalFinalChild();
    const seg = readPublicRound(s.envelope).segmentState;
    expect(isJourneyFinalReveal(seg)).toBe(true);
    expect(projectJourneyTimer(seg, 0, Date.parse(s.at))).toBeNull();
  });

  it("exhaustion is not a final reveal (no revealing index): 0, not paused — unchanged", () => {
    const { round } = at("voli.standard.exhaust", "child1-timeout");
    expect(isJourneyFinalReveal(round.segmentState)).toBe(false);
  });
});
