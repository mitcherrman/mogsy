/**
 * PA2B — Pro Play Assembly against REAL server JSON, both families.
 *
 * `__fixtures__/assembly{RosterLock,DraftMemory}ServerCapture.json` are not
 * hand-written: they are the HTTP bodies the backend's
 * `test_assembly_wire_contract.py` collected while playing one admin match per
 * family through the real Ranked routes (written with
 * `ASSEMBLY_WIRE_CAPTURE_DIR`). Segment 1 is locked WRONG (Top and Jungle
 * swapped), segment 2 exactly right, segment 3 never locked. Regenerate them
 * whenever the backend contract changes; never edit them.
 */
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import { questionOutcome } from "@/components/quiz/workspace/questionIcons";
import { SegmentTranscript } from "@/components/ranked-arena/SegmentTranscript";
import { assemblyModule } from "@/lib/ranked-core/modules/assemblyModule";
import {
  placementFromAssignment, toPositionalAssemblyPublic, toPositionalAssemblyReveal,
} from "@/lib/ranked-core/modules/assemblyAdapter";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import { liveModuleTitle } from "@/lib/ranked-core/centralStage";
import { rankedRoundMedia } from "@/lib/ranked-core/media/roundMedia";
import { withInlineOrderForgeReveal } from "@/lib/ranked-core/orderForgeLockReveal";
import { moduleSubject, reviewRoundQuestionTally } from "@/pages/quiz-ranked/rankedResultsModel";
import roster from "./__fixtures__/assemblyRosterLockServerCapture.json";
import draft from "./__fixtures__/assemblyDraftMemoryServerCapture.json";
import {
  ASSEMBLY_LANE_ORDER, readMatchReview, readOwnChallengeReveal, readPrivatePlayer, readPublicRound,
  readQueueStatus, readResolvedEnvelope, readResume, readSegmentSettlement, RankedPublicParseError,
} from "./contracts";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer t" })),
}));
import * as api from "./client";
import { RankedApiError } from "./client";

type Capture = typeof roster;
const CAPTURES: [string, Capture, "Roster Lock" | "Draft Memory"][] = [
  ["roster_lock", roster, "Roster Lock"],
  ["draft_memory", draft as unknown as Capture, "Draft Memory"],
];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
/** Every reveal-only / private-only key the live reader must refuse. */
const REVEAL_KEYS = ["canonical_lineup", "position_correct", "card_facts", "historical_context",
  "matched", "role_anchor", "slot_anchor", "registry_evidence", "canonical", "answer", "is_correct"];

afterEach(() => vi.unstubAllGlobals());

describe.each(CAPTURES)("assembly server capture — %s", (family, cap, title) => {
  const VIEWER = cap.meta.viewer_user_id;
  const WRONG = cap.meta.submitted_placement_segment_1;
  const RIGHT = cap.meta.submitted_placement_segment_2;

  describe("request", () => {
    it("the serializer emits the exact bytes the backend accepted", async () => {
      const calls: RequestInit[] = [];
      vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit = {}) => {
        calls.push(init);
        return new Response(JSON.stringify(cap.submit_accepted), { status: 200 });
      }));
      const ack = await api.submitSegmentChallenge("m", 1, 0, { placement: WRONG });
      expect(calls[0].body).toBe(cap.submit_request_bytes);
      expect(ack.nextChallengeIndex).toBe(1);
    });

    it("reads the idempotent retry and the conflicting relock", async () => {
      for (const [body, conflicting] of [
        [cap.submit_retry, false], [cap.submit_conflict, true]] as const) {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
        const ack = await api.submitSegmentChallenge("m", 1, 0, { placement: WRONG });
        expect(ack.idempotent).toBe(true);
        expect(ack.conflicting).toBe(conflicting);
      }
    });

    it("turns the schema, incomplete and duplicate refusals into RankedApiError", async () => {
      for (const [refusal, code] of [
        [cap.error_schema_422, null],
        [cap.error_incomplete, "RANKED_INVALID_CHOICE"],
        [cap.error_duplicate, "RANKED_INVALID_CHOICE"]] as const) {
        vi.stubGlobal("fetch", vi.fn(async () =>
          new Response(JSON.stringify(refusal.body), { status: refusal.status })));
        const err = await api.submitSegmentChallenge("m", 1, 0, { placement: WRONG }).catch((e) => e);
        expect(err).toBeInstanceOf(RankedApiError);
        expect((err as RankedApiError).code).toBe(code);
      }
    });
  });

  describe("live segment", () => {
    it("reads the admin preset and routes the segment to the assembly renderer", () => {
      expect(readQueueStatus(cap.queue_join).status).toBe("matched");
      expect(readPublicRound(cap.public_open).playtest?.sessionPreset).toBe(cap.meta.preset);
      const view = readPrivatePlayer(cap.private_open);
      expect(rendererForSegment(view.segment)).toBe(assemblyModule);
      expect(liveModuleTitle(readPrivatePlayer(cap.private_open))).toBe(title);
    });

    it("reads the public block exactly as served: lane order, opaque tokens, no answer", () => {
      const state = readPrivatePlayer(cap.private_open).segmentState!;
      const served = cap.private_open.payload.segment_state.challenges;
      const block = state.block;
      if (block?.contract !== "assembly") throw new Error("not an assembly block");
      expect(block.family).toBe(family);
      expect(block.catalogRevision).toBe("99531ef6fe06a894");
      expect(block.positions.map((p) => p.slotId)).toEqual([...ASSEMBLY_LANE_ORDER]);
      expect(block.cards.map((c) => c.token)).toEqual(served.challenges[0].cards.map((c) => c.token));
      expect(state.ownSubmittedChoices).toEqual([null]);
      expect(state.ownChallengeReveals).toEqual([]);
      // The primitive's content carries nothing that could hold the answer.
      const content = toPositionalAssemblyPublic(block);
      expect(JSON.stringify(content)).not.toMatch(/answer|tier|role_anchor|canonical|private/);
      expect(content.positions.map((p) => p.id)).toEqual([...ASSEMBLY_LANE_ORDER]);
      expect(content.cardKind).toBe(family === "roster_lock" ? "identity" : "icon");
    });

    it("a reconnect before the lock reads the identical board", () => {
      const a = readPrivatePlayer(cap.private_open).segmentState!.block;
      const b = readPrivatePlayer(cap.private_reconnect_open).segmentState!.block;
      expect(b).toEqual(a);
    });

    it("the disclosure guard refuses every reveal-only key on a live segment", () => {
      for (const key of REVEAL_KEYS) {
        const body = clone(cap.private_open);
        (body.payload.segment_state.challenges.challenges[0] as Record<string, unknown>)[key] = {};
        expect(() => readPrivatePlayer(body), key).toThrow(RankedPublicParseError);
      }
      // ...and on a card, on the subject and on the block itself: the block is
      // an exact allow-list, so even a key no guard names yet is refused.
      for (const key of ["canonical", "tier", "role", "entity_key", "slot", "correct_slot"]) {
        for (const where of ["card", "subject", "block"] as const) {
          const body = clone(cap.private_open);
          const blk = body.payload.segment_state.challenges as unknown as Record<string, unknown>;
          const target = where === "block" ? blk
            : where === "subject" ? blk.subject as Record<string, unknown>
              : ((blk.challenges as Record<string, unknown>[])[0].cards as Record<string, unknown>[])[0];
          target[key] = "top";
          expect(() => readPrivatePlayer(body), `${key}@${where}`).toThrow(RankedPublicParseError);
        }
      }
    });

    it("refuses an adversarial public block rather than repairing it", () => {
      const mutate = (fn: (ch: Record<string, unknown>, blk: Record<string, unknown>) => void) => {
        const body = clone(cap.private_open);
        const blk = body.payload.segment_state.challenges as unknown as Record<string, unknown>;
        fn((blk.challenges as Record<string, unknown>[])[0], blk);
        return body;
      };
      const cases: [string, ReturnType<typeof mutate>][] = [
        ["positions re-ordered", mutate((ch) => { (ch.positions as unknown[]).reverse(); })],
        ["a position missing", mutate((ch) => { (ch.positions as unknown[]).pop(); })],
        ["a duplicate token", mutate((ch) => {
          const cards = ch.cards as { token: string }[]; cards[1].token = cards[0].token; })],
        ["a token that is not opaque", mutate((ch) => {
          (ch.cards as { token: string }[])[0].token = "Faker (Lee Sang-hyeok)"; })],
        ["four cards", mutate((ch) => { ch.cards = (ch.cards as unknown[]).slice(0, 4); })],
        ["a wrong card face", mutate((_ch, blk) => {
          blk.card_kind = blk.card_kind === "identity" ? "icon" : "identity"; })],
        ["an unknown family", mutate((_ch, blk) => { blk.family = "bracket_forge"; })],
        ["two challenges", mutate((_ch, blk) => {
          blk.challenges = [...(blk.challenges as unknown[]), (blk.challenges as unknown[])[0]]; })],
      ];
      for (const [label, body] of cases) {
        expect(() => readPrivatePlayer(body), label).toThrow(RankedPublicParseError);
      }
    });

    it("an own reveal for a challenge the viewer can still answer is refused", () => {
      const body = clone(cap.private_open);
      (body.payload.segment_state as Record<string, unknown>).own_challenge_reveals =
        [cap.submit_accepted.challenge_reveal];
      expect(() => readPrivatePlayer(body)).toThrow(RankedPublicParseError);
    });

    it("the locked snapshot echoes the placement and carries only the viewer's reveal", () => {
      const state = readPrivatePlayer(cap.private_locked).segmentState!;
      expect(state.ownSubmittedChoices).toEqual([WRONG]);
      const as = state.ownChallengeReveals[0].assembly!;
      expect(as.placement).toEqual(WRONG);
      expect(as.isCorrect).toBe(false);
      expect(as.matched).toBe(3);
      expect(as.positionCorrect).toEqual({ top: false, jungle: false, mid: true, adc: true, support: true });
      expect(as.canonicalLineup.map((e) => e.token)).toEqual(cap.meta.canonical_segment_1);
      expect(as.context.family).toBe(family);
      expect(readResume(cap.resume_locked)).toBeTruthy();
    });

    it("after the lock, reveal keys appear ONLY in the viewer's own reveal", () => {
      const hits: string[] = [];
      const walk = (o: unknown, path: string) => {
        if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`));
        else if (o && typeof o === "object") {
          for (const [k, v] of Object.entries(o)) {
            if (["canonical_lineup", "card_facts", "historical_context", "position_correct"].includes(k)) hits.push(path);
            walk(v, `${path}.${k}`);
          }
        }
      };
      for (const body of [cap.public_locked, cap.private_locked]) {
        hits.length = 0;
        walk(body, "");
        expect(hits.length).toBeGreaterThan(0);
        for (const h of hits) expect(h).toMatch(/^\.payload\.segment_state\.own_challenge_reveals\[0\]/);
      }
      // Before the lock no reveal key exists anywhere in the bodies.
      const pre = JSON.stringify([cap.private_open, cap.public_open, cap.private_after_refusal,
        cap.private_before_bot_lock, cap.public_before_bot_lock]);
      for (const key of REVEAL_KEYS.filter((k) => k !== "is_correct")) expect(pre).not.toContain(`"${key}"`);
    });

    it("the lock ack's inline reveal reads through the same guard and attaches once", () => {
      const ack = cap.submit_accepted;
      const rev = readOwnChallengeReveal(ack.challenge_reveal, ack.next_challenge_index, "assembly");
      expect(rev.assembly?.placement).toEqual(WRONG);
      expect(() => readOwnChallengeReveal(ack.challenge_reveal, 0, "assembly")).toThrow();
      const open = readPrivatePlayer(cap.private_before_bot_lock);
      const state = open.segmentState!;
      const withReveal = withInlineOrderForgeReveal(state,
        { matchId: open.matchId, segmentNumber: state.segmentNumber, reveal: rev }, open.matchId);
      expect(withReveal?.ownChallengeReveals).toHaveLength(1);
      // A reveal for another match never attaches.
      expect(withInlineOrderForgeReveal(state,
        { matchId: "other", segmentNumber: state.segmentNumber, reveal: rev }, open.matchId)).toBe(state);
    });

    it("the adapter maps the reveal onto the board the player saw, server marks verbatim", () => {
      const state = readPrivatePlayer(cap.private_locked).segmentState!;
      if (state.block?.contract !== "assembly") throw new Error("not assembly");
      const as = state.ownChallengeReveals[0].assembly!;
      const reveal = toPositionalAssemblyReveal(state.block, as)!;
      expect(reveal.isCorrect).toBe(false);
      expect(reveal.verdictText).toBe("3 of 5 in position.");
      expect(reveal.positionCorrect).toEqual(as.positionCorrect);
      ASSEMBLY_LANE_ORDER.forEach((lane, i) => {
        expect(reveal.assignment[lane]).toBe(WRONG[i]);
        expect(reveal.canonical[lane]).toBe(cap.meta.canonical_segment_1[i]);
      });
      // The swapped pair are both "answer" cards: right identity, wrong position.
      expect(Object.keys(reveal.cardNotes ?? {}).sort()).toEqual([WRONG[0], WRONG[1]].sort());
      for (const note of Object.values(reveal.cardNotes ?? {})) {
        expect(note).toMatch(family === "roster_lock" ? /right player, wrong position/ : /did play it in this game/);
      }
      expect(reveal.context.title).toContain(as.context.team!);
      // And the board the player locked maps back to the same wire placement.
      expect(placementFromAssignment(reveal.assignment, state.block.cards.map((c) => c.token))).toEqual(WRONG);
    });
  });

  describe("settlement", () => {
    const settlement = (body: unknown) => readSegmentSettlement(readResolvedEnvelope(body).payload);

    it("reads a wrong, a right and a timed-out board", () => {
      const wrong = settlement(cap.resolved_incorrect)!.reveal.assembly!;
      expect(wrong.placements[VIEWER]).toEqual(WRONG);
      expect(wrong.positionCorrect[VIEWER].top).toBe(false);
      expect(wrong.matched[VIEWER]).toBe(3);
      const right = settlement(cap.resolved_correct)!.reveal;
      expect(right.assembly!.placements[VIEWER]).toEqual(RIGHT);
      expect(right.players[VIEWER].correct).toBe(1);
      const timeout = settlement(cap.resolved_timeout)!.reveal;
      expect(timeout.assembly!.placements[VIEWER]).toBeNull();
      expect(timeout.players[VIEWER].unanswered).toBe(1);
    });

    it("the transcript names both boards and the true lineup", () => {
      const s = settlement(cap.resolved_incorrect)!;
      const opponent = Object.keys(s.reveal.players).find((p) => p !== VIEWER)!;
      render(<SegmentTranscript reveal={s.reveal} viewerUserId={VIEWER} opponentUserId={opponent} />);
      const as = s.reveal.assembly!;
      expect(screen.getByTestId("as-transcript-you").textContent).toContain(as.cardFacts[WRONG[0]].label);
      const truth = screen.getByTestId("as-transcript-correct").textContent!;
      for (const e of as.canonicalLineup) expect(truth).toContain(e.label);
      expect(screen.getByTestId("as-transcript-placed").textContent).toBe("3/5 in position");
      expect(screen.getByRole("heading").textContent).toContain(title);
    });
  });

  describe("review / history", () => {
    const review = () => readMatchReview(cap.review);

    it("reads three assembly rounds with the backend's outcomes", () => {
      const rounds = review().rounds;
      expect(rounds.map((r) => r.kind)).toEqual(["assembly", "assembly", "assembly"]);
      expect(rounds.map(questionOutcome)).toEqual(["incorrect", "correct", "unanswered"]);
      expect(rounds.map(reviewRoundQuestionTally)).toEqual([
        { correct: 0, total: 1 }, { correct: 1, total: 1 }, { correct: 0, total: 1 }]);
      expect(moduleSubject(rounds[0])).toBe(title);
    });

    it("an unrevealed round carrying the lineup is refused", () => {
      const body = clone(cap.review);
      (body.payload.rounds[0] as Record<string, unknown>).revealed = false;
      expect(() => readMatchReview(body)).toThrow(RankedPublicParseError);
    });

    it("the review card shows my board with the server's marks, the true lineup and the context", () => {
      const round = review().rounds[0];
      render(<QuestionReviewCard round={round} position={1} total={3} />);
      const mine = within(screen.getByTestId("review-assembly-mine")).getAllByRole("listitem");
      expect(mine.map((li) => li.getAttribute("data-mark")))
        .toEqual(ASSEMBLY_LANE_ORDER.map((lane) => String(round.assembly!.positionCorrect![lane])));
      const lineup = screen.getByTestId("review-assembly-lineup").textContent!;
      for (const e of round.assembly!.canonicalLineup!) expect(lineup).toContain(e.label);
      expect(screen.getAllByTestId("review-assembly-note")).toHaveLength(2);
      expect(screen.getByTestId("review-assembly-context").textContent).toContain(round.assembly!.context!.team!);
    });

    it("a timed-out round says so and still teaches the lineup", () => {
      render(<QuestionReviewCard round={review().rounds[2]} position={3} total={3} />);
      expect(screen.getByTestId("review-assembly").textContent).toContain("did not lock in a board");
      expect(screen.getByTestId("review-assembly-lineup")).toBeInTheDocument();
    });
  });

  describe("media", () => {
    it("preloads the lane emblems, and Draft Memory's champion icons", () => {
      const round = readPrivatePlayer(cap.private_open);
      const media = rankedRoundMedia(round as never);
      const urls = media.critical.join(" ");
      expect(urls).toMatch(/top\.svg/);
      if (family === "draft_memory") {
        const served = cap.private_open.payload.segment_state.challenges.challenges[0];
        for (const c of served.cards) expect(urls).toMatch(new RegExp(`/${c.media_key}/icon\\.png|${c.media_key}`, "i"));
      }
    });
  });
});
