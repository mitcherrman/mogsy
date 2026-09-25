/**
 * JOURNEY-UI3 — the Journey clock (`projectJourneyTimer`) on REAL J3 captures.
 *
 * Standard's module 10 pools 150 s of ACTIVE answer time. The server owns it:
 * `active_time_remaining_ms` is what is left now, `active_time_running` says
 * whether a card is open, and `own_card_deadline` is the open card's (or the
 * next card's) open + remainder. The projection renders those — it pauses
 * nothing, and it never reads the round's projected block deadline.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { projectJourneyTimer, projectTimer } from "./rankedViews";

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

describe("Standard: one pooled 150 s clock, server-authoritative", () => {
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
