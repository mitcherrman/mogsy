import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PatchReportDetail, PatchReportSummary } from "@/lib/patch-reports/api";
import PatchReports from "./PatchReports";

const api = vi.hoisted(() => ({
  fetchPatchReports: vi.fn(),
  fetchPatchReport: vi.fn(),
}));

vi.mock("@/lib/patch-reports/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/patch-reports/api")>()),
  fetchPatchReports: api.fetchPatchReports,
  fetchPatchReport: api.fetchPatchReport,
}));

const summary: PatchReportSummary = {
  patch_version: "14.21",
  source_url: "https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-21-notes/",
  built_at: "2026-08-24T00:00:00Z",
  section_titles: ["Champions"],
  card_count: 1,
  change_count: 2,
  cards_by_type: { champion: 1 },
  cards_by_status: { pending: 1 },
};

const detail: PatchReportDetail = {
  patch_version: "14.21",
  source_url: summary.source_url,
  built_at: summary.built_at,
  section_titles: ["Champions"],
  skipped_sections: [],
  historical_context_summary: {
    statuses: { analyzed: 1, unresolved: 1 },
    classifications: { exact_revert: 1 },
  },
  cards: [{
    id: 1,
    entity_type: "champion",
    entity_name: "Qiyana",
    entity_slug: "qiyana",
    section_id: "patch-champions",
    section_title: "Champions",
    official_image_url: null,
    mogzy_image_path: null,
    mogzy_entity_ref: "Qiyana",
    context_text: null,
    aggregate_status: "pending",
    changes: [{
      group_title: "Terrashape",
      ability_slot: "W",
      ability_icon_url: null,
      property_name: "Bonus AD Ratio",
      change_kind: "numeric",
      is_new: false,
      before_raw: "10%",
      after_raw: "20%",
      detail_text: null,
      mogzy_property: "bonus_ad_ratio",
      mogzy_current_raw: "10%",
      mogzy_status: "pending",
      proposal_id: null,
      proposal_status: null,
      historical_context: {
        status: "analyzed",
        lifecycle: "preview",
        hypothetical: true,
        classification: "exact_revert",
        normalized_before: { kind: "ratio", unit: "ratio", values: ["0.1"] },
        normalized_after: { kind: "ratio", unit: "ratio", values: ["0.2"] },
        reference: {
          patch_version: "10.17",
          before: { kind: "ratio", unit: "ratio", values: ["0.2"] },
          after: { kind: "ratio", unit: "ratio", values: ["0.1"] },
          source: {
            type: "league_wiki",
            url: "https://wiki.leagueoflegends.com/en-us/Qiyana/Patch_history",
            revision_id: "4034672",
          },
        },
        current_source: { url: summary.source_url },
      },
    }, {
      group_title: "Terrashape",
      ability_slot: "W",
      ability_icon_url: null,
      property_name: "Mystery Power",
      change_kind: "numeric",
      is_new: false,
      before_raw: "1",
      after_raw: "2",
      detail_text: null,
      mogzy_property: null,
      mogzy_current_raw: null,
      mogzy_status: "pending",
      proposal_id: null,
      proposal_status: null,
      historical_context: { status: "unresolved", reason: "unsupported_parameter" },
    }],
  }],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/lol/patch-reports?patch=14.21"]}>
        <PatchReports />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Patch Reports historical-context API integration", () => {
  beforeEach(() => {
    api.fetchPatchReports.mockReset().mockResolvedValue({ patches: [summary] });
    api.fetchPatchReport.mockReset().mockResolvedValue(detail);
  });

  it("renders independently projected Step 2G results through the full page", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Qiyana Pending 2 changes" }));

    const context = await screen.findByTestId("historical-context");
    expect(within(context).getByText("Would be an Exact Revert")).toBeInTheDocument();
    expect(context).toHaveTextContent("20%→10%→20%");
    expect(screen.getByText("Mystery Power")).toBeInTheDocument();
    expect(screen.getAllByTestId("historical-context")).toHaveLength(1);
    expect(api.fetchPatchReports).toHaveBeenCalledTimes(1);
    expect(api.fetchPatchReport).toHaveBeenCalledTimes(1);
  });
});
