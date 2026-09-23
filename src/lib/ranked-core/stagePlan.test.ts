/**
 * POST-LAUNCH AUDIT — the round bar must be the stage the server can serve.
 *
 * Production drew TEN round slots over a Daily Standard stage (Champion
 * Fundamentals) that served FOUR questions: the arena passed no total to
 * `projectRoundTimeline`, so the projection fell back to its indefinite
 * nine-slot sliding window and sketched rounds nobody would play. The content
 * was correct — a four-slot curriculum is a four-question stage.
 *
 * The other half of the same bug is the opposite reading: Time Trial and
 * Survival freeze `match_length` as the clean CANDIDATE CEILING (production
 * Survival on Item Fundamentals read `1 / 377`), so that number must never be
 * drawn as a plan or printed as a denominator either.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { plannedRoundTotal } from "@/lib/ranked-core/stagePlan";
import {
  TIMELINE_VISIBLE_NODES, projectRoundTimeline,
} from "@/lib/ranked-core/roundTimeline";
import { moduleProgressLabel } from "@/pages/quiz-ranked/rankedViews";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";

/** Source with comments stripped — a mention in prose is not a call. */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** A points round with a frozen length and (optionally) a ruleset. */
const round = (matchLength: number | null, rulesetId?: string,
               moduleNumber = 1): PublicRoundView => ({
  scoring: { model: "points", matchLength, moduleNumber, modulesCompleted: moduleNumber - 1 },
  ruleset: rulesetId ? { rulesetId } : null,
} as unknown as PublicRoundView);

const timelineFor = (pub: PublicRoundView, roundNumber = 1, completed = 0) =>
  projectRoundTimeline({
    roundNumber, completedRounds: completed, segmentRoundNumber: null,
    settlements: [], viewerSlot: "p1", totalRounds: plannedRoundTotal(pub),
  });

describe("plannedRoundTotal — a plan, or nothing", () => {
  it("is the frozen length for a standard stage", () => {
    expect(plannedRoundTotal(round(4))).toBe(4);
    expect(plannedRoundTotal(round(4, "standard"))).toBe(4);
  });

  it("withholds a rapid-recall CEILING rather than calling it a plan", () => {
    expect(plannedRoundTotal(round(377, "survival"))).toBeNull();
    expect(plannedRoundTotal(round(11, "time_trial"))).toBeNull();
  });

  it("stays null for an hp match, a missing block and a null length", () => {
    expect(plannedRoundTotal(round(null))).toBeNull();
    expect(plannedRoundTotal({ scoring: null } as unknown as PublicRoundView)).toBeNull();
    expect(plannedRoundTotal({
      scoring: { model: "hp", matchLength: null, moduleNumber: 1, modulesCompleted: 0 },
    } as unknown as PublicRoundView)).toBeNull();
    expect(plannedRoundTotal(null)).toBeNull();
  });
});

describe("the displayed total IS the playable stage length", () => {
  it("draws exactly the four rounds a four-slot curriculum serves", () => {
    const view = timelineFor(round(4));
    expect(view.nodes.map((n) => n.roundNumber)).toEqual([1, 2, 3, 4]);
    expect(view.nodes.every((n) => n.visible)).toBe(true);
    expect(view.visibleNodes).toBe(4);
  });

  it("no longer sketches ten slots over that stage — the production bug", () => {
    const nodes = timelineFor(round(4)).nodes.map((n) => n.roundNumber);
    expect(nodes).not.toContain(5);
    expect(nodes).not.toContain(10);
    expect(nodes.length).toBeLessThan(TIMELINE_VISIBLE_NODES);
  });

  it("marks the played rounds and never pads past the plan", () => {
    const view = timelineFor(round(4), 4, 3);
    expect(view.nodes.filter((n) => n.state === "resolved")).toHaveLength(3);
    expect(view.nodes.filter((n) => n.state === "current")).toHaveLength(1);
    // No repeat padding: the strip is the plan, and the plan is four slots.
    expect(view.nodes).toHaveLength(4);
    expect(new Set(view.nodes.map((n) => n.roundNumber)).size).toBe(4);
  });

  it("keeps the indefinite window when the stage has no plan", () => {
    // A ceiling must not become 377 slots: candidate exhaustion is an end
    // condition, not a drawing.
    const view = timelineFor(round(377, "survival"));
    expect(view.visibleNodes).toBe(TIMELINE_VISIBLE_NODES);
    expect(view.nodes.length).toBeLessThanOrEqual(TIMELINE_VISIBLE_NODES + 2);
  });
});

describe("the progress counter says only what the server froze", () => {
  it("counts against the plan on a standard stage", () => {
    expect(moduleProgressLabel(round(4, "standard", 2))).toBe("2 / 4");
  });

  it("drops the denominator on a rapid-recall stage", () => {
    expect(moduleProgressLabel(round(377, "survival", 1))).toBe("1");
    expect(moduleProgressLabel(round(11, "time_trial", 3))).toBe("3");
  });
});

describe("the arena actually tells the strip what the plan is", () => {
  /**
   * The projection has had a finite-plan branch all along; what shipped was
   * an arena that never passed a total, so the branch was unreachable in
   * production and the bug was invisible to every unit test of either side.
   * This guards the WIRE, which is the part that was missing.
   */
  const arena = codeOnly(readFileSync(
    resolve(__dirname, "../../pages/quiz-ranked/QuizRankedMatch.tsx"), "utf8"));

  it("passes the planned total into projectRoundTimeline", () => {
    expect(arena).toContain("totalRounds: plannedRoundTotal(m.publicRound)");
  });

  it("feeds the entry card the plan, never the raw frozen length", () => {
    expect(arena).toContain("matchLength={plannedRoundTotal(m.publicRound)}");
    expect(arena).not.toContain("matchLength={m.publicRound?.scoring?.matchLength");
  });
});

describe("the ruleset the server already publishes is read", () => {
  it("parses ruleset_id off the public round", () => {
    const body = publicRoundV2();
    (body.payload as Record<string, unknown>).ruleset = {
      ruleset_id: "survival", version: 1, max_strikes: 3, strikes: 0,
      time_bank_ms: null, time_bank_remaining_ms: null,
      time_bank_draining: false, questions_settled: 0,
      stage_ended: false, ended_reason: null,
    };
    expect(readPublicRound(body).ruleset?.rulesetId).toBe("survival");
  });

  it("reads an absent or standard block as no ruleset at all", () => {
    expect(readPublicRound(publicRoundV2()).ruleset ?? null).toBeNull();
  });
});
