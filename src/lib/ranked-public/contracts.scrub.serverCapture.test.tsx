/**
 * SCRUB-S2 — the Chronoscope (`scrub.v1`) against REAL server JSON.
 *
 * `__fixtures__/scrubServerCapture.json` is not hand-written: it is the set of
 * HTTP bodies the backend's `test_scrub_wire_contract.py` collected while
 * playing one admin `admin.scrub` bot match through the real Ranked routes
 * (written with `SCRUB_WIRE_CAPTURE_PATH`). Segment 1 is locked EXACTLY RIGHT
 * on the bot-inline path, segment 2 WRONG at the checkpoint farthest from the
 * first one (the longest traverse), segment 3 wrong with the bot held (the
 * locked-but-unsettled state, refusals, retry, conflict, resume). Regenerate
 * it whenever the backend contract changes; never edit it.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import { questionOutcome } from "@/components/quiz/workspace/questionIcons";
import { SegmentTranscript } from "@/components/ranked-arena/SegmentTranscript";
import { liveModuleTitle } from "@/lib/ranked-core/centralStage";
import { withInlineOrderForgeReveal } from "@/lib/ranked-core/orderForgeLockReveal";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import { scrubModule } from "@/lib/ranked-core/modules/scrubModule";
import { moduleSubject, reviewRoundQuestionTally } from "@/pages/quiz-ranked/rankedResultsModel";
import capture from "./__fixtures__/scrubServerCapture.json";
import {
  readMatchReview, readOwnChallengeReveal, readPrivatePlayer, readPublicRound, readQueueStatus,
  readResolvedEnvelope, readResume, readSegmentSettlement, RankedPublicParseError,
} from "./contracts";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer t" })),
}));
import * as api from "./client";
import { RankedApiError } from "./client";

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = capture as Record<string, any>;
const VIEWER: string = C.meta.viewer_user_id;
const CANON: Record<string, string> = C.meta.canonical;
const SUBMITTED: Record<string, string> = C.meta.submitted;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Every reveal-only key the backend guard and this reader refuse pre-lock. */
const REVEAL_ONLY = ["canonical_checkpoint", "satisfied_checkpoints", "proof", "traverse_path",
  "threshold_xp", "granularity_caveat", "breakpoint_note", "is_correct", "correct", "answer"];

afterEach(() => vi.unstubAllGlobals());

describe("server capture — request", () => {
  it("the serializer emits the exact bytes the backend accepted, and nothing derived", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit = {}) => {
      calls.push(init);
      return new Response(JSON.stringify(C.submit_accepted), { status: 200 });
    }));
    await api.submitSegmentChallenge("m", 1, 0, { checkpoint: SUBMITTED["1"] });
    expect(calls[0].body).toBe(C.submit_request_bytes_correct);
    expect(JSON.parse(String(calls[0].body))).toEqual({ checkpoint: SUBMITTED["1"] });
  });

  it("reads the idempotent retry and the conflicting re-lock", async () => {
    for (const [body, conflicting] of [[C.submit_retry, false], [C.submit_conflict, true]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
      const ack = await api.submitSegmentChallenge("m", 3, 0, { checkpoint: SUBMITTED["3"] });
      expect(ack.idempotent).toBe(true);
      expect(ack.conflicting).toBe(conflicting);
    }
  });

  it("turns both refusals into RankedApiError", async () => {
    for (const [refusal, code] of [
      [C.error_schema_422, null], [C.error_invalid_choice, "RANKED_INVALID_CHOICE"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify(refusal.body), { status: refusal.status })));
      const err = await api.submitSegmentChallenge("m", 3, 0, { checkpoint: "w99" }).catch((e) => e);
      expect(err).toBeInstanceOf(RankedApiError);
      expect((err as RankedApiError).code).toBe(code);
    }
  });
});

describe("server capture — live segment (no answer leak)", () => {
  it("reads the admin preset and routes the segment to the scrub renderer", () => {
    expect(readQueueStatus(C.queue_join).status).toBe("matched");
    expect(readPublicRound(C.public_open).playtest?.sessionPreset).toBe("admin.scrub");
    const view = readPrivatePlayer(C.private_open);
    expect(rendererForSegment(view.segment)).toBe(scrubModule);
    expect(liveModuleTitle(readPublicRound(C.public_open))).toBe("Chronoscope");
  });

  it("reads the public block exactly as served: fifteen checkpoints, public state only", () => {
    const state = readPrivatePlayer(C.private_open).segmentState!;
    const served = C.private_open.payload.segment_state.challenges;
    const ch = served.challenges[0];
    expect(state.block).toEqual({
      contract: "scrub",
      family: "wave_xp",
      prompt: served.prompt,
      objective: {
        lane: ch.objective.lane, targetLevel: ch.objective.target_level,
        cannonOnly: ch.objective.cannon_only, text: ch.objective.text,
      },
      source: { patch: "26.15", map: ch.source.map, mode: ch.source.mode },
      unitLabel: "Wave",
      footnote: ch.footnote,
      checkpoints: ch.checkpoints.map((c: any) => ({
        token: c.token, waveNumber: c.wave_number, spawnTimeDisplay: c.spawn_time_display,
        isCannonWave: c.is_cannon_wave, meleeCount: c.melee_count, casterCount: c.caster_count,
        cannonCount: c.cannon_count, level: c.level, cumulativeXp: c.cumulative_xp,
        waveXp: c.wave_xp, levelFloorXp: c.level_floor_xp, levelCeilingXp: c.level_ceiling_xp,
      })),
    });
    expect(state.ownSubmittedChoices).toEqual([null]);
    expect(state.ownChallengeReveals).toEqual([]);
  });

  it("no pre-lock body carries a reveal-only key anywhere", () => {
    for (const key of ["private_open", "public_open", "private_before_bot_lock_correct",
      "public_before_bot_lock_correct", "private_before_bot_lock_wrong",
      "public_before_bot_lock_wrong", "private_after_refusal"]) {
      const text = JSON.stringify(C[key]);
      for (const k of REVEAL_ONLY) expect(text, `${key}:${k}`).not.toContain(`"${k}"`);
    }
  });

  it("no pre-lock body names the canonical checkpoint in any field but the rail's own token", () => {
    // The canonical token appears exactly once per checkpoint list (its own
    // rail entry) — never under a second key that would single it out.
    for (const [key, rn] of [["private_open", "1"], ["private_before_bot_lock_wrong", "2"]] as const) {
      const ch = C[key].payload.segment_state.challenges.challenges[0];
      const hits = JSON.stringify(ch).split(`"${CANON[rn]}"`).length - 1;
      expect(hits, key).toBe(1);
      const shapes = new Set(ch.checkpoints.map((c: any) => Object.keys(c).sort().join(",")));
      expect(shapes.size).toBe(1);
    }
  });

  it("the disclosure guard refuses every reveal-only key on a live segment", () => {
    for (const key of REVEAL_ONLY.filter((k) => !["correct", "answer", "is_correct"].includes(k))
      .concat(["is_correct"])) {
      const body = clone(C.private_open);
      (body.payload.segment_state.challenges.challenges[0] as Record<string, unknown>)[key] = "w4";
      expect(() => readPrivatePlayer(body), key).toThrow(RankedPublicParseError);
      const nested = clone(C.private_open);
      nested.payload.segment_state.challenges.challenges[0].checkpoints[3][key] = true;
      expect(() => readPrivatePlayer(nested), `checkpoint.${key}`).toThrow(RankedPublicParseError);
    }
  });

  it("an own reveal for a challenge the viewer can still answer is refused", () => {
    const body = clone(C.private_open);
    (body.payload.segment_state as Record<string, unknown>).own_challenge_reveals =
      [C.submit_accepted.challenge_reveal];
    expect(() => readPrivatePlayer(body)).toThrow(RankedPublicParseError);
  });

  it("the locked snapshot echoes the checkpoint and carries only the viewer's reveal", () => {
    const state = readPrivatePlayer(C.private_locked).segmentState!;
    expect(state.ownSubmittedChoices).toEqual([SUBMITTED["3"]]);
    const sc = state.ownChallengeReveals[0].scrub!;
    expect(sc.checkpoint).toBe(SUBMITTED["3"]);
    expect(sc.isCorrect).toBe(false);
    expect(sc.canonicalCheckpoint).toBe(CANON["3"]);
    expect(sc.traversePath[0]).toBe(SUBMITTED["3"]);
    expect(sc.traversePath[sc.traversePath.length - 1]).toBe(CANON["3"]);
    expect(sc.proof.after.token).toBe(CANON["3"]);
    expect(sc.proof.after.satisfied).toBe(true);
    expect(sc.granularityCaveat).toMatch(/granularity/);
  });

  it("after the lock, reveal keys appear ONLY in the viewer's own reveal", () => {
    const hits: string[] = [];
    const walk = (o: unknown, path: string) => {
      if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (o && typeof o === "object") {
        for (const [k, v] of Object.entries(o)) {
          if (["canonical_checkpoint", "proof", "traverse_path", "satisfied_checkpoints"].includes(k)) hits.push(path);
          walk(v, `${path}.${k}`);
        }
      }
    };
    for (const body of [C.public_locked, C.private_locked]) {
      hits.length = 0;
      walk(body, "");
      expect(hits.length).toBeGreaterThan(0);
      for (const h of hits) expect(h).toMatch(/^\.payload\.segment_state\.own_challenge_reveals\[0\]/);
    }
    expect(readResume(C.resume_locked)).toBeTruthy();
  });
});

describe("server capture — the bot-inline lock", () => {
  it("the exact lock settles inline with a confirmation path of one checkpoint", () => {
    const ack = C.submit_accepted_bot_settled_correct;
    expect(ack.segment_resolved).toBe(true);
    const rev = readOwnChallengeReveal(ack.challenge_reveal, ack.next_challenge_index, "scrub");
    expect(rev.scrub).toMatchObject({
      checkpoint: CANON["1"], isCorrect: true, canonicalCheckpoint: CANON["1"], traversePath: [CANON["1"]],
    });
    expect(() => readOwnChallengeReveal(ack.challenge_reveal, 0, "scrub")).toThrow();
  });

  it("the wrong lock carries the authoritative traverse, chosen → canonical, every checkpoint between", () => {
    const ack = C.submit_accepted_bot_settled_wrong;
    const rev = readOwnChallengeReveal(ack.challenge_reveal, ack.next_challenge_index, "scrub").scrub!;
    const rail: string[] = C.private_before_bot_lock_wrong.payload.segment_state.challenges.challenges[0]
      .checkpoints.map((c: any) => c.token);
    const a = rail.indexOf(SUBMITTED["2"]);
    const b = rail.indexOf(CANON["2"]);
    expect(rev.traversePath).toEqual(
      a > b ? rail.slice(b, a + 1).reverse() : rail.slice(a, b + 1));
    expect(rev.traversePath.length).toBeGreaterThanOrEqual(3);
  });

  it("the inline reveal attaches to the frozen pre-lock snapshot of THIS segment only", () => {
    const pre = readPrivatePlayer(C.private_before_bot_lock_wrong).segmentState!;
    const ack = C.submit_accepted_bot_settled_wrong;
    const reveal = readOwnChallengeReveal(ack.challenge_reveal, ack.next_challenge_index, "scrub");
    const matchId = C.meta.match_id;
    const attached = withInlineOrderForgeReveal(pre, { matchId, segmentNumber: pre.segmentNumber, reveal }, matchId);
    expect(attached!.ownChallengeReveals).toEqual([reveal]);
    expect(withInlineOrderForgeReveal(pre, { matchId, segmentNumber: pre.segmentNumber + 1, reveal }, matchId))
      .toBe(pre);
    expect(withInlineOrderForgeReveal(pre, { matchId: "other", segmentNumber: pre.segmentNumber, reveal }, matchId))
      .toBe(pre);
  });
});

describe("server capture — settlement", () => {
  const settlement = (body: unknown) => readSegmentSettlement(readResolvedEnvelope(body).payload);

  it("reads a right, a wrong and a held-bot settlement", () => {
    const right = settlement(C.resolved_correct)!.reveal;
    expect(right.scrub!.picks[VIEWER]).toBe(CANON["1"]);
    expect(right.scrub!.canonicalCheckpoint).toBe(CANON["1"]);
    expect(right.players[VIEWER].correct).toBe(1);
    const wrong = settlement(C.resolved_wrong)!.reveal;
    expect(wrong.scrub!.picks[VIEWER]).toBe(SUBMITTED["2"]);
    expect(wrong.players[VIEWER].correct).toBe(0);
    const held = settlement(C.resolved_held)!.reveal;
    expect(held.scrub!.picks[VIEWER]).toBe(SUBMITTED["3"]);
    expect(held.scrub!.checkpoints).toHaveLength(15);
  });

  it("the transcript names both checkpoints and the first one", () => {
    const s = settlement(C.resolved_wrong)!;
    const opponent = Object.keys(s.reveal.players).find((p) => p !== VIEWER)!;
    render(<SegmentTranscript reveal={s.reveal} viewerUserId={VIEWER} opponentUserId={opponent} />);
    expect(screen.getByTestId("scrub-transcript-you").textContent)
      .toContain(`Wave ${SUBMITTED["2"].slice(1)}`);
    expect(screen.getByTestId("scrub-transcript-correct").textContent)
      .toContain(`Wave ${CANON["2"].slice(1)}`);
    expect(screen.getByText(/Chronoscope — segment result/)).toBeInTheDocument();
  });
});

describe("server capture — review, history, resume", () => {
  const review = () => readMatchReview(C.review);

  it("reads three scrub rounds with the backend's outcomes", () => {
    const rounds = review().rounds;
    expect(rounds.map((r) => r.kind)).toEqual(["scrub", "scrub", "scrub"]);
    expect(rounds.map(questionOutcome)).toEqual(["correct", "incorrect", "incorrect"]);
    expect(rounds.map(reviewRoundQuestionTally)).toEqual([
      { correct: 1, total: 1 }, { correct: 0, total: 1 }, { correct: 0, total: 1 }]);
    expect(moduleSubject(rounds[0])).toBe("Chronoscope");
    expect(rounds.map((r) => r.scrub!.canonicalCheckpoint)).toEqual([CANON["1"], CANON["2"], CANON["3"]]);
  });

  it("an unrevealed round carrying the checkpoint is refused", () => {
    const body = clone(C.review);
    (body.payload.rounds[1] as Record<string, unknown>).revealed = false;
    expect(() => readMatchReview(body)).toThrow(RankedPublicParseError);
  });

  it("the review card shows my checkpoint with the server's verdict and the proof", () => {
    const round = review().rounds[1];
    render(<QuestionReviewCard round={round} position={2} total={3} />);
    const mine = screen.getByTestId("review-scrub-mine");
    expect(mine.getAttribute("data-mark")).toBe("incorrect");
    expect(mine.textContent).toContain(`Wave ${SUBMITTED["2"].slice(1)}`);
    expect(screen.getByTestId("review-scrub-after").textContent).toContain(round.scrub!.proof!.after.cumulativeXp);
    expect(screen.getByTestId("review-scrub-objective").textContent).toBe(round.scrub!.objective!.text);
  });

  it("history lists the match and the final resume is over", () => {
    const text = JSON.stringify(C.history);
    expect(text).toContain(C.meta.match_id);
    expect(readResume(C.resume_final)).toBeTruthy();
    expect(C.resume_final.payload.match_over).toBe(true);
  });
});
