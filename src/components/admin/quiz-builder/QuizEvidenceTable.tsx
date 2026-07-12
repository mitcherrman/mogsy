import type { QuizBuilderEvidenceRow } from "@/lib/quiz/api";

/**
 * Render the backend evidence snapshot as a table. Columns are derived from
 * the union of keys across rows (champion first). Wrapped in an
 * overflow-x-auto container so wide tables scroll instead of breaking the
 * card layout on mobile.
 */
export function QuizEvidenceTable({ evidence }: { evidence: QuizBuilderEvidenceRow[] }) {
  if (!evidence || evidence.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No evidence rows.</p>;
  }

  const columns = Array.from(
    evidence.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set()),
  ).sort((a, b) => (a === "champion" ? -1 : b === "champion" ? 1 : a.localeCompare(b)));

  const formatCell = (value: string | number | null): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "number" && !Number.isInteger(value)) return value.toFixed(4);
    return String(value);
  };

  return (
    <div className="overflow-x-auto rounded-md border border-border/50">
      <table className="w-full min-w-[320px] border-collapse text-[11px]">
        <caption className="sr-only">Evidence statistics for this candidate</caption>
        <thead>
          <tr className="bg-muted/40 text-left">
            {columns.map((col) => (
              <th key={col} scope="col" className="whitespace-nowrap px-2 py-1 font-semibold text-muted-foreground">
                {col.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {evidence.map((row, i) => (
            <tr key={i} className="border-t border-border/30">
              {columns.map((col) => (
                <td key={col} className="whitespace-nowrap px-2 py-1 text-foreground/80">
                  {formatCell(row[col] ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
