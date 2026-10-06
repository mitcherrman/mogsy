import { cn } from "@/lib/utils";
import type { CoverageNotice } from "./presentation";

/**
 * Neutral coverage banner (owner decision 11). Names the patches that did not
 * load; never implies "nothing changed"; the Riot lines that did load render
 * below it unchanged. Retry is the loader's retry() (only failed resources).
 */
export const PatchCatchUpCoverageNotice = ({
  notices,
  canRetry,
  retrying,
  onRetry,
}: {
  notices: CoverageNotice[];
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
}) => {
  if (notices.length === 0) return null;
  return (
    <div role="status" data-testid="catchup-coverage" className="mb-5 space-y-2">
      {notices.map((notice, i) => (
        <div
          key={`${notice.kind}-${i}`}
          data-kind={notice.kind}
          className={cn(
            "flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm",
            notice.tone === "warning"
              ? "border-amber-600/40 bg-amber-500/5"
              : "border-border bg-card/60 text-muted-foreground",
          )}
        >
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <p className={cn("font-semibold", notice.tone === "warning" && "text-amber-500")}>{notice.title}</p>
            {notice.body && <p className="mt-0.5 text-muted-foreground">{notice.body}</p>}
          </div>
          {notice.retry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={!canRetry}
              className="min-h-9 shrink-0 rounded-md border border-[#c9a84c]/50 px-3 text-sm font-semibold text-[#d8bd70] hover:bg-[#c9a84c]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
