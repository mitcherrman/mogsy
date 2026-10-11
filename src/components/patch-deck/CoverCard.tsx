import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { DeckModel } from "@/lib/patch-deck/deck";
import { chapterSummary, isEntityCard } from "@/lib/patch-deck/deck";
import type { DeckArt as Art } from "@/lib/patch-deck/art";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { summarizeReconciliation } from "@/lib/patch-reports/mogzy-status";

/**
 * The opening card: the patch as a whole, and one unmistakable way in.
 *
 * Three champions fan out like a hand of cards (the whole fan is the entry
 * control); the patch number leads on the right, then the primary action,
 * then the chapters as a table of contents and Mogzy's recorded data status,
 * stated exactly as the backend records it. Everything that matters sits
 * above the fold at 900px tall.
 */
export const CoverCard = ({
  model,
  detail,
  artFor,
  onJump,
  children,
}: {
  model: DeckModel;
  detail: PatchReportDetail;
  artFor: (cardId: string) => Art | null;
  onJump: (index: number) => void;
  children?: ReactNode;
}) => {
  const summary = chapterSummary(model);
  const recon = summarizeReconciliation(detail.reconciliation);
  const champions = model.cards.filter((c) => isEntityCard(c) && c.kind === "champion" && !c.mode);
  const fan = champions.slice(0, 3).map((c) => ({ card: c, art: isEntityCard(c) ? artFor(c.id) : null }));
  const built = new Date(detail.built_at);
  const firstChapter = model.chapters.find((c) => c.kind !== "cover");
  const firstEntity = firstChapter?.from ?? 1;
  const lines = detail.cards.reduce((n, c) => n + c.changes.length, 0);

  return (
    <article className="dk-card" data-testid="deck-card" data-card-kind="cover" data-card-id="cover" aria-labelledby="deck-cover-title">
      {children}
      <div className="dk-cover">
        <button type="button" className="dk-fan" onClick={() => onJump(firstEntity)} aria-label={`Open the first card, ${firstChapter?.title ?? "the deck"}`} data-testid="deck-cover-fan">
          {fan.map(({ card, art }, i) => {
            const rot = (i - (fan.length - 1) / 2) * 10;
            const x = (i - (fan.length - 1) / 2) * 42;
            return (
              <span key={card.id} className="dk-fan__card" data-i={i} style={{ transform: `translateX(${x}%) rotate(${rot}deg)`, zIndex: i === 1 ? 2 : 1 }} aria-hidden>
                {art?.loading ? <img src={art.loading} alt="" loading="lazy" decoding="async" /> : null}
                <span className="dk-fan__name">{isEntityCard(card) ? card.entity.card.entity_name : ""}</span>
              </span>
            );
          })}
          <span className="dk-fan__hint" aria-hidden>
            {model.cards.length - 1} cards · tap to begin
          </span>
        </button>

        <div className="dk-cover__right space-y-5">
          <div>
            <p className="dk-eyebrow" style={{ color: "var(--dk-ink-2)" }}>
              League of Legends · Mogzy Patch Deck
            </p>
            <h2 id="deck-cover-title" className="dk-cover__version">
              {model.patchVersion}
            </h2>
            <p className="mt-2 text-[0.9375rem]" style={{ color: "var(--dk-ink-2)" }}>
              {champions.length} {champions.length === 1 ? "champion" : "champions"} · {model.cards.length - 1} cards · {lines} Riot lines
              {Number.isFinite(built.getTime()) && (
                <span style={{ color: "var(--dk-ink-3)" }}> · built {built.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="dk-btn dk-btn--solid dk-btn--lg" onClick={() => onJump(firstEntity)} data-testid="deck-cover-start">
              Begin with {firstChapter?.title ?? "the deck"}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </button>
            <span className="hidden text-[0.75rem] lg:inline" style={{ color: "var(--dk-ink-3)" }} aria-hidden>
              <span className="dk-kbd">←</span> <span className="dk-kbd">→</span> move through cards
            </span>
          </div>

          <nav aria-label="Chapters" className="dk-cover__chapters">
            {summary.map(({ chapter, count, buckets }, i) => (
              <button key={chapter.id} type="button" className="dk-cover__chapter" onClick={() => onJump(chapter.from)} data-testid="deck-cover-chapter">
                <span className="dk-cover__n">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <strong className="block truncate">{chapter.title}</strong>
                  {buckets.length > 0 && (
                    <span className="dk-cover__buckets mt-0.5">
                      {buckets.map((b) => (
                        <span key={b.direction}>
                          <span className="dk-dot" data-direction={b.direction} />
                          {b.count} {b.label.toLowerCase()}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="dk-mono text-sm" style={{ color: "var(--dk-ink-3)" }}>
                  {count}
                </span>
              </button>
            ))}
          </nav>

          <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-t pt-3 text-[0.8125rem]" style={{ borderColor: "var(--dk-line)", color: "var(--dk-ink-3)" }} data-testid="deck-cover-status">
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                <span className="dk-eyebrow block pb-1">Mogzy data status</span>
                <span className="font-semibold" style={{ color: "var(--dk-ink)" }}>
                  {recon.headline}
                </span>
                <span style={{ color: "var(--dk-gold)" }}> · what this means</span>
              </summary>
              <p className="pt-1 leading-relaxed">{recon.body}</p>
            </details>
            <a href={detail.source_url} target="_blank" rel="noopener noreferrer" className="dk-btn dk-btn--ghost -mr-3">
              Riot&apos;s official notes
            </a>
          </div>
        </div>
      </div>
    </article>
  );
};
