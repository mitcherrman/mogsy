import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PatchReportEntityCard } from "./PatchReportEntityCard";
import { filterCards } from "@/lib/patch-reports/filter";
import type { PatchReportCard } from "@/lib/patch-reports/api";

const jayceCard: PatchReportCard = {
  id: 1,
  entity_type: "champion",
  entity_name: "Jayce",
  entity_slug: "Jayce",
  section_id: "patch-champions",
  section_title: "Champions",
  official_image_url: "https://official/jayce.png",
  mogzy_image_path: "assets/champions/Jayce/icon.png",
  mogzy_entity_ref: "Jayce",
  context_text: "Jayce climbed the ranks quickly.",
  aggregate_status: "mismatch",
  changes: [
    {
      group_title: "Passive - Hextech Capacitor",
      ability_slot: "P",
      ability_icon_url: null,
      property_name: "Bonus Move Speed",
      change_kind: "numeric",
      is_new: false,
      before_raw: "40",
      after_raw: "30",
      detail_text: null,
      mogzy_property: null,
      mogzy_current_raw: null,
      mogzy_status: "not_represented",
      proposal_id: null,
      proposal_status: null,
    },
    {
      group_title: "R - Mercury Hammer",
      ability_slot: "R",
      ability_icon_url: "https://icons/JayceR.png",
      property_name: "Bonus Armor and Magic Resistance",
      change_kind: "numeric",
      is_new: false,
      before_raw: "5 / 15 / 25 / 35",
      after_raw: "5 / 12 / 19 / 26",
      detail_text: null,
      mogzy_property: "cooldown",
      mogzy_current_raw: "5 / 15 / 25 / 35",
      mogzy_status: "mismatch",
      proposal_id: 12,
      proposal_status: "PENDING",
    },
    {
      group_title: "R - Mercury Hammer",
      ability_slot: "R",
      ability_icon_url: "https://icons/JayceR.png",
      property_name: "Hammer Time",
      change_kind: "mechanical",
      is_new: true,
      before_raw: null,
      after_raw: null,
      detail_text: "Now bonks jungle monsters",
      mogzy_property: null,
      mogzy_current_raw: null,
      mogzy_status: "needs_interpretation",
      proposal_id: null,
      proposal_status: null,
    },
  ],
};

const systemCard: PatchReportCard = {
  ...jayceCard,
  id: 2,
  entity_type: "system",
  entity_name: "Blue Buff",
  section_id: "patch-systems",
  section_title: "Systems",
  mogzy_entity_ref: null,
  mogzy_image_path: null,
  official_image_url: null,
  aggregate_status: "needs_interpretation",
  changes: [],
};

describe("PatchReportEntityCard", () => {
  it("renders header collapsed with name, status, context, and change count", () => {
    render(<PatchReportEntityCard card={jayceCard} />);
    expect(screen.getByText("Jayce")).toBeInTheDocument();
    expect(screen.getByText("Jayce climbed the ranks quickly.")).toBeInTheDocument();
    expect(screen.getByText("3 changes")).toBeInTheDocument();
    expect(screen.getAllByText("Mismatch").length).toBeGreaterThan(0);
    // Collapsed: change rows not visible yet.
    expect(screen.queryByText("Bonus Move Speed")).not.toBeInTheDocument();
  });

  it("expands to show grouped before → after → current-Mogzy rows", () => {
    render(<PatchReportEntityCard card={jayceCard} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("Passive - Hextech Capacitor")).toBeInTheDocument();
    expect(screen.getByText("R - Mercury Hammer")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("5 / 12 / 19 / 26")).toBeInTheDocument();
    // Current-Mogzy value shown distinctly; missing value stated honestly.
    expect(screen.getAllByText("5 / 15 / 25 / 35").length).toBeGreaterThan(0);
    expect(screen.getByText("value not available in Mogzy")).toBeInTheDocument();
    // Mechanical change renders its description and NEW badge.
    expect(screen.getByText("Now bonks jungle monsters")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    // Review linkage surfaced.
    expect(screen.getByText("review: pending")).toBeInTheDocument();
  });

  it("degrades safely without images", () => {
    render(<PatchReportEntityCard card={systemCard} />);
    expect(screen.getByText("Blue Buff")).toBeInTheDocument();
    expect(screen.getByText("BL")).toBeInTheDocument(); // initials placeholder
  });
});

describe("filterCards", () => {
  const cards = [jayceCard, systemCard];

  it("filters by type, status, and search text", () => {
    expect(filterCards(cards, "", "all", "all")).toHaveLength(2);
    expect(filterCards(cards, "", "champion", "all")).toEqual([jayceCard]);
    expect(filterCards(cards, "", "all", "needs_interpretation")).toEqual([systemCard]);
    expect(filterCards(cards, "jayce", "all", "all")).toEqual([jayceCard]);
    expect(filterCards(cards, "move speed", "all", "all")).toEqual([jayceCard]);
    expect(filterCards(cards, "zzz", "all", "all")).toHaveLength(0);
  });
});
