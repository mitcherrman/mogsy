/**
 * Admin · Public Daily format panel, and the Creator Replay format choice.
 *
 * The server enforces every rule; these pin that the panel shows the server's
 * state (never an assumed save), cannot submit V2 while the release refuses
 * it, sends the exact confirmation, and that the Creator Replay format choice
 * talks only to the take endpoints — never to the public setting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "https://railway.example",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

import { PublicDailyFormatControl } from "./PublicDailyFormatControl";
import CreatorReplayPage from "@/pages/admin/CreatorReplayPage";
import { parsePublicFormatState } from "@/lib/daily-challenge/run/dailyFormatAdmin";

const STATE = {
  schema_version: 1, today: "2026-10-22", public_format: "classic_v1", in_force_change_id: null,
  official_runs_play: "classic_v1", official_runs_source: "public_setting", default_format: "classic_v1",
  earliest_effective_date: "2026-10-23",
  formats: [
    { id: "classic_v1", label: "Classic Daily V1", publish_refusal: null },
    { id: "three_acts_v2", label: "Three Acts Daily V2",
      publish_refusal: { code: "PUBLIC_V2_NOT_RELEASED", message: "This backend release does not serve official three-act runs." } },
  ],
  scheduled: [], history: [], official_runs_today: { classic_v1: 12 },
};

type Call = { url: string; init?: RequestInit };

function stubFetch(handler: (url: string, init?: RequestInit) => unknown, status = 200) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const body = handler(url, init);
    return { ok: status < 400, status, json: async () => body };
  }));
  return calls;
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("public Daily format panel", () => {
  it("shows what public players get today from the server", async () => {
    stubFetch(() => STATE);
    render(<PublicDailyFormatControl />);
    const current = await screen.findByTestId("public-daily-format-current");
    expect(current.textContent).toContain("public players get Classic Daily V1");
    expect(current.textContent).toContain("12 Classic Daily V1");
    expect((screen.getByLabelText("From (UTC day)") as HTMLInputElement).min).toBe("2026-10-23");
  });

  it("cannot submit Three Acts V2 while the release refuses it", async () => {
    const calls = stubFetch(() => STATE);
    render(<PublicDailyFormatControl />);
    await screen.findByTestId("public-daily-format-current");
    fireEvent.change(screen.getByLabelText("Format"), { target: { value: "three_acts_v2" } });
    expect(screen.getByTestId("public-daily-format-refusal").textContent).toContain("does not serve official three-act runs");
    expect(screen.getByTestId("public-daily-format-submit")).toHaveProperty("disabled", true);
    expect(calls.filter((c) => c.init?.method === "POST")).toHaveLength(0);
  });

  it("submits only with the exact confirmation, and shows the server's answer", async () => {
    const after = { ...STATE, scheduled: [], history: [] };
    const calls = stubFetch((_url, init) => init?.method === "POST"
      ? { detail: { code: "PUBLIC_FORMAT_UNCHANGED", message: "Classic Daily V1 is already the public format on 2026-10-23" } }
      : after);
    render(<PublicDailyFormatControl />);
    await screen.findByTestId("public-daily-format-current");
    fireEvent.change(screen.getByLabelText("Reason (recorded)"), { target: { value: "keep V1" } });
    const submit = screen.getByTestId("public-daily-format-submit");
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "classic_v1@2026-10-24" } });
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "classic_v1@2026-10-23" } });
    expect(submit).toHaveProperty("disabled", false);
    // The server refuses (unchanged); the panel says so and assumes nothing.
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: false, status: 409, json: async () => ({ detail: { code: "PUBLIC_FORMAT_UNCHANGED", message: "Classic Daily V1 is already the public format on 2026-10-23" } }) };
    }));
    fireEvent.click(submit);
    const result = await screen.findByTestId("public-daily-format-result");
    expect(result.getAttribute("role")).toBe("alert");
    expect(result.textContent).toContain("already the public format");
    const post = calls.find((c) => c.init?.method === "POST");
    expect(post?.url).toBe("https://railway.example/api/daily-run/admin/public-format");
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      format: "classic_v1", effective_date: "2026-10-23", confirm: "classic_v1@2026-10-23", reason: "keep V1",
    });
  });

  it("surfaces a load failure instead of a guessed state", async () => {
    stubFetch(() => ({ detail: { message: "Owner session required" } }), 403);
    render(<PublicDailyFormatControl />);
    expect((await screen.findByTestId("public-daily-format-error")).textContent).toContain("Owner session required");
    expect(screen.queryByTestId("public-daily-format-current")).toBeNull();
  });

  it("refuses an unreadable state", () => {
    expect(() => parsePublicFormatState({ ...STATE, public_format: "three_acts_v9" })).toThrow();
    expect(() => parsePublicFormatState(null)).toThrow();
  });
});

describe("Creator Replay format choice", () => {
  function mount() {
    return render(<MemoryRouter initialEntries={["/admin/creator-replay"]}>
      <Routes>
        <Route path="/admin/creator-replay" element={<CreatorReplayPage />} />
        <Route path="/quiz/daily-challenge/creator/:runId" element={<p data-testid="replay-route">Take</p>} />
      </Routes>
    </MemoryRouter>);
  }

  it("defaults to Classic V1 and shows the V2 take only when chosen", async () => {
    const calls = stubFetch((url) => url.endsWith("/journeys") ? { journeys: [] } : {});
    mount();
    expect(screen.getByTestId("creator-format-classic_v1")).toHaveProperty("checked", true);
    expect(screen.queryByTestId("three-acts-take")).toBeNull();
    expect(screen.getByTestId("creator-journey-picker")).toBeTruthy();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls.every((c) => !c.url.includes("public-format"))).toBe(true);
  });

  it("V2: reads the server status, launches a take, and never touches the public setting", async () => {
    const RUN_ID = "dr_" + "b".repeat(24);
    const calls = stubFetch((url, init) => {
      if (url.endsWith("/journeys")) return { journeys: [] };
      if (url.endsWith("/three-acts/status")) return { owner_takes_enabled: true, certification_scope: "serveable", readiness: { composes: true } };
      if (url.endsWith("/three-acts") && init?.method === "POST") return { run_id: RUN_ID };
      return {};
    });
    mount();
    fireEvent.click(screen.getByTestId("creator-format-three_acts_v2"));
    expect(localStorage.getItem("mogzy.creator-replay.format.v1")).toBe("three_acts_v2");
    expect((await screen.findByText(/Enabled on this server \(serveable content scope\)/))).toBeTruthy();
    expect(screen.queryByTestId("creator-journey-picker")).toBeNull();
    fireEvent.click(screen.getByTestId("three-acts-new"));
    await screen.findByTestId("replay-route");
    expect(calls.some((c) => c.url === "https://railway.example/api/daily-run/admin/three-acts" && c.init?.method === "POST")).toBe(true);
    expect(calls.every((c) => !c.url.includes("public-format"))).toBe(true);
  });

  it("V2: the button is disabled while the server's owner flag is off", async () => {
    localStorage.setItem("mogzy.creator-replay.format.v1", "three_acts_v2");
    stubFetch((url) => url.endsWith("/journeys") ? { journeys: [] }
      : { owner_takes_enabled: false, certification_scope: "certified", readiness: { composes: false } });
    mount();
    expect(await screen.findByText(/Not enabled on this server yet/)).toBeTruthy();
    expect(screen.getByTestId("three-acts-new")).toHaveProperty("disabled", true);
  });
});
