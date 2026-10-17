/**
 * MISC W2D (F12) — TIME'S UP sounds only for a SERVER-settled timeout.
 *
 * Synthetic settlements for the round-level and Meta Reflex paths, and REAL
 * Journey captures (a pooled Standard budget exhausting mid-card, and a
 * per-child timeout in a reference Journey) replayed snapshot by snapshot
 * through the hook's own observation builder.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { readPublicRound, readSegmentSettlement } from "@/lib/ranked-public/contracts";
import {
  observeRankedSfx, rankedSfxObservation, segmentSettledTimedOut,
  type RankedSfxObservation, type RankedSfxWatch,
} from "./useRankedMatchSfx";

const base = (over: Partial<RankedSfxObservation> = {}): RankedSfxObservation => ({
  matchId: "m1", moduleKey: "quiz.1#1", roundKey: "quiz.1#1",
  ownSubmitted: false, opponentSubmitted: false,
  metaKey: null, metaOpponentCompleted: 0, metaOwnFinished: false, metaOwnReveals: [],
  settlementRound: null, settlementLive: false, ownSettlementOutcome: null, ownAward: null,
  terminal: false, terminalResult: null, outcomeMoment: false,
  ...over,
});

const events = (r: { emissions: { event: string; eventId: string }[] }) =>
  r.emissions.map((e) => `${e.event}@${e.eventId}`);

describe("round settlements", () => {
  it("the viewer's own server `timed_out` sounds TIME'S UP once, as that round's one verdict", () => {
    const start = observeRankedSfx(null, base());
    const settled = observeRankedSfx(start.watch, base({
      settlementRound: 4, settlementLive: true, ownSettlementOutcome: "timed_out",
      ownAward: { pointsAwarded: 0, speedBonusPoints: 0 },
    }));
    expect(events(settled)).toEqual(["quiz.answer.timeout@ranked:m1:round:4:result"]);
    expect(observeRankedSfx(settled.watch, base({
      settlementRound: 4, settlementLive: true, ownSettlementOutcome: "timed_out",
    })).emissions).toEqual([]);
  });

  it("an answer accepted at the last instant settles as an answer: no TIME'S UP", () => {
    const start = observeRankedSfx(null, base());
    // Submitted at 0.2 s left; the POST is still in flight when the local clock reads 0.
    const inFlight = observeRankedSfx(start.watch, base({ ownSubmitted: true }));
    expect(inFlight.emissions).toEqual([]);
    const settled = observeRankedSfx(inFlight.watch, base({
      ownSubmitted: true, settlementRound: 4, settlementLive: true, ownSettlementOutcome: "incorrect",
    }));
    expect(events(settled)).toEqual(["ranked.answer.incorrect@ranked:m1:round:4:result"]);
  });

  it("a reconnect/history mount onto a timed-out round is a baseline, not a cue", () => {
    const resumed = observeRankedSfx(null, base({
      settlementRound: 4, settlementLive: true, ownSettlementOutcome: "timed_out",
    }));
    expect(resumed.emissions).toEqual([]);
  });

  it("a timeout settled outside the live reveal (an old settlement re-read) is silent", () => {
    const start = observeRankedSfx(null, base());
    expect(observeRankedSfx(start.watch, base({
      settlementRound: 4, settlementLive: false, ownSettlementOutcome: "timed_out",
    })).emissions).toEqual([]);
  });
});

describe("Meta Reflex cards", () => {
  const meta = (reveals: RankedSfxObservation["metaOwnReveals"]) => base({
    metaKey: "item_cost_duel.4#3", metaOwnReveals: reveals,
  });
  it("a card the server settled as `timeout` is TIME'S UP; `unanswered` stays silent", () => {
    const start = observeRankedSfx(null, meta([]));
    const timedOut = observeRankedSfx(start.watch, meta([{ challengeIndex: 0, outcome: "timeout" }]));
    expect(events(timedOut)).toEqual([
      "quiz.answer.timeout@ranked:m1:segment:item_cost_duel.4#3:card:0:result",
    ]);
    expect(observeRankedSfx(timedOut.watch, meta([
      { challengeIndex: 0, outcome: "timeout" }, { challengeIndex: 1, outcome: "unanswered" },
    ])).emissions).toEqual([]);
  });
});

// ── Real Journey captures ────────────────────────────────────────────────
const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const capture = (path: string): CaptureSnapshot[] =>
  JSON.parse(readFileSync(join(FIX, path), "utf8")) as CaptureSnapshot[];

function replay(snapshots: CaptureSnapshot[]) {
  let watch: RankedSfxWatch | null = null;
  const heard: string[] = [];
  for (const s of snapshots) {
    const round = readPublicRound(s.envelope);
    const observation = rankedSfxObservation({
      matchId: "m1", viewerUserId: "viewer", publicRound: round, surfaceRound: round,
      lastResolved: null, lastSegmentRoundNumber: null, revealHold: false, result: null,
      outcomeMoment: false,
    });
    if (!observation) continue;
    const next = observeRankedSfx(watch, observation);
    watch = next.watch;
    for (const e of next.emissions) heard.push(`${s.label} ${e.event}@${e.eventId.replace(/^ranked:m1:/, "")}`);
  }
  return heard;
}

describe("real captures — Journey timeouts come from `own_timed_out_challenges`", () => {
  it("pooled Standard: the budget runs out mid-card — ONE TIME'S UP for that child, no wrong-answer cue", () => {
    const heard = replay(capture("j4/voli.standard.exhaust.json"));
    const timeouts = heard.filter((h) => h.includes("quiz.answer.timeout"));
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]).toMatch(/^child1-timeout quiz\.answer\.timeout@segment:mastery_slice\.\d+#\d+:child:1:result$/);
    expect(heard.some((h) => h.includes("child:1") && h.includes("ranked.answer.incorrect"))).toBe(false);
    // The earlier, answered child keeps its ordinary verdict.
    expect(heard.some((h) => h.includes("child:0:result") && h.includes("ranked.answer.correct"))).toBe(true);
  });

  it("per-child reference timeout: the expired child's reveal is TIME'S UP (was: incorrect), heard once through reconnects", () => {
    const heard = replay(capture("jref/zed_ahri.reference.timeout.json"));
    const child3 = heard.filter((h) => h.includes("child:3"));
    expect(child3).toHaveLength(1);
    expect(child3[0]).toMatch(/^child3-timeout-reveal quiz\.answer\.timeout@/);
    expect(heard.filter((h) => h.includes("ranked.answer.correct"))).toHaveLength(3);
  });

  it("resuming ONTO the timed-out snapshot replays nothing", () => {
    const snaps = capture("jref/zed_ahri.reference.timeout.json");
    const from = snaps.findIndex((s) => s.label === "child3-timeout-reveal");
    expect(replay(snaps.slice(from))).toEqual([]);
  });
});

// ── One-lock segment modules: the settlement's per-player `segment_result` ──
const SERVER = resolve(process.cwd(), "src/lib/ranked-public/__fixtures__");
const VIEWER = "0a11d111-0000-4000-8000-000000000001";
const settled = (file: string, key: string) => {
  const capture = JSON.parse(readFileSync(join(SERVER, `${file}.json`), "utf8")) as
    Record<string, { payload: unknown; round_number: number }>;
  return { settlement: readSegmentSettlement(capture[key].payload), round: capture[key].round_number };
};

describe("real server captures — one-lock segments (Order Forge, Reconstruct, Assembly)", () => {
  it.each([
    "orderForgeServerCapture", "reconstructServerCapture",
    "assemblyRosterLockServerCapture", "assemblyDraftMemoryServerCapture",
  ])("%s: only the viewer's server `timeout` reads as timed out", (file) => {
    const timeout = settled(file, "resolved_timeout");
    expect(segmentSettledTimedOut(timeout.settlement, timeout.round, timeout.round, VIEWER)).toBe(true);
    for (const key of ["resolved_correct", "resolved_incorrect"]) {
      const s = settled(file, key);
      expect(segmentSettledTimedOut(s.settlement, s.round, s.round, VIEWER)).toBe(false);
    }
    // The OPPONENT's view of the same settlement is not a timeout for them.
    const opponent = Object.keys(timeout.settlement!.reveal.players).find((id) => id !== VIEWER)!;
    expect(segmentSettledTimedOut(timeout.settlement, timeout.round, timeout.round, opponent)).toBe(false);
    // A settlement for another round is not this round's verdict.
    expect(segmentSettledTimedOut(timeout.settlement, timeout.round, timeout.round + 1, VIEWER)).toBe(false);
  });

  it("the live settlement sounds TIME'S UP once, as the segment's one cue (no award stacked)", () => {
    const start = observeRankedSfx(null, base());
    const live = observeRankedSfx(start.watch, base({
      settlementRound: 6, settlementLive: true, segmentSettledTimedOut: true,
      ownAward: { pointsAwarded: 1, speedBonusPoints: 0 },
    }));
    expect(events(live)).toEqual(["quiz.answer.timeout@ranked:m1:round:6:result"]);
  });

  it("a Journey or Stat Check segment never doubles its card-level TIME'S UP", () => {
    const timeout = settled("reconstructServerCapture", "resolved_timeout");
    for (const moduleId of ["mastery_slice", "item_cost_duel"]) {
      const disguised = { ...timeout.settlement!, reveal: { ...timeout.settlement!.reveal, moduleId } };
      expect(segmentSettledTimedOut(disguised, timeout.round, timeout.round, VIEWER)).toBe(false);
    }
  });
});
