import { useMemo, useState } from "react";
import type { DeckEntityCard } from "@/lib/patch-deck/deck";
import { changeCount, headlineChanges, impactLines, touchedGroups } from "@/lib/patch-deck/deck";
import type { DeckFace } from "@/lib/patch-deck/route";
import type { PatchReconciliation } from "@/lib/patch-reports/api";
import { hasExactValues } from "@/lib/patch-reports/report-structure";
import { summarizeReconciliation } from "@/lib/patch-reports/mogzy-status";
import { analyzeImmediate } from "@/lib/patch-impact-loader/analysis";
import { IMPACT_MAX_LEVEL } from "@/lib/patch-impact/math";
import { formatDelta, formatParameterValue, formatRelative, formatStatValue, parameterLabel, projectedStatLabel } from "@/components/patch-impact/format";
import { FaceLabel, GroupArt, StatusMark, Values } from "../shared";
import { directionProvenance } from "../editorial";

/** Long shared prose (a mode intro) shows four lines until asked for more. */
const Clamp = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 320;
  return (
    <>
      <span className={long && !open ? "dk-clamp" : "dk-clamp dk-clamp--open"}>{text}</span>
      {long && (
        <button type="button" className="dk-clamp-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Show less" : "Read Riot's full note"}
        </button>
      )}
    </>
  );
};

/**
 * The opening face: why this entity is in the patch, in one screen.
 *
 *   Riot's rationale → what was touched → the first exact values → what Mogzy
 *   can add (zero-network Impact facts) → where Mogzy's data stands.
 *
 * Nothing here is computed beyond the PH2 immediate analysis, which reads the
 * card alone and never fetches.
 */
export const OverviewFace = ({
  card,
  patchVersion,
  reconciliation,
  onFace,
}: {
  card: DeckEntityCard;
  patchVersion: string;
  reconciliation?: PatchReconciliation;
  onFace: (face: DeckFace) => void;
}) => {
  const { entity } = card;
  const report = entity.card;
  const touched = touchedGroups(entity);
  const headlines = headlineChanges(entity, 3);
  const total = changeCount(entity);
  const lines = impactLines(entity);
  const immediate = useMemo(
    () => lines.map((line) => ({ line, analysis: analyzeImmediate({ card: report, change: line.change, patchVersion }) })),
    [lines, report, patchVersion],
  );
  const insights = immediate.filter((i) => i.analysis.status !== "unavailable");
  const recon = summarizeReconciliation(reconciliation);
  const provenance = directionProvenance(entity.editorial);
  const champion = card.kind === "champion" && !card.mode;

  return (
    <div className="space-y-6" data-testid="deck-face-overview">
      {entity.context ? (
        <blockquote className="dk-quote dk-wrap">
          {entity.context}
          <cite>
            Riot, patch {patchVersion}
            {entity.pairedWith.length > 0 && ` · written for ${[report.entity_name, ...entity.pairedWith].join(" / ")}`}
          </cite>
        </blockquote>
      ) : card.section.sharedContext ? (
        <blockquote className="dk-quote dk-wrap">
          <Clamp text={card.section.sharedContext} />
          <cite>Riot, on {card.section.title}</cite>
        </blockquote>
      ) : (
        <p className="text-sm" style={{ color: "var(--dk-ink-3)" }}>
          Riot published no rationale for this entry.
        </p>
      )}

      {touched.some((t) => t.group.title) && (
        <section aria-labelledby="deck-touched" className="space-y-3">
          <FaceLabel id="deck-touched">
            Touched · {touched.length} {touched.length === 1 ? "group" : "groups"} · {total} {total === 1 ? "change" : "changes"}
          </FaceLabel>
          <div className="dk-touched" role="list">
            {touched.map(({ group, count }) => (
              <button
                key={group.anchor}
                type="button"
                role="listitem"
                className="dk-touch"
                onClick={() => onFace("changes")}
                aria-label={`${group.slotLabel ? `${group.slotLabel === "P" ? "Passive" : group.slotLabel} — ` : ""}${group.name || group.title}: ${count} ${count === 1 ? "change" : "changes"}. Open Riot changes.`}
              >
                <GroupArt group={group} card={report} className="dk-touch__art" />
                {group.slot && <span className="dk-touch__slot" aria-hidden>{group.slot}</span>}
                <span className="dk-touch__name dk-wrap">{group.name || group.title || "Changes"}</span>
                <span className="dk-touch__count" aria-hidden>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {headlines.length > 0 && (
        <section aria-labelledby="deck-headlines" className="space-y-1">
          <FaceLabel id="deck-headlines">Riot&apos;s exact changes</FaceLabel>
          <ul>
            {headlines.map(({ group, change, anchor }) => (
              <li key={anchor} className="dk-row dk-row--labelled" data-testid="deck-headline">
                <p className="dk-row__prop dk-wrap">
                  {group.slot && <span className="dk-group__slot mr-2 text-[0.8rem]">{group.slot}</span>}
                  {(change.property_name || group.name || group.title || "").trim()}
                </p>
                {hasExactValues(change) ? (
                  <Values before={change.before_raw?.trim() || null} after={change.after_raw?.trim() || null} isNew={change.is_new} />
                ) : (
                  <p className="dk-row__prose dk-wrap">{(change.detail_text || "").trim() || "Riot published no exact values."}</p>
                )}
              </li>
            ))}
          </ul>
          {total > headlines.length && (
            <button type="button" className="dk-btn dk-btn--ghost -ml-3 mt-1" onClick={() => onFace("changes")}>
              All {total} changes, ability by ability →
            </button>
          )}
        </section>
      )}

      <section aria-labelledby="deck-insight" className="space-y-3">
        <FaceLabel id="deck-insight">Mogzy Impact</FaceLabel>
        {insights.length > 0 ? (
          <div className="dk-tile dk-tile--gold space-y-3" data-testid="deck-insight-available">
            {insights.map(({ line, analysis }) => {
              if (analysis.status === "unavailable") return null;
              const fact = analysis.facts[0];
              const projected = analysis.status === "projected" ? analysis.projection : null;
              const l18 = projected?.levels[IMPACT_MAX_LEVEL - 1];
              return (
                <div key={line.anchor} className="space-y-1.5">
                  <p className="text-sm font-semibold">
                    {analysis.facts.map((f) => parameterLabel(f.family, f.half)).join(" · ")}
                  </p>
                  <ul className="dk-mono space-y-0.5 text-[0.8125rem]" style={{ color: "var(--dk-ink-2)" }}>
                    {analysis.facts.map((f) => (
                      <li key={f.property}>
                        {formatParameterValue(f.before, f.unit)} → {formatParameterValue(f.after, f.unit)}{" "}
                        <span style={{ color: "var(--dk-gold-2)" }}>{formatDelta(f.absDelta, f.unit, "parameter")}</span>
                        {formatRelative(f.relDelta) ? ` · ${formatRelative(f.relDelta)}` : ""}
                      </li>
                    ))}
                  </ul>
                  {projected && l18 ? (
                    <p className="text-[0.8125rem]" style={{ color: "var(--dk-ink-2)" }}>
                      Projected {projectedStatLabel(projected.family)} at level 18:{" "}
                      <span className="dk-mono">
                        {formatStatValue(l18.before)} → <strong style={{ color: "var(--dk-gold-2)" }}>{formatStatValue(l18.after)}</strong>
                      </span>
                      {projected.crossoverLevel !== null && ` · the difference changes sign at level ${projected.crossoverLevel}`}
                    </p>
                  ) : (
                    <p className="text-[0.75rem]" style={{ color: "var(--dk-ink-3)" }}>
                      {fact ? "Parameter change from Riot's notes. A level projection may be available once Mogzy's evidence is loaded." : null}
                    </p>
                  )}
                </div>
              );
            })}
            <button type="button" className="dk-btn dk-btn--gold" onClick={() => onFace("impact")}>
              Open Mogzy Impact
            </button>
          </div>
        ) : (
          <div className="dk-tile dk-tile--muted text-[0.8125rem] leading-relaxed" style={{ color: "var(--dk-ink-3)" }} data-testid="deck-insight-none">
            {champion
              ? `Mogzy Impact projects champion base-stat changes level by level. ${report.entity_name}'s changes this patch are ${lines.length === 0 ? "ability or mechanic changes" : "base-stat lines Mogzy cannot project"}, so there is no Mogzy projection here — Riot's exact values above are the whole story.`
              : card.mode
                ? `Mogzy Impact covers Summoner's Rift champion base stats. ${card.section.title} changes are mode-scoped and are not projected.`
                : "Mogzy Impact covers champion base stats; this entry has none."}
          </div>
        )}
      </section>

      <footer className="space-y-1.5 border-t pt-4 text-[0.75rem]" style={{ borderColor: "var(--dk-line)", color: "var(--dk-ink-3)" }}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusMark status={report.aggregate_status} />
          <span>· Patch {patchVersion}: {recon.shortLabel}</span>
        </p>
        {provenance && <p>{provenance}</p>}
        {!report.mogzy_entity_ref && report.entity_type !== "system" && <p>Not in Mogzy&apos;s catalog yet.</p>}
      </footer>
    </div>
  );
};
