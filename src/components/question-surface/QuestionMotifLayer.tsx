/**
 * QF1.2 — the question card's MOTIF layer: what KIND of knowledge this is,
 * drawn as a faint pencil illustration printed into the parchment behind the
 * card's content.
 *
 * Decorative only. It is the last child of its host, absolutely positioned,
 * `aria-hidden`, and `pointer-events: none`; it takes no row, no height and no
 * width, so the card measures exactly the same with or without it. It paints
 * BENEATH the host's in-flow content (the host is an isolated stacking context
 * and the layer is `z-index: -1` inside it): the prompt and the answer tablets
 * sit on top of the art, which is the whole point — a watermark needs no space
 * of its own.
 *
 * Fails closed: a `null`, unknown or not-yet-illustrated motif renders NOTHING
 * — no wrapper, no host class — so an un-motifed card's DOM is byte-identical
 * to what it was before QF1.
 *
 * Independent of every other axis the card already shows: the RQ1 role
 * emblems, the category label and the media band. None of them is read here.
 */
import type { QuestionMotif } from "@/lib/question-surface/questionMotif";

/**
 * The illustration each drawn motif prints, keyed by motif. Champion Studies
 * and Combat Workings share ONE artwork (the "Champion/Combat" classification,
 * `public/assets/ranked/question-accents/champ-combat.png`); Rift/Jungle
 * prints the minion + turret study; Items and Spells have none yet and render
 * nothing.
 */
const ART: Readonly<Partial<Record<QuestionMotif, string>>> = {
  champion_studies: "champ-combat",
  combat_workings: "champ-combat",
  // Rift/Jungle — the pencil caster minion and outer turret
  // (`question-accents/minion.png`, `tower.png`) plus one leaf cluster.
  rift_field_guide: "rift",
};

/** Does this motif draw anything? Hosts use it to opt into the host class. */
export function isDrawnMotif(motif: QuestionMotif | null | undefined): motif is QuestionMotif {
  return typeof motif === "string" && ART[motif] !== undefined;
}

/**
 * The class a host adds ONLY when a drawn motif is present: `position:
 * relative` + `isolation: isolate`, so the layer anchors to the host and paints
 * beneath its content. Absent otherwise, which keeps un-motifed hosts unchanged.
 */
export const QUESTION_MOTIF_HOST_CLASS = "question-motif-host";

export function motifHostClass(motif: QuestionMotif | null | undefined): string {
  return isDrawnMotif(motif) ? ` ${QUESTION_MOTIF_HOST_CLASS}` : "";
}

export function QuestionMotifLayer({ motif }: { motif: QuestionMotif | null | undefined }) {
  if (!isDrawnMotif(motif)) return null;
  return (
    <div
      aria-hidden="true"
      data-testid="question-motif-layer"
      data-motif={motif}
      data-motif-art={ART[motif]}
      className="question-motif-layer"
    />
  );
}
