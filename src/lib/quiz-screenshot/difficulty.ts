/**
 * Difficulty / League-rank signal for quiz content.
 *
 * Pure module (no fetch/fs/browser) shared by the render harness, the runner,
 * and unit tests. For now the content system uses exactly three rank tiers as
 * a difficulty signal:
 *
 *   Iron    = Easy
 *   Gold    = Medium
 *   Diamond = Hard
 *
 * Emblem assets are the real League rank PNGs served by the combat backend at
 * assets/ranks/{large,small}/{tier}.png (same asset origin as item icons), so
 * the harness resolves them through resolveQuizAssetUrl with no copying.
 */

export const DIFFICULTY_TIERS = ["iron", "gold", "diamond"] as const;
export type DifficultyTier = (typeof DIFFICULTY_TIERS)[number];

export type DifficultyInfo = {
  tier: DifficultyTier;
  /** Rank name, e.g. "Gold". */
  rankLabel: string;
  /** Difficulty word, e.g. "Medium". */
  difficultyLabel: string;
  /** Backend-relative emblem paths (resolved via resolveQuizAssetUrl). */
  emblemPath: string;
  smallEmblemPath: string;
  /** Accent color (hsl) for the badge text/glow, tuned per tier. */
  accent: string;
};

const TIER_META: Record<DifficultyTier, { rankLabel: string; difficultyLabel: string; accent: string }> = {
  iron: { rankLabel: "Iron", difficultyLabel: "Easy", accent: "hsl(210 14% 68%)" },
  gold: { rankLabel: "Gold", difficultyLabel: "Medium", accent: "hsl(43 78% 62%)" },
  diamond: { rankLabel: "Diamond", difficultyLabel: "Hard", accent: "hsl(190 82% 68%)" },
};

export function isDifficultyTier(value: unknown): value is DifficultyTier {
  return typeof value === "string" && (DIFFICULTY_TIERS as readonly string[]).includes(value);
}

/**
 * Resolve a difficulty token to its display info, or null when absent/invalid.
 * Accepts the tier name (iron/gold/diamond) case-insensitively; content code
 * chooses the tier deliberately (never a random global assignment).
 */
export function resolveDifficulty(token: unknown): DifficultyInfo | null {
  if (typeof token !== "string") return null;
  const tier = token.trim().toLowerCase();
  if (!isDifficultyTier(tier)) return null;
  const meta = TIER_META[tier];
  return {
    tier,
    rankLabel: meta.rankLabel,
    difficultyLabel: meta.difficultyLabel,
    emblemPath: `assets/ranks/large/${tier}.png`,
    smallEmblemPath: `assets/ranks/small/${tier}.png`,
    accent: meta.accent,
  };
}

/**
 * Resolve the difficulty for one question in a content run. Precedence:
 *   1. explicit run-level override (CLI --difficulty)
 *   2. per-question injected metadata (metadata.content_difficulty)
 *   3. none (no badge)
 * Deliberate selection only — there is no implicit/random fallback.
 */
export function resolveQuestionDifficulty(
  metadata: Record<string, unknown> | undefined,
  override?: string,
): DifficultyInfo | null {
  if (override) return resolveDifficulty(override);
  const injected = metadata?.content_difficulty;
  return resolveDifficulty(injected);
}
