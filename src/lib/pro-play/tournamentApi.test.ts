/**
 * PW4-B — explicit contract-version handling for the tournament endpoint.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import DCGI from "@/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json";
import WORLDS from "@/lib/pro-play/__fixtures__/tournamentWorldsPreEvent.json";

import {
  TournamentMalformed,
  TournamentNotFound,
  TournamentUnsupported,
  fetchTournament,
  isTournamentV2,
  parseTournament,
} from "./tournamentApi";

const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
// A body mutated into shapes its type forbids, on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

afterEach(() => vi.unstubAllGlobals());

describe("parseTournament", () => {
  it("reads DCGI as v1, unchanged", () => {
    const r = parseTournament(copy(DCGI));
    expect(r.contract_version).toBe("tournament_context_v1");
    expect(isTournamentV2(r)).toBe(false);
    expect(r).toEqual(DCGI);
  });

  it("reads the real Worlds body as v2", () => {
    const r = parseTournament(copy(WORLDS));
    expect(isTournamentV2(r)).toBe(true);
    if (!isTournamentV2(r)) return;
    expect(r.context.participants).toHaveLength(19);
    expect(r.state.matches).toHaveLength(46);
    expect(r.state.phase).toBe("pre_event");
    expect(r.state.coverage.complete).toBe(true);
    expect(r.context.participants.every((p) => p.lineup_status === "not_certified")).toBe(true);
  });

  it("reads a body without a version as the v1 shape", () => {
    const body = copy(DCGI) as Record<string, unknown>;
    delete body.contract_version;
    expect(isTournamentV2(parseTournament(body))).toBe(false);
  });

  it("refuses an unknown contract version as unsupported", () => {
    const body = { ...copy(WORLDS), contract_version: "tournament_context_v3" };
    expect(() => parseTournament(body)).toThrow(TournamentUnsupported);
    try {
      parseTournament(body);
    } catch (e) {
      expect((e as TournamentUnsupported).version).toBe("tournament_context_v3");
    }
  });

  it("refuses a v2 phase it does not know as unsupported", () => {
    const body = copy(WORLDS) as { state: { phase: string } };
    body.state.phase = "group_stage";
    expect(() => parseTournament(body)).toThrow(TournamentUnsupported);
  });

  it.each([
    ["no coverage", (b: Loose) => delete b.state.coverage],
    ["no Swiss summary", (b: Loose) => delete b.state.swiss],
    ["Swiss rounds not an object", (b: Loose) => (b.state.swiss.rounds = [])],
    ["no Play-In authority", (b: Loose) => delete b.state.play_in.bracket_authority],
    ["a match with one team", (b: Loose) => (b.state.matches[0].teams = [b.state.matches[0].teams[0]])],
    ["stages missing", (b: Loose) => delete b.context.stages],
    ["a participant without a key", (b: Loose) => delete b.context.participants[0].team_key],
  ])("refuses a v2 body with %s as malformed", (_label, mutate) => {
    const body = copy(WORLDS);
    mutate(body);
    expect(() => parseTournament(body)).toThrow(TournamentMalformed);
  });

  it("refuses a non-object or a v1 body without matches as malformed", () => {
    expect(() => parseTournament("<html>")).toThrow(TournamentMalformed);
    expect(() => parseTournament(null)).toThrow(TournamentMalformed);
    const v1 = copy(DCGI) as { state: Record<string, unknown> };
    delete v1.state.matches;
    expect(() => parseTournament(v1)).toThrow(TournamentMalformed);
  });
});

describe("fetchTournament", () => {
  const respond = (status: number, body: unknown, json = true) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
          if (!json) throw new SyntaxError("not json");
          return body;
        },
      })),
    );

  it("404 is not-found", async () => {
    respond(404, {});
    await expect(fetchTournament("nope")).rejects.toBeInstanceOf(TournamentNotFound);
  });

  it("a non-JSON 200 is malformed", async () => {
    respond(200, null, false);
    await expect(fetchTournament("worlds-2026")).rejects.toBeInstanceOf(TournamentMalformed);
  });

  it("a 5xx is an ordinary (retryable) error", async () => {
    respond(503, {});
    const err = await fetchTournament("worlds-2026").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TournamentMalformed);
    expect(err).not.toBeInstanceOf(TournamentUnsupported);
  });

  it("returns the parsed v2 body", async () => {
    respond(200, copy(WORLDS));
    const r = await fetchTournament("worlds-2026");
    expect(isTournamentV2(r)).toBe(true);
  });
});
