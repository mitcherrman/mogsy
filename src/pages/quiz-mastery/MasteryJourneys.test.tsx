/**
 * Public Mastery catalog + parameterized player (J4 launch).
 *
 * The catalog renders exactly what the backend returns (no client-side set
 * data), links each set to the shared player route, and the player page
 * delegates to MasteryPlayerLive with the URL's set id — rejecting malformed
 * ids without a request.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const listSets = vi.fn();

vi.mock("@/features/mastery/live", () => ({
  listSets: (...args: unknown[]) => listSets(...args),
  MasteryPlayerLive: ({ masterySetId }: { masterySetId: string }) => (
    <div data-testid="player-live" data-set-id={masterySetId} />
  ),
}));

import MasteryJourneysPage from "./MasteryJourneysPage";
import MasteryJourneyPlayerPage from "./MasteryJourneyPlayerPage";

const OLAF = "mset_5216fd2f6956b5ae5f76cf036fd63439f59c2c9b867fa96fe49cd46298d14bb5";
const AHRI = "mset_f4853f2b0c35b84c5b48c0b017baf83177fdfc85032f29606e1dc2bdd6c70f70";

const SUMMARIES = [
  { masterySetId: AHRI, artifactDigest: "martifact_a", displayRevision: "disprev_ahri-syndra-e.v2",
    title: "Ahri E vs Syndra E — Cooldowns, Haste & Burst",
    displaySummary: "Six questions.", totalSteps: 6 },
  { masterySetId: OLAF, artifactDigest: "martifact_b",
    displayRevision: "disprev_olaf-cooldown-mana-progression.v1",
    title: "Olaf — cooldowns and mana, from level 1 to 11",
    displaySummary: "Cooldowns and mana.", totalSteps: 16 },
];

// NOTE: mockClear/clearAllMocks, NOT mockReset — vi.fn().mockReset() breaks
// vitest's settled-result tracking for later rejected results, surfacing a
// component-handled rejection as a spurious test failure.
afterEach(() => vi.clearAllMocks());

describe("MasteryJourneysPage", () => {
  it("renders every catalog set as a link to the shared player route", async () => {
    listSets.mockResolvedValue(SUMMARIES);
    render(<MemoryRouter><MasteryJourneysPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("mastery-catalog-list")).toBeInTheDocument());
    const olaf = screen.getByTestId(`mastery-catalog-card-${OLAF}`);
    expect(olaf).toHaveAttribute("href", `/quiz/mastery/${OLAF}`);
    expect(screen.getByText("Olaf — cooldowns and mana, from level 1 to 11")).toBeInTheDocument();
    expect(screen.getByText(/16 questions/)).toBeInTheDocument();
    expect(screen.getByTestId(`mastery-catalog-card-${AHRI}`))
      .toHaveAttribute("href", `/quiz/mastery/${AHRI}`);
  });

  it("shows the error state (not an empty catalog) when the API fails", async () => {
    listSets.mockRejectedValue(new Error("a verified session is required"));
    render(<MemoryRouter><MasteryJourneysPage /></MemoryRouter>);
    expect(await screen.findByTestId("mastery-catalog-error")).toBeInTheDocument();
    expect(screen.getByText(/a verified session is required/)).toBeInTheDocument();
    expect(screen.queryByTestId("mastery-catalog-list")).toBeNull();
  });

  it("shows the empty state for an empty catalog", async () => {
    listSets.mockResolvedValue([]);
    render(<MemoryRouter><MasteryJourneysPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("mastery-catalog-empty")).toBeInTheDocument());
  });
});

describe("MasteryJourneyPlayerPage", () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/quiz/mastery/:masterySetId" element={<MasteryJourneyPlayerPage />} />
        </Routes>
      </MemoryRouter>);

  it("delegates the URL set id to MasteryPlayerLive", () => {
    renderAt(`/quiz/mastery/${OLAF}`);
    expect(screen.getByTestId("player-live")).toHaveAttribute("data-set-id", OLAF);
    expect(screen.getByTestId("mastery-player-back-link"))
      .toHaveAttribute("href", "/quiz/mastery");
  });

  it("rejects a malformed set id without rendering the player", () => {
    renderAt("/quiz/mastery/not-a-set-id");
    expect(screen.getByTestId("mastery-player-bad-id")).toBeInTheDocument();
    expect(screen.queryByTestId("player-live")).toBeNull();
  });
});
