/**
 * HUB-NEXT1 — resolving an explicit `?next=` against the configured events'
 * tournament schedules. Fixtures are the real Worlds 2026 body (PW4-B) and
 * its simulated scenarios; DCGI is the v1 body.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LiveGameSummary } from "@/lib/live-esports/api";
import DCGI_PRE_EVENT from "@/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json";
import { KO, PI, WORLDS_PRE, clone, goLive, partialSchedule } from "@/lib/pro-play/__fixtures__/worldsScenarios";
import {
  FIXTURE_CONTEXT_IDS,
  fixtureFeedGame,
  fixtureHref,
  resolveExplicitFixture,
  tournamentFixtureView,
  type ContextRead,
} from "./explicitFixture";
import { TournamentNotFound, type AnyTournamentResponse } from "./tournamentApi";

const DCGI = DCGI_PRE_EVENT as unknown as AnyTournamentResponse;
const ok = (contextId: string, data: AnyTournamentResponse): ContextRead => ({ contextId, data, error: null, isPending: false });
const pending = (contextId: string): ContextRead => ({ contextId, data: undefined, error: null, isPending: true });
const failed = (contextId: string, error: unknown = new Error("HTTP 503")): ContextRead => ({
  contextId,
  data: undefined,
  error,
  isPending: false,
});

afterEach(() => vi.unstubAllEnvs());

describe("FIXTURE_CONTEXT_IDS", () => {
  it("covers every configured event, not only the one featured today", () => {
    expect(FIXTURE_CONTEXT_IDS).toEqual(["dcgi-2026", "worlds-2026"]);
  });
});

describe("resolveExplicitFixture", () => {
  it("finds a fixture by its exact id in whichever context lists it", () => {
    const r = resolveExplicitFixture(KO.final, [ok("dcgi-2026", DCGI), ok("worlds-2026", WORLDS_PRE)]);
    expect(r.kind).toBe("found");
    if (r.kind !== "found") return;
    expect(r.contextId).toBe("worlds-2026");
    expect(r.match.match_id).toBe(KO.final);
  });

  it("a hit stands even while another context is pending or failed", () => {
    expect(resolveExplicitFixture(KO.final, [pending("dcgi-2026"), ok("worlds-2026", WORLDS_PRE)]).kind).toBe("found");
    expect(resolveExplicitFixture(KO.final, [failed("dcgi-2026"), ok("worlds-2026", WORLDS_PRE)]).kind).toBe("found");
  });

  it("is pending while any context has not answered", () => {
    expect(resolveExplicitFixture("x", [ok("dcgi-2026", DCGI), pending("worlds-2026")])).toEqual({ kind: "pending" });
  });

  it("a failed read means the miss cannot be verified", () => {
    expect(resolveExplicitFixture("x", [ok("dcgi-2026", DCGI), failed("worlds-2026")])).toEqual({ kind: "unavailable" });
  });

  it("a 404 context is not a failure, but makes the miss partial", () => {
    const r = resolveExplicitFixture("x", [failed("dcgi-2026", new TournamentNotFound("dcgi-2026")), ok("worlds-2026", WORLDS_PRE)]);
    expect(r).toEqual({ kind: "not_found", partial: true });
  });

  it("a miss is complete only when every read is a healthy v2 with full coverage", () => {
    expect(resolveExplicitFixture("x", [ok("a", WORLDS_PRE), ok("b", WORLDS_PRE)])).toEqual({ kind: "not_found", partial: false });
    // v1 cannot vouch for completeness.
    expect(resolveExplicitFixture("x", [ok("a", DCGI), ok("b", WORLDS_PRE)])).toEqual({ kind: "not_found", partial: true });
    const stale = clone();
    stale.stale = true;
    expect(resolveExplicitFixture("x", [ok("b", stale)])).toEqual({ kind: "not_found", partial: true });
  });

  it("a fixture the coverage says is missing is a partial miss", () => {
    expect(resolveExplicitFixture(KO.final, [ok("worlds-2026", partialSchedule())])).toEqual({ kind: "not_found", partial: true });
  });
});

describe("fixtureFeedGame", () => {
  const game = (game_id: string) => ({ game_id }) as LiveGameSummary;
  const started = () => {
    const d = clone();
    goLive(d, PI.ubsf1, 1, 0);
    const m = d.state.matches.find((x) => x.match_id === PI.ubsf1)!;
    m.live1_game_ids = ["G1", "G2"];
    return m;
  };

  it("follows only games the feed holds, live first", () => {
    const m = started();
    expect(fixtureFeedGame(m, [], [])).toBeNull();
    expect(fixtureFeedGame(m, [], [game("G1")])).toBe("G1");
    expect(fixtureFeedGame(m, [game("G2")], [game("G1")])).toBe("G2");
    expect(fixtureFeedGame(m, [game("OTHER")], [])).toBeNull();
  });

  it("an upcoming fixture has no game", () => {
    const m = WORLDS_PRE.state.matches.find((x) => x.match_id === KO.final)!;
    expect(fixtureFeedGame(m, [game("G1")], [])).toBeNull();
  });
});

describe("tournamentFixtureView", () => {
  const view = (id: string, data: AnyTournamentResponse = WORLDS_PRE) => {
    const r = resolveExplicitFixture(id, [ok("worlds-2026", data)]);
    if (r.kind !== "found") throw new Error("not found");
    return tournamentFixtureView(r);
  };

  it("keeps the identity and draws only what the schedule states", () => {
    const v = view(KO.final);
    expect(v.match.match_id).toBe(KO.final);
    expect(v.match.scheduled_start).toBe("2026-11-14T19:00:00Z");
    expect(v.match.league.slug).toBe("worlds");
    expect(v.match.league.name).toBe("Worlds");
    expect(v.match.block_name).toBe("Knockout Stage · Finals");
    expect(v.match.best_of).toBe(5);
    expect(v.match.teams.a).toEqual({ name: null, code: null, resolved_page: null, tbd: true });
    expect(v.state).toBe("upcoming");
    expect(v.stale).toBe(false);
  });

  it("named sides carry their canonical team keys", () => {
    const v = view(PI.ubsf1);
    expect(v.match.teams.a).toMatchObject({ code: "C9", resolved_page: "Cloud9", tbd: false });
    expect(v.match.teams.b).toMatchObject({ code: "KC", resolved_page: "Karmine Corp", tbd: false });
  });
});

describe("fixtureHref", () => {
  it("is the canonical tournament page while the Worlds experience is off", () => {
    vi.stubEnv("VITE_WORLDS_EXPERIENCE_ENABLED", "");
    expect(fixtureHref("worlds-2026", KO.final)).toBe("/lol/pro-play/tournament/worlds-2026");
    expect(fixtureHref("dcgi-2026", "m1")).toBe("/lol/pro-play/tournament/dcgi-2026");
  });

  it("is the experience's Schedule for that match when it is on (Worlds only)", () => {
    vi.stubEnv("VITE_WORLDS_EXPERIENCE_ENABLED", "true");
    expect(fixtureHref("worlds-2026", KO.final)).toBe(`/lol/pro-play/tournament/worlds-2026/schedule?match=${KO.final}`);
    expect(fixtureHref("dcgi-2026", "m1")).toBe("/lol/pro-play/tournament/dcgi-2026");
  });
});
