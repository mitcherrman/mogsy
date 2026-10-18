import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { AudiencePulse } from "@/components/admin/users/AudiencePulse";
import { resolveRange } from "@/lib/admin/analytics/range";
import type { AnalyticsDataset } from "@/lib/admin/analytics/metrics";
import type { VisitorClassification } from "@/lib/admin/analytics/traffic";

const now = Date.parse("2026-10-18T12:00:00Z");
const time = new Date(now - 60_000).toISOString();
const old = new Date(now - 2 * 24 * 3600_000).toISOString();
const data: AnalyticsDataset = {
  visitors: [
    { visitor_id: "human-browser-1", first_seen_at: old, first_landing_path: "/lol", first_referrer: null, first_utm_source: "youtube", first_utm_medium: "social", first_utm_campaign: "creator_launch" },
    { visitor_id: "unknown-browser-2", first_seen_at: time, first_landing_path: "/", first_referrer: "https://m.facebook.com/", first_utm_source: null, first_utm_medium: null, first_utm_campaign: null },
  ],
  sessions: [
    { session_id: "s-h1", visitor_id: "human-browser-1", started_at: old, landing_path: "/lol", referrer: null, utm_source: "youtube", utm_medium: "social", utm_campaign: "creator_launch" },
    { session_id: "s-h2", visitor_id: "human-browser-1", started_at: time, landing_path: "/quiz", referrer: null, utm_source: null, utm_medium: null, utm_campaign: null },
    { session_id: "s-u1", visitor_id: "unknown-browser-2", started_at: time, landing_path: "/", referrer: "https://m.facebook.com/", utm_source: null, utm_medium: null, utm_campaign: null },
  ],
  events: [
    { event_name: "ranked_opened", received_at: time, visitor_id: "human-browser-1", session_id: "s-h2", user_id: null, is_guest: true,
      source_system: "web", source_entity_type: null, source_entity_id: null, verification_type: null, metadata: null },
  ],
};
const classes = new Map<string, VisitorClassification>([
  ["human-browser-1", { trafficClass: "human", trafficSource: null, reason: "trusted input", overridden: false }],
  ["unknown-browser-2", { trafficClass: "unknown", trafficSource: null, reason: "no signal", overridden: false }],
]);

function Harness() {
  const [visitor, setVisitor] = useState<string | null>(null);
  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6">
      <AudiencePulse dataset={data} range={resolveRange("7d", now)} now={now}
        classification={classes} onVisitor={setVisitor} />
      {visitor && <p data-testid="selected-visitor">Selected: {visitor}</p>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
