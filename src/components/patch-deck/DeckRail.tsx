import type { DeckModel } from "@/lib/patch-deck/deck";
import { isEntityCard } from "@/lib/patch-deck/deck";

/**
 * Chapters and progress under the stage: one segment per official section
 * (width proportional to its card count), one tick per card, tinted by Riot's
 * editorial bucket. The current card's tick stands tall in gold. Clicking a
 * chapter jumps to its first card; each tick is its own target too.
 */
export const DeckRail = ({ model, index, onJump }: { model: DeckModel; index: number; onJump: (index: number) => void }) => {
  const chapters = model.chapters.filter((c) => c.kind !== "cover");
  return (
    <nav className="dk-rail__chapters" aria-label="Deck chapters" data-testid="deck-rail">
      {chapters.map((chapter) => {
        const count = chapter.to - chapter.from;
        const current = index >= chapter.from && index < chapter.to;
        return (
          <div
            key={chapter.id}
            className="dk-chapter"
            style={{ ["--dk-chapter-weight" as string]: Math.max(count, 2) }}
            aria-current={current ? "true" : undefined}
            data-testid="deck-chapter"
          >
            <button
              type="button"
              className="dk-chapter__label"
              style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0, font: "inherit", textAlign: "left" }}
              onClick={() => onJump(chapter.from)}
              title={`${chapter.title}: ${count} ${count === 1 ? "card" : "cards"}`}
            >
              {chapter.title}
              <span className="dk-chapter__count">{count}</span>
            </button>
            <div className="dk-chapter__track" role="list" aria-label={`${chapter.title} cards`}>
              {model.cards.slice(chapter.from, chapter.to).map((card, i) => {
                const at = chapter.from + i;
                const bucket = chapter.buckets.find((b) => at >= b.from && at < b.to);
                const name = isEntityCard(card) ? card.entity.card.entity_name : chapter.title;
                return (
                  <button
                    key={card.id}
                    type="button"
                    role="listitem"
                    className="dk-tickmark"
                    data-direction={bucket && bucket.direction !== "ungrouped" ? bucket.direction : undefined}
                    data-current={at === index ? "true" : undefined}
                    aria-label={`${name}, card ${at} of ${model.cards.length - 1}`}
                    aria-current={at === index ? "true" : undefined}
                    title={name}
                    onClick={() => onJump(at)}
                    style={{ border: 0, padding: 0, cursor: "pointer" }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
};
