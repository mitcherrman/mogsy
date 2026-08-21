/**
 * PLAY1 — `/quiz/ranked` is the LIVE-MATCH HOST, and only that.
 *
 * Two halves, and both matter:
 *
 *   KEPT     the route still exists, still renders `QuizRankedMatch`, still
 *            takes the handoff from the lobby's match-entry scroll, and still
 *            recovers an active match on a cold load. Deleting the route was
 *            never the plan — it is the match's home.
 *   RETIRED  its pre-match menu. The duplicated rank summary, the duplicated
 *            role and Change Role control, Find a Match, Play vs Bot, the
 *            Tank/Mage/Marksman picker, the Easy/Standard/Hard difficulties,
 *            the PLAYTEST badge, the "Placeholder questions" copy and the
 *            duplicated Recent Matches list must not be reachable here by any
 *            normal path.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const h = vi.hoisted(() => ({ getActiveMatch: vi.fn() }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "owner-uuid", is_anonymous: false } }),
}));
vi.mock("./QuizRankedMatch", () => ({
  QuizRankedMatch: ({ matchId, viewerUserId }: { matchId: string; viewerUserId: string }) => (
    <div data-testid="match-view" data-viewer={viewerUserId}>{matchId}</div>
  ),
}));
vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: h.getActiveMatch,
  isAborted: () => false,
  RankedApiError: class extends Error {},
}));

import QuizRankedPage from "./QuizRankedPage";

/** Block and line comments out; string contents and code left alone. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

afterEach(() => vi.clearAllMocks());

function Lobby() {
  const state = useLocation().state as { openPlay?: boolean } | null;
  return <div data-testid="lobby">{state?.openPlay ? "openPlay" : "plain"}</div>;
}

function renderRoute(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/quiz/ranked", state }]}>
      <Routes>
        <Route path="/quiz/ranked" element={<QuizRankedPage />} />
        <Route path="/quiz" element={<Lobby />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/quiz/ranked — the live-match host", () => {
  it("enters the match the scroll handed over, without waiting on discovery", async () => {
    // Discovery never resolves: the handoff must not depend on it.
    h.getActiveMatch.mockReturnValue(new Promise(() => {}));
    renderRoute({ matchId: "rkm_handoff" });
    await waitFor(() =>
      expect(screen.getByTestId("match-view")).toHaveTextContent("rkm_handoff"));
    expect(screen.getByTestId("match-view").getAttribute("data-viewer")).toBe("owner-uuid");
  });

  it("ignores a non-string match id in router state", async () => {
    h.getActiveMatch.mockResolvedValue(null);
    renderRoute({ matchId: 42 });
    await waitFor(() => expect(screen.getByTestId("lobby")).toBeTruthy());
  });

  it("does not decide there is no match before discovery answers", async () => {
    h.getActiveMatch.mockReturnValue(new Promise(() => {}));
    renderRoute();
    expect(screen.getByTestId("ranked-loading")).toBeTruthy();
    expect(screen.queryByTestId("lobby")).toBeNull();
  });

  it("sends a matchless visitor to the lobby's match-entry record", async () => {
    h.getActiveMatch.mockResolvedValue(null);
    renderRoute();
    await waitFor(() => expect(screen.getByTestId("lobby")).toHaveTextContent("openPlay"));
  });
});

describe("/quiz/ranked — the retired pre-match menu", () => {
  const RETIRED_TESTIDS = [
    "ranked-class-select",
    "ranked-role-select",
    "ranked-current-role",
    "ranked-change-role",
    "ranked-find-match",
    "ranked-playtest-bot",
    "ranked-play-vs-bot",
    "ranked-class-tank",
    "ranked-bot-class-tank",
    "ranked-bot-difficulty-easy",
  ];

  it("shows none of the old menu controls when there is no match", async () => {
    h.getActiveMatch.mockResolvedValue(null);
    renderRoute();
    await waitFor(() => expect(screen.getByTestId("lobby")).toBeTruthy());
    for (const id of RETIRED_TESTIDS) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });

  it("shows none of them while a match is live either", async () => {
    h.getActiveMatch.mockResolvedValue({ matchId: "rkm_live", isBotMatch: false });
    renderRoute();
    await waitFor(() => expect(screen.getByTestId("match-view")).toBeTruthy());
    for (const id of RETIRED_TESTIDS) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
  });

  /**
   * The source-level half of the same claim. Absence from one render is a
   * weaker statement than absence from the file: this is what stops the menu
   * quietly coming back behind a condition these tests do not happen to hit.
   */
  it("no longer builds a queue, a role picker, a bot match or a class list", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    // Comments stripped first: the file's own documentation NAMES the things
    // it retired ("the bot backend, `createBotMatch`, the role picker …"),
    // and a prose mention is the opposite of a re-introduction.
    const source = stripComments(readFileSync(
      resolve(process.cwd(), "src/pages/quiz-ranked/QuizRankedPage.tsx"), "utf8",
    ));
    expect(source).not.toContain("useRankedQueue");
    expect(source).not.toContain("createBotMatch");
    expect(source).not.toContain("RankedRolePicker");
    expect(source).not.toContain("RankedTierPanel");
    expect(source).not.toContain("RankedMatchHistory");
    expect(source).not.toContain("PLAYTEST");
    expect(source).not.toContain("Placeholder questions");
    // It DOES still host the match and still recovers one.
    expect(source).toContain("QuizRankedMatch");
    expect(source).toContain("getActiveMatch");
  });
});

/**
 * The bot backend was not deleted, only unhosted. Removing the client would
 * make a later Practice/Training surface re-invent it, and PLAY1's brief is
 * explicit that the bot system stays.
 */
describe("the bot system is unhosted, not deleted", () => {
  it("still exports a bot-match client", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const client = readFileSync(
      resolve(process.cwd(), "src/lib/ranked-public/client.ts"), "utf8",
    );
    expect(client).toContain("export const createBotMatch");
  });
});
