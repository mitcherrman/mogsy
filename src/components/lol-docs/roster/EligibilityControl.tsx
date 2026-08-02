/**
 * Deliberate opt-in for Level B roster records.
 *
 * Level A is the default public view. Level B rows are benign historical
 * overlaps that the backend will only return when explicitly asked for, and
 * they always arrive carrying a warning code. This control is the only way to
 * ask for them, it states what it turns on before it is used, and it never
 * silently mixes the two levels together — opted-in rows stay visually
 * distinct in the list itself.
 *
 * Level C is not offered here and is not requestable: the API rejects it.
 */
import { AlertTriangle, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { RosterEligibility } from "@/lib/league-docs/roster-api";
import { hiddenRecordsMessage } from "@/lib/league-docs/roster-display";

export default function EligibilityControl({
  eligibility,
  onChange,
  hiddenCount,
  levelBShown,
}: {
  eligibility: RosterEligibility;
  onChange: (next: RosterEligibility) => void;
  hiddenCount: number;
  /** How many Level B rows are currently in view (0 when opted out). */
  levelBShown: number;
}) {
  const showingWarnings = eligibility === "AB";
  const hidden = hiddenRecordsMessage(hiddenCount, showingWarnings);
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label
            htmlFor="roster-level-b"
            className="text-sm font-bold text-foreground cursor-pointer"
          >
            Show flagged historical records (Level B)
          </Label>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            Off by default. Level B records are real but overlap another roster entry — academy and
            main teams during the same window, event rosters, sister teams. They are published with
            the backend's warning code attached and are marked in the list below.
          </p>
        </div>
        <Switch
          id="roster-level-b"
          checked={showingWarnings}
          onCheckedChange={(checked) => onChange(checked ? "AB" : "A")}
          aria-label="Show flagged historical records (Level B)"
        />
      </div>

      {showingWarnings && levelBShown > 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Showing {levelBShown} flagged {levelBShown === 1 ? "record" : "records"}. Treat these as
            historically plausible but not independently confirmed.
          </span>
        </p>
      ) : null}

      {hidden ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#c9a84c" }} aria-hidden />
          <span>{hidden}</span>
        </p>
      ) : null}
    </div>
  );
}
