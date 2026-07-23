/**
 * Recent Ranked results for the signed-in account (lobby widget, F2.1).
 *
 * Read-only and best-effort: fetches once on mount via the account-bound
 * history endpoint and renders nothing on failure or an empty history, so
 * the lobby never blocks on it. Displays only reveal-safe terminal data the
 * backend projects (outcome from the viewer's perspective, opponent display
 * name/class/bot flag) — no account ids exist in the contract.
 */
import { useEffect, useState } from "react";
import { getMatchHistory } from "@/lib/ranked-public/client";
import type { MatchHistoryEntryView } from "@/lib/ranked-public/contracts";

const OUTCOME_STYLE: Record<MatchHistoryEntryView["viewerOutcome"], { label: string; className: string }> = {
  win: { label: "Victory", className: "text-[#e8c97a]" },
  loss: { label: "Defeat", className: "text-destructive" },
  draw: { label: "Draw", className: "text-muted-foreground" },
};

function classLabel(classId: string): string {
  return classId ? classId.charAt(0).toUpperCase() + classId.slice(1) : classId;
}

function opponentLabel(entry: MatchHistoryEntryView): string {
  if (entry.opponentIsBot) return "Bot";
  return entry.opponentDisplayName ?? "Opponent";
}

export function RankedMatchHistory({ limit = 5 }: { limit?: number }) {
  const [entries, setEntries] = useState<MatchHistoryEntryView[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const history = await getMatchHistory(limit, controller.signal);
        if (!cancelled) setEntries(history.entries);
      } catch {
        /* best-effort widget — absent on any failure */
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [limit]);

  if (!entries || entries.length === 0) return null;

  return (
    <section data-testid="ranked-match-history" className="ranked-subpanel p-3 space-y-2">
      <div className="ranked-eyebrow ranked-eyebrow--cyan">Recent matches</div>
      <ul className="space-y-1.5">
        {entries.map((entry) => {
          const outcome = OUTCOME_STYLE[entry.viewerOutcome];
          return (
            <li key={entry.matchId} data-testid="ranked-history-entry"
              className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs">
              <span className={`font-semibold ${outcome.className}`}>{outcome.label}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {classLabel(entry.viewerClass)} vs {opponentLabel(entry)} ({classLabel(entry.opponentClass)})
              </span>
              <span className="shrink-0 text-muted-foreground">
                {entry.terminalReason === "forfeit"
                  ? "Forfeit"
                  : entry.terminalReason === "no_contest"
                    ? "No contest"
                    : `R${entry.finalRoundNumber}`}
              </span>
              {entry.ratingDelta !== null && (
                <span data-testid="ranked-history-rating-delta"
                  className={`shrink-0 font-semibold ${
                    entry.ratingDelta > 0
                      ? "text-[#e8c97a]"
                      : entry.ratingDelta < 0
                        ? "text-destructive"
                        : "text-muted-foreground"}`}>
                  {entry.ratingDelta > 0 ? `+${entry.ratingDelta}` : `${entry.ratingDelta}`}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
