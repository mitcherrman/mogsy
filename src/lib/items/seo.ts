import { SITE_URL } from "../site-config";
import { formatGold, shopPrice, statusLine, type CanonicalItem } from "./types";

export function itemPath(slug: string) { return `/items/${slug}`; }
export function buildItemSeo(item: CanonicalItem, image: string | null) {
  const price = shopPrice(item);
  const facts = item.stats.map((stat) => `${stat.display} ${stat.label}`).join(", ");
  const parts = [`${item.name} is a ${statusLine(item).toLowerCase()}.`];
  if (price !== null) parts.push(`It costs ${formatGold(price)} gold.`);
  if (facts) parts.push(`Stats: ${facts}.`);
  return {
    title: `${item.name} — Stats, Cost, Recipe & Effects | Mogzy`,
    description: parts.join(" ").slice(0, 158),
    path: itemPath(item.slug), canonical: `${SITE_URL}${itemPath(item.slug)}`, image,
  };
}
export function buildItemJsonLd(item: CanonicalItem, seo: ReturnType<typeof buildItemSeo>) {
  return [{
    "@context": "https://schema.org", "@type": "Article",
    headline: `${item.name} — League of Legends item reference`,
    description: seo.description, url: seo.canonical, mainEntityOfPage: seo.canonical,
    isAccessibleForFree: true, inLanguage: "en", about: { "@type": "Thing", name: item.name },
    publisher: { "@type": "Organization", name: "Mogzy", url: SITE_URL },
    ...(seo.image ? { image: seo.image } : {}),
  }];
}
