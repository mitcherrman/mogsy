import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import ItemReference from "@/components/items/ItemReference";
import { getItem, isItemNotFound, ITEMS_API_BASE_URL } from "@/lib/items/api";
import { buildItemJsonLd, buildItemSeo, itemPath } from "@/lib/items/seo";
import { itemIconUrl } from "@/lib/items/types";

export default function ItemDetail() {
  const { slug = "" } = useParams();
  const query = useQuery({ queryKey: ["items", slug], queryFn: () => getItem(slug), enabled: !!slug,
    retry: (count, error) => !isItemNotFound(error) && count < 1 });
  const notFound = query.isError && isItemNotFound(query.error);
  const icon = query.data ? itemIconUrl(ITEMS_API_BASE_URL, query.data.icon_path) : null;
  const seo = query.data ? buildItemSeo(query.data, icon) : null;
  return <>
    {seo && query.data ? <SEOHead title={seo.title} description={seo.description} path={seo.path}
      image={seo.image ?? undefined} type="article" jsonLd={buildItemJsonLd(query.data, seo)} />
      : <SEOHead title={notFound ? "Item not found — Mogzy" : "League item — Mogzy"}
        description="Canonical League of Legends item stats, cost, recipe, and effects."
        path={itemPath(slug)} noindex={notFound} />}
    {query.isLoading ? <p className="p-8 text-center">Loading item…</p>
      : notFound ? <main className="p-8 text-center"><h1 className="text-2xl font-bold">Item not found</h1><p>No current League item matches “{slug}”.</p></main>
      : query.data ? <ItemReference item={query.data} iconUrl={icon} Link={({ to, ...props }) => <Link to={to} {...props} />} />
      : <p className="p-8 text-center">Couldn’t load item data.</p>}
  </>;
}
