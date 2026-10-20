import { ExternalLink, FlaskConical, Link2, List, Rows3 } from "lucide-react";
import type { DeckEntityCard, DeckModel } from "@/lib/patch-deck/deck";
import { relatedCards } from "@/lib/patch-deck/deck";
import { deckHref } from "@/lib/patch-deck/route";
import { combatLabHandoffFor } from "@/lib/patch-hub-combat-lab/handoff";
import { patchReportHref } from "@/components/patch-catchup/route";
import { sharePatchHubLink } from "@/hooks/usePatchHubShare";
import { SITE_URL } from "@/lib/site-config";
import { championSlug } from "@/lib/league-docs/api";
import { summarizeReconciliation } from "@/lib/patch-reports/mogzy-status";
import type { PatchReconciliation } from "@/lib/patch-reports/api";
import { FaceLabel } from "../shared";

/**
 * Where to go from here. Every destination is an existing Mogzy surface or
 * Riot's own notes; the Combat Lab handoff follows the PH4-C contract (champion
 * only, no patch data in the URL).
 */
export const ExploreFace = ({
  card,
  model,
  sourceUrl,
  reconciliation,
  onJump,
}: {
  card: DeckEntityCard;
  model: DeckModel;
  sourceUrl: string;
  reconciliation?: PatchReconciliation;
  onJump: (cardId: string) => void;
}) => {
  const report = card.entity.card;
  const handoff = combatLabHandoffFor(report);
  const related = relatedCards(model, card);
  const recon = summarizeReconciliation(reconciliation);
  const ref = report.mogzy_entity_ref?.trim();
  const docsHref = report.entity_type === "champion" && ref ? `/lol/docs/champions/${championSlug(ref)}` : null;
  const deckUrl = `${SITE_URL}${deckHref({ patch: model.patchVersion, card: card.id })}`;

  return (
    <div className="space-y-6" data-testid="deck-face-explore">
      <section className="space-y-3">
        <FaceLabel>Continue with {report.entity_name}</FaceLabel>
        <div className="flex flex-wrap gap-2">
          {handoff && (
            <a href={handoff.href} className="dk-btn dk-btn--gold" data-testid="deck-combat-lab">
              <FlaskConical aria-hidden className="h-4 w-4" />
              {handoff.label}
            </a>
          )}
          {docsHref && (
            <a href={docsHref} className="dk-btn">
              <Rows3 aria-hidden className="h-4 w-4" />
              Champion docs
            </a>
          )}
          <a href={patchReportHref(model.patchVersion, card.id)} className="dk-btn" data-testid="deck-list-view">
            <List aria-hidden className="h-4 w-4" />
            This entry in List View
          </a>
          <button
            type="button"
            className="dk-btn"
            onClick={() => void sharePatchHubLink({ url: deckUrl, title: `${report.entity_name} · Patch ${model.patchVersion} · Mogzy Patch Deck` })}
          >
            <Link2 aria-hidden className="h-4 w-4" />
            Copy link to this card
          </button>
        </div>
      </section>

      {related.length > 0 && (
        <section className="space-y-3">
          <FaceLabel>Also in this patch</FaceLabel>
          <ul className="flex flex-wrap gap-2">
            {related.map((other) => (
              <li key={other.id}>
                <button type="button" className="dk-btn" onClick={() => onJump(other.id)} data-testid="deck-related">
                  {other.entity.card.entity_name} · {other.section.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <FaceLabel>Sources</FaceLabel>
        <ul className="space-y-2 text-sm">
          <li>
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 underline-offset-4 hover:underline" style={{ color: "var(--dk-gold-2)" }}>
              <ExternalLink aria-hidden className="h-4 w-4" />
              Riot&apos;s official patch {model.patchVersion} notes
            </a>
          </li>
        </ul>
        <div className="dk-tile space-y-1 text-[0.8125rem] leading-relaxed" style={{ color: "var(--dk-ink-2)" }} data-testid="deck-data-status">
          <p className="dk-eyebrow">Mogzy data status · patch {model.patchVersion}</p>
          <p className="font-semibold" style={{ color: "var(--dk-ink)" }}>
            {recon.headline}
          </p>
          <p style={{ color: "var(--dk-ink-3)" }}>{recon.body}</p>
          {recon.recorded && recon.checked > 0 && (
            <p className="dk-mono text-[0.75rem]" style={{ color: "var(--dk-ink-3)" }}>
              {recon.checked} checks · {recon.updated} updated · {recon.notModeled} not modeled · {recon.needsReview} need review
              {recon.failed > 0 ? ` · ${recon.failed} failed` : ""}
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
