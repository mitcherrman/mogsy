// Generates public/sitemap.xml for the League-only public site.
// Runs via predev / prebuild npm hooks. Uses the public anon key (read-only).
//
// Deterministic behavior:
//  - The static indexable subset is ALWAYS generated (never a stale file).
//  - Dynamic entries (champion docs, pro-data years, League blog posts) are
//    appended only after a successful, validated fetch; each failure logs a
//    clear warning and simply omits that group — no stale dynamic URLs are
//    ever carried forward from a previous run.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildStaticEntries,
  championDocEntries,
  leagueBlogEntries,
  proYearEntries,
  renderSitemap,
  type SitemapEntry,
} from "../src/lib/seo/sitemap";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "https://kewgjwrzpzpeltwidvuc.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

// Combat/quiz backend — used for League Docs champion pages and pro-data
// years. No hardcoded fallback: when the env var is absent, those dynamic
// entries are omitted with an explicit warning.
const COMBAT_API_URL = (process.env.VITE_COMBAT_API_URL ?? "").replace(/\/+$/, "");

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchChampionEntries(): Promise<SitemapEntry[]> {
  if (!COMBAT_API_URL) {
    console.warn(
      "[sitemap] VITE_COMBAT_API_URL not set — champion doc pages OMITTED from this sitemap.",
    );
    return [];
  }
  try {
    const data = await fetchJson<{
      champions?: Array<string | { name?: string; champion_name?: string }>;
    }>(`${COMBAT_API_URL}/api/meta/champions`);
    const names = (data?.champions ?? [])
      .map((c) => (typeof c === "string" ? c : c?.name ?? c?.champion_name ?? ""))
      .filter(Boolean);
    return championDocEntries(names);
  } catch (err) {
    console.warn(
      "[sitemap] champions fetch failed — champion doc pages OMITTED:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

async function fetchProYearEntriesFromApi(): Promise<SitemapEntry[]> {
  if (!COMBAT_API_URL) {
    console.warn("[sitemap] VITE_COMBAT_API_URL not set — pro-data year pages OMITTED.");
    return [];
  }
  try {
    const data = await fetchJson<{
      years?: Array<{ year: number; data?: { game_rows?: number } }>;
    }>(`${COMBAT_API_URL}/api/docs/pro/coverage`);
    return proYearEntries(data?.years ?? []);
  } catch (err) {
    console.warn(
      "[sitemap] pro coverage fetch failed — pro-data year pages OMITTED:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

async function fetchBlogEntries(): Promise<SitemapEntry[]> {
  if (!SUPABASE_ANON_KEY) {
    console.warn("[sitemap] No Supabase anon key — blog posts OMITTED.");
    return [];
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: posts, error } = await supabase
    .from("blog_posts")
    .select("slug, tags, category, updated_at, published_at")
    .eq("status", "published")
    .limit(5000);
  if (error) {
    console.warn("[sitemap] blog_posts fetch failed — blog posts OMITTED:", error.message);
    return [];
  }
  const entries = leagueBlogEntries((posts ?? []) as never);
  const excluded = (posts ?? []).length - entries.length;
  if (excluded > 0) {
    console.log(
      `[sitemap] excluded ${excluded} non-League blog posts (League-first review surface).`,
    );
  }
  return entries;
}

async function main() {
  const staticEntries = buildStaticEntries();
  const [champions, proYears, blog] = await Promise.all([
    fetchChampionEntries(),
    fetchProYearEntriesFromApi(),
    fetchBlogEntries(),
  ]);
  const all = [...staticEntries, ...champions, ...proYears, ...blog];
  writeFileSync(resolve("public/sitemap.xml"), renderSitemap(all));
  console.log(
    `[sitemap] wrote ${all.length} entries (${staticEntries.length} static + ${champions.length} champions + ${proYears.length} pro years + ${blog.length} blog)`,
  );
}

main().catch((err) => {
  // Even on unexpected failure, write the deterministic static subset rather
  // than leaving a stale file from a previous run on disk.
  console.error("[sitemap] generation failed — writing static subset only:", err);
  try {
    const staticEntries = buildStaticEntries();
    writeFileSync(resolve("public/sitemap.xml"), renderSitemap(staticEntries));
    console.warn(`[sitemap] wrote ${staticEntries.length} static entries (dynamic pages omitted).`);
  } catch (writeErr) {
    console.error("[sitemap] could not write fallback sitemap:", writeErr);
    process.exit(1);
  }
});
