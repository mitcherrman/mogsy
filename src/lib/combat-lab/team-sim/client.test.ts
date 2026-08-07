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
  REAL_REPLAY_PAIR,
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
  /** The key belongs to the prepared request; this module only forwards it. */
  const KEY = "fixed-test-key";

  it("POSTs to the versioned team-simulate endpoint with auth and the key", async () => {
    stubFetch(() => ({ status: 200, body: REAL_1V1 }));
    const outcome = await submitTeamSimulation(request, KEY);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/api/combat-lab/team-simulate/v1");
    expect(calls[0].init?.method).toBe("POST");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["Idempotency-Key"]).toBe(KEY);
    expect(outcome.response.termination.reason).toBe(REAL_1V1.termination.reason);
    expect(outcome.response.effective_builds.A1.champion).toBe("Ashe");
  });

  it("forwards the caller's key verbatim and never mints its own", async () => {
    stubFetch(() => ({ status: 200, body: REAL_1V1 }));
    await submitTeamSimulation(request, "key-a");
    await submitTeamSimulation(request, "key-a");
    const sent = calls.map(
      (c) => (c.init?.headers as Record<string, string>)["Idempotency-Key"]
    );
    // Recovery only works if this module is a pure forwarder: a key minted
    // here would be different on the second call and would buy a second run.
    expect(sent).toEqual(["key-a", "key-a"]);
  });

  it("reports whether the server replayed a stored result", async () => {
    stubFetch(() => ({
      status: 200,
      body: REAL_REPLAY_PAIR.replayed,
      headers: { "idempotency-replayed": "true" },
    }));
    expect((await submitTeamSimulation(request, KEY)).replayed).toBe(true);

    stubFetch(() => ({
      status: 200,
      body: REAL_REPLAY_PAIR.first,
      headers: { "idempotency-replayed": "false" },
    }));
    expect((await submitTeamSimulation(request, KEY)).replayed).toBe(false);

    // Absent header: a replay is never ASSUMED.
    stubFetch(() => ({ status: 200, body: REAL_1V1 }));
    expect((await submitTeamSimulation(request, KEY)).replayed).toBe(false);
  });

  it("captured a replay that is byte-identical to the original", () => {
    // Both fixtures came from one live pair (same key, same body); the capture
    // refused to write them unless the bytes matched.
    expect(REAL_REPLAY_PAIR.replayed).toEqual(REAL_REPLAY_PAIR.first);
    expect(REAL_REPLAY_PAIR.firstMeta.idempotency_replayed).toBe("false");
    expect(REAL_REPLAY_PAIR.replayedMeta.idempotency_replayed).toBe("true");
  });

  it("parses the real 2v2 body with every block the UI renders", async () => {
    stubFetch(() => ({ status: 200, body: REAL_2V2 }));
    const { response } = await submitTeamSimulation(request, KEY);
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
    ["400" as const, "idempotency_key_rejected", "idempotency_key_required", "rejected"],
    ["400_invalid" as const, "idempotency_key_rejected", "idempotency_key_invalid", "rejected"],
    ["401" as const, "auth_required", "AUTH_REQUIRED", "rejected"],
    ["402" as const, "insufficient_credits", "insufficient_credits", "rejected"],
    ["403" as const, "account_required", "ACCOUNT_REQUIRED", "rejected"],
    ["409" as const, "idempotency_conflict", "idempotency_conflict", "rejected"],
    ["409_in_progress" as const, "idempotency_in_progress", "idempotency_in_progress",
      "rejected"],
    ["413" as const, "request_too_large", "request_too_large", "rejected"],
    ["422_item" as const, "invalid_request", "unknown_item", "rejected"],
    ["429" as const, "rate_limited", "rate_limited", "rejected"],
    ["500" as const, "server_error", "internal_error", "unknown"],
    // The endpoint's own 503 is a documented fail-CLOSED refusal, so it is a
    // REJECTION despite being a 5xx — the one place that distinction matters.
    ["503" as const, "service_unavailable", "idempotency_unavailable", "rejected"],
    // Its OTHER 503 says the opposite about money: the charge committed and
    // only the result is lost. Never folded in with the one above.
    ["503_unreadable" as const, "result_unreadable",
      "idempotency_result_unreadable", "unknown"],
  ])(
    "maps the captured %s body to kind %s / code %s (%s)",
    async (key, kind, code, certainty) => {
      // Status comes from the capture metadata, never restated here.
      const body = REAL_ERRORS[key as keyof typeof REAL_ERRORS];
      const status = REAL_ERROR_META[key as keyof typeof REAL_ERROR_META].status;
      stubFetch(() => ({ status, body }));
      const error = (await submitTeamSimulation(request, KEY).catch((e) => e)) as TeamSimError;
      expect(error).toBeInstanceOf(TeamSimError);
      expect(error.status).toBe(status);
      expect(error.kind).toBe(kind);
      expect(error.code).toBe(code);
      expect(error.certainty).toBe(certainty);
    }
  );

  it("carries the credit block out of a real 402", async () => {
    stubFetch(() => ({ status: 402, body: REAL_ERRORS[402] }));
    const error = (await submitTeamSimulation(request, KEY).catch((e) => e)) as TeamSimError;
    expect(error.credits).toMatchObject({ blocked: true, credits_remaining: 0 });
  });

  it("flattens FastAPI's schema-error 422 into one readable message", async () => {
    stubFetch(() => ({ status: 422, body: REAL_ERRORS["422_schema"] }));
    const error = (await submitTeamSimulation(request, KEY).catch((e) => e)) as TeamSimError;
    expect(error.code).toBe("schema_invalid");
    expect(error.message).toContain("ability rank Q=9 out of range");
    expect(error.message).toContain("team_a.combatants.0.ability_ranks");
  });

  it("surfaces Retry-After on a 429 without ever retrying", async () => {
    const meta = REAL_ERROR_META[429];
    stubFetch(() => ({ status: meta.status, body: REAL_ERRORS[429], headers: meta.headers }));
    const error = (await submitTeamSimulation(request, KEY).catch((e) => e)) as TeamSimError;
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
    const error = (await submitTeamSimulation(request, KEY).catch((e) => e)) as TeamSimError;
    expect(error.kind).toBe("network");
    expect(error.isUncertain).toBe(true);
    expect(error.status).toBeNull();
  });

  it("sends exactly one request per call — the client never retries", async () => {
    stubFetch(() => ({ status: 500, body: REAL_ERRORS[500] }));
    await submitTeamSimulation(request, KEY).catch(() => undefined);
    expect(calls).toHaveLength(1);
  });

  it("treats an unreadable 200 body as uncertain (the run may have been charged)", async () => {
    stubFetch(() => ({ status: 200, body: { termination: {} } }));
    const error = (await submitTeamSimulation(request, KEY).catch((e) => e)) as TeamSimError;
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

/**
 * Phase 4C: statuses whose meaning depends on the CODE, not the number.
 * Every case here was a confirmed adversarial-review finding — each one had
 * the page stating a false fact about money or about what went wrong.
 */
describe("status-plus-code classification", () => {
  const request = REAL_REQUESTS["1v1"] as unknown as TeamSimulationRequest;
  const KEY = "fixed-test-key";

  it("never claims 'nothing was charged' for a 503 it cannot identify", async () => {
    // A proxy or a cold start returns a 503 with no code, or with no JSON at
    // all. That is genuinely unknown; the endpoint's own fail-closed message
    // must not be borrowed for it.
    for (const body of [null, {}, { detail: "upstream unavailable" }]) {
      stubFetch(() => ({ status: 503, body }));
      const error = (await submitTeamSimulation(request, KEY).catch(
        (e) => e
      )) as TeamSimError;
      expect(error.certainty).toBe("unknown");
      expect(error.message).not.toContain("nothing was charged");
      expect(error.message).not.toContain("Nothing ran");
    }
  });

  it("does claim it for the endpoint's own fail-closed 503", async () => {
    stubFetch(() => ({ status: 503, body: REAL_ERRORS[503] }));
    const error = (await submitTeamSimulation(request, KEY).catch(
      (e) => e
    )) as TeamSimError;
    expect(error.certainty).toBe("rejected");
    expect(error.message).toContain("Nothing ran and nothing was charged");
    // Never the backend's raw exception type name.
    expect(error.message).not.toBe("LedgerUnavailable");
  });

  it("says a damaged stored result WAS charged", async () => {
    stubFetch(() => ({ status: 503, body: REAL_ERRORS["503_unreadable"] }));
    const error = (await submitTeamSimulation(request, KEY).catch(
      (e) => e
    )) as TeamSimError;
    expect(error.kind).toBe("result_unreadable");
    expect(error.message).toContain("charged");
    expect(error.message).not.toContain("nothing was charged");
  });

  it("does not blame the idempotency key for a generic 400", async () => {
    // FastAPI's own body reader emits a 400 with a bare STRING detail and no
    // code. Calling that a key problem sends the operator round a loop that
    // can never fix it.
    for (const body of [null, { detail: "There was an error parsing the body" }]) {
      stubFetch(() => ({ status: 400, body }));
      const error = (await submitTeamSimulation(request, KEY).catch(
        (e) => e
      )) as TeamSimError;
      expect(error.kind).toBe("invalid_request");
      expect(error.certainty).toBe("rejected");
    }
  });

  it("does blame it when the backend says so", async () => {
    for (const key of ["400", "400_invalid"] as const) {
      stubFetch(() => ({ status: 400, body: REAL_ERRORS[key] }));
      const error = (await submitTeamSimulation(request, KEY).catch(
        (e) => e
      )) as TeamSimError;
      expect(error.kind).toBe("idempotency_key_rejected");
    }
  });
});
