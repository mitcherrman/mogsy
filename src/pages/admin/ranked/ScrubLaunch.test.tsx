import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { ReconstructLaunch } from "./ReconstructLaunch";
import { SCRUB_PRESET, ScrubLaunch } from "./ScrubLaunch";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let bodies: unknown[];
let reply: () => Response;

function RankedProbe() {
  return <div data-testid="ranked-route">{JSON.stringify(useLocation().state)}</div>;
}

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/admin/leaguecraft"]}>
      <Routes>
        <Route path="/admin/leaguecraft" element={<><ScrubLaunch /><ReconstructLaunch /></>} />
        <Route path="/quiz/ranked" element={<RankedProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const matched = (id: string) => () =>
  json({
    schema_version: "ranked_duel.queue_status.v1",
    projection_type: "queue_status",
    match_id: null,
    round_number: null,
    server_time: "2026-10-10T12:00:00+00:00",
    payload: {
      status: "matched", match_id: id, queue_version: 1, class_id: null, role: null,
      enqueued_at: "2026-10-10T12:00:00+00:00",
    },
  });

beforeEach(() => {
  bodies = [];
  reply = matched("rkb_sc1");
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
    return reply();
  }));
});
afterEach(() => vi.unstubAllGlobals());

const gameplay = (b: unknown) => {
  const { visitor_id, session_id, interaction_id, ...rest } = b as Record<string, unknown>;
  void visitor_id; void session_id; void interaction_id;
  return rest;
};

describe("ScrubLaunch", () => {
  it("renders the Play Chronoscope button and an unrated playtest description", () => {
    renderAt();
    expect(screen.getByTestId("scrub-launch-button").textContent).toBe("Play Chronoscope");
    expect(screen.getByTestId("scrub-launch").textContent).toContain("unrated Ranked Bot playtest");
  });

  it("sends admin.scrub with matchWithBot and navigates with the match id", async () => {
    renderAt();
    fireEvent.click(screen.getByTestId("scrub-launch-button"));
    await waitFor(() => expect(screen.getByTestId("ranked-route")).toBeTruthy());
    expect(SCRUB_PRESET).toBe("admin.scrub");
    expect(gameplay(bodies[0])).toEqual({ match_with_bot: true, preset: "admin.scrub" });
    expect(screen.getByTestId("ranked-route").textContent).toContain("rkb_sc1");
  });

  it("shows a launch error cleanly and stays put", async () => {
    reply = () => json({ detail: { code: "RANKED_FORMAT_UNSERVABLE", message: "authority refused" } }, 503);
    renderAt();
    fireEvent.click(screen.getByTestId("scrub-launch-button"));
    await waitFor(() => expect(screen.getByTestId("scrub-launch-error")).toBeTruthy());
    expect(screen.queryByTestId("ranked-route")).toBeNull();
  });

  it("leaves the Reconstruct launcher working", async () => {
    renderAt();
    fireEvent.click(screen.getByTestId("reconstruct-launch-button"));
    await waitFor(() => expect(screen.getByTestId("ranked-route")).toBeTruthy());
    expect(gameplay(bodies[0]).preset).toBe("admin.reconstruct");
  });
});
