// Generates public/sitemap.xml from static routes + DB-backed leagues and custom links.
// Runs via predev / prebuild npm hooks. Uses the public anon key (read-only).

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://mogsy.app";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "https://kewgjwrzpzpeltwidvuc.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const staticEntries: SitemapEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/home", changefreq: "daily", priority: "0.8" },
  { path: "/play", changefreq: "daily", priority: "0.9" },
  { path: "/swipe", changefreq: "daily", priority: "0.8" },
  { path: "/swipe-game", changefreq: "daily", priority: "0.8" },
  { path: "/swipe-leagues", changefreq: "daily", priority: "0.8" },
  { path: "/leagues/presets", changefreq: "weekly", priority: "0.8" },
  { path: "/leagues/compete", changefreq: "weekly", priority: "0.8" },
  { path: "/elo-check", changefreq: "daily", priority: "0.7" },
  { path: "/shop", changefreq: "weekly", priority: "0.7" },
  { path: "/auth", changefreq: "monthly", priority: "0.5" },
  { path: "/profile", changefreq: "weekly", priority: "0.6" },
  { path: "/referral", changefreq: "monthly", priority: "0.5" },
];

async function fetchDynamicEntries(): Promise<SitemapEntry[]> {
  if (!SUPABASE_ANON_KEY) {
    console.warn("[sitemap] No anon key available — skipping dynamic entries.");
    return [];
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const entries: SitemapEntry[] = [];

  // Public leaderboards — one per league
  const { data: leagues, error: lErr } = await supabase
    .from("leagues")
    .select("id, type, created_at")
    .limit(2000);
  if (lErr) console.warn("[sitemap] leagues fetch failed:", lErr.message);
  for (const l of leagues ?? []) {
    entries.push({
      path: `/leaderboard/${l.id}`,
      lastmod: l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : undefined,
      changefreq: "daily",
      priority: "0.6",
    });
    if (l.type === "preset") {
      entries.push({
        path: `/swipe/preset/${l.id}`,
        lastmod: l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : undefined,
        changefreq: "daily",
        priority: "0.6",
      });
    }
  }

  // Active custom short links
  const { data: links, error: cErr } = await supabase
    .from("custom_links")
    .select("slug, created_at")
    .eq("is_active", true)
    .limit(2000);
  if (cErr) console.warn("[sitemap] custom_links fetch failed:", cErr.message);
  for (const c of links ?? []) {
    if (!c.slug) continue;
    entries.push({
      path: `/${c.slug}`,
      lastmod: c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : undefined,
      changefreq: "weekly",
      priority: "0.5",
    });
  }

  return entries;
}

function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    ``,
  ].join("\n");
}

async function main() {
  const dynamic = await fetchDynamicEntries();
  const all = [...staticEntries, ...dynamic];
  writeFileSync(resolve("public/sitemap.xml"), renderSitemap(all));
  console.log(`[sitemap] wrote ${all.length} entries (${staticEntries.length} static + ${dynamic.length} dynamic)`);
}

main().catch((err) => {
  console.error("[sitemap] generation failed:", err);
  // Don't fail the build — fall back to existing sitemap.xml
  process.exit(0);
});