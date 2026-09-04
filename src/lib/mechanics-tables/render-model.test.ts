import { describe, expect, it } from "vitest";

import { normalizeStudyTable, type StudyColumn } from "./api";
import {
  DEATH_TIMERS,
  FOUNTAIN,
  KILL_GOLD,
  MINION_BASE_STATS,
  PUSHING_EXAMPLES,
  XP_BY_WAVE,
} from "./fixtures";
import {
  buildStudyTableModel,
  filterRows,
  renderCell,
  rowSearchText,
  unitHeaderLabel,
} from "./render-model";

const textColumn: StudyColumn = { key: "detail", label: "Detail", unit: "", kind: "text" };
const goldColumn: StudyColumn = { key: "gold", label: "Gold", unit: "gold", kind: "number" };
const percentColumn: StudyColumn = { key: "pct", label: "Bonus", unit: "percent", kind: "number" };
const timeColumn: StudyColumn = { key: "t", label: "Spawns at", unit: "", kind: "time" };

describe("cell rendering", () => {
  it("renders a text value verbatim", () => {
    expect(renderCell("2000 raw damage per second", textColumn)).toEqual({
      text: "2000 raw damage per second",
      present: true,
      numeric: false,
    });
  });

  it("renders an integer cell as a right-aligned number", () => {
    const cell = renderCell(7, goldColumn);
    expect(cell.text).toBe("7");
    expect(cell.numeric).toBe(true);
  });

  it("trims an exact decimal string without going through a float", () => {
    expect(renderCell("19.50", goldColumn).text).toBe("19.5");
    expect(renderCell("5.525", { ...goldColumn, unit: "" }).text).toBe("5.53");
  });

  it("attaches the percent unit to the value, because a bare number is not a percentage", () => {
    expect(renderCell("30", percentColumn).text).toBe("30%");
  });

  it("leaves other units off the cell — they belong in the column header", () => {
    expect(renderCell("300", goldColumn).text).toBe("300");
    expect(unitHeaderLabel("gold")).toBe("gold");
    expect(unitHeaderLabel("experience")).toBe("XP");
    expect(unitHeaderLabel("percent")).toBe("%");
  });

  it("humanizes a unit token it has never seen rather than hiding it", () => {
    expect(unitHeaderLabel("mana_per_second")).toBe("Mana per second");
    expect(unitHeaderLabel("")).toBe("");
  });

  it("renders a pre-formatted clock verbatim and keeps it in the numeric face", () => {
    const cell = renderCell("0:30", timeColumn);
    expect(cell.text).toBe("0:30");
    expect(cell.numeric).toBe(true);
  });

  it("spells out a boolean", () => {
    expect(renderCell(true, textColumn).text).toBe("Yes");
    expect(renderCell(false, textColumn).text).toBe("No");
  });

  it("reports a missing cell as absent rather than as zero", () => {
    expect(renderCell(undefined, goldColumn)).toEqual({ text: "", present: false, numeric: false });
    expect(renderCell(null, goldColumn).present).toBe(false);
  });
});

describe("study table model", () => {
  it("treats a never-populated leading column as the row-label header", () => {
    const model = buildStudyTableModel(normalizeStudyTable(MINION_BASE_STATS));
    expect(model.labelColumn?.key).toBe("stat");
    expect(model.dataColumns.map((column) => column.key)).toEqual([
      "melee",
      "caster",
      "cannon",
      "super",
      "all_minions",
      "highest",
    ]);
    expect(model.layout).toBe("table");
  });

  it("leaves the label header implicit when every declared column carries values", () => {
    const model = buildStudyTableModel(normalizeStudyTable(KILL_GOLD));
    expect(model.labelColumn).toBeUndefined();
    expect(model.dataColumns[0].key).toBe("kill_gold");
  });

  it("renders a single prose column as a list, not a one-column grid", () => {
    const model = buildStudyTableModel(normalizeStudyTable(FOUNTAIN));
    expect(model.layout).toBe("list");
    expect(model.dataColumns).toHaveLength(1);
  });

  it("keeps a two-column table with a sparse first column as a table", () => {
    const model = buildStudyTableModel(normalizeStudyTable(DEATH_TIMERS));
    expect(model.layout).toBe("table");
    expect(model.labelColumn).toBeUndefined();
    expect(model.dataColumns.map((column) => column.key)).toEqual(["detail", "seconds"]);
  });

  it("groups rows into the backend's sections, in the backend's order", () => {
    const model = buildStudyTableModel(normalizeStudyTable(FOUNTAIN));
    expect(model.sections.map((section) => section.key)).toEqual(["your_fountain", "enemy_fountain"]);
    expect(model.sections[0].rows[0].label).toBe("Health you recover");
  });

  it("puts every row in one unlabelled group when the table declares no sections", () => {
    const model = buildStudyTableModel(normalizeStudyTable(PUSHING_EXAMPLES));
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].key).toBe("");
    expect(model.sections[0].rows).toHaveLength(PUSHING_EXAMPLES.rows.length);
  });

  it("keeps a row that cites a section the table never declared", () => {
    const table = normalizeStudyTable({
      columns: [{ key: "a" }, { key: "b" }],
      sections: [{ key: "known", label: "Known" }],
      rows: [
        { row_id: "r1", label: "In section", section: "known", values: { a: 1 } },
        { row_id: "r2", label: "Orphan", section: "ghost", values: { a: 2 } },
      ],
    });
    const model = buildStudyTableModel(table);
    const labels = model.sections.flatMap((section) => section.rows.map((row) => row.label));
    expect(labels).toContain("Orphan");
  });

  it("renders an unknown table shape through the same generic model", () => {
    const model = buildStudyTableModel(
      normalizeStudyTable({
        table_id: "future.study.unknown",
        columns: [
          { key: "left", label: "Left", kind: "wildcard" },
          { key: "right", label: "Right", kind: "wildcard", unit: "furlongs" },
        ],
        rows: [{ row_id: "r", label: "Row", values: { left: "a", right: 2 } }],
      }),
    );
    expect(model.layout).toBe("table");
    expect(model.dataColumns).toHaveLength(2);
    expect(model.sections[0].rows).toHaveLength(1);
  });

  it("survives an empty table", () => {
    const model = buildStudyTableModel(normalizeStudyTable({ columns: [], rows: [] }));
    expect(model.sections).toEqual([]);
    expect(model.rowCount).toBe(0);
    expect(model.filterable).toBe(false);
  });

  it("offers a filter only once a table is long", () => {
    expect(buildStudyTableModel(normalizeStudyTable(FOUNTAIN)).filterable).toBe(false);
    const long = normalizeStudyTable({
      columns: [{ key: "a" }],
      rows: Array.from({ length: 20 }, (_, index) => ({
        row_id: `r${index}`,
        label: `Row ${index}`,
        values: { a: index },
      })),
    });
    expect(buildStudyTableModel(long).filterable).toBe(true);
  });
});

describe("row filtering", () => {
  const rows = normalizeStudyTable(XP_BY_WAVE).rows;

  it("keeps every row for an empty query", () => {
    expect(filterRows(rows, "   ")).toHaveLength(rows.length);
  });

  it("matches on the row label", () => {
    const filtered = filterRows(rows, "wave 1");
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.map((row) => row.label)).toContain("Wave 1");
    // Rows are matched on their whole text, so every survivor contains both
    // terms somewhere — the label is one place they can appear.
    expect(filtered.every((row) => rowSearchText(row).includes("wave"))).toBe(true);
  });

  it("matches on cell contents, not just the label", () => {
    const target = rows[0];
    const cell = String(Object.values(target.values)[0]);
    expect(filterRows(rows, cell).map((row) => row.row_id)).toContain(target.row_id);
  });

  it("requires every term of a multi-word query", () => {
    expect(filterRows(rows, "wave zzzznotpresent")).toHaveLength(0);
  });
});
