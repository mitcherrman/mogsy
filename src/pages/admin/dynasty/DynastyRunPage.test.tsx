/**
 * ROG1-D1 — the owner Dynasty page, driven by REAL ROG1-C1 backend responses
 * replayed by the recorded-path fixture transport (no backend here; the
 * backend's own suites cover generation, replay and authorization).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDynastySnapshot } from "@/lib/dynasty/contracts";
import { DynastyApiError, type DynastyActionRequest, type DynastyTransport } from "@/lib/dynasty/client";
import { DYNASTY_SCENARIOS, createFixtureTransport, type FixtureTransport } from "@/lib/dynasty/fixtureTransport";
import DynastyRunPage from "./DynastyRunPage";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({})),
}));

const KEY = "test.dynasty.start_key";
const DRAFT = ["syn-top-09", "syn-jng-07", "syn-mid-03", "syn-bot-06", "syn-sup-07", "syn-bot-09", "syn-bot-01"];
const CHAMPS: [string, string][] = [["top", "syn_champ_01"], ["jng", "syn_champ_11"], ["mid", "syn_champ_08"], ["bot", "syn_champ_05"], ["sup", "syn_champ_15"]];

function mount(transport: DynastyTransport) {
  return render(
    <MemoryRouter>
      <DynastyRunPage transport={transport} storageKey={KEY} retryDelaysMs={[0, 0]} />
    </MemoryRouter>,
  );
}

const page = () => screen.getByTestId("dynasty-page");
const phase = () => page().getAttribute("data-phase");

async function begin() {
  fireEvent.click(await screen.findByTestId("dynasty-begin"));
  await waitFor(() => expect(phase()).toBe("draft"));
}

async function draft(id: string) {
  fireEvent.click(await screen.findByTestId(`offer-${id}`));
  fireEvent.click(screen.getByTestId("draft-confirm"));
  await waitFor(() => expect(screen.queryByTestId(`offer-${id}`)).toBeNull());
}

async function toLineup(t: FixtureTransport) {
  mount(t);
  await begin();
  for (const id of DRAFT) await draft(id);
  await waitFor(() => expect(phase()).toBe("relic"));
  fireEvent.click(screen.getByTestId("relic-flash_ready"));
  fireEvent.click(screen.getByTestId("relic-confirm"));
  await waitFor(() => expect(phase()).toBe("lineup"));
}

beforeEach(() => { window.localStorage.clear(); window.scrollTo = vi.fn() as never; });
afterEach(() => { vi.restoreAllMocks(); });

describe("Worlds Dynasty owner page", () => {
  it("plays a whole run from the server's snapshots: draft, relic, lineup, match, explained result", async () => {
    const t = createFixtureTransport();
    await toLineup(t);

    // Roster rail: five starters and two substitutes.
    const roster = screen.getByTestId("dynasty-roster");
    expect(within(roster).getAllByTestId("roster-sub")).toHaveLength(2);
    expect(within(roster).getByTestId("roster-relic")).toHaveTextContent("Flash Ready");

    // Proficiency data is on screen before the pick.
    expect(screen.getByTestId("pick-top-syn_champ_01")).toHaveTextContent("0.74");
    expect(screen.getByTestId("play-match")).toBeDisabled();
    for (const [role, key] of CHAMPS) {
      fireEvent.click(screen.getByTestId(`pick-${role}-${key}`));
      await waitFor(() => expect(screen.getByTestId(`lineup-${role}-picked`)).toHaveTextContent("Synthetic Champion"));
    }
    // A champion locked for one role is unavailable to the others.
    expect(screen.getByTestId("pick-top-syn_champ_15")).toBeDisabled();

    // Substitute into the compatible (same-role) slot.
    expect(screen.getByTestId("swap-syn-bot-09")).toHaveTextContent("(Bot)");
    fireEvent.click(screen.getByTestId("swap-syn-bot-09"));
    await waitFor(() => expect(screen.getByTestId("roster-starter-bot")).toHaveTextContent("SYN-BOT-09"));

    fireEvent.click(screen.getByTestId("play-match"));
    await waitFor(() => expect(phase()).toBe("completed"));
    const skip = screen.queryByTestId("match-skip");
    if (skip) fireEvent.click(skip);

    const outcome = await screen.findByTestId("match-outcome");
    expect(outcome).toHaveTextContent("Victory 4–3");
    for (const role of ["top", "jng", "mid", "bot", "sup"]) expect(screen.getByTestId(`lane-${role}`)).toBeInTheDocument();
    expect(screen.getByTestId("team-battle")).toHaveTextContent("Team battle · 2 points");
    // The re-rolled lane shows both recorded draws.
    const jng = screen.getByTestId("lane-jng");
    expect(jng).toHaveTextContent("Re-roll");
    expect(within(jng).getAllByTestId("roll-record")).toHaveLength(2);
    // Backend numbers, not browser math: the top lane's recorded probability.
    expect(screen.getByTestId("lane-top")).toHaveTextContent("Your chance 72.3%");
    expect(screen.getByTestId("match-provenance")).toHaveTextContent("Not a historical result");

    // Every action carried the snapshot's seq and a fresh id; nothing else.
    const acts = t.calls.filter((c) => c.method === "act").map((c) => c.body as Record<string, unknown>);
    expect(acts).toHaveLength(15);
    acts.forEach((a, i) => {
      expect(a.expected_seq).toBe(i);
      expect(Object.keys(a).sort()).toEqual(["action_id", "expected_seq", "kind", "payload"]);
    });
    expect(new Set(acts.map((a) => a.action_id)).size).toBe(15);
  }, 30_000);

  it("shows the synthetic-catalog label before and during the run", async () => {
    mount(createFixtureTransport());
    expect(screen.getByTestId("dynasty-synthetic-banner")).toHaveTextContent(/not real people/i);
    await begin();
    expect(screen.getByTestId("dynasty-synthetic-banner")).toHaveTextContent("SYNTHETIC FIXTURE");
  });

  it("resumes the same run after a reload without losing progress", async () => {
    const t = createFixtureTransport();
    const first = mount(t);
    await begin();
    await draft("syn-top-09");
    await draft("syn-jng-07");
    const key = window.localStorage.getItem(KEY);
    expect(key).toMatch(/^wd-start-/);
    first.unmount();

    mount(t); // a reload: a new page instance, same browser storage
    await waitFor(() => expect(phase()).toBe("draft"));
    expect(screen.getByText("Pick 3 of 7")).toBeInTheDocument();
    const starts = t.calls.filter((c) => c.method === "start").map((c) => c.body);
    expect(starts).toEqual([{ start_key: key }, { start_key: key }]);
  });

  it("retries a lost action with the SAME action_id and expected_seq", async () => {
    const t = createFixtureTransport();
    mount(t);
    await begin();
    const real = t.act.bind(t);
    let failures = 3; // more than the automatic retries
    vi.spyOn(t, "act").mockImplementation(async (...args) => {
      if (failures-- > 0) throw new DynastyApiError("network", null, null, "down");
      return real(...args);
    });
    fireEvent.click(screen.getByTestId("offer-syn-top-09"));
    fireEvent.click(screen.getByTestId("draft-confirm"));
    const notice = await screen.findByTestId("dynasty-notice");
    expect(notice).toHaveTextContent("Backend unreachable");
    expect(phase()).toBe("draft");

    fireEvent.click(screen.getByTestId("dynasty-retry"));
    await waitFor(() => expect(screen.queryByTestId("offer-syn-top-09")).toBeNull());
    const bodies = vi.mocked(t.act).mock.calls.map((c) => c[1]);
    expect(bodies).toHaveLength(4);
    expect(new Set(bodies.map((b) => b.action_id)).size).toBe(1);
    expect(new Set(bodies.map((b) => b.expected_seq))).toEqual(new Set([0]));
  });

  it("preserves the saved run on a temporary owner-verification 503 and can resume", async () => {
    const t = createFixtureTransport();
    const original = t.start.bind(t);
    const stored = "wd-start-existing0001";
    window.localStorage.setItem(KEY, stored);
    let calls = 0;
    vi.spyOn(t, "start").mockImplementation(async (...args) => {
      if (++calls === 1) throw new DynastyApiError("backend", 503, null, "Owner authorization temporarily unavailable");
      return original(...args);
    });
    mount(t); // automatic resume from the saved key encounters the 503
    const notice = await screen.findByTestId("dynasty-notice");
    expect(notice).toHaveTextContent("Owner verification temporarily unavailable");
    expect(screen.queryByTestId("dynasty-fatal")).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe(stored);
    fireEvent.click(await screen.findByTestId("dynasty-begin"));
    await waitFor(() => expect(phase()).toBe("draft"));
    expect(vi.mocked(t.start).mock.calls.map((c) => c[0])).toEqual([stored, stored]);
  });

  it("retries a 503 owner-verification outage with the SAME id and sequence", async () => {
    const t = createFixtureTransport();
    mount(t);
    await begin();
    const original = t.act.bind(t);
    let unavailable = true;
    vi.spyOn(t, "act").mockImplementation(async (...args) => {
      if (unavailable) {
        unavailable = false;
        throw new DynastyApiError("backend", 503, null, "Owner authorization temporarily unavailable");
      }
      return original(...args);
    });
    fireEvent.click(screen.getByTestId("offer-syn-top-09"));
    fireEvent.click(screen.getByTestId("draft-confirm"));
    expect(await screen.findByTestId("dynasty-notice")).toHaveTextContent("Owner verification temporarily unavailable");
    expect(screen.queryByTestId("dynasty-fatal")).toBeNull();
    expect(screen.getByTestId("dynasty-retry")).toBeEnabled();
    fireEvent.click(screen.getByTestId("dynasty-retry"));
    await waitFor(() => expect(screen.getByText("Pick 2 of 7")).toBeInTheDocument());
    const bodies = vi.mocked(t.act).mock.calls.map((c) => c[1]);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].action_id).toBe(bodies[1].action_id);
    expect(bodies[0].expected_seq).toBe(bodies[1].expected_seq);
    expect(window.localStorage.getItem(KEY)).toMatch(/^wd-start-/);
  });

  it("reloads the run and asks again on a stale sequence", async () => {
    const t = createFixtureTransport();
    mount(t);
    await begin();
    // Another tab drafts first.
    const s0 = readDynastySnapshot(DYNASTY_SCENARIOS.full.steps[0].response);
    await act(async () => {
      await t.act(s0.run_id, { expected_seq: 0, action_id: "other-tab-0001", kind: "draft_pick", payload: { player_id: "syn-top-09" } });
    });
    fireEvent.click(screen.getByTestId("offer-syn-top-09"));
    fireEvent.click(screen.getByTestId("draft-confirm"));
    const notice = await screen.findByTestId("dynasty-notice");
    expect(notice).toHaveAttribute("data-code", "STALE_SEQ");
    await waitFor(() => expect(screen.getByText("Pick 2 of 7")).toBeInTheDocument());
    expect(t.calls.some((c) => c.method === "read")).toBe(true);
  });

  it("keeps the board when the server refuses a choice", async () => {
    mount(createFixtureTransport());
    await begin();
    fireEvent.click(screen.getByTestId("offer-syn-top-08")); // not the recorded pick
    fireEvent.click(screen.getByTestId("draft-confirm"));
    const notice = await screen.findByTestId("dynasty-notice");
    expect(notice).toHaveTextContent("Choice refused");
    expect(screen.getByText("Pick 1 of 7")).toBeInTheDocument();
  });

  it.each([
    ["disabled", "disabled", /switched off/],
    ["integrity", "integrity", /refused this run/],
  ] as const)("stops on a %s backend", async (failure, kind, text) => {
    const t = createFixtureTransport();
    t.failNext(failure);
    mount(t);
    fireEvent.click(await screen.findByTestId("dynasty-begin"));
    const fatal = await screen.findByTestId("dynasty-fatal");
    expect(fatal).toHaveAttribute("data-kind", kind);
    expect(fatal).toHaveTextContent(text);
  });

  it("tells the owner when the backend is not running", async () => {
    const t = createFixtureTransport();
    t.failNext("network");
    mount(t);
    fireEvent.click(await screen.findByTestId("dynasty-begin"));
    await waitFor(() => expect(screen.getByTestId("dynasty-lobby")).toHaveTextContent("DYNASTY_ENABLED=1"));
    expect(screen.queryByTestId("dynasty-fatal")).toBeNull();
    expect(screen.getByTestId("dynasty-begin")).toBeEnabled();
  });

  it("requires a lane for a targeted relic and sends it", async () => {
    // The recorded relic snapshot, with Lane Specialist (a real v1 relic) in the offer.
    const relicStep = DYNASTY_SCENARIOS.full.steps.find((s) => (s.response as { phase: string }).phase === "relic")!;
    const snap = readDynastySnapshot(JSON.parse(JSON.stringify(relicStep.response)));
    snap.relic_offer[0] = { relic_id: "lane_specialist", name: "Lane Specialist", rarity: "common", description: "+5 power in one lane of your choice.", targeted: true };
    const actSpy = vi.fn(async (_runId: string, _action: DynastyActionRequest): Promise<never> => {
      throw new DynastyApiError("backend", 422, "BAD_ROLE", "x");
    });
    const t: DynastyTransport = { start: async () => snap, read: async () => snap, act: actSpy };
    mount(t);
    fireEvent.click(await screen.findByTestId("dynasty-begin"));
    fireEvent.click(await screen.findByTestId("relic-lane_specialist"));
    expect(screen.getByTestId("relic-confirm")).toBeDisabled();
    fireEvent.click(within(screen.getByTestId("relic-target")).getByDisplayValue("mid"));
    fireEvent.click(screen.getByTestId("relic-confirm"));
    await waitFor(() => expect(actSpy).toHaveBeenCalled());
    expect(actSpy.mock.calls[0][1]).toMatchObject({ kind: "choose_relic", payload: { relic_id: "lane_specialist", target_role: "mid" } });
  });

  it("shows a resumed result immediately, without replaying the reveal", async () => {
    const run = DYNASTY_SCENARIOS.loss;
    const done = readDynastySnapshot(run.steps[1].response);
    const t: DynastyTransport = { start: async () => done, read: async () => done, act: vi.fn() };
    mount(t);
    fireEvent.click(await screen.findByTestId("dynasty-begin"));
    expect(await screen.findByTestId("match-outcome")).toHaveTextContent("Defeat 3–4");
    expect(screen.queryByTestId("match-skip")).toBeNull();
    expect(screen.getByTestId("dynasty-match")).toHaveAttribute("data-step", "7");
  });
});
