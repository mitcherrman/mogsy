import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { RankedMatchHistory } from "./RankedMatchHistory";
import * as client from "@/lib/ranked-public/client";
import type { MatchHistoryEntryView } from "@/lib/ranked-public/contracts";

vi.mock("@/lib/ranked-public/client", () => ({ getMatchHistory: vi.fn() }));

const mockHistory = vi.mocked(client.getMatchHistory);

const entry = (over: Partial<MatchHistoryEntryView> = {}): MatchHistoryEntryView => ({
  matchId: "m1",
  viewerOutcome: "win",
  terminalReason: "combat",
  completionReason: "hp_zero",
  finalRoundNumber: 7,
  completedAt: "2026-07-18T12:00:00+00:00",
  isBotMatch: false,
  viewerClass: "tank",
  opponentClass: "mage",
  // Default fixture is a HISTORICAL (pre-R1) row: no roles.
  viewerRole: null,
  opponentRole: null,
  opponentDisplayName: "Rival",
  opponentIsBot: false,
  ratingDelta: null,
  ratingAfter: null,
  ...over,
});

const view = (entries: MatchHistoryEntryView[]) => ({
  schemaVersion: "ranked_duel.match_history.v1",
  serverTime: "2026-07-18T12:00:00+00:00",
  entries,
  count: entries.length,
});

describe("RankedMatchHistory", () => {
  // Braces matter: mockReset() returns the mock (a function), and a function
  // returned from beforeEach is invoked as a cleanup hook — which would call
  // the throwing mock itself and fail the test with an unhandled rejection.
  beforeEach(() => { mockHistory.mockReset(); });

  it("renders recent results with viewer-perspective outcomes", async () => {
    mockHistory.mockResolvedValue(view([
      entry({ ratingDelta: 16, ratingAfter: 1016 }),
      entry({ matchId: "m2", viewerOutcome: "loss", terminalReason: "forfeit" }),
      entry({ matchId: "m3", opponentIsBot: true, isBotMatch: true, opponentDisplayName: null }),
    ]));
    render(<RankedMatchHistory />);
    await waitFor(() => expect(screen.getByTestId("ranked-match-history")).toBeInTheDocument());
    const rows = screen.getAllByTestId("ranked-history-entry");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Victory");
    expect(rows[0]).toHaveTextContent("Tank vs Rival (Mage)");
    expect(rows[0]).toHaveTextContent("R7");
    expect(rows[0]).toHaveTextContent("+16");
    expect(rows[1]).toHaveTextContent("Defeat");
    expect(rows[1]).toHaveTextContent("Forfeit");
    expect(rows[2]).toHaveTextContent("Tank vs Bot (Mage)");
    // Null delta (skipped/unrated result) renders no badge.
    expect(rows[2].querySelector('[data-testid="ranked-history-rating-delta"]')).toBeNull();
  });

  it("renders nothing for an empty history", async () => {
    mockHistory.mockResolvedValue(view([]));
    const { container } = render(<RankedMatchHistory />);
    await waitFor(() => expect(mockHistory).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the endpoint fails (best-effort widget)", async () => {
    mockHistory.mockImplementation(async () => { throw new Error("backend down"); });
    const { container } = render(<RankedMatchHistory />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockHistory).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("R1 — role identity in history", () => {
  it("shows the ROLE on both sides of a row that froze one", async () => {
    mockHistory.mockResolvedValue(view([entry({
      viewerRole: "jungle", opponentRole: "adc",
    })]));
    render(<RankedMatchHistory />);
    const row = await screen.findByTestId("ranked-history-entry");
    expect(row.textContent).toContain("Jungle");
    expect(row.textContent).toContain("ADC");
  });

  it("a NULL-role legacy row keeps its class and fabricates no role", async () => {
    mockHistory.mockResolvedValue(view([entry({
      viewerRole: null, opponentRole: null,
      viewerClass: "tank", opponentClass: "marksman",
    })]));
    render(<RankedMatchHistory />);
    const row = await screen.findByTestId("ranked-history-entry");
    // The recorded classes, exactly as they were always shown …
    expect(row.textContent).toContain("Tank");
    expect(row.textContent).toContain("Marksman");
    // … and never Tank→Support or Marksman→ADC.
    expect(row.textContent).not.toMatch(/Support|ADC|Jungle|\bMid\b|\bTop\b/);
  });

  it("mixes freely: a role on one side, a legacy class on the other", async () => {
    mockHistory.mockResolvedValue(view([entry({
      viewerRole: "support", opponentRole: null, opponentClass: "mage",
    })]));
    render(<RankedMatchHistory />);
    const row = await screen.findByTestId("ranked-history-entry");
    expect(row.textContent).toContain("Support");
    expect(row.textContent).toContain("Mage");
    expect(row.textContent).not.toContain("Mid");
  });
});
