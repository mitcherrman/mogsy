/**
 * QF1.2 — the question card's MOTIF layer: what KIND of knowledge this is,
 * drawn as faint academy study marks behind the card's content.
 *
 * Decorative only. It is the last child of its host, absolutely positioned,
 * `aria-hidden`, and `pointer-events: none`; it takes no row, no height and no
 * width, so the card measures exactly the same with or without it. Everything
 * it draws sits behind the host's in-flow content (the host is an isolated
 * stacking context and the layer is `z-index: -1` inside it), so a mark that
 * meets a tablet, the media band or the prompt is covered rather than drawn
 * over it.
 *
 * Fails closed: a `null`, unknown or not-yet-drawn motif renders NOTHING — no
 * wrapper, no host class — so an un-motifed card's DOM is byte-identical to
 * what it was before QF1.
 *
 * Independent of every other axis the card already shows: the RQ1 role
 * emblems (which roles), the category label (the subject) and the media band
 * (the entity). None of them is read here, and nothing here uses role colour.
 */
import type { QuestionMotif } from "@/lib/question-surface/questionMotif";

/**
 * A presentation variant of ONE motif, picked by the host from structure it
 * already has (never a second motif id):
 *
 * - `study`   — an ability question: Q/W/E/R stencil keys.
 * - `dossier` — a champion stat question: a profile frame and stat bars.
 * - `versus`  — a two-champion comparison: mirrored rules and corners, and two
 *               facing profile frames across a divider.
 */
export type QuestionMotifVariant = "study" | "dossier" | "versus";

/** Motifs that have artwork. The other approved ids render nothing (yet). */
const DRAWN: ReadonlySet<string> = new Set<QuestionMotif>(["champion_studies"]);

/** Does this motif draw anything? Hosts use it to opt into the host class. */
export function isDrawnMotif(motif: QuestionMotif | null | undefined): motif is QuestionMotif {
  return typeof motif === "string" && DRAWN.has(motif);
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

/**
 * Which pieces a mount draws. A host with one uninterrupted foot (the
 * structured Mastery views) draws `all`. The question surface splits them: the
 * FRAME (rules, corners) on the whole card, and the ACCENT inside the prompt
 * region, whose bottom-right is always the parchment directly above the answer
 * tablets however tall the tablets wrap — a card-level accent placed from the
 * answers' reserved height showed through the gaps of a four-row grid.
 */
export type QuestionMotifParts = "all" | "frame" | "accent";

export function QuestionMotifLayer({ motif, variant = "study", parts = "all" }: {
  motif: QuestionMotif | null | undefined;
  variant?: QuestionMotifVariant;
  parts?: QuestionMotifParts;
}) {
  if (!isDrawnMotif(motif)) return null;
  const frame = parts !== "accent";
  const accent = parts !== "frame";
  return (
    <div
      aria-hidden="true"
      data-testid="question-motif-layer"
      data-motif={motif}
      data-motif-variant={variant}
      data-motif-parts={parts}
      className="question-motif-layer"
    >
      {frame && (
        <>
          <span className="qm-piece qm-ruler qm-ruler--left" />
          <span className="qm-piece qm-corner qm-corner--tl" />
          <span className="qm-piece qm-corner qm-corner--br" />
          {variant === "versus" && (
            <>
              <span className="qm-piece qm-ruler qm-ruler--right" />
              <span className="qm-piece qm-corner qm-corner--tr" />
              <span className="qm-piece qm-corner qm-corner--bl" />
            </>
          )}
        </>
      )}
      {accent && variant === "study" && <span className="qm-piece qm-accent qm-keys" />}
      {accent && variant === "dossier" && <span className="qm-piece qm-accent qm-dossier" />}
      {accent && variant === "versus" && <span className="qm-piece qm-accent qm-versus" />}
    </div>
  );
}
