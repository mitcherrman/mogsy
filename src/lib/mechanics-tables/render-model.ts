// Turns one backend StudyTable into everything the renderer needs to draw it.
//
// Pure, data-driven and table-id-agnostic: every decision below is taken from
// the payload's own shape (how many columns, which are populated, what `kind`
// and `unit` they declare), never from a table id. A study table published
// tomorrow renders through this model with no change here.
//
// This module formats. It does not compute: no arithmetic is performed on a
// mechanics value, and no value is parsed into a number and re-emitted. The
// one transformation applied is `formatDisplayNumber`, the existing shared
// display-rounding helper, which trims trailing zeros on exact decimal
// strings and leaves everything else untouched.

import { formatDisplayNumber } from "@/lib/mechanics-explorer/api";

import type { StudyCellValue, StudyColumn, StudyRow, StudyTable } from "./api";
import { humanizeToken } from "./presentation";

/** How a unit token is spelled for readers, and whether it rides on the cell.
 *  An unrecognised unit falls through to its own humanized token. */
const UNIT_PRESENTATION: Record<string, { header: string; cellSuffix: string }> = {
  gold: { header: "gold", cellSuffix: "" },
  experience: { header: "XP", cellSuffix: "" },
  seconds: { header: "seconds", cellSuffix: "" },
  minions: { header: "minions", cellSuffix: "" },
  // A bare "5" in a percent column is not readable as a percentage, so this
  // one unit travels with the value itself as well as in the header.
  percent: { header: "%", cellSuffix: "%" },
};

export function unitHeaderLabel(unit: string): string {
  if (!unit) return "";
  return UNIT_PRESENTATION[unit]?.header ?? humanizeToken(unit);
}

function unitCellSuffix(unit: string): string {
  if (!unit) return "";
  return UNIT_PRESENTATION[unit]?.cellSuffix ?? "";
}

/** The em dash a sparse cell renders as. Study tables are legitimately sparse
 *  — a missing cell means "this row has nothing to say here", never zero. */
export const EMPTY_CELL = "—";

/** One cell, ready to draw. */
export interface RenderedCell {
  /** "" when the row has no value for this column. */
  text: string;
  present: boolean;
  numeric: boolean;
}

/**
 * Format one cell. Numbers and exact decimal strings are display-rounded by
 * the shared helper; every other string is rendered verbatim, including the
 * backend's own pre-formatted clocks ("0:30") and prose.
 */
export function renderCell(value: StudyCellValue | undefined, column: StudyColumn): RenderedCell {
  if (value === undefined || value === null || value === "") {
    return { text: "", present: false, numeric: false };
  }
  if (typeof value === "boolean") {
    return { text: value ? "Yes" : "No", present: true, numeric: false };
  }
  const raw = typeof value === "number" ? String(value) : value;
  const looksNumeric = /^-?\d+(\.\d+)?$/.test(raw.trim());
  const body = looksNumeric ? formatDisplayNumber(raw) : raw;
  const suffix = looksNumeric ? unitCellSuffix(column.unit) : "";
  return {
    text: `${body}${suffix}`,
    present: true,
    // `time` values arrive pre-formatted as "0:30" or "90 seconds"; they are
    // set in the numeric face for column alignment but are not numbers.
    numeric: looksNumeric || column.kind === "number" || column.kind === "time",
  };
}

/** A row's searchable text: its label plus every cell it carries. */
export function rowSearchText(row: StudyRow): string {
  const cells = Object.values(row.values).map((value) => (value === null ? "" : String(value)));
  return [row.label, ...cells].join(" ").toLowerCase();
}

export interface RenderedSection {
  key: string;
  label: string;
  note: string;
  rows: StudyRow[];
}

export type StudyTableLayout = "table" | "list";

export interface StudyTableModel {
  /** "list" for a single prose column (a rules sheet), "table" otherwise. */
  layout: StudyTableLayout;
  /**
   * The column the backend declared for the row label, when it declared one:
   * a leading column no row populates. Undefined otherwise, in which case the
   * leading header cell is blank and carries screen-reader-only text.
   */
  labelColumn?: StudyColumn;
  /** The columns that actually carry values, in backend order. */
  dataColumns: StudyColumn[];
  /** Rows grouped by section, in backend order; ungrouped rows come first in
   *  a section with an empty key. Always non-empty when the table has rows. */
  sections: RenderedSection[];
  rowCount: number;
  /** True once the table is long enough that a reader wants to filter it. */
  filterable: boolean;
}

/** Tables at or above this many rows get a row filter. Below it, a filter box
 *  is more chrome than help. */
export const FILTER_ROW_THRESHOLD = 16;

function isNeverPopulated(column: StudyColumn, rows: StudyRow[]): boolean {
  return !rows.some((row) => row.values[column.key] !== undefined);
}

/** Group rows into sections, preserving backend order in both dimensions. */
export function groupRows(table: StudyTable, rows: StudyRow[]): RenderedSection[] {
  if (rows.length === 0) return [];
  const declared = table.sections;
  if (declared.length === 0) {
    return [{ key: "", label: "", note: "", rows }];
  }
  const grouped: RenderedSection[] = [];
  const loose = rows.filter((row) => !row.section);
  if (loose.length > 0) grouped.push({ key: "", label: "", note: "", rows: loose });
  for (const section of declared) {
    const sectionRows = rows.filter((row) => row.section === section.key);
    if (sectionRows.length > 0) {
      grouped.push({ key: section.key, label: section.label, note: section.note, rows: sectionRows });
    }
  }
  // A row citing a section the table never declared would otherwise vanish.
  // The backend validates against this, but published data outranks a
  // frontend assumption: collect any stragglers rather than dropping them.
  const placed = new Set(grouped.flatMap((group) => group.rows.map((row) => row.row_id)));
  const orphans = rows.filter((row) => !placed.has(row.row_id));
  if (orphans.length > 0) grouped.push({ key: "", label: "", note: "", rows: orphans });
  return grouped;
}

/** Derive the full render model for a study table, given the rows to show
 *  (already filtered, if the reader is filtering). */
export function buildStudyTableModel(table: StudyTable, rows: StudyRow[] = table.rows): StudyTableModel {
  const columns = table.columns;
  const first = columns[0];
  // A leading column no row ever populates is the backend's declaration of
  // what the row labels mean ("Stat", "Level advantage"). Two of the current
  // tables do this; the rest leave the label column implicit.
  const hasLabelColumn = Boolean(first) && isNeverPopulated(first, table.rows) && columns.length > 1;
  const dataColumns = hasLabelColumn ? columns.slice(1) : columns;
  const soleColumn = dataColumns.length === 1 ? dataColumns[0] : undefined;
  return {
    layout: soleColumn && soleColumn.kind === "text" ? "list" : "table",
    ...(hasLabelColumn ? { labelColumn: first } : {}),
    dataColumns,
    sections: groupRows(table, rows),
    rowCount: rows.length,
    filterable: table.rows.length >= FILTER_ROW_THRESHOLD,
  };
}

/** Filter rows by a reader's free-text query. An empty query keeps every row. */
export function filterRows(rows: StudyRow[], query: string): StudyRow[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return rows;
  const terms = needle.split(/\s+/);
  return rows.filter((row) => {
    const haystack = rowSearchText(row);
    return terms.every((term) => haystack.includes(term));
  });
}
