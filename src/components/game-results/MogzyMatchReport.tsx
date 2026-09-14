/**
 * THE MOGZY MATCH REPORT, rendered.
 *
 * Sentences only — `buildMatchReport` already decided which ones are true, and
 * this component's whole job is to make them look like Mogzy said them rather
 * than like a form field. It renders nothing at all for an empty report, which
 * is a normal outcome: a two-round match with one subject has nothing worth
 * reporting, and an empty panel headed "Match Report" would be worse than no
 * panel.
 */
import { MogzyMascot } from "@/components/mascot/MogzyMascot";

export function MogzyMatchReport({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <section
      aria-label="Mogzy's match report"
      data-testid="result-match-report"
      className="flex gap-3 rounded-[0.6rem] border border-[#c9a84c]/30 bg-[#f0d78c]/[0.04] px-3 py-3"
    >
      <MogzyMascot pose="base" decorative className="h-10 w-10 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="ranked-eyebrow">Mogzy's Report</p>
        {lines.map((line) => (
          <p key={line} className="text-[12.5px] leading-snug text-slate-200">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}
