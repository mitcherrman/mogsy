import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProLinkCoverageSection from "./ProLinkCoverageSection";
import type { ProLinkCoverageResponse } from "@/lib/league-docs/api";

function linkCoveragePayload(
  overrides: Partial<ProLinkCoverageResponse> = {},
): ProLinkCoverageResponse {
  return {
    ok: true,
    schema_version: 1,
    projection_status: "healthy",
    queried_at: "2026-07-17T00:00:00Z",
    active_links: 1150,
    deactivated_links: 0,
    eligible_source_games: 1203,
    linked_games: 1150,
    known_unlinked_games: 53,
    missing_or_inconsistent_games: 0,
    outside_validated_scope_games: 6266,
    coverage_rate: 0.955943,
    league_breakdown: [
      {
        league: "LCK", league_name: "LoL Champions Korea",
        source_games: 349, linked_games: 349, known_unlinked_games: 0, coverage_rate: 1.0,
      },
      {
        league: "LPL", league_name: "Tencent LoL Pro League",
        source_games: 451, linked_games: 451, known_unlinked_games: 0, coverage_rate: 1.0,
      },
      {
        league: "LCS", league_name: "League of Legends Championship Series",
        source_games: 157, linked_games: 106, known_unlinked_games: 51, coverage_rate: 0.675159,
      },
    ],
    tournament_breakdown: [
      {
        league: "LCS", tournament: "LCS 2026 Lock-In",
        source_games: 59, linked_games: 37, unlinked_games: 22,
      },
      {
        league: "LEC", tournament: "LEC 2026 Versus",
        source_games: 66, linked_games: 65, unlinked_games: 1,
      },
    ],
    known_residual_acknowledged: true,
    problems: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body } as Response;
}

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  const mock = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function stubFetchWithPayload(body: unknown) {
  return stubFetch(() => jsonResponse(body));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/lol/docs/pro"]}>
        <ProLinkCoverageSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

describe("ProLinkCoverageSection", () => {
  it("shows an aria-busy skeleton while loading", () => {
    stubFetch(() => new Promise<Response>(() => {}));
    renderSection();
    expect(screen.getByRole("heading", { name: "Source verification" })).toBeInTheDocument();
    expect(screen.getByLabelText("Loading source verification")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("renders values derived from the response, not hard-coded counts", async () => {
    stubFetchWithPayload(
      linkCoveragePayload({
        linked_games: 2000,
        eligible_source_games: 2500,
        coverage_rate: 0.8,
        known_unlinked_games: 500,
      }),
    );
    renderSection();
    expect(
      await screen.findByText(/2,000 of 2,500 eligible games cross-verified/),
    ).toBeInTheDocument();
    expect(screen.getByText("80.0%")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Games verified with one source \(500\)/ }),
    ).toBeInTheDocument();
  });

  it("derives the percentage from counts when the rate is null", async () => {
    stubFetchWithPayload(
      linkCoveragePayload({
        coverage_rate: null,
        linked_games: 300,
        eligible_source_games: 400,
      }),
    );
    renderSection();
    expect(await screen.findByText("75.0%")).toBeInTheDocument();
  });

  it("sorts the league table by linked games descending with league tie-breaker", async () => {
    stubFetchWithPayload(linkCoveragePayload());
    renderSection();
    const table = await screen.findByRole("table", {
      name: "Cross-verified games by league",
    });
    const codes = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(codes[0]).toContain("LPL");
    expect(codes[1]).toContain("LCK");
    expect(codes[2]).toContain("LCS");
  });

  it("has accessible table semantics (caption + scoped column headers)", async () => {
    stubFetchWithPayload(linkCoveragePayload());
    renderSection();
    const table = await screen.findByRole("table", {
      name: "Cross-verified games by league",
    });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "League",
      "Cross-verified",
      "Eligible",
      "Rate",
    ]);
    headers.forEach((h) => expect(h).toHaveAttribute("scope", "col"));
  });

  it("opens the residual disclosure and lists tournament rows dynamically", async () => {
    stubFetchWithPayload(linkCoveragePayload());
    renderSection();
    const toggle = await screen.findByRole("button", {
      name: /Games verified with one source \(53\)/,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("LCS 2026 Lock-In")).toBeInTheDocument();
    expect(screen.getByText("22 games")).toBeInTheDocument();
    expect(screen.getByText("LEC 2026 Versus")).toBeInTheDocument();
    expect(screen.getByText("1 game")).toBeInTheDocument();
    // Calm framing: residuals are never labelled as failures.
    expect(screen.getByText(/not a failed import or a broken\s+record/)).toBeInTheDocument();
  });

  it("omits the disclosure and shows success copy at zero residual", async () => {
    stubFetchWithPayload(
      linkCoveragePayload({
        known_unlinked_games: 0,
        tournament_breakdown: [],
        coverage_rate: 1.0,
        linked_games: 1203,
      }),
    );
    renderSection();
    expect(
      await screen.findByText("All eligible games are cross-verified."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Games verified with one source/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps data visible and shows problems with caution styling when degraded", async () => {
    stubFetchWithPayload(
      linkCoveragePayload({
        projection_status: "degraded",
        problems: ["link table integrity check reported drift"],
      }),
    );
    renderSection();
    expect(await screen.findByText("Verification needs review")).toBeInTheDocument();
    expect(
      screen.getByText("link table integrity check reported drift"),
    ).toBeInTheDocument();
    // Data remains visible alongside the caution status.
    expect(
      screen.getByText(/1,150 of 1,203 eligible games cross-verified/),
    ).toBeInTheDocument();
  });

  it("treats an unknown projection status like degraded without crashing", async () => {
    stubFetchWithPayload(
      linkCoveragePayload({ projection_status: "recalibrating" }),
    );
    renderSection();
    expect(await screen.findByText("Verification needs review")).toBeInTheDocument();
  });

  it("renders a neutral card for an unavailable projection", async () => {
    stubFetchWithPayload(
      linkCoveragePayload({
        projection_status: "unavailable",
        schema_version: null,
        linked_games: 0,
        eligible_source_games: 0,
        known_unlinked_games: 0,
        coverage_rate: null,
        league_breakdown: [],
        tournament_breakdown: [],
        known_residual_acknowledged: false,
        problems: ["canonical links have not been promoted in this database"],
      }),
    );
    renderSection();
    expect(
      await screen.findByText(/isn't enabled for this environment yet/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the aggregate summary without tables when breakdown arrays are empty", async () => {
    stubFetchWithPayload(
      linkCoveragePayload({ league_breakdown: [], tournament_breakdown: [] }),
    );
    renderSection();
    expect(
      await screen.findByText(/1,150 of 1,203 eligible games cross-verified/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a quiet unavailable state with a retry on request failure, then recovers", async () => {
    let fail = true;
    stubFetch(() => {
      if (fail) return Promise.reject(new TypeError("Failed to fetch"));
      return jsonResponse(linkCoveragePayload());
    });
    renderSection();
    expect(
      await screen.findByText(/temporarily unavailable/),
    ).toBeInTheDocument();
    const retry = screen.getByRole("button", {
      name: "Retry loading source verification",
    });
    fail = false;
    fireEvent.click(retry);
    expect(
      await screen.findByText(/1,150 of 1,203 eligible games cross-verified/),
    ).toBeInTheDocument();
  });

  it("treats an unexpected 503 as temporary unavailability without strict terminology", async () => {
    stubFetch(() =>
      ({ ok: false, status: 503, statusText: "Service Unavailable", json: async () => ({}) }) as Response,
    );
    renderSection();
    expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/strict/i)).not.toBeInTheDocument();
  });

  it("does not crash on a malformed essential response", async () => {
    stubFetchWithPayload({ ok: true, unexpected: "shape" });
    renderSection();
    expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument();
  });

  it("treats a schema version above 1 as unsupported with retry still available", async () => {
    stubFetchWithPayload(linkCoveragePayload({ schema_version: 2 }));
    renderSection();
    expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry loading source verification" }),
    ).toBeInTheDocument();
  });

  it("accepts a null schema version and unknown additive fields", async () => {
    stubFetchWithPayload({
      ...linkCoveragePayload({ schema_version: null }),
      future_additive_field: { anything: true },
    });
    renderSection();
    expect(
      await screen.findByText(/1,150 of 1,203 eligible games cross-verified/),
    ).toBeInTheDocument();
  });

  it("renders queried_at as a machine-readable last-checked time", async () => {
    stubFetchWithPayload(linkCoveragePayload({ queried_at: "2026-07-17T13:49:59Z" }));
    renderSection();
    const time = (await screen.findByText(/Last checked/)).querySelector("time");
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute("dateTime", "2026-07-17T13:49:59Z");
    expect(time?.textContent).toContain("UTC");
  });

  it("keeps stale data visible with a subtle warning when a refetch fails", async () => {
    let fail = false;
    stubFetch(() => {
      if (fail) return Promise.reject(new TypeError("Failed to fetch"));
      return jsonResponse(linkCoveragePayload());
    });
    const { client } = renderSection();
    await screen.findByText(/1,150 of 1,203 eligible games cross-verified/);
    fail = true;
    await client.refetchQueries({ queryKey: ["league-docs", "pro-link-coverage"] });
    expect(
      await screen.findByText(/Couldn't refresh source verification/),
    ).toBeInTheDocument();
    // The stale values remain, not the initial error state.
    expect(
      screen.getByText(/1,150 of 1,203 eligible games cross-verified/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/)).not.toBeInTheDocument();
  });

  it("calls only the normal endpoint, exactly once, and never strict mode", async () => {
    const mock = stubFetchWithPayload(linkCoveragePayload());
    renderSection();
    await screen.findByText(/1,150 of 1,203 eligible games cross-verified/);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    const urls = mock.mock.calls.map((call) => String(call[0]));
    expect(urls.every((u) => u.includes("/api/docs/pro/link-coverage"))).toBe(true);
    expect(urls.some((u) => u.includes("strict_links"))).toBe(false);
  });
});
