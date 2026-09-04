/**
 * Featured graphs — the discovery surface.
 *
 * Cards are questions, never conclusions: the graph is the only thing allowed
 * to claim a fact. Each one is a complete valid selection, so a click lands on
 * a working graph rather than an empty builder.
 *
 * They render as LINKS, not buttons, so a reader can middle-click one, and so
 * the URL a card produces is exactly the URL they could have built and shared
 * themselves.
 */
import { Link } from "react-router-dom";

import { FEATURED_GRAPHS, type Graph1FeaturedCard } from "@/graph1/featured";
import { describeScope, isScoped } from "@/graph1/scope";

export interface FeaturedGraphsProps {
  /** Turns a card into the href it should open. */
  hrefFor: (card: Graph1FeaturedCard) => string;
  cards?: Graph1FeaturedCard[];
}

export default function FeaturedGraphs({
  hrefFor,
  cards = FEATURED_GRAPHS,
}: FeaturedGraphsProps) {
  return (
    <section aria-label="Featured graphs" className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Start here
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.id}>
            <Link
              to={hrefFor(card)}
              data-testid={`featured-${card.id}`}
              className="group block h-full rounded-lg border border-[#c9a84c]/25 bg-[#c9a84c]/[0.04] p-3 transition-colors hover:border-[#c9a84c]/60 hover:bg-[#c9a84c]/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="font-medium leading-snug">{card.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.hook}</p>
              {isScoped(card.scope) && (
                <p className="mt-2 text-[0.7rem] uppercase tracking-wide text-[#c9a84c]/80">
                  {card.scopeLabel ?? describeScope(card.scope)}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
