// Typed client for the mechanics STUDY TABLE API
// (GET /api/mechanics/tables, GET /api/mechanics/tables/study/{table_id}).
//
// This is the player-facing reference surface over Mogzy's canonical
// mechanics authority. The chain is:
//
//   league_mechanics manifests        (the only place a value is asserted)
//     -> CanonicalTable / CanonicalFact  (machine-readable projection)
//     -> StudyTable / StudyRow           (player-facing projection)
//     -> THIS CLIENT                     (transport + types only)
//
// Nothing in this module — or anywhere under src/lib/mechanics-tables and
// src/components/mechanics-tables — may state, derive or correct a mechanics
// value. Every number a player sees is rendered verbatim from the payload.
// Decimals arrive as exact strings and are never coerced through a float.
//
// The canonical (`/canonical/{table_id}`) half of the backend router is
// deliberately NOT wired up here: fact ids, mechanic ids and
// implementation_allowed flags are internal review vocabulary, not player
// vocabulary.

import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

// ---------------------------------------------------------------------------
// Wire types — exactly what the backend serializes
// ---------------------------------------------------------------------------

/**
 * A cell value. The backend serializes ints as numbers and everything else
 * (including every Decimal) as an exact string. A cell may be absent from a
 * row entirely — study tables are legitimately sparse.
 */
export type StudyCellValue = string | number | boolean | null;

/** Presentation hint the backend attaches to a column. Open vocabulary: the
 *  renderer must fall back gracefully on a `kind` it has never seen. */
export type StudyColumnKind = "text" | "number" | "time" | (string & {});

export interface StudyColumn {
  key: string;
  label: string;
  /** "gold" | "seconds" | "percent" | "minions" | "experience" | "" — open. */
  unit: string;
  kind: StudyColumnKind;
}

export interface StudySection {
  key: string;
  label: string;
  note: string;
}

export interface StudyRow {
  row_id: string;
  label: string;
  /** "" when the table has no sections, or the row sits outside them. */
  section: string;
  values: Record<string, StudyCellValue>;
  /** Internal canonical-fact ids. Never rendered to players. */
  fact_ids: string[];
  note?: string;
}

export interface StudyTable {
  table_id: string;
  category: string;
  title: string;
  subtitle: string;
  patch: string;
  verified_through: string;
  /** Internal canonical table ids this view derives from. Not player copy. */
  source_table_ids: string[];
  columns: StudyColumn[];
  sections: StudySection[];
  rows: StudyRow[];
  notes: string[];
}

/** One study table as the index lists it — no rows, so the index stays small. */
export interface StudyTableRef {
  table_id: string;
  title: string;
  subtitle: string;
  row_count: number;
}

export interface TablesIndexCategory {
  category: string;
  study_tables: StudyTableRef[];
}

export interface TablesIndex {
  patch: string;
  categories: TablesIndexCategory[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MechanicsTablesApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MechanicsTablesApiError";
    this.status = status;
  }
}

/** FastAPI's `detail` is either a string, our own `{error, message}` object,
 *  or a validation-error array. Flatten whichever arrived into one message. */
function detailToError(detail: unknown, status: number): MechanicsTablesApiError {
  if (typeof detail === "string" && detail.trim() !== "") {
    return new MechanicsTablesApiError(detail, status);
  }
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") {
      return new MechanicsTablesApiError(message, status);
    }
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) =>
        entry && typeof entry === "object" && typeof (entry as { msg?: unknown }).msg === "string"
          ? (entry as { msg: string }).msg
          : null,
      )
      .filter((msg): msg is string => msg !== null);
    if (messages.length > 0) {
      return new MechanicsTablesApiError(messages.join("; "), status);
    }
  }
  return new MechanicsTablesApiError(`Request failed (${status})`, status);
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${COMBAT_API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = (await response.json())?.detail;
    } catch {
      // no JSON body — keep the status-only message
    }
    throw detailToError(detail, response.status);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------
//
// The backend contract is stable, but a study table published tomorrow may
// carry a column `kind`, a `unit` or a whole category this build has never
// seen. Normalization only fills in *structurally* missing optional fields so
// the renderer can rely on array/record shapes; it never invents, reorders or
// reinterprets a value.

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeColumn(raw: unknown): StudyColumn | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const key = asString(source.key);
  if (key === "") return null;
  return {
    key,
    label: asString(source.label, key),
    unit: asString(source.unit),
    kind: asString(source.kind, "text"),
  };
}

function normalizeSection(raw: unknown): StudySection | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const key = asString(source.key);
  if (key === "") return null;
  return { key, label: asString(source.label, key), note: asString(source.note) };
}

function normalizeCell(value: unknown): StudyCellValue | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  // Arrays and nested objects are outside the study-cell contract. Dropping
  // the cell renders it as "not applicable" rather than "[object Object]".
  return undefined;
}

function normalizeRow(raw: unknown, index: number): StudyRow | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const values: Record<string, StudyCellValue> = {};
  const rawValues = source.values;
  if (rawValues && typeof rawValues === "object" && !Array.isArray(rawValues)) {
    for (const [key, value] of Object.entries(rawValues as Record<string, unknown>)) {
      const cell = normalizeCell(value);
      if (cell !== undefined) values[key] = cell;
    }
  }
  const note = asString(source.note);
  return {
    row_id: asString(source.row_id, `row-${index}`),
    label: asString(source.label),
    section: asString(source.section),
    values,
    fact_ids: asArray<unknown>(source.fact_ids).filter(
      (id): id is string => typeof id === "string",
    ),
    ...(note ? { note } : {}),
  };
}

/** Shape an arbitrary payload into a StudyTable the renderer can trust. */
export function normalizeStudyTable(raw: unknown): StudyTable {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    table_id: asString(source.table_id),
    category: asString(source.category),
    title: asString(source.title),
    subtitle: asString(source.subtitle),
    patch: asString(source.patch),
    verified_through: asString(source.verified_through),
    source_table_ids: asArray<unknown>(source.source_table_ids).filter(
      (id): id is string => typeof id === "string",
    ),
    columns: asArray<unknown>(source.columns)
      .map(normalizeColumn)
      .filter((column): column is StudyColumn => column !== null),
    sections: asArray<unknown>(source.sections)
      .map(normalizeSection)
      .filter((section): section is StudySection => section !== null),
    rows: asArray<unknown>(source.rows)
      .map(normalizeRow)
      .filter((row): row is StudyRow => row !== null),
    notes: asArray<unknown>(source.notes).filter((note): note is string => typeof note === "string"),
  };
}

/** Shape an arbitrary payload into a TablesIndex. Categories the frontend has
 *  no presentation entry for still survive here — the landing page renders
 *  them with a derived label rather than hiding published data. */
export function normalizeTablesIndex(raw: unknown): TablesIndex {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const categories = asArray<unknown>(source.categories)
    .map((entry): TablesIndexCategory | null => {
      if (!entry || typeof entry !== "object") return null;
      const category = entry as Record<string, unknown>;
      const id = asString(category.category);
      if (id === "") return null;
      const tables = asArray<unknown>(category.study_tables)
        .map((tableRaw): StudyTableRef | null => {
          if (!tableRaw || typeof tableRaw !== "object") return null;
          const table = tableRaw as Record<string, unknown>;
          const tableId = asString(table.table_id);
          if (tableId === "") return null;
          return {
            table_id: tableId,
            title: asString(table.title, tableId),
            subtitle: asString(table.subtitle),
            row_count: typeof table.row_count === "number" ? table.row_count : 0,
          };
        })
        .filter((table): table is StudyTableRef => table !== null);
      return { category: id, study_tables: tables };
    })
    .filter((category): category is TablesIndexCategory => category !== null)
    // A category with no published study table is review-only; it has nothing
    // a player can open, so it never reaches the navigation.
    .filter((category) => category.study_tables.length > 0);
  return { patch: asString(source.patch), categories };
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const BASE = "/api/mechanics/tables";

/** Every published category and the study tables inside it (no rows). */
export async function fetchTablesIndex(): Promise<TablesIndex> {
  return normalizeTablesIndex(await request<unknown>(BASE));
}

/** One study table, rows and all. */
export async function fetchStudyTable(tableId: string): Promise<StudyTable> {
  return normalizeStudyTable(
    await request<unknown>(`${BASE}/study/${encodeURIComponent(tableId)}`),
  );
}

// ---------------------------------------------------------------------------
// React Query keys — one place, so a stale key can never split the cache
// ---------------------------------------------------------------------------

export const mechanicsTablesKeys = {
  index: ["mechanics-tables", "index"] as const,
  study: (tableId: string) => ["mechanics-tables", "study", tableId] as const,
};
