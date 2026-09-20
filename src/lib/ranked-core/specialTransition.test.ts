/**
 * RFX1 Phase 2B3 — the MEDIUM presentation beats, as arithmetic and rules.
 *
 * The controller-level behaviour is in `QuizRankedMatch.rfx1b3.test.tsx`;
 * this file pins the contract the two sides of the wire share.
 */
import { describe, expect, it } from "vitest";

import {
  MODULE_TITLE_END_MARGIN_MS, RANKED_PRESENTATION_CLASS,
  PRESENTATION_HEADROOM_MS, RESOLVE_DISCOVERY_MS,
  SPECIAL_TRANSITION_VISIBLE_MS, resolveSpecialTransition,
  specialTransitionBudgetMs, specialTransitionWindowMs,
} from "./pacing";
import { projectSpecialTransition } from "./flow/rankedFlow";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";

const MR_ID = "item_cost_duel";
const MR_MIN = 4;

/** A parsed public round with the scoring/segment facts a test needs. */
function round(over: {
  moduleNumber?: number; matchLength?: number | null;
  moduleId?: string; moduleVersion?: number;
}): PublicRoundView {
  const env = publicRoundV2();
  const p = env.payload as Record<string, unknown>;
  p.scoring = {
    model: "points", match_length: over.matchLength === undefined ? 10 : over.matchLength,
    module_number: over.moduleNumber ?? 1, modules_completed: 0,
  };
  // The v2 fixture is a legacy quiz round with no `segment` block at all,
  // which `readSegment` resolves to `quiz` v1 — so one is supplied here only
  // when the test is about the module.
  if (over.moduleId !== undefined || over.moduleVersion !== undefined) {
    p.segment = {
      module_id: over.moduleId ?? "quiz",
      module_version: over.moduleVersion ?? 1,
      challenge_count: 5, challenge_index: 0, segment_number: over.moduleNumber ?? 1,
      phase: "challenges",
    };
  }
  return readPublicRound(env);
}

describe("RFX1 2B3 — the presentation hierarchy is declared, not implied", () => {
  it("places every Ranked beat in exactly one class", () => {
    expect(RANKED_PRESENTATION_CLASS).toEqual({
      "entry-intro": "major",
      "match-outro": "major",
      "final-round": "medium",
      "meta-reflex-entry": "medium",
      "module-title": "minor",
    });
  });

  it("gives each medium beat the duration the owner asked for", () => {
    // 1200-1500, lower end where it fits.
    expect(SPECIAL_TRANSITION_VISIBLE_MS["final-round"]).toBe(1300);
    // "a good amount" longer than the old 720 ms flash.
    expect(SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"]).toBe(1800);
    expect(SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"]).toBeGreaterThan(720 * 2);
  });

  it("budgets the cutoff margin ON TOP, so the visible number is the promise", () => {
    for (const kind of ["final-round", "meta-reflex-entry"] as const) {
      expect(specialTransitionBudgetMs(SPECIAL_TRANSITION_VISIBLE_MS[kind]))
        .toBe(SPECIAL_TRANSITION_VISIBLE_MS[kind] + MODULE_TITLE_END_MARGIN_MS);
    }
    // A final round that is ALSO a Meta Reflex block is budgeted from its
    // RESOLVED duration, not from its kind — sizing it from `final-round`
    // would hand it the shorter clock and cancel the beat.
    const both = resolveSpecialTransition({ finalRound: true, metaReflexEntry: true })!;
    expect(specialTransitionBudgetMs(both.visibleMs))
      .toBe(SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"]
        + MODULE_TITLE_END_MARGIN_MS);
  });

  it("carries the poll's latency and real headroom in the SERVER's budget", () => {
    // A medium beat is all-or-nothing, so an exact fit is a beat that
    // vanishes under jitter. Both terms are the server's to spend.
    // The poll interval PLUS a round trip: a browser run showed the reveal
    // starting 1798 ms after the server resolved, not 1500.
    expect(RESOLVE_DISCOVERY_MS).toBe(1900);
    expect(PRESENTATION_HEADROOM_MS).toBeGreaterThanOrEqual(200);
  });
});

describe("RFX1 2B3 — which beat a round is owed", () => {
  it("detects the final round from the MATCH CONTRACT, never a constant", () => {
    expect(projectSpecialTransition({
      presented: round({ moduleNumber: 10, matchLength: 10 }),
      metaReflexModuleId: MR_ID, metaReflexMinVersion: MR_MIN,
    })).toEqual({ kind: "final-round", visibleMs: 1300 });
    // Nine of ten is not the final round, and a SEVEN-module format's round 7
    // is — neither of which a hardcoded 10 could get right.
    expect(projectSpecialTransition({
      presented: round({ moduleNumber: 9, matchLength: 10 }),
      metaReflexModuleId: MR_ID, metaReflexMinVersion: MR_MIN,
    })).toBeNull();
    expect(projectSpecialTransition({
      presented: round({ moduleNumber: 7, matchLength: 7 }),
      metaReflexModuleId: MR_ID, metaReflexMinVersion: MR_MIN,
    })).toEqual({ kind: "final-round", visibleMs: 1300 });
  });

  it("owes no final warning to a match that cannot say its length", () => {
    // An hp match, and any deployment predating RP1. Honest, not a guess.
    expect(projectSpecialTransition({
      presented: round({ moduleNumber: 10, matchLength: null }),
      metaReflexModuleId: MR_ID, metaReflexMinVersion: MR_MIN,
    })).toBeNull();
  });

  it("detects Meta Reflex by id AND version", () => {
    expect(projectSpecialTransition({
      presented: round({ moduleNumber: 4, moduleId: MR_ID, moduleVersion: 5 }),
      metaReflexModuleId: MR_ID, metaReflexMinVersion: MR_MIN,
    })).toEqual({ kind: "meta-reflex-entry", visibleMs: 1800 });
    // v1-v3 share the id but are the legacy five-pair Item Cost Duel, an
    // ordinary round owed no mode-shift beat.
    expect(projectSpecialTransition({
      presented: round({ moduleNumber: 4, moduleId: MR_ID, moduleVersion: 3 }),
      metaReflexModuleId: MR_ID, metaReflexMinVersion: MR_MIN,
    })).toBeNull();
  });

  it("owes an ordinary round nothing at all", () => {
    expect(projectSpecialTransition({
      presented: round({ moduleNumber: 3, matchLength: 10 }),
      metaReflexModuleId: MR_ID, metaReflexMinVersion: MR_MIN,
    })).toBeNull();
    expect(projectSpecialTransition({
      presented: null, metaReflexModuleId: MR_ID, metaReflexMinVersion: MR_MIN,
    })).toBeNull();
  });
});

describe("RFX1 2B3 — final round AND Meta Reflex is ONE beat", () => {
  it("says FINAL ROUND but keeps the Meta Reflex clock", () => {
    const both = resolveSpecialTransition({ finalRound: true, metaReflexEntry: true });
    // The higher-stakes word…
    expect(both!.kind).toBe("final-round");
    // …on the more generous clock, because the mode shift is still happening.
    expect(both!.visibleMs).toBe(SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"]);
    // And ONE beat, never the two lengths back to back.
    expect(both!.visibleMs).toBeLessThan(
      SPECIAL_TRANSITION_VISIBLE_MS["final-round"]
      + SPECIAL_TRANSITION_VISIBLE_MS["meta-reflex-entry"]);
  });

  it("is reached through the round projector too", () => {
    expect(projectSpecialTransition({
      presented: round({
        moduleNumber: 10, matchLength: 10, moduleId: MR_ID, moduleVersion: 5 }),
      metaReflexModuleId: MR_ID, metaReflexMinVersion: MR_MIN,
    })).toEqual({ kind: "final-round", visibleMs: 1800 });
  });

  it("is deterministic — the same inputs always give the same answer", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(resolveSpecialTransition({ finalRound: true, metaReflexEntry: true }))
        .toEqual({ kind: "final-round", visibleMs: 1800 });
    }
  });
});

describe("RFX1 2B3 — the window is all-or-nothing, and that is the replay rule", () => {
  it("plays at LEAST the promise, and absorbs whatever the poll left over", () => {
    // Exactly enough: the floor.
    expect(specialTransitionWindowMs(1300 + MODULE_TITLE_END_MARGIN_MS, 1300))
      .toBe(1300);
    // Room to spare: the beat takes it, rather than finishing early and
    // leaving dead air before the round starts. Same rule as the intro.
    expect(specialTransitionWindowMs(5000, 1800))
      .toBe(5000 - MODULE_TITLE_END_MARGIN_MS);
    expect(specialTransitionWindowMs(5000, 1800)).toBeGreaterThan(1800);
  });

  it("plays NOTHING rather than a flash when it does not", () => {
    // A 300 ms FINAL ROUND is worse than no warning at all.
    expect(specialTransitionWindowMs(1300 + MODULE_TITLE_END_MARGIN_MS - 1, 1300)).toBe(0);
    expect(specialTransitionWindowMs(500, 1800)).toBe(0);
  });

  it("is 0 for a round the client is already in — reconnect, refresh, late poll", () => {
    expect(specialTransitionWindowMs(0, 1300)).toBe(0);
    expect(specialTransitionWindowMs(-4000, 1800)).toBe(0);
    expect(specialTransitionWindowMs(null, 1300)).toBe(0);
    expect(specialTransitionWindowMs(Number.NaN, 1300)).toBe(0);
  });

  it("leaves the cutoff margin, so the beat ends BEFORE started_at", () => {
    for (const room of [1450, 2000, 4000]) {
      expect(room - specialTransitionWindowMs(room, 1300))
        .toBe(MODULE_TITLE_END_MARGIN_MS);
    }
  });
});
