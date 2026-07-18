import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ResolvedRoundFetchError,
  buildResolvedRoundUrl,
  fetchResolvedRound,
} from "./fetchResolvedRound";
import { getResolvedEnvelopeScenario } from "@/lib/ranked-core/transport/rankedDuelEnvelopeFixtures";
import { adaptResolvedRoundEnvelope } from "@/lib/ranked-core/transport/adaptResolvedRoundEnvelope";
import {
  FIXTURE_PLAYER_IDS,
  getScenario,
} from "@/lib/ranked-core/backend/backendSettlementFixtures";
import { adaptBackendSettlement } from "@/lib/ranked-core/backend/adaptBackendSettlement";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const envelope = (key = "solo-correct") => clone(getResolvedEnvelopeScenario(key)!.envelope);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const mockFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const expectKind = async (
  promise: Promise<unknown>,
  kind: ResolvedRoundFetchError["kind"],
): Promise<ResolvedRoundFetchError> => {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ResolvedRoundFetchError);
    expect((err as ResolvedRoundFetchError).kind).toBe(kind);
    return err as ResolvedRoundFetchError;
  }
  throw new Error(`expected ${kind} error`);
};

describe("fetchResolvedRound — request construction", () => {
  it("builds the exact endpoint URL", () => {
    expect(buildResolvedRoundUrl("http://127.0.0.1:8000/", "m1", 3)).toBe(
      "http://127.0.0.1:8000/api/ranked-duels/m1/rounds/3/resolved",
    );
  });

  it("URL-encodes the match id", async () => {
    const fn = mockFetch(async () => jsonResponse(envelope()));
    await fetchResolvedRound({
      baseUrl: "http://x",
      matchId: "mock-match-001",
      roundNumber: 1,
    }).catch(() => undefined);
    expect(buildResolvedRoundUrl("http://x", "a b/c?", 1)).toBe(
      "http://x/api/ranked-duels/a%20b%2Fc%3F/rounds/1/resolved",
    );
    expect(fn).toHaveBeenCalledWith(
      "http://x/api/ranked-duels/mock-match-001/rounds/1/resolved",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects an invalid round number BEFORE any network call", async () => {
    const fn = mockFetch(async () => jsonResponse(envelope()));
    for (const bad of [0, -1, 1.5, NaN]) {
      await expectKind(
        fetchResolvedRound({ baseUrl: "http://x", matchId: "m", roundNumber: bad }),
        "invalid_request",
      );
    }
    await expectKind(
      fetchResolvedRound({ baseUrl: "http://x", matchId: "  ", roundNumber: 1 }),
      "invalid_request",
    );
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("fetchResolvedRound — success and validation", () => {
  it("returns the strictly validated five-field envelope on success", async () => {
    const env = envelope("shield-plus-reduction");
    mockFetch(async () => jsonResponse(env));
    const result = await fetchResolvedRound({
      baseUrl: "http://x",
      matchId: env.match_id,
      roundNumber: env.round_number,
    });
    expect(result).toEqual(env);
  });

  it("rejects a 200 response with a malformed envelope via the exact validator", async () => {
    const bad = envelope() as unknown as Record<string, unknown>;
    bad.event_id = "evt-1"; // sixth field — only the strict validator catches this
    mockFetch(async () => jsonResponse(bad));
    const err = await expectKind(
      fetchResolvedRound({ baseUrl: "http://x", matchId: "m", roundNumber: 1 }),
      "invalid_envelope",
    );
    expect(err.message).toMatch(/unexpected field "event_id"/);
  });

  it("handles malformed JSON on a 200 response", async () => {
    mockFetch(async () => new Response("not-json{", { status: 200 }));
    await expectKind(
      fetchResolvedRound({ baseUrl: "http://x", matchId: "m", roundNumber: 1 }),
      "invalid_json",
    );
  });
});

describe("fetchResolvedRound — backend error mapping", () => {
  const backendError = (status: number, error_code: string) =>
    jsonResponse({ detail: { error_code, message: `msg for ${error_code}` } }, status);

  it("maps 404 with the backend error_code", async () => {
    mockFetch(async () => backendError(404, "ranked_duel_match_not_found"));
    const err = await expectKind(
      fetchResolvedRound({ baseUrl: "http://x", matchId: "nope", roundNumber: 1 }),
      "match_or_round_not_found",
    );
    expect(err.status).toBe(404);
    expect(err.errorCode).toBe("ranked_duel_match_not_found");
  });

  it("maps 409 round-not-resolved", async () => {
    mockFetch(async () => backendError(409, "ranked_duel_round_not_resolved"));
    const err = await expectKind(
      fetchResolvedRound({ baseUrl: "http://x", matchId: "m", roundNumber: 5 }),
      "round_not_resolved",
    );
    expect(err.errorCode).toBe("ranked_duel_round_not_resolved");
  });

  it("maps 500 projection errors", async () => {
    mockFetch(async () => backendError(500, "ranked_duel_projection_error"));
    const err = await expectKind(
      fetchResolvedRound({ baseUrl: "http://x", matchId: "m", roundNumber: 1 }),
      "backend_error",
    );
    expect(err.status).toBe(500);
  });

  it("maps unexpected statuses (even with a non-JSON body)", async () => {
    mockFetch(async () => new Response("teapot", { status: 418 }));
    const err = await expectKind(
      fetchResolvedRound({ baseUrl: "http://x", matchId: "m", roundNumber: 1 }),
      "unexpected_status",
    );
    expect(err.status).toBe(418);
  });

  it("maps network failure and never retries", async () => {
    const fn = mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expectKind(
      fetchResolvedRound({ baseUrl: "http://down", matchId: "m", roundNumber: 1 }),
      "network",
    );
    expect(fn).toHaveBeenCalledTimes(1); // no automatic retry
  });

  it("maps an aborted request distinctly", async () => {
    mockFetch(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    await expectKind(
      fetchResolvedRound({
        baseUrl: "http://x",
        matchId: "m",
        roundNumber: 1,
        signal: new AbortController().signal,
      }),
      "aborted",
    );
  });
});

describe("fetchResolvedRound — identity stays outside the client", () => {
  it("returns the raw envelope untouched; mapping happens at the call site", async () => {
    const env = envelope("match-over");
    mockFetch(async () => jsonResponse(env));
    const fetched = await fetchResolvedRound({
      baseUrl: "http://x",
      matchId: env.match_id,
      roundNumber: env.round_number,
    });
    // No p1/p2, winner, or adapted field exists on the client's output.
    expect(JSON.stringify(fetched)).not.toMatch(/"p1"|"p2"|winner":|playerId/);
    // The SAME existing seam adapts it afterwards.
    const adapted = adaptResolvedRoundEnvelope(fetched, FIXTURE_PLAYER_IDS);
    expect(adapted).toEqual(
      adaptBackendSettlement(getScenario("match-over")!.settlement, FIXTURE_PLAYER_IDS),
    );
    expect(adapted.winner).toBe("p1");
  });

  it("lexically reversed backend ids still map correctly at the call site", async () => {
    const env = envelope("solo-correct");
    const rename = (id: string) => (id === "alice" ? "zed" : "adam");
    env.payload.players = env.payload.players
      .map((p) => ({ ...p, player_id: rename(p.player_id) }))
      .sort((a, b) => (a.player_id < b.player_id ? -1 : 1));
    mockFetch(async () => jsonResponse(env));
    const fetched = await fetchResolvedRound({
      baseUrl: "http://x",
      matchId: env.match_id,
      roundNumber: 1,
    });
    const adapted = adaptResolvedRoundEnvelope(fetched, {
      p1PlayerId: "zed",
      p2PlayerId: "adam",
    });
    expect(adapted.players.p1.playerId).toBe("zed");
    expect(adapted.players.p1.finalDamageDealt).toBe(30);
  });

  it("an unknown winner id fails closed at the call site", async () => {
    const env = envelope("match-over");
    env.payload.winner_id = "mallory";
    mockFetch(async () => jsonResponse(env));
    const fetched = fetchResolvedRound({
      baseUrl: "http://x",
      matchId: env.match_id,
      roundNumber: env.round_number,
    });
    // Envelope shell is fine; the identity failure surfaces in the adapter.
    const raw = await fetched;
    expect(() => adaptResolvedRoundEnvelope(raw, FIXTURE_PLAYER_IDS)).toThrow(
      /unrecognized winner_id/,
    );
  });
});
