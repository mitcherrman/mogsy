import { describe, expect, it } from "vitest";
import {
  cardEventId, projectPresentationPhase, projectResultFeedback, resultEventId, upcomingRound,
} from "./rankedFlow";
import { anchoredRevealHoldMs, REVEAL_HOLD_MIN_MS, REVEAL_HOLD_MS } from "@/lib/ranked-core/pacing";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import type { PublicRoundView, SegmentSettlementView } from "@/lib/ranked-public/contracts";

const settlement = (round: number, p1: string, p2: string) => ({
  roundNumber: round,
  players: {
    p1: { playerId: "me", outcome: p1 },
    p2: { playerId: "them", outcome: p2 },
  },
}) as unknown as ResolvedRoundView;

const base = {
  matchId: "m9", viewerId: "me", opponentId: "them",
  segment: null, liveCard: null,
};

describe("projectResultFeedback — one settlement, two cues", () => {
  it("derives BOTH cues from the same settlement, with deterministic ids", () => {
    const fb = projectResultFeedback({ ...base, revealing: true, presentedRoundNumber: 3,
      settlement: settlement(3, "incorrect", "correct") });
    expect(fb.viewer).toEqual({ kind: "round", id: "m9:r3:user", verdict: "incorrect" });
    expect(fb.opponent).toEqual({ kind: "round", id: "m9:r3:opp", verdict: "correct" });
    expect(resultEventId("m9", 3, "user")).toBe("m9:r3:user");
  });

  it("is idempotent: the same inputs always produce the same ids", () => {
    const a = projectResultFeedback({ ...base, revealing: true, presentedRoundNumber: 3,
      settlement: settlement(3, "correct", "timed_out") });
    const b = projectResultFeedback({ ...base, revealing: true, presentedRoundNumber: 3,
      settlement: settlement(3, "correct", "timed_out") });
    expect(a).toEqual(b);
  });

  it("cues nothing when the result is not a LIVE reveal (restored/historical)", () => {
    const fb = projectResultFeedback({ ...base, revealing: false, presentedRoundNumber: 3,
      settlement: settlement(3, "correct", "correct") });
    expect(fb).toEqual({ viewer: null, opponent: null });
  });

  it("cues nothing for a settlement of a round the card is not presenting", () => {
    const fb = projectResultFeedback({ ...base, revealing: true, presentedRoundNumber: 4,
      settlement: settlement(3, "correct", "correct") });
    expect(fb).toEqual({ viewer: null, opponent: null });
  });

  it("uses the BLOCK aggregate for a settled block, never a per-card opponent verdict", () => {
    const segment = {
      settlement: { reveal: { challengeCount: 5, players: {
        me: { correct: 4 }, them: { correct: 3 },
      } } } as unknown as SegmentSettlementView,
      roundNumber: 6,
    };
    const fb = projectResultFeedback({ ...base, revealing: true, presentedRoundNumber: 6,
      settlement: settlement(6, "correct", "incorrect"), segment });
    expect(fb.viewer).toEqual({ kind: "block", id: "m9:r6:user", correct: 4, of: 5 });
    expect(fb.opponent).toEqual({ kind: "block", id: "m9:r6:opp", correct: 3, of: 5 });
  });

  it("gives a live card the viewer's per-card cue and NO opponent cue", () => {
    const fb = projectResultFeedback({ ...base, revealing: false, presentedRoundNumber: 4,
      settlement: null,
      liveCard: { outcome: "incorrect", cardNumber: 2, challengeIndex: 1, roundNumber: 4 } });
    expect(fb.viewer).toEqual({ kind: "card", id: cardEventId("m9", 4, 1), verdict: "incorrect", cardNumber: 2 });
    expect(fb.opponent).toBeNull();
  });
});

describe("projectPresentationPhase", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  it("reveals first, then introduces the next module until its server start", () => {
    expect(projectPresentationPhase({ revealing: true, locked: false,
      presentedStartedAt: "2026-09-19T12:00:02Z", skewMs: 0, nowMs: now })).toBe("revealing");
    expect(projectPresentationPhase({ revealing: false, locked: false,
      presentedStartedAt: "2026-09-19T12:00:02Z", skewMs: 0, nowMs: now })).toBe("module-intro");
    expect(projectPresentationPhase({ revealing: false, locked: false,
      presentedStartedAt: "2026-09-19T11:59:59Z", skewMs: 0, nowMs: now })).toBe("answering");
    expect(projectPresentationPhase({ revealing: false, locked: true,
      presentedStartedAt: "2026-09-19T11:59:59Z", skewMs: 0, nowMs: now })).toBe("waiting");
  });
  it("reads the start in SERVER time via the skew", () => {
    // Server is 3s ahead of the local clock: a start 2s ahead locally has passed.
    expect(projectPresentationPhase({ revealing: false, locked: false,
      presentedStartedAt: "2026-09-19T12:00:02Z", skewMs: 3000, nowMs: now })).toBe("answering");
  });
});

describe("upcomingRound — the Phase 2B seam", () => {
  const round = (n: number) => ({ activeRound: { roundNumber: n } }) as unknown as PublicRoundView;
  it("is the live round only while the card still presents an older one", () => {
    const n1 = round(1); const n2 = round(2);
    expect(upcomingRound(n2, n1)).toBe(n2);
    expect(upcomingRound(n2, n2)).toBeNull();
    expect(upcomingRound(n2, round(2))).toBeNull();
    expect(upcomingRound(null, n1)).toBeNull();
  });
});

describe("anchoredRevealHoldMs — the hold ends by the server's clock", () => {
  it("keeps the nominal hold when the server's window allows it", () => {
    expect(anchoredRevealHoldMs(REVEAL_HOLD_MS, 2900, 1400)).toBe(REVEAL_HOLD_MS);
  });
  it("shortens a late-discovered reveal so the module title keeps its window", () => {
    expect(anchoredRevealHoldMs(REVEAL_HOLD_MS, 2500, 1400)).toBe(1100);
  });
  it("never lengthens, and never drops below the floor that fits both beats", () => {
    expect(anchoredRevealHoldMs(REVEAL_HOLD_MS, 10_000, 1400)).toBe(REVEAL_HOLD_MS);
    expect(anchoredRevealHoldMs(REVEAL_HOLD_MS, 300, 1400)).toBe(REVEAL_HOLD_MIN_MS);
  });
  it("stands at nominal with no next round to anchor to", () => {
    expect(anchoredRevealHoldMs(2600, null, 1400)).toBe(2600);
  });
});
