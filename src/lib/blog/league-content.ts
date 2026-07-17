/**
 * Deterministic rule for which blog posts belong to the League-first Mogzy
 * public surface. Used by BlogPost (noindex for unrelated legacy posts) and
 * by the sitemap generator (only League posts are listed for review).
 *
 * Conservative explicit allowlist — the product already tags League content
 * with the "League of Legends" tag (see LolHub's blog strip). Posts without
 * a matching tag/category are still reachable, just not promoted/indexed.
 */

export const LEAGUE_BLOG_TAG = "League of Legends";

const LEAGUE_CATEGORY_ALLOWLIST = new Set(["league of legends", "lol", "league"]);

export function isLeagueBlogPost(post: {
  tags?: string[] | null;
  category?: string | null;
}): boolean {
  if (post.tags?.some((t) => t === LEAGUE_BLOG_TAG)) return true;
  const category = post.category?.trim().toLowerCase();
  return !!category && LEAGUE_CATEGORY_ALLOWLIST.has(category);
}
