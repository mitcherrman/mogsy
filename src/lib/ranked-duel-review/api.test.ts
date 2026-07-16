import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  rankedReviewApi,
  ReviewApiError,
  describeReviewError,
  isConflictError,
  isStaleError,
} from "./api";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";

// Account-bound bearer: mock the shared Supabase-session header source so we
// can assert Authorization: Bearer without a real session.
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-access-token" }),
}));

const BASE = "http://127.0.0.1:8000";
const ADMIN = "/api/admin/ranked-duel/questions";
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const errBody = (status: number, error_code: string, message = "x") =>
  new Response(JSON.stringify({ detail: { error_code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const stub = (impl: (url: string, init: RequestInit) => Promise<Response>) => {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  return spy;
};
const call = (spy: ReturnType<typeof stub>, i = 0) => ({
  url: String(spy.mock.calls[i][0]),
  init: spy.mock.calls[i][1] as RequestInit,
  headers: (spy.mock.calls[i][1] as RequestInit).headers as Record<string, string>,
  body: () => JSON.parse((spy.mock.calls[i][1] as RequestInit).body as string),
});

beforeEach(() => setAdminKey("secret-admin"));
afterEach(() => {
  clearAdminKey();
  vi.unstubAllGlobals();
});

describe("rankedReviewApi — endpoints, methods, admin key", () => {
  it("GET /status", async () => {
    const spy = stub(async () => ok({ exportable: 0 }));
    await rankedReviewApi.status();
    expect(call(spy).url).toBe(`${BASE}${ADMIN}/status`);
    expect(call(spy).init.method).toBe("GET");
    expect(call(spy).headers["X-Admin-Key"]).toBe("secret-admin");
  });

  it("GET /candidates with filter query params", async () => {
    const spy = stub(async () => ok([]));
    await rankedReviewApi.listCandidates({
      decision: "unreviewed",
      family: "tank_hp",
      stale: true,
      exportable: false,
      search: "fortify",
    });
    expect(call(spy).url).toBe(
      `${BASE}${ADMIN}/candidates?decision=unreviewed&family=tank_hp&stale=true&exportable=false&search=fortify`,
    );
  });

  it("GET /candidates/{id} encodes the id", async () => {
    const spy = stub(async () => ok({ candidate_id: "a" }));
    await rankedReviewApi.getCandidate("tank_hp:seed 1:f/2");
    expect(call(spy).url).toBe(`${BASE}${ADMIN}/candidates/tank_hp%3Aseed%201%3Af%2F2`);
  });

  it("POST accept sends source_hash + reviewer + notes + overwrite", async () => {
    const spy = stub(async () => ok({ decision: "accepted" }));
    await rankedReviewApi.accept("c1", {
      source_hash: "sha256:abc",
      reviewer: "mitchell",
      notes: "looks right",
      overwrite: true,
    });
    expect(call(spy).url).toBe(`${BASE}${ADMIN}/candidates/c1/accept`);
    expect(call(spy).init.method).toBe("POST");
    expect(call(spy).body()).toEqual({
      source_hash: "sha256:abc",
      reviewer: "mitchell",
      notes: "looks right",
      overwrite: true,
    });
  });

  it("POST reject carries the required reason", async () => {
    const spy = stub(async () => ok({ decision: "rejected" }));
    await rankedReviewApi.reject("c1", {
      source_hash: "h",
      reviewer: "m",
      reason: "wrong math",
    });
    expect(call(spy).url).toBe(`${BASE}${ADMIN}/candidates/c1/reject`);
    expect(call(spy).body().reason).toBe("wrong math");
  });

  it("POST revise sends only the editable patch", async () => {
    const spy = stub(async () => ok({ decision: "revised" }));
    await rankedReviewApi.revise("c1", {
      source_hash: "h",
      reviewer: "m",
      patch: { question_text: "clearer wording", options: ["a", "b", "c", "d"] },
    });
    expect(call(spy).url).toBe(`${BASE}${ADMIN}/candidates/c1/revise`);
    expect(call(spy).body().patch).toEqual({
      question_text: "clearer wording",
      options: ["a", "b", "c", "d"],
    });
  });

  it("POST /validate and /export are POSTs with the admin key", async () => {
    const spy = stub(async () => ok({}));
    await rankedReviewApi.validate();
    await rankedReviewApi.export();
    expect(call(spy, 0).url).toBe(`${BASE}${ADMIN}/validate`);
    expect(call(spy, 0).init.method).toBe("POST");
    expect(call(spy, 1).url).toBe(`${BASE}${ADMIN}/export`);
    expect(call(spy, 1).headers["X-Admin-Key"]).toBe("secret-admin");
  });

  it("sends the Supabase bearer by default and no X-Admin-Key without a fallback", async () => {
    clearAdminKey();
    const spy = stub(async () => ok({ exportable: 0 }));
    await rankedReviewApi.status();
    expect(call(spy).headers["Authorization"]).toBe("Bearer test-access-token");
    expect(call(spy).headers["X-Admin-Key"]).toBeUndefined();
  });

  it("adds X-Admin-Key as an explicit fallback alongside the bearer", async () => {
    setAdminKey("fallback-key");
    const spy = stub(async () => ok({ exportable: 0 }));
    await rankedReviewApi.status();
    expect(call(spy).headers["Authorization"]).toBe("Bearer test-access-token");
    expect(call(spy).headers["X-Admin-Key"]).toBe("fallback-key");
  });
});

describe("rankedReviewApi — error_code mapping", () => {
  it("403 → auth", async () => {
    stub(async () => errBody(403, "x", "Invalid or missing X-Admin-Key"));
    await expect(rankedReviewApi.status()).rejects.toMatchObject({ kind: "auth" });
  });

  it("404 → not_found", async () => {
    stub(async () => errBody(404, "candidate_not_found"));
    await expect(rankedReviewApi.getCandidate("nope")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("409 stale_candidate → stale (distinct from conflict)", async () => {
    stub(async () => errBody(409, "stale_candidate", "reload before reviewing"));
    const e = await rankedReviewApi
      .accept("c", { source_hash: "old", reviewer: "m" })
      .catch((x) => x);
    expect(isStaleError(e)).toBe(true);
    expect(isConflictError(e)).toBe(false);
    expect(describeReviewError(e)).toContain("Reload");
  });

  it("409 decision_conflict → conflict", async () => {
    stub(async () => errBody(409, "decision_conflict", "already decided"));
    const e = await rankedReviewApi
      .accept("c", { source_hash: "h", reviewer: "m" })
      .catch((x) => x);
    expect(isConflictError(e)).toBe(true);
    expect(describeReviewError(e)).toContain("overwrite");
  });

  it("422 invalid_revision → invalid_revision (surfaces the server message)", async () => {
    stub(async () => errBody(422, "invalid_revision", "correct answer value cannot change"));
    const e = await rankedReviewApi
      .revise("c", { source_hash: "h", reviewer: "m", patch: { correct_answer: "9" } })
      .catch((x) => x);
    expect(e).toBeInstanceOf(ReviewApiError);
    expect((e as ReviewApiError).kind).toBe("invalid_revision");
    expect(describeReviewError(e)).toContain("cannot change");
  });

  it("400 → invalid_request", async () => {
    stub(async () => errBody(400, "invalid_request", "reviewer required"));
    await expect(
      rankedReviewApi.accept("c", { source_hash: "h", reviewer: "" }),
    ).rejects.toMatchObject({ kind: "invalid_request" });
  });

  it("5xx → server (message preserved, no internals fabricated)", async () => {
    stub(async () => errBody(500, "storage_error", "Failed to persist the review decision."));
    const e = await rankedReviewApi
      .accept("c", { source_hash: "h", reviewer: "m" })
      .catch((x) => x);
    expect((e as ReviewApiError).kind).toBe("server");
    expect(describeReviewError(e)).toContain("persist");
  });

  it("network failure → network, no stack leak", async () => {
    stub(async () => {
      throw new TypeError("Failed to fetch");
    });
    const e = await rankedReviewApi.status().catch((x) => x);
    expect((e as ReviewApiError).kind).toBe("network");
    expect(describeReviewError(e)).not.toContain("TypeError");
  });
});
