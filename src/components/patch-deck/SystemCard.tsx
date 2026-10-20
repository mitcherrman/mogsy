import { useId, type ReactNode } from "react";
import type { DeckEntityCard, DeckModel } from "@/lib/patch-deck/deck";
import { changeCount } from "@/lib/patch-deck/deck";
import type { DeckArt as Art } from "@/lib/patch-deck/art";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { patchReportHref } from "@/components/patch-catchup/route";
import { ChangeRow, DirectionLabel, FaceLabel, GroupHeader, StatusMark } from "./shared";
import { directionAttr } from "./editorial";

/**
 * A system / category card: a chapter sheet. Riot's section and rationale lead
 * on the left; every official line sits on the right, in Riot's order, as a
 * readable list the reader can scroll without leaving the card. Mode entities
 * with a champion portrait (ARAM: Mayhem › Bard) are composed by EntityCard
 * instead; this card is for the prose-and-lines chapters.
 */
export const SystemCard = ({
  card,
  art,
  model,
  detail,
  children,
}: {
  card: DeckEntityCard;
  art: Art;
  model: DeckModel;
  detail: PatchReportDetail;
  children?: ReactNode;
}) => {
  const idBase = useId().replace(/:/g, "");
  const report = card.entity.card;
  const total = changeCount(card.entity);
  const sameAsSection = report.entity_name.trim().toLowerCase() === card.section.title.trim().toLowerCase();
  const context = card.entity.context ?? card.section.sharedContext;

  return (
    <article
      className="dk-card"
      data-direction={directionAttr(card.entity.editorial)}
      data-testid="deck-card"
      data-card-kind={card.kind}
      data-card-id={card.id}
      aria-labelledby={`${idBase}-name`}
    >
      {children}
      <div className="dk-sheet">
        <div className="dk-sheet__lead space-y-5">
          <p className="dk-eyebrow" style={{ color: "var(--dk-ink-2)" }}>
            Patch {model.patchVersion} · {sameAsSection ? "Section" : card.section.title}
          </p>
          <div className="flex items-start gap-4">
            {art.icon && (
              <img src={art.icon} alt="" className="h-14 w-14 rounded-lg object-cover" style={{ boxShadow: "0 0 0 1px rgba(201,168,76,0.4)" }} decoding="async" />
            )}
            <h2 id={`${idBase}-name`} className="dk-display dk-wrap" style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)" }}>
              {report.entity_name}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <DirectionLabel editorial={card.entity.editorial} />
            <span className="dk-mono text-[0.6875rem]" style={{ color: "var(--dk-ink-2)" }}>
              {total} {total === 1 ? "line" : "lines"}
            </span>
          </div>
          {context && (
            <blockquote className="dk-quote dk-wrap" style={{ fontSize: "0.9375rem" }}>
              {context}
              <cite>Riot, patch {model.patchVersion}</cite>
            </blockquote>
          )}
          <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 text-[0.75rem]" style={{ color: "var(--dk-ink-3)" }}>
            <StatusMark status={report.aggregate_status} />
            <a href={patchReportHref(model.patchVersion, card.id)} className="underline-offset-4 hover:underline">
              List View
            </a>
            <a href={detail.source_url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
              Riot&apos;s notes
            </a>
          </footer>
        </div>

        <div className="dk-sheet__body">
          <FaceLabel>Riot&apos;s lines · in published order</FaceLabel>
          {card.entity.groups.length === 0 ? (
            <p className="mt-3 text-sm italic" style={{ color: "var(--dk-ink-3)" }}>
              Riot published this section as prose only; there are no itemised lines.
            </p>
          ) : (
            card.entity.groups.map((group) => (
              <section key={group.anchor} aria-label={group.title || "Lines"}>
                {group.title && <GroupHeader group={group} card={report} />}
                <ul>
                  {group.changes.map((node) => (
                    <ChangeRow key={node.anchor} node={node} card={report} entityStatus={report.aggregate_status} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </article>
  );
};
