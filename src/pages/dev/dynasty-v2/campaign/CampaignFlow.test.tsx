/**
 * UX-7 — the campaign journey in jsdom (motion off) over a scripted backend that
 * answers with REAL E3B responses (the backend's samples + the UX-7 live capture).
 * Assertions are on what the owner sees and on the exact requests sent.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/motion/useReveal", async (orig) => ({ ...(await orig<typeof import("@/lib/motion/useReveal")>()), useMotionAllowed: () => false }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: () => undefined, stop: () => undefined, preload: () => undefined }) }));
vi.mock("@/lib/admin-auth/adminCredentials", () => ({ ADMIN_API_BASE_URL: "http://backend.test", buildAdminHeaders: async () => ({ Authorization: "Bearer owner-session" }) }));

import samplesJson from "@/lib/dynasty/e1/fixtures/e3b-campaign-samples.json";
import liveJson from "@/lib/dynasty/e1/fixtures/e3b-live-capture.json";
import { StingerHost, ambience, ambientResetForTests } from "../broadcast";
import { CampaignFlow } from "./CampaignFlow";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ALL = [...(samplesJson as Json).samples, ...(liveJson as Json).samples] as { state: string; response: Json }[];
const R = (state: string) => JSON.parse(JSON.stringify(ALL.find((x) => x.state === state)!.response));
const listing = (c: Json, reason: "single" | "multiple" = "single", extra: Json[] = []) => ({ ...R("discovery_single"), count: 1 + extra.length, campaigns: [{ ...R("discovery_single").campaigns[0], campaign_id: c.campaign_id }, ...extra], resume: { campaign_id: reason === "single" ? c.campaign_id : null, reason } });
const none = () => R("discovery_none");

type Call = { method: string; url: string; body: Json };
function backend(answer: (c: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const c = { method: init?.method ?? "GET", url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    const r = answer(c);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}
/** GET /campaigns (active) → `active`; GET /campaigns?include_finished=true → finished; GET /campaigns/{id} → `snap()`. */
function campaignBackend(active: () => Json, snap: () => Json, post: (c: Call) => { status?: number; body: unknown } = () => { throw new Error("no POST expected"); }, extra: (c: Call) => { status?: number; body: unknown } | null = () => null) {
  return backend((c) => {
    const x = extra(c); if (x) return x;
    if (c.method === "POST") return post(c);
    if (c.url.includes("include_finished=true")) return { body: R("discovery_all") };
    if (c.url.includes("/campaigns?")) return { body: active() };
    if (c.url.includes("/campaigns/")) return { body: snap() };
    throw new Error(`unexpected ${c.method} ${c.url}`);
  });
}

beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; ambientResetForTests(); ambience.resetForTests(); try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const tid = (id: string) => screen.getByTestId(id);
const has = (id: string) => screen.queryByTestId(id) !== null;
const screenId = () => tid("dynasty-campaign").getAttribute("data-screen");
async function click(id: string) { await act(async () => { fireEvent.click(tid(id)); }); }
const mount = () => render(<MemoryRouter><StingerHost><CampaignFlow /></StingerHost></MemoryRouter>);
const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST");

describe("UX-7 campaign journey (real E3B responses)", () => {
  it("resumes a single run into headquarters with the served stakes, window, opponent and map, and abandons only after asking", async () => {
    const created = R("campaign_created");
    const calls = campaignBackend(() => listing(created), () => created, (c) => ({ body: { ...R("abandoned"), applied: true, duplicate: false, campaign_id: created.campaign_id } }));
    mount();
    await waitFor(() => expect(screenId()).toBe("hq"));
    expect(tid("stakes-text").textContent).toBe(created.current_series.stakes);
    expect(tid("window-slots").textContent).toBe("3 preparation days");
    expect(tid("next-opponent").getAttribute("data-opponent")).toBe(created.current_series.opponent.opponent_id);
    expect(screen.getAllByTestId("map-node").map((n) => n.getAttribute("data-status"))).toEqual(created.map.map((n: Json) => n.status));
    expect(tid("activity-rest").getAttribute("data-eligible")).toBe("false"); // the server's eligibility, shown as served
    expect(posts(calls)).toHaveLength(0);
    await click("abandon-open");
    expect(posts(calls)).toHaveLength(0);
    await click("abandon-yes");
    await waitFor(() => expect(screenId()).toBe("ending"));
    expect(posts(calls).map((c) => c.body)).toEqual([{ expected_seq: created.seq, action_id: expect.stringMatching(/^ux7-abandon-/), kind: "abandon", payload: { confirm: "abandon" } }]);
    expect(tid("ending-card").getAttribute("data-kind")).toBe("abandoned");
  });

  it("records a finished series once (double click), then shows exactly what carried and the next window", async () => {
    let state = "series_result_awaiting_settlement";
    const calls = campaignBackend(() => listing(R(state)), () => R(state), () => { state = "series_settled_transition"; return { body: R(state) }; });
    mount();
    await waitFor(() => expect(screenId()).toBe("result"));
    await act(async () => { fireEvent.click(tid("result-record")); fireEvent.click(tid("result-record")); });
    await waitFor(() => expect(screenId()).toBe("transition"));
    const settle = R("series_result_awaiting_settlement");
    expect(posts(calls).map((c) => c.body)).toEqual([{ expected_seq: settle.seq, action_id: expect.stringMatching(/^ux7-settle-/), kind: "settle_series", payload: settle.next.payload }]);
    const t = R("series_settled_transition").last_transition;
    expect(tid("carried-break").textContent).toContain(`fatigue −${t.carried.break.recovery}`);
    const rows = within(tid("carried-fatigue")).getAllByRole("listitem");
    expect(rows.length).toBe(t.carried.fatigue.filter((f: Json) => f.at_series_end || f.after_break).length);
    expect(tid("transition").getAttribute("data-decided")).toBe("next_round");
    await click("transition-next");
    expect(screenId()).toBe("hq");
    expect(tid("dynasty-campaign-main").textContent).toContain("Split week 2");
  });

  it("another device settled first: STALE_SEQ adopts the server's state with a notice, no second POST", async () => {
    let n = 0;
    const calls = campaignBackend(() => listing(R("series_result_awaiting_settlement")), () => (n++ === 0 ? R("series_result_awaiting_settlement") : R("series_settled_transition")),
      () => ({ status: 409, body: { detail: { code: "STALE_SEQ", message: "expected_seq 1 but the campaign is at 3" } } }));
    mount();
    await waitFor(() => expect(screenId()).toBe("result"));
    await click("result-record");
    await waitFor(() => expect(screenId()).toBe("transition"));
    expect(tid("campaign-error").getAttribute("data-code")).toBe("notice");
    expect(posts(calls)).toHaveLength(1);
  });

  it("never auto-picks among several active runs, and a refused start offers the active runs instead", async () => {
    const a = R("campaign_created"); const other = { ...R("discovery_single").campaigns[0], campaign_id: "wdc3_other_run_0000000000" };
    const calls = campaignBackend(() => listing(a, "multiple", [other]), () => a);
    mount();
    await waitFor(() => expect(screenId()).toBe("pick"));
    expect(screen.getAllByTestId("campaign-choice")).toHaveLength(2);
    expect(calls.some((c) => /\/campaigns\/wdc3_/.test(c.url))).toBe(false);
    await act(async () => { fireEvent.click(screen.getAllByTestId("campaign-choice")[0]); });
    await waitFor(() => expect(screenId()).toBe("hq"));
  });

  it("starts a run with an explicit policy and refuse; ACTIVE_CAMPAIGN_EXISTS lists the active runs", async () => {
    const refused = R("refused_active_campaign_exists");
    const calls = campaignBackend(() => none(), () => { throw new Error("no read"); }, () => ({ status: 409, body: { detail: refused.detail } }));
    mount();
    await waitFor(() => expect(screenId()).toBe("start"));
    await click("policy-narrow_early_mid_combo");
    await click("campaign-begin");
    await act(async () => { fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("data-testid")?.startsWith("org-choose-"))!); });
    await waitFor(() => expect(screenId()).toBe("pick"));
    const body = posts(calls)[0].body;
    expect(body).toEqual({ start_key: expect.stringMatching(/^ux7-run-/), qualification_policy: "narrow_early_mid_combo", when_active_exists: "refuse" });
    expect(screen.getAllByTestId("campaign-choice")).toHaveLength(refused.detail.active.campaigns.length);
  });

  it("a championship plays the skippable trophy frame with the final five, then the legacy recap", async () => {
    const champ = R("champion_ending");
    campaignBackend(() => none(), () => champ, undefined, (c) => (c.method === "GET" && c.url.includes("include_finished=true") ? { body: { ...R("discovery_all"), campaigns: [{ ...R("discovery_all").campaigns[1], campaign_id: champ.campaign_id }] } } : null));
    mount();
    await waitFor(() => expect(screenId()).toBe("start"));
    await act(async () => { fireEvent.click(screen.getAllByTestId("past-run")[0]); });
    // The final settlement's transition comes first, once; then the ending.
    await waitFor(() => expect(screenId()).toBe("transition"));
    expect(tid("transition").getAttribute("data-decided")).toBe("ending");
    await click("transition-next");
    expect(screenId()).toBe("ending");
    expect(tid("cine-full").getAttribute("data-kind")).toBe("championship");
    const last = champ.history[champ.history.length - 1];
    expect(within(tid("cine-roster")).getAllByRole("listitem")).toHaveLength(5);
    await click("cine-skip");
    expect(has("cine-full")).toBe(false);
    expect(tid("dynasty-campaign-main").textContent).toContain("World champions");
    expect(screen.getAllByTestId("map-node").map((n) => n.getAttribute("data-status"))).toContain("skipped_bye");
    expect(screen.getAllByTestId("history-row")).toHaveLength(champ.history.length);
    expect(tid("ending-card").textContent).toContain(`${last.score.you}–${last.score.opponent}`);
  });

  it("an elimination ends on the placement and the served story, with no trophy", async () => {
    const elim = R("elimination_ending");
    campaignBackend(() => listing(elim), () => elim);
    localStorage.setItem("mogzy.dynasty.ux7.seen.v1", JSON.stringify({ [elim.campaign_id]: [`t${elim.last_transition.from_series}`] }));
    mount();
    await waitFor(() => expect(screenId()).toBe("ending"));
    expect(has("cine-full")).toBe(false);
    expect(tid("ending-card").getAttribute("data-kind")).toBe("eliminated");
    expect(tid("dynasty-campaign-main").textContent).toContain(elim.ending.placement);
    for (const b of screen.getByTestId("campaign-story").getAttribute("data-beats")!.split(",")) expect(elim.story.beats.map((x: Json) => x.kind)).toContain(b);
  });

  it("a refresh inside a started series re-enters the BO5 on the pinned series; HQ returns to the campaign", async () => {
    const live = R("campaign_in_series");
    const series = R("campaign_series_after_preparation");
    expect(live.current_series.series_id).toBe(series.series_id);
    const calls = campaignBackend(() => listing(live), () => live, undefined, (c) => (c.url.endsWith(`/series/${series.series_id}`) ? { body: series } : null));
    mount();
    await waitFor(() => expect(has("dynasty-bo5")).toBe(true));
    expect(screenId()).toBe("series");
    await waitFor(() => expect(tid("run-bar-round").textContent).toContain(live.current_series.round_title));
    expect(calls.some((c) => c.method === "GET" && /\/series$/.test(c.url))).toBe(false); // never standalone discovery
    await click("series-hq");
    await waitFor(() => expect(screenId()).toBe("hq"));
  });

  it("the live rematch window shows the rematch, the prior meeting and the must-win flag", async () => {
    const w = R("rematch_window");
    campaignBackend(() => listing(w), () => w);
    localStorage.setItem("mogzy.dynasty.ux7.seen.v1", JSON.stringify({ [w.campaign_id]: [`t${w.last_transition.from_series}`] }));
    mount();
    await waitFor(() => expect(screenId()).toBe("hq"));
    expect(has("rematch-badge")).toBe(true);
    expect(has("must-win")).toBe(true);
    expect(tid("rematch-history").textContent).toMatch(/Split week 3: lost 2–3/);
    expect(tid("campaign-story").getAttribute("data-beats")).toContain("rematch");
  });
});
