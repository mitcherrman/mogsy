// PULSE-2B — blank starting points for the owner's "New" menu. Every
// template is a draft that fails publish checks until the owner fills it in
// (empty headline / no campaign / no real media), so nothing goes live blank.
import type { PulseItemInput } from "./contract";

export type PulseTemplateId = "announcement" | "event" | "question" | "minigame" | "sponsor" | "creator-video" | "creator-stream";

export const TEMPLATE_LABEL: Record<PulseTemplateId, string> = {
  announcement: "Announcement",
  event: "Event",
  question: "Quick-study question",
  minigame: "Mini-game feature",
  sponsor: "Sponsor placement",
  "creator-video": "Creator video",
  "creator-stream": "Creator stream",
};

const common = { id: null, publishAt: null, expiresAt: null, priority: 100, featured: false, campaignId: null, note: "" } as const;

export function newItemInput(t: PulseTemplateId): PulseItemInput {
  switch (t) {
    case "announcement":
    case "event":
      return {
        ...common,
        label: t === "event" ? "New event" : "New announcement",
        payload: {
          id: "", kind: "news", category: t === "event" ? "event" : "news", provenance: "live",
          title: "", variant: t, kicker: t === "event" ? "Academy event" : "Academy update",
          headline: "", summary: "", body: [""], dateLabel: "Academy update", href: null,
          ctaLabel: t === "event" ? "See details" : "Read update",
          ...(t === "event" ? { startsAt: undefined } : {}),
        },
      };
    case "question":
      return {
        ...common,
        label: "New question",
        payload: {
          id: "", kind: "question", category: "educational", provenance: "live", title: "", subject: "",
          prompt: "", options: [{ id: "a", label: "" }, { id: "b", label: "" }], correctId: "a", explanation: "", practiceHref: "/quiz",
        },
      };
    case "minigame":
      return {
        ...common,
        label: "New mini-game feature",
        payload: {
          id: "", kind: "minigame", category: "mini-game", provenance: "live", title: "", name: "", tagline: "",
          demo: { windowStartDeg: 200, windowSizeDeg: 36, sweepMs: 1800 }, playHref: "/quiz/more-challenges", playLabel: "Play",
        },
      };
    case "sponsor":
      return {
        ...common,
        label: "New sponsor placement",
        payload: {
          id: "", kind: "sponsor", category: "sponsor", provenance: "live", title: "", sponsorName: "", campaignTitle: "",
          tagline: "", artUrl: null, ctaLabel: "Learn more", href: null,
        },
      };
    case "creator-video":
    case "creator-stream":
      return {
        ...common,
        label: "New creator spotlight",
        payload: {
          id: "", kind: "creator", category: "creator-spotlight", provenance: "live", title: "", creatorName: "", creatorTag: "",
          challenge: null,
          media: t === "creator-video"
            ? { platform: "youtube", videoId: null, title: "", durationLabel: "", thumbnailUrl: null }
            : { platform: "twitch", channel: null, title: "", live: false, viewersLabel: "", thumbnailUrl: null },
        },
      };
  }
}
