import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { DeckEntityCard } from "@/lib/patch-deck/deck";
import { earlierVersions, entityHistory } from "@/lib/patch-deck/history";
import { fetchPatchReport, type PatchReportDetail } from "@/lib/patch-reports/api";
import { hasExactValues, usableHistoricalContext } from "@/lib/patch-reports/report-structure";
import { patchReportHref } from "@/components/patch-catchup/route";
import { HistoricalContext } from "@/components/patch-reports/HistoricalContext";
import { DirectionLabel, FaceLabel, Values } from "../shared";

/**
 * Patch history from the Patch Hub's own archive. The face reads earlier
 * reports through the same query keys the Patch Report page and the Impact
 * loader use (`["patch-report", version]`), so anything already cached costs
 * nothing and nothing is fetched until this face is open.
 *
 * Two sources, both supported data:
 *   1. The backend's own historical-context analysis on the current lines
 *      (reverts, returns to a previous value), when it exists.
 *   2. The entity's own entries in earlier published reports.
 */
export const HistoryFace = ({
  card,
  patchVersion,
  versions,
  active,
}: {
  card: DeckEntityCard;
  patchVersion: string;
  /** Every version the Patch Hub lists. */
  versions: readonly string[];
  active: boolean;
}) => {
  const earlier = useMemo(() => earlierVersions(versions, patchVersion), [versions, patchVersion]);
  const queries = useQueries({
    queries: earlier.map((version) => ({
      queryKey: ["patch-report", version] as const,
      queryFn: () => fetchPatchReport(version),
      enabled: active,
      staleTime: 30 * 60 * 1000,
    })),
  });
  const loaded = queries.filter((q) => q.data).map((q) => q.data as PatchReportDetail);
  const failed = queries.filter((q) => q.isError).length;
  const pending = queries.filter((q) => q.isPending && !q.isError).length;
  const entries = useMemo(() => entityHistory(card.entity.card, loaded, patchVersion), [card, loaded, patchVersion]);
  const analyzed = card.entity.groups.flatMap((g) => g.changes.filter((n) => usableHistoricalContext(n.change)));
  const oldest = earlier[earlier.length - 1];
  const name = card.entity.card.entity_name;

  return (
    <div className="space-y-5" data-testid="deck-face-history">
      {analyzed.length > 0 && (
        <section className="space-y-2">
          <FaceLabel>Riot&apos;s history, verified by Mogzy</FaceLabel>
          <ul className="space-y-2">
            {analyzed.map((node) => (
              <li key={node.anchor}>
                <p className="text-sm font-semibold">{node.change.property_name}</p>
                <HistoricalContext context={usableHistoricalContext(node.change)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <FaceLabel>
          Earlier patches · archive {oldest ? `${oldest}–` : ""}
          {patchVersion}
        </FaceLabel>

        {earlier.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--dk-ink-3)" }}>
            This is the earliest patch in the Patch Hub archive, so there is nothing before it to show.
          </p>
        ) : pending > 0 && entries.length === 0 ? (
          <div className="space-y-2" aria-busy="true" data-testid="deck-history-loading">
            <div className="dk-skeleton h-5 w-1/3" />
            <div className="dk-skeleton h-3 w-full" />
            <div className="dk-skeleton h-3 w-5/6" />
            <p className="text-[0.75rem]" style={{ color: "var(--dk-ink-3)" }}>
              Reading {earlier.length - pending} of {earlier.length} earlier reports…
            </p>
          </div>
        ) : entries.length === 0 ? (
          <div className="dk-tile dk-tile--muted text-sm leading-relaxed" style={{ color: "var(--dk-ink-2)" }} data-testid="deck-history-none">
            {pending === 0 && failed === 0 ? (
              <p>
                {name} appears in no earlier report in the archive{oldest ? ` (${oldest} onward)` : ""}. Patch {patchVersion} is the
                first time this entry has changed since Mogzy began recording patches.
              </p>
            ) : (
              <p>
                No earlier entry found yet{pending > 0 ? ` (${pending} report${pending === 1 ? "" : "s"} still loading)` : ""}
                {failed > 0 ? `; ${failed} report${failed === 1 ? "" : "s"} could not be read` : ""}.
              </p>
            )}
          </div>
        ) : (
          <ol className="relative space-y-4 border-l pl-5" style={{ borderColor: "var(--dk-line-2)" }} data-testid="deck-history-list">
            {entries.map((entry) => (
              <li key={`${entry.patchVersion}-${entry.entity.anchor}`} className="relative" data-testid="deck-history-entry">
                <span
                  aria-hidden
                  className="absolute -left-[1.55rem] top-1.5 h-2.5 w-2.5 rounded-full"
                  style={{ background: "var(--dk-gold)", boxShadow: "0 0 0 3px var(--dk-panel)" }}
                />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a
                    href={patchReportHref(entry.patchVersion, entry.entity.anchor)}
                    className="dk-display text-lg"
                    style={{ color: "var(--dk-gold-2)" }}
                    title={`Open ${name} in the Patch ${entry.patchVersion} report`}
                  >
                    {entry.patchVersion}
                  </a>
                  <DirectionLabel editorial={entry.entity.editorial} />
                </div>
                {entry.entity.context && (
                  <p className="mt-1 text-[0.8125rem] leading-relaxed dk-wrap" style={{ color: "var(--dk-ink-3)", fontFamily: "Lora, Georgia, serif" }}>
                    {entry.entity.context}
                  </p>
                )}
                <ul className="mt-2 space-y-1.5">
                  {entry.entity.groups.flatMap((group) =>
                    group.changes.map((node) => (
                      <li key={node.anchor} className="grid gap-x-3 gap-y-0.5 text-[0.8125rem] sm:grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)]">
                        <span className="dk-wrap" style={{ color: "var(--dk-ink-2)" }}>
                          {group.slot && <span className="dk-group__slot mr-1.5 text-[0.75rem]">{group.slot}</span>}
                          {(node.change.property_name || group.name || group.title).trim()}
                        </span>
                        {hasExactValues(node.change) ? (
                          <Values before={node.change.before_raw?.trim() || null} after={node.change.after_raw?.trim() || null} isNew={node.change.is_new} />
                        ) : (
                          <span className="dk-wrap" style={{ color: "var(--dk-ink-3)" }}>
                            {(node.change.detail_text || "").trim() || "No exact values published."}
                          </span>
                        )}
                      </li>
                    )),
                  )}
                </ul>
              </li>
            ))}
            {pending > 0 && (
              <li className="text-[0.75rem]" style={{ color: "var(--dk-ink-4)" }}>
                Still reading {pending} earlier report{pending === 1 ? "" : "s"}…
              </li>
            )}
          </ol>
        )}
      </section>
    </div>
  );
};
