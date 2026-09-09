/**
 * Admin · Pro Play Data Coverage — rendering, honesty and failure.
 *
 * The load-bearing assertion is the league one: the page must read the
 * dedicated /by-league endpoint with a high limit, NOT summary.by_league,
 * which the server caps at 60 rows sorted by missing count. The fixture makes
 * the two disagree on purpose — a league that is fully covered exists only in
 * the by-league answer — so a page that regressed to summary's list fails
 * here rather than silently hiding every healthy league.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminProCoverage from "./AdminProCoverage";

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: async () => ({ "X-Admin-Key": "k" }),
}));

const SUMMARY = {
  denominators: {
    source_games: 129497,
    canonical_not_from_source: 0,
    canonical_games: 118429,
    oe_eligible_games: 117800,
    oe_source_games: 100000,
    enriched_games: 94301,
    player_stat_rows: 896344,
    team_stat_rows: 182108,
    pct_of_source: 72.82,
    pct_of_canonical: 79.63,
    pct_of_oe_eligible: 80.05,
  },
  buckets: [
    { bucket: "matched", label: "Matched / enriched", games: 94301, pct_of_canonical: 79.63, pct_of_oe_eligible: 80.05 },
    { bucket: "no_oe_upstream_record", label: "No OE game published in slot", games: 18421, pct_of_canonical: 15.55, pct_of_oe_eligible: 15.64 },
    { bucket: "before_oe_coverage", label: "Before OE first year", games: 94, pct_of_canonical: 0.08, pct_of_oe_eligible: null },
  ],
  by_year: [
    { year: 2013, canonical_games: 5000, oe_eligible: 0, matched: 0, missing: 5000, coverage_pct: null, coverage_pct_of_canonical: 0 },
    { year: 2025, canonical_games: 12000, oe_eligible: 12000, matched: 11500, missing: 500, coverage_pct: 95.83, coverage_pct_of_canonical: 95.83 },
  ],
  // The truncated worst-offenders list. LPL only — LCK is absent from it.
  by_league: [
    { league: "LPL", league_label: "LPL", league_group: "tier1", canonical_games: 8100, oe_eligible: 8000, matched: 7039, missing: 1061, coverage_pct: 86.9 },
  ],
  top_missing: [
    { league: "LPL", league_group: "tier1", year: 2016, bucket: "no_oe_upstream_record", label: "No OE game published in slot", games: 875 },
  ],
  missing_reasons: [
    { reason: "unresolved_team", oe_games: 2028, attributed: 0 },
    { reason: "ambiguous", oe_games: 12, attributed: 3 },
  ],
  disagreements: { rows_compared: 182108, disagreeing_rows: 252, disagreeing_games: 147 },
  oe_first_year: 2014,
};

/** The full universe: LPL plus a fully covered league summary never returns. */
const LEAGUES = {
  leagues: [
    SUMMARY.by_league[0],
    { league: "LCK", league_label: "LCK", league_group: "tier1", canonical_games: 6000, oe_eligible: 6000, matched: 6000, missing: 0, coverage_pct: 100 },
  ],
  top_missing: SUMMARY.top_missing,
};

let fetchMock: ReturnType<typeof vi.fn>;

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) =>
    url.includes("/by-league") ? ok(LEAGUES) : ok(SUMMARY),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminProCoverage />
    </MemoryRouter>,
  );
}

describe("AdminProCoverage", () => {
  it("shows a loading state before the reads settle", () => {
    renderPage();
    expect(screen.getByTestId("pro-coverage-loading")).toBeTruthy();
  });

  it("renders the top totals from the summary endpoint", async () => {
    renderPage();
    const totals = await screen.findByTestId("pro-coverage-totals");
    expect(totals).toBeTruthy();
    expect(screen.getByTestId("metric-canonical-games").textContent).toContain("118,429");
    expect(screen.getByTestId("metric-enriched-games").textContent).toContain("94,301");
    // 118,429 − 94,301
    expect(screen.getByTestId("metric-missing-games").textContent).toContain("24,128");
    expect(screen.getByTestId("metric-coverage-canonical").textContent).toContain("79.63%");
    expect(screen.getByTestId("metric-coverage-eligible").textContent).toContain("80.05%");
    expect(screen.getByTestId("metric-player-rows").textContent).toContain("896,344");
    expect(screen.getByTestId("metric-team-rows").textContent).toContain("182,108");
  });

  it("renders the year table", async () => {
    renderPage();
    expect(await screen.findByTestId("year-row-2025")).toBeTruthy();
    expect(screen.getByTestId("year-row-2025").textContent).toContain("95.83%");
    // A pre-OE year reports no coverage percentage rather than 0%.
    expect(screen.getByTestId("year-row-2013").textContent).toContain("—");
  });

  it("builds the league table from the full by-league endpoint, not summary's 60-row list", async () => {
    renderPage();
    await screen.findByTestId("pro-coverage-by-league");
    const requested = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(requested.some((u) => u.includes("/api/admin/pro-coverage/by-league?limit=500"))).toBe(true);
    // LCK exists ONLY in the by-league answer.
    expect(screen.getByTestId("league-row-LCK")).toBeTruthy();
    expect(screen.getByTestId("league-row-LCK").textContent).toContain("100.00%");
    expect(screen.getByTestId("league-row-LPL").textContent).toContain("86.90%");
  });

  it("renders the missing-reason buckets with their real labels", async () => {
    renderPage();
    expect(await screen.findByTestId("bucket-row-no_oe_upstream_record")).toBeTruthy();
    expect(screen.getByTestId("bucket-row-no_oe_upstream_record").textContent).toContain(
      "No OE game published in slot",
    );
    expect(screen.getByTestId("bucket-row-before_oe_coverage").textContent).toContain(
      "Before OE first year",
    );
    expect(screen.getByTestId("reason-row-unresolved_team").textContent).toContain("2,028");
  });

  it("states the source-disagreement count and that Leaguepedia stays canonical", async () => {
    renderPage();
    const note = await screen.findByTestId("pro-coverage-disagreements");
    expect(note.textContent).toContain("147");
    expect(note.textContent).toContain("Leaguepedia remains canonical");
  });

  it("renders an error instead of zeros when the summary read fails", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/by-league")
        ? ok(LEAGUES)
        : ({ ok: false, status: 503, json: async () => ({}) } as unknown as Response),
    );
    renderPage();
    const err = await screen.findByTestId("pro-coverage-summary-error");
    expect(err.textContent).toContain("no promoted pro-play corpus");
    expect(screen.queryByTestId("pro-coverage-totals")).toBeNull();
  });

  it("survives a partial failure: totals render even when the league read fails", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/by-league")
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : ok(SUMMARY),
    );
    renderPage();
    expect(await screen.findByTestId("pro-coverage-league-error")).toBeTruthy();
    expect(screen.getByTestId("pro-coverage-totals")).toBeTruthy();
  });

  it("reports a refusal as a refusal, with no stack trace", async () => {
    fetchMock.mockImplementation(
      async () => ({ ok: false, status: 403, json: async () => ({}) }) as unknown as Response,
    );
    renderPage();
    const err = await screen.findByTestId("pro-coverage-summary-error");
    expect(err.textContent).toContain("refused");
    expect(err.textContent).not.toContain("at ");
  });

  it("filters the league table without refetching", async () => {
    const { container } = renderPage();
    await screen.findByTestId("league-row-LCK");
    const before = fetchMock.mock.calls.length;
    const input = screen.getByTestId("pro-coverage-league-filter") as HTMLInputElement;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "LCK" } });
    await waitFor(() => expect(screen.queryByTestId("league-row-LPL")).toBeNull());
    expect(screen.getByTestId("league-row-LCK")).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(container).toBeTruthy();
  });
});
