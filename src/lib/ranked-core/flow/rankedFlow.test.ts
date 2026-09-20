import { describe, expect, it } from "vitest";
import {
  cardEventId, projectPresentationPhase, projectResultFeedback, resultEventId, upcomingRound,
} from "./rankedFlow";
import {
  anchoredRevealHoldMs, ENTRY_INTRO_MAX_MS, ENTRY_INTRO_MIN_MS, ENTRY_MIN_LEAD_MS,
  entryIntroDurationMs, entryIntroExitMs, entryIntroHolding,
  MODULE_TITLE_END_MARGIN_MS, moduleTitleWindowMs,
  REVEAL_HOLD_MIN_MS, REVEAL_HOLD_MS,
} from "@/lib/ranked-core/pacing";
import { MODULE_TITLE_MS } from "@/lib/ranked-core/centralStage";
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

describe("RFX1 2B1 — the presentation cutoff", () => {
  const at = (msUntilStart: number, cutoffMarginMs?: number) => projectPresentationPhase({
    revealing: false, locked: false, skewMs: 0, nowMs: 0,
    presentedStartedAt: new Date(msUntilStart).toISOString(),
    ...(cutoffMarginMs === undefined ? {} : { cutoffMarginMs }),
  });

  it("leaves module-intro a margin BEFORE started_at, never at it", () => {
    expect(at(2000)).toBe("module-intro");
    expect(at(MODULE_TITLE_END_MARGIN_MS + 1)).toBe("module-intro");
    // At the margin, and from there to the start itself, the arena is already
    // the live question.
    expect(at(MODULE_TITLE_END_MARGIN_MS)).toBe("answering");
    expect(at(1)).toBe("answering");
    expect(at(0)).toBe("answering");
    expect(at(-500)).toBe("answering");
  });

  it("caps the module title by the same boundary", () => {
    // A full lead-in: the nominal beat.
    expect(moduleTitleWindowMs(2900, MODULE_TITLE_MS)).toBe(MODULE_TITLE_MS);
    // A swap that waited: the title shortens instead of outliving the start.
    expect(moduleTitleWindowMs(1000, MODULE_TITLE_MS)).toBe(1000 - MODULE_TITLE_END_MARGIN_MS);
    // Already answerable: no intro face at all.
    expect(moduleTitleWindowMs(100, MODULE_TITLE_MS)).toBe(0);
    expect(moduleTitleWindowMs(0, MODULE_TITLE_MS)).toBe(0);
    expect(moduleTitleWindowMs(-1000, MODULE_TITLE_MS)).toBe(0);
    // No next round to anchor to: unchanged.
    expect(moduleTitleWindowMs(null, MODULE_TITLE_MS)).toBe(MODULE_TITLE_MS);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* RFX1 2B2/2B3 — the entry presentation contract (the arithmetic; the        */
/* controller-level behaviour is in QuizRankedMatch.rfx1b2/b3.test.tsx).      */
/* ────────────────────────────────────────────────────────────────────────── */

describe("RFX1 2B3 — the entry presentation contract", () => {
  // A generous lead: the client arrived with plenty of the server's window
  // still ahead of it.
  const paint = 1_000_000;
  const start = (leadFromPaint: number) => paint + leadFromPaint;

  it("gives the intro its deliberate beat when the lead-in allows it", () => {
    // The floor's own lead: exactly the minimum plus the locked preview.
    const s = start(ENTRY_INTRO_MIN_MS + ENTRY_MIN_LEAD_MS);
    expect(entryIntroDurationMs(s, paint)).toBe(ENTRY_INTRO_MIN_MS);
    expect(entryIntroExitMs(s, paint)).toBe(s - ENTRY_MIN_LEAD_MS);
  });

  it("caps the intro and hands the slack to the locked preview", () => {
    // Twice the budget. Without a ceiling the whole surplus would land on the
    // card and a fast desktop would get a visibly longer intro than a phone.
    const s = start(2 * (ENTRY_INTRO_MIN_MS + ENTRY_MIN_LEAD_MS));
    expect(entryIntroDurationMs(s, paint)).toBe(ENTRY_INTRO_MAX_MS);
    // Everything above the ceiling is locked, prepared question on screen.
    expect(s - entryIntroExitMs(s, paint)!).toBeGreaterThan(ENTRY_MIN_LEAD_MS);
  });

  it("NEVER reaches past the server's locked-preview margin", () => {
    // A short lead — a staff match, a bot match seen late, a reload. The
    // ceiling clips and the minimum does not fight it: server timing wins.
    const s = start(900);
    expect(entryIntroExitMs(s, paint)).toBe(s - ENTRY_MIN_LEAD_MS);
    expect(entryIntroDurationMs(s, paint)).toBeLessThan(ENTRY_INTRO_MIN_MS);
    // Spent entirely: no card at all rather than a card over a live question.
    expect(entryIntroDurationMs(start(0), paint)).toBe(0);
    expect(entryIntroDurationMs(start(-5000), paint)).toBe(0);
  });

  it("holds until the exit instant and not one ms past it", () => {
    const s = start(ENTRY_INTRO_MIN_MS + ENTRY_MIN_LEAD_MS);
    const exit = entryIntroExitMs(s, paint)!;
    expect(entryIntroHolding(s, paint, exit - 1)).toBe(true);
    expect(entryIntroHolding(s, paint, exit)).toBe(false);
    expect(entryIntroHolding(s, paint, exit + 1)).toBe(false);
  });

  it("treats an unresolved match as an intro state, not as a finished one", () => {
    // No round yet IS "match resolving"; the latch in `useEntryIntro` is what
    // keeps this from reading the same way mid-match.
    expect(entryIntroHolding(null, paint, paint)).toBe(true);
    // A start that cannot be parsed proves no window, so none is held open.
    expect(entryIntroHolding(Number.NaN, paint, paint)).toBe(false);
    expect(entryIntroExitMs(Number.NaN, paint)).toBeNull();
    expect(entryIntroExitMs(null, paint)).toBeNull();
  });

  it("leaves the arena ANSWERABLE before it, not at it", () => {
    // The two margins are ordered: the intro is gone (700 ms) strictly before
    // the module title's own cutoff (150 ms), which is itself before the
    // start. Nothing presentational may outlive the instant.
    expect(ENTRY_MIN_LEAD_MS).toBeGreaterThan(MODULE_TITLE_END_MARGIN_MS);
  });
});
