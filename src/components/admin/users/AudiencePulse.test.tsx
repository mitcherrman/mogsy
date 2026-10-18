import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsDataset } from "@/lib/admin/analytics/metrics";
import { resolveRange } from "@/lib/admin/analytics/range";
import type { VisitorClassification } from "@/lib/admin/analytics/traffic";
import { AudiencePulse } from "./AudiencePulse";

const NOW = Date.parse("2026-10-18T12:00:00.000Z");
const at = new Date(NOW - 60_000).toISOString();
const earlier = new Date(NOW - 48 * 60 * 60_000).toISOString();
const range = resolveRange("7d", NOW);
const classification = new Map<string, VisitorClassification>([
  ["human-browser", { trafficClass: "human", trafficSource: null, reason: "trusted input", overridden: false }],
  ["unknown-browser", { trafficClass: "unknown", trafficSource: null, reason: "no signal", overridden: false }],
]);

const dataset: AnalyticsDataset = {
  visitors: [
    { visitor_id: "human-browser", first_seen_at: earlier, first_landing_path: "/lol",
      first_referrer: null, first_utm_source: null, first_utm_medium: null, first_utm_campaign: null },
    { visitor_id: "unknown-browser", first_seen_at: at, first_landing_path: "/",
      first_referrer: "https://m.facebook.com/", first_utm_source: null, first_utm_medium: null, first_utm_campaign: null },
  ],
  sessions: [
    { session_id: "old-session", visitor_id: "human-browser", started_at: earlier,
      landing_path: "/lol", referrer: null, utm_source: null, utm_medium: null, utm_campaign: null },
    { session_id: "recent-human", visitor_id: "human-browser", started_at: at,
      landing_path: "/lol", referrer: null, utm_source: null, utm_medium: null, utm_campaign: null },
    { session_id: "recent-unknown", visitor_id: "unknown-browser", started_at: at,
      landing_path: "/", referrer: "https://m.facebook.com/", utm_source: null, utm_medium: null, utm_campaign: null },
  ],
  events: [
    { event_name: "ranked_opened", received_at: at, visitor_id: "human-browser",
      session_id: "recent-human", user_id: null, is_guest: true, source_system: "web",
      source_entity_type: null, source_entity_id: null, verification_type: null, metadata: null },
  ],
};

afterEach(cleanup);

describe("Audience Pulse", () => {
  it("keeps human-signal and unknown identities separate and never invents first plays", () => {
    render(<AudiencePulse dataset={dataset} classification={classification}
      range={range} now={NOW} onVisitor={() => {}} />);
    expect(screen.getByTestId("pulse-arrivals")).toHaveTextContent("1");
    expect(screen.getByTestId("pulse-arrivals")).toHaveTextContent("1 unknown");
    expect(screen.getByTestId("pulse-first-plays")).toHaveTextContent("Not yet reliable");
    expect(screen.getByTestId("pulse-signups")).toHaveTextContent("0");
    expect(screen.getByTestId("pulse-returning")).toHaveTextContent("1");
    expect(screen.getByText("m.facebook.com")).toBeInTheDocument();
  });

  it("selects the exact browser record from the recent activity feed", () => {
    const onVisitor = vi.fn();
    render(<AudiencePulse dataset={dataset} classification={classification}
      range={range} now={NOW} onVisitor={onVisitor} />);
    fireEvent.click(screen.getByRole("button", { name: /human-br/ }));
    expect(onVisitor).toHaveBeenCalledTimes(1);
    expect(onVisitor).toHaveBeenCalledWith("human-browser");
  });
});
