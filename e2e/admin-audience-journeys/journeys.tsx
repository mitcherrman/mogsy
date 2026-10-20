import { MemoryRouter } from "react-router-dom";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { VisitorJourneysView } from "@/components/admin/users/OverviewVisitorJourneys";
import { resolveRange } from "@/lib/admin/analytics/range";
import { classifyVisitors } from "@/lib/admin/analytics/traffic";
import { buildVisitorJourneys } from "@/lib/admin/analytics/visitorJourney";
import type { AnalyticsDataset, AnalyticsEventRecord, AnalyticsSessionRecord } from "@/lib/admin/analytics/metrics";

// Static fixture rendered through the REAL projection and the REAL view. It
// exercises each evidence boundary the Overview must keep honest: a guest
// browser, a registered account backed by a current profile, an account with
// no profile, and a Daily child round that carries explicit parent evidence.
const now = Date.parse("2026-10-20T01:29:00Z");
const range = resolveRange("7d", now);
const t = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const event = (patch: Partial<AnalyticsEventRecord>): AnalyticsEventRecord => ({
  event_name: "landing_viewed", received_at: t(30), visitor_id: "v-guest", session_id: "s-guest", user_id: null,
  is_guest: true, source_system: "web", source_entity_type: null, source_entity_id: null,
  verification_type: null, metadata: null, route: "/", ...patch,
});
const session = (id: string, visitor: string, landing: string, started: string): AnalyticsSessionRecord => ({
  session_id: id, visitor_id: visitor, started_at: started, landing_path: landing, referrer: null,
  utm_source: null, utm_medium: null, utm_campaign: null, traffic_class: "human",
});
const dataset: AnalyticsDataset = {
  visitors: [],
  sessions: [
    session("s-guest", "v-guest", "/", t(60)),
    session("s-reg", "v-reg", "/lol", t(50)),
    session("s-none", "v-none", "/quiz", t(40)),
  ],
  events: [
    event({ received_at: t(58), event_name: "landing_viewed" }),
    event({ received_at: t(55), event_name: "ranked_opened", route: "/quiz/ranked" }),
    event({ received_at: t(48), visitor_id: "v-reg", session_id: "s-reg", user_id: "u-reg", is_guest: false, event_name: "hub_entered", route: "/lol" }),
    event({ received_at: t(45), visitor_id: "v-reg", session_id: "s-reg", user_id: "u-reg", is_guest: false, source_system: "railway",
      event_name: "ranked_started", source_entity_type: "ranked_participant", source_entity_id: "p-1", route: "/quiz/daily-challenge",
      metadata: { host: "daily_challenge", parent_activity_type: "daily_challenge", parent_activity_id: "d-1", parent_stage_index: 1 } }),
    event({ received_at: t(38), visitor_id: "v-none", session_id: "s-none", user_id: "u-missing", is_guest: false, event_name: "more_challenges_viewed", route: "/quiz" }),
  ],
};
const journeys = buildVisitorJourneys(dataset, range, classifyVisitors(dataset), [
  { user_id: "u-reg", is_anonymous: false },
]);
createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <main className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6" data-testid="journeys-harness">
      <VisitorJourneysView journeys={journeys} />
    </main>
  </MemoryRouter>,
);
