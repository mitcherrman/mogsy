/**
 * Display formatting for a question's category.
 *
 * PRESENTATION ONLY. The category IDENTIFIER is backend data and is never
 * rewritten, mapped, or reinterpreted here — this turns the raw token into
 * something a reader can scan (`post_mitigation_damage` →
 * `post mitigation damage`, uppercased by CSS at the call site) and nothing
 * else. There is deliberately no lookup table: a per-category display map
 * would be a second source of truth for what a category means, and it would
 * silently fall back to the raw token for every category added later.
 *
 * The rule was already implemented inline in CompactScenarioBand; it lives
 * here so the cinematic header and the compact band format identically.
 */
export function formatCategoryLabel(
  category: string | null | undefined,
  fallback = "",
): string {
  return (category ?? "").replace(/_/g, " ").trim() || fallback;
}
