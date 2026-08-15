/**
 * Derive-on-read: factual correctness is judged when it is READ, never stored.
 *
 * WHY THE READERS LOOK LIKE THIS
 * `league_swipe_results.verified_correct` is NULL on every row and stays that
 * way. Filling it would need a privileged Supabase writer, and the trust audit
 * established that no such writer would actually be trustworthy: the backend
 * authenticates AS THE CALLER, so a definer function that accepted
 * `verified_correct` from its caller would be trusting the browser through one
 * more hop. Correctness is therefore re-derived from canonical data at read
 * time, by the same verifier the game uses at play time.
 *
 * The invariants these tests protect:
 *   1. A reader never treats `is_correct` or a client claim as truth.
 *   2. An UNJUDGED answer (null) is never rendered or counted as WRONG.
 *   3. Verdicts stay positionally aligned with the rows they describe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

import {
  fetchFactualCommunityAccuracy,
  fetchMyRecentResults,
  verifyFactualBatch,
  FACTUAL_VERIFY_BATCH_LIMIT,
} from "./api";

const GAMES = [
  { id: "g-item", slug: "item-cost-duel", title: "Item Cost Duel", mode: "knowledge" },
  { id: "g-stat", slug: "higher-base-stat", title: "Stat Duel", mode: "knowledge" },
  { id: "g-fav", slug: "favorite-champion", title: "Favorite Champion", mode: "opinion" },
];

/** Minimal PostgREST-shaped chainable builder. */
function table(rows: unknown[], error: unknown = null) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "in", "eq", "order", "not"]) {
    b[m] = vi.fn(() => b);
  }
  b.limit = vi.fn(() => Promise.resolve({ data: rows, error }));
  // Awaiting the builder directly (no .limit()) must also resolve.
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(res);
  return b;
}

function mockTables(map: Record<string, unknown[]>) {
  supabaseMock.from.mockImplementation((name: string) => table(map[name] ?? []));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** Reply to a verify-batch POST with one verdict per submitted item. */
function respondWithVerdicts(make: (item: { category_id: string; selected: string; other: string }) => unknown) {
  fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
    const { items } = JSON.parse(init.body) as {
      items: Array<{ category_id: string; selected: string; other: string }>;
    };
    return { ok: true, json: async () => ({ ok: true, verdicts: items.map(make) }) };
  });
}

// ───────────────────────────── verifyFactualBatch ──────────────────────────

describe("verifyFactualBatch", () => {
  it("sends no correctness claim of any kind", async () => {
    respondWithVerdicts((i) => ({ ...i, correct_id: i.selected, verified_correct: true, verdict_source: "server", reason: null }));
    await verifyFactualBatch([{ category_id: "item-cost-duel", selected: "A", other: "B" }]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const keys = Object.keys(body.items[0]).sort();
    expect(keys).toEqual(["category_id", "other", "selected"]);
  });

  it("returns all-unjudged rather than throwing when the backend is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const out = await verifyFactualBatch([
      { category_id: "item-cost-duel", selected: "A", other: "B" },
      { category_id: "item-cost-duel", selected: "C", other: "D" },
    ]);
    expect(out).toEqual([null, null]);
  });

  it("discards a response whose length does not match the request", async () => {
    // Misalignment would mark one player's answer against another's question.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ verdicts: [{ verified_correct: true }] }) });
    const out = await verifyFactualBatch([
      { category_id: "item-cost-duel", selected: "A", other: "B" },
      { category_id: "item-cost-duel", selected: "C", other: "D" },
    ]);
    expect(out).toEqual([null, null]);
  });

  it("chunks past the backend's batch cap instead of getting rejected", async () => {
    respondWithVerdicts((i) => ({ ...i, correct_id: i.selected, verified_correct: true, verdict_source: "server", reason: null }));
    const n = FACTUAL_VERIFY_BATCH_LIMIT + 5;
    const out = await verifyFactualBatch(
      Array.from({ length: n }, (_, k) => ({ category_id: "item-cost-duel", selected: `A${k}`, other: `B${k}` })),
    );
    expect(out).toHaveLength(n);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.every((v) => v !== null)).toBe(true);
  });

  it("makes no request at all for an empty list", async () => {
    expect(await verifyFactualBatch([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────── fetchMyRecentResults ──────────────────────────

describe("fetchMyRecentResults", () => {
  const RESULTS = [
    { selected_entity: "Axiom Arc", other_entity: "Chempunk Chainsword", variant: "cost", response_time_ms: 1500, created_at: "2026-08-14T00:00:00Z", game_id: "g-item" },
    { selected_entity: "Garen", other_entity: "Ahri", variant: "hp", response_time_ms: 900, created_at: "2026-08-14T00:01:00Z", game_id: "g-stat" },
    { selected_entity: "Garen", other_entity: "Ahri", variant: "magic_resist", response_time_ms: 800, created_at: "2026-08-14T00:02:00Z", game_id: "g-stat" },
  ];

  beforeEach(() => {
    mockTables({ league_swipe_games: GAMES, league_swipe_results: RESULTS });
  });

  it("returns rows that the old is_correct filter made permanently invisible", async () => {
    // The regression: `.not("is_correct","is",null)` matched nothing once the v2
    // RPC started writing that column NULL, so the history panel was empty even
    // for a player who had just answered ten questions.
    respondWithVerdicts((i) => ({ ...i, correct_id: i.selected, verified_correct: true, verdict_source: "server", reason: null }));
    const rows = await fetchMyRecentResults(10);
    expect(rows).toHaveLength(3);
  });

  it("asks the RIGHT evaluator per row, using game slug plus variant", async () => {
    respondWithVerdicts((i) => ({ ...i, correct_id: i.selected, verified_correct: true, verdict_source: "server", reason: null }));
    await fetchMyRecentResults(10);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body).items;
    // magic_resist has no evaluator, so it is not sent at all.
    expect(sent).toEqual([
      { category_id: "item-cost-duel", selected: "Axiom Arc", other: "Chempunk Chainsword" },
      { category_id: "champion-hp-duel", selected: "Garen", other: "Ahri" },
    ]);
  });

  it("keeps an unverifiable row in the history as UNJUDGED, not as wrong", async () => {
    respondWithVerdicts((i) => ({ ...i, correct_id: i.selected, verified_correct: true, verdict_source: "server", reason: null }));
    const rows = await fetchMyRecentResults(10);

    const mr = rows.find((r) => r.variant === "magic_resist")!;
    expect(mr.verifiedCorrect).toBeNull();
    expect(mr.verifiedCorrect).not.toBe(false);
    expect(mr.correctEntity).toBeNull();
  });

  it("aligns each verdict with its own row when only some are verifiable", async () => {
    // The bug this guards: skipping unverifiable rows shifts every later verdict
    // up by one, so a player sees someone else's result on their question.
    respondWithVerdicts((i) => ({
      ...i,
      correct_id: i.category_id === "item-cost-duel" ? i.other : i.selected,
      verified_correct: i.category_id !== "item-cost-duel",
      verdict_source: "server",
      reason: null,
    }));
    const rows = await fetchMyRecentResults(10);

    expect(rows[0]).toMatchObject({ selectedEntity: "Axiom Arc", verifiedCorrect: false, correctEntity: "Chempunk Chainsword" });
    expect(rows[1]).toMatchObject({ selectedEntity: "Garen", variant: "hp", verifiedCorrect: true });
    expect(rows[2]).toMatchObject({ variant: "magic_resist", verifiedCorrect: null });
  });

  it("marks every row unjudged when the verifier is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const rows = await fetchMyRecentResults(10);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.verifiedCorrect === null)).toBe(true);
  });

  it("exposes no client-claimed correctness field to renderers", async () => {
    respondWithVerdicts((i) => ({ ...i, correct_id: i.selected, verified_correct: true, verdict_source: "server", reason: null }));
    const [row] = await fetchMyRecentResults(10);
    expect(row).not.toHaveProperty("is_correct");
    expect(row).not.toHaveProperty("client_claimed_correct");
  });
});

// ──────────────────── fetchFactualCommunityAccuracy ────────────────────────

describe("fetchFactualCommunityAccuracy", () => {
  it("derives accuracy from vote aggregates judged by the canonical verifier", async () => {
    mockTables({
      league_swipe_games: GAMES,
      league_swipe_matchups: [
        // 80 of 100 attempts picked entity_a...
        { game_id: "g-item", entity_a: "Axiom Arc", entity_b: "Chempunk Chainsword", variant: "cost", votes_a: 80, votes_b: 20 },
        // ...and 30 of 40 picked entity_a here.
        { game_id: "g-stat", entity_a: "Garen", entity_b: "Ahri", variant: "hp", votes_a: 30, votes_b: 10 },
      ],
    });
    // ...but canonically entity_b wins the item pair, so those 80 were misses.
    respondWithVerdicts((i) => ({
      ...i,
      correct_id: i.category_id === "item-cost-duel" ? i.other : i.selected,
      verified_correct: null,
      verdict_source: "server",
      reason: null,
    }));

    const acc = await fetchFactualCommunityAccuracy();
    expect(acc.attempts).toBe(140);
    expect(acc.correct).toBe(20 + 30);
    expect(acc.accuracy).toBeCloseTo(35.7, 1);
    expect(acc.judgedPairs).toBe(2);
    expect(acc.perGame["item-cost-duel"]).toBe(20);
    expect(acc.perGame["higher-base-stat"]).toBe(75);
  });

  it("ranks most-missed by wrong-side votes and names the canonical answer", async () => {
    mockTables({
      league_swipe_games: GAMES,
      league_swipe_matchups: [
        { game_id: "g-item", entity_a: "Axiom Arc", entity_b: "Chempunk Chainsword", variant: "cost", votes_a: 80, votes_b: 20 },
        { game_id: "g-stat", entity_a: "Garen", entity_b: "Ahri", variant: "hp", votes_a: 30, votes_b: 10 },
      ],
    });
    respondWithVerdicts((i) => ({ ...i, correct_id: i.other, verified_correct: null, verdict_source: "server", reason: null }));

    const acc = await fetchFactualCommunityAccuracy();
    expect(acc.mostMissed[0]).toMatchObject({
      entityA: "Axiom Arc", entityB: "Chempunk Chainsword",
      correct: "Chempunk Chainsword", missCount: 80,
    });
    expect(acc.mostMissed[1].missCount).toBe(30);
  });

  it("excludes an unjudged pair rather than scoring it as all-wrong", async () => {
    mockTables({
      league_swipe_games: GAMES,
      league_swipe_matchups: [
        { game_id: "g-item", entity_a: "A", entity_b: "B", variant: "cost", votes_a: 10, votes_b: 0 },
        { game_id: "g-item", entity_a: "Retired", entity_b: "Gone", variant: "cost", votes_a: 90, votes_b: 10 },
      ],
    });
    respondWithVerdicts((i) =>
      i.selected === "Retired"
        ? { ...i, correct_id: null, verified_correct: null, verdict_source: "unverified", reason: "not in the current canonical pool" }
        : { ...i, correct_id: i.selected, verified_correct: null, verdict_source: "server", reason: null },
    );

    const acc = await fetchFactualCommunityAccuracy();
    expect(acc.attempts).toBe(10);         // the 100 unjudged attempts are absent
    expect(acc.accuracy).toBe(100);        // not 10%
    expect(acc.judgedPairs).toBe(1);
    expect(acc.unjudgedPairs).toBe(1);
  });

  it("never reads matchups belonging to opinion games", async () => {
    mockTables({ league_swipe_games: GAMES, league_swipe_matchups: [] });
    respondWithVerdicts(() => ({}));
    await fetchFactualCommunityAccuracy();

    const builder = supabaseMock.from.mock.results
      .map((r) => r.value)
      .find((b: Record<string, unknown>) => (b.select as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.includes("votes_a"));
    expect((builder.in as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "game_id", ["g-item", "g-stat"],
    );
  });

  it("reports null accuracy, not zero, when nothing has been played", async () => {
    mockTables({ league_swipe_games: GAMES, league_swipe_matchups: [] });
    const acc = await fetchFactualCommunityAccuracy();
    expect(acc.accuracy).toBeNull();
    expect(acc.attempts).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
