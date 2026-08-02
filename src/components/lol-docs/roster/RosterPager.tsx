/**
 * Page-number pagination for the roster directories. The backend paginates
 * with page / page_size and reports total_pages, so this mirrors that contract
 * exactly rather than inventing cursors it does not support.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RosterPagination } from "@/lib/league-docs/roster-api";

const nf = new Intl.NumberFormat("en-US");

export default function RosterPager({
  pagination,
  onPageChange,
  label,
}: {
  pagination: RosterPagination;
  onPageChange: (page: number) => void;
  /** e.g. "players" — used in the live status text. */
  label: string;
}) {
  const { page, total, total_pages: totalPages } = pagination;
  if (total === 0) return null;
  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 p-3"
      aria-label={`${label} pagination`}
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Page <span className="font-semibold text-foreground">{nf.format(page)}</span> of{" "}
        {nf.format(Math.max(totalPages, 1))} · {nf.format(total)} {label}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-1" aria-hidden /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10 disabled:opacity-40"
        >
          Next <ChevronRight className="h-3.5 w-3.5 ml-1" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
