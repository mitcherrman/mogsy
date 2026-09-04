// The one renderer for every mechanics study table.
//
// It is entirely data-driven: layout, headers, units, grouping and the row
// filter all come from the payload (see lib/mechanics-tables/render-model).
// There is no per-table branch anywhere in this file, and no mechanics value
// is stated, derived or corrected here — cells are the backend's own strings.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StudyColumn, StudyRow, StudyTable } from "@/lib/mechanics-tables/api";
import {
  EMPTY_CELL,
  buildStudyTableModel,
  filterRows,
  renderCell,
  unitHeaderLabel,
  type RenderedSection,
  type StudyTableModel,
} from "@/lib/mechanics-tables/render-model";

const GOLD = "#c9a84c";

/** Sticky/opaque surface for the frozen label column. An inline colour, not a
 *  utility class: the frozen cell has to match the panel exactly at every
 *  theme value, and a translucent utility would let rows show through it. */
const SURFACE = "hsl(var(--card))";

/** Above this many characters a text cell is treated as prose: it gets room
 *  to wrap instead of being held on one line. */
const PROSE_CELL_CHARS = 48;

// ---------------------------------------------------------------------------
// Verified-through badge
// ---------------------------------------------------------------------------

/**
 * The patch the authority behind this table is certified through. Rendered
 * verbatim: it is deliberately NOT described as "current", because the
 * backend certifies through a patch, not up to today.
 */
export function VerifiedThroughBadge({
  patch,
  className,
}: {
  patch: string;
  className?: string;
}) {
  if (!patch) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        "border-[#c9a84c]/30 bg-[#c9a84c]/5 text-[#c9a84c]",
        className,
      )}
    >
      <ShieldCheck className="h-3 w-3" aria-hidden />
      Verified through patch {patch}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Horizontal overflow affordance
// ---------------------------------------------------------------------------

/** Tracks whether a scroll container overflows, and which edge it rests on. */
function useHorizontalOverflow<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState({ overflowing: false, atEnd: true });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const overflowing = node.scrollWidth - node.clientWidth > 2;
      const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 2;
      setState((previous) =>
        previous.overflowing === overflowing && previous.atEnd === atEnd
          ? previous
          : { overflowing, atEnd },
      );
    };
    measure();
    node.addEventListener("scroll", measure, { passive: true });
    // ResizeObserver is absent in some test environments; the listener below
    // keeps the affordance correct without it.
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      node.removeEventListener("scroll", measure);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return { ref, ...state };
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function Cell({ row, column }: { row: StudyRow; column: StudyColumn }) {
  const cell = renderCell(row.values[column.key], column);
  if (!cell.present) {
    return (
      <td className="px-3 py-2 text-center align-middle text-muted-foreground/50">
        <span aria-hidden>{EMPTY_CELL}</span>
        <span className="sr-only">Not applicable</span>
      </td>
    );
  }
  // Prose needs room to wrap; a short label ("30 seconds") does not, and
  // giving it a prose minimum stretches the whole table across the page.
  const prose = cell.text.length > PROSE_CELL_CHARS;
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle text-foreground",
        cell.numeric
          ? "whitespace-nowrap text-right tabular-nums"
          : prose
            ? "min-w-[16rem] leading-snug"
            : "whitespace-nowrap",
      )}
    >
      {cell.text}
    </td>
  );
}

function ColumnHeader({ column }: { column: StudyColumn }) {
  const unit = unitHeaderLabel(column.unit);
  const numeric = column.kind === "number" || column.kind === "time";
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 align-bottom text-[11px] font-bold uppercase tracking-wider text-muted-foreground",
        numeric ? "text-right" : "text-left",
      )}
    >
      <span className="block leading-tight text-foreground/80">{column.label}</span>
      {unit && (
        <span className="mt-0.5 block text-[10px] font-semibold normal-case tracking-normal text-muted-foreground/70">
          {unit}
        </span>
      )}
    </th>
  );
}

// ---------------------------------------------------------------------------
// Table layout
// ---------------------------------------------------------------------------

function SectionHeadingRow({
  section,
  span,
}: {
  section: RenderedSection;
  span: number;
}) {
  if (!section.label) return null;
  return (
    <tr>
      <th
        scope="colgroup"
        colSpan={span}
        className="border-y border-[#c9a84c]/15 bg-[#c9a84c]/[0.04] px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-widest"
        style={{ color: GOLD }}
      >
        {section.label}
        {section.note && (
          <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
            {section.note}
          </span>
        )}
      </th>
    </tr>
  );
}

function TableLayout({ table, model }: { table: StudyTable; model: StudyTableModel }) {
  const { ref, overflowing, atEnd } = useHorizontalOverflow<HTMLDivElement>();
  const span = model.dataColumns.length + 1;
  return (
    <div className="relative">
      <div
        ref={ref}
        // Focusable so a keyboard-only reader can scroll a wide table; the
        // region label is what a screen reader announces on entering it.
        tabIndex={0}
        role="region"
        aria-label={`${table.title} table, scrollable`}
        className="overflow-x-auto rounded-lg border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            {table.title}
            {table.subtitle ? `. ${table.subtitle}` : ""}
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="sticky left-0 z-20 px-3 py-2 text-left align-bottom text-[11px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: SURFACE }}
              >
                {model.labelColumn ? (
                  <span className="block leading-tight text-foreground/80">
                    {model.labelColumn.label}
                  </span>
                ) : (
                  <span className="sr-only">Row</span>
                )}
              </th>
              {model.dataColumns.map((column) => (
                <ColumnHeader key={column.key} column={column} />
              ))}
            </tr>
          </thead>
          {model.sections.map((section) => (
            <tbody key={section.key || "__ungrouped"}>
              <SectionHeadingRow section={section} span={span} />
              {section.rows.map((row) => (
                <tr key={row.row_id} className="border-b border-border/40 last:border-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 min-w-[7.5rem] max-w-[16rem] px-3 py-2 text-left align-middle text-[13px] font-semibold leading-snug text-foreground"
                    style={{ backgroundColor: SURFACE }}
                  >
                    {row.label}
                    {row.note && (
                      <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                        {row.note}
                      </span>
                    )}
                  </th>
                  {model.dataColumns.map((column) => (
                    <Cell key={column.key} row={row} column={column} />
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {overflowing && !atEnd && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-lg bg-gradient-to-l from-background/90 to-transparent"
        />
      )}
      {overflowing && (
        <p className="mt-1.5 text-[11px] text-muted-foreground md:hidden">
          Scroll sideways to see every column.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List layout — one prose column reads as a rules sheet, not a 1×N grid
// ---------------------------------------------------------------------------

function ListLayout({ model }: { model: StudyTableModel }) {
  const column = model.dataColumns[0];
  return (
    <div className="space-y-5">
      {model.sections.map((section) => (
        <div key={section.key || "__ungrouped"}>
          {section.label && (
            <h4
              className="mb-2 text-[11px] font-bold uppercase tracking-widest"
              style={{ color: GOLD }}
            >
              {section.label}
              {section.note && (
                <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
                  {section.note}
                </span>
              )}
            </h4>
          )}
          <dl className="divide-y divide-border/40 rounded-lg border border-border/60">
            {section.rows.map((row) => {
              const cell = renderCell(row.values[column.key], column);
              return (
                <div
                  key={row.row_id}
                  className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(9rem,15rem)_1fr] sm:gap-4"
                >
                  <dt className="text-[13px] font-semibold leading-snug text-foreground">
                    {row.label}
                  </dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">
                    {cell.present ? (
                      cell.text
                    ) : (
                      <>
                        <span aria-hidden>{EMPTY_CELL}</span>
                        <span className="sr-only">Not applicable</span>
                      </>
                    )}
                    {row.note && (
                      <span className="mt-1 block text-[12px] text-muted-foreground/80">
                        {row.note}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The table view
// ---------------------------------------------------------------------------

export interface StudyTableViewProps {
  table: StudyTable;
  /** Heading level for the table title, so the page keeps one heading order. */
  headingLevel?: 2 | 3;
  /** Suppress the per-table verified badge when the page already shows one. */
  showVerifiedBadge?: boolean;
  className?: string;
}

export default function StudyTableView({
  table,
  headingLevel = 3,
  showVerifiedBadge = true,
  className,
}: StudyTableViewProps) {
  const [query, setQuery] = useState("");
  const filterId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";

  const visibleRows = useMemo(() => filterRows(table.rows, query), [table.rows, query]);
  const model = useMemo(() => buildStudyTableModel(table, visibleRows), [table, visibleRows]);

  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-4 md:p-5", className)}
      aria-labelledby={`${filterId}-title`}
      data-testid="study-table"
      data-table-id={table.table_id}
      data-layout={model.layout}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Heading
            id={`${filterId}-title`}
            className="text-base font-bold leading-tight text-foreground md:text-lg"
          >
            {table.title}
          </Heading>
          {table.subtitle && (
            <p className="mt-1 max-w-2xl text-[13px] leading-snug text-muted-foreground">
              {table.subtitle}
            </p>
          )}
        </div>
        {showVerifiedBadge && <VerifiedThroughBadge patch={table.verified_through} />}
      </div>

      {model.filterable && (
        <div className="mb-3">
          <label htmlFor={filterId} className="sr-only">
            Filter {table.title} rows
          </label>
          <div className="relative max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={filterId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Filter ${table.rows.length} rows…`}
              className="h-8 pl-8 text-sm"
              type="search"
            />
          </div>
        </div>
      )}

      {table.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
          This table has no published rows yet.
        </p>
      ) : visibleRows.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground"
        >
          No rows match “{query}”.
        </p>
      ) : model.layout === "list" ? (
        <ListLayout model={model} />
      ) : (
        <TableLayout table={table} model={model} />
      )}

      {model.filterable && visibleRows.length > 0 && query.trim() !== "" && (
        <p className="mt-2 text-[11px] text-muted-foreground" role="status">
          Showing {visibleRows.length} of {table.rows.length} rows.
        </p>
      )}

      {table.notes.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-border/50 pt-3 text-[12px] leading-relaxed text-muted-foreground">
          {table.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden style={{ color: GOLD }}>
                •
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
