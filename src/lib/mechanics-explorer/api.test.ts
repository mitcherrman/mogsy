import { afterEach, describe, expect, it, vi } from "vitest";

import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";
import {
  MechanicsApiError,
  fetchExplorerContext,
  fetchMinion,
  fetchRespawn,
  fetchWaveByNumber,
  fetchWaveByTime,
  formatClock,
  formatDisplayNumber,
  parseGameTimeInput,
  postStructureInspect,
  postSupersState,
} from "./api";

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mechanics explorer client", () => {
  it("fetches the explorer context from the shared API base", async () => {
    const fetchMock = mockFetchOnce(200, { default_patch: "26.15", map: "summoners_rift" });
    const context = await fetchExplorerContext();
    expect(context.default_patch).toBe("26.15");
    expect(fetchMock).toHaveBeenCalledWith(
      `${COMBAT_API_BASE_URL}/api/mechanics/explorer/context`,
      expect.anything(),
    );
  });

  it("maps respawn params into query-string form", async () => {
    const fetchMock = mockFetchOnce(200, { displayed_timer_s: 37 });
    const result = await fetchRespawn({ level: 11, gameTimeS: 1275 });
    expect(result.displayed_timer_s).toBe(37);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/mechanics/explorer/respawn?");
    expect(url).toContain("level=11");
    expect(url).toContain("game_time_s=1275");
  });

  it("looks up waves by number and by game time with distinct params", async () => {
    const byNumber = mockFetchOnce(200, { wave: { wave_number: 29 } });
    await fetchWaveByNumber(29);
    expect(byNumber.mock.calls[0][0]).toContain("wave_number=29");

    const byTime = mockFetchOnce(200, { wave: { wave_number: 66 } });
    await fetchWaveByTime(1800);
    expect(byTime.mock.calls[0][0]).toContain("game_time_s=1800");
  });

  it("unwraps the structured Phase 5A error detail into a clean message", async () => {
    mockFetchOnce(422, {
      detail: { error: "unsupported_patch", message: "Patch '25.24' is outside the certified range." },
    });
    const failure = await fetchRespawn({ level: 5, gameTimeS: 100 }).catch((e) => e);
    expect(failure).toBeInstanceOf(MechanicsApiError);
    expect(failure.message).toBe("Patch '25.24' is outside the certified range.");
    expect(failure.code).toBe("unsupported_patch");
    expect(failure.message).not.toContain("{");
  });

  it("passes plain string details through and joins pydantic validation lists", async () => {
    mockFetchOnce(422, { detail: "plain failure text" });
    const plain = await fetchExplorerContext().catch((e) => e);
    expect(plain.message).toBe("plain failure text");

    mockFetchOnce(422, {
      detail: [
        { loc: ["query", "level"], msg: "Input should be less than or equal to 18" },
        { loc: ["query", "game_time_s"], msg: "Input should be greater than or equal to 0" },
      ],
    });
    const listed = await fetchExplorerContext().catch((e) => e);
    expect(listed.message).toBe(
      "Input should be less than or equal to 18; Input should be greater than or equal to 0",
    );
  });

  it("falls back to a status-only message when the body has no usable detail", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    });
    vi.stubGlobal("fetch", fetchMock);
    const failure = await fetchExplorerContext().catch((e) => e);
    expect(failure.message).toBe("Request failed (500)");
    expect(failure.status).toBe(500);
  });
});

describe("minion inspector client (5B2)", () => {
  it("maps type and game time into the request path", async () => {
    const fetchMock = mockFetchOnce(200, { minion_type: "siege" });
    await fetchMinion("siege", 449);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/mechanics/explorer/minions/siege?");
    expect(url).toContain("game_time_s=449");
  });

  it("passes verified and unresolved stat states through untouched", async () => {
    mockFetchOnce(200, {
      minion_type: "siege",
      stats: {
        health: { value: "1175", status: "verified" },
        attack_damage: {
          value: null,
          status: "unresolved",
          unresolved_reason: "unresolved from wave 15's spawn (7:30) onward",
        },
      },
    });
    const result = await fetchMinion("siege", 450);
    expect(result.stats.health).toEqual({ value: "1175", status: "verified" });
    expect(result.stats.attack_damage.value).toBeNull();
    expect(result.stats.attack_damage.status).toBe("unresolved");
    expect(result.stats.attack_damage.unresolved_reason).toContain("wave 15");
  });

  it("surfaces the structured error detail for unknown minion types", async () => {
    mockFetchOnce(422, {
      detail: { error: "unsupported_context", message: "Unknown minion type 'mega'" },
    });
    const failure = await fetchMinion("mega", 100).catch((e) => e);
    expect(failure).toBeInstanceOf(MechanicsApiError);
    expect(failure.code).toBe("unsupported_context");
    expect(failure.message).toBe("Unknown minion type 'mega'");
  });
});

describe("structure inspector client (5B2)", () => {
  it("POSTs the request body verbatim to the inspect endpoint", async () => {
    const fetchMock = mockFetchOnce(200, { identity: { structure: "turret_outer" } });
    const body = {
      structure: "turret_outer",
      game_time_s: 700,
      bulwark: { stacks: 2, nearby_enemy_champions: 3 },
      backdoor: { enemy_minion_nearby: false, seconds_since_minion_state_change: 5 },
    };
    await postStructureInspect(body);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/mechanics/explorer/structures/inspect");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("parses applicable and inapplicable sections", async () => {
    mockFetchOnce(200, {
      identity: { structure: "nexus", kind: "nexus", display_name: "Nexus", lane: null },
      plates: { applicable: false, reason: "not a turret" },
      warming_up: { applicable: false, reason: "not a turret" },
      dependencies: {
        required_predecessors: ["both nexus turrets"],
        targetability: { targetable: false, blocked_by: ["any inhibitor"], explanation: "…" },
      },
    });
    const result = await postStructureInspect({ structure: "nexus", game_time_s: 1800 });
    expect(result.plates.applicable).toBe(false);
    if (!result.plates.applicable) expect(result.plates.reason).toBe("not a turret");
    expect(result.dependencies.targetability?.targetable).toBe(false);
  });

  it("surfaces structured errors from the inspect endpoint", async () => {
    mockFetchOnce(422, {
      detail: { error: "invalid_input", message: "stacks must be <= 4" },
    });
    const failure = await postStructureInspect({
      structure: "turret_outer",
      game_time_s: 60,
      bulwark: { stacks: 9, nearby_enemy_champions: 1 },
    }).catch((e) => e);
    expect(failure.code).toBe("invalid_input");
    expect(failure.message).toBe("stacks must be <= 4");
  });
});

describe("game-time input parsing (presentation only)", () => {
  it("parses MM:SS", () => {
    expect(parseGameTimeInput("21:15")).toEqual({ ok: true, seconds: 1275 });
    expect(parseGameTimeInput("0:05")).toEqual({ ok: true, seconds: 5 });
    expect(parseGameTimeInput("110:00")).toEqual({ ok: true, seconds: 6600 });
  });

  it("reads a bare number as minutes", () => {
    expect(parseGameTimeInput("21")).toEqual({ ok: true, seconds: 1260 });
    expect(parseGameTimeInput("0")).toEqual({ ok: true, seconds: 0 });
  });

  it("rejects malformed input with a helpful message", () => {
    for (const bad of ["", "banana", "21:75", "1:5", "-3", "12:345"]) {
      const parsed = parseGameTimeInput(bad);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(0);
    }
  });

  it("formats seconds back to a clock", () => {
    expect(formatClock(1800)).toBe("30:00");
    expect(formatClock(5)).toBe("0:05");
  });
});

describe("supers explorer client (5B3)", () => {
  it("POSTs the request body verbatim to the supers endpoint", async () => {
    const fetchMock = mockFetchOnce(200, { wave: { wave_number: 29 } });
    const body = {
      wave_number: 29,
      inhibitors: { top: { destroyed_at_s: 600 } },
    };
    await postSupersState(body);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/mechanics/explorer/supers/state");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it("preserves lane states and the cutoff verdict untouched", async () => {
    mockFetchOnce(200, {
      wave: { wave_number: 29, spawn_time_s: 865, spawn_time_display: "14:25" },
      all_inhibitors_down_at_spawn: false,
      lanes: {
        top: {
          inhibitor: { down_at_spawn: true, destroyed_at_s: 600, respawn_at_s: 900, respawn_display: "15:00" },
          super_minion_count: 0,
          suppressed_by_cutoff: true,
          waves_until_respawn: 2,
          composition: { melee: 2, caster: 3, cannon: 1, super: 0 },
          is_cannon_wave: true,
          siege_replaced_by_super: false,
          explanation: "cutoff",
          provenance: [],
        },
        middle: {
          inhibitor: { down_at_spawn: false, destroyed_at_s: null, respawn_at_s: null, respawn_display: null },
          super_minion_count: 0,
          suppressed_by_cutoff: false,
          waves_until_respawn: null,
          composition: { melee: 2, caster: 3, cannon: 1, super: 0 },
          is_cannon_wave: true,
          siege_replaced_by_super: false,
          explanation: "standing",
          provenance: [],
        },
        bottom: {
          inhibitor: { down_at_spawn: false, destroyed_at_s: null, respawn_at_s: null, respawn_display: null },
          super_minion_count: 0,
          suppressed_by_cutoff: false,
          waves_until_respawn: null,
          composition: { melee: 2, caster: 3, cannon: 1, super: 0 },
          is_cannon_wave: true,
          siege_replaced_by_super: false,
          explanation: "standing",
          provenance: [],
        },
      },
      explanation: "Wave 29 spawns at 14:25.",
    });
    const result = await postSupersState({ wave_number: 29 });
    expect(result.lanes.top.suppressed_by_cutoff).toBe(true);
    expect(result.lanes.top.waves_until_respawn).toBe(2);
    expect(result.lanes.top.inhibitor.respawn_display).toBe("15:00");
    expect(result.lanes.middle.super_minion_count).toBe(0);
    expect(result.all_inhibitors_down_at_spawn).toBe(false);
  });

  it("surfaces structured errors from the supers endpoint", async () => {
    mockFetchOnce(422, {
      detail: { error: "invalid_input", message: "Provide exactly one of wave_number or game_time_s." },
    });
    const failure = await postSupersState({}).catch((e) => e);
    expect(failure).toBeInstanceOf(MechanicsApiError);
    expect(failure.code).toBe("invalid_input");
    expect(failure.message).toBe("Provide exactly one of wave_number or game_time_s.");
  });
});

describe("display-number formatting (5B4, presentation only)", () => {
  it("trims trailing zeros without altering meaning", () => {
    expect(formatDisplayNumber("3.060")).toBe("3.06");
    expect(formatDisplayNumber("1.00")).toBe("1");
    expect(formatDisplayNumber("50.0")).toBe("50");
    expect(formatDisplayNumber("0.850")).toBe("0.85");
  });

  it("rounds long decimals half-up to two places without float artifacts", () => {
    expect(formatDisplayNumber("44.6675")).toBe("44.67");
    expect(formatDisplayNumber("44.848125")).toBe("44.85");
    expect(formatDisplayNumber("42.680625")).toBe("42.68");
    expect(formatDisplayNumber("5.525")).toBe("5.53");
    expect(formatDisplayNumber("0.833")).toBe("0.83");
    expect(formatDisplayNumber("2.999")).toBe("3");
  });

  it("preserves integers, short decimals, negatives and non-numeric text", () => {
    expect(formatDisplayNumber("350")).toBe("350");
    expect(formatDisplayNumber("46.5")).toBe("46.5");
    expect(formatDisplayNumber("-30")).toBe("-30");
    expect(formatDisplayNumber("-0.125")).toBe("-0.13");
    expect(formatDisplayNumber("n/a")).toBe("n/a");
  });
});
