// PULSE-2B — blank starting points for the owner's "New" menu. Every
// template is a draft that fails publish checks until the owner fills it in
// (empty headline / no answers), so nothing goes live blank. Sponsor and
// creator content are partner records (Partners tab), not editorial items.
import type { PulseItemInput } from "./contract";

export type PulseTemplateId = "announcement" | "event" | "question" | "minigame";

export const TEMPLATE_LABEL: Record<PulseTemplateId, string> = {
  announcement: "Announcement",
  event: "Event",
  question: "Quick-study question",
  minigame: "Mini-game feature",
};

const common = { id: null, publishAt: null, expiresAt: null, priority: 100, featured: false, note: "" } as const;

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
  }
}
