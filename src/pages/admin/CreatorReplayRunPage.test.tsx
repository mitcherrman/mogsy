import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DailyRunTransport } from "@/lib/daily-challenge/run/client";

const mocks = vi.hoisted(() => ({
  readRun: vi.fn(),
  normalToday: vi.fn(),
  normalStart: vi.fn(),
  transport: null as DailyRunTransport | null,
}));
vi.mock("@/lib/daily-challenge/run/client", () => ({
  httpDailyRunTransport: {
    readRun: mocks.readRun,
    readToday: mocks.normalToday,
    startToday: mocks.normalStart,
    launchStage: vi.fn(),
    syncRun: vi.fn(),
  },
}));
vi.mock("@/pages/quiz-daily-challenge/run/DailyRunPage", () => ({
  DailyRunPage: ({ transport }: { transport: DailyRunTransport }) => {
    mocks.transport = transport;
    return <div data-testid="canonical-daily-run">Canonical Daily</div>;
  },
}));

import CreatorReplayRunPage from "./CreatorReplayRunPage";

const ID = "dr_" + "b".repeat(24);
const NEW_ROUTE = `/quiz/daily-challenge/creator/${ID}`;
const OLD_ROUTE = `/admin/creator-replay/${ID}`;

function RouteLocation() {
  return <span data-testid="route-location">{useLocation().pathname}</span>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.transport = null;
});

describe("creator replay run viewer", () => {
  it("uses the canonical Daily controller with no extra sized ancestor or toolbar", async () => {
    mocks.readRun.mockResolvedValue({ runId: ID });
    const { container } = render(<MemoryRouter initialEntries={[NEW_ROUTE]}>
      <Routes>
        <Route path="/quiz/daily-challenge/creator/:runId" element={<CreatorReplayRunPage />} />
      </Routes>
    </MemoryRouter>);
    expect(screen.getByTestId("canonical-daily-run").parentElement).toBe(container);
    expect(screen.queryByText(/Creator Replay · Non-official/)).toBeNull();
    expect(mocks.transport).not.toBeNull();
    await mocks.transport!.readToday();
    await mocks.transport!.startToday();
    expect(mocks.readRun).toHaveBeenNthCalledWith(1, ID);
    expect(mocks.readRun).toHaveBeenNthCalledWith(2, ID);
    expect(mocks.normalToday).not.toHaveBeenCalled();
    expect(mocks.normalStart).not.toHaveBeenCalled();
  });

  it("redirects legacy /admin replay links into the exact /quiz layout", () => {
    render(<MemoryRouter initialEntries={[OLD_ROUTE]}>
      <Routes>
        <Route path="/admin/creator-replay/:runId" element={<CreatorReplayRunPage legacyRedirect />} />
        <Route path="/quiz/daily-challenge/creator/:runId" element={
          <><CreatorReplayRunPage /><RouteLocation /></>
        } />
      </Routes>
    </MemoryRouter>);
    expect(screen.getByTestId("route-location").textContent).toBe(NEW_ROUTE);
    expect(screen.getByTestId("canonical-daily-run")).toBeTruthy();
  });

  it("refuses an invalid filming id without mounting gameplay", () => {
    render(<MemoryRouter initialEntries={["/quiz/daily-challenge/creator/invalid"]}>
      <Routes>
        <Route path="/quiz/daily-challenge/creator/:runId" element={<CreatorReplayRunPage />} />
      </Routes>
    </MemoryRouter>);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("canonical-daily-run")).toBeNull();
  });

  it("keeps the replay route outside AdminShell and behind AdminRoute", () => {
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    const adminBlockStart = app.indexOf('<Route path="/admin" element={<AdminRoute>');
    const adminBlockEnd = app.indexOf("\n                  </Route>", adminBlockStart);
    const dailyRoute = app.indexOf('<Route path="/quiz/daily-challenge"');
    const replayRoute = app.indexOf('<Route path="/quiz/daily-challenge/creator/:runId"');
    expect(adminBlockStart).toBeGreaterThan(0);
    expect(adminBlockEnd).toBeGreaterThan(adminBlockStart);
    expect(replayRoute).toBeGreaterThan(adminBlockEnd);
    expect(replayRoute).toBeGreaterThan(dailyRoute);
    expect(app.slice(replayRoute, replayRoute + 180)).toContain("element={<AdminRoute>");
    expect(app).toContain('<Route path="creator-replay/:runId"');
    expect(app).toContain("<CreatorReplayRunPage legacyRedirect />");
  });
});
