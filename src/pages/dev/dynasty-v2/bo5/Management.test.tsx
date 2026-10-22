/**
 * UX-6 — the E3A management screens inside the real BO5 flow (jsdom, motion
 * off), served by the live transport over a scripted backend that answers with
 * REAL captured E3A responses (`e3a-live-capture.json`). The assertions are on
 * what the owner sees and on the exact request bodies sent.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/motion/useReveal", async (orig) => ({ ...(await orig<typeof import("@/lib/motion/useReveal")>()), useMotionAllowed: () => false }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: () => undefined, stop: () => undefined, preload: () => undefined }) }));
vi.mock("@/lib/admin-auth/adminCredentials", () => ({ ADMIN_API_BASE_URL: "http://backend.test", buildAdminHeaders: async () => ({ Authorization: "Bearer owner-session" }) }));

import { memoryStore } from "@/lib/dynasty/e1/fixtureServer";
import capture from "@/lib/dynasty/e1/fixtures/e3a-live-capture.json";
import { LiveSeriesTransport } from "@/lib/dynasty/e1/liveTransport";
import { MANAGEMENT_RULES_E3A } from "@/lib/dynasty/e1/e3acontracts";
import { StingerHost, ambience, ambientResetForTests } from "../broadcast";
import { Bo5Flow } from "./Bo5Flow";

beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; ambientResetForTests(); ambience.resetForTests(); try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => cleanup());

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const CAP = capture as unknown as { plan: Json[]; samples: { state: string; status?: number; request: Json; response: Json }[] };
const S = Object.fromEntries(CAP.samples.map((x) => [x.state, x])) as Record<string, { status?: number; request: Json; response: Json }>;
const R = (state: string) => JSON.parse(JSON.stringify(S[state].response));
const listOf = (snap: Json) => ({ ...R("discovery_single"), series: [{ ...R("discovery_single").series[0], series_id: snap.series_id }], resume: { series_id: snap.series_id, reason: "single" } });

const tid = (id: string) => screen.getByTestId(id);
const has = (id: string) => screen.queryByTestId(id) !== null;
const screenId = () => tid("dynasty-bo5").getAttribute("data-screen");
async function click(id: string) { await act(async () => { fireEvent.click(tid(id)); }); }

function backend(answer: (method: string, url: string, body: Json) => { status?: number; body: unknown }) {
  const calls: { method: string; url: string; body: Json }[] = [];
  const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const c = { method: init?.method ?? "GET", url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    const r = answer(c.method, c.url, c.body);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
  return { f: f as unknown as typeof fetch, calls };
}
const posts = (calls: { method: string; body: Json }[], kind: string) => calls.filter((c) => c.method === "POST" && c.body?.kind === kind).map((c) => c.body);

function mount(t: LiveSeriesTransport) {
  return render(<MemoryRouter><StingerHost><Bo5Flow transport={t} /></StingerHost></MemoryRouter>);
}
/** Resume straight into a captured state (discovery single → that snapshot). */
function resumeAt(state: string, actions: (body: Json) => { status?: number; body: unknown } = () => { throw new Error("no action expected"); }) {
  const snap = R(state);
  const b = backend((m, url, body) => (m === "GET" ? { body: url.endsWith("/series") ? listOf(snap) : snap } : actions(body)));
  mount(new LiveSeriesTransport({ store: memoryStore(), fetchImpl: b.f, managementScenario: "congested_schedule" }));
  return b;
}

describe("UX-6 E3A management loop (captured E3A responses)", () => {
  it("creates an E3A series, shows the squad, sends the preparation plan whole, and surfaces a server refusal verbatim", async () => {
    let commits = 0;
    const b = backend((m, url, body) => {
      if (m === "GET") return { body: url.endsWith("/series") ? R("discovery_none") : R("created") };
      if (url.endsWith("/series")) return { body: R("created") };
      if (body.kind === "commit_preparation") return ++commits === 1 ? { status: 422, body: R("prep_over_budget") } : { body: R("prep_committed") };
      throw new Error(`unexpected ${body.kind}`);
    });
    mount(new LiveSeriesTransport({ store: memoryStore(), fetchImpl: b.f, managementScenario: "congested_schedule" }));
    await waitFor(() => expect(screenId()).toBe("home"));
    expect(tid("bo5-banner").getAttribute("data-managed")).toBe("true");
    await click("scenario-fresh");
    await click("scenario-congested_schedule");
    await click("bo5-new");
    await click("org-choose-ember");
    await waitFor(() => expect(screenId()).toBe("roster"));
    expect(b.calls.find((c) => c.method === "POST")!.body).toMatchObject({ management_rules: MANAGEMENT_RULES_E3A, entry_scenario: "congested_schedule", when_unfinished_exists: "refuse" });

    // Headquarters: ten server rows with their own fatigue, and how the squad arrived (the entry ledger)
    expect(screen.getAllByTestId("squad-card")).toHaveLength(10);
    expect(tid("entry-scenario").getAttribute("data-scenario")).toBe("congested_schedule");
    const shown = Object.fromEntries(screen.getAllByTestId("squad-card").map((c) => [c.getAttribute("data-player"), within(c).getByTestId("fatigue").getAttribute("data-value")]));
    expect(shown).toEqual(Object.fromEntries(R("created").management.you.players.map((p: Json) => [p.player_id, String(p.fatigue)])));
    expect(within(tid("entry-changes")).getAllByTestId("change-entry").length).toBeGreaterThan(0);
    await click("squad-confirm");

    // Preparation: the server's options, a three-day plan, the room follows the activity
    await waitFor(() => expect(screenId()).toBe("prep"));
    expect(screen.getAllByTestId(/^prep-option-/).map((x) => `${x.getAttribute("data-testid")}:${x.getAttribute("data-eligible")}`))
      .toEqual(R("created").management.decisions.preparation.options.map((o: Json) => `prep-option-${o.activity}:${o.eligible}`));
    await click("prep-add-rest");
    await click("prep-add-vod_review");
    expect(tid("scene").getAttribute("data-scene")).toBe("warroom");
    await click("vod-stage-late");
    await click("prep-add-champion_practice");
    expect(tid("scene").getAttribute("data-scene")).toBe("practice");
    await act(async () => { fireEvent.change(tid("practice-player"), { target: { value: "t_user-mid" } }); });
    await act(async () => { fireEvent.change(tid("practice-champion"), { target: { value: "syn_c1_artillery" } }); });
    expect(tid("prep-budget").textContent).toMatch(/3 of 3 days planned/);
    expect(tid("prep-add-scrim")).toBeDisabled();

    await click("prep-commit");
    await waitFor(() => expect(has("series-error")).toBe(true));
    expect(tid("series-error").textContent).toContain(R("prep_over_budget").detail.message);
    expect(screenId()).toBe("prep");
    await click("prep-commit");
    await waitFor(() => expect(screenId()).toBe("draft"));
    const sent = posts(b.calls, "commit_preparation");
    expect(sent).toHaveLength(2);
    expect(sent[1].payload).toEqual({ activities: CAP.plan });
    expect(sent[1].action_id).not.toBe(sent[0].action_id); // a new decision, not a retry
  });

  it("drafts players and champions together, previews only the suggested lineup, and sends the reserve", async () => {
    const b = resumeAt("prep_committed", (body) => {
      if (body.kind === "lock_lineup") return { body: R("lineup_locked") };
      throw new Error(body.kind);
    });
    await waitFor(() => expect(screenId()).toBe("draft"));
    const preview = R("prep_committed").lineup.preview;
    expect(tid("inputs-you-cohesion").textContent).toContain(`team power +${preview.you.cohesion.team_power.toFixed(1)}`);
    const mid = within(tid("lineup-preview")).getAllByTestId("input-player").find((x) => x.getAttribute("data-player") === "t_user-mid")!;
    expect(mid.textContent).toContain(`prof ${preview.you.players.find((p: Json) => p.role === "mid").proficiency.toFixed(2)}`);
    // the practiced pick is marked on the champion chip
    expect(tid("pick-champ-mid-syn_c1_artillery").textContent).toMatch(/0\.60.*★/);
    await click("pick-player-t_user-res-jng");
    expect(has("lineup-preview")).toBe(false);
    expect(tid("cohesion-note").textContent).toMatch(/1 reserve starting: Reserve Jungle −0\.05/);
    await click("draft-lock");
    await waitFor(() => expect(screenId()).toBe("game"));
    expect(posts(b.calls, "lock_lineup")[0].payload).toEqual(S.lineup_locked.request.payload);
  });

  it("explains a published stage with the server's management components", async () => {
    resumeAt("game_published");
    await waitFor(() => expect(screenId()).toBe("game"));
    await waitFor(() => expect(has("mgmt-influence")).toBe(true));
    const rows = screen.getAllByTestId("influence-row");
    expect(rows.map((r) => r.textContent).join(" ")).toMatch(/Champion proficiency\+2\.0/);
    expect(rows.map((r) => r.getAttribute("title")).join(" ")).toMatch(/practiced \(prep\.d3\.champion_practice\)/);
    expect(rows.map((r) => r.getAttribute("title")).join(" ")).toMatch(/1 reserve/);
  });

  it("shows what the game did, offers the server's tactics, sends one choice and carries it into the next draft", async () => {
    const b = resumeAt("tactics", (body) => {
      if (body.kind === "choose_tactic") return { body: R("tactic_chosen") };
      throw new Error(body.kind);
    });
    await waitFor(() => expect(screenId()).toBe("result"));
    expect(within(tid("result-changes")).getAllByTestId("change-entry").length).toBeGreaterThan(0);
    await click("result-next");
    await waitFor(() => expect(screenId()).toBe("decision"));
    const opts = R("tactics").management.decisions.tactics.options;
    for (const o of opts) expect(tid(`tactic-${o.choice}`).getAttribute("data-eligible")).toBe(String(o.eligible));
    expect(tid("tactic-quick_review").textContent).toContain(opts.find((o: Json) => o.choice === "quick_review").effects[0]);
    await click("tactic-quick_review");
    await click("decision-confirm");
    await waitFor(() => expect(screenId()).toBe("draft"));
    expect(posts(b.calls, "choose_tactic")).toEqual([expect.objectContaining({ kind: "choose_tactic", payload: { game: 1, choice: "quick_review" } })]);
    if (has("draft-changes-toggle")) await click("draft-changes-toggle");
    expect(within(tid("draft-changes")).getAllByTestId("change-entry").map((x) => x.getAttribute("data-source"))).toContain("tactic.g1.quick_review");
  });

  it("ends with the series result, the reserves fielded and what carries forward (a preview)", async () => {
    resumeAt("series_completed");
    await waitFor(() => expect(["result", "series"]).toContain(screenId()));
    if (screenId() === "result") await click("result-next");
    await waitFor(() => expect(screenId()).toBe("series"));
    expect(tid("series-game-1").textContent).toMatch(/Reserve: jng/);
    expect(tid("carry-permanent").textContent).toMatch(/Artillery 0\.60/);
    expect(tid("carry-forward").textContent).toContain(R("series_completed").management.carry_over.carry_out.note);
  });

  it("keeps the e2 flow for a series without management", async () => {
    const e2 = (await import("@/lib/dynasty/e1/fixtures/e2-live-capture.json")).default as unknown as { samples: { state: string; response: Json }[] };
    const created = e2.samples.find((x) => x.state === "series_created")!.response;
    const b = backend((m, url) => ({ body: m === "GET" ? (url.endsWith("/series") ? listOf(created) : created) : created }));
    mount(new LiveSeriesTransport({ store: memoryStore(), fetchImpl: b.f }));
    await waitFor(() => expect(screenId()).toBe("roster"));
    expect(has("bo5-squad")).toBe(false);
    expect(has("bo5-roster")).toBe(true);
    expect(tid("bo5-banner").getAttribute("data-managed")).toBeNull();
  });
});
