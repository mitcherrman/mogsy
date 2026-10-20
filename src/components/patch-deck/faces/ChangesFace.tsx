import type { DeckEntityCard } from "@/lib/patch-deck/deck";
import { ChangeRow, GroupHeader } from "../shared";

/**
 * Riot's changes, ability by ability, exactly as published: one stanza per
 * ability with its art and slot, then each line with Riot's full notation,
 * the new value loudest. Same structure node as the List View, same Mogzy
 * status vocabulary, nothing re-derived.
 */
export const ChangesFace = ({ card }: { card: DeckEntityCard }) => {
  const { entity } = card;
  if (entity.groups.length === 0) {
    return (
      <p className="text-sm italic" style={{ color: "var(--dk-ink-3)" }} data-testid="deck-face-changes">
        Riot published no itemised changes for this entry.
      </p>
    );
  }
  return (
    <div data-testid="deck-face-changes">
      {entity.groups.map((group) => (
        <section key={group.anchor} aria-label={group.title || "Changes"} className="dk-stanza">
          {(group.title || entity.groups.length > 1) && <GroupHeader group={group} card={entity.card} />}
          <ul>
            {group.changes.map((node) => (
              <ChangeRow key={node.anchor} node={node} card={entity.card} entityStatus={entity.card.aggregate_status} valueSize="lg" />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
