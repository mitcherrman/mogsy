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
  REAL_CATALOG,
  REAL_CATALOG_ETAG,
} from "@/lib/combat-lab/team-sim/__fixtures__";
import TeamSimPage from "./TeamSimPage";

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
        this.calls.push({
          url: href,
          method: init?.method ?? "GET",
          body: init?.body ?? null,
          headers: (init?.headers ?? {}) as Record<string, string>,
        });

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

export function renderTeamSimPage(options: HarnessOptions = {}): {
  harness: TeamSimHarness;
  view: RenderResult;
} {
  __resetCatalogCache();
  const harness = new TeamSimHarness(options);
  harness.install();

  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      // Intentionally hostile default — the hook must override it.
      mutations: { retry: 3 },
    },
  });

  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/dev/combat-lab/team-sim"]}>
        <TeamSimPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { harness, view };
}
