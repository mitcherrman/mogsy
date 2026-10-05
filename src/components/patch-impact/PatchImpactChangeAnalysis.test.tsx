import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { canonicalRow, championCard, report, statLine } from "@/lib/patch-impact/fixtures/builders";
import type { PatchImpactAnalysis } from "@/lib/patch-impact/types";
import type { PatchImpactLoader } from "@/hooks/usePatchImpactLoader";
import {
  LIST_PATH,
  STATS_PATH,
  callsTo,
  createBackend,
  installFetch,
  reportPath,
  totalCalls,
  type FakeBackend,
} from "@/lib/patch-impact-loader/test-support";
import { mkChange } from "@/lib/patch-reports/test-fixtures";
import PatchReports from "@/pages/lol/PatchReports";
import { toPresentationState } from "./presentation-state";

afterEach(() => {
  vi.unstubAllGlobals();
});

/* --------------------------- state adapter -------------------------------- */

const paramOnly = (reason: string): PatchImpactAnalysis =>
  ({ status: "parameter_only", projectionUnavailable: reason, facts: [] }) as unknown as PatchImpactAnalysis;
const projectedAnalysis = { status: "projected", facts: [] } as unknown as PatchImpactAnalysis;

function loader(over: Partial<PatchImpactLoader>): PatchImpactLoader {
  return {
    analysis: paramOnly("history_incomplete"),
    state: { status: "idle" },
    canRequest: true,
    requestProjection: vi.fn(),
    ...over,
  };
}

describe("toPresentationState (PH2-C state -> PH2-B props)", () => {
  it("idle: idle with the request callback", () => {
    const l = loader({});
    expect(toPresentationState(l)).toEqual({
      analysis: l.analysis,
      projectionStatus: "idle",
      onRequestProjection: l.requestProjection,
    });
  });

  it("loading: loading, no callback", () => {
    const s = toPresentationState(loader({ state: { status: "loading" }, canRequest: false }));
    expect(s.projectionStatus).toBe("loading");
    expect(s.onRequestProjection).toBeUndefined();
  });

  it("failed: error with retry", () => {
    const l = loader({
      state: {
        status: "failed",
        error: { code: "request_failed", resource: "champion-stats", version: null, message: "x" },
      },
    });
    const s = toPresentationState(l);
    expect(s.projectionStatus).toBe("error");
    expect(s.onRequestProjection).toBe(l.requestProjection);
  });

  it("ready with a projection: final, nothing to request", () => {
    const s = toPresentationState(
      loader({ analysis: projectedAnalysis, state: { status: "ready" }, canRequest: false }),
    );
    expect(s).toEqual({ analysis: projectedAnalysis, projectionStatus: "idle" });
  });

  it("ready but evidence still incomplete: settled error without retry", () => {
    const s = toPresentationState(loader({ state: { status: "ready" }, canRequest: false }));
    expect(s.projectionStatus).toBe("error");
    expect(s.onRequestProjection).toBeUndefined();
  });

  it("ready with a settled parameter-only verdict: no request offered", () => {
    const s = toPresentationState(
      loader({ analysis: paramOnly("family_continuity_unproven"), state: { status: "ready" }, canRequest: false }),
    );
    expect(s).toMatchObject({ projectionStatus: "idle" });
    expect(s.onRequestProjection).toBeUndefined();
  });

  it("not_required / unavailable: the analysis alone, no callback", () => {
    for (const state of [
      { status: "not_required", reason: "riot_complete" },
      { status: "unavailable", reason: "family_deferred" },
    ] as PatchImpactLoader["state"][]) {
      const s = toPresentationState(loader({ state, canRequest: false }));
      expect(s.projectionStatus).toBe("idle");
      expect(s.onRequestProjection).toBeUndefined();
    }
  });
});

/* ------------------------ real Patch Reports page ------------------------- */

const P = "26.9";

/** Smolder needs canonical + later reports; Vi is Riot-only (same card); Kog'Maw is attack speed. */
function scenario(): FakeBackend {
  const smolderAd = statLine("base_ad", "Base AD", "60", "58");
  const viBase = statLine("base_health", "Base Health", "650", "630");
  const viGrowth = statLine("health_growth", "Health Growth", "99", "103");
  const kogAs = statLine("base_attack_speed", "Base Attack Speed", "0.665", "0.625");
  const ability = mkChange({
    group_title: "Q - Caustic Spittle",
    ability_slot: "Q",
    property_name: "Damage",
    before_raw: "90",
    after_raw: "80",
  });
  const own = report(P, [
    championCard("Smolder", [smolderAd]),
    championCard("Vi", [viBase, viGrowth]),
    championCard("KogMaw", [kogAs, ability]),
  ]);
  return createBackend(
    [own, report("26.10", []), report("26.11", [])],
    [canonicalRow("Smolder", { ad: 58, ad_per_level: 2.3 })],
    ["26.11", "26.10", P, "26.8"],
  );
}

function renderPage(backend: FakeBackend) {
  installFetch(backend);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/lol/patch-reports?patch=${P}`]}>
        <PatchReports />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const changeLineOf = (property: string) =>
  screen
    .getAllByTestId("patch-report-change")
    .find((li) => within(li).queryAllByText(property).length > 0) as HTMLElement;

const impactIn = (property: string) => within(changeLineOf(property)).queryByTestId("patch-impact");

async function pageReady() {
  await waitFor(() => expect(screen.getAllByTestId("patch-impact").length).toBe(4));
}

describe("PatchImpactChangeAnalysis on the Patch Reports page", () => {
  it("renders Impact only on Base Stats rows, between Riot's values and Mogzy evidence, with zero evidence fetches", async () => {
    const backend = scenario();
    renderPage(backend);
    await pageReady();

    // Mount cost: the page's own list + selected report, nothing else.
    expect(callsTo(backend, LIST_PATH)).toBe(1);
    expect(callsTo(backend, reportPath(P))).toBe(1);
    expect(callsTo(backend, STATS_PATH)).toBe(0);
    expect(callsTo(backend, reportPath("26.10"))).toBe(0);
    expect(totalCalls(backend)).toBe(2);

    expect(impactIn("Damage")).toBeNull();
    expect(impactIn("Base AD")).toHaveAttribute("data-impact-reason", "history_incomplete");
    expect(impactIn("Base Health")).toHaveAttribute("data-impact-status", "projected");
    expect(impactIn("Base Health")).toHaveAttribute("data-impact-provenance", "riot_projection");
    expect(impactIn("Base Attack Speed")).toHaveAttribute("data-impact-status", "parameter_only");
    expect(within(changeLineOf("Base Attack Speed")).queryByTestId("patch-impact-explore")).toBeNull();

    const line = changeLineOf("Base AD");
    const values = within(line).getByTestId("patch-report-values");
    const impact = within(line).getByTestId("patch-impact");
    const evidence = within(line).getByTestId("patch-report-evidence");
    expect(values.compareDocumentPosition(impact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(impact.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opening Explore loads the evidence once, through the shared cache, and upgrades in place", async () => {
    const backend = scenario();
    renderPage(backend);
    await pageReady();

    const line = changeLineOf("Base AD");
    fireEvent.click(within(line).getByTestId("patch-impact-explore-toggle"));

    await waitFor(() =>
      expect(within(line).getByTestId("patch-impact")).toHaveAttribute("data-impact-status", "projected"),
    );
    expect(within(line).getByTestId("patch-impact")).toHaveAttribute(
      "data-impact-provenance",
      "mogzy_companion_projection",
    );
    // Explore stayed open across loading -> projected.
    const slider = within(line).getByTestId("patch-impact-level");

    expect(callsTo(backend, STATS_PATH)).toBe(1);
    expect(callsTo(backend, reportPath("26.10"))).toBe(1);
    expect(callsTo(backend, reportPath("26.11"))).toBe(1);
    expect(callsTo(backend, reportPath("26.8"))).toBe(0);
    // The page's list and selected report were cache hits.
    expect(callsTo(backend, LIST_PATH)).toBe(1);
    expect(callsTo(backend, reportPath(P))).toBe(1);
    const afterLoad = totalCalls(backend);

    // Slider movement, close/reopen and a Riot-only Explore are network-free.
    fireEvent.keyDown(slider, { key: "End" });
    fireEvent.change(slider, { target: { value: "1" } });
    fireEvent.change(slider, { target: { value: "11" } });
    const toggle = within(line).getByTestId("patch-impact-explore-toggle");
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    fireEvent.click(within(changeLineOf("Base Health")).getByTestId("patch-impact-explore-toggle"));
    await act(async () => {});
    expect(totalCalls(backend)).toBe(afterLoad);
  });

  it("a failed load keeps Riot's line, shows retry, and recovers on retry", async () => {
    const backend = scenario();
    backend.failing.add("champion-stats");
    renderPage(backend);
    await pageReady();

    const line = changeLineOf("Base AD");
    fireEvent.click(within(line).getByTestId("patch-impact-explore-toggle"));
    await waitFor(() =>
      expect(within(line).getByTestId("patch-impact-state")).toHaveAttribute("data-state", "error"),
    );
    expect(within(line).getByTestId("patch-report-values")).toHaveTextContent("58");
    expect(callsTo(backend, STATS_PATH)).toBe(1);

    backend.failing.delete("champion-stats");
    fireEvent.click(within(line).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(within(line).getByTestId("patch-impact")).toHaveAttribute("data-impact-status", "projected"),
    );
    expect(callsTo(backend, STATS_PATH)).toBe(2);
    expect(within(line).getByTestId("patch-impact-level")).toBeInTheDocument();
  });

  it("one Explore open issues exactly one evidence request even with several rows mounted", async () => {
    const backend = scenario();
    renderPage(backend);
    await pageReady();
    fireEvent.click(within(changeLineOf("Base AD")).getByTestId("patch-impact-explore-toggle"));
    await waitFor(() => expect(impactIn("Base AD")).toHaveAttribute("data-impact-status", "projected"));
    expect(callsTo(backend, STATS_PATH)).toBe(1);
  });
});
