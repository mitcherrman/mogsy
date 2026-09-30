import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { ORDER_FORGE_PRESET, OrderForgeLaunch } from "./OrderForgeLaunch";
import { ReferenceJourneyLaunch } from "./ReferenceJourneyLaunch";

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
              <OrderForgeLaunch />
              <ReferenceJourneyLaunch />
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
  reply = matched("rkb_of1");
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

describe("OrderForgeLaunch", () => {
  it("renders the Play Order Forge button and description", () => {
    renderAt();
    expect(screen.getByTestId("order-forge-launch-button").textContent).toBe("Play Order Forge");
    expect(screen.getByTestId("order-forge-launch").textContent).toContain(
      "Arrange 5 items from cheapest to most expensive in an unrated Ranked Bot playtest.",
    );
  });

  it("sends admin.order_forge with matchWithBot and navigates with the match id", async () => {
    renderAt();
    fireEvent.click(screen.getByTestId("order-forge-launch-button"));
    await waitFor(() => expect(screen.getByTestId("ranked-route")).toBeTruthy());
    expect(gameplay(bodies[0])).toEqual({ match_with_bot: true, preset: ORDER_FORGE_PRESET });
    expect(screen.getByTestId("ranked-route").textContent).toContain("rkb_of1");
  });

  it("shows a launch error cleanly and stays put", async () => {
    reply = () => json({ detail: { code: "RANKED_FORMAT_UNSERVABLE", message: "pool cannot serve" } }, 503);
    renderAt();
    fireEvent.click(screen.getByTestId("order-forge-launch-button"));
    await waitFor(() => expect(screen.getByTestId("order-forge-launch-error")).toBeTruthy());
    expect(screen.queryByTestId("ranked-route")).toBeNull();
  });

  it("leaves the Reference Journey launcher working", async () => {
    renderAt();
    fireEvent.click(screen.getByTestId("reference-journey-launch-button"));
    await waitFor(() => expect(screen.getByTestId("ranked-route")).toBeTruthy());
    expect(gameplay(bodies[0]).preset).toBe("admin.zed_ahri_reference_journey");
  });
});
