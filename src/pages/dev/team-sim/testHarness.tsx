/**
 * Shared harness for the team-sim page tests.
 *
 * One global `fetch` stub serves all three endpoints the page touches
 * (catalog, credits, simulate) with the REAL captured payloads, and records
 * every call — which is what makes "one click, one POST" an assertion about
 * the wire rather than about component internals.
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

export class TeamSimHarness {
  calls: StubbedCall[] = [];
  private simulateQueue: FetchOutcome[];
  private options: HarnessOptions;

  constructor(options: HarnessOptions = {}) {
    this.options = options;
    this.simulateQueue = [...(options.simulate ?? [])];
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
