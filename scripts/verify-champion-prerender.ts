// Invariant check: every /lol/docs/champions/<slug> URL in the built
// sitemap must have exactly one prerendered dist/lol/docs/champions/<slug>/index.html,
// and no prerendered champion directory may exist without a matching sitemap URL.
// Run after `vite build && tsx scripts/prerender-champions.ts`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve("dist");
const sitemapXml = readFileSync(resolve(dist, "sitemap.xml"), "utf8");
const sitemapSlugs = new Set(
  [...sitemapXml.matchAll(/\/lol\/docs\/champions\/([a-z0-9-]+)</g)].map((m) => m[1]),
);
if (sitemapSlugs.size === 0) {
  throw new Error("sitemap.xml has zero champion doc URLs — refusing to pass verification");
}

const championsDir = resolve(dist, "lol", "docs", "champions");
const prerenderedSlugs = new Set(
  existsSync(championsDir)
    ? readdirSync(championsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [],
);

const missing = [...sitemapSlugs].filter((slug) => !prerenderedSlugs.has(slug));
const extra = [...prerenderedSlugs].filter((slug) => !sitemapSlugs.has(slug));
const missingIndex = [...sitemapSlugs].filter(
  (slug) => prerenderedSlugs.has(slug) && !existsSync(resolve(championsDir, slug, "index.html")),
);

if (missing.length || extra.length || missingIndex.length) {
  const lines = [
    `Champion prerender invariant FAILED (${sitemapSlugs.size} sitemap champions, ${prerenderedSlugs.size} prerendered dirs).`,
    missing.length ? `Missing prerender for: ${missing.join(", ")}` : null,
    extra.length ? `Prerendered but not in sitemap: ${extra.join(", ")}` : null,
    missingIndex.length ? `Directory exists but no index.html: ${missingIndex.join(", ")}` : null,
  ].filter(Boolean);
  throw new Error(lines.join("\n"));
}

console.log(`[verify] ${sitemapSlugs.size} sitemap champion URLs each have exactly one prerendered page.`);
