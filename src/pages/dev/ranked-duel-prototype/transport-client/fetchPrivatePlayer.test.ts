import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PrivatePlayerFetchError,
  buildPrivatePlayerUrl,
  fetchPrivatePlayer,
} from "./fetchPrivatePlayer";
import {
  FIXTURE_OWNER_ID,
  getPrivateEnvelopeScenario,
} from "../transport-adapter/rankedDuelEnvelopeFixtures";
import { adaptPrivatePlayer } from "../transport-adapter/adaptPrivatePlayer";
import { PrivatePlayerEnvelope } from "../transport-adapter/rankedDuelEnvelopeTypes";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const envelope = (key = "private-idle"): PrivatePlayerEnvelope =>
  clone(getPrivateEnvelopeScenario(key)!.envelope);

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
  kind: PrivatePlayerFetchError["kind"],
): Promise<PrivatePlayerFetchError> => {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(PrivatePlayerFetchError);
    expect((err as PrivatePlayerFetchError).kind).toBe(kind);
    return err as PrivatePlayerFetchError;
  }
  throw new Error(`expected ${kind} error`);
};

const opts = (over: Partial<Parameters<typeof fetchPrivatePlayer>[0]> = {}) => ({
  baseUrl: "http://x",
  matchId: "mock-match-001",
  playerId: FIXTURE_OWNER_ID,
  ...over,
});

describe("fetchPrivatePlayer — request construction", () => {
  it("builds the exact private endpoint URL, encoding match AND player ids", async () => {
    expect(buildPrivatePlayerUrl("http://127.0.0.1:8000/", "m1", "alice")).toBe(
      "http://127.0.0.1:8000/api/ranked-duels/m1/rounds/current/private/alice",
    );
    expect(buildPrivatePlayerUrl("http://x", "a b/c?", "p#1 x")).toBe(
      "http://x/api/ranked-duels/a%20b%2Fc%3F/rounds/current/private/p%231%20x",
    );
    const fn = mockFetch(async () => jsonResponse(envelope()));
    await fetchPrivatePlayer(opts());
    expect(fn).toHaveBeenCalledWith(
      "http://x/api/ranked-duels/mock-match-001/rounds/current/private/alice",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects empty match id, player id, or base URL BEFORE any network call", async () => {
    const fn = mockFetch(async () => jsonResponse(envelope()));
    await expectKind(fetchPrivatePlayer(opts({ matchId: "  " })), "invalid_request");
    await expectKind(fetchPrivatePlayer(opts({ playerId: "" })), "invalid_request");
    await expectKind(fetchPrivatePlayer(opts({ baseUrl: " " })), "invalid_request");
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("fetchPrivatePlayer — success, ownership, validation", () => {
  it("returns the exact validated five-field private envelope", async () => {
    const env = envelope("private-max-level");
    mockFetch(async () => jsonResponse(env));
    const result = await fetchPrivatePlayer(opts());
    expect(result).toEqual(env);
  });

  it("rejects an envelope whose owner differs from the requested player id", async () => {
    mockFetch(async () => jsonResponse(envelope())); // owner is "alice"
    const err = await expectKind(
      fetchPrivatePlayer(opts({ playerId: "bob" })),
      "invalid_envelope",
    );
    expect(err.message).toMatch(/owner "alice" does not match expected owner "bob"/);
  });

  it("rejects a malformed private envelope via the existing validator", async () => {
    const bad = envelope() as unknown as { payload: Record<string, unknown> };
    bad.payload.opponent_selection = { selected_ability_id: "mage.insight" };
    mockFetch(async () => jsonResponse(bad));
    const err = await expectKind(fetchPrivatePlayer(opts()), "invalid_envelope");
    expect(err.message).toMatch(/unexpected field "opponent_selection"/);
  });

  it("handles malformed JSON on a 200 response", async () => {
    mockFetch(async () => new Response("nope{", { status: 200 }));
    await expectKind(fetchPrivatePlayer(opts()), "invalid_json");
  });
});

describe("fetchPrivatePlayer — backend error mapping", () => {
  const backendError = (status: number, error_code: string, message: string) =>
    jsonResponse({ detail: { error_code, message } }, status);

  it("maps 404 match-not-found", async () => {
    mockFetch(async () =>
      backendError(404, "ranked_duel_match_not_found", "no ranked duel match: nope"),
    );
    const err = await expectKind(
      fetchPrivatePlayer(opts({ matchId: "nope" })),
      "match_not_found",
    );
    expect(err.errorCode).toBe("ranked_duel_match_not_found");
  });

  it("maps the SANITIZED 404 player-not-found without adding player detail", async () => {
    mockFetch(async () =>
      backendError(404, "ranked_duel_player_not_found", "no such player in match m1"),
    );
    const err = await expectKind(
      fetchPrivatePlayer(opts({ playerId: "mallory" })),
      "player_not_found",
    );
    expect(err.errorCode).toBe("ranked_duel_player_not_found");
    // The frontend preserves the backend's sanitized wording verbatim — it
    // never enumerates or hints at which players exist.
    expect(err.message).toBe("no such player in match m1");
    expect(err.message).not.toMatch(/alice|bob/);
  });

  it("maps 409 no-active-round", async () => {
    mockFetch(async () =>
      backendError(409, "ranked_duel_no_active_round", "match m1 has no active round"),
    );
    const err = await expectKind(fetchPrivatePlayer(opts()), "no_active_round");
    expect(err.status).toBe(409);
  });

  it("maps 500 projection errors", async () => {
    mockFetch(async () =>
      backendError(500, "ranked_duel_projection_error", "failed to project"),
    );
    const err = await expectKind(fetchPrivatePlayer(opts()), "backend_error");
    expect(err.status).toBe(500);
  });

  it("maps unexpected statuses (even with a non-JSON body)", async () => {
    mockFetch(async () => new Response("teapot", { status: 418 }));
    const err = await expectKind(fetchPrivatePlayer(opts()), "unexpected_status");
    expect(err.status).toBe(418);
  });

  it("maps network failure and never retries", async () => {
    const fn = mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expectKind(fetchPrivatePlayer(opts({ baseUrl: "http://down" })), "network");
    expect(fn).toHaveBeenCalledTimes(1); // no automatic retry
  });

  it("maps an aborted request distinctly", async () => {
    mockFetch(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });
    await expectKind(
      fetchPrivatePlayer(opts({ signal: new AbortController().signal })),
      "aborted",
    );
  });
});

describe("fetchPrivatePlayer — owner-scoped pass-through at the call site", () => {
  const fetchAndAdapt = async (key: string) => {
    mockFetch(async () => jsonResponse(envelope(key)));
    const fetched = await fetchPrivatePlayer(opts());
    return adaptPrivatePlayer(fetched, FIXTURE_OWNER_ID);
  };

  it("adapted owner matches the requested owner; answer/lock state passes through", async () => {
    const idle = await fetchAndAdapt("private-idle");
    expect(idle.ownerPlayerId).toBe(FIXTURE_OWNER_ID);
    expect(idle.answerSubmitted).toBe(false);
    expect(idle.selectionPhase).toBe("open");
    const locked = await fetchAndAdapt("private-locked-with-ability");
    expect(locked.selectionPhase).toBe("locked");
  });

  it("nullable selected ability and eligible abilities pass through", async () => {
    const noAbility = await fetchAndAdapt("private-locked-no-ability");
    expect(noAbility.selectedAbilityId).toBeNull();
    const maxed = await fetchAndAdapt("private-max-level");
    expect(maxed.unlockedAbilityIds).toEqual(["tank.fortify", "tank.brace", "tank.barrier"]);
    expect(maxed.selectedAbilityId).toBeNull();
  });

  it("remaining charges pass through unchanged (null = uncharged policy)", async () => {
    const maxed = await fetchAndAdapt("private-max-level");
    expect(maxed.remainingCharges).toEqual({
      "tank.fortify": 2,
      "tank.brace": 2,
      "tank.barrier": 1,
    });
  });

  it("Level 2 pending and confirmed choice states pass through", async () => {
    const pending = await fetchAndAdapt("private-level2-pending");
    expect(pending.level2ChoiceMade).toBe(false);
    expect(pending.level2Options).toEqual(["tank.brace", "tank.barrier"]);
    const chosen = await fetchAndAdapt("private-level2-chosen");
    expect(chosen.level2ChoiceMade).toBe(true);
    expect(chosen.level2Choice).toBe("tank.brace");
  });

  it("carryover flags, streak, and the separate Combat Lab delta pass through", async () => {
    const maxed = await fetchAndAdapt("private-max-level");
    expect(maxed.pendingEffects).toEqual({
      fortify: false,
      arcaneCharge: false,
      focus: false,
      insight: false,
      tempo: false,
    });
    expect(maxed.consecutiveCorrect).toBe(2);
    expect(maxed.combatLabUnlockDeltaSeconds).toBe(0);
  });

  it("shared timing fields pass through; no per-player timer exists", async () => {
    const idle = await fetchAndAdapt("private-idle");
    expect(idle.sharedActiveDeadline).toBe("2026-07-13T12:00:20+00:00");
    expect(idle.sharedNextRoundDurationSeconds).toBe(20);
    const timerKeys = Object.keys(idle).filter((k) => /timer|deadline|duration/i.test(k));
    expect(timerKeys.sort()).toEqual(["sharedActiveDeadline", "sharedNextRoundDurationSeconds"]);
  });

  it("fetched payload and adapted model contain no opponent or resolved data", async () => {
    const env = envelope("private-answer-submitted");
    mockFetch(async () => jsonResponse(env));
    const fetched = await fetchPrivatePlayer(opts());
    const adapted = adaptPrivatePlayer(fetched, FIXTURE_OWNER_ID);
    for (const flat of [JSON.stringify(fetched).toLowerCase(), JSON.stringify(adapted).toLowerCase()]) {
      for (const banned of [
        "opponent",
        "outcome", // no correctness exists before resolution
        "is_correct",
        "answer_index",
        "answer_text",
        "final_damage",
        "base_damage",
        "shield_absorbed",
        "xp_gained",
        "level_up_events",
      ]) {
        expect(flat, banned).not.toContain(banned);
      }
    }
    // The public player entries in the private payload never carry the
    // opponent's ability identity or charges.
    for (const p of fetched.payload.players) {
      expect(p).not.toHaveProperty("selected_ability_id");
      expect(p).not.toHaveProperty("remaining_charges");
    }
  });
});
