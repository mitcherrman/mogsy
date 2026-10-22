/**
 * Daily V2 lane D — one contract probe per reusable mode.
 *
 * Every probe reads a wire payload through the SHARED readers
 * (`readPublicRound` / `readPrivatePlayer` / `readMatchReview`) and resolves
 * its renderer through `rendererForDailyV2Segment`, then asserts IDENTITY with
 * the renderer object the Ranked registry already exports. Identity is the
 * no-clone proof: a Daily V2 copy of a mode would be a different object.
 *
 * Inputs are fixture-level only: committed REAL backend captures where they
 * exist (Order Forge v2, the Daily Survival Journey), the shared fixture
 * builders otherwise. No network, no backend, no stored state.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getModuleRenderer, masterySliceModule, metaReflexModule, orderForgeModule, quizModule,
  rendererForSegment,
} from "@/lib/ranked-core/modules/registry";
import {
  readMatchReview, readPrivatePlayer, readPublicRound,
} from "@/lib/ranked-public/contracts";
import ofCapture from "@/lib/ranked-public/__fixtures__/orderForgeServerCapture.json";
import {
  metaReflexCards, metaReflexSegmentMeta, metaReflexState, publicRoundV2, settledCardReveal,
} from "@/lib/ranked-public/fixtures";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import {
  DAILY_V2_MODE_BINDINGS, dailyV2BindingFor, rendererForDailyV2Segment,
} from "./modeReuse";

describe("Daily V2 mode bindings", () => {
  it("every servable binding resolves to a renderer the registry already owns", () => {
    for (const b of Object.values(DAILY_V2_MODE_BINDINGS)) {
      if (b.readiness === "not_servable") continue;
      const r = rendererForDailyV2Segment(b.moduleId, b.moduleVersion);
      expect(r, b.mode).not.toBeNull();
      expect(r).toBe(getModuleRenderer(b.moduleId, b.moduleVersion!));
    }
  });

  it("fails closed outside the Daily V2 set: admin playtest modules, other versions, stat_drop", () => {
    for (const [id, v] of [
      ["reconstruct", 1], ["match", 1], ["assembly", 1], ["scrub", 1],
      ["item_cost_duel", 3], ["item_cost_duel", 4], ["order_forge", 1], ["mastery_slice", 1],
      ["stat_drop", 1], ["mig_lab.stat_drop", 1], ["", 2],
    ] as const) {
      expect(rendererForDailyV2Segment(id, v), `${id}@${v}`).toBeNull();
    }
    expect(rendererForDailyV2Segment(null, 2)).toBeNull();
    expect(rendererForDailyV2Segment("quiz", undefined)).toBeNull();
    // No graded Stat Drop module is registered at all — the matrix's premise.
    expect(getModuleRenderer("stat_drop", 1)).toBeNull();
  });
});

describe("probe · quiz.v2 (standalone MCQ)", () => {
  it("binds to the existing quiz renderer", () => {
    expect(rendererForDailyV2Segment("quiz", 2)).toBe(quizModule);
  });

  it("a quiz round's wire segment reaches the same renderer through the shared reader", () => {
    const body = publicRoundV2();
    (body.payload as Record<string, unknown>).segment = {
      module_id: "quiz", module_version: 2, challenge_count: 1, challenge_index: 0,
      segment_number: 1, phase: null, ability_deadline: null, challenge_started_at: null,
      challenge_deadline: null, pressure_applied: false, resolved: false,
    };
    const view = readPublicRound(body);
    expect(view.segment.moduleVersion).toBe(2);
    expect(rendererForSegment(view.segment)).toBe(quizModule);
    expect(rendererForDailyV2Segment(view.segment.moduleId, view.segment.moduleVersion)).toBe(quizModule);
    // The question projection is the existing one; no answer is on the public round.
    expect(quizModule.projectQuestion(view)?.prompt).toBe("Which item grants Immolate?");
  });

  it("a two-option round (Daily three acts, pass 5) projects exactly its two options", () => {
    const body = publicRoundV2();
    const payload = body.payload as Record<string, unknown>;
    payload.question = {
      question_id: "q2", prompt: "At rank 1, which cooldown is shorter?",
      options: ["Ahri Q", "Annie Q"], category: "abilities" };
    const question = quizModule.projectQuestion(readPublicRound(body));
    expect(question?.options.map((o) => o.label)).toEqual(["Ahri Q", "Annie Q"]);
    expect(question?.options.map((o) => o.id)).toEqual(["0", "1"]);
  });
});

describe("probe · item_cost_duel.v5 (Meta Reflex, 3-card sprint)", () => {
  const THREE = metaReflexCards().slice(0, 3);
  const state = (index: number) => ({
    ...metaReflexState(index, {
      module_version: 5, challenge_count: 3,
      own_submitted_choices: [0, 1, 2].map((i) => (i < index ? { card_id: `c${i}:left` } : null)),
      own_finished: index >= 3,
      own_card_index: index < 3 ? index : null,
      own_timed_out_challenges: [false, false, false],
      challenges: { prompt: "Meta Reflex", challenge_count: 3, challenges: THREE },
      own_card_reveals: Array.from({ length: index }, (_, i) => settledCardReveal(i)),
    }),
  });
  const parse = (index: number) => {
    const body = publicRoundV2();
    const p = body.payload as Record<string, unknown>;
    p.segment = metaReflexSegmentMeta({
      module_version: 5, challenge_count: 3, timed_out_challenges: [false, false, false],
    });
    p.segment_state = state(index);
    return readPublicRound(body);
  };

  it("a 3-card v5 block reads under the meta_reflex contract and binds to the existing renderer", () => {
    const view = parse(1);
    const seg = view.segmentState!;
    expect(seg.moduleVersion).toBe(5);
    expect(seg.challengeCount).toBe(3);
    expect(seg.block?.contract).toBe("meta_reflex");
    expect(seg.block?.contract === "meta_reflex" && seg.block.cards).toHaveLength(3);
    expect(rendererForSegment(view.segment)).toBe(metaReflexModule);
    expect(rendererForDailyV2Segment(seg.moduleId, seg.moduleVersion)).toBe(metaReflexModule);
  });

  it("settled cards carry the server's formatted values; the live card carries none", () => {
    const seg = parse(2).segmentState!;
    expect(seg.ownCardReveals.map((r) => r.challengeIndex)).toEqual([0, 1]);
    expect(seg.ownCardReveals[0].left.valueDisplay).toBe("3,450 gold");
    expect(seg.ownCardReveals[0].outcome).toBe("correct");
    // The pre-reveal walk still refuses a value on a live card.
    const body = publicRoundV2();
    const p = body.payload as Record<string, unknown>;
    p.segment = metaReflexSegmentMeta({ module_version: 5, challenge_count: 3 });
    const leaked = state(0);
    (leaked.challenges.challenges[0] as Record<string, unknown>).left_value = 3450;
    p.segment_state = leaked;
    expect(() => readPublicRound(body)).toThrow(/hidden field: left_value/);
  });
});

describe("probe · order_forge.v2 (exact order) — real server capture", () => {
  const priv = (k: keyof typeof ofCapture) => readPrivatePlayer(ofCapture[k]);

  it("the captured v2 segment binds to the existing Order Forge renderer", () => {
    expect(ofCapture.meta.module_version).toBe(2);
    const view = priv("private_open");
    const seg = view.segmentState!;
    expect([seg.moduleId, seg.moduleVersion, seg.challengeCount]).toEqual(["order_forge", 2, 1]);
    expect(seg.block?.contract).toBe("order_forge");
    expect(rendererForSegment(view.segment)).toBe(orderForgeModule);
    expect(rendererForDailyV2Segment(seg.moduleId, seg.moduleVersion)).toBe(orderForgeModule);
    // Server-owned window: the challenge clock is two server instants.
    expect(seg.challengeStartedAt).not.toBeNull();
    expect(seg.challengeDeadline).not.toBeNull();
  });

  it("grading is ONE exact sequence, stated by the server after the lock", () => {
    const seg = priv("private_locked").segmentState!;
    const forge = seg.ownChallengeReveals[0]?.orderForge;
    expect(forge?.order).toEqual(ofCapture.meta.submitted_order_segment_1);
    expect(forge?.canonicalOrder).toEqual(ofCapture.meta.canonical_order_segment_1);
    expect(forge?.isCorrect).toBe(false);
  });

  it("the review round is self-contained, and carries NO canonical question ref today", () => {
    const review = readMatchReview(ofCapture.review);
    const round = review.rounds.find((r) => r.kind === "order_forge")!;
    expect(round.moduleId).toBe("order_forge");
    expect(round.orderForge?.canonicalOrder).toEqual(ofCapture.meta.canonical_order_segment_1);
    expect(round.orderForge?.outcome).toBe("incorrect");
    // Matrix gap R-OF-2: Review/History cannot key this answer to a durable ref.
    expect(round.canonicalQuestionRef).toBeNull();
  });
});

describe("probe · mastery_slice.v2 (Journey) — real Daily captures", () => {
  const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__/jp5");
  const load = (name: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8"));
  const seg = (name: string, label: string) => {
    const snap = load(name).find((s) => s.label === label);
    if (!snap) throw new Error(`${name}: ${label}`);
    const view = readPublicRound(snap.envelope);
    return { view, state: view.segmentState! };
  };

  it("the Daily SURVIVAL Journey is a served 3-child v2 slice on the existing renderer", () => {
    const { view, state } = seg("ahri.survival", "child0-open");
    expect([state.moduleId, state.moduleVersion, state.challengeCount]).toEqual(["mastery_slice", 2, 3]);
    expect(state.journey?.childCount).toBe(3);
    expect(state.journey?.plan).toBe("survival");
    expect(rendererForSegment(view.segment)).toBe(masterySliceModule);
    expect(rendererForDailyV2Segment(state.moduleId, state.moduleVersion)).toBe(masterySliceModule);
  });

  it("its timer contract is ONE per-child card timer for the segment (not per-child E/M/H)", () => {
    const { state } = seg("ahri.survival", "child0-open");
    expect(state.cardTimerMs).toBe(30000);
    expect(state.activeTimeMs ?? null).toBeNull();
  });

  it("the Daily STANDARD Journey is 5 children on a pooled clock — not a 3-slot set", () => {
    const { state } = seg("voli.standard", "child0-open");
    expect(state.challengeCount).toBe(5);
    expect(state.journey?.childCount).toBe(5);
    expect(state.activeTimeMs).toBe(150000);
    expect(state.cardTimerMs).toBeNull();
  });

  it("answered children are revealed by the server, one row per child", () => {
    const { state } = seg("ahri.survival", "child1-open");
    expect(state.ownChallengeReveals.map((r) => r.challengeIndex)).toEqual([0]);
    expect(typeof state.ownChallengeReveals[0].isCorrect).toBe("boolean");
  });
});

describe("probe · stat_drop (primitive only)", () => {
  it("is documented as not servable and resolves to nothing", () => {
    expect(DAILY_V2_MODE_BINDINGS.stat_drop.readiness).toBe("not_servable");
    expect(DAILY_V2_MODE_BINDINGS.stat_drop.moduleId).toBeNull();
    expect(dailyV2BindingFor("stat_drop", 1)).toBeNull();
  });
});
