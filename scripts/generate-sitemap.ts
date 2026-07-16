// Generates public/sitemap.xml from static routes + DB-backed leagues and custom links.
// Runs via predev / prebuild npm hooks. Uses the public anon key (read-only).

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

// This script runs under tsx (predev/prebuild), which does not auto-load .env
// files the way Vite does. Load them with Vite's own loadEnv so dev/build get
// the same variables as the app; real environment variables take precedence.
const fileEnv = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const BASE_URL = "https://mogzy.lol";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "https://kewgjwrzpzpeltwidvuc.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

// Combat/quiz backend — used for League Docs champion pages. No hardcoded
// fallback: when the env var is absent, champion entries are skipped.
const COMBAT_API_URL = (process.env.VITE_COMBAT_API_URL ?? "").replace(/\/+$/, "");

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// Mirrors LEAGUE_ONLY_MODE in src/lib/site-config.ts (this script runs
// standalone in node, so the flag is duplicated here — keep them in sync).
// While true, legacy Mogsy routes (/home, /play, /swipe*, /leagues,
// /leaderboard, /shop, /user profiles, custom links) redirect to /lol and
// must not be promoted in the sitemap.
const LEAGUE_ONLY_MODE = true;

const lolEntries: SitemapEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/lol", changefreq: "daily", priority: "1.0" },
  { path: "/quiz", changefreq: "daily", priority: "0.9" },
  { path: "/lol/tier-list", changefreq: "weekly", priority: "0.8" },
  { path: "/lol/docs", changefreq: "weekly", priority: "0.8" },
  { path: "/lol/docs/champions", changefreq: "weekly", priority: "0.7" },
  { path: "/lol/docs/pro", changefreq: "weekly", priority: "0.7" },
  { path: "/lol/docs/pro/champions", changefreq: "weekly", priority: "0.6" },
  { path: "/combat-lab", changefreq: "weekly", priority: "0.8" },
  { path: "/blog", changefreq: "daily", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.6" },
  { path: "/privacy", changefreq: "monthly", priority: "0.4" },
  { path: "/terms", changefreq: "monthly", priority: "0.4" },
  { path: "/security", changefreq: "monthly", priority: "0.5" },
  { path: "/contact", changefreq: "monthly", priority: "0.6" },
];

const legacyEntries: SitemapEntry[] = [
  { path: "/home", changefreq: "daily", priority: "0.8" },
  { path: "/play", changefreq: "daily", priority: "0.9" },
  { path: "/swipe", changefreq: "daily", priority: "0.8" },
  { path: "/swipe-game", changefreq: "daily", priority: "0.8" },
  { path: "/swipe-leagues", changefreq: "daily", priority: "0.8" },
  { path: "/leagues/presets", changefreq: "weekly", priority: "0.8" },
  { path: "/leagues/compete", changefreq: "weekly", priority: "0.8" },
  { path: "/elo-check", changefreq: "daily", priority: "0.7" },
  { path: "/shop", changefreq: "weekly", priority: "0.7" },
  { path: "/profile", changefreq: "weekly", priority: "0.6" },
  { path: "/referral", changefreq: "monthly", priority: "0.5" },
];

const staticEntries: SitemapEntry[] = LEAGUE_ONLY_MODE
  ? lolEntries
  : [...lolEntries, ...legacyEntries];

async function fetchDynamicEntries(): Promise<SitemapEntry[]> {
  // League Docs champion pages don't need Supabase — always attempt them.
  const championEntries = await fetchChampionDocEntries();

  if (!SUPABASE_ANON_KEY) {
    console.warn("[sitemap] No anon key available — skipping Supabase-backed entries.");
    return championEntries;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const entries: SitemapEntry[] = [...championEntries];

  // League-only mode: leaderboards, swipe presets, custom links and user
  // profiles all redirect to /lol — only blog posts stay indexable.
  if (LEAGUE_ONLY_MODE) {
    const blogEntries = await fetchBlogPostEntries(supabase);
    entries.push(...blogEntries);
    return entries;
  }

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

  const profileEntries = await fetchUserProfileEntries(supabase);
  entries.push(...profileEntries);

  const blogEntries = await fetchBlogPostEntries(supabase);
  entries.push(...blogEntries);

  return entries;
}

// Duplicated from src/lib/league-docs/api.ts championSlug() — this script runs
// standalone in node and can't import app modules. Keep them in sync.
function championSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// League Docs champion pages — one per champion, from the public meta endpoint.
async function fetchChampionDocEntries(): Promise<SitemapEntry[]> {
  if (!COMBAT_API_URL) {
    console.warn("[sitemap] VITE_COMBAT_API_URL not set — skipping champion doc entries.");
    return [];
  }
  try {
    const res = await fetch(`${COMBAT_API_URL}/api/meta/champions`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[sitemap] champions fetch failed: HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { champions?: Array<string | { name?: string; champion_name?: string }> };
    const entries: SitemapEntry[] = [];
    for (const c of data?.champions ?? []) {
      const name = typeof c === "string" ? c : c?.name ?? c?.champion_name;
      if (!name) continue;
      entries.push({
        path: `/lol/docs/champions/${championSlug(name)}`,
        changefreq: "weekly",
        priority: "0.6",
      });
    }
    return entries;
  } catch (err) {
    console.warn("[sitemap] champions fetch failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

// Public user profiles — one per non-bot, non-anonymous profile
async function fetchUserProfileEntries(supabase: ReturnType<typeof createClient>): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];
  const { data: profiles, error } = await supabase
    .from("public_profiles")
    .select("id, updated_at")
    .eq("is_bot", false)
    .eq("is_anonymous", false)
    .limit(2000);
  if (error) {
    console.warn("[sitemap] public_profiles fetch failed:", error.message);
    return entries;
  }
  for (const p of profiles ?? []) {
    entries.push({
      path: `/user/${p.id}`,
      lastmod: p.updated_at ? new Date(p.updated_at).toISOString().slice(0, 10) : undefined,
      changefreq: "weekly",
      priority: "0.5",
    });
  }
  return entries;
}

// Published blog posts — one per slug
async function fetchBlogPostEntries(supabase: ReturnType<typeof createClient>): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [];
  const { data: posts, error } = await supabase
    .from("blog_posts")
    .select("slug, updated_at, published_at")
    .eq("status", "published")
    .limit(5000);
  if (error) {
    console.warn("[sitemap] blog_posts fetch failed:", error.message);
    return entries;
  }
  for (const p of posts ?? []) {
    if (!p.slug) continue;
    const last = p.updated_at || p.published_at;
    entries.push({
      path: `/blog/${p.slug}`,
      lastmod: last ? new Date(last).toISOString().slice(0, 10) : undefined,
      changefreq: "weekly",
      priority: "0.8",
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
  const missing = [
    !SUPABASE_ANON_KEY && "VITE_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)",
    !COMBAT_API_URL && "VITE_COMBAT_API_URL",
  ].filter(Boolean);
  if (missing.length) {
    console.warn(
      `[sitemap] WARNING: missing ${missing.join(", ")} — the sitemap will be ` +
        `written WITHOUT its dynamic entries (champion docs, blog posts, profiles, links). ` +
        `Set them in .env or the environment before publishing this sitemap.`,
    );
  }
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