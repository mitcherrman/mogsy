import { afterEach, describe, expect, it, vi } from "vitest";

import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";
import {
  MechanicsApiError,
  fetchExplorerContext,
  fetchRespawn,
  fetchWaveByNumber,
  fetchWaveByTime,
  formatClock,
  parseGameTimeInput,
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
