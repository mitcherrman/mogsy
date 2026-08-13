/**
 * SIM2 Phase 4E — the network layer for server-side recovery.
 *
 * Two calls with very different risk profiles, tested against the shapes the
 * backend actually produces:
 *
 *   fetchRecoverableRequests — a list. Its job is to be USEFUL when things are
 *     already going wrong, so it degrades entry-by-entry rather than refusing
 *     the whole page because one row is malformed.
 *
 *   recoverSimulation — collects a paid result. Its job is to never be
 *     mistaken for a simulation: it carries no idempotency key, it is
 *     addressed only by the opaque handle, and every non-2xx it can receive
 *     maps to a kind the UI can say something true about.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertRecoverableListing,
  fetchRecoverableRequests,
  recoverSimulation,
} from "./client";
import {
  TEAM_SIM_RECOVERABLE_PATH,
  TEAM_SIM_RECOVER_PATH,
} from "./contract";
import { TeamSimError } from "./errors";
import { REAL_1V1, REAL_CATALOG } from "./__fixtures__";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
}));

type FetchCall = { url: string; init: RequestInit | undefined };
let calls: FetchCall[] = [];

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
      return {
        ok: spec.status >= 200 && spec.status < 300,
        status: spec.status,
        headers: new Headers(spec.headers ?? {}),
        json: async () => {
          if (spec.body === undefined) throw new Error("no body");
          return spec.body;
        },
      } as unknown as Response;
    })
  );
}

const RECOVERY_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    recovery_id: RECOVERY_ID,
    status: "completed",
    replay_available: true,
    created_at: "2026-08-07T09:15:00.000000+00:00",
    expires_at: "2026-08-08T09:15:00.000000+00:00",
    completed_at: "2026-08-07T09:15:02.000000+00:00",
    credit_cost: 1,
    credits_charged: 1,
    contract_version: "sim2.team-simulate.v1",
    team_shape: "1v1",
    champions: { a: ["Vayne"], b: ["Garen"] },
    winner: "A",
    termination_reason: "team_elimination",
    event_count: 42,
    response_bytes: 36917,
    ...overrides,
  };
}

function listing(entries: unknown[]) {
  return {
    contract_version: "sim2.team-simulate.v1",
    endpoint: "POST /api/combat-lab/team-simulate/v1",
    retention_seconds: 86_400,
    limit: 50,
    count: entries.length,
    recoverable_requests: entries,
  };
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ─────────────────────────── discovery ─────────────────────────── */

describe("fetchRecoverableRequests", () => {
  it("reads the discovery endpoint with the account's bearer token", async () => {
    stubFetch(() => ({ status: 200, body: listing([entry()]) }));

    const result = await fetchRecoverableRequests();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(TEAM_SIM_RECOVERABLE_PATH);
    expect(calls[0].init?.method).toBe("GET");
    // Account-scoped on the server side, which requires the token to be sent.
    expect(
      (calls[0].init?.headers as Record<string, string>).Authorization
    ).toBe("Bearer test-token");
    expect(result.recoverable_requests).toHaveLength(1);
    expect(result.retention_seconds).toBe(86_400);
  });

  it("never sends an idempotency key on a read", async () => {
    stubFetch(() => ({ status: 200, body: listing([]) }));
    await fetchRecoverableRequests();
    const headers = Object.keys(
      (calls[0].init?.headers ?? {}) as Record<string, string>
    ).map((h) => h.toLowerCase());
    expect(headers).not.toContain("idempotency-key");
  });

  it("drops entries that could never be acted on", async () => {
    // Three grounds, and only three: no handle (unrecoverable), a status the
    // client has no behaviour for (no correct control to offer), and an
    // unformattable timestamp (unplaceable in a newest-first list). Everything
    // else degrades field-by-field rather than costing the operator a row.
    stubFetch(() => ({
      status: 200,
      body: listing([
        entry(),
        entry({ recovery_id: "" }),
        entry({ recovery_id: "b".repeat(32), status: "archived" }),
        entry({ recovery_id: "d".repeat(32), created_at: 12345 }),
        null,
        "not an entry",
      ]),
    }));

    const result = await fetchRecoverableRequests();
    expect(result.recoverable_requests).toHaveLength(1);
    // `count` is recomputed from what survived, so it can never describe more
    // rows than the caller was given.
    expect(result.count).toBe(1);
  });

  it("normalizes every rendered field, not just the actionable ones", async () => {
    // The panel calls `.join()` on champions and `new Date()` on the stamp.
    // There is no error boundary on that route, so an unchecked field that
    // throws mid-render blanks the page and hides every recoverable paid
    // result. Anything unusable becomes null; the entry stays recoverable.
    stubFetch(() => ({
      status: 200,
      body: listing([
        entry({
          champions: { a: "Vayne", b: 7 },
          team_shape: 42,
          credit_cost: "one",
          credits_charged: undefined,
          winner: { name: "A" },
          event_count: "many",
          response_bytes: null,
        }),
      ]),
    }));

    const [row] = (await fetchRecoverableRequests()).recoverable_requests;
    expect(row.recovery_id).toBe(RECOVERY_ID);
    // Nothing usable on either side is "unknown", not "two empty teams".
    expect(row.champions).toBeNull();
    expect(row.team_shape).toBeNull();
    expect(row.winner).toBeNull();
    expect(row.event_count).toBeNull();
    expect(row.response_bytes).toBeNull();
    // Numbers the server did not state become 0, never `undefined` — which
    // would render as "undefined credits charged".
    expect(row.credit_cost).toBe(0);
    expect(row.credits_charged).toBe(0);
  });

  it("keeps the readable half of a partly-bad champion block", async () => {
    stubFetch(() => ({
      status: 200,
      body: listing([entry({ champions: { a: ["Vayne"], b: 7 } })]),
    }));
    const [row] = (await fetchRecoverableRequests()).recoverable_requests;
    // Team A is still what identifies this run to the person who built it.
    expect(row.champions).toEqual({ a: ["Vayne"], b: [] });
  });

  it("drops an entry whose timestamp cannot be formatted", async () => {
    // "Invalid Date" on a recovery row looks like a defect in the recovery
    // surface rather than in the value, and the row cannot be placed in a
    // newest-first list anyway.
    stubFetch(() => ({
      status: 200,
      body: listing([entry({ created_at: "not a date" }), entry({
        recovery_id: "b".repeat(32),
      })]),
    }));
    const result = await fetchRecoverableRequests();
    expect(result.recoverable_requests.map((r) => r.recovery_id)).toEqual([
      "b".repeat(32),
    ]);
  });

  it("derives replay_available from the status rather than trusting it", async () => {
    // Two statements of one fact. A backend disagreeing with itself must not
    // put a "Recover" button on a record with no stored result.
    stubFetch(() => ({
      status: 200,
      body: listing([
        entry({ status: "pending", replay_available: true, recovery_id: "c".repeat(32) }),
        entry({ status: "completed", replay_available: false }),
      ]),
    }));
    const [pending, completed] = (await fetchRecoverableRequests())
      .recoverable_requests;
    expect(pending.replay_available).toBe(false);
    expect(completed.replay_available).toBe(true);
  });

  it("rejects a body that is not a list at all", () => {
    expect(() => assertRecoverableListing({ nope: true })).toThrow(TeamSimError);
    expect(() => assertRecoverableListing(null)).toThrow(TeamSimError);
    expect(() => assertRecoverableListing([])).toThrow(TeamSimError);
  });

  it("tolerates missing envelope metadata around a good list", async () => {
    // The entries are what matter; a backend that omits the envelope fields
    // must not cost the operator the list of things they may have paid for.
    stubFetch(() => ({
      status: 200,
      body: { recoverable_requests: [entry()] },
    }));
    const result = await fetchRecoverableRequests();
    expect(result.recoverable_requests).toHaveLength(1);
    expect(result.retention_seconds).toBe(0);
  });

  it("maps auth failures to the shared kinds", async () => {
    for (const [status, code, kind] of [
      [401, "AUTH_REQUIRED", "auth_required"],
      [403, "ACCOUNT_REQUIRED", "account_required"],
      [429, "rate_limited", "rate_limited"],
    ] as const) {
      stubFetch(() => ({ status, body: { detail: { code } } }));
      await expect(fetchRecoverableRequests()).rejects.toMatchObject({
        kind,
        status,
      });
    }
  });

  it("reports a transport failure as an error, never as an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    // An empty list would read as "you have nothing outstanding", which is a
    // claim about money this call is in no position to make.
    await expect(fetchRecoverableRequests()).rejects.toMatchObject({
      kind: "network",
      certainty: "unknown",
    });
  });
});

/* ─────────────────────────── recovery ──────────────────────────── */

describe("recoverSimulation", () => {
  it("posts to the handle and returns the stored result as a replay", async () => {
    stubFetch(() => ({
      status: 200,
      body: REAL_1V1,
      headers: { "idempotency-replayed": "true" },
    }));

    const outcome = await recoverSimulation(RECOVERY_ID);

    expect(calls[0].url).toContain(`${TEAM_SIM_RECOVER_PATH}/${RECOVERY_ID}`);
    // The handle is the whole address — nothing about the request is in a
    // query string, where it would reach logs and history.
    expect(calls[0].url).not.toContain("?");
    expect(calls[0].init?.method).toBe("POST");
    expect(outcome.replayed).toBe(true);
    expect(outcome.response.termination).toEqual(REAL_1V1.termination);
  });

  it("sends no body and no idempotency key", async () => {
    stubFetch(() => ({ status: 200, body: REAL_1V1 }));
    await recoverSimulation(RECOVERY_ID);
    // A body would make this look like a request that could be executed; the
    // handle in the path is the entire input.
    expect(calls[0].init?.body).toBeUndefined();
    const headers = Object.keys(
      (calls[0].init?.headers ?? {}) as Record<string, string>
    ).map((h) => h.toLowerCase());
    expect(headers).not.toContain("idempotency-key");
    expect(headers).not.toContain("content-type");
  });

  it("percent-encodes the handle rather than trusting it to be path-safe", async () => {
    stubFetch(() => ({ status: 200, body: REAL_1V1 }));
    await recoverSimulation("../../etc/passwd");
    expect(calls[0].url).not.toContain("../..");
    expect(calls[0].url).toContain("%2F");
  });

  it("maps a 404 to one indistinguishable not-found kind", async () => {
    stubFetch(() => ({
      status: 404,
      body: { detail: { code: "recovery_not_found", message: "gone" } },
    }));
    await expect(recoverSimulation(RECOVERY_ID)).rejects.toMatchObject({
      kind: "recovery_not_found",
      // A rejection, not an unknown: nothing ran, so nothing is uncertain.
      certainty: "rejected",
      status: 404,
    });
  });

  it("distinguishes a running request from an abandoned one", async () => {
    stubFetch(() => ({
      status: 409,
      body: { detail: { code: "idempotency_in_progress" } },
    }));
    await expect(recoverSimulation(RECOVERY_ID)).rejects.toMatchObject({
      kind: "idempotency_in_progress",
    });

    stubFetch(() => ({
      status: 409,
      body: { detail: { code: "recovery_stale_pending" } },
    }));
    const stale = await recoverSimulation(RECOVERY_ID).catch((e) => e);
    expect(stale).toBeInstanceOf(TeamSimError);
    expect(stale.kind).toBe("recovery_stale");
    // The message must state the money fact, which the backend guarantees by
    // constraint: a record that never completed carries no charge.
    expect(stale.message).toMatch(/not charged/i);
  });

  it("treats an unreadable 200 as uncertain, exactly like a simulation", async () => {
    stubFetch(() => ({ status: 200, body: { nonsense: true } }));
    await expect(recoverSimulation(RECOVERY_ID)).rejects.toMatchObject({
      kind: "malformed_response",
      certainty: "unknown",
    });
  });
});

/* ───────────────────── contract drift against the catalog ───────────── */

describe("published recovery contract", () => {
  it("agrees with the paths this client hard-codes, when published", () => {
    const recovery = (REAL_CATALOG as { recovery?: Record<string, unknown> })
      .recovery;
    // Optional by design: the captured fixture predates Phase 4E, and a
    // backend without the block must not break this client. When it IS
    // present, the two must not have drifted.
    if (!recovery) {
      expect(TEAM_SIM_RECOVERABLE_PATH).toBe(
        "/api/combat-lab/team-simulate/recoverable/v1"
      );
      return;
    }
    expect(recovery.discovery_path).toBe(TEAM_SIM_RECOVERABLE_PATH);
    expect(String(recovery.recovery_path)).toContain(TEAM_SIM_RECOVER_PATH);
    expect(recovery.recovery_charges).toBe(0);
    expect(recovery.recovery_invokes_scheduler).toBe(false);
  });
});
