import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { ITEMS_API_BASE_URL } from "@/lib/items/api";
import { SITE_URL } from "@/lib/site-config";

type ItemIndexEntry = { slug: string; name: string; id: number | null };
type ItemIndexResponse = { ok: boolean; count: number; items: ItemIndexEntry[] };

async function fetchItemIndex(): Promise<ItemIndexResponse> {
  const response = await fetch(`${ITEMS_API_BASE_URL}/api/items`);
  if (!response.ok) throw new Error(`Item index request failed (${response.status})`);
  return response.json() as Promise<ItemIndexResponse>;
}

export default function LeagueDocsItemIndex() {
  const [query, setQuery] = useState("");
  const items = useQuery({ queryKey: ["items", "index"], queryFn: fetchItemIndex, staleTime: 60 * 60 * 1000 });
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const rows = items.data?.items ?? [];
    return q ? rows.filter((item) => item.name.toLocaleLowerCase().includes(q)) : rows;
  }, [items.data, query]);

  return <>
    <SEOHead title="League of Legends Items — Mogzy Archives"
      description="Browse Mogzy's current Summoner's Rift item reference: costs, stats, recipes, and effects."
      path="/lol/docs/items"
      jsonLd={{ "@context": "https://schema.org", "@type": "CollectionPage",
        name: "League of Legends Items — Mogzy Archives", url: `${SITE_URL}/lol/docs/items` }} />
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link to="/lol/docs" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Mogzy Archives
      </Link>
      <div className="mt-4 rounded-2xl border border-border bg-gradient-to-br from-[#0a1428] to-[#0a0a1a] p-5 md:p-7">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#c9a84c]">Mogzy Archives · Items</p>
        <h1 className="mt-1 text-3xl font-bold text-foreground">League of Legends Items</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Browse the current Summoner&apos;s Rift item reference. Open an item for its canonical stats, costs, recipe, and effects.
        </p>
        <div className="relative mt-5 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items…" aria-label="Search items" className="pl-9" />
        </div>
      </div>
      {items.isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Loading items…</p>
        : items.isError ? <div role="alert" className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive">
            The item reference could not be loaded.
            <button type="button" onClick={() => items.refetch()} className="ml-2 font-bold underline">Try again</button>
          </div>
        : <>
            <p className="mt-5 text-xs text-muted-foreground">
              {query.trim() ? `${visible.length} of ${items.data?.count ?? 0} items` : `${items.data?.count ?? 0} current items`}
            </p>
            {visible.length ? <ul className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {visible.map((item) => <li key={item.slug}><Link to={`/items/${item.slug}`}
                className="block rounded-xl border border-border bg-card/50 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-[#c9a84c]/50 hover:text-[#c9a84c]">
                {item.name}</Link></li>)}
            </ul> : <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No current item matches “{query.trim()}”.
            </p>}
          </>}
    </main>
  </>;
}
