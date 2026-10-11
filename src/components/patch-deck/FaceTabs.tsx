import { useRef, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { DECK_FACES, DECK_FACE_LABELS, DECK_FACE_SHORT, type DeckFace } from "@/lib/patch-deck/route";
import { useDeckMotion } from "./use-deck-motion";

/**
 * The card's internal views, as a WAI-ARIA tablist with roving focus.
 * Left/Right inside the tablist move between faces; the stage's own Left/Right
 * (cards) ignore keys that start here.
 */
export const FaceTabs = ({
  face,
  onFace,
  counts,
  idBase,
}: {
  face: DeckFace;
  onFace: (face: DeckFace) => void;
  /** Optional small count shown beside a face (e.g. number of changes). */
  counts?: Partial<Record<DeckFace, number | string>>;
  idBase: string;
}) => {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const { reduced } = useDeckMotion();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = DECK_FACES.indexOf(face);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (i + 1) % DECK_FACES.length;
    else if (event.key === "ArrowLeft") next = (i - 1 + DECK_FACES.length) % DECK_FACES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = DECK_FACES.length - 1;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onFace(DECK_FACES[next]);
    refs.current[next]?.focus();
  };

  return (
    <div className="dk-tabs" role="tablist" aria-label="Card views" onKeyDown={onKeyDown} data-testid="deck-face-tabs">
      {DECK_FACES.map((key, i) => {
        const selected = key === face;
        const count = counts?.[key];
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${key}`}
            aria-selected={selected}
            aria-controls={`${idBase}-panel-${key}`}
            tabIndex={selected ? 0 : -1}
            className="dk-tab"
            onClick={() => onFace(key)}
            data-face={key}
            aria-label={DECK_FACE_LABELS[key]}
            title={DECK_FACE_LABELS[key]}
          >
            {DECK_FACE_SHORT[key]}
            {count !== undefined && count !== null && count !== 0 && <span className="dk-tab__count">{count}</span>}
            {selected && (
              <motion.span
                className="dk-tab__ink"
                layoutId={`${idBase}-ink`}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
