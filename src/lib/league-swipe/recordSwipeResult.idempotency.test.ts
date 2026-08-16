/**
 * The frontend half of vote-RPC v2's idempotency, and an end-to-end proof that
 * the server half actually short-circuits on what the frontend now sends.
 *
 * WHY A MODELLED RPC RATHER THAN THE LIVE ONE
 * Proving the short-circuit against the real Supabase project would mean writing
 * real `league_swipe_results` rows and moving real `league_swipe_matchups`
 * counters — production data for a live game. The fake below is transcribed from
 * `supabase/migrations/20260813120300_meta_reflex_vote_rpc_v2.sql`: the
 * `p_client_submission_id is not null and exists (...)` guard, the early return
 * carrying the existing pair's counts with `duplicate: true`, and the
 * least/greatest pair normalisation. What it proves is the half that was
 * actually broken — that the browser sends the parameter, in the right name and
 * shape, so the guard can fire at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { recordSwipeResult } from "./api";
import { newSubmissionId } from "./submissionId";

/** Transcribed from the v2 migration — see the file header. */
function makeFakeVoteRpc() {
  const results: Array<Record<string, unknown>> = [];
  const matchups = new Map<string, { entityA: string; entityB: string; votesA: number; votesB: number }>();

  const fn = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    const selected = args.p_selected as string;
    const other = args.p_other as string;
    const submissionId = args.p_client_submission_id as string | null;
    const entityA = selected < other ? selected : other;
    const entityB = selected < other ? other : selected;
    const variant = ((args.p_context as { stat?: string } | null)?.stat ?? "") as string;
    const key = `${args.p_game_slug}|${entityA}|${entityB}|${variant}`;

    // ---- idempotency short-circuit -----------------------------------------
    if (
      submissionId != null &&
      results.some((r) => r.client_submission_id === submissionId)
    ) {
      const m = matchups.get(key);
      return {
        data: {
          matchupId: key,
          entityA,
          entityB,
          votesA: m?.votesA ?? 0,
          votesB: m?.votesB ?? 0,
          totalVotes: (m?.votesA ?? 0) + (m?.votesB ?? 0),
          isCorrect: null,
          ratingChange: null,
          selectedRating: null,
          otherRating: null,
          duplicate: true,
        },
        error: null,
      };
    }

    // ---- factual games: every attempt counts --------------------------------
    const m = matchups.get(key) ?? { entityA, entityB, votesA: 0, votesB: 0 };
    if (selected === entityA) m.votesA += 1;
    else m.votesB += 1;
    matchups.set(key, m);

    results.push({ client_submission_id: submissionId, selected_entity: selected });

    return {
      data: {
        matchupId: key,
        entityA,
        entityB,
        votesA: m.votesA,
        votesB: m.votesB,
        totalVotes: m.votesA + m.votesB,
        isCorrect: null,
        ratingChange: null,
        selectedRating: null,
        otherRating: null,
        duplicate: false,
      },
      error: null,
    };
  });

  return { fn, results, matchups };
}

const attempt = (clientSubmissionId?: string) => ({
  gameSlug: "item-cost-duel",
  selected: "Infinity Edge",
  other: "Bloodthirster",
  correct: "Infinity Edge",
  context: { stat: "cost" },
  clientSubmissionId,
});

beforeEach(() => vi.clearAllMocks());

describe("recordSwipeResult submission identity", () => {
  it("sends p_client_submission_id to the RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const id = newSubmissionId();

    await recordSwipeResult(attempt(id));

    expect(rpc).toHaveBeenCalledWith(
      "record_league_swipe_result",
      expect.objectContaining({ p_client_submission_id: id }),
    );
  });

  it("regression: the parameter is never silently dropped", async () => {
    // The whole defect was an args object that simply did not carry the key, so
    // PostgREST applied the SQL default NULL and the `is not null` guard could
    // never fire. Assert the key is PRESENT, not merely that it round-trips.
    rpc.mockResolvedValue({ data: null, error: null });
    await recordSwipeResult(attempt(newSubmissionId()));

    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args)).toContain("p_client_submission_id");
    expect(args.p_client_submission_id).not.toBeNull();
  });

  it("passes null when no id is supplied, preserving the old behaviour", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await recordSwipeResult(attempt(undefined));

    expect(rpc).toHaveBeenCalledWith(
      "record_league_swipe_result",
      expect.objectContaining({ p_client_submission_id: null }),
    );
  });

  it("does not disturb any other RPC argument", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await recordSwipeResult(attempt("11111111-1111-4111-8111-111111111111"));

    expect(rpc.mock.calls[0][1]).toEqual({
      p_game_slug: "item-cost-duel",
      p_selected: "Infinity Edge",
      p_other: "Bloodthirster",
      p_correct_entity: "Infinity Edge",
      p_selected_value: null,
      p_other_value: null,
      p_response_time_ms: null,
      p_context: { stat: "cost" },
      p_client_submission_id: "11111111-1111-4111-8111-111111111111",
    });
  });
});

describe("duplicate submission short-circuit (modelled RPC)", () => {
  it("a retry with the SAME id writes exactly one result row", async () => {
    const fake = makeFakeVoteRpc();
    rpc.mockImplementation(fake.fn);
    const id = newSubmissionId();

    const first = await recordSwipeResult(attempt(id));
    const retry = await recordSwipeResult(attempt(id)); // identical logical submission

    expect(fake.results).toHaveLength(1);
    expect(first?.duplicate).toBe(false);
    expect(retry?.duplicate).toBe(true);
  });

  it("a retry does not move the community vote counters", async () => {
    const fake = makeFakeVoteRpc();
    rpc.mockImplementation(fake.fn);
    const id = newSubmissionId();

    const first = await recordSwipeResult(attempt(id));
    await recordSwipeResult(attempt(id));
    await recordSwipeResult(attempt(id));
    const after = await recordSwipeResult(attempt(id));

    expect(fake.results).toHaveLength(1);
    expect(after?.totalVotes).toBe(first?.totalVotes);
    expect(after?.totalVotes).toBe(1);
  });

  it("the retry still reports the real counts, so the reveal needs no special case", async () => {
    const fake = makeFakeVoteRpc();
    rpc.mockImplementation(fake.fn);

    await recordSwipeResult({ ...attempt(newSubmissionId()), selected: "Bloodthirster", other: "Infinity Edge" });
    const id = newSubmissionId();
    const first = await recordSwipeResult(attempt(id));
    const retry = await recordSwipeResult(attempt(id));

    expect(retry?.votesA).toBe(first?.votesA);
    expect(retry?.votesB).toBe(first?.votesB);
    expect(retry?.totalVotes).toBe(2);
  });

  it("a genuinely NEW attempt on the same pair still counts", async () => {
    // Practice repeats are legitimate gameplay. Idempotency must dedupe RETRIES,
    // never a second real answer to the same pair.
    const fake = makeFakeVoteRpc();
    rpc.mockImplementation(fake.fn);

    await recordSwipeResult(attempt(newSubmissionId()));
    await recordSwipeResult(attempt(newSubmissionId()));

    expect(fake.results).toHaveLength(2);
  });

  it("without an id the protection is inert — the defect this slice fixes", async () => {
    const fake = makeFakeVoteRpc();
    rpc.mockImplementation(fake.fn);

    await recordSwipeResult(attempt(undefined));
    await recordSwipeResult(attempt(undefined));

    // Two rows from one logical submission: exactly the production behaviour
    // before this change, reproduced here so the fix cannot silently regress.
    expect(fake.results).toHaveLength(2);
  });
});
