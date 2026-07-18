import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Copy, ExternalLink, Search as SearchIcon, X } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  GLOSSARY_CATEGORIES,
  GLOSSARY_TERMS,
  type GlossaryCategory,
  type GlossaryTerm,
  getGlossaryTerm,
  searchGlossary,
  sortGlossary,
} from "@/lib/lol-glossary/registry";
import { toast } from "@/hooks/use-toast";

const GOLD = "#c9a84c";

/**
 * League of Legends Glossary — precise definitions for every mechanical
 * term Mogzy uses in questions, explanations, and simulations.
 *
 * URL fragment (`#term-id`) selects the anchored term for deep links.
 * All state (query, category filter, anchor) is derived from URL or
 * local state; there is no persistence.
 */
export default function LolGlossary() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<GlossaryCategory | "all">("all");

  const anchor = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  const anchoredTerm = anchor ? getGlossaryTerm(anchor) : undefined;

  const filtered = useMemo(() => {
    const base = activeCategory === "all"
      ? GLOSSARY_TERMS
      : GLOSSARY_TERMS.filter((t) => t.category === activeCategory);
    return sortGlossary(searchGlossary(query, base));
  }, [query, activeCategory]);

  // Group filtered terms by category for the main list.
  const grouped = useMemo(() => {
    const map = new Map<GlossaryCategory, GlossaryTerm[]>();
    for (const term of filtered) {
      const arr = map.get(term.category) ?? [];
      arr.push(term);
      map.set(term.category, arr);
    }
    return map;
  }, [filtered]);

  // Alphabetical navigation index — every first letter that has a term.
  const alphaIndex = useMemo(() => {
    const letters = new Set<string>();
    for (const t of GLOSSARY_TERMS) letters.add(t.term[0]?.toUpperCase() ?? "");
    return Array.from(letters).sort();
  }, []);

  // Scroll the anchored term into view after any layout change.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!anchoredTerm) return;
    const el = document.getElementById(`term-${anchoredTerm.id}`);
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
      // Move focus for keyboard/screen-reader users.
      el.focus({ preventScroll: true });
    }
  }, [anchoredTerm]);

  const copyLink = (termId: string) => {
    const url = `${window.location.origin}/lol/glossary#${termId}`;
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied", description: url }),
      () => toast({ title: "Copy failed", description: url, variant: "destructive" }),
    );
  };

  const jumpToLetter = (letter: string) => {
    const target = GLOSSARY_TERMS.find((t) => t.term.toUpperCase().startsWith(letter));
    if (target) navigate(`/lol/glossary#${target.id}`, { replace: false });
  };

  return (
    <div>
      <SEOHead
        title="League of Legends Glossary — Mogzy Knowledge Base"
        description="Precise definitions for every League of Legends mechanic Mogzy uses: raw damage, post-mitigation damage, lethal damage, armor, magic resistance, penetration, ability haste, and more."
        path="/lol/glossary"
        keywords="league of legends glossary, lol glossary, lol terms, ability haste explained, magic penetration, lethal damage"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "DefinedTermSet",
          name: "League of Legends Glossary — Mogzy",
          url: `${SITE_URL}/lol/glossary`,
          hasDefinedTerm: GLOSSARY_TERMS.map((t) => ({
            "@type": "DefinedTerm",
            name: t.term,
            description: t.shortDefinition,
            identifier: t.id,
            url: `${SITE_URL}/lol/glossary#${t.id}`,
            inDefinedTermSet: `${SITE_URL}/lol/glossary`,
          })),
        }}
      />

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-8">
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
            Mogzy x LoL · Glossary
          </div>
          <h1 className="mt-1 text-3xl md:text-4xl font-bold text-foreground">
            League of Legends Glossary
          </h1>
          <p className="mt-2 text-sm md:text-base max-w-2xl text-muted-foreground">
            Precise, patch-agnostic definitions of the mechanical terms Mogzy uses in questions,
            explanations, and combat simulations. Every entry says exactly what is and is not
            included in the calculation.
          </p>

          {/* Search */}
          <div className="mt-4 max-w-xl">
            <div className="relative">
              <SearchIcon
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search terms, aliases, or definitions…"
                aria-label="Search glossary"
                className="pl-9 pr-10 border-border/60 bg-black/40 focus-visible:ring-[#c9a84c]/40"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-white/5 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Category filters */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            <CategoryChip
              active={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
            >
              All
            </CategoryChip>
            {GLOSSARY_CATEGORIES.map((c) => (
              <CategoryChip
                key={c.id}
                active={activeCategory === c.id}
                onClick={() => setActiveCategory(c.id)}
              >
                {c.label}
              </CategoryChip>
            ))}
          </div>

          {/* Alphabetical index */}
          <nav aria-label="Jump to letter" className="mt-3 flex flex-wrap gap-1">
            {alphaIndex.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => jumpToLetter(letter)}
                className="min-w-[28px] min-h-[28px] px-1.5 rounded-md border border-border/60 bg-black/30 text-xs font-bold text-foreground/80 hover:border-[#c9a84c]/50 hover:text-[#c9a84c] transition-colors"
                aria-label={`Jump to terms starting with ${letter}`}
              >
                {letter}
              </button>
            ))}
          </nav>
        </header>

        {/* Result summary */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing <strong className="text-foreground">{filtered.length}</strong>{" "}
            of {GLOSSARY_TERMS.length} terms
            {activeCategory !== "all" ? ` in ${GLOSSARY_CATEGORIES.find((c) => c.id === activeCategory)?.label}` : ""}
            {query ? ` matching "${query}"` : ""}
          </span>
          {(query || activeCategory !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setActiveCategory("all");
              }}
            >
              Reset
            </Button>
          )}
        </div>

        {/* Term list — grouped by category */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No terms match that search. Try a different keyword, or reset the filters.
          </div>
        ) : (
          <main aria-live="polite" className="space-y-8">
            {GLOSSARY_CATEGORIES.filter((c) => grouped.has(c.id)).map((cat) => (
              <section key={cat.id} aria-labelledby={`cat-${cat.id}`}>
                <div className="mb-3 flex items-center gap-2">
                  <div
                    className="text-[10px] uppercase tracking-widest font-bold"
                    style={{ color: GOLD }}
                  >
                    Category
                  </div>
                  <h2 id={`cat-${cat.id}`} className="text-lg md:text-xl font-bold text-foreground">
                    {cat.label}
                  </h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {(grouped.get(cat.id) ?? []).map((term) => (
                    <TermCard
                      key={term.id}
                      term={term}
                      isActive={anchoredTerm?.id === term.id}
                      onCopy={() => copyLink(term.id)}
                      onOpenRelated={(id) => navigate(`/lol/glossary#${id}`)}
                      ref={anchoredTerm?.id === term.id ? anchorRef : undefined}
                    />
                  ))}
                </div>
              </section>
            ))}
          </main>
        )}

        {/* Trust footer */}
        <footer className="rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">
          Definitions here describe how the game actually calculates each value. Formulas that
          depend on champion stats, ability data, or item stats are marked patch-sensitive and
          may shift between patches even though the definitions do not.
        </footer>
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-md border border-[#c9a84c]/80 bg-[#c9a84c]/15 px-2.5 py-1 text-xs font-bold text-[#c9a84c]"
          : "rounded-md border border-border/60 bg-black/30 px-2.5 py-1 text-xs font-semibold text-foreground/70 hover:border-[#c9a84c]/40 hover:text-foreground transition-colors"
      }
    >
      {children}
    </button>
  );
}

import { forwardRef } from "react";

interface TermCardProps {
  term: GlossaryTerm;
  isActive: boolean;
  onCopy: () => void;
  onOpenRelated: (id: string) => void;
}

const TermCard = forwardRef<HTMLDivElement, TermCardProps>(function TermCard(
  { term, isActive, onCopy, onOpenRelated },
  ref,
) {
  return (
    <div
      ref={ref}
      id={`term-${term.id}`}
      tabIndex={-1}
      className={
        "scroll-mt-24 rounded-xl border p-4 transition-colors " +
        (isActive
          ? "border-[#c9a84c]/70 bg-[#c9a84c]/5 shadow-[0_0_0_1px_rgba(201,168,76,0.25)]"
          : "border-border bg-card/50 hover:border-[#c9a84c]/30")
      }
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-base md:text-lg font-bold text-foreground">{term.term}</h3>
          {term.aliases.length > 0 && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Also called: {term.aliases.join(", ")}
            </p>
          )}
        </div>
        {term.patchSensitive && (
          <span
            className="shrink-0 rounded-md border border-[#c9a84c]/40 bg-[#c9a84c]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#c9a84c]"
            title="Values referenced in this definition can change between patches."
          >
            Patch-sensitive
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 -mr-2 -mt-1"
          onClick={onCopy}
          aria-label={`Copy link to ${term.term}`}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-2 text-sm text-foreground/90">{term.shortDefinition}</p>

      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <p>{term.fullDefinition}</p>

        {term.formula && (
          <div className="rounded-md border border-border/60 bg-black/40 p-2 font-mono text-[11px] text-foreground/90">
            {term.formula}
          </div>
        )}

        {term.example && (
          <p>
            <span className="font-semibold text-foreground/80">Example. </span>
            {term.example}
          </p>
        )}

        {term.sourceNote && (
          <p className="text-[11px] italic">{term.sourceNote}</p>
        )}
      </div>

      {term.relatedTermIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground pt-0.5">
            Related
          </span>
          {term.relatedTermIds.map((rid) => {
            const rel = getGlossaryTerm(rid);
            if (!rel) return null;
            return (
              <button
                key={rid}
                type="button"
                onClick={() => onOpenRelated(rid)}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-black/30 px-2 py-1 text-[11px] font-semibold text-foreground/80 hover:border-[#c9a84c]/50 hover:text-[#c9a84c] transition-colors"
              >
                {rel.term}
                <ArrowRight className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Link
          to={`/lol/glossary#${term.id}`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-[#c9a84c]"
          aria-label={`Permalink to ${term.term}`}
        >
          Permalink <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
});

export { TermCard };