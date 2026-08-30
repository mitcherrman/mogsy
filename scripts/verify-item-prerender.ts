// Invariant check: every /items/<slug> URL in the built sitemap must have
// exactly one prerendered dist/items/<slug>/index.html, and no prerendered
// item directory may exist without a matching sitemap URL.
// Run after `vite build && tsx scripts/prerender-items.ts`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve("dist");
const sitemapXml = readFileSync(resolve(dist, "sitemap.xml"), "utf8");
const sitemapSlugs = new Set(
  [...sitemapXml.matchAll(/\/items\/([a-z0-9-]+)</g)].map((m) => m[1]),
);
if (sitemapSlugs.size === 0) {
  throw new Error("sitemap.xml has zero item URLs — refusing to pass verification");
}

const itemsDir = resolve(dist, "items");
const prerenderedSlugs = new Set(
  existsSync(itemsDir)
    ? readdirSync(itemsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [],
);

const missing = [...sitemapSlugs].filter((slug) => !prerenderedSlugs.has(slug));
const extra = [...prerenderedSlugs].filter((slug) => !sitemapSlugs.has(slug));
const missingIndex = [...sitemapSlugs].filter(
  (slug) => prerenderedSlugs.has(slug) && !existsSync(resolve(itemsDir, slug, "index.html")),
);

if (missing.length || extra.length || missingIndex.length) {
  const lines = [
    `Item prerender invariant FAILED (${sitemapSlugs.size} sitemap items, ${prerenderedSlugs.size} prerendered dirs).`,
    missing.length ? `Missing prerender for: ${missing.join(", ")}` : null,
    extra.length ? `Prerendered but not in sitemap: ${extra.join(", ")}` : null,
    missingIndex.length ? `Directory exists but no index.html: ${missingIndex.join(", ")}` : null,
  ].filter(Boolean);
  throw new Error(lines.join("\n"));
}

console.log(`[verify] ${sitemapSlugs.size} sitemap item URLs each have exactly one prerendered page.`);
