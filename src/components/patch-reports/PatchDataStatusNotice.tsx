import type { PatchReconciliation } from "@/lib/patch-reports/api";

/**
 * States plainly whether Mogzy's gameplay data has absorbed this patch.
 *
 * A patch report reads as an authoritative account of the patch, and the line
 * beside it — "Report built <date>" — reads as the date Mogzy became current.
 * They are different claims. Publishing the report is `promote-report`;
 * updating what Combat Lab, Stat Check and the quiz banks COMPUTE is
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
 */

const TONE: Record<string, { border: string; text: string; label: string }> = {
  RECONCILED: {
    border: "border-emerald-600/40",
    text: "text-emerald-500",
    label: "Gameplay data current",
  },
  RECONCILED_WITH_HELDS: {
    border: "border-amber-600/40",
    text: "text-amber-500",
    label: "Gameplay data partly current",
  },
  RECONCILIATION_FAILED: {
    border: "border-red-600/40",
    text: "text-red-500",
    label: "Gameplay data not reconciled",
  },
  PUBLISHED_NOT_RECONCILED: {
    border: "border-muted",
    text: "text-muted-foreground",
    label: "Gameplay data not reconciled",
  },
};

const HELD_LABELS: Array<[string, string]> = [
  ["HELD_RUNTIME_WORK", "held — Mogzy cannot model yet"],
  ["HELD_AUTHORITY", "held — needs a decision"],
  ["FAILED", "failed"],
];

export function PatchDataStatusNotice({
  reconciliation,
}: {
  reconciliation?: PatchReconciliation;
}) {
  const status = reconciliation?.status ?? "PUBLISHED_NOT_RECONCILED";
  const tone = TONE[status] ?? TONE.PUBLISHED_NOT_RECONCILED;
  const meaning =
    reconciliation?.meaning ??
    "This report describes what Riot published. Mogzy's gameplay data has not " +
      "been reconciled against it, so canonical values may still be from the " +
      "previous patch.";
  const counts = reconciliation?.changes_by_terminal_state ?? {};
  const applied =
    (counts.AUTO_APPLIED ?? 0) + (counts.AUTO_APPLIED_REVIEW ?? 0);
  const held = HELD_LABELS.map(([key, label]) => [counts[key] ?? 0, label] as const)
    .filter(([n]) => n > 0);

  return (
    <aside
      className={`mb-6 rounded-md border ${tone.border} bg-card/40 px-4 py-3 text-sm`}
      data-testid="patch-data-status"
      data-status={status}
    >
      <p className={`font-medium ${tone.text}`}>{tone.label}</p>
      <p className="mt-1 text-muted-foreground">{meaning}</p>
      {reconciliation?.reconciliation_recorded && (
        <p className="mt-2 text-xs text-muted-foreground">
          {applied} change{applied === 1 ? "" : "s"} applied to Mogzy&apos;s
          canonical data
          {held.length > 0 && (
            <>
              {" · "}
              {held.map(([n, label], index) => (
                <span key={label}>
                  {index > 0 && ", "}
                  {n} {label}
                </span>
              ))}
            </>
          )}
        </p>
      )}
    </aside>
  );
}
