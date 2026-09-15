/**
 * RL2 — the demo sources for `/dev/lobby-preview`, and for nothing else.
 *
 * This module is imported by `LobbyPreviewPage` ALONE, exactly like the other
 * fixtures here. Nothing in it is reachable from `/quiz`: the lobby's props
 * default to the production reader (absent) and to the real analytics API, and
 * a production surface would have to import this file by name to see any of
 * it. Deleting this directory removes the demo completely.
 *
 * WHAT IS FABRICATED, STATED PLAINLY
 * ──────────────────────────────────
 *  - champion knowledge: every `correct`/`attempts` figure below is invented.
 *    They exist so the top-3 row can be judged at its real size and rotation;
 *    no account has ever produced them.
 *  - the analytics report: a hand-written `TrendReport` in the PREMIUM shape,
 *    so the window picker has three options to exercise. A Free account sees
 *    one window and the same two slides.
 *  - the role narrowing: `demoRoleDimension` below is the only role dimension
 *    that exists anywhere in this product. It is a demonstration of a control,
 *    not a preview of a figure.
 *
 * WHAT IS NOT FABRICATED
 * ──────────────────────
 * The champion→role assignment. Each champion is filed under the role the
 * canonical authority gives it — the backend's
 * `ranked_public/data/champion_primary_roles.csv`, read through
 * `ranked_public/champion_roles.py` — so the demo cannot teach a reviewer a
 * role mapping the product would contradict. This is a SUBSET chosen for the
 * demo, deliberately not a copy of the 173-row authority: a second full copy
 * is a second copy that can drift, and the real feature will read the
 * authority through an endpoint rather than a checked-in duplicate.
 *
 * Note the vocabulary boundary: the authority spells the bot lane "Bot" and
 * the queue/wire spelling is "adc". The queue spelling is used for the keys
 * here because that is what a `RankedRole` is.
 */
import type {
  ChampionKnowledgeEntry,
  ChampionKnowledgeSource,
} from "@/lib/quiz/championKnowledge";
import type {
  AnalyticsCapability,
  TrendReport,
} from "@/lib/quiz/analyticsApi";
import type { TrendsSource } from "@/components/quiz/trends/usePerformanceTrends";
import type { RankedRole } from "@/lib/ranked-public/roles";

/** Invented figures, canonical role filing. See the header. */
const DEMO_CHAMPION_KNOWLEDGE: Record<RankedRole, ChampionKnowledgeEntry[]> = {
  top: [
    { champion: "Darius", correct: 48, attempts: 61 },
    { champion: "Aatrox", correct: 39, attempts: 55 },
    { champion: "Camille", correct: 22, attempts: 34 },
    { champion: "Cho'Gath", correct: 9, attempts: 16 },
  ],
  jungle: [
    { champion: "Ekko", correct: 41, attempts: 52 },
    { champion: "Elise", correct: 30, attempts: 47 },
    { champion: "Amumu", correct: 27, attempts: 39 },
    { champion: "Diana", correct: 12, attempts: 21 },
  ],
  mid: [
    { champion: "Ahri", correct: 57, attempts: 70 },
    { champion: "Akali", correct: 35, attempts: 51 },
    { champion: "Annie", correct: 31, attempts: 38 },
    { champion: "Anivia", correct: 14, attempts: 25 },
  ],
  adc: [
    { champion: "Ashe", correct: 52, attempts: 64 },
    { champion: "Jhin", correct: 44, attempts: 58 },
    { champion: "Ezreal", correct: 26, attempts: 40 },
    { champion: "Draven", correct: 11, attempts: 23 },
  ],
  support: [
    { champion: "Braum", correct: 33, attempts: 45 },
    { champion: "Janna", correct: 29, attempts: 36 },
    { champion: "Blitzcrank", correct: 21, attempts: 33 },
    { champion: "Bard", correct: 8, attempts: 19 },
  ],
};

/** The demo reader. Returns `ready`, which production never does. */
export const demoChampionKnowledge: ChampionKnowledgeSource = (role) => ({
  state: "ready",
  entries: DEMO_CHAMPION_KNOWLEDGE[role] ?? [],
});

/** A reader for the account that has no champion knowledge at all — the
 *  newcomer profile — so the `ready`-but-empty branch is reviewable too, and
 *  is visibly NOT the same as production's absent. */
export const demoChampionKnowledgeEmpty: ChampionKnowledgeSource = () => ({
  state: "ready",
  entries: [],
});

const DEMO_CAPABILITY: AnalyticsCapability = {
  can_view_snapshot: true,
  snapshot_window_days: 7,
  can_view_trends: true,
  trend_windows: [7, 30, 90],
  allowed_windows: [7, 30, 90],
  can_build: true,
  reason: "demo",
};

/** Attempts scale with the window so the figures move when Time is used. */
function demoReport(windowDays: number): TrendReport {
  const scale = windowDays / 7;
  const cat = (category: string, attempts: number, accuracy: number, low = false) => ({
    category,
    attempts: Math.round(attempts * scale),
    correct: Math.round(attempts * scale * (accuracy / 100)),
    accuracy,
    low_sample: low,
  });
  const categories = [
    cat("Champions", 86, 78),
    cat("Items", 64, 71),
    cat("Abilities", 52, 65),
    cat("Runes", 30, 58),
    cat("Jungle", 18, 52),
    cat("Objectives", 7, 43, true),
  ];
  const mode = (m: string, label: string, attempts: number, accuracy: number, known = true) => ({
    mode: m,
    label,
    known,
    attempts: Math.round(attempts * scale),
    correct: Math.round(attempts * scale * (accuracy / 100)),
    accuracy,
  });
  const modes = [
    mode("practice", "Practice", 142, 72),
    mode("ranked", "Ranked", 78, 66),
    mode("daily_challenge", "Daily", 31, 81),
    mode("unknown", "Unplaced", 6, 50, false),
  ];
  const attempts = categories.reduce((n, c) => n + c.attempts, 0);
  const correct = categories.reduce((n, c) => n + c.correct, 0);
  return {
    ok: true,
    tier: "premium",
    capability: DEMO_CAPABILITY,
    windows: [7, 30, 90],
    window_days: windowDays,
    since: null,
    until: null,
    current: {
      attempts,
      correct,
      accuracy: Math.round((correct / attempts) * 100),
      active_days: Math.min(windowDays, 5 * Math.ceil(scale)),
    },
    modes,
    categories,
    counts_modes: ["practice", "ranked", "daily_challenge"],
    excludes_modes: [],
    sufficiency: { has_data: true, enough_for_trend: true, enough_for_comparison: true },
    delta: {
      attempts: 12,
      accuracy_points: 3,
      active_days: 1,
      direction: "improving",
      comparable: true,
    },
  };
}

/** Offline. Resolves from constants and touches no network. */
export const demoAnalyticsSource: TrendsSource = {
  capability: async () => ({ capability: DEMO_CAPABILITY }),
  trends: async (windowDays: number) => demoReport(windowDays),
};

/**
 * The demo role dimension — the ONLY one in the product.
 *
 * It shifts each category's accuracy by a fixed per-role offset and leaves the
 * counts alone, which is enough to show the control working without pretending
 * to model anything. `null` returns the report untouched.
 */
/**
 * The newcomer's source: a real, EMPTY record.
 *
 * Without it the preview showed an account with "Questions answered 0" in its
 * personal records and 257 answers in the chart above them — the sort of
 * disagreement a demo exists to catch rather than to commit. It also puts the
 * carousel's own empty branch beside the populated one, which is the pair a
 * reviewer needs. Note it is the FREE shape: one window, no trend keys.
 */
const EMPTY_CAPABILITY: AnalyticsCapability = {
  ...DEMO_CAPABILITY,
  can_view_trends: false,
  trend_windows: [],
  allowed_windows: [7],
};

export const demoAnalyticsSourceEmpty: TrendsSource = {
  capability: async () => ({ capability: EMPTY_CAPABILITY }),
  trends: async () =>
    ({
      ok: true,
      tier: "free",
      capability: EMPTY_CAPABILITY,
      windows: [7],
      window_days: null,
      since: null,
      until: null,
      current: { attempts: 0, correct: 0, accuracy: 0, active_days: 0 },
      modes: [],
      categories: [],
      counts_modes: [],
      excludes_modes: [],
      sufficiency: { has_data: false },
    }) as unknown as TrendReport,
};

const ROLE_TILT: Record<RankedRole, number> = {
  top: -6, jungle: 4, mid: 7, adc: -3, support: 2,
};

export function demoRoleDimension(report: TrendReport, role: RankedRole | null): TrendReport {
  if (!role) return report;
  const tilt = ROLE_TILT[role];
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return {
    ...report,
    categories: report.categories.map((c) => ({ ...c, accuracy: clamp(c.accuracy + tilt) })),
    modes: report.modes.map((m) => ({ ...m, accuracy: clamp(m.accuracy + tilt) })),
  };
}
