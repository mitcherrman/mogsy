/**
 * UGMP — the Playtests hub: one grid, every mode, the backend's availability.
 * MOCKED fetch: the status contract and the queue join are stood in for here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));
vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

import { PlaytestHub } from "./PlaytestHub";
import { PlaytestApiError, describePlaytestError, playtestsApi, type PlaytestStatus } from "@/lib/playtests/api";
import { HUB_ORDER } from "@/lib/playtests/modes";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const READY: PlaytestStatus = {
  contract: "admin_playtests.status.v1",
  labs: {
    rangefinder: { available: true, rounds: 227, authority_label: "x", reason: null },
    glyph_press: { available: true, rounds: 9, authority_label: "x", reason: null },
    stat_drop: { available: true, rounds: 6, authority_label: "x", reason: null },
    combat_estimate: { available: true, rounds: 12, authority_label: "x", reason: null },
    perfect_timing: { available: true, rounds: 460, authority_label: "Ability data · 0 ability haste · patch 26.18", reason: null },
  },
  presets: Object.fromEntries(
    ["admin.match", "admin.reconstruct", "admin.order_forge", "admin.roster_lock", "admin.draft_memory", "admin.scrub"]
      .map((p) => [p, { available: true, reason: null }]),
  ),
};

let statusReply: () => Response | Promise<Response>;
let queueBodies: unknown[];
let statusHeaders: HeadersInit | undefined;

function RankedProbe() {
  return <div data-testid="ranked-route">{JSON.stringify(useLocation().state)}</div>;
}
function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/admin/leaguecraft"]}>
      <Routes>
        <Route path="/admin/leaguecraft" element={<PlaytestHub />} />
        <Route path="/quiz/ranked" element={<RankedProbe />} />
        <Route path="/admin/playtests/:mode" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  statusReply = () => json(READY);
  queueBodies = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/api/admin/playtests/status")) {
      statusHeaders = init?.headers;
      return statusReply();
    }
    queueBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
    return json({
      schema_version: "ranked_duel.queue_status.v1", projection_type: "queue_status", match_id: null, round_number: null,
      server_time: "2026-10-15T12:00:00+00:00",
      payload: { status: "matched", match_id: "rkb_hub1", queue_version: 1, class_id: null, role: null, enqueued_at: "2026-10-15T12:00:00+00:00" },
    });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const titles = () => within(screen.getByTestId("playtest-mode-grid")).getAllByRole("heading").map((h) => h.textContent);

describe("PlaytestHub", () => {
  it("lists every mode in one grid, the seven new modes first, each with a maturity chip and a Play control", async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId("rangefinder-launch").dataset.available).toBe("true"));
    expect(titles()).toEqual([
      "Rangefinder", "Glyph Press", "Roster Lock", "Draft Memory", "Chronoscope", "Stat Drop", "Combat Estimate",
      "Perfect Timing", "Match Grid", "Reconstruct", "Order Forge",
    ]);
    expect(HUB_ORDER).toHaveLength(11);
    const chips = within(screen.getByTestId("playtest-mode-grid")).getAllByTestId("playtest-tier").map((c) => c.dataset.tier);
    expect(chips).toEqual(["prototype", "prototype", "ranked-bot", "ranked-bot", "ranked-bot", "experiment", "experiment", "prototype", "ranked-bot", "ranked-bot", "ranked-bot"]);
    for (const id of ["rangefinder", "glyph-press", "stat-drop", "combat-estimate", "perfect-timing"]) {
      const link = screen.getByTestId(`${id}-launch-button`);
      expect(link.getAttribute("href")).toBe(`/admin/playtests/${id}`);
    }
    for (const id of ["roster-lock", "draft-memory", "scrub", "match-grid", "reconstruct", "order-forge"]) {
      expect(screen.getByTestId(`${id}-launch-button`).tagName).toBe("BUTTON");
    }
    expect(screen.getByTestId("rangefinder-launch-status").textContent).toContain("227 abilities");
    // Perfect Timing deals from the backend's current ability data, not a frozen capture.
    expect(screen.getByTestId("perfect-timing-launch-status").textContent).toBe("460 certified abilities, 5 per run · current ability data");
    expect(new Headers(statusHeaders).get("Authorization")).toBe("Bearer owner-session");
  });

  it("does not offer a lab while availability is being read", () => {
    statusReply = () => new Promise(() => {});
    renderHub();
    const play = screen.getByTestId("glyph-press-launch-button") as HTMLButtonElement;
    expect(play.tagName).toBe("BUTTON");
    expect(play.disabled).toBe(true);
    expect(screen.getByTestId("glyph-press-launch-status").textContent).toMatch(/checking/i);
    // a preset never waits on the hub's read: its queue join is its own authority
    expect((screen.getByTestId("match-grid-launch-button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the backend's own reason for an unavailable mode and disables its Play", async () => {
    statusReply = () => json({
      ...READY,
      labs: { ...READY.labs, stat_drop: { available: false, rounds: 0, authority_label: "x", reason: "NUMERIC_LAB_ENABLED is not set on this backend." } },
      presets: { ...READY.presets, "admin.scrub": { available: false, reason: "The preset's format did not build: boom" } },
    });
    renderHub();
    await waitFor(() => expect(screen.getByTestId("stat-drop-launch").dataset.available).toBe("false"));
    expect(screen.getByTestId("stat-drop-launch-status").textContent).toBe("NUMERIC_LAB_ENABLED is not set on this backend.");
    expect((screen.getByTestId("stat-drop-launch-button") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("scrub-launch-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("scrub-launch-status").textContent).toMatch(/did not build/);
    expect(screen.getByTestId("combat-estimate-launch-button").tagName).toBe("A");
  });

  it("does not offer Perfect Timing when its flag is off, and says so", async () => {
    statusReply = () => json({
      ...READY,
      labs: { ...READY.labs, perfect_timing: { available: false, rounds: 0, authority_label: "x", reason: "PERFECT_TIMING_LAB_ENABLED is not set on this backend." } },
    });
    renderHub();
    await waitFor(() => expect(screen.getByTestId("perfect-timing-launch").dataset.available).toBe("false"));
    expect(screen.getByTestId("perfect-timing-launch-status").textContent).toBe("PERFECT_TIMING_LAB_ENABLED is not set on this backend.");
    expect((screen.getByTestId("perfect-timing-launch-button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("rangefinder-launch-button").tagName).toBe("A");
  });

  it("does not offer Perfect Timing from a backend that predates it (no status entry)", async () => {
    const { perfect_timing: _omitted, ...older } = READY.labs;
    statusReply = () => json({ ...READY, labs: older });
    renderHub();
    await waitFor(() => expect(screen.getByTestId("perfect-timing-launch").dataset.available).toBe("false"));
    expect(screen.getByTestId("perfect-timing-launch-status").textContent).toMatch(/does not report this mode/);
    expect(screen.getByTestId("stat-drop-launch-button").tagName).toBe("A");
  });

  it.each([
    [403, null, /owner session/],
    [404, null, /does not serve the owner playtests yet/],
    [503, null, /temporarily unavailable/],
  ])("turns a %s from the status read into an actionable reason on every lab", async (status, code, text) => {
    statusReply = () => json(code ? { detail: { error: { code, message: "x" } } } : { detail: "x" }, status);
    renderHub();
    await waitFor(() => expect(screen.getByTestId("rangefinder-launch").dataset.available).toBe("false"));
    for (const id of ["rangefinder", "glyph-press", "stat-drop", "combat-estimate", "perfect-timing"]) {
      expect(screen.getByTestId(`${id}-launch-status`).textContent).toMatch(text);
    }
    expect((screen.getByTestId("roster-lock-launch-button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("rechecks availability on demand", async () => {
    statusReply = () => json({ detail: "x" }, 503);
    renderHub();
    await waitFor(() => expect(screen.getByTestId("rangefinder-launch").dataset.available).toBe("false"));
    statusReply = () => json(READY);
    fireEvent.click(screen.getByTestId("playtests-refresh"));
    await waitFor(() => expect(screen.getByTestId("rangefinder-launch").dataset.available).toBe("true"));
  });

  it("opens a lab mode at its owner play route", async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId("combat-estimate-launch").dataset.available).toBe("true"));
    fireEvent.click(screen.getByTestId("combat-estimate-launch-button"));
    expect((await screen.findByTestId("where")).textContent).toBe("/admin/playtests/combat-estimate");
  });

  it.each([
    ["roster-lock", "admin.roster_lock"], ["draft-memory", "admin.draft_memory"], ["scrub", "admin.scrub"],
    ["match-grid", "admin.match"], ["reconstruct", "admin.reconstruct"], ["order-forge", "admin.order_forge"],
  ])("launches %s as an unrated Ranked Bot match and hands the arena the Playtests origin", async (id, preset) => {
    renderHub();
    fireEvent.click(screen.getByTestId(`${id}-launch-button`));
    const probe = await screen.findByTestId("ranked-route");
    const body = queueBodies[0] as Record<string, unknown>;
    expect(body.match_with_bot).toBe(true);
    expect(body.preset).toBe(preset);
    expect(JSON.parse(probe.textContent!)).toEqual({ matchId: "rkb_hub1", origin: "admin_playtests" });
  });

  it("keeps a failed launch on the card", async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId("rangefinder-launch").dataset.available).toBe("true"));
    vi.mocked(fetch).mockImplementationOnce(async () =>
      json({ detail: { code: "RANKED_FORMAT_UNSERVABLE", message: "authority refused" } }, 503));
    fireEvent.click(screen.getByTestId("reconstruct-launch-button"));
    expect(await screen.findByTestId("reconstruct-launch-error")).toBeTruthy();
    expect(screen.queryByTestId("ranked-route")).toBeNull();
  });
});

describe("playtestsApi", () => {
  it("refuses an unknown contract and maps backend errors", async () => {
    const api = playtestsApi(vi.fn(async () => json({ contract: "nope" })) as unknown as typeof fetch);
    await expect(api.status()).rejects.toThrow(/could not read/);
    const refused = playtestsApi(vi.fn(async () => json({ detail: { error: { code: "session_expired", message: "gone" } } }, 404)) as unknown as typeof fetch);
    const err = await refused.lockRangefinder("s", 0, "t").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlaytestApiError);
    expect((err as PlaytestApiError).code).toBe("session_expired");
    expect(describePlaytestError(err, "x")).toMatch(/expired/);
    const offline = playtestsApi(vi.fn(async () => { throw new TypeError("offline"); }) as unknown as typeof fetch);
    expect(describePlaytestError(await offline.status().catch((e: unknown) => e), "x")).toMatch(/Could not reach/);
  });

  it("posts each action to its own owner-only endpoint with only the response", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      const contract = url.endsWith("/sound") ? "interaction_lab.glyph_press.ledger.v1"
        : url.includes("glyph-press") && url.endsWith("/lock") ? "interaction_lab.glyph_press.reveal.v1"
        : url.endsWith("/lock") ? "interaction_lab.rangefinder.reveal.v1"
        : url.includes("glyph-press") ? "interaction_lab.glyph_press.session.v1" : "interaction_lab.rangefinder.session.v1";
      return json({ contract });
    });
    const api = playtestsApi(fetchImpl as unknown as typeof fetch);
    await api.startRangefinder();
    await api.lockRangefinder("s/1", 2, "rf_x");
    await api.startGlyphPress();
    await api.soundGlyphPress("s", 0, "A");
    await api.lockGlyphPress("s", 0, ["A", null]);
    expect(calls.map(([u, i]) => [u, i?.method, i?.body])).toEqual([
      ["http://backend.test/api/admin/interaction-lab/rangefinder/sessions", "POST", undefined],
      ["http://backend.test/api/admin/interaction-lab/rangefinder/sessions/s%2F1/rounds/2/lock", "POST", '{"stop":"rf_x"}'],
      ["http://backend.test/api/admin/interaction-lab/glyph-press/sessions", "POST", undefined],
      ["http://backend.test/api/admin/interaction-lab/glyph-press/sessions/s/rounds/0/sound", "POST", '{"glyph":"A"}'],
      ["http://backend.test/api/admin/interaction-lab/glyph-press/sessions/s/rounds/0/lock", "POST", '{"glyphs":["A",null]}'],
    ]);
    for (const [, init] of calls) expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer owner-session");
  });
});
