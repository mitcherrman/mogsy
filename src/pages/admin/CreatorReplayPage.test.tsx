import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "https://railway.example",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

import CreatorReplayPage from "./CreatorReplayPage";
import { buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

const RUN_ID = "dr_" + "a".repeat(24);

function mount() {
  return render(<MemoryRouter initialEntries={["/admin/creator-replay"]}>
    <Routes>
      <Route path="/admin/creator-replay" element={<CreatorReplayPage />} />
      <Route path="/quiz/daily-challenge/creator/:runId" element={<p data-testid="replay-route">Filming run</p>} />
    </Routes>
  </MemoryRouter>);
}

describe("creator replay admin entry", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("creates exactly one new take on click, with the owner bearer header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ run_id: RUN_ID }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mount();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Record a new take" }));
    await waitFor(() => expect(screen.getByTestId("replay-route")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://railway.example/api/daily-run/admin/creator",
      { method: "POST", headers: { Authorization: "Bearer owner-session" } },
    );
    expect(buildAdminHeaders).toHaveBeenCalledWith(
      "https://railway.example/api/daily-run/admin/creator",
    );
  });

  it("fails visibly and never navigates when the backend rejects or malforms the run", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ run_id: "arbitrary-or-official" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Record a new take" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent)
      .toContain("invalid run"));
    expect(screen.queryByTestId("replay-route")).toBeNull();
  });
});
