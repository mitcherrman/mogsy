// ---------------------------------------------------------------------------
// PULSE-2B — prototype workspace contents.
//
// Built from the SHIPPED public editorial set (the same items
// `publicPulseProvider` serves today) plus one clearly-labelled placeholder
// sponsor record in PULSE-2C's shape, as a draft. Nothing here invents a real
// sponsor, creator, player or score. The sponsor host allowlist starts empty
// and both release gates start closed, exactly as the staged migration seeds
// them, so the placeholder can rehearse the workflow but never go public.
// ---------------------------------------------------------------------------

import { PULSE_FIXTURE_ITEMS } from "@/features/academy-pulse/content/pulse-fixtures";
import { DEFAULT_PULSE_CADENCE } from "@/features/academy-pulse/model/pulse-cadence";
import type { PulseCategory } from "@/features/academy-pulse/model/pulse-types";

import {
  AUTHORABLE_KINDS,
  type AuthorablePulseItem,
  type PulseCategorySetting,
  type PulseContentRecord,
  type PulsePartnerRecord,
  type PulseWorkspaceSnapshot,
} from "./contract";

export const ALL_PULSE_CATEGORIES: readonly PulseCategory[] = [
  "player-activity",
  "mini-game",
  "sponsor",
  "leaderboard",
  "news",
  "premium",
  "personal-insight",
  "educational",
  "creator-spotlight",
  "community-challenge",
  "event",
];

/** Categories with no authoritative public source yet (PULSE-2A) start disabled. */
const PROVIDER_ONLY_UNTIL_LIVE: ReadonlySet<PulseCategory> = new Set<PulseCategory>([
  "player-activity",
  "leaderboard",
  "personal-insight",
  "community-challenge",
]);

function fixture(id: string): AuthorablePulseItem {
  const item = PULSE_FIXTURE_ITEMS.find((i) => i.id === id);
  if (!item || !(AUTHORABLE_KINDS as readonly string[]).includes(item.kind)) throw new Error(`seed: ${id}`);
  return { ...(item as AuthorablePulseItem), provenance: "live" };
}

function record(id: string, label: string, payload: AuthorablePulseItem, extra: Partial<PulseContentRecord>, at: string): PulseContentRecord {
  return {
    id, label, payload: { ...payload, id }, state: "draft", publishAt: null, expiresAt: null, priority: 100, featured: false,
    revision: 1, createdAt: at, updatedAt: at, publishedAt: null, note: "", ...extra,
  };
}

export const PROTOTYPE_SPONSOR_ID = "placeholder-sponsor";

export function prototypeSeed(now: Date = new Date()): Omit<PulseWorkspaceSnapshot, "serverNow" | "contractVersion"> {
  const at = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const published = { state: "published" as const, publishedAt: at };
  const day = 86_400_000;

  const items: PulseContentRecord[] = [
    record("pc-news-hover", "Orrery hover-to-front", fixture("fx-news-hover"), { ...published, priority: 10 }, at),
    record("pc-news-patch-deck", "Patch Deck launch", fixture("fx-news-patch-deck"), { ...published, priority: 20, featured: true }, at),
    record("pc-question-fox", "Quick study: Nine-Tailed Fox", fixture("fx-question-fox"), published, at),
    record("pc-minigame-dial", "Reflex Dial taster", fixture("fx-minigame-dial"), published, at),
    record(
      "pc-draft-announcement",
      "Draft: next Academy update",
      {
        id: "", kind: "news", category: "news", provenance: "live", title: "Draft announcement", variant: "announcement",
        kicker: "Academy update", headline: "Draft headline", summary: "Write the summary the Home Hub shows.",
        body: ["Write the article the expanded view shows."], dateLabel: "Academy update", href: null, ctaLabel: "Read update",
      },
      { note: "Prototype draft: replace before publishing." },
      at,
    ),
  ];

  // example.com is reserved for documentation (RFC 2606): this is not a sponsor.
  const partners: PulsePartnerRecord[] = [
    {
      type: "sponsor",
      compensation: null,
      revision: 1,
      createdAt: at,
      updatedAt: at,
      note: "No sponsor is booked. Rehearses approval, the host allowlist and the release gate only.",
      decisionNote: "",
      record: {
        id: PROTOTYPE_SPONSOR_ID,
        sponsorName: "Placeholder Co",
        campaignTitle: "Workflow rehearsal",
        tagline: "A placeholder campaign: no sponsor is booked.",
        ctaLabel: "Learn more",
        artwork: { url: "/placeholder.svg", alt: "Placeholder campaign artwork" },
        destinationUrl: "https://example.com/rehearsal",
        approvedHosts: ["example.com"],
        disclosure: { label: "Sponsored", advertiser: "Placeholder Co" },
        window: { startsAt: new Date(now.getTime() - day).toISOString(), endsAt: new Date(now.getTime() + 30 * day).toISOString() },
        placement: { surfaces: ["academy-pulse"] },
        status: "draft",
        approval: null,
        provenance: { source: "owner-entry", recordedBy: "owner", recordedAt: at },
      },
    },
  ];

  const categories: PulseCategorySetting[] = ALL_PULSE_CATEGORIES.map((category) => ({
    category,
    enabled: !PROVIDER_ONLY_UNTIL_LIVE.has(category),
    maxPerCycle: null,
    expiresAt: null,
    revision: 1,
  }));

  return {
    items,
    partners,
    categories,
    sponsorHostAllowlist: [],
    gates: { sponsorDisclosureRendered: false, paidCreatorDisclosureRendered: false },
    schedule: {
      slots: [...DEFAULT_PULSE_CADENCE.slots],
      maxPromotionsPerCycle: DEFAULT_PULSE_CADENCE.maxPromotionsPerCycle,
      minPromotionGap: DEFAULT_PULSE_CADENCE.minPromotionGap,
      kill: { active: false, scope: "partners", reason: "", changedAt: null },
      revision: 1,
    },
  };
}
