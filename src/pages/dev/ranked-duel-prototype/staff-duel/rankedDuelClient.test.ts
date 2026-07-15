import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_KEY_HEADER,
  PLAYER_TOKEN_HEADER,
  RankedDuelApiError,
  createStaffMatch,
  describeError,
  fetchPrivatePlayerLive,
  fetchPublicRoundLive,
  isCredentialError,
  isMatchGone,
  isNoActiveRound,
  pendingPlayersFromError,
  submitLevelTwoChoice,
  submitRound,
} from "./rankedDuelClient";
import { publicEnvelope, privateEnvelope } from "./testFixtures";

const BASE = "http://127.0.0.1:8000";
const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const errJson = (status: number, detail: unknown) =>
  new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const stubFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) => {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  return spy;
};

const headersOf = (spy: ReturnType<typeof stubFetch>, call = 0): Record<string, string> =>
  (spy.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rankedDuelClient — endpoints and credentials", () => {
  it("creates a staff match with the admin key and no participant token", async () => {
    const spy = stubFetch(async () =>
      okJson({
        match_id: "m1",
        experiment: { arm: "control_hp_170", tank_starting_hp: 170 },
        players: [
          { player_id: "alice", class_id: "tank", starting_hp: 170 },
          { player_id: "bob", class_id: "mage", starting_hp: 90 },
        ],
        participants: [
          { player_id: "alice", player_token: "token-alice" },
          { player_id: "bob", player_token: "token-bob" },
        ],
      }),
    );

    const created = await createStaffMatch({
      baseUrl: BASE,
      adminKey: "secret-admin",
      matchId: "m1",
      playerOneId: "alice",
      playerTwoId: "bob",
      playerOneClass: "tank",
      playerTwoClass: "mage",
      experimentArm: "control_hp_170",
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`${BASE}/api/admin/ranked-duels`);
    expect((init as RequestInit).method).toBe("POST");
    expect(headersOf(spy)[ADMIN_KEY_HEADER]).toBe("secret-admin");
    expect(headersOf(spy)[PLAYER_TOKEN_HEADER]).toBeUndefined();
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      match_id: "m1",
      player_one_id: "alice",
      player_two_id: "bob",
      player_one_class: "tank",
      player_two_class: "mage",
      experiment_arm: "control_hp_170",
    });
    expect(created.participants).toHaveLength(2);
    expect(created.experiment).toEqual({ arm: "control_hp_170", tank_starting_hp: 170 });
  });

  it("sends no credentials at all on the public endpoint", async () => {
    const spy = stubFetch(async () => okJson(publicEnvelope({})));
    await fetchPublicRoundLive(BASE, "m1");
    expect(spy.mock.calls[0][0]).toBe(`${BASE}/api/ranked-duels/m1/rounds/current/public`);
    expect(headersOf(spy)[PLAYER_TOKEN_HEADER]).toBeUndefined();
    expect(headersOf(spy)[ADMIN_KEY_HEADER]).toBeUndefined();
  });

  it("sends the participant token — never the admin key — on the private endpoint", async () => {
    const spy = stubFetch(async () => okJson(privateEnvelope({ ownerId: "alice" })));
    const view = await fetchPrivatePlayerLive(BASE, "m 1", "alice", "token-alice");
    expect(spy.mock.calls[0][0]).toBe(
      `${BASE}/api/ranked-duels/m%201/rounds/current/private/alice`,
    );
    expect(headersOf(spy)[PLAYER_TOKEN_HEADER]).toBe("token-alice");
    expect(headersOf(spy)[ADMIN_KEY_HEADER]).toBeUndefined();
    expect(view.ownerPlayerId).toBe("alice");
  });

  it("rejects a private projection owned by a different player", async () => {
    stubFetch(async () => okJson(privateEnvelope({ ownerId: "bob" })));
    await expect(fetchPrivatePlayerLive(BASE, "m1", "alice", "token-alice")).rejects.toMatchObject({
      kind: "invalid_response",
    });
  });

  it("submits the backend round number, answer index, and ability with the token", async () => {
    const spy = stubFetch(async () =>
      okJson({ status: "accepted", match_id: "m1", round_number: 3, player_id: "alice", round_resolved: false }),
    );
    const accepted = await submitRound({
      baseUrl: BASE,
      matchId: "m1",
      playerToken: "token-alice",
      roundNumber: 3,
      answerIndex: 2,
      abilityId: "tank.fortify",
    });
    expect(spy.mock.calls[0][0]).toBe(`${BASE}/api/ranked-duels/m1/rounds/current/submission`);
    expect(headersOf(spy)[PLAYER_TOKEN_HEADER]).toBe("token-alice");
    expect(headersOf(spy)[ADMIN_KEY_HEADER]).toBeUndefined();
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      round_number: 3,
      answer: 2,
      ability_id: "tank.fortify",
    });
    expect(accepted.roundResolved).toBe(false);
  });

  it("submits a null ability when the player picks no ability", async () => {
    const spy = stubFetch(async () =>
      okJson({ status: "accepted", match_id: "m1", round_number: 1, player_id: "alice", round_resolved: true }),
    );
    await submitRound({
      baseUrl: BASE,
      matchId: "m1",
      playerToken: "t",
      roundNumber: 1,
      answerIndex: 0,
      abilityId: null,
    });
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string).ability_id).toBeNull();
  });

  it("posts the level two choice with the participant token", async () => {
    const spy = stubFetch(async () =>
      okJson({ status: "confirmed", match_id: "m1", player_id: "alice", ability_id: "tank.brace", pending_players: [] }),
    );
    const confirmed = await submitLevelTwoChoice({
      baseUrl: BASE,
      matchId: "m1",
      playerToken: "token-alice",
      abilityId: "tank.brace",
    });
    expect(spy.mock.calls[0][0]).toBe(`${BASE}/api/ranked-duels/m1/progression/level-two-choice`);
    expect(headersOf(spy)[PLAYER_TOKEN_HEADER]).toBe("token-alice");
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      ability_id: "tank.brace",
    });
    expect(confirmed.pendingPlayers).toEqual([]);
  });

  it("never puts a credential in a URL", async () => {
    const spy = stubFetch(async () => okJson(privateEnvelope({ ownerId: "alice" })));
    await fetchPrivatePlayerLive(BASE, "m1", "alice", "super-secret-token");
    expect(String(spy.mock.calls[0][0])).not.toContain("super-secret-token");
  });
});

describe("rankedDuelClient — error envelopes", () => {
  it("parses the gameplay {detail:{error_code,message}} envelope", async () => {
    stubFetch(async () =>
      errJson(404, { error_code: "ranked_duel_match_not_found", message: "no ranked duel match: m1" }),
    );
    const err = await fetchPublicRoundLive(BASE, "m1").catch((e) => e);
    expect(err).toBeInstanceOf(RankedDuelApiError);
    expect(err.kind).toBe("backend");
    expect(err.status).toBe(404);
    expect(err.errorCode).toBe("ranked_duel_match_not_found");
    expect(isMatchGone(err)).toBe(true);
    expect(describeError(err)).toContain("no longer exists");
  });

  it("parses the plain-string admin auth detail", async () => {
    stubFetch(async () => errJson(403, "Invalid or missing X-Admin-Key"));
    const err = await createStaffMatch({
      baseUrl: BASE,
      adminKey: "wrong",
      matchId: "m1",
      playerOneId: "alice",
      playerTwoId: "bob",
      playerOneClass: "tank",
      playerTwoClass: "mage",
      experimentArm: "control_hp_170",
    }).catch((e) => e);
    expect(err.status).toBe(403);
    expect(describeError(err)).toBe("Invalid or missing X-Admin-Key");
  });

  it("carries progression_pending_players on the 409 no-active-round detail", async () => {
    stubFetch(async () =>
      errJson(409, {
        error_code: "ranked_duel_no_active_round",
        message: "match m1 has no active round (waiting for Level 2 choices)",
        progression_pending_players: ["alice"],
      }),
    );
    const err = await fetchPublicRoundLive(BASE, "m1").catch((e) => e);
    expect(isNoActiveRound(err)).toBe(true);
    expect(pendingPlayersFromError(err)).toEqual(["alice"]);
  });

  it("classifies participant credential failures", async () => {
    stubFetch(async () =>
      errJson(401, {
        error_code: "ranked_duel_invalid_player_token",
        message: "invalid participant token for this match",
      }),
    );
    const err = await fetchPrivatePlayerLive(BASE, "m1", "alice", "nope").catch((e) => e);
    expect(isCredentialError(err)).toBe(true);
    expect(describeError(err)).toBe("That participant token is not valid for this match.");
  });

  it("maps the duplicate-match and experiment-disabled codes", () => {
    const dup = new RankedDuelApiError("backend", "match already exists: m1", {
      status: 409,
      errorCode: "ranked_duel_match_already_exists",
    });
    const disabled = new RankedDuelApiError("backend", "kill switch", {
      status: 409,
      errorCode: "ranked_duel_experiment_disabled",
    });
    expect(describeError(dup)).toContain("already exists");
    expect(describeError(disabled)).toContain("kill switch");
  });

  it("reports unreachable backends as a network error without a stack trace", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await fetchPublicRoundLive(BASE, "m1").catch((e) => e);
    expect(err.kind).toBe("network");
    expect(describeError(err)).toContain("could not reach");
    expect(describeError(err)).not.toContain("TypeError");
  });

  it("surfaces aborts as their own kind", async () => {
    const controller = new AbortController();
    stubFetch(async () => {
      const abortErr = new Error("aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    });
    controller.abort();
    const err = await fetchPublicRoundLive(BASE, "m1", controller.signal).catch((e) => e);
    expect(err.kind).toBe("aborted");
  });

  it("rejects a body that does not match the contract", async () => {
    stubFetch(async () => okJson({ projection_type: "public_round", payload: {} }));
    const err = await fetchPublicRoundLive(BASE, "m1").catch((e) => e);
    expect(err.kind).toBe("invalid_response");
    expect(describeError(err)).toBe("The backend returned data this page could not read.");
  });

  it("rejects a missing base URL before any network call", async () => {
    const spy = stubFetch(async () => okJson({}));
    await expect(fetchPublicRoundLive("", "m1")).rejects.toMatchObject({ kind: "invalid_request" });
    expect(spy).not.toHaveBeenCalled();
  });
});
