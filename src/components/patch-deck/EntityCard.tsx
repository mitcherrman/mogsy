import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { DeckEntityCard, DeckModel } from "@/lib/patch-deck/deck";
import { changeCount, impactLines } from "@/lib/patch-deck/deck";
import type { DeckArt as Art } from "@/lib/patch-deck/art";
import type { DeckFace } from "@/lib/patch-deck/route";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { DeckArt } from "./DeckArt";
import { FaceTabs } from "./FaceTabs";
import { DirectionLabel } from "./shared";
import { directionAttr } from "./editorial";
import { useDeckMotion } from "./use-deck-motion";
import { OverviewFace } from "./faces/OverviewFace";
import { ChangesFace } from "./faces/ChangesFace";
import { ImpactFace } from "./faces/ImpactFace";
import { HistoryFace } from "./faces/HistoryFace";
import { ExploreFace } from "./faces/ExploreFace";

/**
 * A champion card (also the composition for a mode champion and for a rune):
 * artwork on the left dissolving into the information panel on the right, the
 * name set on the art's foot, and five faces inside the panel.
 *
 * On a phone the same card stacks: portrait art, name, then the faces.
 */
export const EntityCard = ({
  card,
  art,
  model,
  detail,
  versions,
  face,
  onFace,
  onJump,
  wide,
  children,
}: {
  card: DeckEntityCard;
  art: Art;
  model: DeckModel;
  detail: PatchReportDetail;
  versions: readonly string[];
  face: DeckFace;
  onFace: (face: DeckFace) => void;
  onJump: (cardId: string) => void;
  /** Desktop stage (wide splash) vs phone (portrait). */
  wide: boolean;
  /** Overlay controls rendered inside the card (prev/next on a phone). */
  children?: ReactNode;
}) => {
  const idBase = useId().replace(/:/g, "");
  const { face: faceDuration, ease } = useDeckMotion();
  const report = card.entity.card;
  const total = changeCount(card.entity);
  const impact = impactLines(card.entity).length;
  const kicker = card.mode ? card.section.title : card.kind === "champion" ? "Champion" : card.kind === "rune" ? "Rune" : card.section.title;

  const faces: Record<DeckFace, ReactNode> = {
    overview: <OverviewFace card={card} patchVersion={model.patchVersion} reconciliation={detail.reconciliation} onFace={onFace} />,
    changes: <ChangesFace card={card} />,
    impact: <ImpactFace card={card} patchVersion={model.patchVersion} active={face === "impact"} />,
    history: <HistoryFace card={card} patchVersion={model.patchVersion} versions={versions} active={face === "history"} />,
    explore: <ExploreFace card={card} model={model} sourceUrl={detail.source_url} reconciliation={detail.reconciliation} onJump={onJump} />,
  };

  return (
    <article
      className="dk-card"
      data-direction={directionAttr(card.entity.editorial)}
      data-testid="deck-card"
      data-card-kind={card.kind}
      data-card-id={card.id}
      aria-labelledby={`${idBase}-name`}
    >
      <div className="dk-card__hero">
        <DeckArt art={art} name={report.entity_name} variant={wide ? "wide" : "portrait"} priority className={card.mode ? "[filter:saturate(0.7)]" : undefined} />
        {children}
        <div className="dk-card__title">
        <p className="dk-eyebrow mb-2" style={{ color: "var(--dk-ink-2)", textShadow: "0 1px 12px rgba(5,7,13,0.9)" }}>
          Patch {model.patchVersion} · {kicker}
        </p>
        <h2 id={`${idBase}-name`} className="dk-display dk-name dk-wrap">
          {report.entity_name}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <DirectionLabel editorial={card.entity.editorial} />
          <span className="dk-mono text-[0.6875rem]" style={{ color: "var(--dk-ink-2)", textShadow: "0 1px 10px rgba(5,7,13,0.9)" }}>
            {total} {total === 1 ? "change" : "changes"}
          </span>
        </div>
        </div>
      </div>

      <div className="dk-card__panel">
        <FaceTabs
          face={face}
          onFace={onFace}
          idBase={idBase}
          counts={{ changes: total, impact: impact > 0 ? impact : undefined }}
        />
        <motion.div
          key={face}
          role="tabpanel"
          id={`${idBase}-panel-${face}`}
          aria-labelledby={`${idBase}-tab-${face}`}
          className="dk-face-body"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: faceDuration, ease }}
          tabIndex={0}
        >
          {faces[face]}
        </motion.div>
      </div>
    </article>
  );
};
