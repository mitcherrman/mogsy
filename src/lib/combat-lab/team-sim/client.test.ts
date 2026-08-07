/**
 * API adapter integration: the real Phase 4A catalog body, the real Phase 3C
 * simulation bodies and the real error bodies, driven through the client that
 * the UI actually uses.
 *
 * No production backend is contacted — `fetch` is stubbed with the captured
 * payloads, which are byte-for-byte what the endpoints returned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetCatalogCache,
  assertSimulationResponse,
  fetchTeamSimCatalog,
  submitTeamSimulation,
} from "./client";
import { TeamSimError } from "./errors";
import type { TeamSimulationRequest } from "./contract";
import {
  REAL_1V1,
  REAL_2V2,
  REAL_CATALOG,
  REAL_CATALOG_ETAG,
  REAL_ERROR_META,
  REAL_ERRORS,
  REAL_REQUESTS,
} from "./__fixtures__";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
}));

type FetchCall = { url: string; init: RequestInit | undefined };
let calls: FetchCall[] = [];

/**
 * Deliberately NOT `Partial<Response>`: that type already declares `body` as a
 * ReadableStream and `headers` as a Headers, so intersecting it turns every
 * plain-object fixture into a type error.
 */
type StubOutcome = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

function stubFetch(
  responder: (url: string, init: RequestInit | undefined) => StubOutcome
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const spec = responder(String(url), init);
      const headers = new Headers(spec.headers ?? {});
      return {
        ok: spec.status >= 200 && spec.status < 300,
        status: spec.status,
        headers,
        json: async () => {
          if (spec.body === undefined) throw new Error("no body");
          return spec.body;
        },
      } as unknown as Response;
    })
  );
}

beforeEach(() => {
  calls = [];
  __resetCatalogCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTeamSimCatalog", () => {
  it("loads the real catalog from the team-simulate catalog endpoint", async () => {
    stubFetch(() => ({
      status: 200,
      body: REAL_CATALOG,
      headers: { etag: REAL_CATALOG_ETAG },
    }));

    const load = await fetchTeamSimCatalog();
    expect(load.catalog.catalog_digest).toBe(REAL_CATALOG.catalog_digest);
    expect(load.etag).toBe(REAL_CATALOG_ETAG);
    expect(load.fromCache).toBe(false);
    expect(calls[0].url).toContain("/api/combat-lab/team-simulate/catalog/v1");
  });

  it("NEVER reads the legacy /api/meta/items vocabulary", async () => {
    stubFetch(() => ({ status: 200, body: REAL_CATALOG, headers: { etag: "\"x\"" } }));
    await fetchTeamSimCatalog();
    for (const call of calls) {
      expect(call.url).not.toContain("/api/meta/items");
      expect(call.url).not.toContain("/api/meta/runes");
    }
  });

  it("revalidates with If-None-Match and reuses the body on 304", async () => {
    let hit = 0;
    stubFetch((_url, init) => {
      hit += 1;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (hit === 1) {
        return { status: 200, body: REAL_CATALOG, headers: { etag: REAL_CATALOG_ETAG } };
      }
      expect(headers["If-None-Match"]).toBe(REAL_CATALOG_ETAG);
      return { status: 304, headers: { etag: REAL_CATALOG_ETAG } };
    });

    await fetchTeamSimCatalog();
    const second = await fetchTeamSimCatalog();
    expect(second.fromCache).toBe(true);
    expect(second.catalog.catalog_digest).toBe(REAL_CATALOG.catalog_digest);
    expect(hit).toBe(2);
  });

  it("does not send If-None-Match on a cold load", async () => {
    stubFetch(() => ({ status: 200, body: REAL_CATALOG, headers: { etag: "\"x\"" } }));
    await fetchTeamSimCatalog();
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers["If-None-Match"]).toBeUndefined();
  });

  it("reports a 503 catalog_unavailable as a typed error", async () => {
    stubFetch(() => ({
      status: 503,
      body: { code: "catalog_unavailable", message: "OperationalError" },
    }));
    await expect(fetchTeamSimCatalog()).rejects.toBeInstanceOf(TeamSimError);
  });

  it("reports a malformed catalog rather than building empty selectors", async () => {
    stubFetch(() => ({ status: 200, body: { ...REAL_CATALOG, champions: [] } }));
    const error = await fetchTeamSimCatalog().catch((e) => e as TeamSimError);
    expect(error).toBeInstanceOf(TeamSimError);
    expect((error as TeamSimError).code).toBe("catalog_malformed");
    expect((error as TeamSimError).message).toMatch(/champions/);
  });

  it("reports a transport failure as uncertain-free but typed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    const error = await fetchTeamSimCatalog().catch((e) => e as TeamSimError);
    expect(error).toBeInstanceOf(TeamSimError);
    expect((error as TeamSimError).kind).toBe("network");
  });
});

describe("submitTeamSimulation", () => {
  const request = REAL_REQUESTS["1v1"] as unknown as TeamSimulationRequest;

  it("POSTs to the versioned team-simulate endpoint with auth", async () => {
    stubFetch(() => ({ status: 200, body: REAL_1V1 }));
    const response = await submitTeamSimulation(request);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/api/combat-lab/team-simulate/v1");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token"
    );
    expect(response.termination.reason).toBe(REAL_1V1.termination.reason);
    expect(response.effective_builds.A1.champion).toBe("Ashe");
  });

  it("parses the real 2v2 body with every block the UI renders", async () => {
    stubFetch(() => ({ status: 200, body: REAL_2V2 }));
    const response = await submitTeamSimulation(request);
    expect(response.termination.winner).toBe("A");
    expect(Object.keys(response.effective_builds).sort()).toEqual([
      "A1",
      "A2",
      "B1",
      "B2",
    ]);
    expect(response.trace.summaries_cover_full_simulation).toBe(true);
    expect(response.credits).toHaveProperty("credits_used");
    expect(response.events.length).toBeGreaterThan(0);
  });

  it.each([
    ["401" as const, "auth_required", "AUTH_REQUIRED", "rejected"],
    ["402" as const, "insufficient_credits", "insufficient_credits", "rejected"],
    ["403" as const, "account_required", "ACCOUNT_REQUIRED", "rejected"],
    ["413" as const, "request_too_large", "request_too_large", "rejected"],
    ["422_item" as const, "invalid_request", "unknown_item", "rejected"],
    ["429" as const, "rate_limited", "rate_limited", "rejected"],
    ["500" as const, "server_error", "internal_error", "unknown"],
  ])(
    "maps the captured %s body to kind %s / code %s (%s)",
    async (key, kind, code, certainty) => {
      // Status comes from the capture metadata, never restated here.
      const body = REAL_ERRORS[key as keyof typeof REAL_ERRORS];
      const status = REAL_ERROR_META[key as keyof typeof REAL_ERROR_META].status;
      stubFetch(() => ({ status, body }));
      const error = (await submitTeamSimulation(request).catch((e) => e)) as TeamSimError;
      expect(error).toBeInstanceOf(TeamSimError);
      expect(error.status).toBe(status);
      expect(error.kind).toBe(kind);
      expect(error.code).toBe(code);
      expect(error.certainty).toBe(certainty);
    }
  );

  it("carries the credit block out of a real 402", async () => {
    stubFetch(() => ({ status: 402, body: REAL_ERRORS[402] }));
    const error = (await submitTeamSimulation(request).catch((e) => e)) as TeamSimError;
    expect(error.credits).toMatchObject({ blocked: true, credits_remaining: 0 });
  });

  it("flattens FastAPI's schema-error 422 into one readable message", async () => {
    stubFetch(() => ({ status: 422, body: REAL_ERRORS["422_schema"] }));
    const error = (await submitTeamSimulation(request).catch((e) => e)) as TeamSimError;
    expect(error.code).toBe("schema_invalid");
    expect(error.message).toContain("ability rank Q=9 out of range");
    expect(error.message).toContain("team_a.combatants.0.ability_ranks");
  });

  it("surfaces Retry-After on a 429 without ever retrying", async () => {
    const meta = REAL_ERROR_META[429];
    stubFetch(() => ({ status: meta.status, body: REAL_ERRORS[429], headers: meta.headers }));
    const error = (await submitTeamSimulation(request).catch((e) => e)) as TeamSimError;
    expect(error.retryAfterSeconds).toBe(Number(meta.headers["retry-after"]));
    expect(calls).toHaveLength(1);
  });

  it("classifies a lost connection as UNKNOWN, not rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Network request failed");
      })
    );
    const error = (await submitTeamSimulation(request).catch((e) => e)) as TeamSimError;
    expect(error.kind).toBe("network");
    expect(error.isUncertain).toBe(true);
    expect(error.status).toBeNull();
  });

  it("sends exactly one request per call — the client never retries", async () => {
    stubFetch(() => ({ status: 500, body: REAL_ERRORS[500] }));
    await submitTeamSimulation(request).catch(() => undefined);
    expect(calls).toHaveLength(1);
  });

  it("treats an unreadable 200 body as uncertain (the run may have been charged)", async () => {
    stubFetch(() => ({ status: 200, body: { termination: {} } }));
    const error = (await submitTeamSimulation(request).catch((e) => e)) as TeamSimError;
    expect(error.kind).toBe("malformed_response");
    expect(error.isUncertain).toBe(true);
  });
});

describe("assertSimulationResponse", () => {
  it("accepts every captured real response", () => {
    expect(() => assertSimulationResponse(REAL_1V1)).not.toThrow();
    expect(() => assertSimulationResponse(REAL_2V2)).not.toThrow();
  });

  it.each(["termination", "events", "trace", "effective_builds", "combatant_summaries"])(
    "rejects a body missing %s",
    (field) => {
      const broken = { ...(REAL_1V1 as unknown as Record<string, unknown>) };
      delete broken[field];
      expect(() => assertSimulationResponse(broken)).toThrow(new RegExp(field));
    }
  );
});
