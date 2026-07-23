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
  opponentDisplayName: "Rival",
  opponentIsBot: false,
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
      entry(),
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
    expect(rows[1]).toHaveTextContent("Defeat");
    expect(rows[1]).toHaveTextContent("Forfeit");
    expect(rows[2]).toHaveTextContent("Tank vs Bot (Mage)");
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
