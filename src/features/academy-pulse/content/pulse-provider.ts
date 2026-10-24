/**
 * Academy Pulse — content providers.
 *
 * A provider answers one question, "what is there to show?", as a catalogue
 * grouped by category. It never decides order (that is the cadence) and never
 * draws anything (that is the scenes). PULSE-1 ships the fixture provider; a
 * live provider (Academy activity, leaderboards, creator feeds, sponsor
 * flights) plugs in behind the same interface later.
 */
import { benefitById } from "@/lib/premium/matrix";

import type { PremiumBenefitView, PulseCatalogue, PulseContentProvider, PulseItem } from "../model/pulse-types";
import { PREMIUM_LEAD_BENEFIT_IDS, PULSE_FIXTURE_ITEMS, fixtureCatalogue } from "./pulse-fixtures";

/**
 * Premium copy comes ONLY from the canonical matrix: shipped, differentiating
 * rows with a user-facing summary. A withdrawn benefit simply drops out.
 */
export function resolvePremiumBenefits(ids: readonly string[]): PremiumBenefitView[] {
  return ids.flatMap((id) => {
    const b = benefitById(id);
    if (!b || b.status !== "shipped" || !b.differentiator || !b.userFacingSummary) return [];
    return [{ id: b.id, label: b.label, summary: b.userFacingSummary }];
  });
}

function withResolvedPremium(item: PulseItem): PulseItem {
  if (item.kind !== "premium" || item.benefits.length > 0) return item;
  return { ...item, benefits: resolvePremiumBenefits(PREMIUM_LEAD_BENEFIT_IDS) };
}

/** The fixtures with their Premium rows resolved (fixtures need no network). */
export function fixturePulseCatalogue(): PulseCatalogue {
  return fixtureCatalogue(PULSE_FIXTURE_ITEMS.map(withResolvedPremium));
}

export const fixturePulseProvider: PulseContentProvider = {
  id: "fixtures-v1",
  load: async () => fixturePulseCatalogue(),
  peek: () => fixturePulseCatalogue(),
};


/**
 * Initial public launch catalogue. Until PULSE-2 has consented, authoritative
 * player results, sponsor bookings and real creator URLs, public viewers get
 * ONLY verified Academy editorial content and an unscored mini-game.
 *
 * Never expose fake players, rankings, personal metrics, sponsor campaigns,
 * Twitch LIVE badges or upcoming event dates on the public Home Hub.
 * The development scene lab keeps the full explicitly labelled fixture set.
 */
export const PUBLIC_PULSE_ITEM_IDS: readonly string[] = [
  "fx-minigame-dial",
  "fx-news-hover",
  "fx-news-patch-deck",
  "fx-premium-lead",
  "fx-question-fox",
];

export function publicPulseCatalogue(): PulseCatalogue {
  const allowed = new Set(PUBLIC_PULSE_ITEM_IDS);
  const safe = PULSE_FIXTURE_ITEMS
    .filter((item) => allowed.has(item.id))
    .map((item): PulseItem => {
      const resolved = withResolvedPremium(item);
      if (resolved.kind === "news") {
        return { ...resolved, id: `editorial-${resolved.id}`, provenance: "live", dateLabel: "Academy update" };
      }
      return { ...resolved, id: `editorial-${resolved.id}`, provenance: "live" };
    });
  return fixtureCatalogue(safe);
}

export const publicPulseProvider: PulseContentProvider = {
  id: "public-editorial-v1",
  load: async () => publicPulseCatalogue(),
  peek: () => publicPulseCatalogue(),
};
