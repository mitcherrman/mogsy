/**
 * Public Mastery catalog + parameterized player (J4 launch).
 *
 * The catalog renders exactly what the backend returns (no client-side set
 * data). The player page enforces the PUBLICATION BOUNDARY: MasteryPlayerLive
 * (whose mount starts a session) is only mounted after the URL's set id is
 * confirmed a member of the backend's public catalog. Unpublished prototypes,
 * unknown ids, malformed ids, loading, and catalog failures never mount it.
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
// Real prototype ids, published but NOT public — must be blocked on the
// public route (their /dev/mastery/* wrappers remain the only way in).
const LUX_PROTO = "mset_2f02e445523e415103c2d7e27524fac596e169d93f665369a8383407f0b57d14";
const JARVAN_PROTO = "mset_033c4c8593883d477da3e788890770bb02bf1c12cef190bc51e8d48743f4130f";
const UNKNOWN = "mset_" + "ab".repeat(32);

const SUMMARIES = [
  { masterySetId: AHRI, artifactDigest: "martifact_a", displayRevision: "disprev_ahri-syndra-e.v2",
    title: "Ahri E vs Syndra E — Cooldowns, Haste & Burst",
    displaySummary: "Six questions.", totalSteps: 6 },
  { masterySetId: OLAF, artifactDigest: "martifact_b",
    displayRevision: "disprev_olaf-cooldown-mana-progression.v1",
    title: "Olaf — cooldowns and mana, from level 1 to 11",
    displaySummary: "Cooldowns and mana.", totalSteps: 16 },
];

// NOTE: clearAllMocks, NOT mockReset — vi.fn().mockReset() breaks vitest's
// settled-result tracking for later rejected results, surfacing a
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
    // Cards exist only for backend-returned ids.
    expect(screen.queryByTestId(`mastery-catalog-card-${LUX_PROTO}`)).toBeNull();
  });

  it("shows the error state (not an empty catalog) when the API fails", async () => {
    listSets.mockRejectedValue(new Error("a verified session is required"));
    render(<MemoryRouter><MasteryJourneysPage /></MemoryRouter>);
    expect(await screen.findByTestId("mastery-catalog-error")).toBeInTheDocument();
    expect(screen.getByText(/a verified session is required/)).toBeInTheDocument();
  });

  it("shows the empty state for an empty catalog", async () => {
    listSets.mockResolvedValue([]);
    render(<MemoryRouter><MasteryJourneysPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId("mastery-catalog-empty")).toBeInTheDocument());
  });
});

describe("MasteryJourneyPlayerPage — publication boundary", () => {
  const renderAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/quiz/mastery/:masterySetId" element={<MasteryJourneyPlayerPage />} />
        </Routes>
      </MemoryRouter>);

  it.each([[OLAF, "promoted Olaf"], [AHRI, "default Ahri v2"]])(
    "mounts the player for public catalog member %s (%s)", async (id) => {
      listSets.mockResolvedValue(SUMMARIES);
      renderAt(`/quiz/mastery/${id}`);
      // Membership unresolved -> the player must NOT be mounted yet.
      expect(screen.getByTestId("mastery-player-membership-loading")).toBeInTheDocument();
      expect(screen.queryByTestId("player-live")).toBeNull();
      await waitFor(() =>
        expect(screen.getByTestId("player-live")).toHaveAttribute("data-set-id", id));
      expect(screen.getByTestId("mastery-player-back-link"))
        .toHaveAttribute("href", "/quiz/mastery");
    });

  it.each([[LUX_PROTO, "Lux prototype"], [JARVAN_PROTO, "Jarvan prototype"], [UNKNOWN, "unknown id"]])(
    "blocks non-catalog id %s (%s) and never mounts the player", async (id) => {
      listSets.mockResolvedValue(SUMMARIES);
      renderAt(`/quiz/mastery/${id}`);
      await waitFor(() =>
        expect(screen.getByTestId("mastery-player-not-public")).toBeInTheDocument());
      // The player never mounted, so no session request could have been issued.
      expect(screen.queryByTestId("player-live")).toBeNull();
      expect(screen.getByRole("link", { name: /browse mastery journeys/i }))
        .toHaveAttribute("href", "/quiz/mastery");
    });

  it("rejects a malformed set id locally: no catalog call, no player", () => {
    renderAt("/quiz/mastery/not-a-set-id");
    expect(screen.getByTestId("mastery-player-bad-id")).toBeInTheDocument();
    expect(screen.queryByTestId("player-live")).toBeNull();
    expect(listSets).not.toHaveBeenCalled();
  });

  it("fails closed (no player) when the catalog request fails", async () => {
    listSets.mockRejectedValue(new Error("catalog unavailable"));
    renderAt(`/quiz/mastery/${OLAF}`);
    expect(await screen.findByTestId("mastery-player-membership-error")).toBeInTheDocument();
    expect(screen.queryByTestId("player-live")).toBeNull();
  });

  it("fails closed on an empty catalog", async () => {
    listSets.mockResolvedValue([]);
    renderAt(`/quiz/mastery/${OLAF}`);
    await waitFor(() =>
      expect(screen.getByTestId("mastery-player-not-public")).toBeInTheDocument());
    expect(screen.queryByTestId("player-live")).toBeNull();
  });
});

describe("publication metadata stays server-side", () => {
  it("the generic player component source hardcodes no set ids", async () => {
    const raw = (await import("./MasteryJourneyPlayerPage.tsx?raw")).default as string;
    expect(raw).not.toMatch(/mset_[0-9a-f]{64}/);
  });

  it("dev wrappers keep their explicit prototype delegation (unchanged files)", async () => {
    const raw = (await import("../dev/mastery/LuxCooldownProgressionPage.tsx?raw")).default as string;
    expect(raw).toContain(LUX_PROTO);
    expect(raw).toContain("MasteryPlayerLive");
  });
});
