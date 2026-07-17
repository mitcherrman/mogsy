/**
 * Pure sitemap builders shared by scripts/generate-sitemap.ts and its tests.
 * No I/O here — the script does the fetching/writing; these functions decide
 * what belongs in the sitemap and render deterministic XML.
 */

// Relative imports (not "@/" aliases) so scripts/generate-sitemap.ts can load
// this module under plain tsx without tsconfig path resolution.
import { SITE_URL } from "../site-config";
import { isLeagueBlogPost } from "../blog/league-content";

export interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

/**
 * Static, always-present indexable routes for the League-only public site.
 * Thin/per-user/auth/dev/admin routes are deliberately absent.
 */
export function buildStaticEntries(): SitemapEntry[] {
  return [
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
}

/** Champion doc entries from validated champion names. */
export function championDocEntries(names: string[]): SitemapEntry[] {
  return names
    .filter((n) => typeof n === "string" && n.trim() !== "")
    .map((name) => ({
      path: `/lol/docs/champions/${championSlug(name)}`,
      changefreq: "weekly" as const,
      priority: "0.6",
    }));
}

/**
 * Pro-data year pages: only years that actually have imported game rows —
 * empty/pending years render an unavailable state and must not be promoted.
 */
export function proYearEntries(
  years: Array<{ year: number; data?: { game_rows?: number } }>,
): SitemapEntry[] {
  return years
    .filter((y) => Number.isInteger(y.year) && (y.data?.game_rows ?? 0) > 0)
    .map((y) => ({
      path: `/lol/docs/pro/years/${y.year}`,
      changefreq: "monthly" as const,
      priority: "0.6",
    }));
}

/** Blog entries: League/Mogzy-relevant published posts only. */
export function leagueBlogEntries(
  posts: Array<{
    slug: string | null;
    tags?: string[] | null;
    category?: string | null;
    updated_at?: string | null;
    published_at?: string | null;
  }>,
): SitemapEntry[] {
  return posts
    .filter((p) => !!p.slug && isLeagueBlogPost(p))
    .map((p) => {
      const last = p.updated_at || p.published_at;
      return {
        path: `/blog/${p.slug}`,
        lastmod: last ? new Date(last).toISOString().slice(0, 10) : undefined,
        changefreq: "weekly" as const,
        priority: "0.8",
      };
    });
}

// Mirrors src/lib/league-docs championSlug(); kept here so the standalone
// sitemap script has a single import point.
export function championSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${SITE_URL}${e.path}</loc>`,
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
