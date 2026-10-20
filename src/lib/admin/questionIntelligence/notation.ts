// ---------------------------------------------------------------------------
// QI1 — the compact Question Intelligence notation.
//
//   A1     one question: a short label for the row's STABLE canonical ref.
//   A1.4   the 4th DISPLAYED option of A1.
//
// A label names a row of the view it was read from (its sort, filters and
// page), and it is always shown beside the canonical ref it stands for, so the
// ref — never the label — is the identity. Positions are the order the player
// saw, laid out two to a row:
//
//   1 top-left    2 top-right
//   3 bottom-left 4 bottom-right
//
// A two-option card (Meta Reflex) is one row: 1 left, 2 right.
// ---------------------------------------------------------------------------

export const LABEL_PREFIX = "A";
export const GRID_COLUMNS = 2;

/** `A1` for the first row of a view. `index` is the 0-based row in the full result. */
export function questionLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new RangeError("label index must be a non-negative integer");
  return `${LABEL_PREFIX}${index + 1}`;
}

/** `A1.4` — option `position` (1-based, displayed order) of question `label`. */
export function optionLabel(label: string, position: number): string {
  if (!Number.isInteger(position) || position < 1) throw new RangeError("position must be a positive integer");
  return `${label}.${position}`;
}

export interface ParsedNotation {
  /** 1-based question number: `A3` → 3. */
  question: number;
  /** 1-based displayed position, or null for a bare question label. */
  position: number | null;
}

const NOTATION = /^A([1-9]\d*)(?:\.([1-9]\d*))?$/;

/** Parse `A1` / `A1.4`. Anything else is null — never coerced. */
export function parseNotation(text: string): ParsedNotation | null {
  const m = NOTATION.exec(text.trim());
  if (!m) return null;
  return { question: Number(m[1]), position: m[2] ? Number(m[2]) : null };
}

export type CellName = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "left" | "right";

export interface GridCell {
  /** 0-based row and column on screen. */
  row: number;
  col: number;
  name: CellName | null;
}

/**
 * Where displayed `position` sat. `optionCount` decides the shape: two options
 * are one row (left / right); three or four are the 2×2 grid; more options keep
 * filling rows of two and have no corner name.
 */
export function positionCell(position: number, optionCount: number): GridCell {
  if (!Number.isInteger(position) || position < 1) throw new RangeError("position must be a positive integer");
  const row = Math.floor((position - 1) / GRID_COLUMNS);
  const col = (position - 1) % GRID_COLUMNS;
  if (optionCount === 2 && position <= 2) return { row, col, name: col === 0 ? "left" : "right" };
  if (optionCount <= 4 && position <= 4) {
    const names: CellName[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
    return { row, col, name: names[position - 1] };
  }
  return { row, col, name: null };
}

/** "A1.4 · bottom-right" — the readable form used in tooltips. */
export function describeOption(label: string, position: number, optionCount: number): string {
  const { name } = positionCell(position, optionCount);
  return name ? `${optionLabel(label, position)} · ${name}` : optionLabel(label, position);
}
