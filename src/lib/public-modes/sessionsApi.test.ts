/**
 * PGM2 — the public session client: player auth (a POST mints a guest
 * identity, a GET never does), the public routes, the owner labs' contracts,
 * player-facing errors, and Perfect Timing's run binding.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import capture from "@/lib/perfect-timing/__fixtures__/captureV1.json";

const auth = vi.hoisted(() => ({ calls: [] as (unknown)[] }));
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: vi.fn(async (opts?: unknown) => { auth.calls.push(opts ?? null); return { Authorization: "Bearer player" }; }),
}));
vi.mock("@/lib/ranked-public/client", () => ({ RANKED_API_BASE: "http://api.test" }));

import { PerfectTimingApiError } from "@/lib/perfect-timing/api";
import { BonusSessionError, bonusSessionsApi, bonusTimingApi, describeBonusError } from "./sessionsApi";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => { auth.calls.length = 0; vi.clearAllMocks(); });

describe("bonusSessionsApi", () => {
  it("starts a session with a POST to the public route, minting a guest identity when needed", async () => {
    const fetchImpl = vi.fn(async () => reply({ contract: "interaction_lab.rangefinder.session.v1", session_id: "s", rounds: [] }));
    await bonusSessionsApi(fetchImpl as unknown as typeof fetch).startRangefinder();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/api/game-modes/rangefinder/sessions");
    expect(init.method).toBe("POST");
    expect(auth.calls).toEqual([{ mint: "ranked_write" }]);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer player");
  });

  it("locks with exactly the round's field, on the session's own path", async () => {
    const fetchImpl = vi.fn(async () => reply({ contract: "bonus_session.stat_drop.release.v1", index: 2 }));
    await bonusSessionsApi(fetchImpl as unknown as typeof fetch).lockStatDrop("s/1", 2, 3.5);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/api/game-modes/stat_drop/sessions/s%2F1/rounds/2/lock");
    expect(JSON.parse(String(init.body))).toEqual({ value: 3.5 });
  });

  it("refuses a response under another contract", async () => {
    const fetchImpl = vi.fn(async () => reply({ contract: "something_else" }));
    await expect(bonusSessionsApi(fetchImpl as unknown as typeof fetch).startGlyphPress())
      .rejects.toMatchObject({ code: "CONTRACT" });
  });

  it("carries the server's code, and words it for players", async () => {
    const fetchImpl = vi.fn(async () => reply({ detail: { code: "BONUS_GAMES_PAUSED", message: "x" } }, 503));
    const err = await bonusSessionsApi(fetchImpl as unknown as typeof fetch).startStatDrop().catch((e) => e);
    expect(err).toBeInstanceOf(BonusSessionError);
    expect(err.code).toBe("BONUS_GAMES_PAUSED");
    expect(describeBonusError(err)).toBe("New bonus games are paused for now. Please check back soon.");
    expect(describeBonusError(new BonusSessionError("x", 404, "SESSION_EXPIRED"))).toBe("This game expired. Start a new one.");
    expect(describeBonusError(new BonusSessionError("x", null, null))).toMatch(/Could not reach Mogzy/);
    for (const e of [new BonusSessionError("x", 503, null), new BonusSessionError("x", 401, null)]) {
      expect(describeBonusError(e)).not.toMatch(/owner|admin|flag|deploy|backend/i);
    }
  });

  it("fetches a clue with a GET that never mints, and only from the public route", async () => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:x");
    const fetchImpl = vi.fn(async () => new Response(new Blob(["png"]), { status: 200 }));
    const api = bonusSessionsApi(fetchImpl as unknown as typeof fetch);
    expect(await api.clueImage("/api/game-modes/glyph_press/sessions/s/rounds/0/clue")).toBe("blob:x");
    expect(auth.calls).toEqual([null]);
    await expect(api.clueImage("/glyph-press/sessions/s/rounds/0/clue")).rejects.toMatchObject({ code: "CONTRACT" });
  });
});

describe("bonusTimingApi — Perfect Timing over one public run", () => {
  function standIn() {
    const calls: { path: string; body: Json }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace("http://api.test/api/game-modes/perfect_timing", "");
      const body = JSON.parse(String(init?.body ?? "{}")) as Json;
      calls.push({ path, body });
      const deal = clone(capture.deal.response) as Json;
      for (const r of deal.rounds) r.expires_at = new Date(Date.now() + 600_000).toISOString();
      if (path === "/sessions") return reply({ ...deal, session_id: `run${calls.filter((c) => c.path === "/sessions").length}` });
      if (path.endsWith("/deal")) return reply({ ...deal, rounds: [deal.rounds[0]], session_id: "run1" });
      const lock = (capture.locks as Json[]).find((l) => path.endsWith(`/rounds/${l.round_id}/lock`));
      if (lock && body.elapsed_ms === lock.request.elapsed_ms) return reply(lock.response);
      return reply({ detail: { code: "ROUND_EXPIRED", message: "gone" } }, 404);
    });
    return { fetchImpl, calls };
  }

  it("binds deals and locks to one run, and starts a new run for a full deal", async () => {
    const { fetchImpl, calls } = standIn();
    const api = bonusTimingApi({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    const first = await api.deal(5);
    expect(first.rounds.length).toBeGreaterThan(0);
    expect("session_id" in (first as Json)).toBe(false);
    await api.deal(1);
    expect(calls.map((c) => c.path)).toEqual(["/sessions", "/sessions/run1/deal"]);
    const lock = (capture.locks as Json[])[0];
    await api.lock(lock.round_id, lock.request.elapsed_ms);
    expect(calls.at(-1)!.path).toBe(`/sessions/run1/rounds/${lock.round_id}/lock`);
    await api.deal(5);
    expect(calls.at(-1)!.path).toBe("/sessions");
  });

  it("raises the owner client's error class, so the page's expiry handling works unchanged", async () => {
    const { fetchImpl } = standIn();
    const api = bonusTimingApi({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    await api.deal(5);
    const err = await api.lock("pt_" + "0".repeat(32), 1000).catch((e) => e);
    expect(err).toBeInstanceOf(PerfectTimingApiError);
    expect(err.status).toBe(404);
  });

  it("refuses PT5's Mastery Slice calls without touching the network (public practice is the Random Run)", async () => {
    const fetchImpl = vi.fn();
    const api = bonusTimingApi({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    const deal = await api.dealSlice().catch((e) => e);
    const lock = await api.lockSlice("s", "r", 1000).catch((e) => e);
    for (const err of [deal, lock]) {
      expect(err).toBeInstanceOf(PerfectTimingApiError);
      expect(err.code).toBe("PT_SLICE_UNAVAILABLE");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
