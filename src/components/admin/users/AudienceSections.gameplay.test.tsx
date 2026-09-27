/**
 * USERS2.3C-Daily — the Engagement section tells the truth about gameplay.
 *
 * Canonical Ranked is split by host so Daily children never read as Direct
 * Ranked, retired DSA is not presented as a product, standalone mastery is
 * labelled legacy, and uninstrumented lifecycles show as unavailable, never 0.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { LoadedAnalytics } from "@/lib/admin/analytics/loadAnalytics";
import type { AnalyticsEventRecord } from "@/lib/admin/analytics/metrics";
import { resolveRange } from "@/lib/admin/analytics/range";
import { EngagementSection } from "./AudienceSections";

const NOW = Date.parse("2026-09-27T12:00:00.000Z");
const at = new Date(NOW - 60 * 60 * 1000).toISOString();

const ranked = (name: string, user: string, metadata: Record<string, unknown>): AnalyticsEventRecord => ({
  event_name: name, received_at: at, visitor_id: null, session_id: null, user_id: user, is_guest: false,
  source_system: "railway", source_entity_type: "ranked_participant", source_entity_id: `m:${user}`,
  verification_type: null, metadata,
});

function mount(events: AnalyticsEventRecord[]) {
  const loaded = {
    dataset: { events, sessions: [], visitors: [] },
    latest: {}, truncated: { events: false, sessions: false, visitors: false }, loadedAt: NOW,
  } as unknown as LoadedAnalytics;
  render(<EngagementSection loaded={loaded} range={resolveRange("7d", NOW)} now={NOW} />);
}

afterEach(cleanup);

describe("Engagement — gameplay presentation", () => {
  it("splits canonical Ranked by host and keeps Daily children out of Direct Ranked", () => {
    mount([
      ranked("ranked_started", "a", { host: "direct", opponent_type: "human" }),
      ranked("ranked_started", "b", { host: "daily_challenge", opponent_type: "bot", parent_activity_id: "dr_1" }),
      ranked("ranked_started", "c", { host: "daily_challenge", opponent_type: "bot", parent_activity_id: "dr_2" }),
      ranked("ranked_started", "d", {}),
    ]);
    const table = screen.getByTestId("analytics-ranked-by-host");
    const row = (id: string) => screen.getByTestId(`analytics-ranked-host-${id}`).closest("tr")!;
    expect(within(row("total")).getAllByRole("cell")[1]).toHaveTextContent("4");
    expect(within(row("direct_pvp")).getAllByRole("cell")[1]).toHaveTextContent("1");
    expect(within(row("daily_challenge")).getAllByRole("cell")[1]).toHaveTextContent("2");
    expect(within(row("legacy_unknown")).getAllByRole("cell")[1]).toHaveTextContent("1");
    for (const label of ["Direct Ranked — human opponent", "Direct Bot Ranked", "Playtest", "Study Hall",
      "Daily Challenge child matches", "Legacy / unknown host"]) {
      expect(table).toHaveTextContent(label);
    }
  });

  it("does not present DSA, labels mastery legacy, and shows uninstrumented lifecycles as unavailable", () => {
    mount([]);
    const gameplay = screen.getByTestId("analytics-gameplay");
    expect(gameplay).not.toHaveTextContent(/Score Attack/i);
    expect(screen.queryByTestId("analytics-mode-dsa")).toBeNull();
    expect(screen.getByTestId("analytics-mode-mastery")).toHaveTextContent("Legacy Champion Mastery");
    for (const id of ["daily_challenge", "mastery_journey"]) {
      const cells = within(screen.getByTestId(`analytics-uninstrumented-${id}`).closest("tr")!).getAllByRole("cell");
      expect(cells[1]).toHaveTextContent("Not instrumented");
      expect(cells[2]).toHaveTextContent("Not instrumented");
      expect(cells[1]).not.toHaveTextContent("0");
    }
  });
});
