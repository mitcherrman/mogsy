/**
 * Academy Pulse — the cadence scheduler (pure, deterministic).
 *
 * Turns a cadence (an owner-configurable list of category slots) and a
 * catalogue into one cycle of concrete items. Rules, in order:
 *
 *   1. A slot whose category has nothing renderable is skipped: no empty scenes.
 *   2. Within one cycle an item is never shown twice. A category that appears
 *      twice in the cadence ("player-activity") takes its next item; with only
 *      one item, the second slot is skipped rather than repeated.
 *   3. Each new cycle advances every category's rotation, so content inside a
 *      category is replaceable and takes turns across cycles.
 *   4. Promotional scenes (sponsor, premium) are capped per cycle and kept at
 *      least `minPromotionGap` positions apart, including across the wrap from
 *      the end of a cycle to the start of the next.
 *   5. Two scenes of the same kind never run back to back (a News followed by
 *      an Event would read as one long scene); the later one is skipped.
 */
import {
  PROMOTIONAL_CATEGORIES,
  type PulseCadence,
  type PulseCatalogue,
  type PulseCategory,
  type PulseItem,
} from "./pulse-types";

export const DEFAULT_PULSE_CADENCE: PulseCadence = {
  slots: [
    "player-activity",
    "mini-game",
    "sponsor",
    "leaderboard",
    "news",
    "premium",
    "player-activity",
    "personal-insight",
    "educational",
    "creator-spotlight",
    "community-challenge",
    "event",
  ],
  maxPromotionsPerCycle: 2,
  minPromotionGap: 3,
};

/** Can this item be drawn at all? Broken or empty payloads never reach a scene. */
export function isRenderable(item: PulseItem): boolean {
  switch (item.kind) {
    case "activity":
      return item.player.displayName.trim() !== "" && item.achievement.name.trim() !== "";
    case "minigame":
      return item.demo.windowSizeDeg > 0 && item.demo.windowSizeDeg < 360 && item.demo.sweepMs > 0 && item.playHref !== "";
    case "leaderboard":
      return item.entries.length >= 3
        && (item.movement === null
          || (item.movement.toRank >= 1 && item.movement.fromRank > item.movement.toRank && item.movement.toRank <= item.entries.length));
    case "news":
      return item.headline.trim() !== "";
    case "premium":
      return item.benefits.length > 0 && item.ctaHref !== "";
    case "sponsor":
      return item.sponsorName.trim() !== "" && item.campaignTitle.trim() !== "";
    case "creator":
      return item.creatorName.trim() !== "" && item.media.title.trim() !== "";
    case "insight":
      return item.series.length >= 2 && item.milestone.target > 0;
    case "question":
      return item.options.length >= 2 && item.options.some((o) => o.id === item.correctId);
    case "challenge":
      return item.target > 0 && item.current >= 0;
    default:
      return false;
  }
}

function promotional(item: PulseItem): boolean {
  return PROMOTIONAL_CATEGORIES.has(item.category);
}

/**
 * One cycle of the cadence. `cycle` (0, 1, 2 …) selects which item of each
 * category takes the slot, so successive cycles rotate the content.
 */
export function buildPulseCycle(
  catalogue: PulseCatalogue,
  cadence: PulseCadence,
  cycle = 0,
): PulseItem[] {
  const pools = new Map<PulseCategory, PulseItem[]>();
  const occurrences = new Map<PulseCategory, number>();
  for (const slot of cadence.slots) {
    occurrences.set(slot, (occurrences.get(slot) ?? 0) + 1);
    if (!pools.has(slot)) pools.set(slot, (catalogue[slot] ?? []).filter((i) => i.category === slot && isRenderable(i)));
  }

  const seen = new Map<PulseCategory, number>();
  const used = new Set<string>();
  const out: PulseItem[] = [];
  let promotions = 0;
  let lastPromotion = -Infinity;

  for (const slot of cadence.slots) {
    const pool = pools.get(slot) ?? [];
    const k = seen.get(slot) ?? 0;
    seen.set(slot, k + 1);
    if (pool.length === 0) continue;

    const start = (Math.max(0, cycle) * (occurrences.get(slot) ?? 1) + k) % pool.length;
    let pick: PulseItem | null = null;
    for (let step = 0; step < pool.length; step++) {
      const candidate = pool[(start + step) % pool.length];
      if (!used.has(candidate.id)) { pick = candidate; break; }
    }
    if (!pick) continue;

    const previous = out[out.length - 1];
    if (previous && previous.kind === pick.kind) continue;

    if (promotional(pick)) {
      if (promotions >= cadence.maxPromotionsPerCycle) continue;
      if (out.length - lastPromotion < cadence.minPromotionGap) continue;
      promotions++;
      lastPromotion = out.length;
    }
    used.add(pick.id);
    out.push(pick);
  }

  // The cycle repeats: guard the seam between its end and its start.
  while (out.length > 1) {
    const last = out[out.length - 1];
    const first = out[0];
    if (last.kind === first.kind) { out.pop(); continue; }
    const firstPromo = out.findIndex(promotional);
    const lastPromo = out.length - 1 - [...out].reverse().findIndex(promotional);
    if (firstPromo >= 0 && lastPromo !== firstPromo && firstPromo + (out.length - lastPromo) < cadence.minPromotionGap) {
      out.splice(lastPromo, 1);
      continue;
    }
    break;
  }
  return out;
}

/** Positions of promotional scenes in a cycle (for tests and diagnostics). */
export function promotionPositions(cycle: readonly PulseItem[]): number[] {
  return cycle.flatMap((item, i) => (promotional(item) ? [i] : []));
}
