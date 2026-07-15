import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  rankedDuelReviewApi,
  RankedDuelReviewAuthError,
  RankedDuelReviewConflictError,
  RankedDuelReviewError,
  RankedDuelReviewUnavailableError,
  isRankedReviewUnavailable,
} from "./api";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";

const BASE = "http://127.0.0.1:8000";
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const err = (status: number, detail: unknown) =>
  new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const stub = (impl: (url: string, init: RequestInit) => Promise<Response>) => {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  return spy;
};
const headersOf = (spy: ReturnType<typeof stub>, call = 0) =>
  (spy.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

beforeEach(() => setAdminKey("secret-admin"));
afterEach(() => {
  clearAdminKey();
  vi.unstubAllGlobals();
});

describe("rankedDuelReviewApi — read-only surface", () => {
  it("exposes only read-only GET probes (no write/mutation methods)", () => {
    // The shipped runtime must be incapable of writing decisions/exports until
    // the backend ships those endpoints. Guard against accidental re-addition.
    expect(Object.keys(rankedDuelReviewApi).sort()).toEqual(["list", "progress"]);
    expect((rankedDuelReviewApi as Record<string, unknown>).decide).toBeUndefined();
    expect((rankedDuelReviewApi as Record<string, unknown>).export).toBeUndefined();
  });

  it("lists candidates with the admin key and query params (GET)", async () => {
    const spy = stub(async () => ok({ ok: true, total: 0, items: [] }));
    await rankedDuelReviewApi.list({ status: "unreviewed", limit: 25, offset: 50 });
    expect(spy.mock.calls[0][0]).toBe(
      `${BASE}/api/admin/ranked-duel/review/candidates?status=unreviewed&limit=25&offset=50`,
    );
    expect((spy.mock.calls[0][1] as RequestInit).method).toBeUndefined(); // GET
    expect(headersOf(spy)["X-Admin-Key"]).toBe("secret-admin");
  });

  it("fetches progress (GET)", async () => {
    const spy = stub(async () => ok({ ok: true, total: 3, counts: {} }));
    const res = await rankedDuelReviewApi.progress();
    expect(spy.mock.calls[0][0]).toBe(`${BASE}/api/admin/ranked-duel/review/progress`);
    expect(res.total).toBe(3);
  });

  it("throws an auth error and makes no request when the admin key is missing", async () => {
    clearAdminKey();
    const spy = stub(async () => ok({}));
    await expect(rankedDuelReviewApi.progress()).rejects.toBeInstanceOf(RankedDuelReviewAuthError);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("rankedDuelReviewApi — boundary error mapping", () => {
  it("maps 404 to the unavailable boundary error (expected current state)", async () => {
    stub(async () => err(404, "Not Found"));
    const caught = await rankedDuelReviewApi.progress().catch((e) => e);
    expect(isRankedReviewUnavailable(caught)).toBe(true);
    expect((caught as RankedDuelReviewUnavailableError).status).toBe(404);
  });

  it("maps 501 to the unavailable boundary error too", async () => {
    stub(async () => err(501, "Not Implemented"));
    const caught = await rankedDuelReviewApi.list().catch((e) => e);
    expect(caught).toBeInstanceOf(RankedDuelReviewUnavailableError);
  });

  it("maps 403 to an auth error", async () => {
    stub(async () => err(403, "Invalid or missing X-Admin-Key"));
    await expect(rankedDuelReviewApi.progress()).rejects.toBeInstanceOf(RankedDuelReviewAuthError);
  });

  it("maps 409 to a conflict (stale source hash)", async () => {
    stub(async () => err(409, { error_code: "stale", message: "candidate changed" }));
    const caught = await rankedDuelReviewApi.list().catch((e) => e);
    expect(caught).toBeInstanceOf(RankedDuelReviewConflictError);
    expect((caught as Error).message).toContain("candidate changed");
  });

  it("maps other non-2xx to a generic error with status", async () => {
    stub(async () => err(500, "boom"));
    const caught = await rankedDuelReviewApi.progress().catch((e) => e);
    expect(caught).toBeInstanceOf(RankedDuelReviewError);
    expect((caught as RankedDuelReviewError).status).toBe(500);
  });

  it("reports an unreachable backend as a network error without leaking internals", async () => {
    stub(async () => {
      throw new TypeError("Failed to fetch");
    });
    const caught = await rankedDuelReviewApi.progress().catch((e) => e);
    expect(caught).toBeInstanceOf(RankedDuelReviewError);
    expect((caught as Error).message).not.toContain("Failed to fetch");
  });
});
