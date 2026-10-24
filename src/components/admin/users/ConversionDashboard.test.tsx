/**
 * CV4 — the Conversion panel shows ordered steps, keeps server play
 * unavailable (D-6), opens browser evidence, and goes unavailable on a
 * truncated read instead of computing on part of the history.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LoadedAnalytics } from "@/lib/admin/analytics/loadAnalytics";
import type { AnalyticsEventRecord } from "@/lib/admin/analytics/metrics";
import { resolveRange } from "@/lib/admin/analytics/range";
import { ConversionDashboard } from "./ConversionDashboard";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-24T12:00:00.000Z");
const T = NOW - 20 * DAY;
const iso = (t: number) => new Date(t).toISOString();

const web = (name: string, at: number, visitor: string, o: Partial<AnalyticsEventRecord> = {}): AnalyticsEventRecord => ({
  event_name: name, received_at: iso(at), visitor_id: visitor, session_id: `s-${visitor}`, user_id: null, is_guest: null,
  source_system: "web", source_entity_type: null, source_entity_id: null, verification_type: null, metadata: null, ...o,
});

function mount(truncated = { events: false, sessions: false, visitors: false }, onVisitor = vi.fn()) {
  const loaded = {
    dataset: {
      events: [web("leaguecraft_opened", T + 1000, "browser-aaaaaaaa-1"), web("signup_viewed", T + 2000, "browser-aaaaaaaa-1")],
      sessions: [{ session_id: "s-browser-aaaaaaaa-1", visitor_id: "browser-aaaaaaaa-1", started_at: iso(T), landing_path: "/", referrer: null, utm_source: null, utm_medium: null, utm_campaign: null }],
      visitors: [],
    },
    latest: {}, truncated, loadedAt: NOW, overrides: [],
  } as unknown as LoadedAnalytics;
  render(<ConversionDashboard loaded={loaded} range={resolveRange("30d", NOW)} now={NOW} onVisitor={onVisitor} />);
  return onVisitor;
}

afterEach(cleanup);

describe("ConversionDashboard", () => {
  it("renders ordered steps without server play and marks it unavailable", () => {
    mount();
    expect(screen.getByTestId("conversion-step-entered")).toBeTruthy();
    expect(screen.getByTestId("conversion-step-leaguecraft")).toBeTruthy();
    expect(screen.queryByTestId("conversion-step-server_play")).toBeNull();
    expect(screen.getByTestId("conversion-server-play-unavailable").textContent).toMatch(/Unavailable/);
    expect(screen.getByTestId("conversion-email-na").textContent).toMatch(/auto-confirm/);
  });

  it("opens a browser record from its evidence list", () => {
    const onVisitor = mount();
    fireEvent.click(screen.getByTestId("conversion-reached-leaguecraft").querySelector("summary")!);
    fireEvent.click(screen.getByTitle("Open browser browser-aaaaaaaa-1"));
    expect(onVisitor).toHaveBeenCalledWith("browser-aaaaaaaa-1");
  });

  it("is unavailable on a truncated read", () => {
    mount({ events: true, sessions: false, visitors: false });
    expect(screen.getByTestId("conversion-browser-unavailable")).toBeTruthy();
    expect(screen.getByTestId("conversion-accounts-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("conversion-browser-table")).toBeNull();
  });
});
