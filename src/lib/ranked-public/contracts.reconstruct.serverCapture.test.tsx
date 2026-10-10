/**
 * GM1-R1 — Reconstruct against REAL server JSON.
 *
 * `__fixtures__/reconstructServerCapture.json` is not hand-written: it is the
 * set of HTTP bodies the backend's `test_reconstruct_wire_contract.py`
 * collected while playing one admin `admin.reconstruct` match through the real
 * Ranked routes (written with `RC_WIRE_CAPTURE_PATH`). Segment 1 is locked
 * WRONG, segment 2 exactly right in reversed socket order, segment 3 never
 * locked. Regenerate it whenever the backend contract changes; never edit it.
 */
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import { questionOutcome } from "@/components/quiz/workspace/questionIcons";
import { SegmentTranscript } from "@/components/ranked-arena/SegmentTranscript";
import { reconstructModule } from "@/lib/ranked-core/modules/reconstructModule";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import { liveModuleTitle } from "@/lib/ranked-core/centralStage";
import { rankedRoundMedia } from "@/lib/ranked-core/media/roundMedia";
import { reviewRoundQuestionTally, moduleSubject } from "@/pages/quiz-ranked/rankedResultsModel";
import capture from "./__fixtures__/reconstructServerCapture.json";
import {
  readMatchReview, readOwnChallengeReveal, readPrivatePlayer, readPublicRound, readQueueStatus,
  readResolvedEnvelope, readResume, readSegmentSettlement, RankedPublicParseError,
} from "./contracts";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer t" })),
}));
import * as api from "./client";
import { RankedApiError } from "./client";

const VIEWER = capture.meta.viewer_user_id;
const WRONG = capture.meta.submitted_placement_segment_1;
const RIGHT = capture.meta.submitted_placement_segment_2;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

afterEach(() => vi.unstubAllGlobals());

describe("server capture — request", () => {
  it("the serializer emits the exact bytes the backend accepted", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit = {}) => {
      calls.push(init);
      return new Response(JSON.stringify(capture.submit_accepted), { status: 200 });
    }));
    const ack = await api.submitSegmentChallenge("m", 1, 0, { placement: WRONG });
    expect(calls[0].body).toBe(capture.submit_request_bytes);
    expect(ack.nextChallengeIndex).toBe(1);
  });

  it("reads the idempotent retry and the conflicting rebuild", async () => {
    for (const [body, conflicting] of [
      [capture.submit_retry, false], [capture.submit_conflict, true]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
      const ack = await api.submitSegmentChallenge("m", 1, 0, { placement: WRONG });
      expect(ack.idempotent).toBe(true);
      expect(ack.conflicting).toBe(conflicting);
    }
  });

  it("turns both refusals into RankedApiError", async () => {
    for (const [refusal, code] of [
      [capture.error_schema_422, null],
      [capture.error_invalid_choice, "RANKED_INVALID_CHOICE"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify(refusal.body), { status: refusal.status })));
      const err = await api.submitSegmentChallenge("m", 1, 0, { placement: WRONG }).catch((e) => e);
      expect(err).toBeInstanceOf(RankedApiError);
      expect((err as RankedApiError).code).toBe(code);
    }
  });
});

describe("server capture — live segment", () => {
  it("reads the admin preset and routes the segment to the reconstruct renderer", () => {
    expect(readQueueStatus(capture.queue_join).status).toBe("matched");
    expect(readPublicRound(capture.public_open).playtest?.sessionPreset).toBe("admin.reconstruct");
    const view = readPrivatePlayer(capture.private_open);
    expect(rendererForSegment(view.segment)).toBe(reconstructModule);
    expect(liveModuleTitle(readPublicRound(capture.public_open))).toBe("Reconstruct");
  });

  it("reads the public block exactly as served, with one uniform reuse limit", () => {
    const state = readPrivatePlayer(capture.private_open).segmentState!;
    const served = capture.private_open.payload.segment_state.challenges.challenges[0];
    expect(state.block).toEqual({
      contract: "reconstruct",
      prompt: "Rebuild the recipe",
      target: { label: served.target.label, media: served.target.media },
      slotCount: served.slot_count,
      maxUses: served.slot_count,
      pieces: served.pieces.map((p) => ({ pieceId: p.piece_id, label: p.label, media: p.media })),
    });
    expect(state.ownSubmittedChoices).toEqual([null]);
    expect(state.ownChallengeReveals).toEqual([]);
  });

  it("the disclosure guard refuses every reveal-only key on a live segment", () => {
    for (const key of ["canonical_parts", "slot_correct", "settled_placement",
      "sub_parts", "decoys", "total_display", "combine_display", "value_display",
      // GM1-R2 breakdown figures
      "base_display", "line_total_display", "part_kind"]) {
      const body = clone(capture.private_open);
      (body.payload.segment_state.challenges.challenges[0] as Record<string, unknown>)[key] = [];
      expect(() => readPrivatePlayer(body), key).toThrow(RankedPublicParseError);
    }
  });

  it("an own reveal for a challenge the viewer can still answer is refused", () => {
    const body = clone(capture.private_open);
    (body.payload.segment_state as Record<string, unknown>).own_challenge_reveals =
      [capture.submit_accepted.challenge_reveal];
    expect(() => readPrivatePlayer(body)).toThrow(RankedPublicParseError);
  });

  it("the locked snapshot echoes the placement and carries only the viewer's reveal", () => {
    const state = readPrivatePlayer(capture.private_locked).segmentState!;
    expect(state.ownSubmittedChoices).toEqual([WRONG]);
    const rc = state.ownChallengeReveals[0].reconstruct!;
    expect(rc.placement).toEqual(WRONG);
    expect(rc.isCorrect).toBe(false);
    expect(rc.slotCorrect[0]).toBe(false);
    expect(rc.canonicalParts.length).toBeGreaterThan(0);
    expect(rc.pieces).toHaveLength(6);
    expect(rc.target?.totalDisplay).toMatch(/ g$/);
  });

  it("R2: the reveal carries every breakdown figure, frozen server-side, and none exists pre-lock", () => {
    const rc = readPrivatePlayer(capture.private_locked).segmentState!.ownChallengeReveals[0].reconstruct!;
    expect(rc.target?.baseDisplay).toMatch(/^\d+ g$/);
    expect(rc.target?.combineDisplay).toMatch(/^\d+ g$/);
    for (const part of rc.canonicalParts) {
      expect(["basic", "composite"]).toContain(part.partKind);
      expect(part.lineTotalDisplay).toMatch(/^\d+ g$/);
      expect(part.combineDisplay === null).toBe(part.partKind === "basic");
      for (const sub of part.subParts) expect(sub.valueDisplay).toMatch(/^\d+ g$/);
    }
    const pre = JSON.stringify([capture.private_open, capture.public_open, capture.private_after_refusal]);
    for (const key of ["base_display", "line_total_display", "part_kind", "combine_display",
      "total_display", "value_display", "sub_parts"]) {
      expect(pre).not.toContain(`"${key}"`);
    }
  });

  it("the lock ack's inline reveal reads through the same guard", () => {
    const ack = capture.submit_accepted;
    const rev = readOwnChallengeReveal(ack.challenge_reveal, ack.next_challenge_index, "reconstruct");
    expect(rev.reconstruct?.settledPlacement).toEqual(ack.challenge_reveal.settled_placement);
    expect(() => readOwnChallengeReveal(ack.challenge_reveal, 0, "reconstruct")).toThrow();
  });

  it("after the lock, reveal keys appear ONLY in the viewer's own reveal, never the opponent's build", () => {
    const hits: string[] = [];
    const walk = (o: unknown, path: string) => {
      if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (o && typeof o === "object") {
        for (const [k, v] of Object.entries(o)) {
          if (["canonical_parts", "slot_correct", "settled_placement", "sub_parts"].includes(k)) hits.push(path);
          walk(v, `${path}.${k}`);
        }
      }
    };
    for (const body of [capture.public_locked, capture.private_locked]) {
      hits.length = 0;
      walk(body, "");
      expect(hits.length).toBeGreaterThan(0);
      for (const h of hits) expect(h).toMatch(/^\.payload\.segment_state\.own_challenge_reveals\[0\]/);
      expect(JSON.stringify(body)).not.toContain("opponent_submitted_choices");
    }
    expect(readResume(capture.resume_locked)).toBeTruthy();
  });
});

describe("server capture — settlement", () => {
  const settlement = (body: unknown) => readSegmentSettlement(readResolvedEnvelope(body).payload);

  it("reads a wrong, a right and a timed-out build", () => {
    const wrong = settlement(capture.resolved_incorrect)!.reveal.reconstruct!;
    expect(wrong.placements[VIEWER]).toEqual(WRONG);
    expect(wrong.slotCorrect[VIEWER][0]).toBe(false);
    for (const id of WRONG) expect(wrong.labels[id]).toBeTruthy();
    const right = settlement(capture.resolved_correct)!.reveal;
    expect(right.reconstruct!.placements[VIEWER]).toEqual(RIGHT);
    expect(right.players[VIEWER].correct).toBe(1);
    const timeout = settlement(capture.resolved_timeout)!.reveal;
    expect(timeout.reconstruct!.placements[VIEWER]).toBeNull();
  });

  it("the transcript names both builds and the recipe, decoys included", () => {
    const s = settlement(capture.resolved_incorrect)!;
    const opponent = Object.keys(s.reveal.players).find((p) => p !== VIEWER)!;
    render(<SegmentTranscript reveal={s.reveal} viewerUserId={VIEWER} opponentUserId={opponent} />);
    const rc = s.reveal.reconstruct!;
    const mine = screen.getByTestId("rc-transcript-you").textContent!;
    expect(mine).toContain(rc.labels[WRONG[0]]);
    const recipe = screen.getByTestId("rc-transcript-correct").textContent!;
    for (const part of rc.canonicalParts) expect(recipe).toContain(part.label);
    expect(screen.getByTestId("rc-transcript-placed").textContent)
      .toBe(`${rc.slotCorrect[VIEWER].filter(Boolean).length}/${WRONG.length} parts right`);
  });
});

describe("server capture — review", () => {
  const review = () => readMatchReview(capture.review);

  it("reads three reconstruct rounds with the backend's outcomes", () => {
    const rounds = review().rounds;
    expect(rounds.map((r) => r.kind)).toEqual(["reconstruct", "reconstruct", "reconstruct"]);
    expect(rounds.map(questionOutcome)).toEqual(["incorrect", "correct", "unanswered"]);
    expect(rounds.map(reviewRoundQuestionTally)).toEqual([
      { correct: 0, total: 1 }, { correct: 1, total: 1 }, { correct: 0, total: 1 }]);
    expect(moduleSubject(rounds[0])).toBe("Reconstruct");
  });

  it("an unrevealed round carrying the recipe is refused", () => {
    const body = clone(capture.review);
    (body.payload.rounds[0] as Record<string, unknown>).revealed = false;
    expect(() => readMatchReview(body)).toThrow(RankedPublicParseError);
  });

  it("the review card shows my build with the server's marks and the recipe beneath", () => {
    const round = review().rounds[0];
    render(<QuestionReviewCard round={round} position={1} total={3} />);
    const mine = within(screen.getByTestId("review-reconstruct-mine")).getAllByRole("listitem");
    expect(mine.map((li) => li.getAttribute("data-mark"))).toEqual(round.reconstruct!.slotCorrect.map(String));
    const recipe = screen.getByTestId("review-reconstruct-recipe");
    for (const part of round.reconstruct!.canonicalParts!) {
      expect(recipe.textContent).toContain(part.label);
      if (part.valueDisplay) expect(recipe.textContent).toContain(part.valueDisplay);
    }
    expect(screen.getByTestId("review-reconstruct-total").textContent)
      .toContain(round.reconstruct!.recipeTarget!.totalDisplay!);
  });

  it("a timed-out round says so and still teaches the recipe", () => {
    render(<QuestionReviewCard round={review().rounds[2]} position={3} total={3} />);
    expect(screen.getByTestId("review-reconstruct").textContent).toContain("did not lock in a build");
    expect(screen.getByTestId("review-reconstruct-recipe")).toBeInTheDocument();
  });
});

describe("server capture — media", () => {
  it("preloads the target and all six pieces, resolved like the renderer", () => {
    const round = readPrivatePlayer(capture.private_open);
    const media = rankedRoundMedia(round as never);
    const served = capture.private_open.payload.segment_state.challenges.challenges[0];
    const urls = media.critical.join(" ");
    expect(urls).toContain(served.target.media.src);
    for (const p of served.pieces) expect(urls).toContain(p.media.src);
  });
});
