import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PublicRoundFetchError,
  buildPublicRoundUrl,
  fetchPublicRound,
} from "./fetchPublicRound";
import { getPublicEnvelopeScenario } from "../transport-adapter/rankedDuelEnvelopeFixtures";
import { adaptPublicRound } from "../transport-adapter/adaptPublicRound";
import { PublicRoundEnvelope } from "../transport-adapter/rankedDuelEnvelopeTypes";

const IDS = { p1PlayerId: "alice", p2PlayerId: "bob" };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const envelope = (key = "public-active-question"): PublicRoundEnvelope =>
  clone(getPublicEnvelopeScenario(key)!.envelope);

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
  kind: PublicRoundFetchError["kind"],
): Promise<PublicRoundFetchError> => {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(PublicRoundFetchError);
    expect((err as PublicRoundFetchError).kind).toBe(kind);
    return err as PublicRoundFetchError;
  }
  throw new Error(`expected ${kind} error`);
};

describe("fetchPublicRound — request construction", () => {
  it("builds the exact public endpoint URL and URL-encodes the match id", async () => {
    expect(buildPublicRoundUrl("http://127.0.0.1:8000/", "m1")).toBe(
      "http://127.0.0.1:8000/api/ranked-duels/m1/rounds/current/public",
    );
    expect(buildPublicRoundUrl("http://x", "a b/c?")).toBe(
      "http://x/api/ranked-duels/a%20b%2Fc%3F/rounds/current/public",
    );
    const fn = mockFetch(async () => jsonResponse(envelope()));
    await fetchPublicRound({ baseUrl: "http://x", matchId: "mock-match-001" });
    expect(fn).toHaveBeenCalledWith(
      "http://x/api/ranked-duels/mock-match-001/rounds/current/public",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects an empty match id or base URL BEFORE any network call", async () => {
    const fn = mockFetch(async () => jsonResponse(envelope()));
    await expectKind(fetchPublicRound({ baseUrl: "http://x", matchId: "  " }), "invalid_request");
    await expectKind(fetchPublicRound({ baseUrl: "", matchId: "m" }), "invalid_request");
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("fetchPublicRound — success and validation", () => {
  it("returns the exact validated five-field public envelope", async () => {
    const env = envelope("public-both-submitted");
    mockFetch(async () => jsonResponse(env));
    const result = await fetchPublicRound({ baseUrl: "http://x", matchId: env.match_id });
    expect(result).toEqual(env);
  });

  it("rejects a malformed public envelope via the existing validator", async () => {
    const bad = envelope() as unknown as { payload: Record<string, unknown> };
    // A hidden/private field must be structurally rejected.
    bad.payload.own_selection = { phase: "open", selected_ability_id: "tank.fortify" };
    mockFetch(async () => jsonResponse(bad));
    const err = await expectKind(
      fetchPublicRound({ baseUrl: "http://x", matchId: "m" }),
      "invalid_envelope",
    );
    expect(err.message).toMatch(/unexpected field "own_selection"/);
  });

  it("handles malformed JSON on a 200 response", async () => {
    mockFetch(async () => new Response("nope{", { status: 200 }));
    await expectKind(fetchPublicRound({ baseUrl: "http://x", matchId: "m" }), "invalid_json");
  });
});

describe("fetchPublicRound — backend error mapping", () => {
  const backendError = (status: number, error_code: string) =>
    jsonResponse({ detail: { error_code, message: `msg for ${error_code}` } }, status);

  it("maps 404 match-not-found", async () => {
    mockFetch(async () => backendError(404, "ranked_duel_match_not_found"));
    const err = await expectKind(
      fetchPublicRound({ baseUrl: "http://x", matchId: "nope" }),
      "match_not_found",
    );
    expect(err.status).toBe(404);
    expect(err.errorCode).toBe("ranked_duel_match_not_found");
  });

  it("maps 409 no-active-round", async () => {
    mockFetch(async () => backendError(409, "ranked_duel_no_active_round"));
    const err = await expectKind(
      fetchPublicRound({ baseUrl: "http://x", matchId: "m" }),
      "no_active_round",
    );
    expect(err.errorCode).toBe("ranked_duel_no_active_round");
  });

  it("maps 500 projection errors", async () => {
    mockFetch(async () => backendError(500, "ranked_duel_projection_error"));
    const err = await expectKind(
      fetchPublicRound({ baseUrl: "http://x", matchId: "m" }),
      "backend_error",
    );
    expect(err.status).toBe(500);
  });

  it("maps unexpected statuses (even with a non-JSON body)", async () => {
    mockFetch(async () => new Response("teapot", { status: 418 }));
    const err = await expectKind(
      fetchPublicRound({ baseUrl: "http://x", matchId: "m" }),
      "unexpected_status",
    );
    expect(err.status).toBe(418);
  });

  it("maps network failure and never retries", async () => {
    const fn = mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expectKind(fetchPublicRound({ baseUrl: "http://down", matchId: "m" }), "network");
    expect(fn).toHaveBeenCalledTimes(1); // no automatic retry
  });

  it("maps an aborted request distinctly", async () => {
    mockFetch(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    await expectKind(
      fetchPublicRound({
        baseUrl: "http://x",
        matchId: "m",
        signal: new AbortController().signal,
      }),
      "aborted",
    );
  });
});

describe("fetchPublicRound — identity and privacy stay outside the client", () => {
  it("returns the raw envelope untouched; explicit mapping happens at the call site", async () => {
    const env = envelope("public-match-over");
    mockFetch(async () => jsonResponse(env));
    const fetched = await fetchPublicRound({ baseUrl: "http://x", matchId: env.match_id });
    expect(JSON.stringify(fetched)).not.toMatch(/"p1"|"p2"|playerId/);
    const adapted = adaptPublicRound(fetched, IDS);
    expect(adapted.winner).toBe("p1");
    // Pass-through facts, unchanged.
    expect(adapted.players.p2.hp).toBe(0);
    expect(adapted.players.p1.totalXp).toBe(16);
    expect(adapted.players.p1.level).toBe(1);
  });

  it("lexically reversed backend ids still map correctly at the call site", async () => {
    const env = envelope("public-first-submitted");
    const rename = (id: string) => (id === "alice" ? "zed" : "adam");
    env.payload.players = env.payload.players
      .map((p) => ({ ...p, player_id: rename(p.player_id) }))
      .sort((a, b) => (a.player_id < b.player_id ? -1 : 1));
    mockFetch(async () => jsonResponse(env));
    const fetched = await fetchPublicRound({ baseUrl: "http://x", matchId: env.match_id });
    const adapted = adaptPublicRound(fetched, { p1PlayerId: "zed", p2PlayerId: "adam" });
    expect(adapted.players.p1.playerId).toBe("zed");
    expect(adapted.players.p1.hasSubmitted).toBe(true); // still the submitter
    expect(adapted.players.p2.hasSubmitted).toBe(false);
  });

  it("an unknown non-null winner fails closed at the call site", async () => {
    const env = envelope("public-match-over");
    env.payload.winner_id = "mallory";
    mockFetch(async () => jsonResponse(env));
    const fetched = await fetchPublicRound({ baseUrl: "http://x", matchId: env.match_id });
    expect(() => adaptPublicRound(fetched, IDS)).toThrow(/unrecognized winner_id/);
  });

  it("fetched payload and adapted model contain no hidden or per-player-timer fields", async () => {
    const env = envelope("public-both-submitted");
    mockFetch(async () => jsonResponse(env));
    const fetched = await fetchPublicRound({ baseUrl: "http://x", matchId: env.match_id });
    const adapted = adaptPublicRound(fetched, IDS);
    for (const flat of [JSON.stringify(fetched).toLowerCase(), JSON.stringify(adapted).toLowerCase()]) {
      for (const banned of [
        "answer_index",
        "answer_text",
        "outcome",
        "correct",
        "selected_ability_id",
        "selectedability",
        "remaining_charges",
        "level2_choice",
        "damage",
        "shield",
      ]) {
        expect(flat, banned).not.toContain(banned);
      }
    }
    // Shared timer only — no timer-ish keys on the player objects.
    for (const p of Object.values(adapted.players)) {
      expect(Object.keys(p).filter((k) => /timer|duration|deadline/i.test(k))).toEqual([]);
    }
    expect(adapted.activeRound!.durationSeconds).toBe(20); // shared pass-through
  });
});
