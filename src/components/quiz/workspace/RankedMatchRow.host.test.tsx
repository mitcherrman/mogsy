/**
 * JLIB-HOST — a History row names the Journey Library when the backend says
 * the match was played there, and nothing else changes.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RankedMatchRow from "./RankedMatchRow";
import type { MatchHistoryEntryView } from "@/lib/ranked-public/contracts";

const entry = (over: Partial<MatchHistoryEntryView> = {}): MatchHistoryEntryView => ({
  matchId: "m1",
  viewerOutcome: "win",
  terminalReason: "combat",
  completionReason: "segments_complete",
  finalRoundNumber: 5,
  completedAt: new Date().toISOString(),
  isBotMatch: true,
  viewerClass: "tank",
  opponentClass: "mage",
  viewerRole: "mid",
  opponentRole: "mid",
  opponentDisplayName: null,
  opponentIsBot: true,
  ratingDelta: null,
  ratingAfter: null,
  host: null,
  ...over,
});

function renderRow(e: MatchHistoryEntryView) {
  render(<ul><RankedMatchRow entry={e} /></ul>);
  return screen.getByTestId("ranked-match-row");
}

describe("RankedMatchRow host label", () => {
  it("labels a journey_library match Journey Library, never with the raw id", () => {
    const row = renderRow(entry({ host: "journey_library" }));
    expect(within(row).getByTestId("ranked-match-host")).toHaveTextContent("Journey Library");
    expect(row.textContent).not.toContain("journey_library");
    // The rest of the row is the ordinary record: opponent, role, verdict.
    expect(row).toHaveTextContent("Bot");
    expect(row).toHaveTextContent("Mid");
  });

  it("renders a null-host row exactly as an ordinary Ranked row", () => {
    const plain = renderRow(entry());
    expect(within(plain).queryByTestId("ranked-match-host")).toBeNull();
    const html = plain.innerHTML;
    plain.remove();
    // Identical to a row from a backend that never sent `host` at all.
    const legacy = renderRow({ ...entry(), host: undefined as unknown as null });
    expect(legacy.innerHTML).toBe(html);
  });

  it.each(["daily_challenge", "study_hall", "playtest", "direct"])(
    "adds no label for host %s", (host) => {
      const row = renderRow(entry({ host }));
      expect(within(row).queryByTestId("ranked-match-host")).toBeNull();
      expect(row.textContent).not.toContain(host);
    });
});
