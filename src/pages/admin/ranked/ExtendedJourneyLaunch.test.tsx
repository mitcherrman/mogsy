/**
 * JEXT — the extended Ashe/Jinx launch control is the ordinary queue join with
 * exactly its admin preset, followed by the ordinary Ranked handoff.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import {
  ASHE_JINX_EXTENDED_JOURNEY_PRESET,
  AsheJinxExtendedJourneyLaunch,
} from "./ExtendedJourneyLaunch";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

let bodies: unknown[];
let urls: string[];
let reply: () => Response;

function RankedProbe() {
  const location = useLocation();
  return <div data-testid="ranked-route">{JSON.stringify(location.state)}</div>;
}

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/admin/leaguecraft"]}>
      <Routes>
        <Route path="/admin/leaguecraft" element={<AsheJinxExtendedJourneyLaunch />} />
        <Route path="/quiz/ranked" element={<RankedProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const matched = () => json({
  schema_version: "ranked_duel.queue_status.v1",
  projection_type: "queue_status",
  match_id: null, round_number: null,
  server_time: "2026-10-03T12:00:00+00:00",
  payload: {
    status: "matched", match_id: "rkb_jext", queue_version: 1,
    class_id: null, role: null, enqueued_at: "2026-10-03T12:00:00+00:00",
  },
});

beforeEach(() => {
  bodies = [];
  urls = [];
  reply = matched;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    urls.push(String(url));
    bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
    return reply();
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Ashe vs Jinx Extended Journey launch", () => {
  it("is labelled as the internal long Journey", () => {
    renderAt();
    expect(screen.getByTestId("ashe-jinx-extended-journey-launch-button").textContent)
      .toBe("Play Ashe vs Jinx — Extended Journey");
    expect(screen.getByTestId("ashe-jinx-extended-journey-launch").textContent)
      .toMatch(/internal long\/depth playtest/i);
  });

  it("sends exactly admin.ashe_jinx_extended_journey and hands off to Ranked", async () => {
    expect(ASHE_JINX_EXTENDED_JOURNEY_PRESET).toBe("admin.ashe_jinx_extended_journey");
    renderAt();
    fireEvent.click(screen.getByTestId("ashe-jinx-extended-journey-launch-button"));
    await waitFor(() => expect(screen.getByTestId("ranked-route")).toBeTruthy());
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/api\/ranked\/queue$/);
    const { visitor_id, session_id, interaction_id, ...gameplay } =
      bodies[0] as Record<string, unknown>;
    expect(gameplay).toEqual({
      match_with_bot: true,
      preset: "admin.ashe_jinx_extended_journey",
    });
    expect([visitor_id, session_id, interaction_id].every((v) => typeof v === "string")).toBe(true);
    expect(screen.getByTestId("ranked-route").textContent).toContain("rkb_jext");
  });

  it("shows the server's refusal and stays put", async () => {
    reply = () => json({
      detail: { code: "RANKED_PRESET_NOT_AUTHORIZED", message: "this session is for admins" },
    }, 403);
    renderAt();
    fireEvent.click(screen.getByTestId("ashe-jinx-extended-journey-launch-button"));
    await waitFor(() =>
      expect(screen.getByTestId("ashe-jinx-extended-journey-launch-error")).toBeTruthy());
    expect(screen.queryByTestId("ranked-route")).toBeNull();
  });
});
