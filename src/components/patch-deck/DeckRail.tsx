import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DeckModel } from "@/lib/patch-deck/deck";
import { bucketOf, chapterOf, isEntityCard } from "@/lib/patch-deck/deck";

/**
 * The navigator under the stage, in three readings:
 *
 *   1. Progress through the whole deck: a hairline filled in gold to the
 *      current card, notched at chapter boundaries.
 *   2. Chapters: Riot's sections as pills, never truncated; main-game
 *      chapters first, a divider, then modes. One click opens a chapter.
 *   3. This chapter's cards: one tick per card, tinted by Riot's bucket,
 *      the current one tall and gold, with the card's name and position
 *      beside it and explicit previous/next controls.
 *
 * Chapter navigation and card navigation are therefore different rows with
 * different shapes, and the sense of moving through a collection comes from
 * the progress line rather than from a grid of everything at once.
 */
export const DeckRail = ({ model, index, onJump, onStep }: { model: DeckModel; index: number; onJump: (index: number) => void; onStep: (delta: number) => void }) => {
  const chapters = model.chapters.filter((c) => c.kind !== "cover");
  const chapter = chapterOf(model, index);
  const bucket = bucketOf(model, index);
  const total = model.cards.length - 1;
  const current = model.cards[index];
  const name = isEntityCard(current) ? current.entity.card.entity_name : `Patch ${model.patchVersion}`;
  const progress = total > 0 ? (index / total) * 100 : 0;
  const firstMode = chapters.findIndex((c) => c.kind === "mode");

  return (
    <div data-testid="deck-rail">
      <div className="dk-progress" aria-hidden>
        <div className="dk-progress__fill" style={{ width: `${progress}%` }} />
        {chapters.slice(1).map((c) => (
          <span key={c.id} className="dk-progress__notch" style={{ left: `${((c.from - 1) / Math.max(total - 1, 1)) * 100}%` }} />
        ))}
      </div>

      <nav className="dk-chapters" aria-label="Deck chapters">
        {chapters.map((c, i) => {
          const count = c.to - c.from;
          const active = c.id === chapter.id;
          return (
            <span key={c.id} className="contents">
              {i === firstMode && firstMode > 0 && <span className="dk-chapter-divider" aria-hidden />}
              <button
                type="button"
                className={`dk-chapter${c.kind === "mode" ? " dk-chapter--mode" : ""}`}
                aria-current={active ? "true" : undefined}
                onClick={() => onJump(c.from)}
                title={`${c.title}: ${count} ${count === 1 ? "card" : "cards"}`}
                data-testid="deck-chapter"
              >
                {c.title}
                <span className="dk-chapter__count">{count}</span>
              </button>
            </span>
          );
        })}
      </nav>

      <div className="dk-cards-row">
        <div className="dk-cards" role="list" aria-label={`${chapter.title} cards`}>
          {chapter.kind !== "cover" &&
            model.cards.slice(chapter.from, chapter.to).map((card, i) => {
              const at = chapter.from + i;
              const b = chapter.buckets.find((x) => at >= x.from && at < x.to);
              const n = isEntityCard(card) ? card.entity.card.entity_name : chapter.title;
              return (
                <button
                  key={card.id}
                  type="button"
                  role="listitem"
                  className="dk-tickmark"
                  data-direction={b && b.direction !== "ungrouped" ? b.direction : undefined}
                  data-current={at === index ? "true" : undefined}
                  aria-label={`${n}, card ${at} of ${total}`}
                  aria-current={at === index ? "true" : undefined}
                  title={n}
                  onClick={() => onJump(at)}
                />
              );
            })}
        </div>
        <p className="dk-cards-row__label" data-testid="deck-position">
          <strong>{index === 0 ? "Cover" : `${index} / ${total}`}</strong>
          <span>{name}</span>
          {index > 0 && (
            <span style={{ color: "var(--dk-ink-4)" }}>
              · {chapter.title}
              {bucket && bucket.direction !== "ungrouped" ? ` · ${bucket.label}` : ""}
            </span>
          )}
        </p>
        <span className="dk-cards-row__nav" aria-hidden>
          <button type="button" tabIndex={-1} onClick={() => onStep(-1)} disabled={index === 0} title="Previous card">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" tabIndex={-1} onClick={() => onStep(1)} disabled={index >= total} title="Next card">
            <ChevronRight className="h-4 w-4" />
          </button>
        </span>
      </div>
    </div>
  );
};
