import { afterEach, describe, expect, it, vi } from "vitest";
import { createBotMatch, RankedApiError } from "./client";
import { readPublicRound } from "./contracts";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createBotMatch", () => {
  it("POSTs class + difficulty and parses the created match", async () => {
    const fetchMock = mockFetch(201, {
      status: "created", match_id: "rkb_abc",
      bot_difficulty: "easy", question_bank_mode: "placeholder",
    });
    vi.stubGlobal("fetch", fetchMock);
    const created = await createBotMatch("mage", "easy");
    expect(created).toEqual({
      matchId: "rkb_abc", botDifficulty: "easy", questionBankMode: "placeholder",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/ranked/bot-matches");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ class_id: "mage", difficulty: "easy" });
  });

  it("omits difficulty when null", async () => {
    const fetchMock = mockFetch(201, { status: "created", match_id: "rkb_x" });
    vi.stubGlobal("fetch", fetchMock);
    await createBotMatch("tank", null);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ class_id: "tank" });
  });

  it("surfaces the typed not-eligible error for ordinary users", async () => {
    vi.stubGlobal("fetch", mockFetch(403, {
      detail: { code: "RANKED_BOT_NOT_ELIGIBLE", message: "not in the allowlist" },
    }));
    await expect(createBotMatch("tank", null)).rejects.toMatchObject({
      code: "RANKED_BOT_NOT_ELIGIBLE",
    });
  });

  it("surfaces the typed disabled error", async () => {
    vi.stubGlobal("fetch", mockFetch(503, {
      detail: { code: "RANKED_BOT_DISABLED", message: "not enabled" },
    }));
    await expect(createBotMatch("tank", null)).rejects.toBeInstanceOf(RankedApiError);
  });
});

describe("public round playtest metadata", () => {
  const base = {
    schema_version: "ranked_duel.public_round.v2",
    projection_type: "public_round",
    match_id: "m1",
    round_number: 1,
    server_time: "2026-07-18T12:00:00Z",
    payload: {
      match_id: "m1", match_status: "active", match_over: false,
      winner_id: null, completion_reason: null, completed_rounds: 0,
      players: [], active_round: null, next_round_duration_seconds: 30,
      question: null, progression_pending_players: [], presence: null,
    },
  };

  it("parses placeholder + bot flags when present", () => {
    const withMeta = {
      ...base,
      payload: {
        ...base.payload,
        playtest: { question_bank_mode: "placeholder", is_placeholder: true, is_bot_match: true },
      },
    };
    const view = readPublicRound(withMeta);
    expect(view.playtest).toEqual({
      questionBankMode: "placeholder", isPlaceholder: true, isBotMatch: true,
    });
  });

  it("is null when absent (ordinary production match)", () => {
    expect(readPublicRound(base).playtest).toBeNull();
  });
});
