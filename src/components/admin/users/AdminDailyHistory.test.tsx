import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import golden from "@/lib/admin/__fixtures__/daily-history-v1.json";

const api = vi.hoisted(() => ({ fetchDailyHistory: vi.fn() }));
const db = vi.hoisted(() => ({ result: { data: [] as unknown[], error: null as unknown }, lastEq: [] as unknown[] }));

vi.mock("@/lib/admin/dailyHistoryApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/dailyHistoryApi")>();
  return { ...actual, fetchDailyHistory: api.fetchDailyHistory };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (...args: unknown[]) => { db.lastEq.push(args); return q; };
      q.in = () => q;
      q.limit = () => Promise.resolve(db.result);
      return q;
    },
  },
}));

import { AdminDailyHistory, AdminDailyHistoryView } from "./AdminDailyHistory";
import { DailyHistoryReadError, parseDailyHistory } from "@/lib/admin/dailyHistoryApi";

afterEach(cleanup);
beforeEach(() => {
  api.fetchDailyHistory.mockReset();
  db.result = { data: [], error: null };
  db.lastEq = [];
});
const history = () => parseDailyHistory(structuredClone(golden));

describe("Admin Daily Challenge history", () => {
  it("shows runs as Daily activity with stage-by-stage scores, accuracy and durations", async () => {
    api.fetchDailyHistory.mockResolvedValue(history());
    render(<AdminDailyHistory userId="u1" isAnonymous={false} />);
    const root = await screen.findByTestId("admin-daily-history");
    await waitFor(() => expect(within(root).getAllByTestId("daily-run")).toHaveLength(2));
    expect(root).toHaveTextContent("not Ranked matches");
    const runs = within(root).getAllByTestId("daily-run");
    const done = runs.find((r) => r.textContent?.includes("2026-09-21"))!;
    expect(within(done).getByTestId("daily-stage-0")).toHaveTextContent("1. Main Daily");
    expect(within(done).getByTestId("daily-stage-0")).toHaveTextContent("Required");
    expect(within(done).getByTestId("daily-stage-0")).toHaveTextContent("7/10 (70%)");
    expect(within(done).getByTestId("daily-stage-0")).toHaveTextContent("2 min");
    expect(within(done).getByTestId("daily-stage-1")).toHaveTextContent("Optional");
    expect(within(done).getByTestId("daily-stage-4")).toHaveTextContent("Skipped (no misses)");
    expect(within(done).getByTestId("daily-run-elapsed")).toHaveTextContent("wall clock, includes time away");
  });

  it("an unfinished run is stated as unfinished, with no duration and no abandonment claim", async () => {
    api.fetchDailyHistory.mockResolvedValue(history());
    render(<AdminDailyHistory userId="u1" isAnonymous={false} />);
    const runs = await screen.findAllByTestId("daily-run");
    const open = runs.find((r) => r.textContent?.includes("2026-09-22"))!;
    expect(within(open).getByTestId("daily-run-status")).toHaveTextContent("Main Daily not completed; the run is unfinished");
    expect(within(open).getByTestId("daily-run-elapsed")).toHaveTextContent("not recorded");
    expect(open.textContent?.toLowerCase()).not.toContain("abandon");
    expect(within(open).getByTestId("daily-stage-0")).toHaveTextContent("Not started");
  });

  it("names the entry button from the same browser session, else says it is not recorded", async () => {
    api.fetchDailyHistory.mockResolvedValue(history());
    db.result = { data: [{ session_id: "sess-1", received_at: "2026-09-21T14:59:50.000Z", metadata: { control: "play_scroll_daily_clause", entry_surface: "leaguecraft" } }], error: null };
    render(<AdminDailyHistory userId="u1" isAnonymous={false} />);
    const sources = await screen.findAllByTestId("daily-entry-source");
    await waitFor(() => expect(sources.map((s) => s.textContent).join("|")).toContain("Leaguecraft — Daily Challenge on the match-entry record"));
    expect(sources.map((s) => s.textContent)).toContain("Entry source: not recorded");
    expect(db.lastEq).toContainEqual(["event_name", "daily_challenge_entry_clicked"]);
  });

  it("a failed entry lookup is 'unavailable', not 'not recorded'", async () => {
    api.fetchDailyHistory.mockResolvedValue(history());
    db.result = { data: null as never, error: { message: "denied" } };
    render(<AdminDailyHistory userId="u1" isAnonymous={false} />);
    await screen.findAllByTestId("daily-run");
    await waitFor(() => expect(screen.getAllByText(/Entry source: lookup unavailable/).length).toBeGreaterThan(0));
    expect(screen.queryByText("Entry source: not recorded")).toBeNull();
  });

  it("keeps technical identifiers collapsed", async () => {
    api.fetchDailyHistory.mockResolvedValue(history());
    render(<AdminDailyHistory userId="u1" isAnonymous={false} />);
    const drawers = await screen.findAllByTestId("daily-run-technical");
    for (const d of drawers) expect(d).not.toHaveAttribute("open");
  });

  it("a denied or unreachable read is never shown as an empty history", async () => {
    api.fetchDailyHistory.mockRejectedValue(new DailyHistoryReadError("denied", "Owner access to Daily history was refused."));
    render(<AdminDailyHistory userId="u1" isAnonymous={false} />);
    const err = await screen.findByTestId("daily-history-error");
    expect(err).toHaveTextContent("Owner access to Daily history was refused.");
    expect(err).toHaveTextContent("not evidence that the player has no Daily history");
    expect(screen.queryByTestId("daily-history-empty")).toBeNull();
  });

  it("an account with no runs says so plainly", async () => {
    api.fetchDailyHistory.mockResolvedValue({ userId: "u1", runs: [], truncated: false });
    render(<AdminDailyHistory userId="u1" isAnonymous={false} />);
    expect(await screen.findByTestId("daily-history-empty")).toHaveTextContent("No Daily Challenge runs are recorded");
  });

  it("explains what a guest account's history covers", () => {
    render(<AdminDailyHistoryView load={{ phase: "loading" }} isAnonymous />);
    expect(screen.getByTestId("daily-anonymous-note")).toHaveTextContent("not merged");
    cleanup();
    render(<AdminDailyHistoryView load={{ phase: "loading" }} isAnonymous={false} />);
    expect(screen.queryByTestId("daily-anonymous-note")).toBeNull();
  });

  it("asks the backend for the selected account only and refetches when it changes", async () => {
    api.fetchDailyHistory.mockResolvedValue({ userId: "u1", runs: [], truncated: false });
    const { rerender } = render(<AdminDailyHistory userId="u1" isAnonymous={false} />);
    await screen.findByTestId("daily-history-empty");
    rerender(<AdminDailyHistory userId="u2" isAnonymous={false} />);
    await waitFor(() => expect(api.fetchDailyHistory).toHaveBeenCalledTimes(2));
    expect(api.fetchDailyHistory.mock.calls.map((c) => c[0])).toEqual(["u1", "u2"]);
  });
});
