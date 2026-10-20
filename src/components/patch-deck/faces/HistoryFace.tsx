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
 * Patch history as an editorial timeline. Two layers, both supported data:
 *
 *   1. The archive strip: every version the Patch Hub lists, newest first,
 *      with this entity's appearances lit. It is the one glance that says
 *      "changed in 26.18 and 26.13, untouched otherwise".
 *   2. The entries: each earlier report's card for this entity, with Riot's
 *      rationale and exact values, linking to that patch's List View anchor.
 *
 * Earlier reports are read through the same `["patch-report", v]` cache keys
 * the Patch Report page and the Impact loader use, only once this face opens.
 * An SR champion never matches its own Arena/Mayhem cards.
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
  const byVersion = new Map<string, { data?: PatchReportDetail; pending: boolean; failed: boolean }>();
  earlier.forEach((v, i) => byVersion.set(v, { data: queries[i]?.data, pending: Boolean(queries[i]?.isPending) && !queries[i]?.isError, failed: Boolean(queries[i]?.isError) }));
  const loaded = queries.filter((q) => q.data).map((q) => q.data as PatchReportDetail);
  const failed = queries.filter((q) => q.isError).length;
  const pending = queries.filter((q) => q.isPending && !q.isError).length;
  const entries = useMemo(() => entityHistory(card.entity.card, loaded, patchVersion), [card, loaded, patchVersion]);
  const hitVersions = new Set(entries.map((e) => e.patchVersion));
  const analyzed = card.entity.groups.flatMap((g) => g.changes.filter((n) => usableHistoricalContext(n.change)));
  const oldest = earlier[earlier.length - 1];
  const name = card.entity.card.entity_name;
  const entryId = (v: string) => `deck-history-${v.replace(/\./g, "-")}`;

  return (
    <div className="space-y-7" data-testid="deck-face-history">
      <section className="space-y-3">
        <FaceLabel>
          {name} across the archive{oldest ? ` · ${oldest}–${patchVersion}` : ""}
        </FaceLabel>
        {earlier.length === 0 ? (
          <p className="text-[0.9375rem]" style={{ color: "var(--dk-ink-3)" }}>
            This is the earliest patch in the Patch Hub archive, so there is nothing before it to show.
          </p>
        ) : (
          <div className="dk-strip" role="list" aria-label="Patches in the archive" data-testid="deck-history-strip">
            <div className="dk-strip__node" data-state="current" role="listitem" aria-current="true">
              <span className="dk-strip__dot" aria-hidden />
              <span className="dk-strip__v">{patchVersion}</span>
              <span className="sr-only">, this patch</span>
            </div>
            {earlier.map((v) => {
              const q = byVersion.get(v);
              const state = hitVersions.has(v) ? "hit" : q?.pending ? "pending" : q?.failed ? "failed" : "miss";
              const Tag = state === "hit" ? "button" : "div";
              return (
                <Tag
                  key={v}
                  type={state === "hit" ? "button" : undefined}
                  className="dk-strip__node"
                  data-state={state}
                  role="listitem"
                  onClick={state === "hit" ? () => document.getElementById(entryId(v))?.scrollIntoView({ block: "start", behavior: "smooth" }) : undefined}
                  aria-label={
                    state === "hit"
                      ? `${name} changed in patch ${v}; jump to that entry`
                      : state === "pending"
                        ? `Patch ${v}, still loading`
                        : state === "failed"
                          ? `Patch ${v}, could not be read`
                          : `Patch ${v}, no ${name} change`
                  }
                >
                  <span className="dk-strip__dot" aria-hidden />
                  <span className="dk-strip__v">{v}</span>
                </Tag>
              );
            })}
          </div>
        )}
      </section>

      {analyzed.length > 0 && (
        <section className="space-y-2">
          <FaceLabel>Riot&apos;s history, verified by Mogzy</FaceLabel>
          <ul className="space-y-2">
            {analyzed.map((node) => (
              <li key={node.anchor}>
                <p className="text-[0.9375rem] font-semibold">{node.change.property_name}</p>
                <HistoricalContext context={usableHistoricalContext(node.change)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {earlier.length > 0 && (
        <section className="space-y-1">
          <FaceLabel>Earlier entries</FaceLabel>
          {pending > 0 && entries.length === 0 ? (
            <div className="space-y-3 pt-3" aria-busy="true" data-testid="deck-history-loading">
              <div className="dk-skeleton h-7 w-1/3" />
              <div className="dk-skeleton h-3 w-full" />
              <div className="dk-skeleton h-3 w-5/6" />
              <p className="text-[0.8125rem]" style={{ color: "var(--dk-ink-3)" }}>
                Reading {earlier.length - pending} of {earlier.length} earlier reports…
              </p>
            </div>
          ) : entries.length === 0 ? (
            <div className="dk-tile dk-tile--muted mt-3 text-[0.9375rem] leading-relaxed" style={{ color: "var(--dk-ink-2)" }} data-testid="deck-history-none">
              {pending === 0 && failed === 0 ? (
                <p>
                  {name} appears in no earlier report in the archive{oldest ? ` (${oldest} onward)` : ""}. Patch {patchVersion} is the first time this entry
                  has changed since Mogzy began recording patches.
                </p>
              ) : (
                <p>
                  No earlier entry found yet{pending > 0 ? ` (${pending} report${pending === 1 ? "" : "s"} still loading)` : ""}
                  {failed > 0 ? `; ${failed} report${failed === 1 ? "" : "s"} could not be read` : ""}.
                </p>
              )}
            </div>
          ) : (
            <ol data-testid="deck-history-list">
              {entries.map((entry) => (
                <li key={`${entry.patchVersion}-${entry.entity.anchor}`} id={entryId(entry.patchVersion)} className="dk-hentry scroll-mt-24" data-testid="deck-history-entry">
                  <div className="dk-hentry__meta">
                    <a href={patchReportHref(entry.patchVersion, entry.entity.anchor)} className="dk-hentry__v" title={`Open ${name} in the Patch ${entry.patchVersion} report`}>
                      {entry.patchVersion}
                    </a>
                    <DirectionLabel editorial={entry.entity.editorial} className="dk-direction--plain" />
                    {entry.sectionTitle !== card.section.title && (
                      <span className="text-[0.75rem]" style={{ color: "var(--dk-ink-4)" }}>
                        {entry.sectionTitle}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {entry.entity.context && (
                      <p className="dk-quote dk-wrap" style={{ fontSize: "0.9375rem" }}>
                        {entry.entity.context}
                      </p>
                    )}
                    <div className="dk-hentry__rows">
                      {entry.entity.groups.flatMap((group) =>
                        group.changes.map((node) => (
                          <div key={node.anchor} className="dk-hentry__row">
                            <span className="dk-wrap" style={{ color: "var(--dk-ink-2)" }}>
                              {group.slot && <span className="dk-group__slot mr-1.5 text-[0.85rem]">{group.slot}</span>}
                              {(node.change.property_name || group.name || group.title).trim()}
                            </span>
                            {hasExactValues(node.change) ? (
                              <Values before={node.change.before_raw?.trim() || null} after={node.change.after_raw?.trim() || null} isNew={node.change.is_new} />
                            ) : (
                              <span className="dk-wrap" style={{ color: "var(--dk-ink-3)" }}>
                                {(node.change.detail_text || "").trim() || "No exact values published."}
                              </span>
                            )}
                          </div>
                        )),
                      )}
                    </div>
                  </div>
                </li>
              ))}
              {pending > 0 && (
                <li className="pt-3 text-[0.8125rem]" style={{ color: "var(--dk-ink-4)" }}>
                  Still reading {pending} earlier report{pending === 1 ? "" : "s"}…
                </li>
              )}
            </ol>
          )}
        </section>
      )}
    </div>
  );
};
