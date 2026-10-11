import type { ReactNode } from "react";
import type { DeckModel } from "@/lib/patch-deck/deck";
import { chapterSummary, isEntityCard } from "@/lib/patch-deck/deck";
import type { DeckArt as Art } from "@/lib/patch-deck/art";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { summarizeReconciliation } from "@/lib/patch-reports/mogzy-status";

/**
 * The opening card: the patch as a whole. Three champions from the deck fan
 * out on the left (the deck metaphor made literal, once), the patch number
 * leads on the right, then the chapters as a table of contents and Mogzy's
 * data status for the patch, stated exactly as the backend records it.
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
  const fan = model.cards
    .filter(isEntityCard)
    .filter((c) => c.kind === "champion" && !c.mode)
    .slice(0, 3)
    .map((c) => ({ card: c, art: artFor(c.id) }));
  const champions = model.cards.filter((c) => isEntityCard(c) && c.kind === "champion" && !c.mode).length;
  const built = new Date(detail.built_at);
  const firstEntity = model.chapters.find((c) => c.kind !== "cover")?.from ?? 1;

  return (
    <article className="dk-card" data-testid="deck-card" data-card-kind="cover" data-card-id="cover" aria-labelledby="deck-cover-title">
      {children}
      <div className="dk-cover">
        <div className="dk-fan" aria-hidden>
          {fan.map(({ card, art }, i) => {
            const rot = (i - (fan.length - 1) / 2) * 10;
            const x = (i - (fan.length - 1) / 2) * 42;
            return (
              <div key={card.id} className="dk-fan__card" style={{ transform: `translateX(${x}%) rotate(${rot}deg)`, zIndex: i === 1 ? 2 : 1 }}>
                {art?.loading ? <img src={art.loading} alt="" loading="lazy" decoding="async" /> : null}
                <span className="dk-fan__name">{card.entity.card.entity_name}</span>
              </div>
            );
          })}
        </div>

        <div className="dk-cover__right space-y-5">
          <div>
            <p className="dk-eyebrow" style={{ color: "var(--dk-ink-2)" }}>
              League of Legends · Mogzy Patch Deck
            </p>
            <h2 id="deck-cover-title" className="dk-cover__version">
              {model.patchVersion}
            </h2>
            <p className="mt-3 text-sm" style={{ color: "var(--dk-ink-2)" }}>
              {model.cards.length - 1} cards · {champions} {champions === 1 ? "champion" : "champions"} ·{" "}
              {detail.cards.reduce((n, c) => n + c.changes.length, 0)} Riot lines
              {Number.isFinite(built.getTime()) && (
                <span style={{ color: "var(--dk-ink-3)" }}> · report built {built.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              )}
            </p>
          </div>

          <nav aria-label="Chapters" className="dk-cover__chapters">
            {summary.map(({ chapter, count, buckets }) => (
              <button key={chapter.id} type="button" className="dk-cover__chapter" onClick={() => onJump(chapter.from)} data-testid="deck-cover-chapter">
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

          <div className="dk-tile space-y-1" data-testid="deck-cover-status">
            <p className="dk-eyebrow">Mogzy data status</p>
            <p className="text-sm font-semibold">{recon.headline}</p>
            <p className="text-[0.8125rem] leading-relaxed" style={{ color: "var(--dk-ink-3)" }}>
              {recon.body}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="dk-btn dk-btn--gold" onClick={() => onJump(firstEntity)} data-testid="deck-cover-start">
              Open the first card →
            </button>
            <a href={detail.source_url} target="_blank" rel="noopener noreferrer" className="dk-btn dk-btn--ghost">
              Riot&apos;s official notes
            </a>
          </div>
        </div>
      </div>
    </article>
  );
};
