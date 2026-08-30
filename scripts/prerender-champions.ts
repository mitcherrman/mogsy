import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { loadEnv } from "vite";
import ChampionReference from "../src/components/league-docs/ChampionReference";
import { buildChampionJsonLd, buildChampionSeo } from "../src/lib/league-docs/seo";
import { championSlug, parseChampionNames } from "../src/lib/seo/sitemap";
import type { ChampionDoc } from "../src/lib/league-docs/api";

const env = loadEnv("production", process.cwd(), "");
const api = (
  process.env.VITE_COMBAT_API_URL ??
  env.VITE_COMBAT_API_URL ??
  ""
).replace(/\/+$/, "");
const dist = resolve("dist");
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function meta(html: string, selector: string, attribute: string, key: string, value: string) {
  const pattern = new RegExp(`<meta\\s+${selector}\\s+content="[^"]*"\\s*/?>`, "i");
  const tag = `<meta ${attribute}="${key}" content="${escape(value)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `${tag}\n</head>`);
}

function documentFor(template: string, doc: ChampionDoc) {
  const seo = buildChampionSeo(doc);
  let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(seo.title)}</title>`);
  html = meta(html, 'name="description"', "name", "description", seo.description);
  html = meta(html, 'property="og:title"', "property", "og:title", seo.title);
  html = meta(html, 'property="og:description"', "property", "og:description", seo.description);
  html = meta(html, 'property="og:type"', "property", "og:type", "article");
  html = meta(html, 'name="twitter:title"', "name", "twitter:title", seo.title);
  html = meta(html, 'name="twitter:description"', "name", "twitter:description", seo.description);
  html = html.replace(
    "</head>",
    `<link rel="canonical" href="${escape(seo.canonical)}" />\n<meta property="og:url" content="${escape(seo.canonical)}" />\n<script type="application/ld+json">${JSON.stringify(buildChampionJsonLd(doc, seo)).replace(/<\//g, "<\\/")}</script>\n</head>`,
  );
  html = html.replace(/<div id="initial-shell"[\s\S]*?<\/div>\s*/, "");
  const body = renderToStaticMarkup(ChampionReference({ doc }) as never);
  return html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

if (!api) throw new Error("VITE_COMBAT_API_URL is required to prerender champion doc pages");

const rosterResponse = await fetch(`${api}/api/meta/champions`);
if (!rosterResponse.ok) throw new Error(`champion roster fetch returned HTTP ${rosterResponse.status}`);
const names = parseChampionNames(await rosterResponse.json());
if (names.length === 0) throw new Error("champion roster is empty — refusing to prerender zero champion pages");

const template = readFileSync(resolve(dist, "index.html"), "utf8");
for (const name of names) {
  const slug = championSlug(name);
  const response = await fetch(`${api}/api/docs/champions/${slug}`);
  if (!response.ok) throw new Error(`${slug} champion doc API returned HTTP ${response.status}`);
  const doc = (await response.json()) as ChampionDoc;
  if (!doc?.champion || doc.champion.slug !== slug) throw new Error(`${slug} champion doc payload missing or mismatched`);
  const target = resolve(dist, "lol", "docs", "champions", slug);
  mkdirSync(target, { recursive: true });
  writeFileSync(resolve(target, "index.html"), documentFor(template, doc));
  console.log(`[prerender] wrote lol/docs/champions/${slug}/index.html`);
}
