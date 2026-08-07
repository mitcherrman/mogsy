/**
 * Shared harness for the team-sim page tests.
 *
 * One global `fetch` stub serves every endpoint the page touches (catalog,
 * credits, simulate, and the Phase 4E recovery pair) with the REAL captured
 * payloads, and records every call — which is what makes "one click, one POST"
 * an assertion about the wire rather than about component internals.
 *
 * The test QueryClient deliberately sets `mutations: { retry: 3 }`. If the
 * simulation hook ever stopped setting `retry: false` explicitly, that default
 * would be inherited and the POST-count assertions would fail.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import { __resetCatalogCache } from "@/lib/combat-lab/team-sim/client";
import {
  __setAccountIdentitySource,
  fixedIdentitySource,
  type AccountIdentitySource,
} from "@/lib/combat-lab/team-sim/identity";
import {
  REAL_CATALOG,
  REAL_CATALOG_ETAG,
} from "@/lib/combat-lab/team-sim/__fixtures__";
import TeamSimPage from "./TeamSimPage";

/**
 * Default account for every page test (Phase 4D).
 *
 * The route has no `AuthProvider` here, so identity comes from the injected
 * source rather than Supabase — which also keeps these tests off the network
 * for auth entirely. A CONCRETE default matters: Phase 4D refuses to send a
 * paid request until the account is known, so a harness that left identity
 * unresolved would silently disarm every "one click, one POST" assertion in
 * the Phase 4B and 4C suites.
 */
export const TEST_ACCOUNT_A = "acct-a-00000000-0000-4000-8000-000000000001";
export const TEST_ACCOUNT_B = "acct-b-00000000-0000-4000-8000-000000000002";

export type StubbedCall = {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
};

export type FetchOutcome = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Reject the request entirely (transport failure). */
  throws?: Error;
  /** Hold the response open until this resolves (observable pending state). */
  gate?: Promise<void>;
};

export type HarnessOptions = {
  catalog?: FetchOutcome;
  credits?: FetchOutcome | (() => FetchOutcome);
  /** Consumed in order; the last entry repeats. */
  simulate?: FetchOutcome[];
  /**
   * Phase 4E discovery (GET .../recoverable/v1). A function is re-evaluated
   * per call, so a test can watch the list change after a recovery.
   *
   * Defaults to an EMPTY list rather than 404: every page render now makes
   * this call, and leaving it unstubbed would turn "no recoverable requests"
   * into a rendered error in every pre-existing suite.
   */
  recoverable?: FetchOutcome | (() => FetchOutcome);
  /** Phase 4E recovery (POST .../recover/v1/{id}); consumed in order. */
  recover?: FetchOutcome[];
  /** Account the page is signed in as. `null` = signed out. */
  accountId?: string | null;
  /**
   * A source the test drives itself, for account switches DURING a page's
   * life. It must be installed before the render, because the page subscribes
   * to whichever source was active when it mounted.
   */
  identitySource?: AccountIdentitySource;
  /**
   * Runs SYNCHRONOUSLY inside the fetch stub, at call time.
   *
   * This is what makes "persisted before the POST" an assertion about
   * ordering rather than about timing: the callback observes the world at the
   * instant the request is handed to the network, before any await.
   */
  onCall?: (call: StubbedCall) => void;
  /** Skip the sessionStorage reset, for tests that pre-seed a record. */
  keepStorage?: boolean;
};

export const DEFAULT_CREDITS = {
  ok: true,
  credits: {
    is_pro: false,
    unlimited: false,
    credits_used: 13,
    credits_limit: 30,
    credits_remaining: 17,
    blocked: false,
    reset_at: "2026-08-08T00:00:00+00:00",
    upsell_message: null,
    tokens_required: true,
  },
};

/** An empty Phase 4E discovery response, in the endpoint's own shape. */
export const EMPTY_RECOVERABLE = {
  contract_version: "sim2.team-simulate.v1",
  endpoint: "POST /api/combat-lab/team-simulate/v1",
  retention_seconds: 86400,
  limit: 50,
  count: 0,
  recoverable_requests: [],
};

/** One completed discovery entry, with the fields the panel actually reads. */
export function recoverableEntry(
  overrides: Partial<Record<string, unknown>> = {}
) {
  return {
    recovery_id: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
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

export function recoverableListing(entries: unknown[]) {
  return { ...EMPTY_RECOVERABLE, count: entries.length, recoverable_requests: entries };
}

export class TeamSimHarness {
  calls: StubbedCall[] = [];
  private simulateQueue: FetchOutcome[];
  private recoverQueue: FetchOutcome[];
  private options: HarnessOptions;

  constructor(options: HarnessOptions = {}) {
    this.options = options;
    this.simulateQueue = [...(options.simulate ?? [])];
    this.recoverQueue = [...(options.recover ?? [])];
  }

  get postCalls(): StubbedCall[] {
    return this.calls.filter((c) => c.url.includes("/team-simulate/v1"));
  }

  get catalogCalls(): StubbedCall[] {
    return this.calls.filter((c) => c.url.includes("/team-simulate/catalog/v1"));
  }

  get creditCalls(): StubbedCall[] {
    return this.calls.filter((c) => c.url.includes("/api/combat-lab/credits"));
  }

  /** Phase 4E discovery reads. */
  get recoverableCalls(): StubbedCall[] {
    return this.calls.filter((c) =>
      c.url.includes("/team-simulate/recoverable/v1")
    );
  }

  /** Phase 4E recovery collects. */
  get recoverCalls(): StubbedCall[] {
    return this.calls.filter((c) => c.url.includes("/team-simulate/recover/v1/"));
  }

  /** Body of the most recent simulation POST, parsed. */
  lastRequestBody<T = Record<string, unknown>>(): T {
    const last = this.postCalls.at(-1);
    if (!last) throw new Error("no simulation POST was made");
    return JSON.parse(String(last.body)) as T;
  }

  install() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const href = String(url);
        const call: StubbedCall = {
          url: href,
          method: init?.method ?? "GET",
          body: init?.body ?? null,
          headers: (init?.headers ?? {}) as Record<string, string>,
        };
        this.calls.push(call);
        this.options.onCall?.(call);

        const outcome = this.resolve(href);
        if (outcome.gate) await outcome.gate;
        if (outcome.throws) throw outcome.throws;

        const headers = new Headers(outcome.headers ?? {});
        return {
          ok: outcome.status >= 200 && outcome.status < 300,
          status: outcome.status,
          headers,
          json: async () => {
            if (outcome.body === undefined) throw new Error("no body");
            return outcome.body;
          },
          text: async () => JSON.stringify(outcome.body ?? null),
        } as unknown as Response;
      })
    );
  }

  private resolve(href: string): FetchOutcome {
    // Phase 4E routes are matched FIRST. `/team-simulate/recoverable/v1` does
    // not contain `/team-simulate/v1` as a substring today, but the simulate
    // branch below is a substring match on a billable endpoint and must never
    // be the thing that decides a recovery call.
    if (href.includes("/team-simulate/recoverable/v1")) {
      const spec = this.options.recoverable;
      if (typeof spec === "function") return spec();
      return spec ?? { status: 200, body: EMPTY_RECOVERABLE };
    }
    if (href.includes("/team-simulate/recover/v1/")) {
      if (this.recoverQueue.length === 0) {
        throw new Error(`unexpected recovery POST: ${href}`);
      }
      return this.recoverQueue.length === 1
        ? this.recoverQueue[0]
        : (this.recoverQueue.shift() as FetchOutcome);
    }
    if (href.includes("/team-simulate/catalog/v1")) {
      return (
        this.options.catalog ?? {
          status: 200,
          body: REAL_CATALOG,
          headers: { etag: REAL_CATALOG_ETAG },
        }
      );
    }
    if (href.includes("/team-simulate/v1")) {
      if (this.simulateQueue.length === 0) {
        throw new Error(`unexpected simulation POST: ${href}`);
      }
      return this.simulateQueue.length === 1
        ? this.simulateQueue[0]
        : (this.simulateQueue.shift() as FetchOutcome);
    }
    if (href.includes("/api/combat-lab/credits")) {
      const spec = this.options.credits;
      if (typeof spec === "function") return spec();
      return spec ?? { status: 200, body: DEFAULT_CREDITS };
    }
    return { status: 404, body: { detail: "unstubbed" } };
  }
}

/** The page under its providers — reused so a "reload" is a real remount. */
export function teamSimTree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/dev/combat-lab/team-sim"]}>
        <TeamSimPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export function makeTeamSimQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      // Intentionally hostile default — the hook must override it.
      mutations: { retry: 3 },
    },
  });
}

export function renderTeamSimPage(options: HarnessOptions = {}): {
  harness: TeamSimHarness;
  view: RenderResult;
  client: QueryClient;
} {
  __resetCatalogCache();
  // sessionStorage is a real, shared jsdom object across tests in a file. A
  // leaked recovery record would block the next test's Run click with a
  // collision — a confusing failure a long way from its cause.
  if (!options.keepStorage) {
    try {
      sessionStorage.clear();
    } catch {
      /* a test that stubbed storage into failing owns the cleanup */
    }
  }
  __setAccountIdentitySource(
    options.identitySource ??
      fixedIdentitySource(
        options.accountId === undefined ? TEST_ACCOUNT_A : options.accountId
      )
  );

  const harness = new TeamSimHarness(options);
  harness.install();

  const client = makeTeamSimQueryClient();
  const view = render(teamSimTree(client));
  return { harness, view, client };
}
