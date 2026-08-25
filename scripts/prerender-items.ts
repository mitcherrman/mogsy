import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ItemReference from "../src/components/items/ItemReference";
import { buildItemJsonLd, buildItemSeo } from "../src/lib/items/seo";
import { PRERENDERED_ITEM_SLUGS } from "../src/lib/items/prerender-manifest";
import { itemIconUrl, type CanonicalItem } from "../src/lib/items/types";

const api = (process.env.VITE_COMBAT_API_URL ?? "").replace(/\/+$/, "");
const dist = resolve("dist");
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
function meta(html: string, selector: string, attribute: string, key: string, value: string) {
  const pattern = new RegExp(`<meta\\s+${selector}\\s+content="[^"]*"\\s*/?>`, "i");
  const tag = `<meta ${attribute}="${key}" content="${escape(value)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `${tag}\n</head>`);
}
function documentFor(template: string, item: CanonicalItem) {
  const icon = itemIconUrl(api, item.icon_path);
  const seo = buildItemSeo(item, icon);
  let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(seo.title)}</title>`);
  html = meta(html, 'name="description"', "name", "description", seo.description);
  html = meta(html, 'property="og:title"', "property", "og:title", seo.title);
  html = meta(html, 'property="og:description"', "property", "og:description", seo.description);
  html = meta(html, 'property="og:type"', "property", "og:type", "article");
  html = meta(html, 'name="twitter:title"', "name", "twitter:title", seo.title);
  html = meta(html, 'name="twitter:description"', "name", "twitter:description", seo.description);
  if (seo.image) {
    html = meta(html, 'property="og:image"', "property", "og:image", seo.image);
    html = meta(html, 'name="twitter:image"', "name", "twitter:image", seo.image);
  }
  html = html.replace("</head>", `<link rel="canonical" href="${escape(seo.canonical)}" />\n<meta property="og:url" content="${escape(seo.canonical)}" />\n<script type="application/ld+json">${JSON.stringify(buildItemJsonLd(item, seo)).replace(/<\//g, "<\\/")}</script>\n</head>`);
  html = html.replace(/<div id="initial-shell"[\s\S]*?<\/div>\s*/, "");
  const body = renderToStaticMarkup(ItemReference({ item, iconUrl: icon }) as never);
  return html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}
if (!api) throw new Error("VITE_COMBAT_API_URL is required to prerender certified item pages");
const template = readFileSync(resolve(dist, "index.html"), "utf8");
for (const slug of PRERENDERED_ITEM_SLUGS) {
  const response = await fetch(`${api}/api/items/${slug}`);
  if (!response.ok) throw new Error(`${slug} API returned HTTP ${response.status}`);
  const item = (await response.json() as { item?: CanonicalItem }).item;
  if (!item || item.slug !== slug) throw new Error(`${slug} canonical payload missing or mismatched`);
  const target = resolve(dist, "items", slug);
  mkdirSync(target, { recursive: true });
  writeFileSync(resolve(target, "index.html"), documentFor(template, item));
  console.log(`[prerender] wrote items/${slug}/index.html`);
}
