import { useId, useState, type ReactNode } from "react";
import type { DeckEntityCard, DeckModel } from "@/lib/patch-deck/deck";
import { changeCount } from "@/lib/patch-deck/deck";
import type { DeckArt as Art } from "@/lib/patch-deck/art";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { patchReportHref } from "@/components/patch-catchup/route";
import { ChangeRow, DirectionLabel, FaceLabel, GroupHeader, StatusMark } from "./shared";
import { directionAttr } from "./editorial";

const Rings = () => (
  <svg viewBox="0 0 400 400" aria-hidden preserveAspectRatio="xMidYMid slice">
    <defs>
      <radialGradient id="dk-ring-fade" cx="50%" cy="50%" r="50%">
        <stop offset="55%" stopColor="rgba(201,168,76,0.0)" />
        <stop offset="100%" stopColor="rgba(201,168,76,0.0)" />
      </radialGradient>
    </defs>
    {[64, 96, 132, 176, 228].map((r, i) => (
      <circle key={r} cx="200" cy="196" r={r} fill="none" stroke="rgba(201,168,76,0.22)" strokeWidth={i === 0 ? 1.2 : 0.7} strokeDasharray={i % 2 ? "2 6" : undefined} />
    ))}
    <line x1="200" y1="20" x2="200" y2="372" stroke="rgba(236,230,214,0.06)" />
    <line x1="24" y1="196" x2="376" y2="196" stroke="rgba(236,230,214,0.06)" />
  </svg>
);

/**
 * An item card: the item sits on a plinth of concentric rings (the small
 * square icon Riot publishes is the only art there is, so the composition is
 * built around it rather than stretching it), with the changes alongside.
 */
export const ItemCard = ({
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
  const [failed, setFailed] = useState(false);
  const report = card.entity.card;
  const total = changeCount(card.entity);
  const icon = failed ? null : art.icon;

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
      <div className="dk-item">
        <div className="dk-plinth">
          <Rings />
          <div className="relative z-10 flex flex-col items-center gap-6 text-center">
            <div className="dk-plinth__icon">
              {icon ? (
                <img src={icon} alt="" onError={() => setFailed(true)} decoding="async" />
              ) : (
                <div className="dk-art-void">
                  <span style={{ fontSize: "2.5rem" }}>{report.entity_name.slice(0, 2).toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="dk-eyebrow" style={{ color: "var(--dk-ink-2)" }}>
                Patch {model.patchVersion} · {card.mode ? card.section.title : "Item"}
              </p>
              <h2 id={`${idBase}-name`} className="dk-display dk-wrap" style={{ fontSize: "clamp(1.9rem, 3.2vw, 2.75rem)" }}>
                {report.entity_name}
              </h2>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                <DirectionLabel editorial={card.entity.editorial} />
                <span className="dk-mono text-[0.6875rem]" style={{ color: "var(--dk-ink-2)" }}>
                  {total} {total === 1 ? "change" : "changes"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="dk-item__panel dk-face-body space-y-5">
          {card.entity.context ? (
            <blockquote className="dk-quote dk-wrap">
              {card.entity.context}
              <cite>Riot, patch {model.patchVersion}</cite>
            </blockquote>
          ) : card.section.sharedContext ? (
            <blockquote className="dk-quote dk-wrap">
              {card.section.sharedContext}
              <cite>Riot, on {card.section.title}</cite>
            </blockquote>
          ) : null}
          <section>
            <FaceLabel>Riot&apos;s changes</FaceLabel>
            {card.entity.groups.map((group) => (
              <div key={group.anchor}>
                {group.title && <GroupHeader group={group} card={report} />}
                <ul>
                  {group.changes.map((node) => (
                    <ChangeRow key={node.anchor} node={node} card={report} entityStatus={report.aggregate_status} />
                  ))}
                </ul>
              </div>
            ))}
            {card.entity.groups.length === 0 && (
              <p className="text-sm italic" style={{ color: "var(--dk-ink-3)" }}>
                Riot published no itemised changes for this entry.
              </p>
            )}
          </section>
          <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-[0.75rem]" style={{ borderColor: "var(--dk-line)", color: "var(--dk-ink-3)" }}>
            <StatusMark status={report.aggregate_status} />
            <a href={patchReportHref(model.patchVersion, card.id)} className="underline-offset-4 hover:underline">
              This entry in List View
            </a>
            <a href={detail.source_url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
              Riot&apos;s notes
            </a>
          </footer>
        </div>
      </div>
    </article>
  );
};
