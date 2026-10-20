import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { DeckEntityCard, DeckModel } from "@/lib/patch-deck/deck";
import { changeCount, impactLines } from "@/lib/patch-deck/deck";
import type { DeckArt as Art } from "@/lib/patch-deck/art";
import { artSideFor, focalFor, type ArtSide } from "@/lib/patch-deck/focal";
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

/** Faces whose information wants the broad stage: the panel grows, the art yields. */
const BROAD: ReadonlySet<DeckFace> = new Set(["impact", "history"]);

/** Desktop composition per face: how much of the card the panel takes. */
const PANEL_WIDTH: Record<DeckFace, string> = {
  overview: "50%",
  changes: "52%",
  impact: "66%",
  history: "64%",
  explore: "50%",
};

/**
 * A champion card (also the composition for a mode champion and for a rune).
 *
 * The composition is decided by the artwork: a champion painted left of
 * centre keeps the art on the left and the panel on the right; one painted
 * right of centre is mirrored, so the face stands in open art on the right
 * and the information reads from the left. Within that, the panel's width
 * follows the face: Overview and Changes read beside the art; Impact and
 * History take a broad analytical stage and the art steps back.
 *
 * On a phone the card stacks: portrait art, the name on its foot, then a
 * sticky face bar that keeps naming the champion while the content scrolls.
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
  direction = 1,
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
  /** Direction of travel into this card (1 forward, -1 back), for the parallax entrance. */
  direction?: number;
  /** Overlay controls rendered inside the hero (prev/next on a phone). */
  children?: ReactNode;
}) => {
  const idBase = useId().replace(/:/g, "");
  const motionCfg = useDeckMotion();
  const report = card.entity.card;
  const total = changeCount(card.entity);
  const impact = impactLines(card.entity).length;
  const kicker = card.mode ? card.section.title : card.kind === "champion" ? "Champion" : card.kind === "rune" ? "Rune" : card.section.title;
  const side: ArtSide = wide && art.splash ? artSideFor(focalFor(art.champion)) : "left";
  const broad = BROAD.has(face);

  const faces: Record<DeckFace, ReactNode> = {
    overview: <OverviewFace card={card} patchVersion={model.patchVersion} reconciliation={detail.reconciliation} onFace={onFace} />,
    changes: <ChangesFace card={card} />,
    impact: <ImpactFace card={card} patchVersion={model.patchVersion} active={face === "impact"} />,
    history: <HistoryFace card={card} patchVersion={model.patchVersion} versions={versions} active={face === "history"} />,
    explore: <ExploreFace card={card} model={model} sourceUrl={detail.source_url} reconciliation={detail.reconciliation} onJump={onJump} />,
  };

  const slide = (distance: number) => ({
    initial: { x: motionCfg.reduced ? 0 : direction * distance, opacity: motionCfg.reduced ? 1 : 0.4 },
    animate: { x: 0, opacity: 1 },
    transition: { duration: motionCfg.card, ease: motionCfg.ease },
  });

  return (
    <article
      className={`dk-card${card.mode ? " dk-card--mode" : ""}`}
      data-direction={directionAttr(card.entity.editorial)}
      data-side={side}
      data-broad={broad ? "true" : undefined}
      data-face={face}
      data-testid="deck-card"
      data-card-kind={card.kind}
      data-card-id={card.id}
      aria-labelledby={`${idBase}-name`}
      style={{ ["--dk-panel-w" as string]: PANEL_WIDTH[face], ["--dk-art-w" as string]: broad ? "58%" : "78%" }}
    >
      <motion.div className="dk-card__hero" {...slide(wide ? 90 : 48)}>
        <DeckArt art={art} name={report.entity_name} variant={wide ? "wide" : "portrait"} side={side} priority />
        {children}
        <div className="dk-card__title">
          <p className="dk-eyebrow mb-2" style={{ color: "var(--dk-ink-2)", textShadow: "0 1px 12px rgba(5,7,13,0.9)" }}>
            Patch {model.patchVersion} · {kicker}
          </p>
          <h2 id={`${idBase}-name`} className="dk-display dk-name dk-wrap">
            {report.entity_name}
          </h2>
          <div className="dk-title-row">
            <DirectionLabel editorial={card.entity.editorial} />
            <span className="dk-title-meta">
              {total} {total === 1 ? "change" : "changes"}
              {impact > 0 && ` · ${impact} Mogzy ${impact === 1 ? "projection" : "projections"}`}
            </span>
          </div>
        </div>
      </motion.div>

      <motion.div className="dk-card__panel" {...slide(wide ? 36 : 0)}>
        <FaceTabs
          face={face}
          onFace={onFace}
          idBase={idBase}
          counts={{ changes: total, impact: impact > 0 ? impact : undefined }}
          identity={{ name: report.entity_name, icon: art.icon }}
        />
        <motion.div
          key={face}
          role="tabpanel"
          id={`${idBase}-panel-${face}`}
          aria-labelledby={`${idBase}-tab-${face}`}
          className="dk-face-body"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionCfg.face, ease: motionCfg.ease }}
          tabIndex={0}
        >
          {faces[face]}
        </motion.div>
      </motion.div>
    </article>
  );
};
