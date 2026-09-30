/**
 * OF1-C — Order Forge against REAL server JSON.
 *
 * `__fixtures__/orderForgeServerCapture.json` is not hand-written. It is the
 * set of HTTP response bodies the backend's
 * `test_order_forge_wire_contract.py` collected while playing one admin
 * `admin.order_forge` match through the real Ranked routes (queue join,
 * snapshots, submit, errors, resume, resolved rounds, result, review), written
 * out with `OF1_WIRE_CAPTURE_PATH`. Segment 1 is locked wrong, segment 2 is
 * locked exactly right, segment 3 is never locked.
 *
 * Every other Order Forge test on this side reads `fixtures.ts`, which a
 * frontend author wrote. This one is what proves the two committed
 * implementations agree: the bytes below came out of the server, and they go
 * through the same readers and components the live page uses.
 *
 * Regenerate the capture whenever the backend contract changes; never edit it.
 */
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import { questionOutcome } from "@/components/quiz/workspace/questionIcons";
import { segmentScoreline } from "@/components/ranked-arena/SegmentResultBeat";
import { SegmentTranscript } from "@/components/ranked-arena/SegmentTranscript";
import { orderForgeModule } from "@/lib/ranked-core/modules/orderForgeModule";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import type { ModuleSegmentActions } from "@/lib/ranked-core/modules/types";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import capture from "./__fixtures__/orderForgeServerCapture.json";
import {
  readMatchResult, readMatchReview, readPrivatePlayer, readPublicRound,
  readQueueStatus, readResolvedEnvelope, readResume, readSegmentSettlement,
  type PrivatePlayerView,
} from "./contracts";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer t" })),
}));
import * as api from "./client";
import { RankedApiError } from "./client";

const VIEWER = capture.meta.viewer_user_id;
const SUBMITTED = capture.meta.submitted_order_segment_1;
const CANONICAL = capture.meta.canonical_order_segment_1;

type RawState = {
  challenges: { challenges: { entries: { entry_id: string; label: string;
    media: { src: string; alt: string } | null }[] }[] };
  own_challenge_reveals: { entries: { entry_id: string; label: string;
    value_display: string }[] }[];
};
const rawState = (body: { payload: { segment_state: unknown } }) =>
  body.payload.segment_state as RawState;

const opponentOf = (view: PrivatePlayerView) =>
  view.players.map((p) => p.playerId).find((id) => id !== VIEWER)!;

function actions(over: Partial<ModuleSegmentActions> = {}): ModuleSegmentActions {
  return { submitChallenge: vi.fn(), busy: false, error: null, ...over };
}

function viewport(view: PrivatePlayerView, acts = actions(), skewMs = 0) {
  return render(
    <orderForgeModule.Viewport publicRound={view} selection={null}
      permissions={NO_INTERACTIONS} onSelect={vi.fn()}
      segmentState={view.segmentState} actions={acts} skewMs={skewMs} />,
  );
}

/** Skew that puts "now" five seconds after the captured server clock. */
const skewFor = (serverTime: string) => Date.parse(serverTime) + 5000 - Date.now();

const cardOrder = () =>
  screen.getAllByTestId(/^forge-card-e\d$/).map((el) => el.getAttribute("data-testid")!.slice(-2));

afterEach(() => vi.unstubAllGlobals());

describe("server capture — request", () => {
  it("the serializer emits the exact bytes the backend accepted", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit = {}) => {
      calls.push(init);
      return new Response(JSON.stringify(capture.submit_accepted), { status: 200 });
    }));
    const ack = await api.submitSegmentChallenge("m", 1, 0, { order: SUBMITTED });
    expect(calls[0].body).toBe(capture.submit_request_bytes);
    expect(ack.segmentResolved).toBe(false);
    expect(ack.nextChallengeIndex).toBe(1);
  });

  it("reads the idempotent retry and the conflicting reorder acks", async () => {
    for (const [body, conflicting] of [
      [capture.submit_retry, false], [capture.submit_conflict, true]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify(body), { status: 200 })));
      const ack = await api.submitSegmentChallenge("m", 1, 0, { order: SUBMITTED });
      expect(ack.idempotent).toBe(true);
      expect(ack.conflicting).toBe(conflicting);
    }
  });

  it("turns both refusal bodies into a RankedApiError, never a parsed ack", async () => {
    for (const [refusal, code] of [
      [capture.error_schema_422, null],
      [capture.error_invalid_choice, "RANKED_INVALID_CHOICE"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify(refusal.body), { status: refusal.status })));
      const err = await api.submitSegmentChallenge("m", 1, 0, { order: SUBMITTED })
        .catch((e) => e);
      expect(err).toBeInstanceOf(RankedApiError);
      expect((err as RankedApiError).status).toBe(422);
      expect((err as RankedApiError).code).toBe(code);
    }
  });
});

describe("server capture — live segment", () => {
  it("reads the queue join and the admin preset off the snapshot", () => {
    expect(readQueueStatus(capture.queue_join).status).toBe("matched");
    expect(readPublicRound(capture.public_open).playtest?.sessionPreset)
      .toBe(capture.meta.preset);
  });

  it("reads the public block exactly as the server froze it", () => {
    const view = readPrivatePlayer(capture.private_open);
    expect(view.segment.moduleId).toBe("order_forge");
    expect(view.segment.moduleVersion).toBe(1);
    expect(rendererForSegment(view.segment)).toBe(orderForgeModule);
    const state = view.segmentState!;
    const served = rawState(capture.private_open).challenges.challenges[0].entries;
    expect(state.block).toEqual({
      contract: "order_forge",
      prompt: "Order these items by gold cost",
      metricLabel: "Gold cost",
      directionLabels: { first: "Most expensive", last: "Cheapest" },
      entries: served.map((e) => ({ entryId: e.entry_id, label: e.label, media: e.media })),
    });
    expect(served).toHaveLength(5);
    expect(state.ownSubmittedChoices).toEqual([null]);
    expect(state.ownChallengeReveals).toEqual([]);
    expect(state.revealWindowMs).toBe(2500);
    expect(readPublicRound(capture.public_open).segmentState!.block).toEqual(state.block);
  });

  it("renders the served cards in the served order, with no value on screen", () => {
    const view = readPrivatePlayer(capture.private_open);
    const acts = actions();
    const { container } = viewport(view, acts, skewFor(capture.private_open.server_time));
    expect(cardOrder()).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    for (const e of rawState(capture.private_open).challenges.challenges[0].entries) {
      expect(screen.getByTestId(`forge-card-${e.entry_id}`)).toHaveTextContent(e.label);
    }
    expect(container.textContent).not.toMatch(/\d+ g\b/);
    expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-phase", "open");
    screen.getByTestId("forge-lock").click();
    expect(acts.submitChallenge).toHaveBeenCalledWith(0, { order: ["e0", "e1", "e2", "e3", "e4"] });
  });

  it("a refused lock leaves the server state open, so the input reopens", () => {
    const state = readPrivatePlayer(capture.private_after_refusal).segmentState!;
    expect(state.ownNextChallengeIndex).toBe(0);
    expect(state.ownSubmittedChoices).toEqual([null]);
    viewport(readPrivatePlayer(capture.private_after_refusal), actions(),
      skewFor(capture.private_after_refusal.server_time));
    expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-phase", "open");
    expect(screen.getByTestId("forge-lock")).toBeInTheDocument();
  });

  it("reads the echo and the viewer's own reveal once locked", () => {
    const state = readPrivatePlayer(capture.private_locked).segmentState!;
    expect(state.ownSubmittedChoices).toEqual([SUBMITTED]);
    expect(state.ownNextChallengeIndex).toBe(1);
    expect(state.ownChallengeReveals).toHaveLength(1);
    const forge = state.ownChallengeReveals[0].orderForge!;
    expect(forge.order).toEqual(SUBMITTED);
    expect(forge.canonicalOrder).toEqual(CANONICAL);
    expect(forge.isCorrect).toBe(false);
    expect(forge.positionCorrect).toEqual(SUBMITTED.map((id, i) => id === CANONICAL[i]));
    const served = rawState(capture.private_locked).own_challenge_reveals[0].entries;
    expect(forge.valueDisplay).toEqual(
      Object.fromEntries(served.map((e) => [e.entry_id, e.value_display])));
    expect(Object.keys(forge.valueDisplay)).toHaveLength(5);
    // The resume envelope carries the same state (a reload mid-segment).
    expect(readResume(capture.resume_locked).private.segmentState!.ownChallengeReveals)
      .toEqual(state.ownChallengeReveals);
  });

  it("renders the served reveal: my order beside the correct one", () => {
    viewport(readPrivatePlayer(capture.private_locked));
    expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-phase", "revealed");
    expect(screen.queryByTestId("forge-lock")).toBeNull();
    const served = rawState(capture.private_locked).own_challenge_reveals[0].entries;
    const label = new Map(served.map((e) => [e.entry_id, e]));
    const rows = (testId: string) =>
      within(screen.getByTestId(testId)).getAllByRole("listitem");
    rows("forge-reveal-mine").forEach((row, i) => {
      expect(row).toHaveTextContent(label.get(SUBMITTED[i])!.label);
      expect(row).toHaveTextContent(label.get(SUBMITTED[i])!.value_display);
    });
    rows("forge-reveal-correct").forEach((row, i) => {
      expect(row).toHaveTextContent(label.get(CANONICAL[i])!.label);
    });
    expect(screen.getByTestId("forge-verdict")).toHaveAttribute("data-correct", "false");
  });

  it("a refresh before the reveal restores the locked order from the echo", () => {
    const body = structuredClone(capture.private_locked);
    (body.payload.segment_state as { own_challenge_reveals: unknown[] })
      .own_challenge_reveals = [];
    viewport(readPrivatePlayer(body));
    expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-phase", "locked");
    expect(screen.queryByTestId("forge-lock")).toBeNull();
    const rows = within(screen.getByTestId("forge-list-locked")).getAllByRole("listitem");
    const served = rawState(capture.private_locked).challenges.challenges[0].entries;
    const label = new Map(served.map((e) => [e.entry_id, e.label]));
    rows.forEach((row, i) => expect(row).toHaveTextContent(label.get(SUBMITTED[i])!));
  });

  it("nothing about the opponent is in the viewer's pre-settlement state", () => {
    const view = readPrivatePlayer(capture.private_locked);
    const opponent = opponentOf(view);
    for (const body of [capture.private_locked, capture.public_locked]) {
      expect(JSON.stringify(body.payload.segment_state)).not.toContain(opponent);
    }
    expect(view.segmentState!.opponentFinished).toBe(false);
  });

  it("in a bot match the lock settles the segment and the snapshot moves on", () => {
    expect(capture.submit_accepted_bot_settled.segment_resolved).toBe(true);
    const view = readPrivatePlayer(capture.private_after_bot_settled);
    expect(view.segmentState!.segmentNumber).toBe(3);
    expect(view.segmentState!.ownSubmittedChoices).toEqual([null]);
    expect(view.segmentState!.ownChallengeReveals).toEqual([]);
  });
});

describe("server capture — settled segment", () => {
  const settled = [
    ["resolved_incorrect", capture.resolved_incorrect],
    ["resolved_correct", capture.resolved_correct],
    ["resolved_timeout", capture.resolved_timeout],
  ] as const;

  it.each(settled)("reads %s: both orders, marks and a Ranked segment result", (_n, body) => {
    const payload = readResolvedEnvelope(body).payload;
    const settlement = readSegmentSettlement(payload)!;
    const reveal = settlement.reveal;
    const raw = body.payload.segment_reveal;
    expect(reveal.moduleId).toBe("order_forge");
    expect(reveal.challengeCount).toBe(1);
    expect(reveal.orderForge!.canonicalOrder).toEqual(raw.canonical_order);
    expect(Object.keys(reveal.orderForge!.valueDisplay)).toHaveLength(5);
    for (const [pid, p] of Object.entries(raw.players)) {
      expect(reveal.orderForge!.orders[pid]).toEqual(p.order);
      expect(reveal.orderForge!.positionCorrect[pid]).toEqual(p.position_correct);
      // The server's word, read — not dropped to null as an unknown value.
      expect(reveal.players[pid].segmentResult).toBe(p.segment_result);
      expect(["win", "loss", "draw", "timeout"]).toContain(p.segment_result);
      expect(reveal.players[pid].speedBonus).toBe(p.speed_bonus_points);
      // The tallies are the server's, out of `challengeCount` — not defaulted.
      expect([reveal.players[pid].correct, reveal.players[pid].incorrect,
        reveal.players[pid].unanswered]).toEqual([p.correct, p.incorrect, p.unanswered]);
      expect(p.correct + p.incorrect + p.unanswered).toBe(1);
    }
  });

  it("the accessible scoreline states the exact sequence as 1/1, not 0/1", () => {
    const settlement = readSegmentSettlement(capture.resolved_correct.payload)!;
    const opponent = Object.keys(capture.resolved_correct.payload.segment_reveal.players)
      .find((id) => id !== VIEWER)!;
    expect(segmentScoreline(settlement, VIEWER, opponent, null, true)).toMatch(/^YOU 1\/1 · OPP [01]\/1$/);
    const timedOut = readSegmentSettlement(capture.resolved_timeout.payload)!;
    expect(segmentScoreline(timedOut, VIEWER, opponent, null, true)).toMatch(/^YOU 0\/1/);
  });

  it.each(settled)("renders the %s transcript from the served reveal", (_n, body) => {
    const settlement = readSegmentSettlement(body.payload)!;
    const raw = body.payload.segment_reveal;
    const opponent = Object.keys(raw.players).find((id) => id !== VIEWER)!;
    render(<SegmentTranscript reveal={settlement.reveal} viewerUserId={VIEWER}
      opponentUserId={opponent} />);
    const word = { win: "Win", loss: "Loss", draw: "Draw", timeout: "Timeout" }[
      raw.players[VIEWER as keyof typeof raw.players].segment_result as "win"];
    expect(screen.getByTestId("icd-transcript-result")).toHaveTextContent(word);
    const name = new Map(raw.entries.map((e) => [e.entry_id, e.label]));
    const line = (ids: readonly string[] | null) =>
      ids ? ids.map((id) => name.get(id)).join(" → ") : "No answer";
    expect(screen.getByTestId("of-transcript-correct")).toHaveTextContent(line(raw.canonical_order));
    expect(screen.getByTestId("of-transcript-you"))
      .toHaveTextContent(line(raw.players[VIEWER as keyof typeof raw.players].order));
    expect(screen.getByTestId("of-transcript-them"))
      .toHaveTextContent(line(raw.players[opponent as keyof typeof raw.players].order));
  });

  it("reads the terminal result and the final resume envelope", () => {
    const result = readMatchResult(capture.result);
    expect(result.scoring?.model).toBe("points");
    expect(result.scoring?.finalScores[VIEWER])
      .toBe(capture.result.payload.scoring.final_scores[VIEWER as "x"]);
    const resume = readResume(capture.resume_final);
    expect(resume.matchOver).toBe(true);
    expect(readSegmentSettlement(resume.latestResolved!.payload)!.reveal.moduleId)
      .toBe("order_forge");
  });
});

describe("server capture — match review", () => {
  const review = readMatchReview(capture.review);
  const raw = capture.review.payload.rounds;

  it("reads three order_forge rounds with the server's outcome for each", () => {
    expect(review.rounds.map((r) => r.kind)).toEqual(["order_forge", "order_forge", "order_forge"]);
    expect(review.rounds.map((r) => r.orderForge!.outcome))
      .toEqual(["incorrect", "correct", "timeout"]);
    // The timeline's own three-value vocabulary: a timeout tints as unanswered.
    expect(review.rounds.map(questionOutcome)).toEqual(["incorrect", "correct", "unanswered"]);
    review.rounds.forEach((round, i) => {
      const of = round.orderForge!;
      expect(round.revealed).toBe(true);
      expect(of.viewerOrder).toEqual(raw[i].viewer_order);
      expect(of.canonicalOrder).toEqual(raw[i].canonical_order);
      expect(of.positionCorrect).toEqual(raw[i].position_correct);
      expect(of.entries.map((e) => [e.entryId, e.label, e.media, e.valueDisplay]))
        .toEqual(raw[i].entries.map((e) => [e.entry_id, e.label, e.media.src, e.value_display]));
    });
    expect(review.rounds[0].orderForge!.viewerOrder).toEqual(SUBMITTED);
  });

  it("renders my order beside the correct order, marked by the server", () => {
    render(<QuestionReviewCard round={review.rounds[0]} position={1} total={3} />);
    const name = new Map(raw[0].entries.map((e) => [e.entry_id, e]));
    const mine = within(screen.getByTestId("review-order-mine")).getAllByRole("listitem");
    mine.forEach((row, i) => {
      expect(row).toHaveTextContent(name.get(SUBMITTED[i])!.label);
      expect(row).toHaveTextContent(name.get(SUBMITTED[i])!.value_display);
      expect(row).toHaveAttribute("data-mark", String(raw[0].position_correct[i]));
    });
    const correct = within(screen.getByTestId("review-order-correct")).getAllByRole("listitem");
    correct.forEach((row, i) =>
      expect(row).toHaveTextContent(name.get(raw[0].canonical_order[i])!.label));
  });

  it("renders a round that was never locked without inventing an order", () => {
    render(<QuestionReviewCard round={review.rounds[2]} position={3} total={3} />);
    expect(screen.getByTestId("review-order-forge"))
      .toHaveTextContent("You did not lock in an order.");
    expect(screen.queryByTestId("review-order-mine")).toBeNull();
    expect(screen.getByTestId("review-order-correct")).toBeInTheDocument();
  });
});
