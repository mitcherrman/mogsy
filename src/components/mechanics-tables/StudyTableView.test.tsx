import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { normalizeStudyTable } from "@/lib/mechanics-tables/api";
import {
  DEATH_TIMERS,
  FOUNTAIN,
  KILL_GOLD,
  MINION_BASE_STATS,
  PUSHING_EXAMPLES,
  STRUCTURE_STATS,
  XP_BY_WAVE,
} from "@/lib/mechanics-tables/fixtures";

import StudyTableView from "./StudyTableView";

function renderTable(fixture: unknown) {
  return render(<StudyTableView table={normalizeStudyTable(fixture)} />);
}

describe("StudyTableView — the one renderer", () => {
  it("renders a numeric table as a semantic table with row headers", () => {
    renderTable(MINION_BASE_STATS);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Melee minion/ })).toBeInTheDocument();
    // The row label is a row header, not a plain cell.
    expect(within(table).getByRole("rowheader", { name: /Gold value/ })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "20" })).toBeInTheDocument();
  });

  it("uses the backend's never-populated leading column as the label header", () => {
    renderTable(MINION_BASE_STATS);
    expect(screen.getByRole("columnheader", { name: /^Stat$/ })).toBeInTheDocument();
  });

  it("renders a single prose column as a description list, not a table", () => {
    const { container } = renderTable(FOUNTAIN);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(container.querySelectorAll("dl").length).toBeGreaterThan(0);
    expect(screen.getByText("Health you recover")).toBeInTheDocument();
    expect(
      screen.getByText(/8% of your maximum health per second/),
    ).toBeInTheDocument();
  });

  it("shows the backend's sections as headings in both layouts", () => {
    renderTable(FOUNTAIN);
    expect(screen.getByText("Standing in your own fountain")).toBeInTheDocument();
    expect(screen.getByText("Standing in the enemy fountain")).toBeInTheDocument();
  });

  it("labels a section band as a column group in table layout", () => {
    renderTable(XP_BY_WAVE);
    const bands = screen.getAllByRole("columnheader");
    expect(bands.some((band) => band.getAttribute("scope") === "colgroup")).toBe(true);
  });

  it("puts a unit in the column header rather than on every cell", () => {
    renderTable(KILL_GOLD);
    const header = screen.getByRole("columnheader", { name: /Kill gold/ });
    expect(header).toHaveTextContent("gold");
    expect(screen.getByRole("rowheader", { name: "Level 1" })).toBeInTheDocument();
    // The gold value itself is bare — the unit is stated once, in the header.
    expect(screen.getAllByRole("cell", { name: "300" }).length).toBeGreaterThan(0);
  });

  it("attaches the percent unit to each value, where a bare number would mislead", () => {
    renderTable(PUSHING_EXAMPLES);
    expect(screen.getAllByRole("cell", { name: "10%" }).length).toBeGreaterThan(0);
  });

  it("renders a missing cell as not applicable, never as zero", () => {
    renderTable(DEATH_TIMERS);
    const notApplicable = screen.getAllByText("Not applicable");
    expect(notApplicable.length).toBeGreaterThan(0);
    expect(screen.queryByRole("cell", { name: "0" })).not.toBeInTheDocument();
  });

  it("renders a boolean cell as words", () => {
    renderTable({
      table_id: "t.study.b",
      title: "Booleans",
      columns: [{ key: "flag", label: "Applies", kind: "text" }, { key: "n", label: "N", kind: "number" }],
      rows: [
        { row_id: "yes", label: "Yes row", values: { flag: true, n: 1 } },
        { row_id: "no", label: "No row", values: { flag: false, n: 2 } },
      ],
    });
    expect(screen.getByRole("cell", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "No" })).toBeInTheDocument();
  });

  it("shows the verified-through patch without claiming it is current", () => {
    renderTable(STRUCTURE_STATS);
    expect(screen.getByText(/Verified through patch 26\.15/)).toBeInTheDocument();
    expect(screen.queryByText(/current patch/i)).not.toBeInTheDocument();
  });

  it("renders the table's footnotes", () => {
    renderTable(MINION_BASE_STATS);
    for (const note of MINION_BASE_STATS.notes) {
      expect(screen.getByText(note)).toBeInTheDocument();
    }
  });

  it("renders an unknown table shape through the same generic path", () => {
    renderTable({
      table_id: "future.study.mystery",
      title: "A table this build has never seen",
      columns: [
        { key: "left", label: "Left", kind: "wildcard" },
        { key: "right", label: "Right", kind: "wildcard", unit: "furlongs" },
      ],
      rows: [{ row_id: "r", label: "Row", values: { left: "alpha", right: 12 } }],
    });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "alpha" })).toBeInTheDocument();
    // An unrecognised unit is still shown, humanized, rather than dropped.
    expect(screen.getByRole("columnheader", { name: /Furlongs/ })).toBeInTheDocument();
  });

  it("states an empty table instead of rendering a bare frame", () => {
    renderTable({ table_id: "t.study.empty", title: "Nothing yet", columns: [], rows: [] });
    expect(screen.getByText(/no published rows yet/i)).toBeInTheDocument();
  });

  it("gives a long table a row filter and applies it", () => {
    renderTable(XP_BY_WAVE);
    const filter = screen.getByRole("searchbox", { name: /Filter/i });
    const before = screen.getAllByRole("rowheader").length;
    expect(before).toBe(XP_BY_WAVE.rows.length);
    fireEvent.change(filter, { target: { value: "Wave 7" } });
    const after = screen.getAllByRole("rowheader").length;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
    expect(
      screen.getByText(new RegExp(`Showing ${after} of ${before} rows`)),
    ).toBeInTheDocument();
  });

  it("says so when a filter matches nothing", () => {
    renderTable(XP_BY_WAVE);
    fireEvent.change(screen.getByRole("searchbox", { name: /Filter/i }), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/No rows match/)).toBeInTheDocument();
  });

  it("leaves a short table without filter chrome", () => {
    renderTable(FOUNTAIN);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("makes a wide table reachable and scrollable by keyboard", () => {
    renderTable(KILL_GOLD);
    const region = screen.getByRole("region", { name: /scrollable/i });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-x-auto");
  });

  it("carries a screen-reader caption naming the table", () => {
    const { container } = renderTable(KILL_GOLD);
    const caption = container.querySelector("caption");
    expect(caption?.textContent).toContain("Kill and assist gold by level");
    expect(caption?.className).toContain("sr-only");
  });

  it("never renders internal fact or table identifiers to the reader", () => {
    const { container } = renderTable(MINION_BASE_STATS);
    const text = container.textContent ?? "";
    expect(text).not.toContain("minion_stats.base:");
    expect(text).not.toContain("fact_id");
    expect(text).not.toContain("implementation_allowed");
    expect(text).not.toMatch(/\.study\./);
  });
});
