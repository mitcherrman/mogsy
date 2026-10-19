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
const CATALOG = { journeys: [
  { recipe_id: "support.pantheon_vs_leona", recipe_version: 1, title: "Pantheon vs Leona", role: "support", status: "featured_launch" },
  { recipe_id: "bot.lucian_vs_caitlyn", recipe_version: 1, title: "Lucian vs Caitlyn", role: "bot", status: "featured_launch" },
] };

function mount() {
  return render(<MemoryRouter initialEntries={["/admin/creator-replay"]}>
    <Routes>
      <Route path="/admin/creator-replay" element={<CreatorReplayPage />} />
      <Route path="/quiz/daily-challenge/creator/:runId" element={<p data-testid="replay-route">Filming run</p>} />
    </Routes>
  </MemoryRouter>);
}

describe("creator replay admin entry", () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.removeItem("mogzy.creator-replay.journey-choice.v1"); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("creates exactly one new take on click, with the owner bearer header", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true, json: async () => url.endsWith("/journeys") ? CATALOG : { run_id: RUN_ID },
    }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("creator-journey-picker")).not.toHaveProperty("disabled", true));
    fireEvent.click(screen.getByRole("button", { name: "Record a new take" }));
    await waitFor(() => expect(screen.getByTestId("replay-route")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://railway.example/api/daily-run/admin/creator",
      { method: "POST", headers: { Authorization: "Bearer owner-session", "Content-Type": "application/json" }, body: JSON.stringify({ journey_recipe_id: null }) },
    );
    expect(buildAdminHeaders).toHaveBeenCalledWith(
      "https://railway.example/api/daily-run/admin/creator",
    );
  });

  it("fails visibly and never navigates when the backend rejects or malforms the run", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true, json: async () => url.endsWith("/journeys") ? CATALOG : { run_id: "arbitrary-or-official" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    await waitFor(() => expect(screen.getByTestId("creator-journey-picker")).not.toHaveProperty("disabled", true));
    fireEvent.click(screen.getByRole("button", { name: "Record a new take" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent)
      .toContain("invalid run"));
    expect(screen.queryByTestId("replay-route")).toBeNull();
  });
});

it("passes an exact approved matchup when filming and keeps last choice in storage", async () => {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true, json: async () => url.endsWith("/journeys") ? CATALOG : { run_id: RUN_ID },
  }));
  vi.stubGlobal("fetch", fetchMock);
  localStorage.removeItem("mogzy.creator-replay.journey-choice.v1");
  mount();
  await waitFor(() => expect(screen.getByTestId("creator-journey-picker")).not.toHaveProperty("disabled", true));
  fireEvent.change(screen.getByTestId("creator-journey-picker"), { target: { value: "bot.lucian_vs_caitlyn" } });
  expect(localStorage.getItem("mogzy.creator-replay.journey-choice.v1")).toBe("bot.lucian_vs_caitlyn");
  fireEvent.click(screen.getByRole("button", { name: "Record a new take" }));
  await waitFor(() => expect(screen.getByTestId("replay-route")).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledWith("https://railway.example/api/daily-run/admin/creator", {
    method: "POST",
    headers: { Authorization: "Bearer owner-session", "Content-Type": "application/json" },
    body: JSON.stringify({ journey_recipe_id: "bot.lucian_vs_caitlyn" }),
  });
});
