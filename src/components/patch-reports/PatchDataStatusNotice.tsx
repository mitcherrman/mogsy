import { ChevronRight } from "lucide-react";
import type { PatchReconciliation } from "@/lib/patch-reports/api";
import { summarizeReconciliation } from "@/lib/patch-reports/mogzy-status";
import { cn } from "@/lib/utils";

/**
 * States plainly whether Mogzy's gameplay data has absorbed this patch.
 *
 * A patch report reads as an authoritative account of the patch, and the line
 * beside it — "Report built <date>" — reads as the date Mogzy became current.
 * They are different claims. Publishing the report is `promote-report`;
 * updating what Combat Lab, Champion Card Duel and the quiz banks COMPUTE is
 * `reconcile-knowledge`, a later step that can hold changes or fail outright.
 *
 * V26.18 is why this exists: the report published normally and the
 * reconciliation six seconds later failed, leaving two champions on their
 * pre-patch values and one on a progression League has never had. Nothing on
 * this page said so.
 *
 * Absent (an older backend, or a report predating the reconciliation lane) is
 * rendered exactly like PUBLISHED_NOT_RECONCILED rather than hidden: "we have
 * no record of a reconciliation" and "the reconciliation is fine" must never
 * look the same.
 *
 * PHSR1 layers it for a player: a plain headline and sentence first (Riot's
 * notes are complete; this is about Mogzy's own data), then counts against the
 * changes the update actually acted on — never against the report's line
 * count, which the reconciliation does not share — and the exact terminal
 * states, operation and backend wording under Technical details.
 */

const TONE: Record<string, { border: string; text: string }> = {
  RECONCILED: { border: "border-emerald-600/40", text: "text-emerald-500" },
  RECONCILED_WITH_HELDS: { border: "border-amber-600/40", text: "text-amber-500" },
  RECONCILIATION_FAILED: { border: "border-red-600/40", text: "text-red-500" },
  PUBLISHED_NOT_RECONCILED: { border: "border-muted", text: "text-muted-foreground" },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PatchDataStatusNotice({
  reconciliation,
}: {
  reconciliation?: PatchReconciliation;
}) {
  const summary = summarizeReconciliation(reconciliation);
  const tone = TONE[summary.status] ?? TONE.PUBLISHED_NOT_RECONCILED;
  const breakdown = [
    `${summary.updated} now up to date in Mogzy`,
    summary.notModeled > 0 && `${summary.notModeled} not modeled by Mogzy yet`,
    summary.needsReview > 0 && `${summary.needsReview} need${summary.needsReview === 1 ? "s" : ""} a Mogzy review`,
    summary.failed > 0 && `${summary.failed} couldn't be processed`,
  ].filter(Boolean) as string[];

  return (
    <aside
      className={`mb-6 rounded-md border ${tone.border} bg-card/40 px-4 py-3 text-sm`}
      data-testid="patch-data-status"
      data-status={summary.status}
      aria-labelledby="patch-data-status-title"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Mogzy data status
      </p>
      <p id="patch-data-status-title" className={`mt-0.5 font-medium ${tone.text}`}>
        {summary.headline}
      </p>
      <p className="mt-1 text-muted-foreground" data-testid="patch-data-status-body">
        {summary.body} This describes Mogzy&apos;s own data — it never changes or disputes
        Riot&apos;s notes.
      </p>

      {summary.recorded && (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground" data-testid="patch-data-status-counts">
          {summary.checked > 0 ? (
            <p>
              Of the {plural(summary.checked, "gameplay-number change", "gameplay-number changes")}{" "}
              Mogzy&apos;s data update checked: {breakdown.join(" · ")}.
            </p>
          ) : (
            <p>Mogzy&apos;s data update found no gameplay numbers it needed to change.</p>
          )}
          {summary.nothingToUpdate > 0 && (
            <p>
              {plural(summary.nothingToUpdate, "other note", "other notes")} — wording-only changes,
              bug fixes, announcements and mode-specific changes — had nothing for Mogzy to update.
            </p>
          )}
          <p>
            Mogzy notes on individual changes were recorded when this report was built, before
            this update ran.
          </p>
        </div>
      )}

      <details className="mt-2 text-xs text-muted-foreground" data-testid="patch-data-status-technical">
        <summary
          className={cn(
            "inline-flex min-h-8 cursor-pointer select-none list-none items-center gap-1 rounded py-1 pr-1",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60",
            "[&::-webkit-details-marker]:hidden",
          )}
        >
          <ChevronRight
            aria-hidden
            className="h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none [details[open]>summary>&]:rotate-90"
          />
          Technical details
        </summary>
        <div className="ml-4 space-y-2 border-l border-border pl-3 text-[11px]">
          <p>
            Reconciliation status: <code className="font-mono text-foreground/80">{summary.status}</code>
            {reconciliation?.operation_id && (
              <>
                {" · "}operation <code className="font-mono text-foreground/80">{reconciliation.operation_id}</code>
              </>
            )}
          </p>
          {reconciliation?.meaning && <p>Pipeline note: {reconciliation.meaning}</p>}
          {summary.technical.length > 0 ? (
            <>
              <ul className="space-y-1" aria-label="Changes by reconciliation state">
                {summary.technical.map((row) => (
                  <li key={row.key} data-testid="patch-data-status-state" data-state={row.key}>
                    <code className="break-all font-mono text-foreground/80">{row.key}</code>{" "}
                    <span className="font-mono tabular-nums text-foreground/80">{row.count}</span>
                    {row.meaning && <span> — {row.meaning}</span>}
                  </li>
                ))}
              </ul>
              <p>
                The update counts {summary.total} items in its own units — a line with two numbers,
                such as a base stat with per-level growth, counts twice — so its total can differ from
                the number of changes listed in the report.
              </p>
            </>
          ) : (
            <p>No per-change reconciliation record exists for this patch.</p>
          )}
        </div>
      </details>
    </aside>
  );
}
