/**
 * Academy Pulse — DEVELOPMENT FIXTURES (PULSE-1).
 *
 * Every item here is a sample with `provenance: "fixture"`; the Pulse shell
 * labels each one "Preview sample" on screen. They exist so the scenes can be
 * designed and reviewed before a real content provider exists. Rules:
 *
 *   · Players, scores, ranks, creators, streams and campaigns are INVENTED.
 *     Handles are deliberately fanciful and no item links to a real profile,
 *     video, channel or sponsor (`href` / `profileHref` / `videoId` / `channel`
 *     are null), so nothing here can be mistaken for public activity.
 *   · Facts a player could learn from (the practice question, the Premium
 *     benefits, the shipped-feature announcements) are TRUE: the question is a
 *     stable champion title, the benefits are resolved from the canonical
 *     Premium matrix (src/lib/premium/matrix.ts), and the announcements
 *     describe features that are live on Mogzy.
 *   · Links that are present point at real, public Mogzy routes.
 */
import type {
  PulseCatalogue,
  PulseItem,
  PulsePlayer,
} from "../model/pulse-types";

const player = (id: string, displayName: string, mascot: PulsePlayer["mascot"]): PulsePlayer => ({
  id: `fixture-${id}`,
  displayName,
  mascot,
  profileHref: null,
});

const P = {
  owl: player("owl", "HextechOwl", "holdingBook"),
  quill: player("quill", "RunicQuill", "thinking"),
  lantern: player("lantern", "LanternWisp", "cheering"),
  ember: player("ember", "EmberScholar", "explaining"),
  frost: player("frost", "FrostfireFox", "raisingHand"),
  moth: player("moth", "MoonlitMoth", "peeking"),
  you: player("you", "You (sample)", "base"),
};

/** Premium items carry benefit ids only; the provider resolves the copy from the matrix. */
export const PREMIUM_LEAD_BENEFIT_IDS = ["performance-trends", "missed-question-bank", "study-history"] as const;

export const PULSE_FIXTURE_ITEMS: readonly PulseItem[] = [
  /* ------------------------------------------------ player activity */
  {
    id: "fx-activity-flawless",
    kind: "activity",
    category: "player-activity",
    provenance: "fixture",
    title: "HextechOwl earned Flawless Daily with a perfect run",
    player: P.owl,
    achievement: {
      name: "Flawless Daily",
      description: "Answer every Daily Challenge question correctly in one run.",
      tier: "gold",
      context: "Daily Challenge · 11 of 11",
      criteria: ["All 11 main questions correct", "No timeouts", "Completed on the day"],
      rarityPct: 4.2,
    },
    score: { value: 9840, label: "Daily score" },
  },
  {
    id: "fx-activity-streak",
    kind: "activity",
    category: "player-activity",
    provenance: "fixture",
    title: "LanternWisp reached a 30-day study streak",
    player: P.lantern,
    achievement: {
      name: "Moonlit Devotion",
      description: "Study on thirty days in a row.",
      tier: "crystal",
      context: "Study streak · 30 days",
      criteria: ["One completed session per day", "Thirty days without a gap"],
      rarityPct: 1.6,
    },
    score: { value: 30, label: "Day streak" },
  },
  {
    id: "fx-activity-archivist",
    kind: "activity",
    category: "player-activity",
    provenance: "fixture",
    title: "RunicQuill mastered the Item Archives",
    player: P.quill,
    achievement: {
      name: "Archivist",
      description: "Answer 500 item questions correctly.",
      tier: "silver",
      context: "Items · 500 correct",
      criteria: ["500 correct item answers", "Any mode counts"],
      rarityPct: 7.9,
    },
    score: { value: 500, label: "Correct answers" },
  },

  /* ------------------------------------------------ mini-game */
  {
    id: "fx-minigame-dial",
    kind: "minigame",
    category: "mini-game",
    provenance: "fixture",
    title: "Reflex Dial: stop the needle inside the gold window",
    name: "Reflex Dial",
    tagline: "Stop the needle in the gold. One try, no score kept.",
    demo: { windowStartDeg: 212, windowSizeDeg: 34, sweepMs: 1500 },
    playHref: "/quiz/more-challenges",
    playLabel: "Bonus challenges",
  },

  /* ------------------------------------------------ sponsor */
  {
    id: "fx-sponsor-placeholder",
    kind: "sponsor",
    category: "sponsor",
    provenance: "fixture",
    title: "Sponsored placement: a placeholder campaign, no sponsor connected",
    sponsorName: "Your Brand",
    campaignTitle: "Campaign artwork goes here",
    tagline: "A placeholder slot. Real campaigns need an approved sponsor and a booked flight.",
    artUrl: null,
    ctaLabel: "Learn more",
    href: null,
  },

  /* ------------------------------------------------ leaderboard */
  {
    id: "fx-leaderboard-daily",
    kind: "leaderboard",
    category: "leaderboard",
    provenance: "fixture",
    title: "Daily Challenge leaderboard: FrostfireFox climbs to second",
    board: "Daily Challenge",
    period: "Today",
    entries: [
      { player: P.owl, score: 9840, detail: { accuracyPct: 100, streak: 12, favouriteSubject: "Items" } },
      { player: P.frost, score: 9615, detail: { accuracyPct: 91, streak: 4, favouriteSubject: "Abilities" } },
      { player: P.quill, score: 9530, detail: { accuracyPct: 91, streak: 27, favouriteSubject: "Champions" } },
      { player: P.lantern, score: 9120, detail: { accuracyPct: 82, streak: 30, favouriteSubject: "Esports" } },
      { player: P.moth, score: 8870, detail: { accuracyPct: 82, streak: 2, favouriteSubject: "Runes" } },
    ],
    movement: { fromRank: 4, toRank: 2 },
    href: null,
  },

  /* ------------------------------------------------ news */
  {
    id: "fx-news-hover",
    kind: "news",
    category: "news",
    provenance: "fixture",
    title: "The Orrery now brings a book forward when you hover it",
    variant: "announcement",
    kicker: "Academy update",
    headline: "The Orrery turns to meet you",
    summary: "Rest the pointer on a book and the whole orbit turns to bring it to the front.",
    body: [
      "Rest the pointer on any of the four books and, after a short pause, the orbit turns the shorter way and brings that book to the front.",
      "The arrows beneath the Core still turn the orbit one book at a time, and the crystal still cycles the previews.",
    ],
    dateLabel: "This week",
    artChampion: "Orianna",
    href: null,
    ctaLabel: "Read update",
  },
  {
    id: "fx-news-patch-deck",
    kind: "news",
    category: "news",
    provenance: "fixture",
    title: "The Patch Deck deals every change of a patch as a card",
    variant: "announcement",
    kicker: "Academy update",
    headline: "Deal yourself the patch",
    summary: "The Patch Deck turns every change in a patch into a card you can flip through.",
    body: [
      "The Patch Deck lays out a patch as a hand of cards: one per champion, item or system that changed.",
      "Each card shows what changed for that one champion, item or system.",
    ],
    dateLabel: "Recently",
    artChampion: "Twisted Fate",
    href: "/lol/patch-deck",
    ctaLabel: "Open the Patch Deck",
  },

  /* ------------------------------------------------ premium */
  {
    id: "fx-premium-lead",
    kind: "premium",
    category: "premium",
    provenance: "fixture",
    title: "Mogzy Premium: what it unlocks today",
    headline: "Study with the whole record",
    benefits: [], // resolved by the provider from the canonical Premium matrix
    ctaHref: "/lol/premium",
    ctaLabel: "See Premium",
  },

  /* ------------------------------------------------ personal insight */
  {
    id: "fx-insight-week",
    kind: "insight",
    category: "personal-insight",
    provenance: "fixture",
    title: "Sample insight: accuracy up eight points this week",
    headline: "Your accuracy is climbing",
    seriesLabel: "Daily accuracy, last 7 days",
    series: [62, 66, 64, 71, 69, 74, 78],
    deltaLabel: "+8 pts vs last week",
    milestone: { label: "Perfect runs to Scholar II", current: 7, target: 10 },
    href: null,
  },

  /* ------------------------------------------------ educational */
  {
    id: "fx-question-fox",
    kind: "question",
    category: "educational",
    provenance: "fixture",
    title: "Quick study: which champion is the Nine-Tailed Fox?",
    subject: "Champion lore",
    prompt: "Which champion is known as the Nine-Tailed Fox?",
    options: [
      { id: "ahri", label: "Ahri", champion: "Ahri" },
      { id: "lux", label: "Lux", champion: "Lux" },
      { id: "jinx", label: "Jinx", champion: "Jinx" },
      { id: "yasuo", label: "Yasuo", champion: "Yasuo" },
    ],
    correctId: "ahri",
    explanation: "Ahri is the Nine-Tailed Fox. Lux is the Lady of Luminosity, Jinx the Loose Cannon and Yasuo the Unforgiven.",
    practiceHref: "/quiz",
  },

  /* ------------------------------------------------ creator spotlight */
  {
    id: "fx-creator-video",
    kind: "creator",
    category: "creator-spotlight",
    provenance: "fixture",
    title: "Sample creator video: five Daily habits that stick",
    creatorName: "ArcaneAtlas",
    creatorTag: "Sample creator",
    media: {
      platform: "youtube",
      videoId: null,
      title: "Five Daily habits that actually stick",
      durationLabel: "12:48",
      thumbnailUrl: null,
      thumbnailChampion: "Ryze",
    },
    challenge: { title: "Beat their Daily", detail: "ArcaneAtlas's sample Daily score is 9,210. A creator challenge would let you play the same Daily and compare.", href: null },
  },
  {
    id: "fx-creator-stream",
    kind: "creator",
    category: "creator-spotlight",
    provenance: "fixture",
    title: "Sample live stream: a Leaguecraft marathon",
    creatorName: "StarforgeSam",
    creatorTag: "Sample streamer",
    media: {
      platform: "twitch",
      channel: null,
      title: "Leaguecraft marathon: every subject, no skips",
      live: true,
      viewersLabel: "1.2K watching",
      thumbnailUrl: null,
      thumbnailChampion: "Viktor",
    },
    challenge: null,
  },

  /* ------------------------------------------------ community challenge */
  {
    id: "fx-challenge-baron",
    kind: "challenge",
    category: "community-challenge",
    provenance: "fixture",
    title: "Sample community goal: 10,000 correct objective answers",
    name: "Objective Week",
    goalLabel: "correct objective answers, together",
    current: 7340,
    target: 10000,
    endsLabel: "3 days left",
    href: null,
  },

  /* ------------------------------------------------ event */
  {
    id: "fx-event-showcase",
    kind: "news",
    category: "event",
    provenance: "fixture",
    title: "Sample event: a weekend Academy showcase",
    variant: "event",
    kicker: "Sample event",
    headline: "Academy Showcase Weekend",
    summary: "A placeholder event to design the countdown. No event is scheduled.",
    body: [
      "This is a development sample used to design Pulse's event scene. No event is scheduled.",
      "A real event would arrive from the content provider with its own date, rules and link.",
    ],
    dateLabel: "Sample date",
    artChampion: "Seraphine",
    startsAt: "2026-11-01T18:00:00Z",
    href: null,
    ctaLabel: "Event details",
  },
];

/** The fixtures grouped by category, in rotation order. */
export function fixtureCatalogue(items: readonly PulseItem[] = PULSE_FIXTURE_ITEMS): PulseCatalogue {
  const out: Record<string, PulseItem[]> = {};
  for (const item of items) (out[item.category] ??= []).push(item);
  return out as PulseCatalogue;
}
