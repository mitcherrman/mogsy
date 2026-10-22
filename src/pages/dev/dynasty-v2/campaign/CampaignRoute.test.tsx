/**
 * RC0 — the campaign route survives server data it cannot draw: a stage it does not
 * know keeps its served name, and a failure outside one screen (the shell or the BO5
 * inside it) shows a way back instead of unmounting the app. Real E3B responses, edited.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/motion/useReveal", async (orig) => ({ ...(await orig<typeof import("@/lib/motion/useReveal")>()), useMotionAllowed: () => false }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: () => undefined, stop: () => undefined, preload: () => undefined }) }));
vi.mock("@/lib/admin-auth/adminCredentials", () => ({ ADMIN_API_BASE_URL: "http://backend.test", buildAdminHeaders: async () => ({ Authorization: "Bearer owner-session" }) }));

import samplesJson from "@/lib/dynasty/e1/fixtures/e3b-campaign-samples.json";
import { StingerHost, ambience, ambientResetForTests } from "../broadcast";
import { CampaignRoute } from "./CampaignFlow";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const R = (state: string) => JSON.parse(JSON.stringify((samplesJson as Json).samples.find((x: Json) => x.state === state).response));

function serve(campaign: () => Json, series: () => Json = () => R("campaign_series_after_preparation")) {
  const gets: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    gets.push(u);
    const c = campaign();
    const body = u.includes("include_finished=true") ? R("discovery_none")
      : u.includes("/campaigns?") ? { ...R("discovery_single"), campaigns: [{ ...R("discovery_single").campaigns[0], campaign_id: c.campaign_id }], resume: { campaign_id: c.campaign_id, reason: "single" } }
      : u.includes("/series/") ? series()
      : c;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  return gets;
}
const mount = () => render(<MemoryRouter><StingerHost><CampaignRoute /></StingerHost></MemoryRouter>);
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; ambientResetForTests(); ambience.resetForTests(); try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("RC0 campaign route boundaries", () => {
  it("draws a stage it does not know under its served key instead of crashing", async () => {
    const c = R("campaign_created");
    c.current_series.stage = "lcq";
    serve(() => c);
    mount();
    await waitFor(() => expect(screen.getByTestId("dynasty-campaign").getAttribute("data-screen")).toBe("hq"));
    expect(screen.getByTestId("campaign-bar-stage").textContent).toBe("lcq");
  });

  it("shows a reload, not a blank app, when the shell cannot be drawn; reloading re-reads the server", async () => {
    const c = R("campaign_created");
    c.current_series.opponent = null; // the shell reads the opponent outside any screen boundary
    const gets = serve(() => c);
    const spy = quiet();
    mount();
    await waitFor(() => expect(screen.getByTestId("campaign-route-error")).toBeTruthy());
    const before = gets.length;
    c.current_series.opponent = R("campaign_created").current_series.opponent;
    await act(async () => { fireEvent.click(screen.getByTestId("campaign-route-error-action")); });
    await waitFor(() => expect(screen.getByTestId("dynasty-campaign").getAttribute("data-screen")).toBe("hq"));
    expect(gets.length).toBeGreaterThan(before);
    spy.mockRestore();
  });

  it("keeps the run when the BO5 cannot be drawn: back to headquarters, the series stays open", async () => {
    const c = R("campaign_in_series");
    const broken = R("campaign_series_after_preparation");
    broken.series_id = c.current_series.series_id;
    broken.lineup.champion_pool = null; // passes the series reader; the draft screen maps it
    serve(() => c, () => broken);
    const spy = quiet();
    mount();
    await waitFor(() => expect(screen.getByTestId("campaign-series-error")).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByTestId("campaign-series-error-action")); });
    await waitFor(() => expect(screen.getByTestId("dynasty-campaign").getAttribute("data-screen")).toBe("hq"));
    spy.mockRestore();
  });
});
