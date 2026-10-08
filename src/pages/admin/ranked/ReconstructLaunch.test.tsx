import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { OrderForgeLaunch } from "./OrderForgeLaunch";
import { RECONSTRUCT_PRESET, ReconstructLaunch } from "./ReconstructLaunch";

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
        <Route
          path="/admin/leaguecraft"
          element={
            <>
              <ReconstructLaunch />
              <OrderForgeLaunch />
            </>
          }
        />
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
    server_time: "2026-09-27T12:00:00+00:00",
    payload: {
      status: "matched", match_id: id, queue_version: 1, class_id: null, role: null,
      enqueued_at: "2026-09-27T12:00:00+00:00",
    },
  });

beforeEach(() => {
  bodies = [];
  reply = matched("rkb_rc1");
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
    return reply();
  }));
});
afterEach(() => vi.unstubAllGlobals());

const gameplay = (b: unknown) => {
  const { visitor_id, session_id, interaction_id, ...rest } = b as Record<string, unknown>;
  return rest;
};

describe("ReconstructLaunch", () => {
  it("renders the Play Reconstruct button and an unrated playtest description", () => {
    renderAt();
    expect(screen.getByTestId("reconstruct-launch-button").textContent).toBe("Play Reconstruct");
    expect(screen.getByTestId("reconstruct-launch").textContent).toContain("unrated Ranked Bot playtest");
  });

  it("sends admin.reconstruct with matchWithBot and navigates with the match id", async () => {
    renderAt();
    fireEvent.click(screen.getByTestId("reconstruct-launch-button"));
    await waitFor(() => expect(screen.getByTestId("ranked-route")).toBeTruthy());
    expect(RECONSTRUCT_PRESET).toBe("admin.reconstruct");
    expect(gameplay(bodies[0])).toEqual({ match_with_bot: true, preset: "admin.reconstruct" });
    expect(screen.getByTestId("ranked-route").textContent).toContain("rkb_rc1");
  });

  it("shows a launch error cleanly and stays put", async () => {
    reply = () => json({ detail: { code: "RANKED_FORMAT_UNSERVABLE", message: "no recipe graph" } }, 503);
    renderAt();
    fireEvent.click(screen.getByTestId("reconstruct-launch-button"));
    await waitFor(() => expect(screen.getByTestId("reconstruct-launch-error")).toBeTruthy());
    expect(screen.queryByTestId("ranked-route")).toBeNull();
  });

  it("leaves the Order Forge launcher working", async () => {
    renderAt();
    fireEvent.click(screen.getByTestId("order-forge-launch-button"));
    await waitFor(() => expect(screen.getByTestId("ranked-route")).toBeTruthy());
    expect(gameplay(bodies[0]).preset).toBe("admin.order_forge");
  });
});
