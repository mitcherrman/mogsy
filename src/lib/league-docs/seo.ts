import { SITE_URL } from "../site-config";
import type { ChampionDoc } from "./api";

export function championDocPath(slug: string) {
  return `/lol/docs/champions/${slug}`;
}

export function buildChampionSeo(doc: ChampionDoc) {
  const { champion, meta } = doc;
  const titleSuffix = champion.title ? `, ${champion.title}` : "";
  const parts = [`${champion.name}${titleSuffix} — League of Legends champion reference.`];
  parts.push("Base stats, per-level growth, and ability cooldowns, costs, ranges, and scaling formulas.");
  if (meta.patch) parts.push(`Current for patch ${meta.patch}.`);
  return {
    title: `${champion.name} — Stats, Abilities & Scaling | League Docs | Mogzy`,
    description: parts.join(" ").slice(0, 158),
    path: championDocPath(champion.slug),
    canonical: `${SITE_URL}${championDocPath(champion.slug)}`,
  };
}

export function buildChampionJsonLd(doc: ChampionDoc, seo: ReturnType<typeof buildChampionSeo>) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${doc.champion.name} — League of Legends champion reference`,
      description: seo.description,
      url: seo.canonical,
      mainEntityOfPage: seo.canonical,
      isAccessibleForFree: true,
      inLanguage: "en",
      about: { "@type": "Thing", name: doc.champion.name },
      publisher: { "@type": "Organization", name: "Mogzy", url: SITE_URL },
      ...(doc.meta.last_updated ? { dateModified: doc.meta.last_updated } : {}),
    },
  ];
}
