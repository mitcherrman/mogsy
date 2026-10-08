import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PatchReportEntityCard } from "./PatchReportEntityCard";
import { filterCards } from "@/lib/patch-reports/filter";
import type { PatchReportCard } from "@/lib/patch-reports/api";
import { buildReportEntityNode } from "@/lib/patch-reports/report-structure";

const node = (card: PatchReportCard) => buildReportEntityNode(card);

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
  it("shows identity, rationale and every exact change without any interaction", () => {
    render(<PatchReportEntityCard entity={node(jayceCard)} />);
    expect(screen.getByRole("heading", { name: "Jayce" })).toBeInTheDocument();
    expect(screen.getByText("Jayce climbed the ranks quickly.")).toBeInTheDocument();
    expect(screen.getByText("3 changes")).toBeInTheDocument();
    // No expand button gates the patch note.
    expect(screen.queryByRole("button", { expanded: false })).not.toBeInTheDocument();

    const passive = screen.getByRole("group", { name: /Hextech Capacitor/ });
    expect(within(passive).getByText("Bonus Move Speed")).toBeVisible();
    expect(within(passive).getByTestId("patch-report-values")).toHaveTextContent("From 40→ to 30");

    const ult = screen.getByRole("group", { name: /Mercury Hammer/ });
    expect(within(ult).getByText("5 / 12 / 19 / 26")).toBeVisible();
    expect(
      within(ult).getByText("5 / 15 / 25 / 35", { selector: "span.line-through" }),
    ).toBeVisible();
  });

  it("gives abilities a slot heading and icon, with a slot glyph when no icon exists", () => {
    // Jayce is in Mogzy's stored-art table, so his passive resolves real art (PHSR4).
    // A champion with no catalog identity has none, which is the glyph path under test.
    render(<PatchReportEntityCard entity={node({ ...jayceCard, mogzy_entity_ref: null })} />);
    const passive = screen.getByRole("group", { name: /Hextech Capacitor/ });
    expect(passive).toHaveAttribute("data-ability-slot", "P");
    // The prefix is a kicker, not repeated inside the ability name.
    expect(within(passive).getByText("Passive")).toBeInTheDocument();
    expect(within(passive).getByText("Hextech Capacitor")).toBeInTheDocument();
    expect(within(passive).getByTestId("patch-report-ability-icon")).toHaveTextContent("P");
    expect(passive.querySelector("img")).toBeNull();

    const ult = screen.getByRole("group", { name: /Mercury Hammer/ });
    expect(ult.querySelector("img")).toHaveAttribute("src", "https://icons/JayceR.png");
  });

  it("renders mechanical changes as prose, not as an invented before → after", () => {
    render(<PatchReportEntityCard entity={node(jayceCard)} />);
    const hammer = screen
      .getAllByTestId("patch-report-change")
      .find((li) => li.getAttribute("data-change-kind") === "mechanical")!;
    expect(within(hammer).getByText("Now bonks jungle monsters")).toBeVisible();
    expect(within(hammer).queryByTestId("patch-report-values")).not.toBeInTheDocument();
    expect(within(hammer).getByText("New")).toBeInTheDocument();
  });

  it("never turns numeric-looking mechanical text into a value change", () => {
    const card: PatchReportCard = {
      ...jayceCard,
      changes: [
        {
          ...jayceCard.changes[2],
          group_title: "W - Ultrashock Laser",
          ability_slot: "W",
          property_name: "",
          detail_text: "150% (+15% IE)",
          is_new: false,
        },
      ],
    };
    render(<PatchReportEntityCard entity={node(card)} />);
    expect(screen.getByText(/150% \(\+15% IE\)/)).toBeVisible();
    expect(screen.queryByTestId("patch-report-values")).not.toBeInTheDocument();
  });

  it("keeps Mogzy evidence behind a compact disclosure while its status stays visible", () => {
    render(<PatchReportEntityCard entity={node(jayceCard)} />);
    // Quiet entity-level status is visible (not a loud header badge).
    expect(screen.getAllByText(/Mogzy: Mismatch/).length).toBeGreaterThan(0);
    const evidence = screen.getAllByTestId("patch-report-evidence");
    expect(evidence).toHaveLength(3);
    expect(evidence.every((d) => !(d as HTMLDetailsElement).open)).toBe(true);
    // Honest details live inside the disclosure.
    expect(screen.getByText("value not available in Mogzy")).toBeInTheDocument();
    expect(screen.getByText("review: pending")).toBeInTheDocument();
    expect(screen.getAllByText("5 / 15 / 25 / 35").length).toBeGreaterThan(1);
  });

  it("does not repeat an entry's Mogzy status on every prose-only note, but keeps differing evidence", () => {
    const note = (text: string, status: PatchReportCard["changes"][number]["mogzy_status"]) => ({
      ...jayceCard.changes[2],
      group_title: "",
      ability_slot: null,
      property_name: "",
      is_new: false,
      detail_text: text,
      mogzy_status: status,
    });
    const card: PatchReportCard = {
      ...systemCard,
      aggregate_status: "needs_interpretation",
      changes: [
        note("Same as header A", "needs_interpretation"),
        note("Same as header B", "needs_interpretation"),
        note("Differs from header", "unresolved"),
        { ...note("Has a review", "needs_interpretation"), proposal_status: "PENDING" },
      ],
    };
    render(<PatchReportEntityCard entity={node(card)} />);
    // Header still states the truth once; only the two non-redundant rows disclose.
    expect(screen.getAllByText(/Mogzy: Needs interpretation/).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("patch-report-evidence")).toHaveLength(2);
  });

  it("renders a backend editorial direction with its provenance, and omits it when absent", () => {
    const { rerender } = render(<PatchReportEntityCard entity={node(jayceCard)} />);
    expect(screen.queryByTestId("patch-report-direction")).not.toBeInTheDocument();

    rerender(
      <PatchReportEntityCard
        entity={node({ ...jayceCard, editorial_direction: "nerf", editorial_direction_source: "riot_section" })}
      />,
    );
    const chip = screen.getByTestId("patch-report-direction");
    expect(chip).toHaveTextContent("Nerf");
    expect(chip).toHaveAttribute("title", "Nerf — Riot's own section");

    rerender(
      <PatchReportEntityCard
        entity={node({
          ...jayceCard,
          editorial_direction: "adjustment",
          editorial_direction_source: "mogzy_inferred",
        })}
      />,
    );
    expect(screen.getByTestId("patch-report-direction")).toHaveTextContent("Adjustment(inferred)");

    rerender(
      <PatchReportEntityCard
        entity={node({ ...jayceCard, editorial_direction: "buff" })}
        showDirection={false}
      />,
    );
    expect(screen.queryByTestId("patch-report-direction")).not.toBeInTheDocument();
  });

  it("renders only the rationale the report structure left on the entity", () => {
    const { rerender } = render(
      <PatchReportEntityCard entity={buildReportEntityNode(jayceCard, { context: null })} />,
    );
    expect(screen.queryByTestId("patch-report-rationale")).not.toBeInTheDocument();
    rerender(<PatchReportEntityCard entity={node(jayceCard)} />);
    expect(screen.getByTestId("patch-report-rationale")).toHaveTextContent(
      "Jayce climbed the ranks quickly.",
    );
  });

  it("names the twin entities when Riot's rationale covers an 'A / B' pair", () => {
    render(
      <PatchReportEntityCard
        entity={buildReportEntityNode(jayceCard, { pairedWith: ["Jayce Mk II"] })}
      />,
    );
    expect(screen.getByTestId("patch-report-rationale")).toHaveTextContent(
      "Riot wrote this for Jayce / Jayce Mk II.",
    );
  });

  it("exposes stable anchors for the entity, ability group and each change", () => {
    const { container } = render(<PatchReportEntityCard entity={node(jayceCard)} />);
    expect(container.querySelector("#s-patch-champions__e-champion-jayce")).toBe(
      screen.getByTestId("patch-report-card"),
    );
    expect(container.querySelector("#s-patch-champions__e-champion-jayce__g-r")).not.toBeNull();
    expect(
      container.querySelector("#s-patch-champions__e-champion-jayce__g-r__c-hammer-time"),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Link to Jayce changes" })).toHaveAttribute(
      "href",
      "#s-patch-champions__e-champion-jayce",
    );
  });

  it("lets later systems attach analysis and actions without changing the Riot text", () => {
    render(
      <PatchReportEntityCard
        entity={node(jayceCard)}
        slots={{
          entityActions: ({ entity }) => <button>Quiz {entity.card.entity_name}</button>,
          groupActions: ({ group }) => <button>History {group.slot}</button>,
          changeAnalysis: ({ change }) => <p>analysis:{change.property_name}</p>,
          changeActions: ({ node: change }) => <button>Graph {change.index}</button>,
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Quiz Jayce" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History P" })).toBeInTheDocument();
    expect(screen.getByText("analysis:Bonus Move Speed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graph 2" })).toBeInTheDocument();
    expect(screen.getByText("Bonus Move Speed")).toBeVisible();
  });

  it("degrades safely without images, ability groups or editorial fields", () => {
    render(<PatchReportEntityCard entity={node(systemCard)} />);
    expect(screen.getByRole("heading", { name: "Blue Buff" })).toBeInTheDocument();
    expect(screen.getByText("BL")).toBeInTheDocument(); // initials placeholder
    expect(
      screen.getByText("Riot published no itemised changes for this entry."),
    ).toBeInTheDocument();
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
