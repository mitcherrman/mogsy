import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";

const hosted: { host: MatchHost | null; matchId: string | null } = { host: null, matchId: null };
vi.mock("@/pages/quiz-ranked/QuizRankedMatch", () => ({
  QuizRankedMatch: (p: { matchId: string; host: MatchHost }) => {
    hosted.host = p.host;
    hosted.matchId = p.matchId;
    return <div data-testid="ranked-match">ranked match {p.matchId}</div>;
  },
}));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: () => undefined }) }));
const playArenaNode = vi.fn();
vi.mock("../api/arenaApi", async (orig) => ({
  ...(await orig<typeof import("../api/arenaApi")>()),
  playArenaNode: (...a: unknown[]) => playArenaNode(...a),
}));

import type { LiveArenaEvent } from "../api/useLiveArenaEvent";
import { serverEvent } from "../api/serverFixtures";
import type { ArenaEvent } from "../contracts";
import { ArenaMatchRoom } from "./ArenaMatchRoom";

function liveOf(event: ArenaEvent | null): LiveArenaEvent {
  return { event, error: null, loading: false, refresh: vi.fn(), apply: vi.fn() };
}

function room(live: LiveArenaEvent) {
  return (
    <MemoryRouter>
      <ArenaMatchRoom live={live} nodeId="r1n1" viewerUserId="uid-a" backHref="/quiz/arena/e/x" onBackToBracket={vi.fn()} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  hosted.host = null;
  hosted.matchId = null;
  playArenaNode.mockReset();
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
});

describe("ArenaMatchRoom — the real ready check", () => {
  it("presses Play on the server and shows the server's answer", async () => {
    const live = liveOf(serverEvent());
    const answered = serverEvent({ revision: 5 }, { ready_profile_ids: ["prof-a"] });
    playArenaNode.mockResolvedValue({ match_id: null, created: false, waiting_for_opponent: true, event: answered });
    const { rerender } = render(room(live));
    expect(screen.getByTestId("ta-room-state").textContent).toBe("Ready check");
    await act(async () => { fireEvent.click(screen.getByTestId("ta-room-ready")); });
    expect(playArenaNode).toHaveBeenCalledWith(live.event!.event_id, "r1n1", expect.any(String));
    expect(live.apply).toHaveBeenCalledWith(answered);
    rerender(room(liveOf(answered)));
    expect(screen.getByTestId("ta-room-state").textContent).toBe("Waiting for opponent…");
    expect(screen.queryByTestId("ta-room-ready")).toBeNull();
    expect(screen.queryByTestId("ta-simulated")).toBeNull();
  });

  it("says why a press was refused, in copy", async () => {
    const { ArenaApiError } = await import("../api/arenaApi");
    playArenaNode.mockRejectedValue(new ArenaApiError("backend", 409, "x", "RANKED_ACTIVE_MATCH_EXISTS"));
    render(room(liveOf(serverEvent())));
    await act(async () => { fireEvent.click(screen.getByTestId("ta-room-ready")); });
    expect(screen.getByTestId("ta-room-notice").textContent).toMatch(/another match/);
  });
});

describe("ArenaMatchRoom — the match and the REAL result", () => {
  it("mounts the hosted Ranked match, then shows only the result the server recorded", async () => {
    const liveNode = serverEvent({ revision: 6 }, { status: "live", current_match_id: "arm_1", ready_profile_ids: [] });
    const { rerender } = render(room(liveOf(liveNode)));
    // Opened onto a game already in progress: straight back into it.
    expect(screen.getByTestId("ranked-match").textContent).toContain("arm_1");
    expect(hosted.host?.eyebrow).toBe("Tournament Arena");

    await act(async () => { hosted.host!.onMatchSettled({ matchId: "arm_1", terminalReason: null, completionReason: null }); });
    // The game is over but the bracket has not recorded it yet: no result is invented.
    expect(screen.getByText("Recording the result…")).toBeTruthy();
    expect(screen.queryByTestId("ta-result")).toBeNull();

    const recorded = serverEvent({ revision: 7, status: "complete", champion_profile_id: "prof-a" }, {
      status: "complete", current_match_id: null, winner_profile_id: "prof-a",
      slots: [
        { source: { kind: "seed", seed: 1 }, profile_id: "prof-a", wins: 1 },
        { source: { kind: "seed", seed: 2 }, profile_id: "prof-b", wins: 0 },
      ],
      games: [{ game_index: 1, winner_profile_id: "prof-a", outcome: "decisive", score_a: 9, score_b: 4 }],
    });
    rerender(room(liveOf(recorded)));
    // AnimatePresence lets "Recording the result" leave before the result enters.
    const result = await screen.findByTestId("ta-result");
    expect(result.getAttribute("data-real")).toBe("true");
    expect(result.getAttribute("data-outcome")).toBe("victory");
    expect(screen.getByTestId("ta-score-plate").textContent).toContain("9");
    expect(screen.getByTestId("ta-result-series").textContent).toMatch(/You advance/);
    expect(screen.queryByTestId("ta-simulated")).toBeNull();
  });

  it("tells a non-entrant this is not their match", () => {
    render(room(liveOf(serverEvent({ viewer_profile_id: "prof-z" }))));
    expect(screen.getByTestId("ta-room-message").textContent).toMatch(/not your match/);
  });
});
