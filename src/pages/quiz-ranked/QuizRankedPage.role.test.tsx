/**
 * R1: the normal Ranked player path is role-first.
 *
 * Also pins the compatibility rule the whole migration rests on: when the
 * backend has no role identity, the LEGACY class path is still there and still
 * queues, because it is the only way those players get into a match.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RankedRole } from "@/lib/ranked-public/roles";

const h = vi.hoisted(() => ({
  queue: {
    state: "selecting_class" as string,
    status: null as { classId: string | null; role: string | null } | null,
    matchId: null,
    selectedClass: "tank" as string | null,
    unavailableReason: null,
    error: null as string | null,
    setSelectedClass: vi.fn(),
    join: vi.fn(),
    joinAs: vi.fn(),
    joinWithoutClass: vi.fn(),
    cancel: vi.fn(),
  },
  role: {
    loadState: "ready" as string,
    role: null as RankedRole | null,
    saving: false,
    error: null as string | null,
    selectRole: vi.fn().mockResolvedValue(true),
    clearError: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "owner-uuid", is_anonymous: false } }),
}));
vi.mock("./QuizRankedMatch", () => ({
  QuizRankedMatch: () => <div data-testid="match-view" />,
}));
vi.mock("./useRankedQueue", () => ({ useRankedQueue: () => h.queue }));
vi.mock("./useRankedRole", () => ({ useRankedRole: () => h.role }));
vi.mock("@/lib/ranked-public/client", () => ({
  getActiveMatch: vi.fn().mockResolvedValue(null),
  createBotMatch: vi.fn(),
  getMatchHistory: vi.fn().mockResolvedValue({ entries: [], count: 0 }),
  isAborted: () => false,
  RankedApiError: class extends Error {},
}));

import QuizRankedPage from "./QuizRankedPage";

beforeEach(() => {
  h.queue.state = "selecting_class";
  h.queue.status = null;
  h.queue.selectedClass = "tank";
  h.queue.error = null;
  h.role.loadState = "ready";
  h.role.role = null;
  h.role.saving = false;
  h.role.error = null;
  h.role.selectRole = vi.fn().mockResolvedValue(true);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const renderPage = async (testId = "ranked-role-select") => {
  const view = render(<MemoryRouter><QuizRankedPage /></MemoryRouter>);
  await screen.findByTestId(testId);
  return view;
};

describe("R1 — role replaces class on the normal player path", () => {
  it("shows the five roles and NO class cards", async () => {
    await renderPage();
    expect(screen.getByTestId("ranked-role-picker")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    // The legacy class cards are not on the normal path.
    expect(screen.queryByTestId("ranked-class-tank")).toBeNull();
    expect(screen.queryByTestId("ranked-class-mage")).toBeNull();
    expect(screen.queryByTestId("ranked-class-marksman")).toBeNull();
  });

  it("a player with NO role cannot enter the queue", async () => {
    await renderPage();
    expect(screen.getByTestId("ranked-find-match")).toBeDisabled();
    fireEvent.click(screen.getByTestId("ranked-find-match"));
    expect(h.queue.joinWithoutClass).not.toHaveBeenCalled();
  });

  it("selecting a role writes it through the backend role API", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("ranked-role-jungle"));
    await waitFor(() => expect(h.role.selectRole).toHaveBeenCalledWith("jungle"));
    // Selecting a role is NOT joining a queue.
    expect(h.queue.joinWithoutClass).not.toHaveBeenCalled();
  });

  it("a player WITH a role is not asked to re-pick, and can queue", async () => {
    h.role.role = "support";
    await renderPage();
    expect(screen.queryByTestId("ranked-role-picker")).toBeNull();
    expect(screen.getByTestId("ranked-current-role").textContent).toBe("Support");
    const play = screen.getByTestId("ranked-find-match");
    expect(play).not.toBeDisabled();
    fireEvent.click(play);
    expect(h.queue.joinWithoutClass).toHaveBeenCalledTimes(1);
  });

  it("the queue request carries NO class — no role→class mapping anywhere", async () => {
    h.role.role = "mid";
    await renderPage();
    fireEvent.click(screen.getByTestId("ranked-find-match"));
    // `joinWithoutClass` takes no arguments at all: there is nothing to map.
    expect(h.queue.joinWithoutClass).toHaveBeenCalledWith();
    expect(h.queue.joinAs).not.toHaveBeenCalled();
  });

  it("the role can be changed from the idle lobby", async () => {
    h.role.role = "top";
    await renderPage();
    fireEvent.click(screen.getByTestId("ranked-change-role"));
    expect(await screen.findByTestId("ranked-role-picker")).toBeTruthy();
  });

  it("surfaces a REJECTED change (the backend stays the authority)", async () => {
    h.role.role = "top";
    h.role.error = "Finish your active match before changing your role.";
    await renderPage();
    expect(screen.getByTestId("ranked-role-error").textContent)
      .toContain("Finish your active match");
  });
});

describe("R1 — queued copy", () => {
  it("names the ROLE the entry queued as, from the server's own status", async () => {
    h.queue.state = "waiting";
    h.queue.status = { classId: "tank", role: "adc" };
    h.role.role = "adc";
    render(<MemoryRouter><QuizRankedPage /></MemoryRouter>);
    const line = await screen.findByTestId("ranked-queued-as");
    expect(line.textContent).toContain("Queued as ADC");
    expect(line.textContent).not.toContain("tank");
  });

  it("falls back to the CLASS on a legacy entry — never a role invented from it", async () => {
    h.role.loadState = "unavailable";
    h.queue.state = "waiting";
    h.queue.status = { classId: "marksman", role: null };
    render(<MemoryRouter><QuizRankedPage /></MemoryRouter>);
    const line = await screen.findByTestId("ranked-queued-as");
    expect(line.textContent).toContain("Queued as marksman");
    expect(line.textContent).not.toMatch(/ADC|Support|Mid/);
  });
});

describe("R1 — version skew: new frontend, old backend", () => {
  it("falls back to the legacy class path when role identity is absent", async () => {
    h.role.loadState = "unavailable";
    await renderPage("ranked-class-select");
    expect(screen.queryByTestId("ranked-role-picker")).toBeNull();
    // The legacy cards are intact and still queue on one click.
    expect(screen.getByTestId("ranked-class-tank")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ranked-class-tank"));
    expect(h.queue.joinAs).toHaveBeenCalledWith("tank");
  });
});

describe("R1 — the owner bot playtest is untouched", () => {
  it("keeps its own class picker on the role path (bot creation needs a class)", async () => {
    h.role.role = "jungle";
    await renderPage();
    expect(screen.getByTestId("ranked-playtest-bot")).toBeTruthy();
    expect(screen.getByTestId("ranked-bot-class-tank")).toBeTruthy();
  });
});
