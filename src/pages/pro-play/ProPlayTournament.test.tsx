/**
 * DCGI1 — the tournament page across its phases, on the backend's real
 * pre-event payload (registry + upstream getSchedule read 2026-10-01) and on
 * copies of it with results written in.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import TournamentSpotlight from "@/components/pro-play/hub/TournamentSpotlight";
import fixture from "@/lib/pro-play/__fixtures__/tournamentDcgiPreEvent.json";
import type { TournamentResponse } from "@/lib/pro-play/tournamentApi";
import { PRO_PLAY_TOURNAMENT_ROUTE } from "@/lib/pro-play/routes";

import { SECTION_ORDER } from "@/lib/pro-play/tournamentView";

import ProPlayTournament from "./ProPlayTournament";

const PRE = fixture as unknown as TournamentResponse;
const clone = (): TournamentResponse => JSON.parse(JSON.stringify(PRE));

let requests: string[] = [];
function backend(body: TournamentResponse | null, media: unknown[] = []) {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url);
      requests.push(path);
      const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b }) as unknown as Response;
      if (path.includes("/live-esports/tournament/")) {
        if (!body) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
        return ok(body);
      }
      if (path.includes("/media/resolve")) return ok({ ok: true, identity_available: true, results: media });
      return ok({});
    }),
  );
}

function renderPage(id = "dcgi-2026") {
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
  [...document.querySelectorAll("[data-testid^='section-']")].map((el) =>
    el.getAttribute("data-testid")!.replace("section-", ""),
  );

/** Finish Round 1 (first listed team wins) at a clock on 3 Oct. */
function swissDay(): TournamentResponse {
  const data = clone();
  data.state.phase = "swiss";
  const r1 = data.state.matches.slice(0, 6);
  for (const m of r1) {
    m.state = "completed";
    m.teams[0].game_wins = 1;
    m.teams[0].outcome = "win";
    m.teams[1].outcome = "loss";
    m.winner_code = m.teams[0].code;
  }
  data.state.swiss_records = data.context.participants
    .map((p) => {
      const won = r1.some((m) => m.winner_code === p.code);
      return { code: p.code, team_key: p.team_key, wins: won ? 1 : 0, losses: won ? 0 : 1, played: 1 };
    })
    .sort((a, b) => b.wins - a.wins);
  data.state.next_match_id = data.state.matches[6].match_id;
  return data;
}

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

describe("ProPlayTournament — pre-event (Know the field)", () => {
  it("leads with the next match, then the field, and draws no standings", async () => {
    backend(PRE);
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Demacia Cup Global Invitational 2026" });
    expect(screen.getByTestId("tournament-phase")).toHaveTextContent("Know the field");
    expect(sectionIds()).toEqual(["next", "field", "worlds", "schedule"]);
    expect(screen.queryByTestId("section-records")).toBeNull();
    const next = screen.getByTestId("next-match");
    expect(next).toHaveTextContent(/RED.*RED Canids.*vs.*NAVI.*Natus Vincere/);
    expect(within(next).getByText(/Swiss · Bo1/)).toBeInTheDocument();
  });

  it("shows stages with their venues", async () => {
    backend(PRE);
    renderPage();
    const stages = await screen.findAllByTestId("stage");
    expect(stages[0]).toHaveTextContent(/Swiss Stage.*Online/);
    expect(stages[1]).toHaveTextContent(/Knockout Stage.*Beijing/);
  });

  it("lists twelve teams in six regions with their tournament lineups", async () => {
    backend(PRE);
    renderPage();
    await screen.findAllByTestId("field-team");
    expect(screen.getAllByTestId("field-team")).toHaveLength(12);
    expect(screen.getAllByTestId("field-region").map((r) => r.getAttribute("data-region"))).toEqual([
      "LPL", "LCK", "LEC", "LCS", "LCP", "CBLOL",
    ]);
    const gam = screen.getAllByTestId("field-team").find((el) => el.getAttribute("data-team") === "GAM")!;
    const gamRows = within(gam).getAllByRole("listitem").map((li) => li.textContent);
    expect(gamRows[1]).toMatch(/Jungle.*Tiphat.*On loan for DCGI/);
    expect(gamRows[2]).toMatch(/Mid.*Gloryy/);
    const red = screen.getAllByTestId("field-team").find((el) => el.getAttribute("data-team") === "RED")!;
    expect(within(red).getByText("Replaces STEPZ for DCGI")).toBeInTheDocument();
    expect(screen.getAllByTestId("lineup-change")).toHaveLength(4);
    // Identity links go to the ordinary profiles by canonical key.
    expect(within(red).getByRole("link", { name: "Aegis" })).toHaveAttribute(
      "href",
      "/lol/pro-play/player/Aegis%20(Gabriel%20Lemos)",
    );
    expect(within(red).getByRole("link", { name: "RED Canids" })).toHaveAttribute("href", "/lol/pro-play/team/RED%20Canids");
  });

  it("states the Worlds relation as fact, with dates, and lists no Worlds teams", async () => {
    backend(PRE);
    renderPage();
    const rel = await screen.findByTestId("related-event");
    expect(rel).toHaveTextContent("World Championship 2026");
    expect(rel).toHaveTextContent("15 Oct – 14 Nov 2026");
    expect(rel).toHaveTextContent(/did not qualify for Worlds 2026/);
    expect(rel).toHaveTextContent("CBLOL · RED");
  });

  it("asks the media authority for crests, portraits and the event mark in chunks", async () => {
    backend(PRE);
    renderPage();
    await screen.findAllByTestId("field-team");
    await waitFor(() => expect(requests.filter((u) => u.includes("/media/resolve")).length).toBe(2));
    const media = requests.filter((u) => u.includes("/media/resolve")).join("&");
    expect(media).toContain("league=demacia_cup");
    expect(media).toContain("team=RED+Canids");
    expect(media).toContain("player=Aegis+%28Gabriel+Lemos%29");
  });

  it("draws the event mark from the media authority when it has art", async () => {
    backend(PRE, [
      {
        entity_type: "league", entity_key: "demacia_cup", media_type: "league_logo", state: "art",
        reason: "ok", display_name: "DCGI", fallback_label: "DCGI",
        asset_path: "assets/esports/leagues/demacia-cup-x/league_logo-abc.png",
        mime_type: "image/png", width: 94, height: 81, credit: null, contract_version: "pro_media_v1",
      },
    ]);
    renderPage();
    await waitFor(() => {
      const mark = screen.getAllByTestId("event-mark")[0];
      expect(mark).toHaveAttribute("data-media-state", "art");
      expect(mark.querySelector("img")!.getAttribute("src")).toContain("assets/esports/leagues/");
    });
  });
});

describe("ProPlayTournament — during the event", () => {
  it("Swiss: today and records lead; records come only from the backend", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T14:00:00Z"));
    backend(swissDay());
    renderPage();
    await screen.findByTestId("section-today");
    expect(screen.getByTestId("tournament-phase")).toHaveTextContent("Swiss stage");
    expect(sectionIds().slice(0, 2)).toEqual(["today", "records"]);
    const groups = screen.getAllByTestId("record-group");
    expect(groups.map((g) => g.textContent?.slice(0, 3))).toEqual(["1–0", "0–1"]);
    const today = within(screen.getByTestId("section-today"));
    expect(today.getAllByTestId("tournament-match")).toHaveLength(6);
    expect(today.getAllByTestId("match-score")[0]).toHaveTextContent("1–0");
    expect(today.getAllByTestId("match-state")[0]).toHaveAttribute("data-state", "completed");
  });

  it("Knockout: the bracket leads, with TBD slots left as TBD", async () => {
    const data = swissDay();
    data.state.phase = "knockout";
    data.state.knockout_teams = ["RED", "LGD"];
    const qf = data.state.matches.find((m) => m.block_name === "Quarterfinals")!;
    qf.teams[0] = { ...qf.teams[0], code: "RED", team_key: "RED Canids", upstream_name: "RED Kalunga", tbd: false };
    qf.teams[1] = { ...qf.teams[1], code: "LGD", team_key: "LGD Gaming", upstream_name: "LGD GAMING", tbd: false };
    backend(data);
    renderPage();
    await screen.findByTestId("section-bracket");
    expect(sectionIds()[0]).toBe("bracket");
    const rounds = screen.getAllByTestId("bracket-round");
    expect(rounds.map((r) => r.querySelector("p")?.textContent)).toEqual(["Quarterfinals", "Semifinals", "Finals"]);
    expect(within(rounds[0]).getAllByText("TBD").length).toBeGreaterThan(0);
    const field = screen.getAllByTestId("field-team").filter((el) => el.textContent?.includes("Knockout"));
    expect(field.map((el) => el.getAttribute("data-team")).sort()).toEqual(["LGD", "RED"]);
  });

  it("every phase has a section order", () => {
    expect(Object.keys(SECTION_ORDER).sort()).toEqual(["complete", "knockout", "pre_event", "swiss"]);
  });
});

describe("ProPlayTournament — failure states", () => {
  it("an unknown context says so", async () => {
    backend(null);
    renderPage("nope");
    expect(await screen.findByText("No such tournament.")).toBeInTheDocument();
  });

  it("an unreachable schedule keeps the field and says why matches are missing", async () => {
    const data = clone();
    data.source_ok = false;
    data.state = { ...data.state, matches: [], next_match_id: null, counts: { matches: 0, completed: 0, live: 0 } };
    backend(data);
    renderPage();
    expect(await screen.findByRole("status")).toHaveTextContent(/schedule source is not answering/);
    expect(screen.getAllByTestId("field-team")).toHaveLength(12);
    expect(screen.queryByTestId("section-schedule")).toBeNull();
  });
});

describe("TournamentSpotlight (hub entry)", () => {
  function renderSpotlight() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TournamentSpotlight contextId="dcgi-2026" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("links to the page with the phase and the next match", async () => {
    backend(PRE);
    renderSpotlight();
    const link = await screen.findByTestId("tournament-spotlight");
    expect(link).toHaveAttribute("href", "/lol/pro-play/tournament/dcgi-2026");
    expect(link).toHaveTextContent("Know the field");
    expect(screen.getByTestId("spotlight-next")).toHaveTextContent("RED vs NAVI");
  });

  it("draws nothing when the context is unavailable", async () => {
    backend(null);
    renderSpotlight();
    await waitFor(() => expect(requests.some((u) => u.includes("/tournament/"))).toBe(true));
    expect(screen.queryByTestId("tournament-spotlight")).toBeNull();
  });
});
