import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  HistoricalClassification,
  HistoricalNormalizedValue,
  PatchHistoricalContext,
  PatchReportCard,
} from "@/lib/patch-reports/api";
import { formatHistoricalValue } from "@/lib/patch-reports/history";
import { HistoricalContext } from "./HistoricalContext";
import { PatchReportEntityCard } from "./PatchReportEntityCard";

const ratio = (value: string): HistoricalNormalizedValue => ({
  kind: "ratio",
  unit: "ratio",
  values: [value],
});

function analyzed(
  classification: HistoricalClassification,
  options: Partial<PatchHistoricalContext> = {},
): PatchHistoricalContext {
  return {
    status: "analyzed",
    reason: null,
    lifecycle: "preview",
    hypothetical: true,
    classification,
    flags: [],
    normalized_before: ratio("0.1"),
    normalized_after: ratio("0.2"),
    reference: {
      patch_version: "10.17",
      before: ratio("0.2"),
      after: ratio("0.1"),
      source: {
        type: "league_wiki",
        url: "https://wiki.leagueoflegends.com/example?oldid=4034672",
        revision_id: "4034672",
      },
    },
    current_source: { url: "https://www.leagueoflegends.com/example" },
    calendar_days_elapsed: 1526,
    ...options,
  };
}

describe("HistoricalContext", () => {
  it("renders Qiyana preview exact-revert copy, lineage, and evidence disclosure", () => {
    render(<HistoricalContext context={analyzed("exact_revert")} />);
    expect(screen.getByText("Would be an Exact Revert")).toBeInTheDocument();
    expect(screen.getByTestId("historical-context")).toHaveTextContent("20%→10%→20%");
    expect(screen.getByText("Would restore the value removed in Patch 10.17.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Why?"));
    expect(screen.getByText("Reference patch: 10.17")).toBeInTheDocument();
    expect(screen.getByText("1,526 days between verified states")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View historical source" })).toHaveAttribute(
      "href",
      "https://wiki.leagueoflegends.com/example?oldid=4034672",
    );
    expect(screen.getByRole("link", { name: "View current Riot source" })).toHaveAttribute(
      "href",
      "https://www.leagueoflegends.com/example",
    );
  });

  it("links League Wiki evidence to the exact numeric revision", () => {
    render(
      <HistoricalContext
        context={analyzed("exact_revert", {
          reference: {
            patch_version: "10.17",
            before: ratio("0.2"),
            after: ratio("0.1"),
            source: {
              type: "league_wiki",
              url: "https://wiki.leagueoflegends.com/en-us/Qiyana/Patch_history",
              revision_id: "4034672",
            },
          },
        })}
      />,
    );
    expect(screen.getByRole("link", { name: "View historical source" })).toHaveAttribute(
      "href",
      "https://wiki.leagueoflegends.com/en-us/Qiyana/Patch_history?oldid=4034672",
    );
  });

  it("states a shipped exact revert as fact rather than a proposal", () => {
    render(
      <HistoricalContext
        context={analyzed("exact_revert", { lifecycle: "shipped", hypothetical: true })}
      />,
    );
    expect(screen.getByText("Exact Revert")).toBeInTheDocument();
    expect(screen.queryByText(/Would be/)).not.toBeInTheDocument();
    expect(screen.getByText("Restores the value removed in Patch 10.17.")).toBeInTheDocument();
  });

  it.each([
    ["partial_revert", "Partial Revert", "Restores part of the earlier change from Patch 10.17."],
    ["over_revert", "Over-Revert", "Restores the earlier change from Patch 10.17 and moves beyond the previous value."],
    ["return_to_historical_state", "Returns to Previous Value", "This parameter has returned to a value previously seen in Patch 10.17."],
  ] as const)("renders %s with precise shipped copy", (classification, label, copy) => {
    render(
      <HistoricalContext
        context={analyzed(classification, { lifecycle: "shipped", hypothetical: true })}
      />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it("omits ordinary no-match, unsupported, unavailable, and legacy contexts", () => {
    const { rerender } = render(<HistoricalContext context={analyzed("no_historical_match")} />);
    expect(screen.queryByLabelText("Historical context")).not.toBeInTheDocument();
    rerender(<HistoricalContext context={{ status: "unresolved", reason: "unsupported_parameter" }} />);
    expect(screen.queryByLabelText("Historical context")).not.toBeInTheDocument();
    rerender(<HistoricalContext context={{ status: "unavailable", reason: "ph1_schema_unavailable" }} />);
    expect(screen.queryByLabelText("Historical context")).not.toBeInTheDocument();
    rerender(<HistoricalContext />);
    expect(screen.queryByLabelText("Historical context")).not.toBeInTheDocument();
  });

  it("shows a restrained mismatch diagnostic and never a revert label", () => {
    render(
      <HistoricalContext context={{ status: "mismatch", reason: "before_value_mismatch" }} />,
    );
    expect(screen.getByTestId("history-mismatch")).toHaveTextContent("History check unavailable");
    expect(screen.queryByText(/Revert/)).not.toBeInTheDocument();
  });

  it("formats exact ratios and readable rank arrays without flattening them", () => {
    expect(formatHistoricalValue(ratio("0.200"))).toBe("20%");
    expect(formatHistoricalValue({
      kind: "rank_array",
      unit: "seconds",
      values: ["9", "8", "7", "6", "5"],
    })).toBe("[9 / 8 / 7 / 6 / 5]");
  });
});

describe("per-parameter integration", () => {
  it("keeps composite ability results on their own change rows", () => {
    const card: PatchReportCard = {
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
      changes: [
        {
          group_title: "Q — Edge of Ixtal",
          ability_slot: "Q",
          ability_icon_url: null,
          property_name: "Base Damage",
          change_kind: "numeric",
          is_new: false,
          before_raw: "60",
          after_raw: "70",
          detail_text: null,
          mogzy_property: "base_damage",
          mogzy_current_raw: "60",
          mogzy_status: "pending",
          proposal_id: null,
          proposal_status: null,
          historical_context: analyzed("partial_revert", {
            lifecycle: "shipped",
            hypothetical: true,
          }),
        },
        {
          group_title: "Q — Edge of Ixtal",
          ability_slot: "Q",
          ability_icon_url: null,
          property_name: "Bonus AD Ratio",
          change_kind: "numeric",
          is_new: false,
          before_raw: "75%",
          after_raw: "90%",
          detail_text: null,
          mogzy_property: "bonus_ad_ratio",
          mogzy_current_raw: "75%",
          mogzy_status: "pending",
          proposal_id: null,
          proposal_status: null,
          historical_context: analyzed("over_revert", {
            lifecycle: "shipped",
            hypothetical: true,
          }),
        },
      ],
    };

    render(<PatchReportEntityCard card={card} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const contexts = screen.getAllByTestId("historical-context");
    expect(contexts).toHaveLength(2);
    expect(within(contexts[0]).getByText("Partial Revert")).toBeInTheDocument();
    expect(within(contexts[1]).getByText("Over-Revert")).toBeInTheDocument();
  });
});
