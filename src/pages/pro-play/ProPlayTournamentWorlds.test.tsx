/**
 * PW4-B — the Worlds 2026 tournament page on the v2 contract, across its
 * phases. The base is the real production body (2026-10-13); every later
 * phase is simulated results written onto it (see `worldsScenarios.ts`).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import DCGI from "@/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json";
import {
  KO,
  PI,
  WORLDS_PRE,
  betweenPlayInAndSwiss,
  betweenSwissAndKnockout,
  clone,
  knockoutMid,
  partialSchedule,
  playInDay1,
  staleSchedule,
  standingsUnavailable,
  swissThrough,
  unknownPhase,
  worldsComplete,
} from "@/lib/pro-play/__fixtures__/worldsScenarios";
import { PRO_PLAY_TOURNAMENT_ROUTE } from "@/lib/pro-play/routes";

import ProPlayTournament from "./ProPlayTournament";

let requests: string[] = [];
/** Each tournament read takes the next body (the last one repeats). */
function backend(...bodies: unknown[]) {
  requests = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      requests.push(path);
      const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as unknown as Response;
      if (path.includes("/live-esports/tournament/")) {
        const body = bodies[Math.min(i++, bodies.length - 1)];
        if (body === 404) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
        return ok(body);
      }
      if (path.includes("/media/resolve")) return ok({ ok: true, identity_available: true, results: [] });
      return ok({});
    }),
  );
}

function renderPage(id = "worlds-2026") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/lol/pro-play/tournament/${id}`]}>
        <Routes>
          <Route path={PRO_PLAY_TOURNAMENT_ROUTE} element={<ProPlayTournament />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sectionIds = () =>
  [...document.querySelectorAll("[data-testid^='section-']")].map((el) => el.getAttribute("data-testid")!.replace("section-", ""));
const section = (id: string) => screen.getByTestId(`section-${id}`);
const card = (id: string) => document.querySelector(`[data-bracket-match="${id}"]`) as HTMLElement;
const clock = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

beforeEach(() => {
  __resetProPlayMediaCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/* 1 ─────────────────────────────────────────────────────────────────────── */

describe("DCGI (v1) is untouched", () => {
  it("renders the DCGI page, not the v2 page", async () => {
    backend(DCGI);
    renderPage("dcgi-2026");
    await screen.findByRole("heading", { level: 1, name: "Demacia Cup Global Invitational 2026" });
    expect(screen.queryByTestId("tournament-v2")).toBeNull();
    expect(sectionIds()).toEqual(["next", "field", "worlds", "schedule"]);
    expect(screen.getAllByTestId("field-team")).toHaveLength(12);
  });
});

/* 2 ─────────────────────────────────────────────────────────────────────── */

describe("Worlds pre-event (real production body)", () => {
  it("leads with the Play-In and the 19-team field, then Swiss, Knockout, schedule", async () => {
    clock("2026-10-13T00:10:00Z");
    backend(WORLDS_PRE);
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "League of Legends World Championship 2026" });
    expect(screen.getByTestId("tournament-v2")).toHaveAttribute("data-phase", "pre_event");
    expect(screen.getByTestId("tournament-phase")).toHaveTextContent("Know the field");
    expect(sectionIds()).toEqual(["stage-play_in", "field", "stage-swiss", "stage-knockout", "schedule"]);
    expect(screen.getByTestId("field-count")).toHaveTextContent("19 teams · 6 regions");
    expect(document.body.textContent).toContain("15 Oct – 14 Nov 2026");
    expect(document.body.textContent).not.toMatch(/twelve/i);
  });

  it("lists the field by region with entry stage and tier, links to team profiles, and no rosters", async () => {
    backend(WORLDS_PRE);
    renderPage();
    const field = await screen.findByTestId("section-field");
    expect(within(field).getAllByTestId("field-team")).toHaveLength(19);
    expect(within(field).getAllByTestId("field-region").map((r) => r.getAttribute("data-region"))).toEqual([
      "LPL", "LCK", "LEC", "LCS", "LCP", "CBLOL",
    ]);
    const tags = within(field).getAllByTestId("entry-tag").map((t) => t.textContent);
    expect(tags.filter((t) => t === "Play-In")).toHaveLength(4);
    expect(tags.filter((t) => t?.startsWith("Swiss"))).toHaveLength(15);
    const los = within(field).getAllByTestId("field-team").find((el) => el.getAttribute("data-team") === "LOS")!;
    expect(los).toHaveTextContent("LOS · CBLOL1");
    expect(los).toHaveTextContent("Swiss · T2");
    expect(within(los).getByRole("link", { name: "LØS" })).toHaveAttribute("href", "/lol/pro-play/team/L%C3%98S");
    const tl = within(field).getAllByTestId("field-team").find((el) => el.getAttribute("data-team") === "TLAW")!;
    // Official display name shown; the link uses the canonical key.
    expect(within(tl).getByRole("link", { name: "Team Liquid Alienware" })).toHaveAttribute("href", "/lol/pro-play/team/Team%20Liquid");
    // Lineups are not certified: one sentence, no empty roster lists, no portraits.
    expect(screen.getByTestId("lineups-withheld")).toBeInTheDocument();
    expect(screen.queryAllByRole("list", { name: /tournament lineup/ })).toHaveLength(0);
    expect(document.querySelector("[data-testid='player-portrait']")).toBeNull();
  });

  it("shows the next match with its stage and slot, and stage tiles with venues", async () => {
    clock("2026-10-13T00:10:00Z");
    backend(WORLDS_PRE);
    renderPage();
    const next = await screen.findByTestId("next-match");
    expect(next).toHaveTextContent(/Play-In · Upper Semifinal 1 · Bo5/);
    expect(next).toHaveTextContent(/C9.*Cloud9 Kia.*vs.*KC.*Karmine Corp/);
    const stages = screen.getAllByTestId("stage");
    expect(stages.map((s) => s.getAttribute("data-progress"))).toEqual(["next", "none", "none"]);
    expect(stages[0]).toHaveTextContent(/Play-In Stage.*15–18 Oct 2026.*Los Angeles, CA/);
    expect(stages[2]).toHaveTextContent(/Final in Brooklyn, NY/);
  });
});

/* 3 ─────────────────────────────────────────────────────────────────────── */

describe("Play-In: double elimination", () => {
  it("draws upper and lower brackets and a final from upstream cells, with slot origins", async () => {
    backend(WORLDS_PRE);
    renderPage();
    const pi = await screen.findByTestId("section-stage-play_in");
    expect(within(pi).getByTestId("double-elim")).toBeInTheDocument();
    expect(within(pi).queryByTestId("single-elim")).toBeNull();
    expect(within(pi).getByTestId("bracket-row-upper")).toBeInTheDocument();
    expect(within(pi).getByTestId("bracket-row-lower")).toBeInTheDocument();
    expect(within(pi).getByTestId("bracket-final")).toHaveTextContent("Play-In Final");
    expect(within(card(PI.ubf)).getAllByTestId("slot-source").map((s) => s.textContent)).toEqual([
      "Winner of FUR v MVK",
      "Winner of C9 v KC",
    ]);
    expect(within(card(PI.lbsf)).getAllByTestId("slot-source").map((s) => s.textContent)).toEqual([
      "Loser of FUR v MVK",
      "Loser of C9 v KC",
    ]);
    expect(within(card(PI.lbf)).getAllByTestId("slot-source").map((s) => s.textContent)).toEqual([
      "Loser of Upper Final",
      "Winner of Lower Semifinal",
    ]);
    expect(within(card(PI.ubsf1)).getByTestId("bracket-routes")).toHaveTextContent("Winner → Upper Final · Loser → Lower Semifinal");
    expect(within(pi).getAllByTestId("bracket-match")).toHaveLength(6);
    expect(within(pi).queryAllByTestId("bracket-tag")).toHaveLength(0);
  });

  it("during the Play-In: today and the stage lead; scores, placed teams and the live match show", async () => {
    clock("2026-10-16T00:10:00Z");
    backend(playInDay1());
    renderPage();
    await screen.findByTestId("live-now");
    expect(screen.getByTestId("tournament-phase")).toHaveTextContent("Play-In stage");
    expect(sectionIds().slice(0, 2)).toEqual(["today", "stage-play_in"]);
    expect(card(PI.ubsf1)).toHaveAttribute("data-state", "completed");
    expect(within(card(PI.ubsf1)).getAllByTestId("slot-score").map((s) => s.textContent)).toEqual(["3", "1"]);
    expect(card(PI.ubsf2)).toHaveAttribute("data-state", "live");
    // Upstream placed C9 in the Upper Final; the other slot still says where it comes from.
    expect(card(PI.ubf).querySelector('[data-team="C9"]')).toBeTruthy();
    expect(within(card(PI.ubf)).getByTestId("slot-source")).toHaveTextContent("Winner of FUR v MVK");
    // Nobody is "out" yet: KC lost an upper-bracket match, which feeds the lower bracket.
    expect(screen.queryAllByTestId("bracket-tag")).toHaveLength(0);
  });
});

/* 4 ─────────────────────────────────────────────────────────────────────── */

describe("Play-In complete, between stages", () => {
  it("explains the transition, the Play-In result and the Swiss preview leads", async () => {
    clock("2026-10-20T18:00:00Z");
    backend(betweenPlayInAndSwiss());
    renderPage();
    const t = await screen.findByTestId("stage-transition");
    expect(t).toHaveTextContent("Play-In complete — Swiss begins 23 Oct in Allen, TX");
    expect(within(t).getByTestId("transition-facts")).toHaveTextContent("KC takes the Play-In slot in Swiss");
    expect(within(t).getByTestId("transition-facts")).toHaveTextContent("Out: MVK, FUR, C9");
    expect(screen.getByTestId("tournament-phase")).toHaveTextContent("Play-In complete");
    expect(sectionIds()[0]).toBe("stage-swiss");
    expect(screen.getAllByTestId("stage").map((s) => s.getAttribute("data-progress"))).toEqual(["complete", "next", "none"]);
    // Bracket outcomes from the backend: three out, KC the Play-In winner.
    const tags = screen.getAllByTestId("bracket-tag").map((x) => x.textContent);
    expect(tags.filter((x) => x === "Out")).toHaveLength(3);
    expect(tags).toContain("Play-In winner");
    expect(within(card(PI.final)).getByText("Play-In winner")).toBeInTheDocument();
    // The Swiss slot is KC, from upstream placement.
    expect(screen.getByTestId("swiss-play-in-slot")).toHaveAttribute("data-state", "placed");
    expect(screen.getByTestId("swiss-play-in-slot")).toHaveTextContent("KC");
  });
});

/* 5 ─────────────────────────────────────────────────────────────────────── */

describe("Swiss: tiers, draws and records", () => {
  it("before Swiss: seeding tiers with the unresolved Play-In slot, no 0–0 table, unpaired rounds summarised", async () => {
    backend(WORLDS_PRE);
    renderPage();
    const sw = await screen.findByTestId("section-stage-swiss");
    expect(within(sw).getAllByTestId("swiss-tier").map((t) => [t.getAttribute("data-tier"), t.querySelectorAll("li").length])).toEqual([
      ["1", 4], ["2", 4], ["3", 4], ["4", 3],
    ]);
    expect(within(sw).getByTestId("swiss-play-in-slot")).toHaveAttribute("data-state", "unresolved");
    expect(within(sw).getByTestId("swiss-play-in-slot")).toHaveTextContent("TBD");
    expect(within(sw).queryByTestId("swiss-records")).toBeNull();
    expect(within(sw).queryAllByTestId("record-group")).toHaveLength(0);
    expect(within(sw).getAllByTestId("swiss-round-tab")).toHaveLength(5);
    expect(within(sw).getByTestId("swiss-round-summary")).toHaveTextContent("8 matches · Bo1");
    expect(within(sw).queryAllByTestId("tournament-match")).toHaveLength(0);
  });

  it("drawn Round 1 lists its pairings; later rounds stay TBD", async () => {
    backend(betweenPlayInAndSwiss());
    renderPage();
    const sw = await screen.findByTestId("section-stage-swiss");
    const rows = within(sw).getAllByTestId("tournament-match");
    expect(rows).toHaveLength(8);
    expect(rows[0]).toHaveTextContent(/AL.*vs.*KC/);
    fireEvent.click(within(sw).getAllByTestId("swiss-round-tab")[1]);
    expect(within(sw).getByTestId("swiss-round-summary")).toHaveTextContent("Pairings are published by the official draw");
  });

  it("during Swiss: records grouped by W–L in the backend's order, rounds focus the one in play", async () => {
    clock("2026-10-29T23:20:00Z");
    const d = swissThrough(3.5);
    backend(d);
    renderPage();
    const sw = await screen.findByTestId("section-stage-swiss");
    expect(sectionIds().slice(0, 3)).toEqual(["today", "stage-swiss", "schedule"]);
    const groups = within(sw).getAllByTestId("record-group").map((g) => g.getAttribute("data-record"));
    expect(groups).toEqual([...new Set(d.state.swiss.records.map((r) => `${r.wins}–${r.losses}`))]);
    expect(within(sw).queryByTestId("swiss-seeding")).toBeNull();
    const selected = within(sw).getAllByTestId("swiss-round-tab").find((t) => t.getAttribute("aria-selected") === "true");
    expect(selected).toHaveTextContent("Round 4");
  });
});

/* 6 ─────────────────────────────────────────────────────────────────────── */

describe("Swiss: advanced and eliminated, exactly as served", () => {
  it("marks status from the backend's records only", async () => {
    const d = swissThrough(3.5);
    backend(d);
    renderPage();
    await screen.findByTestId("swiss-records");
    const chips = screen.getAllByTestId("swiss-record");
    const by = (s: string) => chips.filter((c) => c.getAttribute("data-status") === s).map((c) => c.getAttribute("data-team"));
    expect(by("advanced")).toEqual(d.state.swiss.records.filter((r) => r.status === "advanced").map((r) => r.code));
    expect(by("eliminated")).toEqual(d.state.swiss.records.filter((r) => r.status === "eliminated").map((r) => r.code));
    expect(by("advanced").length).toBeGreaterThan(0);
    expect(by("eliminated").length).toBeGreaterThan(0);
  });

  it("does not promote a 2–0 team the backend calls active", async () => {
    const d = swissThrough(2);
    backend(d);
    renderPage();
    await screen.findByTestId("swiss-records");
    expect(screen.getAllByTestId("swiss-record").every((c) => c.getAttribute("data-status") === "active")).toBe(true);
    expect(screen.queryByText("Advanced")).toBeNull();
  });
});

/* 7 ─────────────────────────────────────────────────────────────────────── */

describe("Knockout: progression and champion", () => {
  it("Swiss → Knockout interval names the qualifiers and leads with the bracket", async () => {
    backend(betweenSwissAndKnockout());
    renderPage();
    const t = await screen.findByTestId("stage-transition");
    expect(t).toHaveTextContent("Swiss complete — Knockout begins 3 Nov in Allen, TX; Final in Brooklyn, NY");
    expect(within(t).getByTestId("transition-facts")).toHaveTextContent(/Advanced: AL, GEN/);
    expect(sectionIds()[0]).toBe("stage-knockout");
  });

  it("mid-knockout: losers out, winners placed into the semifinal, champion not yet named", async () => {
    clock("2026-11-05T23:30:00Z");
    const d = knockoutMid();
    backend(d);
    renderPage();
    const ko = await screen.findByTestId("section-stage-knockout");
    expect(sectionIds().slice(0, 2)).toEqual(["today", "stage-knockout"]);
    expect(within(ko).getAllByTestId("bracket-round").map((r) => r.getAttribute("data-cell"))).toEqual(["Quarterfinals", "Semifinals", "Finals"]);
    expect(within(card(KO.qf1)).getByText("Out")).toBeInTheDocument();
    expect(card(KO.qf3)).toHaveAttribute("data-state", "live");
    const sf1 = d.state.matches.find((m) => m.match_id === KO.sf1)!;
    expect(card(KO.sf1).querySelector(`[data-team="${sf1.teams[0].code}"]`)).toBeTruthy();
    expect(within(card(KO.sf2)).getAllByTestId("slot-source").map((s) => s.textContent)).toEqual([
      `Winner of ${d.state.matches.find((m) => m.match_id === KO.qf3)!.teams.map((t) => t.code).join(" v ")}`,
      `Winner of ${d.state.matches.find((m) => m.match_id === KO.qf4)!.teams.map((t) => t.code).join(" v ")}`,
    ]);
    expect(screen.queryByTestId("champion")).toBeNull();
  });

  it("complete: the champion leads, every stage is complete, and the event stays as an archive", async () => {
    const d = worldsComplete();
    backend(d);
    renderPage();
    const champ = await screen.findByTestId("champion");
    const code = d.state.knockout.champion_code!;
    const team = d.context.participants.find((p) => p.code === code)!;
    expect(champ).toHaveTextContent(`Worlds champion${team.name}`);
    expect(champ).toHaveTextContent(/Won the final 3–2 against/);
    expect(screen.getByTestId("tournament-phase")).toHaveTextContent("Complete");
    expect(screen.getAllByTestId("stage").map((s) => s.getAttribute("data-progress"))).toEqual(["complete", "complete", "complete"]);
    expect(sectionIds()).toEqual(["stage-knockout", "stage-swiss", "stage-play_in", "schedule", "field"]);
    expect(within(card(KO.final)).getByText("Champion")).toBeInTheDocument();
    const status = screen.getAllByTestId("field-team").find((el) => el.getAttribute("data-team") === code)!;
    expect(within(status).getByTestId("team-status")).toHaveTextContent("Champion");
  });
});

/* 8–11 ──────────────────────────────────────────────────────────────────── */

describe("degraded sources", () => {
  it("partial schedule: says so once, and draws only the matches it has", async () => {
    backend(partialSchedule());
    renderPage();
    const n = await screen.findByTestId("notice-partial");
    expect(n).toHaveTextContent("40 of 46 matches");
    const ko = screen.getByTestId("section-stage-knockout");
    expect(within(ko).getAllByTestId("bracket-match")).toHaveLength(1);
    expect(screen.getByTestId("tournament-phase")).toHaveTextContent("Know the field");
  });

  it("standings unavailable: no bracket layout, no routing, no outcomes; times and results remain", async () => {
    backend(standingsUnavailable());
    renderPage();
    expect(await screen.findByTestId("notice-standings")).toHaveTextContent(/standings aren't available/);
    const pi = screen.getByTestId("section-stage-play_in");
    expect(within(pi).queryByTestId("double-elim")).toBeNull();
    expect(within(pi).getByTestId("bracket-list")).toBeInTheDocument();
    expect(within(pi).getAllByTestId("tournament-match")).toHaveLength(6);
    expect(screen.queryAllByTestId("bracket-routes")).toHaveLength(0);
    expect(screen.queryAllByTestId("slot-source")).toHaveLength(0);
    expect(screen.queryAllByTestId("bracket-tag")).toHaveLength(0);
    expect(within(screen.getByTestId("section-stage-swiss")).getByTestId("swiss-by-day")).toBeInTheDocument();
    expect(within(pi).getAllByTestId("match-score")[0]).toHaveTextContent("3–1");
  });

  it("stale schedule: flags the recent copy and recovers on the next good read", async () => {
    backend(staleSchedule(), WORLDS_PRE);
    renderPage();
    const n = await screen.findByTestId("notice-stale");
    expect(n).toHaveTextContent(/recent copy of the official schedule and standings/);
    expect(screen.queryByTestId("source-line")).toBeNull();
    fireEvent.click(within(n).getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(screen.queryByTestId("notice-stale")).toBeNull());
    expect(screen.getByTestId("source-line")).toHaveTextContent(/official LoL Esports feed/);
    // The page did not blank out while it refreshed.
    expect(screen.getAllByTestId("field-team")).toHaveLength(19);
  });

  it("unknown phase: 'Schedule unavailable', never a pre-event page", async () => {
    backend(unknownPhase());
    renderPage();
    const n = await screen.findByTestId("notice-unknown");
    expect(n).toHaveTextContent("Schedule unavailable.");
    expect(screen.getByTestId("tournament-phase")).toHaveTextContent("Schedule unavailable");
    expect(screen.queryByText("Know the field", { selector: "[data-testid='tournament-phase']" })).toBeNull();
    expect(screen.queryByTestId("next-match")).toBeNull();
    expect(screen.queryByTestId("section-schedule")).toBeNull();
    expect(screen.queryByTestId("notice-partial")).toBeNull();
    expect(sectionIds()).toEqual(["field", "stage-swiss"]);
    expect(screen.getAllByTestId("field-team")).toHaveLength(19);
    expect(screen.getAllByTestId("stage").every((s) => s.getAttribute("data-progress") === "none")).toBe(true);
  });
});

/* 12 ────────────────────────────────────────────────────────────────────── */

describe("unsupported or malformed contracts", () => {
  it("an unknown contract version is said plainly, and nothing is drawn from it", async () => {
    backend({ ...clone(), contract_version: "tournament_context_v3" });
    renderPage();
    expect(await screen.findByText("This tournament can't be shown on this version of the page.")).toBeInTheDocument();
    expect(screen.getByTestId("tournament-contract-error")).toHaveTextContent("tournament_context_v3");
    expect(screen.queryByTestId("tournament-v2")).toBeNull();
    expect(screen.queryAllByTestId("field-team")).toHaveLength(0);
  });

  it("a v2 body missing its state summaries is malformed, not half-drawn", async () => {
    const body = clone() as unknown as { state: Record<string, unknown> };
    delete body.state.play_in;
    backend(body);
    renderPage();
    expect(await screen.findByText("This tournament could not be loaded.")).toBeInTheDocument();
    expect(screen.getByTestId("tournament-contract-error")).toBeInTheDocument();
    expect(screen.queryByTestId("tournament-v2")).toBeNull();
  });
});

/* 16 ────────────────────────────────────────────────────────────────────── */

describe("navigation into the match centre and profiles", () => {
  it("uses the existing ?next= and ?game= links, and none for an all-TBD slot", async () => {
    clock("2026-10-16T00:10:00Z");
    const d = playInDay1();
    d.state.matches.find((m) => m.match_id === PI.ubsf1)!.live1_game_ids = ["g-1", "g-2", "g-4"];
    backend(d);
    renderPage();
    await screen.findByTestId("double-elim");
    expect(within(card(PI.ubsf1)).getByRole("link")).toHaveAttribute("href", "/lol/pro-play?game=g-4");
    expect(within(card(PI.ubf)).getByRole("link")).toHaveAttribute("href", `/lol/pro-play?next=${PI.ubf}`);
    expect(within(card(PI.final)).queryByRole("link")).toBeNull();
    const schedule = screen.getByTestId("section-schedule");
    const row = within(schedule).getAllByTestId("tournament-match").find((r) => r.getAttribute("data-match-id") === PI.ubsf1)!;
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/lol/pro-play?game=g-4");
  });

  it("the schedule covers the whole event, filterable by stage, in local days", async () => {
    backend(WORLDS_PRE);
    renderPage();
    const s = await screen.findByTestId("section-schedule");
    const filters = within(s).getAllByTestId("schedule-filter");
    expect(filters.map((f) => f.textContent)).toEqual(["All46", "Play-In6", "Swiss33", "Knockout7"]);
    expect(filters[1]).toHaveAttribute("aria-pressed", "true");
    expect(within(s).getAllByTestId("tournament-match")).toHaveLength(6);
    fireEvent.click(filters[0]);
    expect(within(s).getAllByTestId("tournament-match")).toHaveLength(46);
    // Pairings still to be drawn are one quiet line each, not two TBD sides.
    expect(within(s).getAllByTestId("awaiting-draw").length).toBe(33 + 4); // every Swiss match + the quarterfinals
  });
});
