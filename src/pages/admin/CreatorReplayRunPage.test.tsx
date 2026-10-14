import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.transport = null;
});

describe("creator replay run viewer", () => {
  it("binds the canonical Daily controller to the specific creator run, not official /today", async () => {
    mocks.readRun.mockResolvedValue({ runId: ID });
    render(<MemoryRouter initialEntries={[`/admin/creator-replay/${ID}`]}>
      <Routes>
        <Route path="/admin/creator-replay/:runId" element={<CreatorReplayRunPage />} />
      </Routes>
    </MemoryRouter>);
    expect(screen.getByTestId("canonical-daily-run")).toBeTruthy();
    expect(mocks.transport).not.toBeNull();
    await mocks.transport!.readToday();
    await mocks.transport!.startToday();
    expect(mocks.readRun).toHaveBeenNthCalledWith(1, ID);
    expect(mocks.readRun).toHaveBeenNthCalledWith(2, ID);
    expect(mocks.normalToday).not.toHaveBeenCalled();
    expect(mocks.normalStart).not.toHaveBeenCalled();
  });

  it("refuses an invalid run id without mounting the Daily gameplay", () => {
    render(<MemoryRouter initialEntries={["/admin/creator-replay/invalid"]}>
      <Routes>
        <Route path="/admin/creator-replay/:runId" element={<CreatorReplayRunPage />} />
      </Routes>
    </MemoryRouter>);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByTestId("canonical-daily-run")).toBeNull();
  });
});
